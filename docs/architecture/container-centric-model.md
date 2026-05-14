# Container-centric data model — Pacred warehouse + shipment + tracking spine

**Status:** Design lock (per เดฟ brief 2026-05-16) — implementation pending Phase G2+ + MOMO sync wire (see [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md))
**Owner:** ภูม implements; เดฟ + ก๊อต approve schema migrations

---

## Core principle

> **ตู้คอนเทนเนอร์เป็นหลัก** — the container is the system's spine. Customers + shipments hang off it, not the other way around.

Why container-first (not shipment-first):

1. **Operational reality** — warehouse staff load + close + ship CONTAINERS. A shipment without a container is meaningless once it leaves the warehouse.
2. **MOMO interface** — partner sends data keyed by container code. We mirror the partner contract.
3. **Customer mental model** — customers ask "ของฉันอยู่ตู้ไหน" (which container is my stuff in?) before "ของฉันถึงไหนแล้ว" (where is my stuff?). Container is the answer to "where exactly."
4. **Driver / planner UX** — drivers see container manifests; planners assign containers to truck-runs.

## Two equally-supported views

Both views must work — they're mirror images:

### View A — Customer side (`/(protected)/...`)

Customer opens portal → first sees a list of their containers:

```
Containers containing your goods:
  ┌──────────────────────────────────────┐
  │ 🚚 GZE260516-1  (truck, in transit) │
  │    3 shipments · ETA 2026-05-22      │
  ├──────────────────────────────────────┤
  │ 🚢 SEA-2605-A   (sea, packing)      │
  │    1 shipment  · ETA 2026-06-10      │
  └──────────────────────────────────────┘
```

Click a container → see the customer's shipments inside (filtered to that customer's `profile_id`). Click a shipment → per-box tracking timeline.

### View B — Staff side (`/admin/warehouse/...`)

Staff opens container view → first sees containers they're managing:

```
Open containers (warehouse: bangkok-1):
  ┌──────────────────────────────────────┐
  │ 🚚 GZE260516-1  (truck, packing)    │
  │    Customers in this container:      │
  │      • PR00005 (3 shipments)         │
  │      • PR00009 (1 shipment)          │
  │      • PR00012 (2 shipments)         │
  │      Capacity: 78% · 24 boxes        │
  └──────────────────────────────────────┘
```

Click a container → see ALL customers inside + their shipments. Click into a shipment → same per-box tracking.

## Schema sketch

```sql
-- ──────────────── containers ──────────────────
-- A physical shipping unit (truck-trailer / sea-FCL / sea-LCL / air-AWB).
-- One container ↔ many shipments ↔ many customers.
create table public.containers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,           -- "GZE260516-1" (origin-date-seq) or MOMO-issued
  transport_mode  text not null check (transport_mode in ('truck','sea','air')),
  origin          text not null,                  -- 'guangzhou' | 'yiwu' | port code
  destination     text not null,                  -- 'bangkok' | 'samut_sakhon' | etc
  status          text not null check (status in ('packing','sealed','in_transit','arrived','unloading','closed')),
  packed_at       timestamptz,
  sealed_at       timestamptz,
  eta             date,
  actual_arrival  timestamptz,
  source          text not null check (source in ('pacred','momo','self')) default 'momo',
  -- denorm cache from MOMO sync (refreshable)
  total_boxes     int default 0,
  total_weight_kg numeric(12,2) default 0,
  total_cbm       numeric(10,3) default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on containers (status, eta);
create index on containers (source, updated_at);

-- ──────────────── shipments ──────────────────
-- One customer's portion of a container. Each `forwarder` (existing table)
-- or `service_order` (existing) gets a 1-N relationship to shipments.
create table public.shipments (
  id              uuid primary key default gen_random_uuid(),
  shipment_code   text unique not null,           -- e.g., "SH-GZE260516-PR00005-01"
  container_id    uuid references containers(id) on delete restrict,
  profile_id      uuid not null references profiles(id) on delete restrict,
  forwarder_f_no  text references forwarders(f_no),         -- if cargo-import (existing flow)
  service_order_h_no text references service_orders(h_no),  -- if China shop (existing flow)
  box_count       int not null default 1,
  weight_kg       numeric(10,2),
  volume_cbm      numeric(10,3),
  status          text not null check (status in ('received_cn','packed_cn','sealed_in_container','in_transit','arrived_th','unloaded','out_for_delivery','delivered')) default 'received_cn',
  received_at_cn  timestamptz,                    -- when scanned in at China warehouse
  delivered_at_th timestamptz,                    -- when delivered to customer in Thailand
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index on shipments (container_id, profile_id);
create index on shipments (profile_id, status);

-- ──────────────── shipment_tracking ──────────────────
-- Box-scan timeline. Multiple events per shipment.
create table public.shipment_tracking (
  id              uuid primary key default gen_random_uuid(),
  shipment_id     uuid not null references shipments(id) on delete cascade,
  box_no          text,                                     -- box-level scan (nullable for shipment-wide events)
  event           text not null,                            -- 'scan_receive', 'scan_pack', 'scan_seal', 'scan_unload', etc
  location        text,                                     -- warehouse code or carrier name
  scanned_at      timestamptz not null default now(),
  scanned_by      uuid references admins(profile_id),       -- null = MOMO sync; uuid = Pacred staff
  source          text not null check (source in ('pacred','momo','customer_scan')) default 'pacred',
  note            text,
  created_at      timestamptz default now()
);

create index on shipment_tracking (shipment_id, scanned_at desc);

-- ──────────────── container_status_history ──────────────────
-- High-level state transitions on the container itself (separate from per-shipment scans).
create table public.container_status_history (
  id              uuid primary key default gen_random_uuid(),
  container_id    uuid not null references containers(id) on delete cascade,
  from_status     text,
  to_status       text not null,
  note            text,
  changed_at      timestamptz not null default now(),
  changed_by_admin uuid references admins(profile_id),
  source          text not null check (source in ('pacred','momo','self')) default 'pacred'
);

-- ──────────────── RLS policies ──────────────────
alter table containers enable row level security;
-- Customer-side: see containers that have at least one of their shipments inside
create policy containers_customer_read on containers for select
  using (exists (
    select 1 from shipments where shipments.container_id = containers.id
      and shipments.profile_id = auth.uid()
  ));
-- Admin warehouse/planner: full read+write
create policy containers_admin_all on containers for all
  using (is_admin(array['super','ops','warehouse']))
  with check (is_admin(array['super','ops','warehouse']));

alter table shipments enable row level security;
create policy shipments_customer_read on shipments for select
  using (profile_id = auth.uid());
create policy shipments_admin_all on shipments for all
  using (is_admin(array['super','ops','warehouse']))
  with check (is_admin(array['super','ops','warehouse']));

alter table shipment_tracking enable row level security;
create policy shipment_tracking_customer_read on shipment_tracking for select
  using (exists (
    select 1 from shipments where shipments.id = shipment_tracking.shipment_id
      and shipments.profile_id = auth.uid()
  ));
create policy shipment_tracking_admin_all on shipment_tracking for all
  using (is_admin(array['super','ops','warehouse','driver']))
  with check (is_admin(array['super','ops','warehouse','driver']));
```

> **Note:** `warehouse` + `driver` are NEW admin roles per memory `staff_roles_pacred`. Need to extend `admins.role` enum (currently `super|ops|accounting|sales_admin`) — track in `ADR-0010` (P-38 RBAC).

## Relationship to existing tables

```
profiles (existing)
   ↓ (1 customer ↔ many shipments)
shipments (NEW) ──┐
   │              │
   │              ↓ (each shipment IS in 1 container)
   │           containers (NEW)
   │              ↓ (each container has many shipment-tracking events)
   ↓           container_status_history (NEW)
shipment_tracking (NEW)

forwarders (existing) ──┐
                         ├─→ shipments.forwarder_f_no (FK)
service_orders (existing)─┘  + shipments.service_order_h_no (FK)
```

`forwarders` (cargo-import) and `service_orders` (China shop) keep their existing structure. They GAIN a one-to-many relationship to `shipments`, which is the new layer that connects them to containers + tracking.

## Status enum semantics

**Container status:**
- `packing` — being loaded at origin (CN warehouse or TH cross-dock)
- `sealed` — closed; manifest finalised; ready to ship
- `in_transit` — on the carrier (truck/ship/plane)
- `arrived` — landed at destination warehouse
- `unloading` — being broken out of the container
- `closed` — all shipments dispatched; container retired

**Shipment status:**
- `received_cn` — scanned at China warehouse
- `packed_cn` — packed into a container (FK populated)
- `sealed_in_container` — container is sealed
- `in_transit` — moving
- `arrived_th` — at Thailand warehouse
- `unloaded` — broken out of container
- `out_for_delivery` — handed to messenger/driver/courier
- `delivered` — customer received

## What this replaces / extends

- **Extends** existing `forwarders` table — cargo-import shipments gain a container link
- **Extends** existing `service_orders` — China shop orders gain a container link (since they ride along in the same containers)
- **New** for everything else — `containers`, `shipments`, `shipment_tracking`, `container_status_history`
- **Replaces** ad-hoc tracking in `forwarders.tracking_no` (singular) with multi-event timeline

## Open questions (for ก๊อต + ภูม resolution)

1. **Container numbering scheme** — when Pacred can self-close (post-MOMO), what's the format? Recommend `<origin>-<YYMMDD>-<seq>` per legacy (e.g., `GZE260516-1` = Guangzhou-EK, 2026-05-16, sequence 1).
2. **Should `shipments` be created at China-warehouse scan-receive, or at order-placement?**
   - Option A (recommended): created at scan-receive → ties to physical reality
   - Option B: created at order-placement → ties to customer's commitment, even before goods exist
3. **MOMO sync conflict resolution** — when MOMO sends a status the warehouse staff already overrode → MOMO wins (default) or staff override stays? Recommend staff-override wins, log the divergence.
4. **Box-level vs shipment-level scanning** — implement both, or only shipment-level for MVP? Recommend shipment-level only for MVP (`shipment_tracking.box_no` nullable); add box-level when scanner UX is ready.

## Implementation phases

Block on [MOMO integration](../integrations/momo-jmf.md) Step 1 (endpoint inventory). Then:

1. **Migration `00NN_containers.sql`** — all 4 new tables + RLS + indexes (~1h ภูม)
2. **`lib/warehouse/*.ts`** — typed clients for upsert + tracking-event-append (~2h ภูม)
3. **Customer view `/(protected)/service-import/[fNo]/container`** — show container card with tracking timeline (~3h ภูม + ปอน design assist)
4. **Admin view `/(admin)/admin/warehouse/containers`** — list + filter + detail with customer list inside (~4h ภูม)
5. **MOMO sync cron + webhook** (~3h ภูม) — see momo-jmf.md
6. **Driver UI integration** — driver sees their container's shipments (~2h ภูม)
7. **Tests** — integration test for container lifecycle: create → pack shipments → seal → in-transit → arrived → unload → deliver (~2h ภูม)

Total: ~17-20h ภูม after MOMO endpoint inventory is locked.

## Cross-references

- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner API spec
- [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) — legacy cargo-thai wire format reference
- [`docs/decisions/0009-erp-schema-sketch.md`](../decisions/0009-erp-schema-sketch.md) — M14 "Inventory beyond cargo" + M12 "AP" + M13 "Vendor mgmt"
- Memory: `staff_roles_pacred` — role to admin-workspace mapping (load via /memories — not in repo)
