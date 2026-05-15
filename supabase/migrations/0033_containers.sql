-- ════════════════════════════════════════════════════════════
-- T-P2 · containers, shipments, shipment_tracking — warehouse spine
-- ════════════════════════════════════════════════════════════
-- Per docs/architecture/container-centric-model.md (design locked
-- 2026-05-16). The container is the system's spine. Customers +
-- shipments hang off it, not the other way around.
--
-- This migration introduces:
--   1. admins.role enum extended: + 'warehouse' + 'driver'
--      (per memory staff_roles_pacred; was tracked in ADR-0010 P-38).
--   2. containers — extends EXISTING 0016 phase-H containers table
--      with the spine columns. 0016 created the table with vendor /
--      vessel / carrier / status flow for ops daily-tracking; 0033
--      adds the design-locked spine fields (code, transport_mode,
--      origin, destination, source, packed_at, sealed_at,
--      actual_arrival, total_boxes, total_cbm).
--   3. shipments — one customer's portion of a container, linked
--      back to existing forwarders (cargo-import) or service_orders
--      (China-shop) via optional FKs
--   4. shipment_tracking — per-shipment scan/event timeline
--   5. container_status_history — high-level container state log
--
-- MOMO sync writes to source='momo'. Pacred-self writes source='pacred'.
-- Customer-direct scan (future) writes source='customer_scan' (tracking only).
--
-- 🐛 FIX 2026-05-17 (ภูม): rewrote container section from naive
-- `create table if not exists` (which silently skipped column adds when
-- 0016 had already created the table) to ALTER TABLE ADD COLUMN IF NOT
-- EXISTS pattern. Original failed with `42703: column "source" does
-- not exist` when the index step ran against the unmodified 0016
-- schema. Now runs cleanly whether or not 0016 ran first.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Extend admins.role to add 'warehouse' + 'driver' ---------------
--   Existing values: super, ops, accounting, sales_admin
--   We drop the existing CHECK and re-add with the expanded set.
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add  constraint admins_role_check
  check (role in ('super','ops','accounting','sales_admin','warehouse','driver'));

-- 2) containers — extend the 0016 phase-H table -------------------
--
-- The minimal `create table if not exists` ensures fresh DBs (where
-- 0016 didn't run) get a basic table. Existing DBs (0016 already ran)
-- get the columns added via ALTER, which is what was missing in the
-- original 0033.
create table if not exists public.containers (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Spine columns from container-centric-model.md spec.
-- All NULLABLE on add (no default conflicts with existing rows from 0016);
-- application backfills as it adopts the new fields.
alter table public.containers
  add column if not exists code            text,
  add column if not exists transport_mode  text,
  add column if not exists origin          text,
  add column if not exists destination     text,
  add column if not exists packed_at       timestamptz,
  add column if not exists sealed_at       timestamptz,
  add column if not exists actual_arrival  timestamptz,
  add column if not exists source          text,
  add column if not exists total_boxes     int            not null default 0,
  add column if not exists total_cbm       numeric(10,3)  not null default 0;

-- Defaults for new columns where the original spec called for them.
-- Apply only to rows that don't already have a value (no-op for fresh DBs).
update public.containers set source         = 'momo'  where source         is null;
update public.containers set transport_mode = 'truck' where transport_mode is null;

-- Lock NOT NULL on the columns spec said are required. Use a guard so
-- this is safe to re-run.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'containers'
       and column_name  = 'source'         and is_nullable = 'YES'
  ) then alter table public.containers alter column source         set not null; end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'containers'
       and column_name  = 'transport_mode' and is_nullable = 'YES'
  ) then alter table public.containers alter column transport_mode set not null; end if;
end $$;

-- Drop pre-existing CHECK constraints that 0016 added (different value
-- enums) and replace with unions that accept both 0016 + 0033 values.
-- App code decides which value to write; the DB allows both during the
-- migration period.
alter table public.containers drop constraint if exists containers_status_check;
alter table public.containers add  constraint containers_status_check
  check (status in (
    -- 0016 phase-H values
    'preparing','sealed','in_transit','arrived_port','cleared_customs','delivered','cancelled',
    -- 0033 spine values
    'packing','arrived','unloading','closed'
  ));

alter table public.containers drop constraint if exists containers_transport_mode_check;
alter table public.containers add  constraint containers_transport_mode_check
  check (transport_mode in ('truck','sea','air'));

alter table public.containers drop constraint if exists containers_source_check;
alter table public.containers add  constraint containers_source_check
  check (source in ('pacred','momo','self'));

-- Unique index on code (only when set — coexists with 0016 container_no).
create unique index if not exists containers_code_unique_idx
  on public.containers(code) where code is not null;

create index if not exists containers_status_eta_idx
  on public.containers(status, eta);
create index if not exists containers_source_updated_idx
  on public.containers(source, updated_at desc);

drop trigger if exists containers_updated_at_trigger on public.containers;
create trigger containers_updated_at_trigger
  before update on public.containers
  for each row execute function public.set_updated_at();

-- 3) shipments -----------------------------------------------------
create table if not exists public.shipments (
  id                  uuid primary key default gen_random_uuid(),
  shipment_code       text unique not null,
  container_id        uuid references public.containers(id) on delete restrict,
  profile_id          uuid not null references public.profiles(id) on delete restrict,
  -- One shipment must trace back to either a cargo-import order
  -- (forwarders.f_no) or a China-shop order (service_orders.h_no).
  -- Combined flows allowed (both can be set).
  forwarder_f_no      text references public.forwarders(f_no),
  service_order_h_no  text references public.service_orders(h_no),
  box_count           int not null default 1,
  weight_kg           numeric(10,2),
  volume_cbm          numeric(10,3),
  status              text not null check (status in (
                        'received_cn',
                        'packed_cn',
                        'sealed_in_container',
                        'in_transit',
                        'arrived_th',
                        'unloaded',
                        'out_for_delivery',
                        'delivered'
                      )) default 'received_cn',
  received_at_cn      timestamptz,
  delivered_at_th     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint shipments_one_parent_order check (
    forwarder_f_no is not null or service_order_h_no is not null
  )
);

create index if not exists shipments_container_profile_idx
  on public.shipments(container_id, profile_id);
create index if not exists shipments_profile_status_idx
  on public.shipments(profile_id, status);
create index if not exists shipments_forwarder_idx
  on public.shipments(forwarder_f_no) where forwarder_f_no is not null;
create index if not exists shipments_service_order_idx
  on public.shipments(service_order_h_no) where service_order_h_no is not null;

drop trigger if exists shipments_updated_at_trigger on public.shipments;
create trigger shipments_updated_at_trigger
  before update on public.shipments
  for each row execute function public.set_updated_at();

-- 4) shipment_tracking ---------------------------------------------
-- Per-box or per-shipment scan timeline. MVP scans at shipment level
-- (box_no nullable); box-level when scanner UX is ready.
create table if not exists public.shipment_tracking (
  id           uuid primary key default gen_random_uuid(),
  shipment_id  uuid not null references public.shipments(id) on delete cascade,
  box_no       text,
  event        text not null,                   -- 'scan_receive','scan_pack','scan_seal','scan_unload', etc.
  location     text,                            -- warehouse code or carrier name
  scanned_at   timestamptz not null default now(),
  scanned_by   uuid references public.admins(profile_id),
  source       text not null check (source in ('pacred','momo','customer_scan')) default 'pacred',
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists shipment_tracking_shipment_scanned_idx
  on public.shipment_tracking(shipment_id, scanned_at desc);

-- 5) container_status_history --------------------------------------
-- High-level transitions on the container itself, separate from
-- per-shipment scans. One row per state change.
create table if not exists public.container_status_history (
  id                uuid primary key default gen_random_uuid(),
  container_id      uuid not null references public.containers(id) on delete cascade,
  from_status       text,
  to_status         text not null,
  note              text,
  changed_at        timestamptz not null default now(),
  changed_by_admin  uuid references public.admins(profile_id),
  source            text not null check (source in ('pacred','momo','self')) default 'pacred'
);

create index if not exists container_status_history_container_changed_idx
  on public.container_status_history(container_id, changed_at desc);

-- 6) RLS -----------------------------------------------------------
alter table public.containers               enable row level security;
alter table public.shipments                enable row level security;
alter table public.shipment_tracking        enable row level security;
alter table public.container_status_history enable row level security;

-- containers: customer sees a container only if they own ≥1 shipment in it
-- (Note: 0016 created `containers_select_via_my_orders` for the same intent
-- via forwarders.container_id / service_orders.container_id. We keep that
-- policy intact; this new policy adds the shipments-table path.)
drop policy if exists containers_customer_read on public.containers;
create policy containers_customer_read
  on public.containers for select
  using (
    exists (
      select 1 from public.shipments s
       where s.container_id = containers.id
         and s.profile_id  = auth.uid()
    )
  );

drop policy if exists containers_admin_all on public.containers;
create policy containers_admin_all
  on public.containers for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- shipments: customer sees own; warehouse staff full access
drop policy if exists shipments_customer_read on public.shipments;
create policy shipments_customer_read
  on public.shipments for select
  using (profile_id = auth.uid());

drop policy if exists shipments_admin_all on public.shipments;
create policy shipments_admin_all
  on public.shipments for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- shipment_tracking: customer reads via parent shipment ownership
drop policy if exists shipment_tracking_customer_read on public.shipment_tracking;
create policy shipment_tracking_customer_read
  on public.shipment_tracking for select
  using (
    exists (
      select 1 from public.shipments s
       where s.id         = shipment_tracking.shipment_id
         and s.profile_id = auth.uid()
    )
  );

-- shipment_tracking: warehouse + driver write (drivers scan their own runs)
drop policy if exists shipment_tracking_admin_all on public.shipment_tracking;
create policy shipment_tracking_admin_all
  on public.shipment_tracking for all
  using      (public.is_admin(array['super','ops','warehouse','driver']))
  with check (public.is_admin(array['super','ops','warehouse','driver']));

-- container_status_history: admin-only (customer doesn't need state machine internals)
drop policy if exists container_status_history_admin_all on public.container_status_history;
create policy container_status_history_admin_all
  on public.container_status_history for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- 7) Comments ------------------------------------------------------
comment on table  public.containers is
  'Physical shipping unit (truck/sea/air). 0016 phase-H created with vendor/vessel/carrier columns; 0033 extended with code/source/transport_mode spine fields. One container has many shipments and many customers. See docs/architecture/container-centric-model.md.';
comment on column public.containers.code is
  'Container code (0033 spine). Self-issued format <origin>-<YYMMDD>-<seq> (e.g. GZE260516-1) OR MOMO-issued (whatever JMF returns). Coexists with 0016-era container_no.';
comment on column public.containers.source is
  'pacred = Pacred-managed; momo = synced from MOMO JMF partner; self = future customer-direct scan source.';

comment on table  public.shipments is
  'One customer''s portion of a container. Bridges existing forwarders (cargo-import) and service_orders (China-shop) into the container spine.';
comment on constraint shipments_one_parent_order on public.shipments is
  'Each shipment must trace back to at least one parent order (forwarder or service_order). Both can be set for combined flows.';

comment on table  public.shipment_tracking is
  'Per-shipment scan/event timeline. MVP at shipment level (box_no nullable). Box-level scanning lands when UX is ready.';

comment on table  public.container_status_history is
  'High-level container state transitions (packing → sealed → in_transit → arrived → unloading → closed). Separate from per-shipment scans.';
