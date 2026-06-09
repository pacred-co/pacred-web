-- ════════════════════════════════════════════════════════════
-- 0155 · customer_note — free-text activity notes (CRM timeline)
-- ════════════════════════════════════════════════════════════
-- Brief: CRM depth (CEO "scale in 3-4 months" · "เห็นว่าคุยอะไร · คนมาทำงานต่อ
-- ได้"). A manual note any rep can drop on a customer — "ลูกค้าขอราคาทาง LINE",
-- "ติดต่อแล้วขอคิดดูก่อน", etc. Read back NEWEST-FIRST and UNION-ed with the
-- lead_call_log (0133) call entries to form one chronological activity timeline
-- (<CustomerActivityTimeline>) on the /admin/crm customer-360 panel and
-- /admin/customers/[id].
--
-- ⚠️ ISOLATION RULES (per project safety constraints · same as 0133/0141/0154):
--   ✅ สร้าง table ใหม่เฉพาะ note เท่านั้น (1 table)
--   ✅ ห้าม FK ไป table เดิม (tb_*, profiles, auth.users) — `userid` เป็น plain
--      text เก็บ member-code (= tb_users.userID) เฉยๆ (no FK).
--   ✅ RLS = service_role only (admin client) — anon/authenticated reject.
--   ❌ ห้าม ALTER / DROP / RENAME / TRUNCATE / DELETE table เดิม.
--
-- Idempotent (safe to re-run): create … if not exists.
-- ════════════════════════════════════════════════════════════

create table if not exists public.customer_note (
  id          bigserial primary key,
  userid      varchar(20) not null,                -- customer PR code (= tb_users.userID · NO FK)
  body        text not null,                       -- the note text
  created_by  text,                                -- rep who wrote it (legacy admin code / profile uuid · NO FK)
  created_at  timestamptz not null default now()
);

alter table public.customer_note enable row level security;

comment on table public.customer_note is
  'Per-customer free-text activity notes (CRM depth · 2026-06-08). One row per note keyed by userid = tb_users.userID (NO FK). Admin-only via service_role. UNION-ed with lead_call_log (0133) → the customer activity timeline.';
comment on column public.customer_note.userid is
  'Customer PR member code (= tb_users.userID). plain text, no FK.';
comment on column public.customer_note.body is
  'The note text.';
comment on column public.customer_note.created_by is
  'Rep who wrote the note (legacy admin code or profile uuid). plain text, no FK.';

-- Timeline read: newest note first for one customer.
create index if not exists customer_note_userid_created_idx
  on public.customer_note (userid, created_at desc);

-- ── RLS — service_role only ───────────────────────────────────
-- ใช้ผ่าน admin client (service_role) เท่านั้น. service_role bypass RLS
-- by default (Supabase built-in) → ไม่ต้องเขียน policy ALLOW; ไม่มี policy
-- ALLOW = anon/authenticated reject ทุก request (default-deny). Pattern
-- เดียวกับ lead_call_log (0133) + customer_tag (0154).

-- ════════════════════════════════════════════════════════════
-- DONE 0155.
--
-- Verification queries (run by hand after migration):
--   SELECT count(*) FROM customer_note;          -- 0
--
-- Confirm legacy untouched (counts unchanged):
--   SELECT count(*) FROM tb_users;
-- ════════════════════════════════════════════════════════════
