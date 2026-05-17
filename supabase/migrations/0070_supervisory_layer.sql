-- ════════════════════════════════════════════════════════════
-- U4-1 (Poom split) — Admin supervisory layer (cron-health + notification delivery log)
-- ════════════════════════════════════════════════════════════
-- Implements TWO sub-items of U4-1 (docs/UPGRADE_PLAN.md §4):
--   1. cron-health panel  → new public.cron_invocations log table
--   2. notification delivery log → adds delivery_status + delivery_error
--      columns to the existing public.notifications table
--
-- Both are super-side supervisory; ship together for a single apply step.
--
-- ── Decisions ──────────────────────────────────────────────────────
-- - cron_invocations is append-only — every cron run writes ONE row at
--   end (or two: pre/post — see lib/cron/instrument.ts).
--   Index covers (cron_path, fired_at desc) for the per-cron last-fire
--   query that powers the /admin/system/crons cards.
-- - RLS: SELECT for super + ops; service_role writes from the cron
--   wrapper (bypasses RLS). No customer access.
-- - notifications.delivery_status is nullable. Existing rows pre-this
--   migration have NULL; the UI treats NULL as "legacy / unknown" and
--   defaults the display to 'delivered' when delivered_line_at IS NOT
--   NULL OR delivered_email_at IS NOT NULL. The new column is the
--   forward-looking signal for the queue worker (post-U4-1).
-- - Idempotent + additive; safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) cron_invocations ────────────────────────────────────────────

create table if not exists public.cron_invocations (
  id              uuid primary key default gen_random_uuid(),

  -- Matches the path entry in vercel.json (and lib/cron/registry.ts).
  --   '/api/cron/sms-balance-check'
  --   '/api/cron/auto-cancel-orders'
  cron_path       text not null,

  -- When the handler started.
  fired_at        timestamptz not null default now(),

  -- When the handler returned (NULL if pre-row, populated on the post-row).
  finished_at     timestamptz,
  duration_ms     int,

  -- Lifecycle: 'success' (handler returned ok) | 'failure' (threw / explicit
  -- failure) | 'partial' (some items succeeded, some failed — e.g. broadcast
  -- fan-out where 1k inserted + 50 failed).
  status          text not null check (status in ('success','failure','partial')),

  -- Per-cron meta (e.g. { sent: 5, failed: 0 } or { cancelled: 3 }). Free-form.
  result_summary  jsonb,

  -- Error string when status='failure' or 'partial' for the failed batch.
  error_message   text,

  created_at      timestamptz not null default now()
);

create index if not exists cron_invocations_path_fired_idx
  on public.cron_invocations(cron_path, fired_at desc);

create index if not exists cron_invocations_status_idx
  on public.cron_invocations(status, fired_at desc) where status <> 'success';

comment on table public.cron_invocations is
  'U4-1: append-only log of every Vercel cron invocation, written by lib/cron/instrument.ts. Powers /admin/system/crons (last fire + 7-day success rate + last error).';
comment on column public.cron_invocations.cron_path is
  'Matches vercel.json cron path entry (e.g. /api/cron/sms-balance-check). Joined with lib/cron/registry.ts for schedule + label.';
comment on column public.cron_invocations.status is
  'success | failure | partial. partial = handler completed but with internal item-level failures (see result_summary).';

-- ── 2) cron_invocations RLS ────────────────────────────────────────

alter table public.cron_invocations enable row level security;

-- SELECT: super + ops (ops needs to see cron health for the operational
-- modules they run — forwarder cancellations, driver expiry, etc).
drop policy if exists "cron_invocations_admin_select" on public.cron_invocations;
create policy "cron_invocations_admin_select" on public.cron_invocations
  for select using (public.is_admin(array['super','ops']));

-- INSERT/UPDATE/DELETE go through the service_role admin client from
-- lib/cron/instrument.ts (RLS bypassed). We intentionally don't grant
-- a table-level write policy — keeps the surface tight.

-- ── 3) notifications.delivery_status + delivery_error ──────────────

alter table public.notifications
  add column if not exists delivery_status text
  check (delivery_status is null or delivery_status in ('pending','delivered','failed','read'));

alter table public.notifications
  add column if not exists delivery_error text;

create index if not exists notifications_delivery_status_idx
  on public.notifications(delivery_status, created_at desc)
  where delivery_status is not null;

comment on column public.notifications.delivery_status is
  'U4-1: per-row delivery lifecycle. NULL = legacy row (treat as delivered if delivered_line_at OR delivered_email_at is set). pending | delivered | failed | read.';
comment on column public.notifications.delivery_error is
  'U4-1: error string on failed delivery (LINE push failure / email send failure). NULL when delivery succeeded.';

-- ── 4) Verify (counts) ─────────────────────────────────────────────

do $$
declare
  rls_count    int;
  delivery_col int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'cron_invocations';
  if rls_count < 1 then
    raise warning 'cron_invocations RLS expected ≥ 1 policy, found %', rls_count;
  else
    raise notice 'U4-1 cron_invocations ready — % RLS policies installed', rls_count;
  end if;

  select count(*) into delivery_col
    from information_schema.columns
   where table_schema='public' and table_name='notifications' and column_name='delivery_status';
  if delivery_col = 0 then
    raise warning 'notifications.delivery_status missing after migration';
  else
    raise notice 'U4-1 notifications.delivery_status column ready';
  end if;
end$$;
