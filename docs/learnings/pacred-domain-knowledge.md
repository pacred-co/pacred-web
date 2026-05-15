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
