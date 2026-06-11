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

## [2026-05-19] Legacy PCS Cargo system — full decode (ภูม's research drop)

**Context:** ภูม did a deep research pass on the legacy PCS Cargo PHP system — the
SOT for the D1 1:1 faithful port. The 4 verbatim research files are in
[`docs/research/pcs-legacy/`](../research/pcs-legacy/_index.md) (`BUSINESS_FLOW.md`,
`PCS_CARGO_COMPLETE_ANALYSIS.md`, `PCS_Cargo_Guidebook_TH.md`, `docs.md`). This is the
synthesized load-bearing knowledge a future agent/dev needs without re-reading 5,500 lines.

> ⚠️ **Stack note:** ภูม's docs sketch a *target* of Next.js 14 + Prisma + NextAuth +
> MySQL. **Pacred's actual stack is Next 16 + Supabase + custom legacy-auth bridge** —
> ignore the Prisma/NextAuth framing. The **business logic, DB schema, status enums,
> calc formulas, and workflows** below ARE authoritative for the port.

### The 3 revenue services (legacy = cargo-only; Pacred extends to freight)

| Service (TH) | What | Fee | Legacy PHP page |
|---|---|---|---|
| **ฝากสั่งสินค้า** Shopping | Customer pastes a 1688/Taobao/Tmall URL → PCS buys on their behalf | 5% (VIP 3%) of product value | `shops.php` / `cart.php` |
| **ฝากนำเข้า** Forwarding | Customer already bought in China → PCS imports it (weight/CBM-priced) | shipping by weight/volume + add-ons | `forwarder.php` |
| **ฝากชำระ/โอน** Payment | PCS pays a Chinese supplier (Alipay/WeChat/bank) for the customer | 3%, min 50 THB | `payment.php` |

### DB schema — the legacy `tb_*` tables (MySQL `pcsc_main`)

The customer-facing spine (full column lists in `PCS_CARGO_COMPLETE_ANALYSIS.md` §5):
- `tb_user` — PK `userID` = `PCS####`; `creditUser` (0=regular,1=VIP), `adminIDSale` (assigned sales), `userStatus` (1/0/2). **Pacred uses `PR###` not `PCS###`.**
- `tb_admin` — `adminType` 1=Super 2=Mgr 3=Section 4=Intern 5=Sales 6=Ops; `adminStatusSale`=commission-eligible.
- `tb_shops` — shopping orders; `sProvider` 1=1688 2=Taobao 3=Tmall 4=Shops 5=Nice; total = `sPriceTotal + sServiceFee + sShipCHN`.
- `tb_cart` — shopping cart, no expiry; same item can repeat with different color/size.
- `tb_forwarder` + `tb_forwarder_item` + `tb_forwarder_img` — import orders (1 header → N items → N images). The header carries **per-status date columns** `fDateStatus2..7` (legacy stamps the time it entered each status — not a separate history table).
- `tb_payment` — yuan-transfer requests; `pStatus` 1=pending 2=processing 3=paid 4=failed 5=refunded.
- `tb_wallet` — running-balance ledger; `wType` **1=topup 2=withdraw 3=payment 4=refund 5=commission 6=adjustment**, `wBalance` = balance AFTER the txn.
- `tb_address` — multi-address per user, lat/long, default flag is app-logic (not a column).
- `tb_account_pcs` — company bank accounts; bankName code 1=Chinese-bank 2=KBank 3=SCB 4=BBL 5=KTB 8=PromptPay.

### Status enums (port these VERBATIM — staff are trained on them)

**Shopping order `sStatus`:** 1 Draft/cart · 2 รอชำระเงิน · 3 ชำระแล้ว/processing · 4 สั่งจากร้านจีนแล้ว · 5 ถึงคลังจีน · 6 ส่งมาไทย · 7 ถึงไทย · 8 กำลังจัดส่ง · 9 สำเร็จ · **0 ยกเลิก**.

**Forwarder order `fStatus`:** 1 Draft · 2 รอสินค้า (tracking entered) · 3 ถึงคลังจีน · 4 ถึงไทย · 5 **รอชำระ** · 6 พร้อมจัดส่ง · 7 กำลังจัดส่ง · 8 สำเร็จ.
→ **Critical:** in the forwarder flow the **pay-point is status 5 — AFTER the goods reach Thailand**, i.e. cargo COD. The customer pays the final (post-actual-weigh) invoice. (This is the inversion the D1 fidelity audit flagged — see `d1-fidelity-workflow.md`.)

### Code maps for the forwarder

- `fWarehouseChina`: 1=Guangzhou 2=Yiwu.
- `fWarehouseName` (partner warehouse): 1=SAI 2=CTT 3=MK 4=MX 5=JMF 6=GOGO 7=CargoCenter 8=MOMO.
- `fTransportType`: 1=Sea 2=Air 3=Express.
- `fShipBy` (TH last-mile): 1=DHL 2=Flash 3=JK 4=Kerry 5=Nim 6=S&J 7=SB 8=SCG.
- `chinaWoodenCrateFeeType`: 1=no crate 2=wooden crate.
- `fRefPrice`: 1=bill by weight, 2=bill by volume.

### Calc formulas (the revenue math — port exactly)

- **Shopping:** `priceTHB = price_cny × buy_rate × qty` → `serviceFee = priceTHB × (VIP?0.03:0.05)` → `total = priceTHB + serviceFee + chinaShipping`.
- **Forwarding chargeable weight:** `CBM = W×L×H/1,000,000` (cm→m³); `volumetricWeight = CBM × {sea 1000, air 167, express 200}`; `chargeableWeight = max(actualWeight, volumetricWeight)`; `shippingCost = chargeableWeight × ratePerKg {sea 25, air 45, express 85}` (rates are *examples* — confirm live ratesheet). Add-ons: crate `CBM×1000`, inspection 200, photo 100, + TH delivery by zone.
- **TH delivery zones:** Z1 Bangkok / Z2 Central / Z3 other / Z4 remote=quote-only. Tiered base by weight + per-kg overage. Free-shipping thresholds: >5k THB→Z1 free, >10k→Z2, >20k→Z3.
- **Payment service:** `serviceFee = max(amountTHB × 0.03, 50)`.
- **4 exchange rates:** เรทลังซื้อ (buy — shopping), เรทโอน (transfer — payment service), เรท Sale, เรท Pro (VIP/bulk). Manual admin entry, history kept.

### VIP credit + agent commission rules

- **VIP-credit eligibility (ALL must hold):** account ≥30 days · ≥10 completed orders · ≥50,000 THB lifetime · 0 payment issues · ID verified. Initial limit = `min(avgOrderValue×2, 10,000)`; max 100,000. Increase by 1.5× if utilization <80% + on-time ≥95% + age ≥90d.
- **Overdue interest:** ≤7d 2% · 8-14d 5% · >14d 10% + credit suspended. Suspend if >14d overdue OR ≥3 missed OR overdue > 50% of limit.
- **Agent commission** is on the **service fee only** (never product cost): tiered by team monthly volume — <50k 2% · <100k 3% · <200k 4% · ≥200k 5%. Min payout 500 THB.
- Customer lifecycle: Lead → New → Active → VIP → (At-Risk → Churned).

### Operational gotchas worth remembering

- **24-hour SLA:** after a shopping order is paid, staff must place the China-shop order within 24h (a tracked KPI).
- **+10% re-quote rule:** in forwarding, if the actual weigh/measure makes the cost rise >10% over the estimate, staff MUST notify the customer to confirm before shipping; the customer may cancel at that point.
- **Cancel policy hardens by stage:** free before payment → fee while processing → **un-cancellable once the China shop has shipped / goods reached the China warehouse**.
- The legacy admin dashboard is a **count-badge cockpit** — every sidebar entry shows a live pending count (e.g. "บริการฝากนำเข้า (273)", "กระเป๋าสตางค์ (8)"). Faithful port must reproduce the badges (see `d1-fidelity-admin.md`).
- **Wallet top-up is slip-upload + manual admin verify** by default (QR auto-verify is the legacy "future" path); withdrawal is always manual finance review.
- Legacy notification fan-out: SMS for every milestone, Email for confirm/invoice/report, LINE for paid + invoice events.

**Why this matters next time:**
- Any D1 Phase-B port of shopping / forwarding / payment / wallet → these enums + formulas are the spec. Don't invent or "improve" — faithful first (owner mandate).
- The forwarder pay-at-status-5 (post-arrival COD) is counter-intuitive vs the shop-order pay-at-status-3 — don't unify the two pay-points.
- `wType`/`sStatus`/`fStatus` are numeric strings in legacy; Pacred's ported schema may differ — when reconciling, this is the legacy source mapping.

**Cross-links:**
- [`docs/research/pcs-legacy/_index.md`](../research/pcs-legacy/_index.md) — the 4 verbatim research files
- [`docs/research/d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) · [`d1-fidelity-admin.md`](../research/d1-fidelity-admin.md) · [`d1-fidelity-workflow.md`](../research/d1-fidelity-workflow.md) — the D1 Phase-B fidelity audit
- [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 direction
- [`docs/learnings/php-port-patterns.md`](php-port-patterns.md) — port mechanics (MySQL→PG, schema mapping)

---

## [2026-05-24] member_code numbering rule — legacy customer base IS the anchor

**Context:** Migration 0100 (the "robust" per-row padder) had the right padding
algorithm but the WRONG ordering — it processed profiles by `created_at`, which
for migrated rows is the *migration timestamp*, not the customer's *true age*.
The result would have pushed legacy customers (น.ส.ภูษิชา PR01, ปาณิศรา PR07)
to new high slots because newer Pacred-web dev accounts (Tadsakorn PR001,
Pond PR007) sat in the canonical padded slots first. Owner's reaction
(2026-05-24, verbatim):

> "ฐานลูกค้าเดิมก็ต้องมาก่อน อย่าไปเปลี่ยนของลูกค้า ส่วนที่มาใหม่ ก็ fill ไป
>  ส่วนเรื่อง staff จะมีอีก table แยกกันอยู่ในฝั่งของหลังบ้าน admin ปะ
>  แยกกันระหว่างลูกค้า และ staff อะถูกแล้ว"

**The rule (canonical):**

1. **Format: `PR` + min-3-digit zero-padded integer.**
   `PR1` → `PR001`, `PR21` → `PR021`, `PR321` → `PR321`, `PR4321` → `PR4321`,
   `PR54321` → `PR54321`. Pad up to 3 digits; longer codes are emitted as-is.
2. **Legacy PCS customers anchor the numbering.** Their original number is
   sacred — never push a migrated customer to a new high slot to break a
   conflict. The conflict resolver pushes the *newer* identity.
3. **New Pacred-web signups fill the lowest vacant slot** across BOTH tables
   (`profiles.member_code` + `tb_users.userid`). Implemented in
   `generate_member_code()` via `generate_series(1, max+1) EXCEPT taken`.
4. **Staff/admin profiles eventually live in a separate back-office table.**
   Until that split lands, staff profiles get pushed to slots > current max
   so they never block a customer slot. Their `member_code` is just a UI
   identifier, not a customer number.

**Cross-table integrity:** for migrated customers,
`profiles.member_code === profiles.legacy_pcs_user_id === tb_users.userid`
post-migration. The legacy-auth bridge ([`lib/auth/pcs-legacy-bridge.ts`](../../lib/auth/pcs-legacy-bridge.ts))
normalizes user input to the padded form so a customer typing `PR1` / `PR01` /
`PR001` all match the same `tb_users.userid = PR001`.

**Migration history:**
- `0090`/`0095`/`0096` — early attempts, all superseded.
- `0097` — baseline min-3-digit pad + cascade backfill.
- `0098`/`0099` — collision resolver V1/V2 (both failed mid-resolve).
- `0100` — "robust" per-row padder but **wrong ordering**; data part deprecated.
- **`0103` (current)** — two-stage: (1) relocate the 17 non-migrated profiles
  blocking PR001..PR099, (2) pad the 31 legacy bare codes in place + cascade
  `userid`/`whuserid`/`subuserid` columns + update `profiles.legacy_pcs_user_id`
  to match. Output diff persisted to `public.member_code_migration_audit`.
- `lib/auth/pcs-legacy-bridge.ts` — `findLegacyUser()` now accepts either
  the padded or raw form for memberCode-kind input.

**Notification list:** `docs/runbook/member-code-changes-0103-2026-05-24.md` —
31 legacy customer codes whose display format changed (PR0X → PR00X).

**Cross-links:**
- [`supabase/migrations/0103_member_code_legacy_anchor_restore.sql`](../../supabase/migrations/0103_member_code_legacy_anchor_restore.sql) — the corrected migration
- [`docs/runbook/member-code-changes-0103-2026-05-24.md`](../runbook/member-code-changes-0103-2026-05-24.md) — customer notification list

---

## [2026-05-24] Legacy bridge MUST use synthetic email, never phone — collision risk

**Context:** Owner tested login flow as PR321 (legacy customer วิสิฐ ศิลปเลิศลักษณ์)
right after the G1-G8 + 0103 push and **got signed in as PR132** (a Pacred-
web admin account also named วิสิฐ — same person, different profile). The
session showed PR132 in the navbar everywhere instead of PR321.

**Root cause — phone collision:**
- Phase-A bulk migration provisioned every legacy customer's `auth.users`
  row with a **synthetic email** (`pcs-legacy-pr<n>@users.pacred.invalid`)
  and **NO phone**. The customer's real phone lives only on
  `profiles.phone` (for SMS notifications).
- The bridge code I started from (pcs-legacy-bridge.ts line 141-153 pre-fix)
  preferred a phone-based credential whenever `tb_users.usertel` was a
  usable Thai number. That preference is **wrong** for the migrated cohort:
  - `createUser({phone})` failed because the migration didn't put the phone
    on the legacy auth user.
  - `signInWithPassword({phone})` resolved to **any auth.users row that
    happened to have that phone** — i.e. a Pacred-web staff/test signup
    that registered with the SAME phone as the legacy customer (same
    person registered twice; or coincidentally same number).
- The audit query found **36+ such phone collisions** between a migrated
  legacy customer and a non-migrated Pacred-web profile. Every one of
  them would have signed in as the WRONG identity through the bridge.

**The fix (2026-05-24):**
- `pcs-legacy-bridge.ts` now **always** uses
  `{ email: legacySyntheticEmail(row.userid) }` as the auth credential for
  the legacy bridge. Phone is reserved for SMS; it never participates in
  auth lookup.
- When `createUser` returns "email already exists" (the normal repeat-
  visit path, since Phase-A already provisioned every legacy auth user
  with a placeholder password), the bridge now **looks up the existing
  auth user via `auth.schema("auth").from("users")`** and force-updates
  its password to the one the customer just typed — already verified
  against `tb_users.userpass`. Without that update, `signInWithPassword`
  would compare against the migration-time placeholder and fail.

**How to apply (future bridge edits):**
- Phone in `auth.users` is **not** the source of truth — `profiles.phone`
  is. Never bridge-auth by phone.
- New auth provisioning paths (e.g. social login + legacy linkage) must
  pre-check `profiles.phone` for collisions before letting two profiles
  share a number, OR keep `auth.users.phone` strictly empty for legacy.
- When debugging a "logged in as wrong user" report, check `auth.users.phone`
  for collisions across `profiles` rows — that's the smoking gun.

**Cross-links:**
- [`lib/auth/pcs-legacy-bridge.ts`](../../lib/auth/pcs-legacy-bridge.ts) — the fixed bridge
- The `password sync to existing legacy auth user failed` warning + the
  `legacy customer signed in via PCS bridge` info log are the verification
  hooks if this ever regresses.

---

## [2026-06-11] MOMO `CG_NO` is the sub-parcel cargo ref — NOT a Certificate of Origin (CO)

**Context:** พี่ป๊อป (owner) reviewing the MOMO Sync preview asked: *"ไอ้ CG_NO นี่มันคือเลข CO ใช่มั้ย หรือไม่ใช่"* — is CG_NO the CO number?

**Answer (verified from source — don't let the "CG" prefix mislead you):** **No.** `CG_NO` (e.g. `CG80622313601`, or a range `CG...769-CG...780`) is MOMO's **per-parcel cargo reference** — the goods-receipt number the MOMO China warehouse mints when a parcel lands. Labelled "เลขพัสดุย่อยจีน" in code; present only on the **import_track** shape (`container_closed`/`sack` carry `momoCgNo: null`). It is an audit/cross-check key against MOMO, nothing more.

Three distinct things people conflate, all different:
- **`CG_NO`** = MOMO sub-parcel cargo ref. Source: `import_track.raw.CG_NO` → `momoCgNo` ([lib/integrations/momo-isolated/mapper.ts](../../lib/integrations/momo-isolated/mapper.ts) L239) → surfaced by `momoRawDisplay().cgNo`.
- **CO / Certificate of Origin (Form E)** = a **customs document** proving China origin for the ACFTA tariff. Handled in a totally separate stack: [lib/customs/form-e.ts](../../lib/customs/form-e.ts) + the freight-invoice `form-e` route, issued at customs-clearance/ใบขน time. Zero connection to MOMO.
- **`tb_co`** = the **company master** (นิติบุคคล), column `coID` — corporate-customer identity, not a document. Yet another unrelated "co".

**Why this matters next time:** the "CG" prefix reads like "Certificate of … " and "CO" is overloaded 3 ways in this domain. When anyone asks "is X the CO number", pin down WHICH co they mean (customs Form-E document vs `tb_co` company id) before answering, and check the actual mapper label/source.

**Cross-links:** [`docs/learnings/customs-brokerage-kit.md`](customs-brokerage-kit.md) (Form E) · `lib/admin/momo-raw-helpers.ts` (`momoRawDisplay` / `flattenMomoRaw` — the Sync preview view-models).

---

## [2026-06-11] MOMO `ship_by` is NOT the physical shipping mode — the cabinet (GZS/GZE) is

**Context:** พี่ป๊อป reviewing the MOMO Sync raw-spread: Import Track shows some parcels `ship_by=รถ`, yet every closed container is `GZS…` (sea). "ทำไม ship_by เป็นรถ แต่ตู้เป็นเรือหมด?"

**The proof (cross-referenced live, not inferred):** Parcel `0004065` (PR099, 869.5 kg) is tagged **`ship_by=รถ`** in import_track. Its container, joined via `container_closed.track_details[].reTrack`, is **`GZS260528-1` = a SEA cabinet**. So a parcel labelled "รถ" physically shipped by **เรือ**. → `ship_by` ≠ the physical container mode.

**What each field actually means:**
- **`ship_by` (รถ/เรือ)** = the per-parcel *requested/tagged* type MOMO records. **Unreliable** — MOMO consolidates by operational reality (a 869 kg parcel goes by sea regardless of the รถ tag), and staff key it loosely.
- **The real cabinet `cid` (`GZS…`=เรือ / `GZE…`=รถ)** = the PHYSICAL truth. This is what the goods actually rode. Lives on `container_closed`; joined back to each tracking via `momo_import_tracks.container_batch_no` (sync.ts step 2.5).
- **`container_no` (`PR…-SEA01`)** = MOMO's *routing-batch* label, NOT a mode (every batch is named "…SEA0X" regardless of รถ/เรือ). The mapper already documents this as "internal routing batch id, not the physical cabinet."
- Why "Container Closed all เรือ": only the GZS (sea) containers had *closed* in that window; the GZE (truck) containers were still open + some รถ-tagged parcels got consolidated into sea containers.

**The fix (commit logic):** `commitMomoRowCore` wrote `tb_forwarder.ftransporttype` from `deriveTransportTypeFromMomoRaw(raw)` (= ship_by) → it could write the WRONG mode (รถ for a sea parcel) → wrong rate + wrong ETA (+7 vs +14 days). Now it prefers the cabinet:
`fTransportType = d.fTransportType ?? deriveTransportTypeFromCabinet(container_batch_no) ?? deriveTransportTypeFromMomoRaw(raw)` — admin override → real cabinet GZS/GZE → ship_by only as last resort (parcel not in a closed container yet).

**Why this matters next time:** for ANY "what mode did this cargo ship" question, trust the **GZS/GZE cabinet**, never `ship_by` or the `SEA`-suffixed routing batch. The Sync raw-spread now surfaces the conflict with a `⚠ ไม่ตรงตู้` badge (ship_by vs joined cabinet) so staff can spot MOMO mis-tags.

**Cross-links:** `lib/admin/momo-raw-helpers.ts` (`deriveTransportTypeFromCabinet` · `deriveModeFromCid` · `buildTrackingCabinetMap`) · `lib/admin/commit-momo-row-core.ts` (the fix) · `lib/integrations/momo-isolated/sync.ts` step 2.5 (the cabinet propagation join).

---
