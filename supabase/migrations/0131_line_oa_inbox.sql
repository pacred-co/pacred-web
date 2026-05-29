-- ════════════════════════════════════════════════════════════
-- 0131 · LINE OA inbox — capture customer messages from LINE OA (renumbered from 0125 · integrated 2026-05-30)
-- ════════════════════════════════════════════════════════════
-- Brief: ปอน (InwPond007) — รับข้อความลูกค้าจาก LINE OA แล้วเก็บลง
-- table ใหม่ทั้งหมด. รอบนี้ "เก็บข้อมูลขาเข้า" อย่างเดียว — ยังไม่ทำ
-- Inbox UI / ปุ่มตอบกลับ / FB-IG / AI auto-reply / dashboard.
--
-- ⚠️ ISOLATION RULES (per owner safety constraints):
--   ✅ สร้าง table ใหม่เฉพาะระบบ LINE เท่านั้น (4 tables)
--   ✅ ห้าม FK ไป table เดิม (tb_*, profiles, auth.users) — agent ids
--      เป็น plain uuid เฉยๆ จนกว่าจะมีระบบ staff ในรอบถัดไป
--   ✅ RLS = service_role only (admin client) — anon/authenticated reject
--   ✅ Migration นี้แตะเฉพาะ 4 table ใหม่ของ LINE เท่านั้น
--   ❌ ห้าม ALTER / DROP / RENAME / TRUNCATE / DELETE table เดิม
--   ❌ ห้าม ALTER TYPE enum เดิม / ห้ามแก้ trigger / function เดิม
--
-- Tables created (4):
--   customers_line       ← 1 row ต่อ 1 line_user_id (โปรไฟล์ + สถิติรวม)
--   line_messages        ← ทุกข้อความ (inbound รอบนี้ · เผื่อ outbound)
--   line_webhook_events  ← raw payload ทุก event (debug + replay)
--   line_lead_sources    ← map add-friend URL → ชื่อ source (FB/Google/YT)
--
-- Idempotent (safe to re-run): create … if not exists · seed on conflict
-- do nothing · trigger drop-then-create.
-- ════════════════════════════════════════════════════════════

-- ── 1. customers_line ─────────────────────────────────────────
-- ลูกค้า 1 คน (1 line_user_id) = 1 row. เก็บโปรไฟล์ที่ดึงได้จาก LINE
-- + สถิติรวม (นับข้อความ · วันที่ add เพื่อน · ข้อความล่าสุด) เพื่อให้
-- รอบ Inbox UI ถัดไปอ่านได้เร็วโดยไม่ต้อง aggregate line_messages.
create table if not exists public.customers_line (
  id                       uuid primary key default gen_random_uuid(),
  line_user_id             text not null unique,
  display_name             text,
  picture_url              text,
  lead_source_name         text,          -- เช่น 'Facebook' / 'Google' / 'YouTube'
  add_friend_url           text,          -- lin.ee URL ที่ลูกค้าใช้กดเพิ่มเพื่อน (ถ้ารู้)
  customer_code            text,          -- เผื่อ map กับ tb_users.userID ภายหลัง (ไม่ FK)
  phone                    text,
  email                    text,
  company_name             text,
  tax_type                 text,
  tax_id                   text,
  note                     text,
  first_seen_at            timestamptz,   -- ครั้งแรกที่ระบบเห็น line_user_id นี้
  first_follow_at          timestamptz,   -- กดเพิ่มเพื่อน OA ครั้งแรก
  first_message_at         timestamptz,   -- ส่งข้อความหาเราครั้งแรก
  last_message_at          timestamptz,   -- ข้อความล่าสุด (ทุกทิศทาง)
  last_inbound_message_at  timestamptz,   -- ลูกค้าส่งหาเราล่าสุด
  last_outbound_message_at timestamptz,   -- เราตอบล่าสุด (รอบนี้ยังไม่ใช้)
  total_messages           integer not null default 0,
  total_inbound_messages   integer not null default 0,
  total_outbound_messages  integer not null default 0,
  status                   text not null default 'active',  -- active | blocked | archived
  lead_quality             text,          -- เผื่อ sales จัดเกรด lead ภายหลัง
  service_interest         text,          -- เผื่อบันทึกว่าสนใจบริการไหน
  assigned_agent_id        uuid,          -- พนักงานที่ดูแล (NO FK — รอระบบ staff)
  last_message_text        text,          -- snippet ข้อความล่าสุดไว้โชว์ใน list
  raw_profile              jsonb,         -- โปรไฟล์ดิบจาก LINE Profile API (ถ้าดึงได้)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
alter table public.customers_line enable row level security;
comment on table public.customers_line is
  'LINE OA customer (1 row per line_user_id) + rolled-up stats. Admin-only via service_role. NO FK to legacy tb_*/profiles/auth. Created 2026-05-29.';
comment on column public.customers_line.raw_profile is
  'Raw LINE Profile API object (displayName/pictureUrl/statusMessage) — preserve for debug + future re-map.';
create index if not exists customers_line_last_message_idx on public.customers_line (last_message_at desc);
create index if not exists customers_line_status_idx       on public.customers_line (status);
create index if not exists customers_line_source_idx       on public.customers_line (lead_source_name);
create index if not exists customers_line_first_follow_idx on public.customers_line (first_follow_at desc);
create index if not exists customers_line_assigned_idx     on public.customers_line (assigned_agent_id);


-- ── 2. line_messages ──────────────────────────────────────────
-- ทุกข้อความ. รอบนี้เขียนเฉพาะ inbound (direction='inbound',
-- sender_type='customer') — schema เผื่อ outbound ไว้สำหรับรอบตอบกลับ.
-- line_message_id unique = กันเขียนซ้ำเวลา LINE redeliver event เดิม.
create table if not exists public.line_messages (
  id                  uuid primary key default gen_random_uuid(),
  customer_line_id    uuid references public.customers_line(id) on delete set null,
  line_user_id        text not null,
  line_message_id     text unique,        -- LINE message id — dedup key
  webhook_event_id    text,               -- LINE webhookEventId
  reply_token         text,               -- เผื่อรอบตอบกลับ (อายุสั้น)
  direction           text not null default 'inbound'
                         check (direction in ('inbound', 'outbound')),
  sender_type         text not null default 'customer'
                         check (sender_type in ('customer', 'agent', 'bot', 'system')),
  source_type         text,               -- 'user' | 'group' | 'room'
  group_id            text,
  room_id             text,
  group_name          text,
  message_type        text,               -- 'text' | 'image' | 'sticker' | 'file' | 'video' | …
  message_text        text,               -- เฉพาะ type=text
  file_url            text,               -- เผื่อดาวน์โหลด content มาเก็บภายหลัง
  media_url           text,
  agent_id            uuid,               -- พนักงานที่ส่ง (NO FK — รอระบบ staff)
  agent_name          text,
  send_status         text not null default 'received',  -- received | sent | failed
  is_from_redelivery  boolean not null default false,
  sent_at             timestamptz,        -- เวลาตาม event.timestamp ของ LINE
  raw_json            jsonb,              -- event object ดิบทั้งก้อน
  created_at          timestamptz not null default now()
);
alter table public.line_messages enable row level security;
comment on table public.line_messages is
  'Every LINE OA message (inbound this wave; outbound-ready schema). Admin-only via service_role. Created 2026-05-29.';
create index if not exists line_messages_customer_idx  on public.line_messages (customer_line_id);
create index if not exists line_messages_user_idx      on public.line_messages (line_user_id);
create index if not exists line_messages_created_idx   on public.line_messages (created_at desc);
create index if not exists line_messages_direction_idx on public.line_messages (direction);
create index if not exists line_messages_type_idx      on public.line_messages (message_type);


-- ── 3. line_webhook_events ────────────────────────────────────
-- raw payload ทุก event ที่ verify signature ผ่าน — เก็บก่อนประมวลผล
-- เพื่อให้ debug / replay ได้ แม้ขั้น parse จะพัง. ไม่มี unique บน
-- webhook_event_id (LINE ส่งซ้ำได้ตอน redelivery — อยากเห็นทุกครั้ง).
create table if not exists public.line_webhook_events (
  id                uuid primary key default gen_random_uuid(),
  webhook_event_id  text,
  line_user_id      text,
  event_type        text,                 -- 'message' | 'follow' | 'unfollow' | …
  raw_payload       jsonb not null,
  processed_status  text not null default 'received',  -- received | processed | skipped_no_user | error
  error_message     text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz
);
alter table public.line_webhook_events enable row level security;
comment on table public.line_webhook_events is
  'Raw LINE webhook events (post-signature-verify) for debug + replay. Admin-only via service_role. Created 2026-05-29.';
create index if not exists line_webhook_events_received_idx on public.line_webhook_events (received_at desc);
create index if not exists line_webhook_events_user_idx     on public.line_webhook_events (line_user_id);
create index if not exists line_webhook_events_status_idx   on public.line_webhook_events (processed_status);
create index if not exists line_webhook_events_type_idx     on public.line_webhook_events (event_type);


-- ── 4. line_lead_sources ──────────────────────────────────────
-- map ระหว่าง add-friend URL (lin.ee/*) → ชื่อ source. ใช้เดาว่า
-- ลูกค้ามาจากช่องทางไหน (Facebook/Google/YouTube) เวลาที่ทราบ URL.
create table if not exists public.line_lead_sources (
  id              uuid primary key default gen_random_uuid(),
  source_name     text not null unique,   -- 'Facebook' | 'Google' | 'YouTube' | …
  add_friend_url  text,                   -- lin.ee URL ของช่องทางนั้น
  keyword         text,                   -- เผื่อ match จากข้อความ/ref ภายหลัง
  note            text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.line_lead_sources enable row level security;
comment on table public.line_lead_sources is
  'Lead-source map (add-friend URL → channel name). Admin-only via service_role. Created 2026-05-29.';
create index if not exists line_lead_sources_active_idx on public.line_lead_sources (is_active);

-- Seed รู้จัก 3 ช่องทางหลักของ Pacred (idempotent — ไม่ทับของเดิม)
insert into public.line_lead_sources (source_name, add_friend_url, note) values
  ('Facebook', 'https://lin.ee/VGCVebb', 'LINE add-friend URL จากโฆษณา/เพจ Facebook'),
  ('Google',   'https://lin.ee/Yg3fU0I', 'LINE add-friend URL จาก Google / เว็บไซต์'),
  ('YouTube',  'https://lin.ee/YWovHQr', 'LINE add-friend URL จากช่อง YouTube')
on conflict (source_name) do nothing;


-- ── 5. updated_at trigger (scoped to LINE tables) ─────────────
-- ฟังก์ชันใหม่ของระบบ LINE เท่านั้น — ไม่แตะ trigger/function เดิม.
create or replace function public.line_oa_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_customers_line_updated_at on public.customers_line;
create trigger trg_customers_line_updated_at
  before update on public.customers_line
  for each row execute function public.line_oa_touch_updated_at();

drop trigger if exists trg_line_lead_sources_updated_at on public.line_lead_sources;
create trigger trg_line_lead_sources_updated_at
  before update on public.line_lead_sources
  for each row execute function public.line_oa_touch_updated_at();


-- ── 6. RLS — service_role only ────────────────────────────────
-- ทั้ง 4 table ใช้ผ่าน admin client (service_role) เท่านั้น.
-- service_role bypass RLS by default (Supabase built-in) — เลยไม่ต้อง
-- เขียน policy ALLOW. ไม่มี policy ALLOW = anon/authenticated reject
-- ทุก request (default-deny). Pattern เดียวกับ momo_* (0116).

-- ════════════════════════════════════════════════════════════
-- DONE 0125.
--
-- Verification queries (run by hand after migration):
--   SELECT count(*) FROM customers_line;       -- 0
--   SELECT count(*) FROM line_messages;         -- 0
--   SELECT count(*) FROM line_webhook_events;   -- 0
--   SELECT count(*) FROM line_lead_sources;     -- 3 (Facebook / Google / YouTube)
--
-- Confirm legacy untouched (counts unchanged):
--   SELECT count(*) FROM tb_users;
--   SELECT count(*) FROM tb_forwarder;
-- ════════════════════════════════════════════════════════════
