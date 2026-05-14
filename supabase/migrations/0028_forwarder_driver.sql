-- ════════════════════════════════════════════════════════════
-- P-18 · forwarder_driver — driver assignment table
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-18 (เดฟ assigned 2026-05-14): port legacy
-- tb_forwarder_driver. Each row = one assignment of a forwarder
-- shipment to a delivery driver (a profiles row whose user is set
-- up as driver via admin tooling — no separate driver table for now;
-- profile_id is enough).
--
-- State machine:
--   1 = assigned    (waiting for driver accept; auto-expires after 17h)
--   2 = accepted    (driver took the job)
--   3 = expired     (17h timeout; cron flipped 1 → 3)
--   4 = completed   (delivery confirmed)
--
-- Driver expiry cron sweeps status=1 AND fd_date < now()-17h → status=3
-- (route: /api/cron/expire-driver-assignments, schedule hourly).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.forwarder_driver (
  id            uuid primary key default gen_random_uuid(),
  forwarder_id  uuid not null references public.forwarders(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id)   on delete restrict,
  status        smallint not null default 1
                  check (status in (1, 2, 3, 4)),
  fd_date       timestamptz not null default now(),                -- assigned_at
  accepted_at   timestamptz,
  completed_at  timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists forwarder_driver_forwarder_idx
  on public.forwarder_driver(forwarder_id);
create index if not exists forwarder_driver_profile_idx
  on public.forwarder_driver(profile_id);
-- Composite index supports the cron sweep + admin filter-by-status.
create index if not exists forwarder_driver_status_date_idx
  on public.forwarder_driver(status, fd_date);

drop trigger if exists forwarder_driver_updated_at_trigger
  on public.forwarder_driver;
create trigger forwarder_driver_updated_at_trigger
  before update on public.forwarder_driver
  for each row execute function public.set_updated_at();

-- ── RLS ──
alter table public.forwarder_driver enable row level security;

-- Drivers see their own assignments
drop policy if exists forwarder_driver_select_own on public.forwarder_driver;
create policy forwarder_driver_select_own
  on public.forwarder_driver for select
  using (auth.uid() = profile_id);

-- Admins (any role): full access
drop policy if exists forwarder_driver_admin_all on public.forwarder_driver;
create policy forwarder_driver_admin_all
  on public.forwarder_driver for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table  public.forwarder_driver is
  'Assignment of a forwarder shipment to a delivery driver. Status state machine: 1=assigned → 2=accepted (or 3=expired via cron after 17h) → 4=completed. Mirror of legacy tb_forwarder_driver.';
comment on column public.forwarder_driver.fd_date is
  'Assignment timestamp. Cron /api/cron/expire-driver-assignments flips status=1 → 3 when fd_date < now()-17h.';
