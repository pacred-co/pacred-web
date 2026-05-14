-- ════════════════════════════════════════════════════════════
-- P-17 · Add contract_end_date to admin_contact_extras for the
--        probation-expiry cron sweep.
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-17 (เดฟ assigned 2026-05-14): port the
-- legacy admin half of pcs-admin/api/autorun/check-apprentice/ —
-- sweep employees on probation whose contract end date has passed
-- and deactivate them.
--
-- DECISION (ภูม, per §6): spec wrote "employees.contract_end_date"
-- but our HR module (migration 0018) stores employee meta on
-- admin_contact_extras (column extension over admins) — there's no
-- separate `employees` table. Same with "is_active": HR uses
-- `suspended_at IS NULL` to mean "still working". The cron route
-- (P-17 follow-up) writes `suspended_at = now()` when the contract
-- is past due.
--
-- Idempotent — column adds are NOOP if already present.
-- ════════════════════════════════════════════════════════════

alter table public.admin_contact_extras
  add column if not exists contract_end_date date;

-- Speed up the cron sweep query: find probation employees whose
-- end date has passed and who are still active.
create index if not exists admin_contact_extras_probation_expiring_idx
  on public.admin_contact_extras(contract_end_date)
  where employee_type = 'probation' and suspended_at is null;

comment on column public.admin_contact_extras.contract_end_date is
  'For employee_type=''probation'': end of probation period. The /api/cron/expire-probation cron sweeps past-due rows daily and sets suspended_at=now().';
