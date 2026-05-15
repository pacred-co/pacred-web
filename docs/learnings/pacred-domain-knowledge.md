# Learnings — Pacred domain knowledge

Topics: cargo flow business logic · juristic vs personal customers · sales rep referral commission · container life cycle · MOMO + ไอแต้ม + TTP brand-split implications.

---

## [2026-05-16] MOMO JMF canonical 9-status enum (port verbatim, don't invent)

**Context:** Implementing the container model + MOMO sync. Need to know what container statuses MOMO actually returns vs what Pacred wants to display.

**Source:** PCS DEV LINE chat 2026-05-02 — TISO (พี่แต้ม) shared the API endpoint + the exact 9 status strings MOMO returns:
```
https://api-cn.alilogisticshub.com/?api=container-list
```

**The 9 canonical values:**
```
loading_container         ← China warehouse packing into the container
ek_left_china_border      ← truck/road: departed China border (Ek = EK route)
ek_arrived_vietnam_border ← truck/road: at Vietnam border
in_transit                ← generic transit (also sea-truck combo)
sea_leaving_china         ← sea: departed Chinese port
sea_arrived_thailand_port ← sea: at TH port (e.g. Laem Chabang)
ek_arrived_mukdahan       ← truck/road: at Mukdahan border (TH entry)
unloading_in_thailand     ← unloading at TH warehouse
unloaded_completed        ← all shipments out, container retired
```

**Mapping to Pacred `cargo_containers.status`** (per migration 0033, see `lib/integrations/momo-jmf/types.ts::MOMO_STATUS_TO_PACRED`):

| MOMO status | Pacred status | Customer label (TH) |
|---|---|---|
| `loading_container` | `packing` | กำลังจัดเข้าตู้ |
| `ek_left_china_border` | `in_transit` | ออกจากจีนแล้ว |
| `ek_arrived_vietnam_border` | `in_transit` | ถึงด่านเวียดนาม |
| `in_transit` | `in_transit` | ขนส่งกลางทาง |
| `sea_leaving_china` | `in_transit` | ออกจากท่าจีน |
| `sea_arrived_thailand_port` | `arrived` | ถึงท่าไทย |
| `ek_arrived_mukdahan` | `arrived` | ถึงมุกดาหาร |
| `unloading_in_thailand` | `unloading` | กำลังลงตู้ |
| `unloaded_completed` | `closed` | ลงตู้เสร็จสมบูรณ์ |

**Why this matters next time:**
- **Don't invent statuses.** Staff are trained on these exact 9 values. New values = staff retraining + comms break.
- When a customer asks "ตู้ฉันอยู่ไหน?" — the answer comes from one of these 9 values. Translate to Thai customer-facing label, never show the raw `ek_*` enum.
- MOMO might add new statuses without notice — defensive code: default to `in_transit` for any unknown MOMO value + log to Sentry for ก๊อต to add to mapping.

**Cross-links:**
- [`lib/integrations/momo-jmf/types.ts`](../../lib/integrations/momo-jmf/types.ts) — `MOMO_STATUS_TO_PACRED`
- [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) §"MOMO canonical status enum"
- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner integration spec

---

## [2026-05-16] Cargo loop architecture — both shop-order AND forwarder need pay-from-wallet

**Context:** Designing the cargo revenue loop.

**The two parallel flows:**

```
ฝากสั่งซื้อ (shop-order — China-shop intermediary):
1. customer creates service_order (PR0xxxx member)
2. admin reviews items + sets total_thb → status=awaiting_payment
3. customer pays from wallet → status=ordered → date_ordered stamped
4. admin orders from China shops → admin advances status (awaiting_chn_dispatch → completed)
5. customer downloads receipt PDF

ฝากนำเข้า (forwarder — cargo container shipping):
1. customer creates forwarder request
2. admin reviews + sets total_price → status=pending_payment
3. customer pays from wallet → status=shipped_china (admin handles physical dispatch)
4. status advances through state machine: shipped_china → in_transit → arrived_thailand → out_for_delivery → delivered
5. customer downloads receipt PDF
```

**Critical design pattern: both flows use the same wallet_transactions table with different `kind` values:**
- shop-order pay: `kind = 'order_payment'`, `reference_type = 'order_header'`, `reference_id = h_no` (e.g. `ONS260516-01`)
- forwarder pay: `kind = 'import_payment'`, `reference_type = 'forwarder'`, `reference_id = f_no` (e.g. `F260516-01`)

This means: **idempotency check is keyed on `(reference_type, reference_id, kind, status='completed')`** — never `(profile_id, amount, kind)` because the same customer might have multiple orders of the same amount.

**Why this matters next time:**
- New cargo-loop additions (e.g. yuan-transfer fees, tax invoice fees) → same pattern: pick a new `kind` value + use a `reference_type` that maps to a parent table.
- Don't try to consolidate into a single "payment" action — the state-machine target column differs (`service_orders.status` vs `forwarders.status`) + the post-pay status differs (`ordered` vs `shipped_china`).
- Customer-side `payXFromWallet` actions are intentionally separated for clarity; admin override (`adminMarkXPaid`) mirrors them.

**Cross-links:**
- `actions/service-order.ts::payServiceOrderFromWallet`
- `actions/forwarder.ts::payForwarderFromWallet`
- `actions/admin/service-orders.ts::adminMarkServiceOrderPaid` (admin override)
- `lib/notifications/templates.ts::WALLET_KIND_LABEL` — all 11 wallet kinds + Thai labels
- [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) §"Cargo loop"

---

## [2026-05-16] Container schema coexistence — `containers` (legacy 0016) AND `cargo_containers` (new 0033)

**Context:** Migration 0033 introduced `cargo_containers` per the container-centric-model design. But migration 0016 (older) already created a `containers` table with a DIFFERENT shape (ops-tracking — `container_no`, `vendor_container_id`, `vessel`, `carrier`, `origin_warehouse`, `transport_type`, status enum preparing/sealed/.../cancelled).

**Why both exist:**
- `public.containers` (0016) — legacy ops tracking; used by `/admin/containers/*` page + `forwarders.container_id` FK + `service_orders.container_id` FK
- `public.cargo_containers` (0033) — new container-centric spine with `cargo_shipments` / `cargo_shipment_tracking` / `cargo_container_status_history`. Used by future `/admin/warehouse/*` + MOMO sync.

**They serve overlapping but distinct purposes:**
- `containers` = how cargo container is tracked in PCS-legacy ops view (single row per container, status enum is the legacy 7-value)
- `cargo_containers` = how container fits in the new spine (shipments breakdown per customer + MOMO 9-status enum + per-shipment tracking events)

**Why I chose to coexist (not consolidate):**
- Consolidating risks breaking the existing `/admin/containers` page + the forwarder.container_id link
- Migrating data between schemas is non-trivial (status enum mapping, column renames)
- For V2 owner-pleaser scope (per ADR-0010), don't risk live functionality for a redesign
- Long-term consolidation deferred to V3 territory

**Mapping (for anyone confused):**

| Concept | 0016 column | 0033 column |
|---|---|---|
| Container code | `container_no` | `code` |
| Transport mode | `transport_type` (truck/ship/air) | `transport_mode` (truck/sea/air) |
| Origin | `origin_warehouse` (guangzhou/yiwu) | `origin` (free-text city/code) |
| Status values | preparing/sealed/in_transit/arrived_port/cleared_customs/delivered/cancelled (7) | packing/sealed/in_transit/arrived/unloading/closed (6) — maps from MOMO 9-status enum |
| Customer linkage | via forwarders.container_id FK | via cargo_shipments table |
| ETA | `eta`, `date_in_transit`, etc. (date_-prefixed) | `eta`, `actual_arrival`, `packed_at`, `sealed_at` |

**Why this matters next time:**
- When ภูม implements T-P2 (container customer view), use `cargo_*` tables. The existing `/admin/containers` page stays on `containers` (legacy).
- If you need to show "where's my container?" to a customer — query `cargo_containers` + `cargo_shipments`.
- If you need admin daily ops tracking — `containers` is the existing flow (manual entry).

**Cross-links:**
- [`supabase/migrations/0016_phase_h_upgrades.sql`](../../supabase/migrations/0016_phase_h_upgrades.sql) — legacy
- [`supabase/migrations/0033_containers.sql`](../../supabase/migrations/0033_containers.sql) — new (with hotfix renaming to `cargo_*` prefix)
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — design + table-name mapping note
- Commit `936dff7` — 0033 hotfix that caught + prevented this collision

---

## [2026-05-16] Decoded cargo/freight ops model — from 10 real China-cargo documents

**Context:** เดฟ handed over 10 live spreadsheets + the ไอแต้ม (legacy dev) chat.
Decoding them gave the *real* cargo/freight data model — knowledge no training data
has. Full narrative + problem catalog → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md).
The terse facts a future agent needs:

**Container & code scheme:**
- `GZE{YYMMDD}-{seq}` = Guangzhou **truck** container · `GZS{YYMMDD}-{seq}` = **sea** container (เดฟ confirmed). Truck route: Pingxiang → Vietnam/Laos → Mukdahan. Sea: Nansha → Laem Chabang.
- `A{YY}{seq}` (e.g. `A2600200036`) = single-consignee **freight job** number.
- For freight, **the commercial invoice number = the container code** (`INV no = GZE260328-1`).
- A container has **two identifiers**: the Pacred code (`GZE260407-1`) *and* the carrier's physical container number (`BLOU2025012`, `SLVU4871649`) — keep both, linked.
- Box barcode `CG#########[-NNN]` (`-NNN` = box within a parcel). Receipt no `FRC{YYMM}-{NNNNN}-{N}`. Cargo customer = `PCS#####`. ฝากสั่งซื้อ order = `P#####`.

**Two business lines, one container namespace:**
- **Cargo** (LCL consolidation) — many `PCS#####` customers' parcels per container, billed per parcel by weight or CBM. PHP modelled this.
- **Freight** (FCL, single consignee) — one importer, full Commercial Invoice + Packing List + Form E + D/O. **PHP never modelled this — it runs on loose Excel today.**

**⚠️ Cargo-type taxonomy is INCONSISTENT between the two legacy systems** — same Chinese/Thai label, different latin code:

| label | PCS API "Shipment Report" | warehouse manifest (装柜明细) |
|---|---|---|
| ทั่วไป (general) | `A` | `G` |
| มอก. electrical | `M` | `T` |
| อย. drug/food | `O` | `F` |
| พิเศษ brand-name | `X` | — |
| ควบคุม controlled | `Z` | — |

→ Pacred must pick **one** canonical enum and map both legacy sets onto it (task V-D2).

**Two CBM gotchas (revenue-critical):**
- The same container measures different CBM in 3 places: PCS-API-on-receipt, "รวมคิว" (queue-sum), and the China "ปิดตู้" manifest. **Real case GZE260422-1 = 16.79 vs 21.28 CBM** — customers dispute the bill. Store CBM *per source* and show the diff before billing (V-D1).
- "ตัดตู้" (assign parcels → container) **fails silently unless the container close-date (วันที่ปิดตู้) is set first** — the report filters by close-date only.

**Freight invoice data corruption:** legacy invoice spreadsheets carry **int32-overflow garbage** in a numeric field — values like `-2146826265` / `-2146826273` (≈ −2³¹). Range-guard *every* numeric import (V-E5).

**"แผน VAT" = invoice value engineering:** freight invoices have alternate VAT-plan sheets — the **declared customs value is intentionally decoupled** from the real commercial value, VAT 7% computed on the declared figure. Model `real_value` / `declared_value` / `vat_plan` as separate fields — never conflate (V-E2).

**The legacy backend is MongoDB** — the PCS API "Shipment Report" export filename embeds a MongoDB ObjectId.

**Why this matters next time:**
- Building any cargo/freight feature → start from [`cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) + PORT_PLAN Part V, not from scratch.
- Withholding tax (หัก ณ ที่จ่าย) is unmodelled in legacy and is the #1 accounting pain — see V-A6.
- The whole legacy stack (China API + server + SMS) bills through one freelancer (ไอแต้ม) — single point of failure; finishing the migration *is* the mitigation (V-F1).

**Cross-links:**
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — full narrative + problem catalog A–F
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V — task backlog V-A1…V-F3
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — the `cargo_*` schema spine

---
