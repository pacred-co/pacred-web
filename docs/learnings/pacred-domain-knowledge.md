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

## [2026-06-12] The 3-number cargo model is DATA-flowing, not status-flowing — seed forward or the editors render empty

**Context:** The cargo tax-invoice platform captures THREE prices that must never conflate — SELLING (CS → invoice + VAT), COST (Pricing → PEAK stock-in), DECLARED/มูลค่าสำแดง (Docs → ใบขน). The per-line COST+DECLARED editor (`cargo-cost-line-editor.tsx`, mig 0158 columns) was structurally correct but rendered **EMPTY** in practice — it inited only from the null mig-0158 columns, and nothing seeded the cost basis the order had already computed one section above.

**The insight (audit `docs/research/cargo-cost-declared-workflow-audit-2026-06-11.md` · GAP 1):** the chain is **status-flowing, not data-flowing** — every node (order → cost → declared → ใบขน → ใบกำกับ → PEAK) has the right number available, but nobody threads it forward. The fix is almost never "add a query/column"; it's **pure threading**: pass the already-loaded order figure down as an editable *seed*. Once cost is actually captured this way, the downstream gaps (declared-default, profit panel, margin-VAT, PEAK rollup) all become real — GAP 1 is "the first thread."

**The auto-fill-then-editable seed pattern (reusable):**
- Seed the draft from order data **only when the stored column is empty** (`isEmptyStored()` — null/""/0). **Stored value ALWAYS wins** (never override a real saved figure).
- A field is "on auto" while `draft === autoSeedString` (the moment staff types, it's their override — chip drops). No extra state needed; it's derived during render.
- Flag it ("ออโต้ — แก้ได้" chip) so staff know it's a suggestion, and **persist ONLY on Save** (confirm-before-mutate §0f). Opening + immediately saving banks the auto value — that's the intended "auto-fill then editable" behaviour, not a bug.
- Keep the math in a **pure, tested helper** (`lib/forwarder/cargo-cost-autofill.ts`) separate from the editor — the seeds are display-only and must never touch the money path (§0e).

**The cargo seed formulas (faithful to the audit · pin these):**
- **SHOP** (tb_order ¥): `autoCostUnit = cprice` (the ¥ *selling* unit — flag it "จากราคาขาย, แก้เป็นต้นทุนจริง" so staff don't bank selling-as-cost) · `autoCostRate = tb_settings.hratecostdefault` · `autoDeclared = roundUp2(cprice × rate × qty)` (round UP — a declared/customs value should never under-state).
- **IMPORT** (tb_forwarder_item ฿): `autoCostUnit = none` (tb_forwarder_item has only qty+CBM — no faithful per-unit cost) · `autoCostRate = hratecostdefault` · `autoDeclared = round2(fcosttotalprice × qtyShare)` where `qtyShare = lineQty/Σqty`. Note `fcosttotalprice` has an authoritative external writer (the ไอแต้ม container-cost-sheet sync) — READ it, never write (§0e dead-write trap avoidance). Inexact splits drift a satang (100/3 → 99.99) — acceptable for a per-line editable seed, not a balanced ledger; pin it in a test so a future "make-it-balance" change is a conscious decision.

**Cross-links:** the 10-gap workflow audit (`cargo-cost-declared-workflow-audit-2026-06-11.md`) · `lib/forwarder/cargo-cost-autofill.ts` + its test · the cargo-acct epic master (`docs/research/cargo-acct-epic-2026-06-11/_MASTER.md`) — GAP B forwarder badge was done there; the newer audit's GAP 2 is the SHOP-side badge still missing.

---

## [2026-06-12] The customer rate tier is keyed on coID — and 'PCS'→'PR' rebrand was a silent rate-killer

**Context:** owner asked to rebrand the default company code `coID='PCS'` → `'PR'` ("เปลี่ยนที่เป็น PCS เป็น PR ให้หมด"). Started from ภูม's report that customer PR009 showed **"ไม่มีเรต"** on `/cart` price-estimate.

**The 3-tier rate model (pin this — `lib/forwarder/resolve-rate.ts` + 4 resolver call-sites):** every customer resolves a forwarder rate through exactly one of three buckets, most-specific-wins:
1. **SVIP** — a per-user card exists in `tb_rate_custom_*` (probe by `userid`). Flat ฿/kg + ฿/cbm.
2. **General/default** — `isGeneral` is true → tiered card in `tb_rate_g_kg`/`tb_rate_g_cbm` (3 tiers by value). This is THE default bucket.
3. **VIP-group** — everything else → flat card in `tb_rate_vip_*` keyed by the customer's `coID` (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN / VIP1-5 / PRO*).

**Root cause of "ไม่มีเรต":** `isGeneral` was a strict literal `coID === 'PCS'` in all 4 resolvers (`forwarder-quote.ts`, `forwarders-edit.ts`, `quote-multimode.ts`, `quote-comparison.ts`'s inverse `coid !== 'PCS'`). But **new signups already write `coID='PR'`** (`lib/auth/legacy-bridge-tb-users.ts`). So a 'PR' customer failed `=== 'PCS'` → fell through to the **VIP-group** branch → looked up `tb_rate_vip_*` WHERE coid='PR' → no card → **ไม่มีเรต**. 43 native-'PR' customers were silently rate-broken in prod before the rebrand even started.

**The fix = a deliberate, central sentinel — NOT a blind find-replace.** `'PCS'` has FOUR unrelated meanings in this codebase; only ONE is the company tier:
- ✅ `coID/coid === 'PCS'` — the company/general-tier code → **rename to 'PR'** (this task).
- 🚫 `fShipBy/hShipBy/addressID === 'PCS'` — รับเองที่โกดัง (self-pickup) → **DO NOT TOUCH**.
- 🚫 `PCSF` / `PCSE` — Flash/EMS ship-by promos → **DO NOT TOUCH**.
- 🚫 `unit === 'PCS'` — freight line unit (pieces) → **DO NOT TOUCH**.
A blanket `sed s/PCS/PR/` would have broken shipping + freight. Solution: one module `lib/forwarder/coid.ts` (`GENERAL_COID='PR'` + `isGeneralCoid()` accepting 'PR' | legacy 'PCS' | empty), and surgically swap only the tier-decision sites to use it.

**The safe-cutover design (money path · "ห้ามทำงานบัค"):** a data rename across 8,742 customer rows + the rate card has a deploy-ordering trap (code can ship to prod before the migration applies — the same class as the 0175 prod-gap). Two safety choices made it order-independent:
1. `isGeneralCoid()` accepts **BOTH 'PR' and legacy 'PCS'** as general → a not-yet-migrated row never falls through to VIP.
2. **KEEP the general card lookup as `.eq("coid", coID)`** (the customer's own value), do NOT switch it to a fixed `'PR'` sentinel. Reason: if the migration lags the deploy, the 8,742 'PCS' customers still have `coID='PCS'` + the card is still at `coid='PCS'` → they MATCH and keep working. Blast radius if migration lags = the 43 already-broken 'PR' rows, NOT all 8,785. A fixed-'PR' lookup would have inverted that (all 8,785 break until the card migrates). The migration (`0182`) renames customers + card **atomically in one txn**, so the steady state is always consistent.

**`isVipCoid` is a whitelist, not `!== 'PCS'`** (`earn-trigger-tb-user-sales.ts`): it returns true ONLY for the 4 commission VIP coids. 'PR' isn't in it → already correct → needed NO change. Don't "helpfully" rewrite it.

**The data lived in 4 tables (always survey `information_schema` for EVERY `coid` column before a rename — don't trust the 1-2 you remember):** `tb_users.coID` (8,742) · `tb_co.coID` (1 — the company master, ID 21 'ทั่วไป') · `tb_rate_g_kg`/`_cbm.coid` (16+16 — the general card) · `tb_register.coid` (16,853 — archive, unread by code but renamed for consistency). VIP cards (`tb_rate_vip_*`) had 0 'PCS' rows → untouched. No FK references any coid column (verified via `pg_constraint`), and tb_co's PK is on `ID` not `coID`, so the value rename is free + collision-free (no pre-existing 'PR' in tb_co).

**Verified live (§0c):** PR009 on `/cart`, weight 25kg → ทางรถ ฿500 / ทางเรือ ฿375 (15฿/kg × 25). Was "ไม่มีเรต" before. The rebrand fixed the original bug as a side effect.

**Cross-links:** `lib/forwarder/coid.ts` · migration `0182_coid_pcs_to_pr.sql` · `docs/sprints/save-point-2026-06-11-cargo-acct.md` §coID (the parked analysis this executed) · ADR-0029 (the rate-store SOT ledger) · the "PCS has 4 meanings" trap also bites the [[pacred-design-philosophy]] copy work.

---

## [2026-06-14] Thai shipping ต้นทาง/ปลายทาง pay-method = carrier-derived, NOT a province switch (setPayMethodShip)

**Owner rule (verbatim):** *"ต่างจังหวัด นอกเขต กทม → ให้เขาเลือกขนส่ง เก็บเงินค่าขนส่งปลายทาง · ใน กรุงเทพ → บังคับจ่ายต้นทาง ตั้ง default ไปเลย."* (Upcountry → customer picks a carrier, COD/pay-at-destination · BKK → force pay-at-origin as the default.)

**The trap — there is NO `if(province==BKK) forcePayAtOrigin` in legacy.** The rule is EMERGENT from two composed legacy mechanisms. Any audit hunting for an explicit province→payMethod switch will wrongly conclude "gap":
1. **Carrier-eligibility-by-zip** — the BKK-metro free-shipping zip band only EXPOSES origin-billing carriers (Flash/J&T/PCS), while upcountry exposes the full private-carrier roster (`lib/cart/ship-by-eligibility.ts` + `lib/bkk-zip.ts::isFreeShippingZip`, ports `function.php` L3-9 + `cart/api-shipBy.php`).
2. **Carrier→payMethod** — `setPayMethodShip($fShipBy)` (`pcs-admin/include/function.php` L2839-2843): payMethod=`1` (ต้นทาง) for the **6** origin-billing carriers `{Flash 2, J&T 24, ไปรษณีย์ไทย 11, PCS, PCSF, PCSE}`; default `2` (ปลายทาง) for every other private carrier. Admin can override per-case (`update_fPayMethod`).

So BKK exposes only origin carriers → fed through the map → ต้นทาง; upcountry private carriers → ปลายทาง. **The province behaviour falls out of the carrier list × the carrier map.**

**The bug it hid (§0e duplicated-money-rule trap · fixed this session · `f3062fad`):** the rule was transcribed TWICE — `actions/forwarder-legacy.ts` (ฝากนำเข้า) derived it correctly, but `actions/cart.ts` (shop) wrote `paymethod: input.payMethod ?? ""` **straight from client input** + mirrored to `tb_users.userPayMethod` — so a BKK shop order was NOT force-set to ต้นทาง, and the value could contradict the chosen carrier. **A business rule duplicated across entry points WILL silently diverge** — one path will be the faithful copy, the other an omission. Fix = ONE shared helper `lib/forwarder/pay-method.ts::derivePayMethod(fShipBy)` called by both paths (cart derives from `hShipBy`, the resolved carrier). The forwarder UPDATE path keeps the legacy asymmetry (`forwarder.php` L1590-1592: only stamp payMethod when origin, else leave the stored value alone → `isPayAtOriginCarrier ? "1" : undefined`).

**Faithfulness drift caught (GAP-2):** both inline copies OMITTED carrier id `11` (ไปรษณีย์ไทย) that legacy treats as ต้นทาง — a value-set drift a faithful port shouldn't have. The shared helper restores it. 16-assertion `lib/forwarder/pay-method.test.ts` locks the set.

**Data model — it's CODE-resident, not a DB/spreadsheet table (don't assume a "data model" implies a table):** there is NO `tb_carrier`/`tb_shipby`/carrier-zone/min-charge table (grep'd migrations + the olddata xlsx — none). The carrier roster, the carrier↔province if-chain (`lib/tools/thai-shipby-rules.ts::resolveShipByCarriers`, ports `pcs-admin/check-shipby.php` 1:1 incl. its dup-id quirks), and the carrier↔payMethod map are all TS constants. The only external data is ZIP→province (`raw_database.json`, bundled in `public/legacy/.../jquery.Thailand.js`). DB-backed pieces: the customer default (`tb_users.userShipBy`/`userPayMethod`), the per-order value (`tb_forwarder.fshipby`/`paymethod` · `tb_header_order.hshipby`/`paymethod`), the address, the maomao free-zone whitelist (`tb_address_maomao_free`).

**Flash remote/tourist +50 surcharge:** `lib/tools/flash-price.ts` (added 2026-06-13) DOES port `calPriceFlash` + the พื้นที่ห่างไกล (`$zipCodeRemoteArea`, ~365 zips) + special-tourist-area (~33 zips) arrays — each adds +50฿, surfaced as a separate "รวมราคา +50" line exactly as legacy. BUT it's consumed ONLY by the admin reference tool `/admin/tools/thai-shipping`, **not wired into the customer cart estimate** → the customer-facing surcharge is a flagged Phase-C gap (an editable `tb_carrier_zone` + pointing the cart at `resolveShipByCarriers` is the same Phase-C item · no xlsx import needed).

**Cross-links:** `lib/forwarder/pay-method.ts` · `actions/forwarder-legacy.ts` · `actions/cart.ts` · `lib/cart/ship-by-eligibility.ts` · `lib/tools/{thai-shipby-rules,flash-price}.ts` · `lib/bkk-zip.ts` · the §0e duplicated-rule trap is the same shape as the [[verify-deep-flow]] dead-write traps · the 8-screen deep-read this folds into = `docs/research/legacy-admin-deep-read-2026-06-14.md`.

---

## [2026-06-14] Disbursement cluster — money model + the two TOCTOU classes (cnt-hs container-cost + commission)

**The disbursement model (both clusters, faithful to legacy):** legacy PCS "disbursement" tables (`tb_cnt`, `tb_withdraw_comm_*_h`, `tb_user_sales_admin_pay`) are **REGISTERS of out-of-band bank transfers, NOT in-app money movers.** The "pay" flip (status→'2'/'3' + slip upload) moves ZERO baht in-app — no wallet, no `tb_wallet_hs`, no GL/PEAK side-effect. The transfer-slip image is the only audit artifact; real money leaves via a manual bank transfer. Grep `tb_wallet|tb_cash|tb_ledger|tb_balance|tb_account` across the legacy `cnt-hs.php`/`report-cnt.php` = zero hits. **Implication:** a double-fire of the flip is near-idempotent (benign) TODAY — but the moment a Pacred port wires a ledger/commission/GL entry to the flip, every unguarded flip becomes a double-write. Harden the guard BEFORE adding any money side-effect.

**Two distinct TOCTOU classes — don't conflate them:**
- **CREATE-side double-pay (the dangerous one):** `actions/admin/cnt-payment.ts` enforces "a container is paid once" via `SELECT tb_cnt_item WHERE fCabinetNumber → abort-if-exists → INSERT`, with only a plain index on `tb_cnt_item.fcabinetnumber` (`0109` L192-193), **no UNIQUE**. Two concurrent same-cabinet disbursements both pass the empty-check then both INSERT → container double-paid (two `tb_cnt` + two `tb_cnt_item` rows). Same class as the yuan-refund hole. **Fix = DB UNIQUE + ON CONFLICT, not a code re-read.** (Verify legacy data has no pre-existing dup cabinet rows before applying the UNIQUE, or the migration fails.) The same hole exists on the live commission earn (`tb_user_sales.idf` no UNIQUE) and withdraw-request (`tb_user_sales_pay.idus` no UNIQUE), both verified absent in `0081`/`0082`. **STATUS: open — owner-gated migration (NEXT FREE 0183 + prod dup-precheck).**
- **FLIP-side approve/pay TOCTOU (low risk):** `actions/admin/cnt-hs.ts` (setCntStatus/adminUploadCntSlip) checked `cntStatus==='1'` in a prior SELECT but UPDATEd `.eq('ID', cntId)` ONLY — read-check-act, not atomic. **STATUS: FIXED this commit** — folded `.eq('cntStatus','1')` into the UPDATE WHERE + `.select('ID').maybeSingle()` 0-row abort `(มีผู้ทำรายการพร้อมกัน)` + orphan-slip cleanup on the slip path + added `logAdminAction` (cnt_hs.approve/reject/slip_upload_approve).

**The correct pattern to copy:** `actions/admin/sales-payouts-tb.ts adminMarkSalesPayoutPaidTb` does it right — `.eq('status','2')` folded into the UPDATE WHERE + `.maybeSingle()` 0-row → abort `'มีผู้ทำรายการพร้อมกัน'` + pre-read guard + `window.confirm`. Atomic conditional update = the only deterministic close for a pay/approve flip. Every flip in the cluster should mirror this. (cnt-hs.ts now does.)

**§0e dead-write check — both clusters CLEAN:** every Pacred disbursement write hits a LIVE populated legacy `tb_*` (writer-table == reader-table on every action — `tb_cnt`/`tb_cnt_item`/`tb_cnt_pay_*` read by report-cnt/billing-run/sidebar/CSV; `tb_user_sales*` read by /sales/report + admin queues; the `tb_withdraw_comm_*` batch tables are the REAL 25+46 legacy batches, not 0-row twins). The comm-sale/comm-interpreter pages are **pure read-only MVP — grep-confirmed ZERO insert/update/delete writers to all 4 batch tables** → no double-pay vector by construction (nothing flips status). The big-audit "4,104 earns invisible" §0e dead-write is FIXED (commissions.ts tombstoned + repointed onto live tb_user_sales*).

**Faithful-port traps to avoid when the batch WRITE path is eventually built:** (1) the legacy interpreter twin `listPayCommShops.php` has NO already-claimed guard (the sale twin's `wcsh.status IS NULL` filter) = a real double-accrual bug — port the guard to BOTH; (2) the legacy INSERT trusts client-posted `amount/commBefore/withholding` hidden fields (no server recompute) — always recompute server-side from order data; (3) legacy status '3' ไม่สำเร็จ is dead-write (nothing sets it) — wire a real reject or drop the tab.

**Audit-logging asymmetry (now resolved for cnt-hs):** cnt-payment.ts + report-cnt-cost-update.ts already logged via `logAdminAction`; cnt-hs.ts approve/reject/slip-upload did NOT — the money-confirming click was the least-audited write. Pattern lesson: the disbursement APPROVAL is exactly the write that most needs an audit row. (Added this commit.)

**Cross-links:** `actions/admin/cnt-hs.ts` · `actions/admin/cnt-payment.ts` · `actions/admin/sales-payouts-tb.ts` (the atomic-flip model) · `actions/admin/withdraw-comm-batch.ts` · `actions/commissions-tb.ts` · legacy `pcs-admin/cnt-hs.php` + `withdraw-commission-{sale,interpreter}.php` · same TOCTOU family as the [[yuan-refund]] double-refund lock (`actions/admin/yuan-payments.ts`).

---

## [2026-06-16] ค่าเทียบ = 250 — the CBM/KG sell model is ONE coherent system (250 · 2900 · 4900 · 11), and it collides with migration 0139

**The model (ภูม taught it, source-grounded in `lib/forwarder/resolve-rate.ts` L40-71):** Pacred sells China→Thailand cargo by **CBM (คิว) by default** ("เน้นขายเป็นคิว · คิวถูกกว่าคุ้มกว่า") because **MOMO charges Pacred per CBM** (cheaper for Pacred) — EXCEPT dense goods whose weight outruns their volume, which bill by **KG**. The switch is **ค่าเทียบ (the comparison value) = `tb_users.userComparisonValue`, default 250** — a per-customer KG-per-CBM density break-even:
```
CBMProduct = (fAmountCount==1) ? fVolume : fVolume*fAmount   (legacy forwarder.php L1935-1941)
KGPerCBM   = fWeight / CBMProduct
KGPerCBM >  ค่าเทียบ(250) → bill by KG   (dense · refPrice='1')
KGPerCBM <= ค่าเทียบ(250) → bill by CBM  (default · refPrice='2')
```
⚠️ A **per-order override** (`customComparisonSwitch`) forces the threshold to **200** (fresh order) / **150** (linked refOrder) — NOT 250 (`resolve-rate.ts` `ResolveRateInput.customComparison` · calPriceForwarder L2098-2106). So 250 is the *customer default*, not a hard constant.

**The four numbers are ONE system, not independent knobs — "the 250 bridge":** CBM sell price ÷ 250 ≈ the KG sell price.
- CBM sell (Poom): **เรือ (sea) 2900 · รถ (truck) 4900** THB per 1 CBM. These require opening a **ใบกำกับภาษี with Pacred** (they're the tax-invoice CBM quote, not a guardrail). Sea is **cheaper** than truck.
- Cargo KG floor: **≥ 11 THB/kg**.
- Bridge: `2900/250 = 11.6 ≈ kg floor 11` · `4900/250 = 19.6 ≈ truck kg band`. At density 250 kg/CBM, bill-by-CBM and bill-by-KG **converge** — which is exactly why 250 is the threshold. Change one number and the others must move.

**⚠️ THE TRAP — migration 0139 already stores 2900/4900, but on different axes + as a different KIND of number.** `0139_min_sell_floor.sql` seeds `business_config` key `pricing.min_sell_floor` = `{base:{1:2900,2:4900}, surcharge:{1:0,2:300,3:0}}` where **base is per-WAREHOUSE (1=กวางโจว 2=อี้อู)** and **surcharge is per-MODE (เรือ +300)**, and the whole thing is the **lowest a sales rep may QUOTE** (a hard-warn *floor*, `lib/pricing/min-sell.ts`). Poom's 2900/4900 are per-**MODE** (เรือ/รถ) and are the actual **sell price**. Three disagreements:
1. **Axis** — 0139 keys 2900/4900 to *warehouse*; Poom keys them to *transport mode*.
2. **Sea direction** — 0139 makes เรือ **dearer** (+300 surcharge); Poom says เรือ **cheaper** (2900 < 4900). Opposite.
3. **Kind** — 0139 = a *floor* (don't quote below); Poom = the *quoted price itself*. Floor ≠ price.

**Lesson:** when an owner gives you "obvious" pricing numbers, grep `business_config` + the migrations for those exact literals BEFORE seeding or wiring — the same number can already exist under a *different semantic axis*, and blindly seeding a second copy (or worse, repointing a consumer) creates a silent conflict that mis-prices live orders. Here the right move was a **reference-only DRAFT migration** (`0184_cbm_sell_model_reference.sql`, key `pricing.cbm_sell_model`, `pending:true`, no consumer) that *surfaces* the conflict + 4 open questions for P'Dev — NOT a confident seed. The model is the owner's; the reconciliation (axis · sea-direction · floor-vs-price) is P'Dev's call.

**The CBM DISPLAY bug was separate + already fixed.** Poom's 82.944-vs-MOMO-1.7280 report was Pacred's `totalCbm` ignoring `fAmountCount` and always multiplying `fvolume*famount` — when `fAmountCount==1` ("รวมกล่อง", fvolume is already the total) it must NOT multiply. Fixed in commit `5f035c28`; the live-rate `cbmProduct` (`live-rate.ts` L261-264) already follows the legacy `fAmountCount==1 ? fvolume : fvolume*famount` convention. Don't confuse the display fix with the sell-price model.

**Cross-links:** `lib/forwarder/resolve-rate.ts` (the ported ค่าเทียบ waterfall · authoritative code home) · `lib/forwarder/live-rate.ts` L261-300 (cbmProduct + userComparison read) · `lib/pricing/min-sell.ts` + `supabase/migrations/0139_min_sell_floor.sql` (the conflicting floor) · `supabase/migrations/0184_cbm_sell_model_reference.sql` (this session's DRAFT-for-P'Dev) · note `docs/learnings/pacred-cargo-tax-invoice-flow.md` says "1CBM=300KG" — **superseded:** current canonical ค่าเทียบ = 250 (per-customer, override 200/150).

---

## [2026-06-18] Forwarder COST is NOT a SELL waterfall — it's a 144-cell tb_settings matrix, computed at report-cnt (or live now)

**Context:** ภูม asked why the forwarder detail cost/profit panel showed ต้นทุน 0 / "ยังไม่บันทึก", whether Pacred even has cost-rates, and what the "144-cell cost matrix" is. Owner wants ต้นทุน + กำไร "เหมือน PCS เป๊ะ". Built option A (live cost compute) → commit `71997363` (Poom-pacred).

**The cost model (distinct from the SELL ค่าเทียบ waterfall in `resolve-rate.ts`):**
- COST has **no waterfall, no per-customer tier, no ค่าเทียบ**. It's a flat **144-cell matrix on `tb_settings`**: 9 carriers (CTT/Sang/MK/MX/JMF/GOGO/CargoCenter/MOMO) × 2 transports (รถ/เรือ) × 4 product types (ทั่วไป/มอก./อย./พิเศษ) × 2 cities (กวางโจว ""/อี้อู "2") = 144 columns `fcost{car|ship}{1..4}default{carrier}{citySuffix}`.
- Editor: **`/admin/settings/forwarder-costs`** (commit 73b958ad · `costs-model.ts` is the canonical column-name builder). Real values live on prod+dev (฿2,400–13,000/CBM); MANY cells are 0 = "carrier×mode×type×city not set" → cost 0 (NEVER guess).
- **basis:** Sang(wh '1') + MX(wh '4') bill by **weight** (× fweight); every other carrier by **CBM** (× fvolume). `cost = round2(dimension × rate)`.
- **The authoritative cost engine = `actions/admin/report-cnt-detail.ts`** `warehouseSegment()` (column map) + `calcRowCost()` (the port of legacy `calPriceForwarderCost()`). It writes `tb_forwarder.fcosttotalprice` when the ตู้ "คิดเรท" runs. **Accounting/PEAK books `fcosttotalprice`** — it is the authoritative cost.

**Why "ต้นทุนไม่แสดง":** the detail panel only READ `fcosttotalprice`, which stays 0 until report-cnt runs (or the matrix cell is 0). Fix (option A, faithful to PCS forwarder.php which computes cost live): new **`lib/forwarder/resolve-cost.ts`** byte-mirrors report-cnt's warehouseSegment + calcRowCost; the panel reads the header dims + the one matrix cell, computes `liveCost`, and shows `คิดตามปริมาตร/น้ำหนัก {dim} x {rate} = {cost}`.

**Money-safety nuance (adversarial review caught it):** a container that was MANUALLY custom-rated (report-cnt "คิดเรท" with a non-default basis) stores an `fcosttotalprice` that can DISAGREE with the live default-basis figure. So `displayCost` precedence = **live wins, BUT when stored>0 and |live−stored|>฿0.01 → prefer the STORED (accounting-authoritative) value + amber reconcile note** — never let the panel's กำไร silently contradict the booked cost. resolve-cost intentionally does NOT model legacy's MX weight-vs-CBM max() tier or Sang W×L×H (faithful to the simplified report-cnt port).

**Lesson:** COST and SELL are TWO separate engines on Pacred. SELL = `resolve-rate.ts` (per-customer tier + ค่าเทียบ 250 waterfall). COST = the flat 144-cell `tb_settings` matrix read by `report-cnt-detail.ts`. Don't conflate them; the forwarder detail page now shows both (sell buckets → sellNet; matrix → cost; กำไร = sellNet − cost). Verified: order 52028 MOMO·เรือ·กวางโจว cbm 0.04646 × rate 2500 = ต้นทุน 116.15, กำไร 55.75.

**Cross-links:** `lib/forwarder/resolve-cost.ts` + `.test.ts` (38 asserts · this session) · `actions/admin/report-cnt-detail.ts` (the canonical cost engine) · `app/[locale]/(admin)/admin/settings/forwarder-costs/costs-model.ts` (144-cell column builder) · `app/[locale]/(admin)/admin/forwarders/[fNo]/forwarder-cost-section.tsx` (ForwarderProfitPanel — the live wire) · [[resolve-rate]] is the SEPARATE sell engine.

---

## Container codes + the forwarder↔shop-order link + cargo flow (2026-06-19)

**Container/cabinet code → transport mode (owner-confirmed SOT · I had EK wrong).**
`GZS / *SEA*` = ทางเรือ (sea) · `GZE / *EK*` = ทางรถ (road) · `GZA / *AIR*` = ทางอากาศ (air).
**EK is ROAD, not air** — I assumed air and the owner corrected it. Canonical decode:
`lib/forwarder/cabinet-transport.ts` (+test). The NAME is authoritative; the stored
`tb_forwarder.ftransporttype` is unreliable ("อย่าหลงเชื่อข้อมูลผิดๆ"). **Lesson: domain
codes come from the owner/legacy, never guessed — verify a decode before shipping it.**

**The forwarder↔shop-order link has TWO mechanisms (don't assume reforder).**
- `tb_forwarder.reforder = tb_header_order.hno` — set ONLY by the spawn-from-order path
  (`service-orders-spawn.ts`).
- `tb_forwarder.ftrackingchn = tb_order.ctrackingnumber` (→ that order's hno) — for
  forwarders **MOMO created** (their `reforder = ""`). This is the common real case.
Any code linking the two MUST try reforder OR the tracking — the shared helper is
`lib/admin/advance-linked-shop-order.ts`. The status-sync stuck-order bug (P22314 ↔
forwarder #52075) was exactly this: #52075 was MOMO-made with reforder="" so the
reforder-only propagation never fired. `[[forward-only-fix-trap]]` applies too — a
logic fix doesn't backfill existing rows.

**fstatus IS the cargo flow pipeline** (1 รอเข้าโกดังจีน · 2 ถึงโกดังจีน · 3 กำลังส่งมาไทย ·
4 ถึงไทยแล้ว · 5 รอชำระเงิน · 6 เตรียมส่ง · 7 ส่งแล้ว). The shop order mirror: hstatus
4 (รอร้านจีน) → 40 (ถึงโกดังจีน, mig 0185) when the forwarder reaches fstatus ≥ 2.

**The real cargo operation (from the LINE chats · `docs/research/cargo-ops-automation-plan-2026-06-19.md`):**
China shop → MOMO consolidation (กวางโจว) → container → TH → Pacred warehouse: scan
(ยิงเข้าระบบ) + measure (kg + W×L×H→CBM, off the box sticker) + box-count → bill
(CBM×rate, or kg if kg>คิว) → collect (juristic WHT 1%, individual none) → ส่งเหมาๆ /
รับเอง. The #1 pain = price hand-calculated + can't bill in-system (scan→measure→cost→bill
not auto-connected); biggest manual burden = the PCS↔Pacred tracking leak (no tool).

---

## [2026-06-19] Build A billing guards — the ฿0-transport under-charge + the satang invariant + the comparison zero-CBM SOURCE leak

**Context:** Build A = make scan→measure→cost→bill auto so sales don't hand-calc + kill the money leak. The measure→auto-price chain already ships (เดฟ: `warehouseMeasure` → `computeAndFillForwarderImportRate` auto-prices `ftotalprice`). I closed the two billing-side gaps on `/admin/billing-run/add` (commits `14984280` D1 + `42dd6279` D2 · Poom-pacred).

**D1 — the ฿0-transport billing guard.** A forwarder row can reach the ใบวางบิล with its import transport SELL (`ftotalprice`) still **฿0** (never measured, OR measured weight-only under comparison pricing). `calcForwarderOutstanding` then bills 0 transport — a **silent under-charge**. Fix: flag any selected row with `ftotalprice<=0` (amber "⚠️ ค่าขนส่ง ฿0" badge), a §0f confirm naming the #ids, and a **server-side recompute** (`createBillingRunInvoice` re-reads the DB rows) that REFUSES unless `allowUnmeasured` is set — the client only sends the ACK boolean, so it can't be bypassed. Money-review learning: the signal must be **`ftotalprice<=0`** (the persisted transport SELL), NOT the raw dimensions `fweight<=0 && fvolume<=0` — the dimension check misses the comparison weight-only case (see SOURCE leak below).

**D2 — per-line bill-amount override ("แก้มือได้ทุกจุด").** The "ยอดค้างชำระ" cell is now an inline number input; typing overrides just that row. `overrides: z.record(z.string(), positiveMoney)` (NOT coerce → a non-number is rejected, not silently 0). Server `lineAmount(id) = override ?? auto`, used identically for the header `subtotal_thb` AND each item `amount_thb` so they reconcile; stray keys (not in `forwarderIds`) are ignored; overrides are audit-logged (`line_amount_overrides: auto_thb vs billed_thb`). D1↔D2 reconcile: a ฿0-transport row the admin POSITIVELY overrode (>0) is excluded from the refusal (it's handled).

**THE SATANG INVARIANT (money-review caught a real medium).** `tb_forwarder_invoice` (mig 0138) asserts `subtotal_thb == Σ items.amount_thb`. If you sum **unrounded** line amounts and round the TOTAL once, but store each item **round-each**, then a `>2dp` override makes round-each-then-sum ≠ sum-then-round → a 1-satang drift that violates the invariant. **Rule: quantize EACH line to satang BEFORE summing** (`lineAmount = round2(override ?? auto)`), on BOTH server and the client subtotal `useMemo`, so header == Σ items always. `positiveMoney = z.number()` does NOT quantize to 2dp and an HTML `step="0.01"` is not enforced for typed/pasted values — never assume the input is already 2dp.

**THE SOURCE leak (still open · flagged to ภูม · D1 contains it).** `resolveForwarderRate` (`lib/forwarder/resolve-rate.ts`): for a **weight-only measure under comparison pricing**, `cbm=0` → `kgPerCbm = cbm!==0 ? weight/cbm : 0` = 0 → `0 > threshold` false → falls to the **bill-by-CBM** branch with `value=cbm=0` → `transportSubtotal = round2(0 × rate) = 0` and `rateMissing = (rate===0)` is **false** (the unit rate is >0). So `computeAndFillForwarderImportRate` persists `ftotalprice=0` **silently** — its `rateMissing || rate<=0` backstop doesn't fire. The reviewer's source fix = treat `transportSubtotal===0` as `wrote:false` (like rateMissing) so a zero-basis never persists ฿0 — this would protect EVERY caller (MOMO sync · manual create · measure), not just billing. **Decision — ภูม 2026-06-19: leave it at the source; do NOT touch the shared auto-pricer.** D1's billing guard is sufficient (it catches it at the only point money is actually collected); the source fix isn't worth the blast radius across 3 shared write paths. Don't re-open this — the source ฿0 persist is a known, contained behavior, not a bug to chase.

**Cross-links:** `actions/admin/billing-run.ts` (`createBillingRunInvoice`) · `lib/validators/admin-billing-run.ts` · `app/[locale]/(admin)/admin/billing-run/add/billing-run-add-client.tsx` · `lib/forwarder/live-rate.ts` (`computeAndFillForwarderImportRate`) · [[resolve-rate]] (the SELL engine where the source leak lives) · `docs/research/cargo-ops-automation-plan-2026-06-19.md` (Build A spec).

---

## [2026-06-19] Wallet → direct-cut: the "เติมเงิน" model is gone; pay-per-service-by-slip is the new spine

**Owner directive (decisive):** kill the wallet **top-up** model. Customers no longer pre-fund a wallet balance; they pay **each service directly by slip** → accounting verifies the slip (2-layer review) → **ตัดจ่าย** (settle). The wallet OBJECT stays (balance display, withdraw, refunds, history, cashback-as-checkout-discount); only the customer **self top-up** entry is removed. Both verify steps = **accounting** (owner: "บัญชีเลยดีกว่าครับ ทั้ง 2 step เลย จะได้ไม่ต้องลีลากัน").

**What this means concretely (the map that's now load-bearing):**
- **ฝากโอนหยวน (yuan)** — was a wallet-vs-slip choice. Now slip-only: the form posts to `actions/payment.ts::createYuanPayment` → `tb_payment(paystatus='1' รอตรวจ, paydeposit='0')`, **no wallet movement**. The admin yuan queue (`adminUpdateYuanPayment` / `adminBulkApproveYuanPaymentsTb`) settles `paystatus 1→2` with **no wallet touch** — that IS the direct-cut settle, it already existed. `createYuanPaymentFromWallet` (the wallet-debit-at-submit path, type='6') is kept intact but **unwired** from any UI.
- **ฝากนำเข้า/forwarder** — already wallet-DISABLED (`forwarder.php $walletTotal=0`): slip-only, pending tb_wallet_hs row, admin confirms. No change.
- **ฝากสั่งซื้อ/shop** — slip-pay = type='8' (delta=0, no wallet move) + optional wallet-discount. Already direct-slip-capable.
- **Top-up entry removal** = surface work: `/wallet/deposit` route → redirect to `/wallet`; remove the LIVE links (pcs-icon-grid tile, pcs-left-menu, floating-action-menu, yuan-form). Several were already hidden by the owner 2026-06-07. Admin manual-credit (`adminCreateWalletHsManual`) + admin approve of historical pending top-ups are UNAFFECTED.

**Audit-discipline catch (trust-but-verify an agent's §0e claim):** an understand-phase agent reported `createYuanPayment` writes a "rebuilt table" (= a §0e dead-write the admin queue can't see). Reading the source proved that was **stale** — the file was fixed (2026-05-29 F2 / 2026-06-05 §0e cleanup) to write `tb_payment` end-to-end (its own header documents the fix). Had I trusted the agent, I'd have re-pointed a working slip path and broken it. **Rule: a "rebuilt-table dead-write" claim must be confirmed against the file's CURRENT `from("…")` target before acting — these get fixed over time and the agent may be reading an old mental model.** See [[verify-deep-flow]] · the §0e family in [[php-port-patterns]].

**Cross-links:** `actions/payment.ts::createYuanPayment` (the live slip lane → tb_payment) · `actions/payment-tb.ts::createYuanPaymentFromWallet` (unwired wallet lane) · `actions/admin/yuan-payments.ts` (settle) · `app/[locale]/(protected)/service-payment/yuan-payment-form.tsx` · `lib/admin/duplicate-slip-check.ts` (the restored slip-verify ชั้น-1).

---

## [2026-06-19] The forwarder SELL-rate flow + the per-warehouse hard sell-FLOOR (ภูม) — and the 3 distinct ฿/CBM numbers nobody must conflate

**Context:** ภูม dropped the authoritative MOMO invoice (`INV-20260618-0004`, ฮุย ไท่ ต๋า / HUI TAI DA) + แต้ม's Google-Sheet packing list, and reshaped how the forwarder pricing editor should work end-to-end. Built across `3cfb3ece` (preview pulls profile rate) + `06d34711` (hard floor).

**The rate FLOW (this is the canonical sell path — burn it in):**
1. **เซลตั้งเรทส่วนตัวต่อลูกค้า** on `/admin/customers/[id]` → ⚙️ "ตั้งค่าเรทขนส่ง (เรทขายต่อลูกค้า)" modal (`rate-editor.tsx` → `adminSaveCustomerRate` → live tables `tb_rate_custom_kg`/`tb_rate_custom_cbm`, the SVIP tier). 8 cells per warehouse (KG·รถ/KG·เรือ/CBM·รถ/CBM·เรือ × ทั่วไป/มอก./อย./พิเศษ).
2. **ระบบดึงเรทส่วนตัวมาคิดอัตโนมัติ** in the forwarder per-tracking editor — the "ราคานำเข้าจีน-ไทย" preview now calls `resolveLiveForwarderRate` (the SAME engine the save uses, `customRateSwitch:false`) so it shows the REAL number, NOT ฿0. **CBM is the default basis** (per ค่าเทียบ); both คิดตามน้ำหนัก + คิดตามปริมาตร lines should show numbers.
3. **บัญชีเช็คราคานำเข้า vs MOMO invoice** — if weird, the seller tells accounting the real sell rate → accounting ticks **"คิดราคาแบบกำหนดเอง"** and overrides the rate directly, matching what MOMO billed (per-single-tracking, the "ราคานำเข้าจีน-ไทย" line of the invoice PDF).
4. **ลูกค้าไม่มีเรท → ติ๊ก "คิดราคาแบบกำหนดเอง"** (manual is the EXCEPTION, not the default).

**⚠️ THREE different ฿/CBM numbers — never conflate (this was the trap):**
- **COST** = what MOMO charges Pacred = **2,500/CBM** (the ฮุย ไท่ ต๋า invoice · mig 0194 · per-tracking, e.g. 1780103566-3 = 0.98 CBM × 2500 = ฿2,450 · sub-total incl VAT 7% + WHT 1%).
- **SELL FLOOR** = the lowest a customer may be SOLD at = ภูม's **กวางโจว รถ4900/เรือ2900 · อี้อู รถ5500/เรือ2900** (= cost + minimum margin). This is a **per-(warehouse × mode) RATE floor (฿/CBM), same for all product types**. It is NOT the cost; it is NOT the old `COST_FLOOR` 5300/3300 figures (those were stale → replaced).
- **min_sell_floor** (`business_config pricing.min_sell_floor`, mig 0139) = a SUBTOTAL floor (base+surcharge, advisory) — a SEPARATE, older concern. ภูม's floor is a per-cell RATE floor, so it lives in `COST_FLOOR` (`lib/admin/customer-rate-tables.ts`), NOT in min_sell_floor. Don't try to fit ภูม's 4 explicit per-warehouse values into the base+surcharge shape — it's algebraically impossible (both warehouses' เรือ = 2900 but รถ differs 4900/5500).

**The HARD-block + GRANDFATHER pattern (money-safety without breaking workflows):** `adminSaveCustomerRate` + the modal now BLOCK a sell rate below floor ("ห้ามขายต่ำกว่าราคาขั้นต่ำ · จะ VIP แค่ไหนก็ห้าม"). But they **grandfather** an unchanged legacy below-floor cell (compare entered vs existing DB value on the server / entered vs `seeded` on the client) — only a NEWLY-set below-floor value blocks. Without this, a seller editing an old SVIP customer (whose legacy รถ rate is below the new 4900 floor) would have EVERY unrelated save rejected = `งานหาย`. The #1 guardrail ("ห้ามทำงานบัค งานหาย") is why hard-block must grandfather, not blanket-reject.

**Who can do what (role model ภูม confirmed):** floor applies to **everyone** (block below). **Accounting IS the `ultra` role** → the manual "คิดราคาแบบกำหนดเอง" override on the forwarder editor is intentionally NOT floor-blocked (accounting must be able to match MOMO's actual charge, even below floor). **warehouse** staff cannot edit ค่าเทียบ or the floor. Editing the floor VALUE itself = `ultra` only (inline where it's shown — no separate page; "ก็แค่ ultra แก้ได้ จะมาสร้างปุ่มสร้างหน้าทำไม").

**SEA0x is NOT a container number.** `PR20260605-SEA03` / `PCS…-SEA01` / `MO…-SEA02` on a tb_forwarder row = the **MOMO routing-batch ID** (written by `propagate.ts` before the container closes). The REAL container lives on `momo_import_tracks.container_batch_no` (e.g. `GZS260601-1`), the sack on `momo_sack_no` — joinable by `momo_container_no` = the SEA0x value. The propagate cron swaps SEA0x→real once the container closes, so a SEA0x still on a row = a not-yet-closed container → show the **sack number** ("เลขกระสอบ") meanwhile. **แต้ม's (iTAM) packing list is the authority for container + ETD/ETA** ("MOMO ชอบมั่ว") — use MOMO only to compare/fallback.

**Why this matters next time:** any "the price shows ฿0 / ไม่มีเรท" report → check whether the surface is RESOLVING the profile rate (live-rate engine) or only echoing a stored/manual field. Any "floor / ขั้นต่ำ" task → confirm you're flooring the RATE (per cell) vs the SUBTOTAL, and which of the 3 numbers (cost 2500 / sell-floor 2900+ / min_sell_floor) is meant. Any container-number bug → SEA0x is a batch, not a container; the real one is in `momo_import_tracks` after close. Any hard-block on existing data → grandfather it or you break legacy-row edits.

**Cross-links:** `lib/admin/customer-rate-tables.ts` (COST_FLOOR per-warehouse) · `actions/admin/customer-rate.ts` (hard-block+grandfather) · `lib/forwarder/live-rate.ts` (the resolver the preview re-uses) · `lib/admin/momo-container-resolve.ts` (SEA0x→real) · mig 0194 (MOMO cost 2500) · the [[domain_pricing_cbm_kg_model]] memory · `docs/research/cargo-pricing-spec-2026-06-16.md`.

---

## [2026-06-20] MOMO cost is ALREADY per-tracking — the "เก็บเป็นตู้→แทรคกิ้ง" ask was already the model (verify before rewriting a money model)

**Owner ask:** "เปลี่ยนจากเก็บเงินเป็นตู้เป็นเก็บเป็นแทรคกิ้งแทน" (change MOMO cost collection from per-container to per-tracking) + dropped the ฮุย-ไท่-ต๋า invoice `INV-20260618-0003` (which bills Pacred PER-TRACKING — each line = one ftrackingchn · KG/CBM/qty/total · 2,500/CBM · sub-total − WHT 1% = grand total).

**What a workflow map (3 readers) + reading the actual code proved:** the per-tracking cost model is **already the ONLY cost model** — there was nothing to rewrite:
- `tb_forwarder.fcosttotalprice` = the cost, **per forwarder row = per tracking**. ALL profit/margin/P&L reports read it (never a per-container aggregate).
- MOMO invoice ingestion (`actions/admin/momo-invoice-ingest.ts` + `/admin/api-forwarder-momo/invoice-cost`) parses the invoice per-tracking, matches `ftrackingchn`, writes `fcosttotalprice` per row.
- `lib/forwarder/resolve-cost.ts` computes per-tracking from the `tb_settings` 2,500/CBM matrix (mig 0194).
- The container ค่าตู้ payment modal (`cnt-payment-modal.tsx`) **already** pre-fills the amount from `Σ costSum` (= Σ per-tracking `fcosttotalprice` of the selected cabinets) — container is just the grouping label (`fcabinetnumber`).
- `tb_cnt`/`tb_cnt_item`/`tb_cnt_pay_*` = a DISPLAY/REGISTER of out-of-band batch payments (cntAmount = a manual "ยอดเบิก" header, NOT the cost source) — consistent with the 2026-06-14 disbursement-cluster audit.

**The real gap = VISIBILITY, not the model.** The owner's "per-container" mental model was outdated; the system was already per-tracking underneath. The right deliverable was to make it EXPLICIT (label the ค่าตู้ amount as "ต้นทุนต่อแทรคกิ้ง รวมตามตู้ · ตรงกับใบแจ้งหนี้ MOMO" + show แทรคกิ้ง count), NOT to "rewrite" a working money model — which would have risked breaking the live cost/profit/P&L chain for zero gain ("ห้ามทำบัค งานหาย").

**Rule:** when an owner asks to "change X from per-A to per-B" on a money flow, FIRST map what the code actually does (a workflow + read the write paths + the consuming reports). The model may already be per-B; the perception gap is often a VISIBILITY/labeling gap, and the safe fix is to surface the existing per-B granularity, not re-architect a working ledger. Cross-links: `lib/admin/momo-invoice-parser.ts` · `actions/admin/report-cnt-cost-update.ts` · `app/[locale]/(admin)/admin/report-cnt/cnt-payment-modal.tsx` · the [[verify-deep-flow]] discipline.

## [2026-06-21] The "เติม-แล้วจ่าย" import-payment pair = 2 tb_wallet_hs rows for ONE payment

An import (ฝากนำเข้า / forwarder) payment in the legacy wallet model writes a PAIR of
`tb_wallet_hs` rows, NOT one:
- **TOPUP** row — `type='1'`, `amount=+X`, **carries the slip** (`imagesslip`), `reforder2=null`,
  note "ชำระเงินพร้อมชำระฝากนำเข้า (เจ้าหน้าที่ทำรายการแทนลูกค้า)".
- **PAY** row — `type='4'`, `typeservice='2'`, `amount=X` (debit-half), **no slip**,
  `reforder=<forwarder fid>`, `reforder2=<the topup row id>`, note "ชำระฝากนำเข้า #<fid> (เติม-แล้วจ่าย)".

Both have `status='1'` + `amount>0`, so a naïve pending-slip queue (`status='1' AND amount>0`)
lists BOTH → the SAME customer + amount appears on 2 rows. The owner reported this 3–4× as
"ทำไมขึ้น 2 แถว · แถวเดียวดิ" — it kept being "fixed" with thumbnails/detail/guards AROUND it
while the 2 rows remained.

**The fix that actually moves the symptom (admin/page.tsx topup case):** collapse the pair to
ONE row = the slip-bearing TOPUP; DROP the pay-half (`type==='4' && reforder2`); tag the kept row
with the pay-half's forwarder# ("ชำระค่าฝากนำเข้า #F…"). Dedupe the badge count too
(`.or("type.neq.4,reforder2.is.null")`). Same-amount pairs collapse; a customer's two
*different-amount* payments correctly stay separate.

**Bigger picture (owner "ถอด wallet ทุกจุด"):** the whole topup+pay pair is the legacy
wallet-pass-through (credit then debit = net 0). The new model is direct-cut: import payment =
ONE `type='8'`-style slip (delta-0, no wallet). Converting `submitForwarderPayment` to emit a
single direct-cut row (not the pair) is the upstream fix; the pending pairs + PR130's −646
unbalanced wallet need a dry-run + accounting (see `docs/research/pay-and-accounting-gap-2026-06-21.md` §A1).

**Process lesson (→ skill `session-continuity`):** when the owner points at a screenshot, the
deliverable is THAT screenshot changing. Reproduce the exact visible symptom on the LIVE page +
probe the prod data to find WHY (here: 2 rows = a wallet_hs pair) BEFORE coding, and re-verify on
the live page AFTER deploy. A green build is not "done"; the owner seeing 1 row is.

## [2026-06-22] ฝากสั่งซื้อ → ฝากนำเข้า handoff: the shop order COMPLETES (สำเร็จ) when its import is linked

The ฝากสั่งซื้อ (shop order · tb_header_order) and ฝากนำเข้า (import · tb_forwarder) are TWO
services with a handoff, not one long status track:
- **ฝากสั่งซื้อ** = order from the China shop + get the goods to Pacred's China warehouse. Its
  lifecycle ends THERE. hstatus: 1 รอดำเนินการ · 2 รอชำระเงิน · 3 สั่งสินค้า · 4 รอร้านจีนจัดส่ง ·
  40 ถึงโกดังจีน · **5 สำเร็จ** · 6 ยกเลิก (SOT: `lib/admin/service-order-status.ts`).
- **ฝากนำเข้า** = take the goods China→Thailand→delivery. fstatus: 1 รอเข้าโกดังจีน · 2 ถึงโกดังจีนแล้ว ·
  3 กำลังส่งมาไทย · 4 ถึงไทยแล้ว · 5 รอชำระเงิน · 6 เตรียมส่ง · 7 ส่งแล้ว (SOT:
  `lib/admin/forwarder-status.ts`).

**The recurring bug (owner reported 3-4×): the shop order sat stuck at "ถึงโกดังจีน (40)" forever**
even though its goods had already become an active import. Root: `advanceLinkedShopOrder` only ever
advanced 4→40, never →5. There was NO 40→5 transition anywhere (the warehouse barcode scan can set 5,
but the forwarder-link path never did).

**Fix (owner-aligned):** once the linked forwarder import reaches China warehouse (fstatus ≥ 2 =
ถึงโกดังจีนแล้ว), the ฝากสั่งซื้อ has handed off → it COMPLETES `{4,40}→5 (สำเร็จ)`; the import's own
fstatus then carries the tracking (the shop detail shows a "ฝากนำเข้าที่เชื่อมโยง" card linking to it,
on BOTH customer + admin now). The link resolves two ways: `tb_forwarder.reforder = hno` (spawn path)
OR `tb_forwarder.ftrackingchn = tb_order.ctrackingnumber` (MOMO-created rows have reforder=""). Both
callers (manual `actions/admin/forwarders.ts` + MOMO `propagate.ts`, statusGate default-ON) already
gate fstatus≥2 → only the helper changed.

**Lesson:** when two services hand off, the upstream one must COMPLETE at the handoff, not mirror the
downstream's full status — else it looks "stuck" while the work is actually progressing elsewhere.
Surface the bridge (a linked-card with a click-through) on every role's detail so nobody wonders
"where did the order go?".

## [2026-06-23] China→Thailand freight price: legacy has TWO formulas that DISAGREE (preview ≠ save) — the SAVE is "ราคามากสุด" (max), and that is the money

**Context:** ภูม flagged the /admin/forwarders/[fNo]/edit page as "มั่ว" (confusing) on a real 6-tracking
MOMO order (1780103566 · custom rate 11฿/kg, 3300฿/CBM): it showed THREE freight numbers and he
couldn't tell which is the charge or whether it matches legacy — "นี่แย่มากนะเรื่องเงินนะ".
  - คิดตามน้ำหนัก (whole order): 306 × 11 = **3,366.00**
  - คิดตามปริมาตร (whole order): 1.23756 × 3300 = **4,083.96**
  - "ระบบเลือก คิดตามราคาสูงสุดต่อแทรคกิง (รวมทุกแทค)" → **4,324.05**  ← the one used

**The legacy truth (read from source — there are TWO code paths that compute it DIFFERENTLY):**
1. **PREVIEW** — `pcs-admin/include/pages/forwarder/calPriceNew.php` L197-209 (the live AJAX as the admin
   types): per the SINGLE row passed, `KGPerCBM > 250 → คิดตามน้ำหนัก, else → คิดตามปริมาตร` (a ค่าเทียบ-250
   DECISION, hardcoded 250, NOT a max).
2. **SAVE** — `pcs-admin/include/pages/forwarder/update.php` → `forwarder.php update_data` L1983-2010 (what
   actually writes `tb_forwarder.fTotalPrice`): with comparison OFF it is **"ราคามากสุด"** — compute BOTH
   `priceKg = weight×rateKg` and `priceCbm = cbm×rateCbm`, **pick the MAX** (ties → CBM). With comparison ON
   it is `KGPerCBM > threshold` (threshold on the ORDER-TOTAL ratio, ภูม 2026-06-18). PER ROW; a split order =
   N tb_forwarder rows each priced independently, summed.

So **legacy's own preview (250-decision) and save (max) DISAGREE** — a legacy quirk. The SAVE is the money.
Our port `lib/forwarder/resolve-rate.ts` `resolveForwarderRate` (L359-409) is a faithful port of the SAVE:
comparison-OFF → max, comparison-ON → threshold. So **our stored ftotalprice (Σ per-row = 4,324.05) is
CORRECT / legacy-faithful — the customer was NOT mis-charged.**

**Why per-row max and the 250-decision COINCIDED for this order (4,324.05 both ways):** they differ ONLY when
a row's KGPerCBM sits in the (250, rateCbm/rateKg) zone — and for custom rates 11/3300 that pivot is 300, so
the divergence window is 250–300. This order's per-tracking KGPerCBMs (212, 201, 224, 673, 540, 346) all fell
OUTSIDE 250–300 → max == 250-decision row by row → 4,324.05 identical. With a row at e.g. KGPerCBM 270, max
would bill volume (higher) while the 250-decision bills weight (lower) → they'd diverge.

**Why it LOOKED มั่ว (the real, display-only problem):** the per-tracking editor (`per-tracking-editor-client.tsx`)
shows the WHOLE-ORDER weight (3,366) and WHOLE-ORDER volume (4,083.96) reference lines, but the chosen value is
the PER-TRACKING-max SUM (4,324.05) — which equals NEITHER whole-order line. Three numbers, the picked one
matching none → reads as a bug. The fix (ภูม deferred to เดฟ) is DISPLAY-ONLY: show the per-tracking breakdown
(each แทรค: weight-price vs volume-price → which won) so 4,324.05 is self-justifying; drop/relabel the
misleading whole-order lines. No money-math change — the math is already legacy-faithful.

**Lesson:** a legacy system can have two price formulas (a live preview vs the persisted save) that quietly
disagree — when verifying "is our money right?", port and trust the SAVE path, and treat the preview as just a
hint. Before declaring a money number wrong, find the legacy code that WRITES the column (not the one that
previews it). And a confusing money DISPLAY (3 numbers, the chosen one matching none) erodes trust even when
the stored value is correct — surface the actual basis breakdown, don't show reference numbers that aren't the
charge. Cross-link: [[sell-floor-rate-model]] · `lib/forwarder/resolve-rate.ts` · `per-tracking-editor-client.tsx`.

## [2026-06-26] Driver-batch "จุดส่ง" grouping MUST key on userID, not address alone

**Context:** `/admin/drivers/[id]` (รายละเอียดรอบส่งคนขับ) — ภูม flagged PR7429 + PR10190 (สองลูกค้าคนละคน) ยุบรวมเป็นจุดส่งเดียว และ "ผู้รับ" โชว์ placeholder "คุณรับที่โกดัง Pacred" แทนชื่อลูกค้า.

**Symptom:** two different customers (different `userid`) collapsed into ONE delivery stop; the ผู้รับ line showed the warehouse self-pickup placeholder, not the customer name. Both name AND address rendered wrong because one stop block covered two customers.

**Root cause:** our stop key used the `fAddress*` fields ONLY. Orders committed without a real delivery address all carry the SAME warehouse placeholder (`faddressname="รับที่โกดัง Pacred"` + identical warehouse address), so the address-only key collided → different customers merged. (Old MOMO/commit rows from before the 2026-06-25 "เลิก default รับเองโกดัง" fix.)

**Legacy truth (`forwarder-driver.php`):** the create/assign grouping keys on `CONCAT(userID, fAddressName, …)` — userID FIRST (L918, `ORDER BY userID, fAddress…` L924). The detail page groups by full address (~L1670) but that works only because legacy driver batches always carry a REAL recipient address (self-pickup PCS/2/4 → a separate tab). Pacred's data has placeholder addresses → must key userID-first like the create page.

**Fix (`7ed874bf`):** add `f.userid` to the stop key (drivers/[id]); add `isWarehousePlaceholder()` → when `faddressname` is the warehouse placeholder, show the customer's `tb_users` name as ผู้รับ + a "⚠️ ยังไม่ระบุที่อยู่จัดส่ง" warning and hide the warehouse address. Same recipient fix on the work (mobile) page.

**Why this matters next time:** ANY "group by recipient/address" over `tb_forwarder` MUST include `userid` in the key. Placeholder/empty addresses are common (MOMO/commit defaults), and an address-only key silently merges unrelated customers — a data-correctness bug that *looks* like a display bug.

**Audit-discipline reminder:** the follow-up deep-audit (Explore agent) flagged 5 "gaps" — 4 FALSE (auto-timeout cron `expire-driver-assignments`, route-order in `create-batch-form`, photo upload Wave 12-B, ส่งไม่ได้-reason via `prompt()` ALL already exist; the agent read the pages but not the cron / create-form / action). Verify every claimed gap against `actions/` + `lib/` + `app/api/cron/` before building — the driver/warehouse system is faithful + ~complete. Cross-link: [[audit-discipline]] · `drivers/[id]/page.tsx` · legacy `forwarder-driver.php` L918/L924.

## [2026-06-26] Thermal label print (/admin/forwarders/print) — get the PHYSICAL spec + legacy source FIRST

**Context:** ภูม printing the address label (`?type=address`) on his Easy Print thermal printer (a 4"/100mm head) — it came out wrong many ways across a long back-and-forth.

**Symptom / saga (each a wrong guess on my part):** portrait too tall → "แนวตั้ง ควรเป็นแนวนอน" · landscape 150×100 → "ปริ้นไม่ติด ยังเกิน" (150mm content > 100mm paper) · CSS `rotate(90deg)` in `@media print` → "ขวางกระดาษ + เละ + หมึกจาง" (Chrome print mangles `transform`+`@page`+page-break AND scales it down → thin → faint) · 100×75 → wrong size for his stock.

**Root cause:** I kept GUESSING the label size + fighting browser-print CSS instead of (a) asking the physical label size and (b) reading the legacy source. Two facts I should have nailed on turn 1:
1. **The physical label = 100×150mm PORTRAIT** (ภูม's stock: Easy Print, 350/roll). The legacy PCS label was a DIFFERENT size — `printAll.php` case "4" uses mPDF `'format' => [100,75]` = 100×75 landscape. Same brand-of-thing, different stock → never assume the legacy size carries over.
2. **The legacy layout** (faithful, §0b): ผู้ส่ง/From + เลขที่/แทรกกิ้ง (top row) · ถึง/TO + full address (middle, the big centrepiece) · ขนส่ง + จำนวน (bottom). The legacy fills its label densely (mPDF `shrink_tables_to_fit`), which is why it "ดูดี" vs my sparse 100×150-with-tiny-fonts ("เละ").

**Fix / answer (commit `1f57a41e`):** `@page size: 100mm 150mm` matching the real stock; recipient address is the dominant element (`text-[6.5mm]`, vertically centred via `flex flex-col justify-center` on the TO row) so it FILLS the label (no sparse gap = the "เละ" complaint); no rotation, no scaling → prints crisp + aligned. Print dialog must be **Paper = the exact label size · Margins = None · Scale = 100%** (Margins:Default eats the printable area → content splits to extra pages — that was the "8 pages / ยังเกิน"). "หมึกจาง" on a thermal printer = the printer's **Darkness/Density** setting (or thermal paper loaded coated-side-away-from-head), NOT a CSS issue — tell the user to crank it.

**Why this matters next time:** for ANY print/label work — **establish the physical media size + the printer's print width FIRST** (ask the user or read the spec image), and **read the legacy print source** (`printAll.php` etc. — mPDF `format`/`width`/`height`/font sizes are the SOT), before touching CSS. Browser-print `transform: rotate` + `@page` + page-break is unreliable for thermal labels — prefer an upright page that matches the media exactly (or a true server-side PDF at the exact format, which is what legacy mPDF does and why it's reliable). A sparse-looking label usually means the dominant field (recipient) is too small — make it big + fill, don't add whitespace.

**Cross-links:** `app/[locale]/(admin)/admin/forwarders/print/page.tsx` · legacy `D:/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/printAll.php` (case 1 = box label `[100,75]` · case 4 = address label · case 2 = ใบเสร็จ A4-L · case 3 = ใบส่งสินค้า A4-P) · AGENTS §0a/§0b (legacy = SOT, read source not render).
