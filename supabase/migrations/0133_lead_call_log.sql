-- ════════════════════════════════════════════════════════════
-- 0133 · lead_call_log — the acquisition call-queue activity log
-- ════════════════════════════════════════════════════════════
-- Brief: CEO opening-day directive §6 (docs/research/ceo-directives-2026-06-01.md)
-- — "START NOW: call ALL old AX customers + the big PCS customers; follow up
-- from day-1 the customer sends a phone → call to close." Sales+CS work the
-- /admin/leads page top-down; this table records every call attempt + outcome
-- so a lead isn't called twice and the close-rate is measurable.
--
-- The lead pool itself lives in the existing legacy `tb_users` (6,936 cold
-- leads with a phone: `userActive=''`). This table is the per-lead CALL LOG
-- only — one row per call attempt, keyed by the lead's PR member code
-- (`tb_users.userID`). The latest row's `status` is the lead's current
-- call-state shown in the queue.
--
-- ⚠️ ISOLATION RULES (per project safety constraints · same as 0116/0131):
--   ✅ สร้าง table ใหม่เฉพาะ call-log เท่านั้น (1 table)
--   ✅ ห้าม FK ไป table เดิม (tb_*, profiles, auth.users) — `userid`/`admin_id`
--      เป็น plain text เก็บ member-code / legacy-admin-code เฉยๆ (no FK).
--   ✅ RLS = service_role only (admin client) — anon/authenticated reject.
--   ❌ ห้าม ALTER / DROP / RENAME / TRUNCATE / DELETE table เดิม.
--
-- Idempotent (safe to re-run): create … if not exists.
-- ════════════════════════════════════════════════════════════

create table if not exists public.lead_call_log (
  id          uuid primary key default gen_random_uuid(),
  userid      text not null,                       -- the lead's PR code (= tb_users.userID · NO FK)
  admin_id    text,                                -- rep who called (legacy admin code / profile uuid · NO FK)
  status      text not null default 'called',      -- called | no_answer | closed | callback | not_interested
  note        text,
  called_at   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.lead_call_log enable row level security;

comment on table public.lead_call_log is
  'Acquisition call-queue activity log (CEO §6 · 2026-06-01). One row per call attempt on a tb_users lead, keyed by userid = tb_users.userID (NO FK). Admin-only via service_role. Latest row per userid = the lead''s current call-state shown on /admin/leads.';
comment on column public.lead_call_log.userid is
  'Lead PR member code (= tb_users.userID). plain text, no FK.';
comment on column public.lead_call_log.admin_id is
  'Rep who logged the call (legacy admin code or profile uuid). plain text, no FK.';
comment on column public.lead_call_log.status is
  'called | no_answer | closed | callback | not_interested.';

-- Newest call per lead (the queue reads the latest status per userid).
create index if not exists lead_call_log_userid_called_idx
  on public.lead_call_log (userid, called_at desc);
-- "called today" stat + status filters.
create index if not exists lead_call_log_called_at_idx
  on public.lead_call_log (called_at desc);
create index if not exists lead_call_log_status_idx
  on public.lead_call_log (status);

-- ── RLS — service_role only ───────────────────────────────────
-- ใช้ผ่าน admin client (service_role) เท่านั้น. service_role bypass RLS
-- by default (Supabase built-in) → ไม่ต้องเขียน policy ALLOW; ไม่มี policy
-- ALLOW = anon/authenticated reject ทุก request (default-deny). Pattern
-- เดียวกับ momo_* (0116) + line_* (0131).

-- ════════════════════════════════════════════════════════════
-- DONE 0133.
--
-- Verification queries (run by hand after migration):
--   SELECT count(*) FROM lead_call_log;          -- 0
--
-- Confirm legacy untouched (counts unchanged):
--   SELECT count(*) FROM tb_users;
-- ════════════════════════════════════════════════════════════
