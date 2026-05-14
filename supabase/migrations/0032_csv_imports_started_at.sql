-- 0032_csv_imports_started_at.sql
-- P-19-followup-stale: stale 'importing' recovery.
--
-- Without started_at, a process crash mid-confirmCsvImport leaves the
-- row stuck at status='importing' forever — the next admin who clicks
-- "import" hits "import_in_progress" guard and is blocked permanently.
--
-- This migration adds started_at + a recovery view.  The actual sweep
-- can be either:
--   (a) on-read in actions/admin/csv-imports.ts (cheap; runs whenever
--       admin lists/views the imports table — no cron needed)
--   (b) a cron job (via vercel.json — but per P-vercel-plan we're
--       already at 5 crons; prefer on-read)
--
-- Pick (a) — implemented in actions/admin/csv-imports.ts as a sweep
-- that runs at the top of listCsvImports / getCsvImport.
--
-- Threshold: 10 minutes.  Largest legitimate import is MAX_IMPORT_ROWS
-- (5000 rows) at ~10 forwarders inserts/sec = ~8 minutes worst case.
-- 10 minutes gives a safety margin without leaving zombie rows visible
-- for hours.
--
-- Idempotent.

alter table public.csv_imports
  add column if not exists started_at timestamptz;

-- Backfill: existing rows that ever entered 'importing' don't have
-- started_at, but they're either 'imported' or 'failed' by now (ภูม
-- already ran the import flow successfully on dev project).  Anything
-- still 'importing' on production migration-run was a previously stuck
-- zombie — flip those now to 'failed' with a recovery message so they
-- don't immediately re-zombie.
update public.csv_imports
   set status = 'failed',
       error_message = coalesce(error_message, '') ||
                       ' (auto-recovered on 0032 migration: status was importing with no started_at)'
 where status = 'importing'
   and started_at is null;

create index if not exists csv_imports_stale_importing_idx
  on public.csv_imports(status, started_at)
  where status = 'importing';

comment on column public.csv_imports.started_at is
  'Set when status transitions to importing. The application sweeps stuck rows where started_at < now() - 10 minutes back to failed (P-19-followup-stale).';
