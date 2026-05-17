# 🇨🇳 China-side Operations + Container-Closing (ปิดตู้) System — survey + design

> **Captured:** 2026-05-18 · **By:** logistics-systems analyst (research worktree) · **Status:** R&D design — survey of what exists + design for the gap. **No code.**
>
> **The ask (owner พี่ป๊อป, relayed by เดฟ):** a China-side operations + container-closing system, modelled on how MOMO / CargoThai run it. When Pacred's cargo volume is large enough, Pacred **closes its own containers from China** instead of relying on MOMO/CargoThai as the consolidator — then Pacred uses its own freight (truck/sea/air) and **controls the whole chain end-to-end with far more detailed status → happier customers.** China-based staff log into the Pacred platform and do the China-warehouse work: receive goods · key in container + invoice + packing list · print tracking numbers · measure dimensions · scan + barcode goods · close sacks (ปิดกระสอบ) · close the container (ปิดตู้) → hand to freight.
>
> **Read with:**
> [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — the warehouse/container/shipment spine ·
> [`docs/research/momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) — MOMO container-close + lifecycle decode ·
> [`docs/research/ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) — CargoThai/TTP carrier model ·
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — GZE/GZS, A/M/X/O/Z, the close-container flow ·
> [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md) §12 / §16 — warehouse role + China-warehouse-partner vision.

---

## 0. TL;DR

1. **The container DATA MODEL is ~80% built.** `cargo_containers` (migration `0033`), `cargo_sacks` (`0068`), `cargo_shipments` + `cargo_shipment_tracking` + `cargo_container_status_history`, the `lib/warehouse/*` typed clients, the `/admin/warehouse/containers` admin module, and the `warehouse` admin role all exist and work. The container/sack/shipment spine described in [`container-centric-model.md`](../architecture/container-centric-model.md) is implemented and ships today.
2. **What is missing is the China side of the loop** — the model was built **TH-receiving-first** (a MOMO sync mirror + a TH cross-dock view). It does not yet model the *origin* warehouse work: a China-staff scoped login, the goods-receive → measure → barcode → packing-list → close-sack → close-container progression as an explicit guided workflow, and the freight handoff that links a closed `cargo_container` to a `freight_shipments` carrier job.
3. **No new top-level architecture is needed.** The container *is* the spine and that decision holds. This design adds: (a) a **China-warehouse-staff portal** (`/cn` route group + `cn_warehouse` admin role + a `warehouses` location table), (b) an explicit **receive → measure → barcode → close-sack → close-container → hand-to-freight** state workflow with print outputs, (c) the missing **goods-receipt / packing-list / per-box-barcode** columns + tables, and (d) the **container ⇄ freight job** bridge.
4. **Identity-clean.** This design covers only legitimate physical-logistics operations — receiving, measuring, scanning, barcoding, packing list, tracking, closing. It deliberately does **not** model the invoice-value-engineering / "แผน VAT" / declared-vs-real-value gray-channel scheme catalogued in [`cargo-ops-forensics`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5 / E2. That must never enter Pacred. (A *commercial invoice for the customer's own records* is fine; a second "plan" sheet that decouples declared value from real value is not — and is out of scope here.)

---

## 1. Why this matters — the strategic frame

Pacred is, today, a **consumer** of someone else's China warehouse:

- MOMO closes the containers, runs the China warehouse, and is the **only digital source** of container + per-parcel status — Pacred polls MOMO's API and mirrors it ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §1).
- CargoThai trucks the consolidated container China → Mukdahan; TTP runs the destination warehouse + Thai customs ([`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) §1–2).

That dependency caps three things: **status granularity** (Pacred can only show what MOMO chose to expose, with a 15-min lag and recurring data bugs — [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §7), **margin** (MOMO bills Pacred per-CBM/weight as a middleman — [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §4.3), and **trust** ("ในระบบไม่ขึ้น" — physically arrived, not in system, 10+ complaints).

When Pacred has its own China warehouse + staff, the digital source of truth **moves in-house**. Every receive-scan, every dimension measurement, every sack close, every container seal becomes a Pacred-owned event the moment it happens — no lag, no partner bug, no "ask BBOY". That is the "happier customers" the owner wants: a tracking timeline that goes from `รับเข้าโกดังจีน` the same minute the goods hit the shelf.

This is **explicitly the future state** named in [`ops-roles.md`](../briefs/ops-roles.md) §16 ("China warehouse partner — when Pacred has volume → install Pacred-owned system at Chinese warehouse"). This doc designs that system. It is built so it can run **alongside** the MOMO sync during the transition (some containers `source='momo'`, some `source='pacred'`) and become the only path once volume justifies it.

---

## 2. Survey — what Pacred already HAS

### 2.1 Tables (all present, all with RLS)

| Table | Migration | What it stores | China-ops relevance |
|---|---|---|---|
| `cargo_containers` | `0033` (+`0040`,`0042`,`0059`) | Physical shipping unit. `code`, `transport_mode` (truck/sea/air), `origin`, `destination`, `status` (6-state spine), `packed_at`, `sealed_at`, `eta`, `actual_arrival`, `source` (pacred/momo/self), denorm totals, `carrier_container_no`, `close_at` (ตัดตู้ deadline). | **The container.** Spine exists. Gap: no FK to a `warehouses` row, no `closed_by` staff stamp, no link to a freight job. |
| `cargo_sacks` | `0068` | กระสอบรวม consolidation bag. `code` (`CBX<YYMMDD>-EK<NN>`), `cargo_container_id`, outside `weight_kg`+`cbm`, `source`, `packed_at`, `arrived_at`. Has `next_sack_code()` generator + daily seq. | **The sack.** Entity + code-gen exist. Gap: no explicit `status` (open/closed), no `closed_by`, no staff create flow (migration comment says "V1 ships READ-only sync surface — staff don't manually create sacks"). |
| `cargo_shipments` | `0033` (+`0037`,`0039`) | One customer's portion of a container. `shipment_code`, FK to container + sack, `profile_id`, `forwarder_f_no`/`service_order_h_no`, `box_count`/`received_box_count`, `weight_kg`, CBM-per-source (`received_cbm`/`queue_cbm`/`manifest_cbm`), `cargo_type`, 8-state `status`. | **The parcel.** Rich already. Gap: no per-box rows (barcode is a future "box_no nullable" placeholder), no dimension capture columns, no parcel-photo storage. |
| `cargo_shipment_tracking` | `0033` | Append-only scan timeline. `event`, `location`, `scanned_at`, `scanned_by`, `box_no` (nullable), `source`. | **The timeline.** Works. Gap: events are free-text; no canonical China-side event set; `box_no` unused. |
| `cargo_container_status_history` | `0033` | Container state-transition audit log. | Works as-is. |
| `freight_shipments` | `0050` (+`0051`,`0052`,`0053`,`0063`) | Single-consignee freight job. `job_no` (`A{YY}{NNNNN}`), `transport_mode` (sea_fcl/sea_lcl/truck/air), `container_code`, `carrier_container_no`, `bl_no`, 6-state workflow. | **The freight leg.** Exists for single-consignee FCL. Gap: not linked to a *consolidated* `cargo_container` — the handoff bridge is missing (§6). |
| `carriers` | `0036` | Carrier/forwarder partner rows. | Reusable for "hand to freight" — the truck/sea/air carrier that takes the closed container. |
| `container_costs` / disbursements | `0069` | Per-container cost + disbursement lines (finance). | Cost side exists; out of scope here (China ops = physical, not finance). |

### 2.2 Code — `lib/warehouse/*` (typed server-only clients)

All present and tested:

- `containers.ts` — `getContainerById/ByCode`, `listContainers`, `createContainer` (auto-code via `nextCodeForOrigin`), `upsertContainerByCode`, `setContainerStatus` (logs history + stamps `packed_at`/`sealed_at`/`actual_arrival`), `setContainerCloseAt`, `refreshContainerTotals`.
- `sacks.ts` — `getSackById/ByCode`, `listSacksForContainer`, `upsertSackByCode`, `attachShipmentToSack`, `reconcileSack` (outside-vs-inside CBM gap).
- `shipments.ts` — `getShipmentById/ByCode`, `listShipmentsByContainer`, `createShipment`, `setShipmentCargoType`, `attachShipmentToContainer`, `setShipmentReceivedQty`, `setShipmentStatus`.
- `tracking.ts` — `appendTrackingEvent`, `listTrackingEvents`, `latestEventsByShipments`.
- `code-gen.ts` — `buildContainerCode` (`<originPrefix><YYMMDD>-<seq>`), `originPrefix`, `dateSlug` (Bangkok TZ).
- `cargo-type.ts` — canonical `CargoType` enum + `toCanonicalCargoType()` normalising legacy A/M/X/O/Z + G/T/F.
- `types.ts` — all shared shapes.

### 2.3 Admin UI + actions

- `/admin/warehouse/containers` — list + `new-container-form` + detail page `[code]`. Detail shows status, shipments-inside with per-shipment scan recorder, CBM-diff badge, status history, `close-at-form`, `manual-shipment-form`, `status-form`, cost panel (super/accounting only).
- `/admin/warehouse/qa-inspections` + `/admin/warehouse/bulletin` — adjacent warehouse modules.
- `/admin/containers` — **legacy** ops container page (migration `0016` `public.containers`; coexists with the spine — see [`container-centric-model.md`](../architecture/container-centric-model.md) §"Implementation table-name note").
- `/admin/barcode` — scan form (`scan-form.tsx`) + driver sub-page. `actions/admin/barcode.ts::adminBarcodeScan` matches a code against `forwarders`/`service_orders` and flips status (`intake`/`prepare`/`driver` modes). **TH-side intake**, not China-side, and it operates on the *order* tables, not on `cargo_shipments`.
- `actions/admin/warehouse.ts` — `adminCreateContainer`, `adminSetContainerStatus` (with full cascade container→shipment→forwarder/service_order), `adminAttachShipmentToContainer` (rejects past `close_at`), `adminSetShipmentStatus`, `adminCreateShipmentManual` (U1-4 — register a shipment before MOMO sync), `adminSetShipmentReceivedQty`, `adminSetShipmentCargoType`, `adminSetContainerCloseAt`, `adminAddTrackingEvent`.

### 2.4 Roles

`admins.role` CHECK currently allows: `super`, `ops`, `accounting`, `sales_admin`, `warehouse` (added `0033`), `driver` (added `0033`), `interpreter` (added `0054`). `lib/auth/require-admin.ts::AdminRole` mirrors this. `is_admin(array[...])` SECURITY DEFINER drives every RLS policy. The `warehouse` role exists and has full access to all `cargo_*` tables.

### 2.5 What the survey concludes

**The container-closing data MODEL is built.** A staff member with the `warehouse` role can today, via `/admin/warehouse/containers`: create a container, attach shipments, set a `close_at` deadline, flip the container through `packing → sealed → in_transit → arrived → unloading → closed`, scan tracking events, and the spine cascades down to forwarders/service_orders. Sacks exist as an entity with their own code namespace.

**What is NOT built is the China-origin-of-the-loop experience.** Six concrete gaps (each detailed in §5):

| Gap | What's missing |
|---|---|
| **G1 — China-staff portal & role** | No `cn_warehouse` role; no China-scoped login/workspace; `/admin/*` is one undifferentiated back-office. China staff need a focused, mobile/tablet, possibly-CN-locale workspace — not the full Thai admin. |
| **G2 — Goods-receive workflow** | No explicit "goods arrived at the China shelf" first-class step. `adminCreateShipmentManual` registers a shipment but is built for TH-side WeChat-batch entry, not a China receiving desk. No receive-desk UX, no parcel photo capture, no inbound discrepancy flag. |
| **G3 — Dimension capture (วัดไดเมนชั่น) & per-box barcode** | `cargo_shipments` has aggregate `weight_kg`/CBM but no `width/length/height`. `box_no` exists on the tracking table but unused — there is no per-box entity, no barcode print, no barcode-scan-to-box. |
| **G4 — Close-sack (ปิดกระสอบ) workflow** | `cargo_sacks` has no `status` (open/closed); migration comment explicitly says staff *don't* create sacks (sync-only). The "pack parcels into a sack, then close the sack" step has no UX and no state. |
| **G5 — Close-container (ปิดตู้) as a guarded workflow** | A status flip to `sealed` exists, but there is no *guarded ปิดตู้ action* — no pre-close checklist (all sacks closed? all shipments measured? manifest generated?), no `closed_by` stamp, no immutable manifest snapshot, no print output. |
| **G6 — Freight handoff** | A closed `cargo_container` has no link to the `freight_shipments` carrier job that physically moves it. "Hand it to freight" is a real step with no data representation. |

---

## 3. The reference model — how MOMO / CargoThai run it

Pacred is copying a flow it has watched closely. The decoded sources give the template.

### 3.1 MOMO's container lifecycle (the digital twin to mirror)

From [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §3. MOMO runs **two coupled state machines** — the container (the box) and the tracking/parcel (one customer's goods inside). MOMO's app routes *are* the lifecycle stages:

```
parcel: order → PENDING (expected, not scanned) → WAITING (in CN warehouse,
        awaiting a container) → ARRIVAL KODANG (sealed in a container, CN-side)
        → SENDING THAI (in transit / arrived TH) → SUCCESS (sorted, deliverable)
container: loading_container → ek_left_china_border / sea_leaving_china
        → in_transit → ek_arrived_mukdahan / sea_arrived_thailand_port
        → unloading_in_thailand → unloaded_completed
```

Key facts Pacred's own system must reproduce:

- **The China warehouse keys data first** ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §1: "China-side keys data first") — exactly the receive-scan step Pacred is bringing in-house.
- **MOMO has no `sealed` container status** — "ปิดตู้" is a *date/event*, not an API state ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §3.3). Pacred's spine *does* have `sealed` — and once Pacred closes its own containers, that `sealed` transition becomes a real, staff-driven, timestamped event. Good.
- **Transport mode is mutable mid-flight** — the 2026-05-15 Vietnam-border crackdown forced a truck→sea switch on in-flight containers ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §3.1). The design must not assume `transport_mode` is immutable after close.
- **The sack has its own MOMO endpoint** (`/api/sack/get/info/{code}`) and its own code namespace — confirming the sack is a real first-class object in the reference system, not a Pacred invention.

### 3.2 CargoThai's domain model (the schema Pacred reverse-engineered)

From [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) §2.2 — Pacred already scraped CargoThai and rebuilt the model: `container` (`sm_code`, `transport_name` EK/SEA, `branch_id`, `sm_date`, `box_total/weight/cbm`, `last_status`) → has-many `bags` / `shipments` / `tracking`, plus a `history` log. Pacred's `cargo_containers`/`cargo_sacks`/`cargo_shipments`/`cargo_shipment_tracking` *is* that model, promoted. **The `branch_id` is the one field Pacred's spine is missing** — CargoThai keys containers to a branch/warehouse; Pacred has no `warehouses` table (G1).

> [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) §5.2 is explicit: "Stop scraping `cargothai.tech`. Pacred's containers must be fed by Pacred's own China-warehouse intake (the 装柜明细 manifest flow), not a partner's back-office." This doc designs that intake.

### 3.3 The cargo-forensics container lifecycle + document births

From [`cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3.4 — where each artifact is born:

```
China warehouse receive  → PCS API parcel record (receive-scan, CBM #1)
   ↓  pack container
ปิดตู้ (close container)  → 装柜明细 loading manifest (CBM #2)
   ↓  ตัดตู้ (assign parcels → container; needs the close-date set)
ship  GZE truck / GZS sea
   ↓  arrive TH → unload → deliver
```

- **`GZE{YYMMDD}-{seq}`** = Guangzhou **truck**; **`GZS{YYMMDD}-{seq}`** = Guangzhou **sea** ([`cargo-ops-forensics`](../audit/cargo-ops-forensics-2026-05-16.md) §3.2). Pacred's `code-gen.ts` produces `<prefix><YYMMDD>-<seq>` — compatible; the prefix just needs the route letter (E/S) appended (§5 G5).
- **The 装柜明细 loading manifest** is the China warehouse's per-box output produced *at close* — Pacred's "close-container" action must generate the equivalent (§5 G5, §7).
- **CBM does not reconcile** across receive / queue-sum / manifest ([`cargo-ops-forensics`](../audit/cargo-ops-forensics-2026-05-16.md) §3.1 / D1) — the real GZE260422-1 case: 16.79 vs 21.28 CBM. Pacred's `cargo_shipments` already stores `received_cbm`/`queue_cbm`/`manifest_cbm` separately and the container detail page surfaces the diff. **Owning the China receive-scan kills the gap at the source** — `received_cbm` and `manifest_cbm` become the *same staff's* measurement.

### 3.4 Identity boundary — what this design refuses to copy

[`cargo-ops-forensics`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5 / E2 documents legacy "invoice value engineering": files named "`แผน2 VAT`", a declared customs value **decoupled from the real commercial value**, alternate "plan" sheets per shipment. **This is a gray-channel practice and is out of scope for this design — by instruction.** The China-ops system here models:

- ✅ A **packing list** — the honest box-by-box content list (item, qty, weight, dimensions) produced at the warehouse. This is a physical-truth document.
- ✅ A **commercial invoice** captured *as a customer document* — Pacred records the invoice the customer/supplier provides, for the customer's own customs file. Pacred stores it; Pacred does not engineer it.
- ❌ **NOT** a `declared_value` vs `real_value` split, NOT a `vat_plan` field, NOT alternate-plan sheets. Pacred's freight value model ([ADR-0016](../decisions/0016-freight-value-model.md)) is a separate, freight-team decision and is not extended here.

Every number Pacred's China staff key in is a **physical measurement or a transcription of a customer-supplied document** — never a fabricated customs figure.

---

## 4. Design overview — the China-ops system

Three pillars, all built on the existing container spine. No new top-level architecture.

```
┌─────────────────────────────────────────────────────────────────────┐
│ PILLAR A — China-warehouse-staff portal  (NEW: /cn route group)      │
│   cn_warehouse role · warehouse-scoped login · tablet-first · CN     │
│   locale option · focused workspace (NOT the full Thai /admin)       │
├─────────────────────────────────────────────────────────────────────┤
│ PILLAR B — the close-sack → close-container → freight workflow       │
│   receive → measure → barcode → pack-sack → close-sack →             │
│   pack-container → CLOSE CONTAINER (ปิดตู้) → hand to freight        │
│   each step a guarded action on the existing cargo_* spine           │
├─────────────────────────────────────────────────────────────────────┤
│ PILLAR C — capture + print pieces                                    │
│   invoice · packing list · tracking number · dimension capture ·     │
│   per-box barcode · the 装柜明细 close-manifest · print outputs      │
└─────────────────────────────────────────────────────────────────────┘
        ▼ feeds ▼
   the SAME cargo_containers / cargo_sacks / cargo_shipments the
   customer portal + MOMO sync + TH warehouse already read.
```

The design principle: **the China warehouse becomes a `source='pacred'` (or a new `source='cn_warehouse'`) writer to the exact same tables MOMO writes to as `source='momo'`.** During the transition both run; post-transition the China warehouse is the only writer and the MOMO sync is retired. The customer portal, the TH warehouse view, and the tracking timeline do not change — they just start receiving richer, faster, Pacred-owned events.

---

## 5. The schema gaps + the design to close them

All new migrations start at **`0073`** (latest shipped is `0072`). All additive + idempotent per [`supabase/migrations/README.md`](../../supabase/migrations/README.md). RLS-first.

### G1 — China-warehouse-staff portal & role

**New role.** Extend `admins.role` CHECK to add **`cn_warehouse`** (a 3-line `drop constraint` + `add constraint`, the established pattern from `0033`/`0054`). Add `"cn_warehouse"` to `lib/auth/require-admin.ts::AdminRole`. Rationale for a *distinct* role rather than reusing `warehouse`:

- China staff should see the China origin warehouse only — not Thai customer PII, Thai finance, Thai HR.
- `cn_warehouse` gets write access to `cargo_*` rows **scoped to their warehouse** (see `warehouses` below) + read access to the customer name/member-code needed to label goods — nothing else.
- `warehouse` (the existing TH role) keeps full `cargo_*` access. `super`/`ops` keep everything. So RLS policies become `is_admin(array['super','ops','warehouse','cn_warehouse'])` on the `cargo_*` tables, with an *additional* warehouse-scope predicate for `cn_warehouse` (below).

**New table — `warehouses`** (migration `0073`). The model is currently warehouse-agnostic (CargoThai's `branch_id` gap, §3.2). A China-ops system with potentially several Chinese warehouses (Guangzhou, Yiwu, Shenzhen) needs a location entity:

```
warehouses
  id            uuid pk
  code          text unique         -- 'CN-GZ', 'CN-YW', 'TH-BKK'
  name          text                -- 'Guangzhou Warehouse 1'
  country       text check (in ('CN','TH'))
  city          text
  is_active     bool default true
  created_at / updated_at
```

Then `cargo_containers.origin_warehouse_id uuid references warehouses(id)` (additive, nullable — backfill `origin` text → FK lazily). Membership: `admin_warehouses (profile_id, warehouse_id)` join table — which warehouse(s) a `cn_warehouse` staff belongs to. RLS for `cn_warehouse` on `cargo_containers`: `is_admin(array['cn_warehouse']) and origin_warehouse_id in (select warehouse_id from admin_warehouses where profile_id = auth.uid())` — a China staffer touches only their warehouse's containers. `super`/`ops`/`warehouse` skip the scope clause.

**New route group — `app/[locale]/(cn)/cn/*`.** A *parallel* route group to `(admin)`, with its own `layout.tsx` calling `requireAdmin(["cn_warehouse"])` (and `super`/`ops` pass through for oversight). Why a separate group, not `/admin/cn/*`:

- A focused, tablet-first surface (warehouse staff scan on tablets — [`poom.md`](../briefs/poom.md) §217). The full `/admin` nav is noise for a receiving desk.
- Locale: the `[locale]` segment already supports `th`/`en`; a `zh` locale can be added later for the China staff (messages files in [`messages/`](../../messages/)) without disturbing `/admin`. Not required for V1 — `en` is the V1 fallback for China staff — but the route shape leaves room.
- Clean RBAC boundary: `(cn)` layout gate = one role check; nothing under `/cn` is reachable by a Thai-only admin who lacks the role.

China-portal screens (V1):

| Route | Purpose |
|---|---|
| `/cn` | Dashboard — my warehouse · open containers · open sacks · today's receive count · goods awaiting measurement |
| `/cn/receive` | **Receive desk** — scan/key an inbound tracking number → match to a customer + order → create/locate the `cargo_shipment` → capture photos → "received" event (G2) |
| `/cn/shipments/[code]` | One parcel — measure dimensions, set weight, assign cargo_type, print barcodes (G3) |
| `/cn/sacks` + `/cn/sacks/[code]` | Sack list + detail — create a sack, pack shipments in, **close sack** (G4) |
| `/cn/containers` + `/cn/containers/[code]` | Container list + detail — pack sacks/shipments in, run the **close-container** checklist + action (G5) |
| `/cn/containers/[code]/manifest` | The 装柜明细 close-manifest — print view (C / §7) |

These **reuse** `lib/warehouse/*` clients and a new `actions/cn/*` action set (China-scoped wrappers, same shape as `actions/admin/warehouse.ts` but gated to `cn_warehouse` + warehouse-scope-checked).

### G2 — Goods-receive workflow (รับสินค้า + scan in + photos)

The first physical step: a parcel from a Chinese supplier arrives at the Pacred China warehouse shelf.

**Reuse:** `cargo_shipments` is the parcel row; `adminCreateShipmentManual` already resolves customer-by-member-code and validates the parent order. The China receive desk needs a thinner, faster wrapper of the same logic.

**Schema additions to `cargo_shipments`** (migration `0074`, additive):

```
cn_warehouse_in_at   timestamptz   -- when goods hit the China shelf (distinct
                                   -- from received_at_cn which the spine reuses
                                   -- loosely; this is the precise receive-scan)
received_by          uuid references profiles(id)   -- the China staffer
inbound_tracking_no  text          -- the Chinese courier tracking the goods
                                   -- arrived on (SF…, JYM…, opaque string)
shelf_location       text          -- physical shelf/bin label in the warehouse
receive_note         text
```

**New table — `cargo_parcel_photos`** (migration `0074`): `id`, `cargo_shipment_id`, `storage_path` (Supabase Storage, a new private `cn-warehouse/` bucket, RLS owner+staff), `kind` (`arrival`/`damage`/`label`), `uploaded_by`, `created_at`. MOMO already shoots `cover`+`img1..img4` per parcel ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §6.2) — Pacred owning the warehouse means Pacred shoots them.

**Workflow — `/cn/receive`:**

1. Staff scans/keys the **inbound courier tracking number** on the box.
2. System searches existing `cargo_shipments.inbound_tracking_no` and the parent order tables (`forwarders`, `service_orders`) for a match → resolves the **customer**.
3. If a `cargo_shipment` exists (pre-registered) → open it; else **create** it (`status='received_cn'`, `cn_warehouse_in_at=now()`, `received_by=staff`, `origin_warehouse` from staff's warehouse).
4. Staff snaps **arrival photos** → `cargo_parcel_photos`.
5. Append a `cn_receive` tracking event.
6. **Inbound discrepancy flag** — if the matched order's `box_count` ≠ what physically arrived, staff sets `received_box_count` (`setShipmentReceivedQty` exists) → a discrepancy badge surfaces, the customer sees "received N of M" honestly. This is the in-house cure for MOMO's `qty=1`-on-split bug ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §7.1) — Pacred counts the boxes itself.

The customer's tracking timeline now shows `รับเข้าโกดังจีน` the *same minute* — no 15-min sync, no partner.

### G3 — Dimension capture (วัดไดเมนชั่น) + tracking number + per-box barcode

**Dimension columns** — add to `cargo_shipments` (migration `0074`):

```
width_cm    numeric(8,2)
length_cm   numeric(8,2)
height_cm   numeric(8,2)
measured_cbm        numeric(10,3)   -- derived: w*l*h/1e6, stored for audit
measured_by         uuid references profiles(id)
measured_at         timestamptz
```

Aggregate `received_cbm` stays the billed-CBM source of truth; `measured_cbm` is the dimensional-from-WxLxH cross-check. **Server-side sanity guard** (the cure for the legacy `41*299*26` typo that 10×-overbilled a customer — [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §7.3): reject/flag any dimension > 250 cm or a `measured_cbm` that diverges from `received_cbm` by a wide margin → "ตรวจก่อนบิล" badge (the container detail page already has a CBM-diff badge — extend the same pattern to the measure form).

**Tracking numbers — two distinct concepts, both modelled:**

- `inbound_tracking_no` (G2) = the *Chinese courier's* number the goods arrived on. Opaque, supplier-chosen.
- **`shipment_code`** = Pacred's own identifier. Today `cargo_shipments.shipment_code` is hand-typed (`shipments.ts` comment: "admin prefers to write what's on the label"). For a Pacred-run warehouse this should be **Pacred-generated** — a `next_shipment_code()` SQL helper mirroring `next_sack_code()` (`0068`), format e.g. `PSC<YYMMDD>-<seq>` (Pacred Shipment Code). "Print tracking numbers" = print this Pacred code as a scannable label.

**Per-box barcode — new table `cargo_boxes`** (migration `0075`). The legacy `CG#########[-NNN]` per-box barcode ([`cargo-ops-forensics`](../audit/cargo-ops-forensics-2026-05-16.md) §3.2) and `cargo_shipment_tracking.box_no` (the unused nullable placeholder from `0033`) both point at a missing entity — the **individual box**:

```
cargo_boxes
  id                 uuid pk
  cargo_shipment_id  uuid references cargo_shipments(id) on delete cascade
  box_barcode        text unique     -- 'CG<seq>-001' style, Pacred-generated
  box_no             int             -- 1..box_count within the shipment
  weight_kg          numeric(8,2)
  width_cm/length_cm/height_cm  numeric(8,2)
  cargo_sack_id      uuid references cargo_sacks(id)  -- which sack this box went in
  status             text check (in ('received','measured','in_sack','in_container'))
  created_at / updated_at
```

This makes barcode work concrete:
- **"stick barcodes"** — on receive, generate `box_count` `cargo_boxes` rows, print a barcode label per box.
- **"scan goods into the system"** — scanning a `box_barcode` resolves the box → its shipment → drives the measure/pack steps.
- `cargo_shipment_tracking.box_no` finally has a real referent; box-level scans become possible (the `0033` "box-level when scanner UX is ready" promise).

A shipment with one box is the common case — one `cargo_boxes` row. Multi-box parcels (the `CG…-001/-002/-003` legacy pattern) are now first-class.

### G4 — Close-sack (ปิดกระสอบ) workflow

`cargo_sacks` exists but has **no lifecycle** — the `0068` migration explicitly scoped it READ-only (MOMO-sync-populated). A Pacred-run warehouse *creates and closes* sacks.

**Schema additions to `cargo_sacks`** (migration `0073`):

```
status        text check (in ('open','closed')) default 'open'
closed_by     uuid references profiles(id)
sealed_at     timestamptz          -- packed_at already exists; keep both:
                                   -- packed_at = first pack, sealed_at = sack closed
origin_warehouse_id  uuid references warehouses(id)
```

**Workflow — `/cn/sacks`:**

1. Staff **creates a sack** (`next_sack_code()` already exists) → `status='open'`, scoped to their warehouse.
2. Staff scans box barcodes / shipment codes → `attachShipmentToSack` (exists) sets `cargo_shipments.cargo_sack_id`; `cargo_boxes.cargo_sack_id` set per box; box `status → 'in_sack'`.
3. Staff weighs + measures the **whole sack** → `cargo_sacks.weight_kg` + `cbm` (the outside-of-bag measurement — the reconciliation reference `reconcileSack` already computes against the sum of inside `received_cbm`).
4. **Close sack** — a new guarded `cnCloseSack` action: `status → 'closed'`, stamp `sealed_at` + `closed_by`, append a `sack_close` event to every contained shipment's timeline. Once closed, no box can be added (server-side reject) unless a `cn_warehouse`+ explicitly re-opens.

A sack is the unit packed into the container. Closing it first is the natural pre-step to closing the container — and the design enforces that ordering (§G5 checklist).

### G5 — Close-container (ปิดตู้) as a guarded workflow

Today: `adminSetContainerStatus(..., 'sealed')` flips a status and logs history. That is a status change, **not a ปิดตู้ ceremony.** Closing a container is a point-of-no-return operational act — it deserves a guarded, checklist-gated action with an immutable output.

**Schema additions to `cargo_containers`** (migration `0073`):

```
closed_by              uuid references profiles(id)   -- the staffer who closed it
manifest_snapshot      jsonb        -- immutable 装柜明细 snapshot taken AT close
                                    -- (sacks + shipments + boxes + measurements,
                                    --  frozen — the legal "what was in the box")
freight_shipment_id    uuid references freight_shipments(id)  -- the carrier job (G6)
origin_warehouse_id    uuid references warehouses(id)
```

`transport_mode` stays mutable post-close (the §3.1 truck→sea reality) — the close ceremony does NOT freeze it.

**The close-container checklist** — `cnCloseContainer` action runs these gates before allowing the `packing → sealed` transition; each is a soft warning the staffer can override-with-reason (logged), except the hard ones:

| Check | Hard / soft |
|---|---|
| Container has ≥ 1 shipment | **Hard** — can't close an empty container |
| All sacks in the container are `status='closed'` | **Hard** — close the sacks first (G4) |
| Every shipment has `received_cbm` (or `measured_cbm`) set | Soft — warn "N shipments unmeasured" |
| Every shipment has a `cargo_type` | Soft — warn (drives TH clearance) |
| No shipment with `received_box_count < box_count` unresolved | Soft — warn "partial receipt unresolved" |
| `transport_mode` consistent with intended `code` prefix (GZE↔truck, GZS↔sea) | Soft — the §3.1 mismatch guard |

**On confirm, `cnCloseContainer`:**

1. Generates the **`manifest_snapshot`** — a frozen JSON of every sack, every shipment, every box, with measurements, customer member-codes, cargo types, totals. This is Pacred's own 装柜明细.
2. `refreshContainerTotals` → final `total_boxes`/`total_weight_kg`/`total_cbm`.
3. `setContainerStatus('sealed')` (logs history, stamps `sealed_at`) + stamps `closed_by`.
4. Cascades shipment status → `sealed_in_container` (the cascade in `actions/admin/warehouse.ts` already does this).
5. Appends a `container_close` event to every contained shipment's timeline.
6. Optionally sets `close_at = now()` so no late attach slips in.

**Container code with route letter** — when a Pacred China warehouse closes a container it should mint the legacy-style code: `code-gen.ts::buildContainerCode` currently yields `<originPrefix><YYMMDD>-<seq>` (e.g. `GZ260518-1`). Extend it to take the `transport_mode` and insert the route letter → `GZE260518-1` (truck) / `GZS260518-1` (sea), matching [`cargo-ops-forensics`](../audit/cargo-ops-forensics-2026-05-16.md) §3.2. Small, pure change to one helper.

After close: the container is `sealed`, has an immutable manifest, a `closed_by` fingerprint — and is ready to hand to freight.

### G6 — Freight handoff (hand the closed container to a carrier)

"Close the container → hand it to freight (a truck / sea / air carrier)." The handoff has no data representation today.

**The bridge.** `freight_shipments` (`0050`) already models a single carrier job (`job_no`, `transport_mode`, `container_code`, `carrier_container_no`, `bl_no`, status workflow). The gap is the **link** between a *consolidated* `cargo_container` (many customers) and the `freight_shipments` job that carries it.

Design: add `cargo_containers.freight_shipment_id` (above, G5) + a new `cnHandToFreight` action:

1. Staff (or TH ops) picks/creates the `freight_shipments` carrier job for this container — choosing the `carrier` (`carriers` table, `0036`) and `transport_mode`.
2. Sets `cargo_containers.freight_shipment_id`, copies `carrier_container_no` once the carrier issues it.
3. `setContainerStatus('in_transit')` → cascade → shipments `in_transit`, append `freight_handoff` event.
4. From here the existing TH-side flow takes over: `in_transit → arrived → unloading → closed`, TH warehouse unloads, drivers deliver.

This is the seam where **China ops ends and freight begins** — and where Pacred's "control the whole chain" becomes literally true: one `cargo_container` row, closed by Pacred China staff, linked to one Pacred-chosen `freight_shipments` carrier job, tracked unbroken to the customer's door.

> Note: `freight_shipments` was designed for *single-consignee FCL* ([`0050`] header). Using it as the carrier-job record for a *consolidated* container is a mild stretch — acceptable for V1 (one container = one carrier job = one `freight_shipments` row, the `profile_id` set to a Pacred internal/house account). If consolidated-freight needs diverge later, a dedicated `container_freight_legs` table is the V2 refinement. Flag to ก๊อต.

---

## 6. The end-to-end close-container workflow (the headline deliverable)

The full China-ops flow, every step mapped to an action + the spine table it writes:

```
 ┌── 1. RECEIVE (รับสินค้า) ──────────────────────────────────────────┐
 │  China staff scans inbound courier tracking at /cn/receive         │
 │  → resolve customer + parent order → create/open cargo_shipment    │
 │    (status received_cn, cn_warehouse_in_at, received_by)           │
 │  → generate cargo_boxes (one per box) + print box barcodes         │
 │  → snap arrival photos → cargo_parcel_photos                       │
 │  → tracking event: cn_receive                                      │
 │  action: cnReceiveGoods                                            │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 2. MEASURE + BARCODE (วัดไดเมนชั่น + ติดบาร์โค้ด) ───────────────┐
 │  /cn/shipments/[code]: key W×L×H + weight per box / per shipment   │
 │  → cargo_shipments.width/length/height_cm, measured_cbm,           │
 │    received_cbm, weight_kg, cargo_type                             │
 │  → sanity guard rejects absurd dimensions (>250cm)                 │
 │  → print Pacred shipment-code label + box barcodes                 │
 │  action: cnMeasureShipment / cnPrintLabels                         │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 3. PACK SACK + CLOSE SACK (ปิดกระสอบ) ──────────────────────────┐
 │  /cn/sacks: create sack (next_sack_code) → scan boxes into it      │
 │  → cargo_shipments.cargo_sack_id, cargo_boxes.cargo_sack_id        │
 │  → weigh + measure the whole sack → cargo_sacks.weight_kg, cbm     │
 │  → CLOSE SACK: status open→closed, sealed_at, closed_by            │
 │    tracking event sack_close on each contained shipment            │
 │  action: cnCreateSack / cnPackSack / cnCloseSack                   │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 4. PACK CONTAINER ──────────────────────────────────────────────┐
 │  /cn/containers: create container (GZE/GZS code by transport_mode) │
 │  → attach sacks + loose shipments (attachShipmentToContainer,      │
 │    rejects past close_at — exists)                                 │
 │  action: cnCreateContainer / cnPackContainer                       │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 5. CLOSE CONTAINER (ปิดตู้) — guarded ceremony ─────────────────┐
 │  /cn/containers/[code]: run the close checklist (§G5)              │
 │  → hard gates: ≥1 shipment, all sacks closed                       │
 │  → soft warnings: unmeasured / no cargo_type / partial receipt     │
 │  → CONFIRM: freeze manifest_snapshot (jsonb 装柜明细),             │
 │    refreshContainerTotals, setContainerStatus('sealed'),           │
 │    closed_by, cascade shipments→sealed_in_container,               │
 │    tracking event container_close on every shipment                │
 │  → print the 装柜明细 close-manifest (/cn/containers/[code]/manifest)│
 │  action: cnCloseContainer                                          │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 6. HAND TO FREIGHT ─────────────────────────────────────────────┐
 │  pick/create freight_shipments carrier job + carrier (carriers)    │
 │  → cargo_containers.freight_shipment_id, carrier_container_no      │
 │  → setContainerStatus('in_transit'), cascade shipments→in_transit  │
 │  → tracking event freight_handoff                                  │
 │  action: cnHandToFreight                                           │
 └────────────────────────────────────────────────────────────────────┘
              ▼
   existing TH-side flow: in_transit → arrived → unloading → closed
   TH warehouse unloads · drivers deliver · customer receives.
   ONE unbroken Pacred-owned timeline, China shelf → customer door.
```

Every event in steps 1–6 is `source='pacred'` (or a new `'cn_warehouse'` source value) on `cargo_shipment_tracking` — so the customer portal timeline and the MOMO sync coexist cleanly during transition, and post-transition the China warehouse is simply the only writer.

---

## 7. Print outputs

China-warehouse work is paper-driven. Pacred already has `lib/pdf/*` (per [CLAUDE.md](../../CLAUDE.md) folder map). Outputs needed (HTML print-view first, PDF where a formal doc is required):

| Output | When | Content | Honest-physical? |
|---|---|---|---|
| **Box barcode label** | At receive (G2/G3) | Pacred box barcode (`CG…`), shipment code, customer member-code, box N/M, warehouse code. Scannable. | ✅ physical identifier |
| **Shipment / tracking-number label** | At measure (G3) | Pacred `shipment_code` as a scannable code, customer member-code, destination. | ✅ physical identifier |
| **Sack label** | At sack close (G4) | Sack code (`CBX…`), container code, box count, total weight/CBM. | ✅ physical identifier |
| **装柜明细 — container close-manifest** | At container close (G5) | The frozen `manifest_snapshot`: container code, transport mode, every sack, every shipment + customer member-code + box count + weight + measured dimensions + cargo_type, grand totals. The legal "what is in this box." | ✅ physical truth — box-by-box measured content |
| **Packing list** | On demand per shipment / per container | Item-level list: marks, description, qty, unit, weight, dimensions. The honest content list. | ✅ physical truth |
| **Commercial invoice (capture, not generate)** | Recorded as a customer document | Pacred *stores* the invoice the customer/supplier supplies for the customer's customs file — attachment + key fields. Pacred does not author customs values. | ✅ stored customer doc — **no value engineering** |

> **Identity-clean reminder.** The packing list and the close-manifest are *measurements* — what the warehouse physically weighed and measured. The commercial invoice is *captured* — a document the customer brings. Pacred never produces a `declared_value`/`vat_plan` artifact. The legacy "แผน2 VAT" practice ([`cargo-ops-forensics`](../audit/cargo-ops-forensics-2026-05-16.md) §3.5) is **explicitly excluded** from every print output here.

---

## 8. Integration with what exists — no disruption

| Existing thing | How the China-ops system touches it |
|---|---|
| `cargo_containers` / `cargo_sacks` / `cargo_shipments` / `cargo_shipment_tracking` | **Same tables.** China ops adds columns (additive) + writes rows as a new `source`. The customer portal + TH warehouse read them unchanged. |
| `lib/warehouse/*` clients | **Reused.** `actions/cn/*` wraps them with `cn_warehouse` RBAC + warehouse-scope checks. A few helpers extended (`buildContainerCode` route letter; new `next_shipment_code()`). |
| MOMO JMF sync ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §8) | **Coexists.** Transition period: some containers `source='momo'`, some `source='pacred'`. The customer never sees the difference. Post-transition the MOMO cron is retired for containers Pacred closes itself. |
| `/admin/warehouse/*` (TH) | **Unchanged.** `warehouse` (TH) role keeps full access. The TH warehouse still receives the container, unloads, scans — its flow starts at `in_transit → arrived`. |
| `/admin/containers` (legacy `0016` table) | **Untouched.** Long-term consolidation is V3 territory ([`container-centric-model.md`](../architecture/container-centric-model.md)). |
| `freight_shipments` (`0050`) | **Linked, lightly stretched** — `cargo_containers.freight_shipment_id` (G6). V2 may add a dedicated `container_freight_legs` table if consolidated-freight needs diverge. |
| `is_admin()` RLS pattern, `withAdmin()` action wrapper, `logAdminAction` audit | **Reused throughout.** Every `cnX` action logs an audit row + revalidates. New `cn_warehouse` role slots into the existing `admins.role` CHECK. |
| `proxy.ts` middleware, `[locale]` i18n | `(cn)` route group is just another route group — middleware + locale already handle it. `zh` locale is a later, additive option. |

---

## 9. Build phases

Revenue-lens caveat ([AGENTS.md](../../AGENTS.md) §2): this whole system is **post-launch, volume-gated** — it pays off when Pacred's cargo volume justifies its own China warehouse. It is *not* an emergency-sprint item. It should be scheduled when the owner decides the volume is there. Phases below assume that decision is made.

| Phase | Scope | Deliverable | Rough effort |
|---|---|---|---|
| **CN-0** | ก๊อต ADR — lock the `cn_warehouse` role + `warehouses` table + `(cn)` route-group decision + the `freight_shipments`-vs-`container_freight_legs` call. | An ADR (extends [ADR-0011 RBAC](../decisions/0011-erp-rbac-granular.md)). | ~0.5 d |
| **CN-1** | Migration `0073` — `warehouses` + `admin_warehouses` tables, `cn_warehouse` role, `cargo_sacks` status/closed_by, `cargo_containers` closed_by/manifest_snapshot/freight_shipment_id/origin_warehouse_id, RLS + warehouse-scope policies. | Schema foundation. | ~1 d |
| **CN-2** | Migration `0074`/`0075` — `cargo_shipments` dimension + receive columns, `cargo_parcel_photos`, `cargo_boxes` table + `next_shipment_code()` helper. `lib/warehouse/*` extensions (boxes client, code-gen route letter). | Data model complete. | ~1.5 d |
| **CN-3** | `(cn)` route group + `layout.tsx` + RBAC gate + `/cn` dashboard. `actions/cn/*` skeleton. Tablet-first shell. | China staff can log in to a scoped workspace. | ~1.5 d |
| **CN-4** | Receive desk `/cn/receive` — `cnReceiveGoods`, customer/order resolve, box generation, photo upload, discrepancy flag. | Goods receive works (G2). | ~2 d |
| **CN-5** | Measure + barcode `/cn/shipments/[code]` — `cnMeasureShipment`, dimension capture + sanity guard, barcode + label print views. | Measure + barcode + print (G3 + §7 labels). | ~2 d |
| **CN-6** | Sacks `/cn/sacks` — create / pack / `cnCloseSack`. Sack label print. | Close-sack workflow (G4). | ~1.5 d |
| **CN-7** | Containers `/cn/containers` + close ceremony — `cnCloseContainer`, the checklist, `manifest_snapshot`, the 装柜明细 close-manifest print. | **Close-container (ปิดตู้)** — the headline (G5 + §7 manifest). | ~2.5 d |
| **CN-8** | Freight handoff — `cnHandToFreight`, `cargo_containers.freight_shipment_id`, carrier pick, cascade to `in_transit`. | China→freight seam closed (G6). | ~1.5 d |
| **CN-9** | Packing-list + commercial-invoice capture; `zh` locale messages for the China portal; integration tests for the full receive→close→handoff lifecycle. | Polish + i18n + tests. | ~2 d |

Total ≈ **18–20 dev-days** after the CN-0 ADR. CN-1→CN-2 are the schema spine; CN-3 unblocks all UI; CN-4→CN-8 are the workflow in physical order; CN-9 is polish. Each phase is independently shippable behind the `cn_warehouse` role (no customer-facing surface changes until the China warehouse actually goes live).

---

## 10. Open questions for ก๊อต / เดฟ

1. **Role granularity** — one `cn_warehouse` role, or split receive-desk vs packer vs container-closer? Recommend **one role** for V1 (small China team); split later if needed.
2. **`warehouses` scope on RLS** — confirm the `admin_warehouses` join-table approach for scoping `cn_warehouse` staff to their warehouse. Alternative: a single `warehouse_id` column on `admins` (simpler, but no multi-warehouse staff). Recommend the join table.
3. **`freight_shipments` reuse vs new `container_freight_legs`** — V1 reuses `freight_shipments` for the carrier job (one container = one row, house account). Confirm acceptable, or commission `container_freight_legs` now.
4. **`source` enum value** — add `'cn_warehouse'` to the `cargo_*.source` CHECK, or let China-ops write `'pacred'`? Recommend a distinct `'cn_warehouse'` value for clean provenance during the MOMO-coexist period.
5. **`zh` locale** — V1 ships the China portal in `en` (fallback). Confirm whether a `zh` messages file is wanted at launch or deferred to CN-9/later.
6. **Shipment-code format** — `next_shipment_code()` format `PSC<YYMMDD>-<seq>` proposed. Confirm the prefix/shape (warehouse staff print + scan it).
7. **Volume trigger** — at what cargo volume does the owner greenlight the China warehouse? This whole backlog is gated on that business decision, not on engineering readiness.

---

## 11. Cross-references

- 🏗 Container/sack/shipment spine → [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 🤝 MOMO container-close + lifecycle decode → [`docs/research/momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md)
- 🚚 CargoThai/TTP carrier model + scrape → [`docs/research/ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md)
- 🔬 Cargo ops decoded (GZE/GZS, A/M/X/O/Z, close-container flow, 装柜明细) → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
- 👷 Warehouse role + China-warehouse-partner vision → [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md) §12 / §16
- 🧑‍💻 ภูม backend brief (CT-1..CT-8 warehouse spine tasks) → [`docs/briefs/poom.md`](../briefs/poom.md)
- 🔐 RBAC ADR (where the `cn_warehouse` role decision lands) → [`docs/decisions/0011-erp-rbac-granular.md`](../decisions/0011-erp-rbac-granular.md)
- 🚢 Freight value model (the freight-team decision this doc does NOT extend) → [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md)
- 🗄 Migration runbook → [`supabase/migrations/README.md`](../../supabase/migrations/README.md)
- 🛑 Don't scrub MOMO/CargoThai/TTP refs early → [`docs/runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)

**End of design.** The container spine is built; this doc designs the China origin of the loop — the staff portal, the receive→measure→barcode→close-sack→close-container→hand-to-freight workflow, and the freight seam — so that when Pacred owns its China warehouse it owns the whole chain, end to end, with a tracking timeline that starts the minute goods hit the shelf.
