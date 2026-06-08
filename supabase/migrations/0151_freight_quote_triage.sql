-- ════════════════════════════════════════════════════════════
-- 0151 · freight_quote triage — admin RFQ leads-inbox columns
-- ════════════════════════════════════════════════════════════
-- WHY: migration 0134 created `public.freight_quote` (singular) = the PUBLIC
-- inbound freight RFQ / lead captured by the /freight-quote wizard. Until now
-- the ONLY consumer was actions/admin/crm.ts::getCrmFunnel() (a head-count
-- proxy) — there was NO admin page to view/triage/convert these leads, so
-- inbound freight revenue was orphaned. The new /admin/freight/leads inbox
-- (this migration's reason for existing) needs two extra triage columns:
--
--   • status            — already EXISTS on freight_quote since 0134 with a
--                         6-value CHECK (new/contacted/quoted/won/lost/spam).
--                         We re-assert it idempotently (ADD COLUMN IF NOT
--                         EXISTS) so this migration is self-contained on any
--                         env where 0134's column might be absent, but the
--                         live CHECK from 0134 already governs the values.
--   • assigned_admin_id — NEW. Which staffer owns the follow-up (soft link;
--                         text to match the rest of Pacred's admin-id usage
--                         in this lane — no FK, kept loose like other triage
--                         metadata so a re-provisioned admin roster never
--                         blocks a lead update). NULL = unassigned.
--
-- ISOLATION / SAFETY:
--   ✅ Additive only — ADD COLUMN IF NOT EXISTS + a partial-ish status index.
--   ✅ Idempotent — safe to re-run (IF NOT EXISTS everywhere).
--   ❌ No DROP / RENAME / data backfill / TRUNCATE.
--   • updated_at auto-touch already handled by 0134's
--     freight_quote_updated_at_trigger — nothing to add here.
--   • RLS already enabled by 0134 (admin all + anon insert) — unchanged.
--
-- ⚠️ DO NOT apply by hand — the integrator applies this to prod after merge.
-- ════════════════════════════════════════════════════════════

-- 1) status — re-assert idempotently (0134 already created it w/ the CHECK).
--    No CHECK added here to avoid a duplicate-constraint conflict with 0134's
--    freight_quote_status_check; the 0134 CHECK (new/contacted/quoted/won/lost/
--    spam) remains the single source of truth for allowed values.
alter table public.freight_quote
  add column if not exists status text not null default 'new';

-- 2) assigned_admin_id — NEW triage column (who owns the lead follow-up).
alter table public.freight_quote
  add column if not exists assigned_admin_id text;

-- 3) Index for the inbox's status-filtered, newest-first list (mirrors the
--    0134 freight_quote_status_idx shape; IF NOT EXISTS makes it a no-op there).
create index if not exists freight_quote_status_created_idx
  on public.freight_quote(status, created_at desc);

-- 4) Index for "leads assigned to me" filtering (partial — skip the many
--    unassigned rows).
create index if not exists freight_quote_assigned_idx
  on public.freight_quote(assigned_admin_id)
  where assigned_admin_id is not null;

comment on column public.freight_quote.assigned_admin_id is
  'Staffer owning the RFQ follow-up (admin id · soft link, no FK). NULL = unassigned. Added 0151.';

-- next free = 0152
