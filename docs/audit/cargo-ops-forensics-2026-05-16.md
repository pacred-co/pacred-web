# 🔬 Cargo Ops Forensics — ไอแต้ม chat + China cargo documents

> **Captured:** 2026-05-16 · **Source material:** เดฟ handed over 1 LINE chat export
> (the legacy system developer) + 10 real China-cargo spreadsheets pulled from
> live operations. This doc decodes the legacy cargo/freight operating model and
> turns 8 months of pain into a build backlog.
>
> **Read this with:**
> [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V (the task backlog this feeds) ·
> [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) (the schema spine) ·
> [`docs/audit/chat-analysis-2026-05-16.md`](chat-analysis-2026-05-16.md) (7 customer-facing chats) ·
> [`docs/audit/legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) (PHP dead-file sweep) ·
> [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) (partner API) ·
> [`docs/learnings/pacred-domain-knowledge.md`](../learnings/pacred-domain-knowledge.md) (decoded model lands here permanently).

---

## 0. Sources

| # | File | What it is |
|---|---|---|
| chat | `[LINE] การแชทกับ Tam TISO-ai.com` | 8-month chat (Sep 2025 → May 2026) between Pacred accounting (ก้อย/มิ้นท์) and **ไอแต้ม** = "Tam", the freelance developer who built + still runs the legacy PHP system (`TISO-ai.com`). |
| 02 | `gze-260422-…ObjectId.xlsx` | **PCS API "Shipment Report"** — per-parcel export of consolidated-cargo container `GZE260422-1`. Filename ends in a MongoDB ObjectId → the legacy API is **MongoDB-backed**. |
| 08-10 | `广州-…装柜明细 GZS260406-1 / GZE2603028-1 / GZE260407-1` | **China-warehouse loading manifests** (装柜明细) — per-box, produced at the Guangzhou warehouse when a container is packed. |
| 03,04 | `INV_GZE260328-1`, `INV_GZE260407-1 - แผน2 VAT` | Commercial **Invoice + Packing List** for truck containers (single consignee). |
| 05 | `INV_GZS260406-1-DRAFT` | Commercial Invoice + Packing List for a **sea** container. |
| 06 | `INV+PL_A2600200036_Draft` | Invoice + Packing List for a single freight job (medical lasers). |
| 01 | `DRAFT_FE - A2600200036` | **Form E** — ASEAN-China FTA Certificate of Origin (12-box standard form). |
| 07 | `จดหมายเเลกDO406.xls` | **D/O exchange letter** — releases a sea container from the shipping line. |

---

## 1. TL;DR — what we learned

1. **The legacy system has one human single-point-of-failure: ไอแต้ม.** Eight months of chat = the accounting team asking one freelance dev to manually fix data, pull Excels, and roll back statuses — because staff *cannot self-serve anything*. He gets sick, he is slow, and the China product API + server + SMS all bill through him. "จ่ายวันนี้ ไม่งั้นระบบฝากสั่งซื้อใช้งานไม่ได้" — pay today or the shopping system dies. **This is the #1 strategic reason the Pacred migration must finish.**
2. **There are two business lines sharing one container namespace.** Consolidated **cargo** (LCL, many small `PCS#####` customers per container) and single-consignee **freight** (FCL — full Invoice + Packing List + Form E + D/O). The PHP system only ever modelled cargo. Freight is run entirely on **loose Excel files** today.
3. **Container volume does not reconcile.** The same container measures differently in the PCS API ("รับเข้า" CBM), in "รวมคิว" (queue-sum), and in the China warehouse manifest ("ปิดตู้"). Real example below: **GZE260422-1 = 16.79 vs 21.28 CBM**. Customers dispute the bill → revenue stalls.
4. **Withholding tax (หัก ณ ที่จ่าย) is completely unmodelled** and is the single most-repeated complaint in the chat.
5. The legacy invoice spreadsheets carry **int32-overflow data corruption** (`-2146826265`-type garbage) and a confusing two-number receipt identity that throws the VAT return (ภพ.30) out by ฿15,192.

---

## 2. The ไอแต้ม dependency — strategic risk

ไอแต้ม (Tam, `TISO-ai.com`) is **the** legacy developer. The chat is, end to end, a list of things the system *cannot do without him*:

| He is paid for | Evidence |
|---|---|
| Monthly retainer / "ที่ปรึกษา" (~฿15,000) | 5/5/2026 |
| "ค่าทำระบบใน pcs" (system dev) | 31/1/2026 |
| **China product API — annual** ("API สินค้าจีน รายปี") | 31/1, **2/2/2026: "ต้องจ่ายวันนี้ ไม่งั้นระบบฝากสั่งซื้อใช้งานไม่ได้"** |
| Server hosting (3rd-party, 3% fee, pay-or-die) | 20/2, 21/3/2026 |
| System SMS credit | 30/4/2026 |

**Risk:** a sick day, a missed invoice, or a falling-out takes down ฝากสั่งซื้อ (China shopping), OTP SMS, and the website. PCS already started moving accounting to **PEAK** and asked him about an **ERP API** integration (4/12/2025) — Pacred-web is that escape. Until cutover, treat the legacy system as **read-mostly and fragile**.

> Cross-link: this is exactly the "borrow first, switch later" posture in [`CLAUDE.md`](../../CLAUDE.md) → [`docs/runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md). Do **not** scrub PCS/TTP/ไอแต้ม references before ก๊อต confirms each API switchover.

---

## 3. Decoded — the cargo / freight operating model

### 3.1 Two business lines

| | **Cargo** (ฝากนำเข้า / LCL consolidation) | **Freight** (FCL / single-consignee import) |
|---|---|---|
| Container holds | Many small customers' parcels | One importer's full load |
| Customer id | `PCS#####` member code per parcel | One consignee company |
| Billing | Per parcel, by weight **or** CBM × type-rate | Per shipment + customs duty/VAT |
| Documents | Shipment Report + warehouse manifest | + Commercial Invoice, Packing List, **Form E**, **D/O** |
| In legacy PHP? | ✅ yes (`forwarder.php` etc.) | ❌ **no — run on loose Excel today** |
| Pacred module | `(protected)/service-import` cargo mode | `service-import` FCL/LCL mode (Phase I2 — net-new) |

### 3.2 Container & document code scheme

| Code | Meaning | Example |
|---|---|---|
| `GZE{YYMMDD}-{seq}` | Guangzhou **truck** container (เดฟ: "GZE คือตู้ทางรถ") | `GZE260422-1` |
| `GZS{YYMMDD}-{seq}` | Guangzhou **sea** container (เดฟ: "GZS คือตู้ทางเรือ") | `GZS260406-1` |
| `A{YY}{seq}` | Freight **job/booking** number (single consignee) | `A2600200036` |
| carrier container no | Physical container on the B/L — **separate from the Pacred code** | `SLVU4871649`, `BLOU2025012` |
| `PCS#####` | Cargo customer member code | `PCS10005` |
| `CG#########[-NNN]` | Per-box barcode (`-NNN` = box within a parcel) | `CG000231541-001` |
| `P#####` | ฝากสั่งซื้อ (China-shopping) order | `P18926` |
| `FRC{YYMM}-{NNNNN}-{N}` | Printed receipt number | `FRC2511-00001-6` |
| Invoice no | **= the container code** for freight invoices | `INV no = GZE260328-1` |

Truck route: Pingxiang China → Vietnam/Laos → **Mukdahan**. Sea route: Nansha → **Laem Chabang**.

### 3.3 Cargo type taxonomy — ⚠️ two inconsistent code sets

Goods are classed for rate + clearance handling. **The two legacy systems disagree on the latin code:**

| Chinese / Thai label | PCS API ("Shipment Report") | Warehouse manifest (装柜明细) |
|---|---|---|
| 普通货物 / ทั่วไป (general) | **A** | **G** |
| 电器 / มอก. (electrical, needs TIS cert) | **M** | **T** |
| 药和食物 / อย. (drug & food, needs FDA) | **O** | **F** |
| 名牌 / พิเศษ (brand-name / special) | **X** | — |
| 管制货品 / ควบคุม (controlled goods) | **Z** | — |

→ Pacred must pick **one** enum (recommend the descriptive Thai + a stable code) and map both legacy sets onto it. See Problem **D2**.

### 3.4 Container lifecycle + where each document is born

```
China warehouse receive  → PCS API parcel record (CBM #1 "รับเข้า")
   ↓  pack container
ปิดตู้ (close container)  → 装柜明细 loading manifest (CBM #2 "ปิดตู้")
   ↓  ตัดตู้ (assign parcels → container; needs close-date set)
ship  GZE truck / GZS sea
   ↓  arrive TH
sea only: จดหมายแลก D/O  → release container from shipping line
customs: Commercial Invoice + Packing List + Form E (FTA duty preference)
   ↓
deliver → last-mile carrier → customer
```

### 3.5 Freight document set (net-new — PHP never had it)

- **Commercial Invoice + Packing List** — issued by the China shipper (real examples: `MAITU INTERNATIONAL TRADE (SHENZHEN)`, `HANGZHOU MILEGAO TRADING`, `BEIJING SANO LASER`). Columns: Item · Marks · Description · Qty · Unit · U/Price USD · Amount USD · then a **THB-conversion + VAT block** (× exchange rate, e.g. 31.4109 / 32.8526 / 33.162; VAT 7%).
- **Invoice value engineering** — files are named "`แผน2 VAT`" (VAT Plan 2). The **declared customs value is decoupled from the real commercial value**; VAT 7% is computed on the declared figure, and each shipment has alternate "plan" sheets. Pacred's freight model must store `real_value`, `declared_value`, and `vat_plan` explicitly — never conflate them.
- **Form E** — ASEAN-China FTA Certificate of Origin, the standard 12-box form (exporter / consignee / transport / item + HS code + origin criterion / declaration / certification). Drives preferential import duty. Needs a generator.
- **D/O exchange letter** (จดหมายแลก D/O) — for sea shipments: a letter from the consignee to the shipping-line agent (e.g. `CULINES`) carrying B/L no, vessel/voyage, container no, carton count, weight — requests telex-release / waybill so the container can be picked up.

---

## 4. Problem catalog

Severity: 🔴 blocks revenue · 🟠 daily pain · 🟡 fix soon. Each maps to a Part V task.

### A — Money & accounting integrity
- 🟠 **A1** Payment timestamp not editable — must reflect the **slip's transfer time**, not the approval-click time. Staff begged for fixes for months; ไอแต้ม eventually shipped self-service (8/1/2026).
- 🔴 **A2** **No status rollback** ("ถอยสถานะ"). Once an order advances, staff cannot reverse it to correct a rate/price — dev-only. Customer won't pay a wrong bill → revenue frozen.
- 🔴 **A3** **Paid-but-unpaid desync** — money received, order still shows "เครดิตค้างนำเข้า" (credit pending import). Recurring (9/10, 4/11).
- 🟠 **A4** **Rate-entry errors** — wrong exchange/price rate, "เรทเบิ้ล" (doubled rate) entered with no validation → invoice total wrong.
- 🟡 **A5** **No manual adjustment line** — every ฿0.04 / ฿0.50 / shipping-fee tweak goes to the dev.
- 🔴 **A6** **Withholding tax (หัก ณ ที่จ่าย) is completely unmodelled** — *the most-repeated complaint*. A juristic customer deducts 1% (or 3%) WHT → the transferred amount ≠ the invoice amount → the slip cannot be attached/approved, and the receipt total ≠ the invoice total. Staff explicitly want a **gate: do not release the receipt until the customer uploads their WHT certificate (หนังสือรับรองหัก ณ ที่จ่าย / ใบ 50 ทวิ)** — "ตามแทบไม่ได้เลย" (chasing customers for it is nearly impossible).
- 🟠 **A7** **Receipt-number confusion** — a system id vs a *printed* receipt number (`FRC{YYMM}-{NNNNN}-{N}`); the dev keeps asking for "เลขที่ใบเสร็จแบบพิม". The trailing `-N` invites mis-keying.
- 🟠 **A8** **Sales-tax report ≠ filed ภพ.30** — Oct/68 differed by **฿15,192.86**; root cause = manual number-entry errors. No trustworthy accounting export.

### B — Reporting / exports
- 🟠 **B1** **No self-serve reports.** Every "ดึง Excel ของ…" is a dev ticket: *pending-import payments · credit-pending imports · containers awaiting the TH warehouse · debtors · refunds issued · month's orders*. Each = days of delay.

### C — Order-lifecycle rigidity
- 🔴 **C1** **No refund path once goods are "preparing to ship"** — even when the customer-chosen carrier cannot deliver and a different/cheaper carrier is used, the over-collected shipping fee cannot be refunded. "ในระบบไม่สามารถแก้ไขอะไรได้เลย."
- 🟠 **C2** **Bill-header (buyer name) not editable** — dev-only, 8+ day turnaround, customer waiting.
- 🟠 **C3** **"ตัดตู้" fails silently** — assigning parcels to a container needs the **container close-date (วันที่ปิดตู้)** set first; the UI neither enforces nor explains this, so it just "ค้นหาไม่เจอ".

### D — Container & volume integrity 🔴 (revenue-critical)
- 🔴 **D1** **CBM/volume does not reconcile.** Three different numbers for one container: API-on-receipt, "รวมคิว" (queue-sum), and the China "ปิดตู้" manifest. **Real case GZE260422-1: API ≈ 16.79 CBM vs manifest total 21.281817 CBM** (the figure is literally in the chat *and* the bottom row of file 02). Customers dispute → bill stuck.
- 🟠 **D2** **Two parallel systems that don't reconcile** — PCS API "Shipment Report" (types `A/M/X/O/Z`) vs China-warehouse 装柜明细 manifest (types `G/T/F`). Different type codes, different CG-number formats. Pick one canonical model.
- 🟡 **D3** **Two container identifiers** — the Pacred code (`GZE260407-1`) and the carrier's physical container no (`BLOU2025012`) are not consistently linked.
- 🟠 **D4** **Split-receipt** — a container split becomes `qty=1` in the legacy receive app; expected vs received box counts must be modelled (already migration `0037`, U1-5).

### E — Freight (FCL/LCL) document model — net-new
- 🔴 **E1** Commercial **Invoice + Packing List** generator (China shipper → Thai consignee).
- 🔴 **E2** **Invoice value engineering** — model `real_value` vs `declared_value` vs `vat_plan` ("แผน VAT" 1/2/…); VAT 7% on the declared figure.
- 🟠 **E3** **Form E** (ASEAN-China FTA C/O) generator — 12-box form, HS code, origin criterion.
- 🟠 **E4** **D/O exchange letter** generator — sea shipments; B/L, vessel, container no, telex-release wording.
- 🟡 **E5** **int32-overflow corruption** — legacy invoice sheets show `-2146826265`/`-2146826273` garbage in a numeric field. Whatever Pacred builds must validate + range-guard every numeric import.

### F — Strategic / dependency
- 🔴 **F1** ไอแต้ม single-point-of-failure (see §2).
- 🟡 **F2** PCS moving accounting to **PEAK**; an ERP/accounting export API is expected (A8 + B1 feed this).
- 🟡 **F3** Legacy infra fragile (3rd-party server, pay-or-die).

---

## 5. Strategy — what to build, in what order

The revenue lens (["does this get cargo customers faster?"](../../AGENTS.md)) ranks this:

1. **Close the cargo money loop so staff never need ไอแต้ม.** Ship A2 (status rollback with audit), A3 (payment↔order reconciliation), A4 (rate validation), A5 (manual adjustment line), C1 (post-lock refund). These are *operational unblockers* — every one is a chat message where revenue froze.
2. **Withholding-tax model (A6).** New first-class concept: invoice `gross` → `wht_amount` (1%/3%) → `net_paid`; receipt issuance **gated** on WHT-certificate upload. Unblocks every juristic customer. Pairs with the tax-invoice work (ADR-0006, migration `0034`).
3. **Container volume reconciliation (D1/D2).** Make `cargo_containers` / `cargo_shipments` ([container-centric model](../architecture/container-centric-model.md)) store CBM from each source (`received` / `queue` / `manifest`) and surface the diff to staff *before* billing. One canonical cargo-type enum.
4. **Self-serve reports (B1).** Admin report screens for the six Excels staff keep asking for — kills the dev dependency for reporting outright.
5. **Freight document suite (E1-E4).** Net-new build (Phase I2). Invoice/PL + Form E + D/O generators; the value-engineering model E2. Lower urgency than the cargo loop but it is real revenue running on Excel today.
6. **Accounting export (A7/A8/F2)** — clean receipt numbering + a ภพ.30-reconcilable export, eventually a PEAK-shaped API.

Guardrails for every item: validate + range-guard all numeric input (**E5**), and every state change writes an audit row (per [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)).

---

## 6. Backlog → PORT_PLAN Part V

These problem IDs are carried verbatim into [`docs/PORT_PLAN.md`](../PORT_PLAN.md) **Part V** as tasks `V-A2 … V-F3`, each with an owner and a revenue tag. Part V is the single source of truth for *scheduling*; this doc is the source of truth for *why*.

---

## 7. Cross-references

- ⬆️ Plan & scheduling → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V
- 🏗 Schema spine for D1-D4 → [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 🤝 Partner sync (MOMO) feeds the same containers → [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- 🧾 Tax-invoice pairs with → [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) · migration `0034`
- 💸 Withholding-tax model (A6) design → [`docs/decisions/0015-withholding-tax-model.md`](../decisions/0015-withholding-tax-model.md) (🟡 DRAFT — ก๊อต to lock)
- 🚢 Freight value model (E2) design → [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md) (🟡 DRAFT — ก๊อต to lock)
- 🔁 State-change audit pattern → [`docs/decisions/0014-customer-self-service-state-transitions.md`](../decisions/0014-customer-self-service-state-transitions.md)
- 💬 Customer-side chat audit → [`docs/audit/chat-analysis-2026-05-16.md`](chat-analysis-2026-05-16.md)
- 🧹 Legacy PHP dead-file sweep → [`docs/audit/legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md)
- 🧠 Permanent domain knowledge → [`docs/learnings/pacred-domain-knowledge.md`](../learnings/pacred-domain-knowledge.md)
- 🛑 Don't scrub legacy refs early → [`docs/runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)
- 🔌 V-F1 dependency burn-down → [`docs/runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md) (the ไอแต้ม single-point-of-failure, tracked to ✅)
