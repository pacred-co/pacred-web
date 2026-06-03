-- ════════════════════════════════════════════════════════════
-- 0135 · pcs_sync_state + pcs_sync_logs — PCS↔Pacred sync ledger
-- ════════════════════════════════════════════════════════════
-- The Pacred side of the PCS↔Pacred sync system. A Vercel cron
-- (`/api/cron/pcs-sync`, every 10 min) pulls recent `tb_forwarder`
-- changes from `pcscargo.com/api/pacred-sync.php` and merges them
-- into our `tb_forwarder` using the conflict policy in
-- `lib/integrations/pcs-sync/merge.ts`:
--   - PCS wins for staff-driven fields (status, cabinet, driver, ...)
--   - MOMO wins for warehouse fields (Pacred-non-null protected)
--   - Match by `tb_forwarder.id` only (no cross-create from PCS)
--
-- Two tables:
--   1. `pcs_sync_state` — singleton (id=1) cursor + last-error
--   2. `pcs_sync_logs`  — append-only per-run audit (50-row dashboard)
--
-- ISOLATION RULES:
--   ✅ NEW tables only. NO ALTER/DROP/RENAME of any existing table.
--   ✅ service_role-only access (cron + admin Server Actions).
--   ✅ RLS = deny all (no anon / no authenticated direct read).
--
-- Idempotent (safe to re-run): create … if not exists.
-- ════════════════════════════════════════════════════════════

-- ── 1. pcs_sync_state — singleton row (id = 1) ────────────────
create table if not exists public.pcs_sync_state (
  id           integer primary key check (id = 1),
  last_sync_at timestamptz not null,
  last_run_at  timestamptz,
  last_error   text
);

comment on table public.pcs_sync_state is
  'Singleton (id=1) cursor for the PCS↔Pacred sync. `last_sync_at` is the high-water mark passed back to PCS endpoint as `?since=`. Created 2026-06-02.';

-- Seed the singleton — first run will grab the last 24h to avoid
-- a 0-row warm-up window the first time the cron fires.
insert into public.pcs_sync_state (id, last_sync_at, last_run_at, last_error)
values (1, now() - interval '24 hours', null, null)
on conflict (id) do nothing;

alter table public.pcs_sync_state enable row level security;

-- Deny-all policies (service_role bypasses RLS by design).
drop policy if exists pcs_sync_state_deny_all on public.pcs_sync_state;
create policy pcs_sync_state_deny_all
  on public.pcs_sync_state
  as restrictive
  for all
  to public
  using (false)
  with check (false);

grant select, insert, update, delete on public.pcs_sync_state to service_role;
revoke all on public.pcs_sync_state from anon;
revoke all on public.pcs_sync_state from authenticated;

-- ── 2. pcs_sync_logs — append-only per-run audit ──────────────
create table if not exists public.pcs_sync_logs (
  id                  bigserial primary key,
  ran_at              timestamptz not null default now(),
  since               timestamptz,
  until               timestamptz,
  rows_seen           integer not null default 0,
  rows_upserted       integer not null default 0,
  rows_skipped_newer  integer not null default 0,
  rows_failed         integer not null default 0,
  duration_ms         integer,
  error               text
);

comment on table public.pcs_sync_logs is
  'Per-run audit of the PCS↔Pacred sync cron. Append-only; dashboard reads last 50. Created 2026-06-02.';

create index if not exists pcs_sync_logs_ran_at_idx
  on public.pcs_sync_logs (ran_at desc);

alter table public.pcs_sync_logs enable row level security;

drop policy if exists pcs_sync_logs_deny_all on public.pcs_sync_logs;
create policy pcs_sync_logs_deny_all
  on public.pcs_sync_logs
  as restrictive
  for all
  to public
  using (false)
  with check (false);

grant select, insert on public.pcs_sync_logs to service_role;
revoke all on public.pcs_sync_logs from anon;
revoke all on public.pcs_sync_logs from authenticated;
