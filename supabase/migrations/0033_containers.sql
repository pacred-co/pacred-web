-- ════════════════════════════════════════════════════════════
-- T-P2 · cargo_containers + cargo_shipments + tracking — warehouse spine
-- ════════════════════════════════════════════════════════════
-- Per docs/architecture/container-centric-model.md (design locked
-- 2026-05-16). The container is the system's spine. Customers +
-- shipments hang off it, not the other way around.
--
-- NAMING NOTE (important): this migration uses the `cargo_*` prefix to
-- AVOID colliding with the legacy `public.containers` table created in
-- migration 0016 (which kept its old ops-tracking shape: container_no,
-- vendor_container_id, vessel, carrier, origin_warehouse, status enum
-- preparing/sealed/in_transit/arrived_port/cleared_customs/delivered/
-- cancelled, etc.).  The two coexist:
--
--   public.containers          (0016) — legacy ops tracking;
--                                       /admin/containers + forwarders.container_id
--   public.cargo_containers    (this) — new container-centric spine with
--                                       shipments/tracking/history breakdown
--
-- Long-term consolidation may happen (V3 territory), for now they coexist
-- so this migration doesn't break the existing /admin/containers page.
--
-- This migration introduces:
--   1. admins.role enum extended: + 'warehouse' + 'driver'
--   2. cargo_containers — physical shipping unit (truck/sea/air)
--   3. cargo_shipments — one customer's portion of a cargo_container,
--      linked back to existing forwarders (cargo-import) or service_orders
--      (China-shop) via optional FKs
--   4. cargo_shipment_tracking — per-shipment scan/event timeline
--   5. cargo_container_status_history — high-level state log
--
-- MOMO sync writes to source='momo'. Pacred-self writes source='pacred'.
-- Customer-direct scan (future) writes source='customer_scan' (tracking only).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Extend admins.role to add 'warehouse' + 'driver' ---------------
--   Existing values: super, ops, accounting, sales_admin
--   We drop the existing CHECK and re-add with the expanded set.
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add  constraint admins_role_check
  check (role in ('super','ops','accounting','sales_admin','warehouse','driver'));

-- 2) cargo_containers ----------------------------------------------
create table if not exists public.cargo_containers (
  id              uuid primary key default gen_random_uuid(),
  -- Container code. Self-issued format: <origin>-<YYMMDD>-<seq>
  -- (e.g. "GZE260516-1" = Guangzhou-Eastbound, 2026-05-16, seq 1).
  -- MOMO-issued: whatever JMF returns (mirror the partner contract).
  code            text unique not null,
  transport_mode  text not null check (transport_mode in ('truck','sea','air')),
  origin          text not null,
  destination     text not null,
  status          text not null check (status in (
                    'packing','sealed','in_transit','arrived','unloading','closed'
                  )) default 'packing',
  packed_at       timestamptz,
  sealed_at       timestamptz,
  eta             date,
  actual_arrival  timestamptz,
  source          text not null check (source in ('pacred','momo','self')) default 'momo',
  -- denorm cache, refreshable from MOMO or our own sum
  total_boxes     int           not null default 0,
  total_weight_kg numeric(12,2) not null default 0,
  total_cbm       numeric(10,3) not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists cargo_containers_status_eta_idx
  on public.cargo_containers(status, eta);
create index if not exists cargo_containers_source_updated_idx
  on public.cargo_containers(source, updated_at desc);

drop trigger if exists cargo_containers_updated_at_trigger on public.cargo_containers;
create trigger cargo_containers_updated_at_trigger
  before update on public.cargo_containers
  for each row execute function public.set_updated_at();

-- 3) cargo_shipments -----------------------------------------------
create table if not exists public.cargo_shipments (
  id                  uuid primary key default gen_random_uuid(),
  shipment_code       text unique not null,
  cargo_container_id  uuid references public.cargo_containers(id) on delete restrict,
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
  constraint cargo_shipments_one_parent_order check (
    forwarder_f_no is not null or service_order_h_no is not null
  )
);

create index if not exists cargo_shipments_container_profile_idx
  on public.cargo_shipments(cargo_container_id, profile_id);
create index if not exists cargo_shipments_profile_status_idx
  on public.cargo_shipments(profile_id, status);
create index if not exists cargo_shipments_forwarder_idx
  on public.cargo_shipments(forwarder_f_no) where forwarder_f_no is not null;
create index if not exists cargo_shipments_service_order_idx
  on public.cargo_shipments(service_order_h_no) where service_order_h_no is not null;

drop trigger if exists cargo_shipments_updated_at_trigger on public.cargo_shipments;
create trigger cargo_shipments_updated_at_trigger
  before update on public.cargo_shipments
  for each row execute function public.set_updated_at();

-- 4) cargo_shipment_tracking ---------------------------------------
-- Per-box or per-shipment scan timeline. MVP scans at shipment level
-- (box_no nullable); box-level when scanner UX is ready.
create table if not exists public.cargo_shipment_tracking (
  id                 uuid primary key default gen_random_uuid(),
  cargo_shipment_id  uuid not null references public.cargo_shipments(id) on delete cascade,
  box_no             text,
  event              text not null,                   -- 'scan_receive','scan_pack','scan_seal','scan_unload', etc.
  location           text,                            -- warehouse code or carrier name
  scanned_at         timestamptz not null default now(),
  -- FK references profiles(id), NOT admins(profile_id), because admins
  -- has composite PK (profile_id, role) — profile_id alone isn't unique.
  -- Admin-role check happens via RLS (cargo_shipment_tracking_admin_all
  -- gates write to ['super','ops','warehouse','driver']) — the FK only
  -- proves the scanner profile exists.
  scanned_by         uuid references public.profiles(id),
  source             text not null check (source in ('pacred','momo','customer_scan')) default 'pacred',
  note               text,
  created_at         timestamptz not null default now()
);

create index if not exists cargo_shipment_tracking_shipment_scanned_idx
  on public.cargo_shipment_tracking(cargo_shipment_id, scanned_at desc);

-- 5) cargo_container_status_history --------------------------------
-- High-level transitions on the cargo container itself, separate from
-- per-shipment scans. One row per state change.
create table if not exists public.cargo_container_status_history (
  id                  uuid primary key default gen_random_uuid(),
  cargo_container_id  uuid not null references public.cargo_containers(id) on delete cascade,
  from_status         text,
  to_status           text not null,
  note                text,
  changed_at          timestamptz not null default now(),
  -- See cargo_shipment_tracking.scanned_by note — FK to profiles(id).
  changed_by_admin    uuid references public.profiles(id),
  source              text not null check (source in ('pacred','momo','self')) default 'pacred'
);

create index if not exists cargo_container_status_history_container_changed_idx
  on public.cargo_container_status_history(cargo_container_id, changed_at desc);

-- 6) RLS -----------------------------------------------------------
alter table public.cargo_containers               enable row level security;
alter table public.cargo_shipments                enable row level security;
alter table public.cargo_shipment_tracking        enable row level security;
alter table public.cargo_container_status_history enable row level security;

-- cargo_containers: customer sees a container only if they own ≥1 shipment in it
drop policy if exists cargo_containers_customer_read on public.cargo_containers;
create policy cargo_containers_customer_read
  on public.cargo_containers for select
  using (
    exists (
      select 1 from public.cargo_shipments s
       where s.cargo_container_id = cargo_containers.id
         and s.profile_id         = auth.uid()
    )
  );

drop policy if exists cargo_containers_admin_all on public.cargo_containers;
create policy cargo_containers_admin_all
  on public.cargo_containers for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- cargo_shipments: customer sees own; warehouse staff full access
drop policy if exists cargo_shipments_customer_read on public.cargo_shipments;
create policy cargo_shipments_customer_read
  on public.cargo_shipments for select
  using (profile_id = auth.uid());

drop policy if exists cargo_shipments_admin_all on public.cargo_shipments;
create policy cargo_shipments_admin_all
  on public.cargo_shipments for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- cargo_shipment_tracking: customer reads via parent shipment ownership
drop policy if exists cargo_shipment_tracking_customer_read on public.cargo_shipment_tracking;
create policy cargo_shipment_tracking_customer_read
  on public.cargo_shipment_tracking for select
  using (
    exists (
      select 1 from public.cargo_shipments s
       where s.id         = cargo_shipment_tracking.cargo_shipment_id
         and s.profile_id = auth.uid()
    )
  );

-- cargo_shipment_tracking: warehouse + driver write (drivers scan their own runs)
drop policy if exists cargo_shipment_tracking_admin_all on public.cargo_shipment_tracking;
create policy cargo_shipment_tracking_admin_all
  on public.cargo_shipment_tracking for all
  using      (public.is_admin(array['super','ops','warehouse','driver']))
  with check (public.is_admin(array['super','ops','warehouse','driver']));

-- cargo_container_status_history: admin-only (customer doesn't need state machine internals)
drop policy if exists cargo_container_status_history_admin_all on public.cargo_container_status_history;
create policy cargo_container_status_history_admin_all
  on public.cargo_container_status_history for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- 7) Comments ------------------------------------------------------
comment on table  public.cargo_containers is
  'Physical shipping unit (truck/sea/air). One container has many shipments and many customers. See docs/architecture/container-centric-model.md. Coexists with legacy public.containers (0016) which keeps the old ops-tracking shape — long-term consolidation deferred.';
comment on column public.cargo_containers.code is
  'Container code. Self-issued format <origin>-<YYMMDD>-<seq> (e.g. GZE260516-1) OR MOMO-issued (whatever JMF returns).';
comment on column public.cargo_containers.source is
  'pacred = Pacred-managed; momo = synced from MOMO JMF partner; self = future customer-direct scan source.';

comment on table  public.cargo_shipments is
  'One customer''s portion of a cargo container. Bridges existing forwarders (cargo-import) and service_orders (China-shop) into the container spine.';
comment on constraint cargo_shipments_one_parent_order on public.cargo_shipments is
  'Each shipment must trace back to at least one parent order (forwarder or service_order). Both can be set for combined flows.';

comment on table  public.cargo_shipment_tracking is
  'Per-shipment scan/event timeline. MVP at shipment level (box_no nullable). Box-level scanning lands when UX is ready.';

comment on table  public.cargo_container_status_history is
  'High-level cargo container state transitions (packing → sealed → in_transit → arrived → unloading → closed). Separate from per-shipment scans.';
