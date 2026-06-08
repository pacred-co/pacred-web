-- ════════════════════════════════════════════════════════════
-- 0154 · customer_tag — free-text + starter-vocabulary customer tags
-- ════════════════════════════════════════════════════════════
-- Brief: CRM depth (CEO "scale in 3-4 months"). A genuinely-missing primitive:
-- sales/CS can tag a customer with arbitrary labels (AXELRA / big-PCS / VIP /
-- เคลียร์ / แอร์ + any free-text). Doubles as the AXELRA-vs-PCS lead-source
-- marker the gap analysis flagged (legacy has no per-customer source field).
--
-- One row = one (customer, tag) pair. The latest set of tags for a customer is
-- "every row where userid = X". `unique(userid, tag)` makes addTag idempotent +
-- prevents duplicate chips. Surfaced as <TagChips> on /admin/leads rows, the
-- /admin/crm customer-360 panel, and /admin/customers/[id].
--
-- ⚠️ ISOLATION RULES (per project safety constraints · same as 0133/0141):
--   ✅ สร้าง table ใหม่เฉพาะ tag เท่านั้น (1 table)
--   ✅ ห้าม FK ไป table เดิม (tb_*, profiles, auth.users) — `userid` เป็น plain
--      text เก็บ member-code (= tb_users.userID) เฉยๆ (no FK).
--   ✅ RLS = service_role only (admin client) — anon/authenticated reject.
--   ❌ ห้าม ALTER / DROP / RENAME / TRUNCATE / DELETE table เดิม.
--
-- Idempotent (safe to re-run): create … if not exists.
-- ════════════════════════════════════════════════════════════

create table if not exists public.customer_tag (
  id          bigserial primary key,
  userid      varchar(20) not null,                -- customer PR code (= tb_users.userID · NO FK)
  tag         text not null,                       -- the label (free-text or starter vocab)
  created_by  text,                                -- rep who added it (legacy admin code / profile uuid · NO FK)
  created_at  timestamptz not null default now(),
  unique (userid, tag)
);

alter table public.customer_tag enable row level security;

comment on table public.customer_tag is
  'Per-customer tags (CRM depth · 2026-06-08). One row per (customer, tag) keyed by userid = tb_users.userID (NO FK). Admin-only via service_role. Starter vocab (AXELRA/big-PCS/VIP/เคลียร์/แอร์) + free-text; doubles as the AXELRA-vs-PCS lead-source marker.';
comment on column public.customer_tag.userid is
  'Customer PR member code (= tb_users.userID). plain text, no FK.';
comment on column public.customer_tag.tag is
  'The tag label — free-text or starter vocabulary.';
comment on column public.customer_tag.created_by is
  'Rep who added the tag (legacy admin code or profile uuid). plain text, no FK.';

-- All tags for a customer (the chip set) + the bulk leads-list lookup.
create index if not exists customer_tag_userid_idx
  on public.customer_tag (userid);
-- "who's tagged AXELRA / big-PCS" segment reads.
create index if not exists customer_tag_tag_idx
  on public.customer_tag (tag);

-- ── RLS — service_role only ───────────────────────────────────
-- ใช้ผ่าน admin client (service_role) เท่านั้น. service_role bypass RLS
-- by default (Supabase built-in) → ไม่ต้องเขียน policy ALLOW; ไม่มี policy
-- ALLOW = anon/authenticated reject ทุก request (default-deny). Pattern
-- เดียวกับ lead_call_log (0133) + momo_* (0116) + line_* (0131).

-- ════════════════════════════════════════════════════════════
-- DONE 0154.
--
-- Verification queries (run by hand after migration):
--   SELECT count(*) FROM customer_tag;           -- 0
--
-- Confirm legacy untouched (counts unchanged):
--   SELECT count(*) FROM tb_users;
-- ════════════════════════════════════════════════════════════
