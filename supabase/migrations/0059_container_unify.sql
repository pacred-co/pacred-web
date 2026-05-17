-- ════════════════════════════════════════════════════════════
-- U1-1 · Container unify (cargo_containers canonical)
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §1 U1-1 ("Unify the two container tables — pick
-- cargo_containers canonical, migrate legacy containers, repoint
-- forwarders.container_id, redirect /admin/containers — the rest
-- of U1 (and R-1) inherits a split if this is not first").
--
-- Background — the rename collision was fixed at commit `bf7acf8`
-- but the unify itself was deferred. We have two coexisting tables:
--
--   public.containers        (0016 phase-H) — vendor / vessel /
--                            carrier / cost_thb / 7-state legacy
--                            status enum; FK targets:
--                              forwarders.container_id
--                              service_orders.container_id
--
--   public.cargo_containers  (0033 spine + 0040 carrier no + 0042
--                            close_at) — code / transport_mode /
--                            origin / destination / 6-state spine
--                            status; FK targets:
--                              cargo_shipments.cargo_container_id
--
-- This migration:
--   1. Adds backward-compat columns to cargo_containers so legacy
--      ops fields survive (vessel, carrier, vendor_container_id,
--      cost_thb, note, cleared_at, delivered_at, cancelled_at,
--      legacy_container_id).
--   2. Backfills rows from `containers` → `cargo_containers` that
--      have not yet been mirrored (idempotent — keyed on
--      legacy_container_id).
--   3. Adds `cargo_container_id` to forwarders + service_orders
--      (FK → cargo_containers) and backfills via the legacy mapping.
--   4. KEEPS the legacy `containers` table + old `container_id`
--      columns in place — read-only safety net + rollback path.
--      Drop will land in a later cleanup migration once all
--      readers are repointed (tracked in PORT_PLAN U1-1 follow-up).
--
-- All steps idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Backward-compat columns on cargo_containers ─────────────────

alter table public.cargo_containers
  add column if not exists legacy_container_id   uuid,
  add column if not exists legacy_container_no   text,
  add column if not exists vessel                text,
  add column if not exists carrier               text,
  add column if not exists vendor_container_id   text,
  add column if not exists cost_thb              numeric(12,2),
  add column if not exists note                  text,
  add column if not exists cleared_at            timestamptz,
  add column if not exists delivered_at          timestamptz,
  add column if not exists cancelled_at          timestamptz;

-- Unique constraint on legacy_container_id (backfill key).
-- Partial unique → many NULLs allowed (spine-native rows have no legacy id).
create unique index if not exists cargo_containers_legacy_container_id_uk
  on public.cargo_containers(legacy_container_id)
  where legacy_container_id is not null;

comment on column public.cargo_containers.legacy_container_id is
  'U1-1: original public.containers.id this row was mirrored from. NULL for spine-native rows. Provides the join key from forwarders.container_id (legacy) to cargo_containers.id (canonical) during the transition.';
comment on column public.cargo_containers.legacy_container_no is
  'U1-1: original public.containers.container_no (e.g. CN-260513-01). Preserved for staff search + audit trail. New rows leave NULL.';
comment on column public.cargo_containers.vessel is
  'U1-1: ship / truck name from legacy ops tracking. Optional metadata. NULL on spine-native rows.';
comment on column public.cargo_containers.carrier is
  'U1-1: carrier company (Maersk / COSCO / JMF / etc.) from legacy ops tracking. Distinct from cargo_containers.source — that flags the data source (pacred/momo/self), this names the physical carrier.';
comment on column public.cargo_containers.vendor_container_id is
  'U1-1: shipping line''s container number from legacy ops tracking. Now superseded by carrier_container_no (V-D3, B/L number); kept for backfill compatibility. New rows should write to carrier_container_no only.';
comment on column public.cargo_containers.cost_thb is
  'U1-1: admin-internal cost from carrier (legacy ops field). Optional. Drives margin calc on container detail page.';
comment on column public.cargo_containers.cleared_at is
  'U1-1: customs-cleared timestamp from legacy 0016 status flow. Spine maps the legacy "cleared_customs" status onto "arrived" + this timestamp; readers can detect "cleared but not unloaded" via this column.';
comment on column public.cargo_containers.delivered_at is
  'U1-1: container-level delivery timestamp from legacy 0016 status flow. Spine maps legacy "delivered" onto "closed" + this timestamp.';
comment on column public.cargo_containers.cancelled_at is
  'U1-1: container-level cancellation timestamp from legacy 0016 status flow. Spine has no cancelled status; mapped to "closed" + this timestamp. Readers should treat closed-with-cancelled_at-set as cancelled.';

-- ── 2) Backfill cargo_containers from legacy containers ─────────────

-- Status mapping helper inlined as CASE:
--   preparing       → packing
--   sealed          → sealed
--   in_transit      → in_transit
--   arrived_port    → arrived
--   cleared_customs → arrived  (+ cleared_at)
--   delivered       → closed   (+ delivered_at)
--   cancelled       → closed   (+ cancelled_at)
--
-- Transport mapping: truck → truck, ship → sea, air → air
-- Origin mapping: guangzhou → 'CN-GZ', yiwu → 'CN-YW', other → 'CN-XX'
-- Destination: default 'TH-BKK' (legacy didn't store this).
--
-- code = container_no (CN-YYMMDD-N format won't clash with spine
-- GZE/GZS codes). Where container_no IS NULL on legacy (rare,
-- pre-trigger rows), generate "LEGACY-{id-prefix}".

insert into public.cargo_containers (
  id, code, transport_mode, origin, destination, status,
  packed_at, sealed_at, eta, actual_arrival, source,
  total_weight_kg, total_cbm,
  legacy_container_id, legacy_container_no, vessel, carrier,
  vendor_container_id, cost_thb, note,
  cleared_at, delivered_at, cancelled_at,
  created_at, updated_at
)
select
  gen_random_uuid(),
  coalesce(c.container_no, 'LEGACY-' || substr(c.id::text, 1, 8)),
  case c.transport_type
    when 'truck' then 'truck'
    when 'ship'  then 'sea'
    when 'air'   then 'air'
    else 'truck'
  end,
  case c.origin_warehouse
    when 'guangzhou' then 'CN-GZ'
    when 'yiwu'      then 'CN-YW'
    else 'CN-XX'
  end,
  'TH-BKK',
  case c.status
    when 'preparing'       then 'packing'
    when 'sealed'          then 'sealed'
    when 'in_transit'      then 'in_transit'
    when 'arrived_port'    then 'arrived'
    when 'cleared_customs' then 'arrived'
    when 'delivered'       then 'closed'
    when 'cancelled'       then 'closed'
    else                        'packing'
  end,
  null,                                 -- packed_at — legacy didn't track
  c.date_sealed,
  c.eta,
  c.date_arrived_port,
  'pacred',                              -- legacy data was Pacred-managed
  coalesce(c.total_weight_kg, 0),
  coalesce(c.total_volume_cbm, 0),
  c.id,                                  -- legacy_container_id
  c.container_no,                        -- legacy_container_no
  c.vessel,
  c.carrier,
  c.vendor_container_id,
  c.cost_thb,
  c.note,
  c.date_cleared,                        -- cleared_at
  c.date_delivered,                      -- delivered_at
  case when c.status = 'cancelled' then c.updated_at else null end,
  c.created_at,
  c.updated_at
from public.containers c
where not exists (
  select 1 from public.cargo_containers cc
   where cc.legacy_container_id = c.id
);

-- Also handle code-collision case: if a legacy CN- code happens to
-- coincide with an existing spine code (unlikely but possible), the
-- insert above would have failed via cargo_containers.code unique
-- constraint. The WHERE NOT EXISTS handles the legacy_container_id
-- side; if code collision still bites, the insert raises — caller
-- (this migration) errors out loud rather than silently dropping
-- rows. Acceptable: collisions are detectable via Supabase logs and
-- the few-row legacy table can be hand-fixed.

-- ── 3) New FK column on forwarders ──────────────────────────────────

alter table public.forwarders
  add column if not exists cargo_container_id uuid
  references public.cargo_containers(id) on delete set null;

create index if not exists forwarders_cargo_container_idx
  on public.forwarders(cargo_container_id) where cargo_container_id is not null;

comment on column public.forwarders.cargo_container_id is
  'U1-1: canonical FK into cargo_containers (spine). Backfilled from legacy forwarders.container_id via the cargo_containers.legacy_container_id mapping. New writes should target this column only; legacy container_id retained read-only for rollback safety.';

update public.forwarders f
   set cargo_container_id = cc.id
  from public.cargo_containers cc
 where cc.legacy_container_id = f.container_id
   and f.container_id        is not null
   and f.cargo_container_id  is null;

-- ── 4) New FK column on service_orders ──────────────────────────────

alter table public.service_orders
  add column if not exists cargo_container_id uuid
  references public.cargo_containers(id) on delete set null;

create index if not exists service_orders_cargo_container_idx
  on public.service_orders(cargo_container_id) where cargo_container_id is not null;

comment on column public.service_orders.cargo_container_id is
  'U1-1: canonical FK into cargo_containers (spine). Backfilled from legacy service_orders.container_id via the cargo_containers.legacy_container_id mapping. New writes should target this column only; legacy container_id retained read-only for rollback safety.';

update public.service_orders so
   set cargo_container_id = cc.id
  from public.cargo_containers cc
 where cc.legacy_container_id = so.container_id
   and so.container_id        is not null
   and so.cargo_container_id  is null;

-- ── 5) Legacy table deprecation comment ─────────────────────────────

comment on table public.containers is
  'DEPRECATED (U1-1, 2026-05-17): legacy 0016 phase-H container ops table. Rows mirrored into public.cargo_containers (canonical) via the U1-1 backfill. Kept read-only as rollback safety + audit trail until /admin/containers UI is fully sunset. Do not INSERT/UPDATE new rows here — write to cargo_containers instead. Future cleanup migration will drop this table once all readers are repointed.';

-- ── 6) Verify (counts) ─────────────────────────────────────────────

do $$
declare
  legacy_count           int;
  mirrored_count         int;
  forwarder_repoint_diff int;
  so_repoint_diff        int;
begin
  select count(*) into legacy_count   from public.containers;
  select count(*) into mirrored_count from public.cargo_containers where legacy_container_id is not null;

  if legacy_count <> mirrored_count then
    raise warning 'U1-1 backfill skipped some legacy containers — legacy=% mirrored=%',
      legacy_count, mirrored_count;
  else
    raise notice 'U1-1 backfill OK — % legacy container(s) mirrored', legacy_count;
  end if;

  select count(*) into forwarder_repoint_diff
    from public.forwarders
   where container_id is not null
     and cargo_container_id is null;
  if forwarder_repoint_diff > 0 then
    raise warning 'U1-1 % forwarder(s) have container_id but no cargo_container_id — broken mapping?', forwarder_repoint_diff;
  end if;

  select count(*) into so_repoint_diff
    from public.service_orders
   where container_id is not null
     and cargo_container_id is null;
  if so_repoint_diff > 0 then
    raise warning 'U1-1 % service_order(s) have container_id but no cargo_container_id — broken mapping?', so_repoint_diff;
  end if;
end$$;
