# 🔬 Legacy Accounting / Billing / Pricing Model — Decoded (AXELRA · NNB · ไอแต้ม)

> **Captured:** 2026-05-17 · **Owner:** เดฟ-led R&D · for Pacred billing build.
> **Source material:** the `AXELRA SHIPPING ERP` Apps Script backend (`Code.gs`, 144 KB),
> the `AXELRA / NNB BOOKING SYSTEM` Apps Script (`SCRIPT GG SHEET - รหัส.gs`, 73 KB),
> the AXELRA HUB hub-script + Cargo-Thai webhook (`(hub)Code.gs`), the sales/commission
> dashboard backend (`salerank.html` — Apps Script despite the extension), the upload
> dialog (`gas backfuction sheet.{gs,html}`), and three workflow notes
> (`Flow งาน.txt`, `เคลียร์งานแอร์.txt`, `pcs_new_workflow.html`).
>
> **Read with:** [ADR-0015 withholding tax](../decisions/0015-withholding-tax-model.md) ·
> [ADR-0016 freight value model](../decisions/0016-freight-value-model.md) ·
> [`docs/port-specs/freight-receipt-and-payment.md`](../port-specs/freight-receipt-and-payment.md) ·
> [`docs/research/ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) ·
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md).

---

## ✅ 0. Status — Excel rate tables now extracted (2026-05-17 follow-up)

The 5 Excel workbooks + 2 nested ZIPs **have now been extracted to text** and read.
The rate cards, the cost/profit/commission model, the ออกราคา price-form fields and
the กองกลาง ledger columns are all decoded with **real numbers** — see the new
**§11 (rate cards)** and the verified figures folded into §3/§4/§5 below. The earlier
"could not open" caveat is resolved; §10 now records what was actually pulled.

Two layers, both decoded:
1. **Logic layer** — the Apps Script backend (`Code.gs` etc.), decoded in §3–§7. Reliable.
2. **Data layer** — the Excel rate tables, now read. The pricing model is **not** a
   formula engine in the ERP; it is a **per-mode pricing worksheet** (`แบบฟรอมออกราคา
   IMPORT`) the Pricing staff fill, with **admin-maintained rate cards** embedded in it.
   §11 reproduces every rate. Numbers are real cell values unless flagged otherwise.

---

## 1. TL;DR — the money model in six sentences

1. **Two parallel ledgers.** Every job carries an **AR side** (what the customer is
   billed → revenue) and an **AP side** (what Pacred pays out to carriers/customs/agents
   → cost). They live in **separate Google Sheets** and are joined only at report time
   by `Shipment ID`. `net profit = AR profit − Σ AP`.
2. **Pricing is a quotation, not a formula engine.** A sell price is **assembled by the
   Pricing staff** as three line buckets — `SALE_LCL` + `SALE_CUSTOMS` + `SALE_DOC` —
   each a hand-entered THB figure; their sum is the customer total. There is no live
   weight×rate calculator inside this ERP (that lived in the separate WordPress
   `booking.php` estimator — see `ttp-cargothai-decoded.md` §4).
3. **Cost vs profit** is stored, not derived: the ACC-Shipment sheet has explicit
   `advance` / `cost` / `revenue` / `profit` columns; `profit` is staff-entered (the
   code falls back to `revenue − cost` only when the cell is blank).
4. **Commission** is one column on the booking row (`COMMISSION`, col 54), keyed to a
   salesperson; the sales dashboard sums it per-rep and per-month.
5. **เบิกเงิน (reimbursement)** = the AP side. Each carrier/customs cost is a row in a
   per-company-per-mode "เบิก" sheet with a **status lifecycle**
   `ต้องการเบิก/รออนุมัติ → โอนแล้ว/จ่ายแล้ว/เบิกแล้ว`. **กองกลาง (central fund)** is
   the float account those disbursements are paid out of.
6. **The Sheets backend (Apps Script)** automates: ID generation, Drive folder creation,
   document-number sync (QO↔IV↔RT) across 4 sheets, commission two-way sync, calendar
   events, and **stub** PEAK (accounting) + NETBAY (customs) API calls — none of the
   external APIs were ever wired (all keys blank).

---

## 2. The entity & system landscape

| Thing | What it is |
|---|---|
| **AXELRA (Thailand) Co., Ltd.** | tax id `0105564077716` — **same registration as Pacred** (CLAUDE.md). AXELRA is the freight-brand predecessor; Pacred is the rebrand. |
| **THE N N B TRADING Co., Ltd.** | tax id `0115567039173` — a **second legal entity** used for some jobs (sister company). |
| **ไอแต้ม / TTP / CargoThai** | operational carrier partners (Mukdahan truck route + China warehouse). Decoded in `ttp-cargothai-decoded.md`. |
| **The ERP** | a Google-Apps-Script web app over **3 Google Sheets** — Main (`SHEET_ID`), ACC (`ACC_SHEET_ID`), Pricing (`PRICING_SHEET_ID`). This is what the 5 Excel workbooks are: **exports / working copies of those Sheets.** |
| **PEAK** | `peakaccount.com` — the real Thai accounting software AXELRA's books live in. The ERP only has *stub* integration. |
| **NETBAY** | `netbay.co.th` — customs e-declaration middleware (broker → กรมศุลกากร). Stub only. |

**ID schemes** (`generateJobId`, `generateMemberId`):

| ID | Format | Example | Rule |
|---|---|---|---|
| AXELRA job | `A` + `YYMM` + 5-digit running | `A260200048` | per-month counter |
| NNB sea job | `GZS` + `YYMM` + 5-digit | `GZS26020001` | |
| NNB truck job | `GZE` + `YYMM` + 5-digit | `GZE26040001` | the EK-Mukdahan truck route |
| AXELRA member | `AX` + 3-digit | `AX001` | |
| NNB member | `NNB` + 3-digit | `NNB001` | |

`GZE…`/`GZS…` match the cargo-forensics doc's "GZE truck / GZS sea" finding — these
**job codes are the customer-facing shipment IDs** and the join key across every sheet.

---

## 3. The booking ledger — `2.SALE BOOKING / SHIPMENT / COMMISSION`

The master row. **One row per job.** Written by `saveBooking()`; column map confirmed
from `saveBooking`, `salerank.html` `COL{}`, and `SCRIPT GG SHEET` `CONFIG`.

| Col (0-idx) | Field | Notes |
|---|---|---|
| 0 | DATE | job creation date |
| 1 | MEMBER_ID | `AX###` / `NNB###` |
| 2 | PRICING_ORDER | link to a pricing-request row |
| 3 | **SHIPMENT** | the job ID — **join key**; becomes a `=HYPERLINK()` to the Drive folder |
| 4 | QUOTATION (QO) | quotation doc no. |
| 5 | INVOICE | (legacy slot; real IV is col 43 — see below) |
| 6 | AGENT | overseas agent |
| 7 | COMPANY | `AXELRA` / `NNB` |
| 8 | TYPE | `SEA` / `AIR` / `TRUCK` / `EK CARGO` / `SEA CARGO` / `AIR CARGO` |
| 9 | SALES | salesperson code — drives commission attribution |
| 10–14 | PRICING · DOCS_CS · DOCS_BILLING · ACC_AP · ACC_AR | **the 5 staff roles assigned to the job** (auto-filled by `AUTO_ASSIGN` table per company+type) |
| 15 | PAY_TYPE | payment type |
| 16 | CUSTOMER (consignee) | |
| 17 | PRODUCT | |
| 18–20 | consignee addr · shipper · shipper addr | |
| 21 | EXIM | e.g. `IM (N)` — import/export class |
| 22 | TERM | Incoterm — default `CIF` |
| 23 | SIZE | container size |
| 24 | ADD_SERVICE | extra services |
| 25 | POD | port of discharge |
| 26 | TRUCK_TYPE | |
| 27 | STATUS | workflow status (see §7) |
| 28–32 | ETD · ATD · ETA · ATA · DELIVERY_DATE | dates (estimated vs actual) |
| 33 | CB_VAT | "VAT พ่วง" checkbox — flags a job needs the tax-attached treatment |
| 34 | CB_CLOSEJOB | close-job checkbox |
| 36 | CB_PAY | payment received checkbox |
| 37 | (เวลาที่ชำระ) | payment timestamp — *inserted v6.1, shifted all later cols +1* |
| 38–40 | ยอดชำระ · UPLOAD1 · UPLOAD2 | amount paid + 2 slip-upload columns |
| 41 | CB_CLOSEBILL | close-billing checkbox |
| **42** | **IV** | **ใบแจ้งหนี้ (invoice) doc no.** — `SALE_IV_COL` |
| **43** | **RT** | **ใบเสร็จรับเงิน / ใบกำกับภาษี (receipt) doc no.** — `SALE_RT_COL` |
| 45–47 | CTNS · CBM · KGM | quantity / volume / weight |
| **47** | **SALE_LCL** | sell price bucket 1 — freight/LCL portion |
| **49** | **SALE_CUSTOMS** | sell price bucket 2 — customs portion |
| **51** | **SALE_DOC** | sell price bucket 3 — documentation/service portion |
| **53** | **COMMISSION** | the salesperson commission for this job |

> **Column-index caveat.** `salerank.html` (an earlier script version) uses
> `SALE_LCL=48 / SALE_CUSTOMS=50 / SALE_DOC=52 / COMMISSION=54`; `SCRIPT GG SHEET`
> v6.1 inserted column `AL` (เวลาที่ชำระ) at index 37 and shifted everything ≥37 by +1.
> The **live** sheet is the v6.1 layout (IV=43, RT=44, ...). Treat the *names* as
> canonical and re-confirm exact indices against the live sheet before any port.

### 3.1 The sell-price model — **`totalSale = SALE_LCL + SALE_CUSTOMS + SALE_DOC`**

`salerank.html → rowToRecord()` is explicit:

```js
const lcl     = num(row[SALE_LCL]);
const customs = num(row[SALE_CUSTOMS]);
const doc     = num(row[SALE_DOC]);
const total   = lcl + customs + doc;          // ← the customer's total sell price
const comm    = num(row[COMMISSION]);
```

So a Pacred-equivalent "sell price" is **three hand-entered THB line buckets summed**:

- **`SALE_LCL`** — the freight charge (LCL consolidation / FCL / truck / air freight).
- **`SALE_CUSTOMS`** — customs-clearance charges (duty handling, ใบขน, inspection).
- **`SALE_DOC`** — documentation + service fee (`ค่าบริการ`).

There is **no markup % and no rate×weight formula inside the ERP.** The Pricing staff
*decide* each bucket using the **`แบบฟรอมออกราคา IMPORT` pricing worksheet** — now
extracted (§11). It **is** a cost-buildup calculator: per-mode tabs (IM EXW/FOB/CIF ×
SEA FCL/LCL/AIR), each summing freight + ~20 local-charge line items into a `รวมราคา`
total, with `COST` / `PROFIT` columns beside the sell figures. The ERP only **stores
the resulting 3 buckets**; the worksheet is where they are built. Verified markup
policy + every rate card → §11.

### 3.2 Workflow-note evidence of the cost build-up (air route)

`เคลียร์งานแอร์.txt` is a staff cheat-sheet for **air-import** jobs and reveals the
**cost components** that go into pricing an air job — i.e. what `SALE_*` must cover:

- **ค่าภาษี (duty + VAT):** `มูลค่าสินค้า × %อากร`, then `× 7%` VAT. → the duty/VAT math.
- **ค่าโกดัง (warehouse storage):** priced from "วันที่เครื่องลง" → "วันเข้ารับสินค้า".
- **ค่า D/O (delivery order)** — a **fixed table by courier**:
  `UPS = 489 · FedEx = 428 · DHL = 449.40` THB (air-courier D/O). Sea-freight D/O is
  a different, larger figure — see §11.4 (`8,000–13,000` THB by port/size).
- **ต้นทุนบริการ (service cost):** `ชื่อบุคคล (personal) = 800 · บริษัท (juristic) = 1500`;
  another note says **`650 เสมอ` (always 650)** and **`customs registration = 1500`**
  → the customs-registration `1,500` is confirmed by the Excel (§11.4); the `650`/`800`
  figure is the **internal cost** of the registration service (`COST` column, §11.5).

This confirms the model: **cost is itemised from rate cards**, Pricing adds a margin,
the result is bucketed into `SALE_LCL/CUSTOMS/DOC`. The rate cards are now extracted —
**see §11** for the full per-CBM / per-kg / D/O / customs / service figures.

---

## 4. Cost vs profit — `4.1ACC axelra DATA SHIPMENT`

The **AR side ledger**. One row per job, keyed on `SHIPMENT`. Column map from
`getAccShipmentData()` + `getAccSummaryByShipment()` + `getFinancialSummary()`:

| Col (0-idx) | Field | Meaning |
|---|---|---|
| 1 | customer | |
| 3 | **SHIPMENT** | join key |
| 5 | quotation (QO) | |
| 7 | invoice (IV) | |
| 9 | receipt (RT) | |
| **12** | **advance** (`adv`) | money advanced / float used on the job |
| **13** | **cost** | total cost of the job |
| **14** | **revenue** | total billed to customer ( = the §3.1 `totalSale`) |
| **15** | **profit** | **staff-entered**; code: `typeof row[15]==='number' ? row[15] : (revenue − cost)` |
| 16 | transfer_add | additional transfer in |
| 17 | transfer_back | transfer refunded / returned |
| 19 | closed | close flag |

**`AXELRA Cost & Profit & Com.xlsx`** was extracted — and it is **not** the `4.1ACC`
ledger. It is a 4-sheet working file: (1) `เงื่อนไข จ๊อบการทำงาน` — the **markup-policy
sheet** (§11.1); (2) `การตอบแบบฟอร์ม` — raw Google-Form quote enquiries; (3) `Transport`
— a **truck-cost vs sell-price table** (`Cost` / `Price` columns, §11.3); (4)
`FRE IM SEA FCL` — the **monthly sea-freight rate card** (§11.2). So `Cost & Profit & Com`
holds the **inputs** to pricing (rate cards + markup %), not the per-job profit ledger.
The per-job `profit` confirmation comes from the `ตรวจ COMMISSION` sheet instead — §11.5.

**Profit math, as the code treats it:**

```
profit (per job)      = ACC.profit cell  (fallback: revenue − cost)
net_profit (per job)  = profit_ar − Σ AP_amount        ← getFinancialSummary()
```

> ⚠️ **Double-counting hazard.** `cost` (ACC col 13) and the **AP ledger** (§5) are
> *two independent records of the same outflows*. `getFinancialSummary` computes
> `net_profit = profit_ar − ap_total` where `profit_ar` already subtracted `cost`.
> If `cost` ≈ `Σ AP`, profit is **double-deducted**. The legacy reports do not
> reconcile the two — a real accounting risk Pacred must design away (see §9).

---

## 5. The เบิกเงิน (reimbursement) + กองกลาง (central fund) flow

This is the **AP side** — `ACC - AXELRA&NNB เบิกเงิน.xlsx` and
`ข้อมูลการเบิก-จ่ายกองกลาง.xlsx`.

### 5.1 Structure — per-company-per-mode "เบิก" sheets

`getApDisbursementData()` walks **every sheet** in the ACC workbook and detects the
sheet by name (`_detectApSheet`): a sheet whose name contains `axelra`/`nnb` **and**
`รถ|truck`/`เรือ|sea`/`แอร์|air` is an AP data sheet (e.g. `AXELRA_TRUCK`, `NNB_SEA`).
Dashboard/setup sheets (`0.DASHBOARD AP`, `ACC AP ตั๋วชน ลงข้อมูล`, `SHIPMENT ตารางงาน`)
are skipped.

**AP row column map** (`getApDisbursementData`, reading cols A–P):

| Col | Field |
|---|---|
| B (1) | วันที่ — disbursement date |
| C (2) | **Vendor** — who is paid (carrier / customs officer / agent / พี่หนุ่ย etc.) |
| D (3) | **Shipment ID** — join key back to the job |
| F (5) | **Amount** (THB) |
| I (8) | remark |
| J (9) | details |
| **O (14)** | **Status** |

### 5.2 The disbursement status lifecycle

```
ต้องการเบิก   (requested)         ─┐
รออนุมัติ     (awaiting approval) ─┘→  pending  (summary.totalPending)
        │  approve + pay out of กองกลาง float
        ▼
โอนแล้ว / จ่ายแล้ว / เบิกแล้ว   →  paid     (summary.totalPaid)
```

`getApDisbursementData` buckets every row: `totalAmount` (all), `totalPaid` (the three
"done" statuses), `totalPending` (the two "open" statuses). `getApByShipment(sid)`
gives a job's `totalAP / totalPaid / totalPending`.

### 5.3 What "กองกลาง" (central fund) is

`ข้อมูลการเบิก-จ่ายกองกลาง.xlsx` was extracted — it is a **China-warehouse central-fund
cash book**, one sheet per month (`ค่าใช้จ่ายโกดังจีน ธ.ค.68`, `ม.ค.69`, …). It is
**not** a per-job AP ledger — it is the **TTP-PCS China-warehouse operating float**.
Confirmed columns: `วันที่ · รายการ · ยอรวม(หยวน) · เรท(หยวน) · ยอดรวม(บาท) ·
ยอดหาร(บาท)` plus `ยอดคงเหลือ(หยวน)` and slip-evidence columns. The `เรท(หยวน)` is the
**CNY→THB exchange rate per top-up** (observed 4.54–4.66 — see §11.6). `ยอดหาร` =
amount ÷ 2 (the float is **split 50/50** between two parties). Top-ups run ~฿45,700
per round (10,000 CNY); monthly totals observed ฿687,684 (Dec-68) and ฿959,303
(Jan-69). It bankrolls warehouse rent, China staff salaries, equipment — **not**
freight/D-O. The `เบิก-จ่าย` naming + the ACC `advance` / `transfer_*` columns still
describe a **revolving float**:

1. The company funds a **central pool (กองกลาง)**.
2. When a job needs an outflow (ค่า D/O, ค่าเร้น/ค่าล่วง — demurrage/detention, duty,
   carrier freight), staff file a **เบิก request** (`ต้องการเบิก`) — an AP row.
3. On approval the money is **paid out of กองกลาง** to the vendor → status `โอนแล้ว`.
   `Flow งาน.txt`: *"ทำเบิกค่า DO พร้อมค่าเร้น"*, *"โอนแล้ว จัดชุดแลก DO"*.
4. The cost is later **recovered from the customer** via the invoice (it is part of
   `revenue`); the float is replenished. `advance` (ACC col 12) tracks money the job
   has consumed from the pool but not yet recovered; `transfer_back` tracks refunds
   (e.g. carrier over-charge returned, unused ค่าเร้น).

`Flow งาน.txt` even shows carriers asking for a reconciliation table:
*"ยอดค่าเร้น ค่าล่วง ที่โอนให้พี่หนุ่ย … ทำยอดใส่ตารางแจ้งเขา"* — the float has to be
reconciled with the customs agent (พี่หนุ่ย) by hand. **The central fund has no
ledger discipline beyond a spreadsheet** — a significant money-handling risk (§9).

### 5.4 `getFinancialSummary` — how AR and AP are joined

```
arMap[SHIPMENT]  ← 4.1ACC rows  (revenue, cost, profit_ar, advance, transfer_*)
for each AP row:
    if arMap[shipment] exists  → add ap.amount into ap_total/ap_paid/ap_pending
    else                       → an "AP-only" orphan entry (no matching job)
net_profit(job) = profit_ar − ap_total
breakdown        = AP totals grouped by COMPANY_TYPE
```

**Orphan AP rows** (AP whose Shipment ID matches no job) are surfaced separately — a
sign the manual join is lossy: a typo'd shipment ID silently drops a cost off its job.

---

## 6. The Sheets-automation backend (Apps Script) — what it really does

Three scripts. **None of this is business logic you can skip — it is the integration
glue Pacred replaces with DB triggers + server actions.**

### 6.1 `Code.gs` — the ERP backend (`AXELRA SHIPPING ERP`)

- **Web app** (`doGet`) serving `Login` / `Index` / `Tracking` / `Supplier` /
  `PC_SEA_FRIEGHT` HTML pages — a full role-gated portal.
- **RBAC** — `ROLE_PERMISSIONS{}` for `admin / ceo / pricing / doc / acc / sales /
  messenger / supplier / customer`, each with `pages[]` + `canEdit/Delete/Approve/ViewAll`.
  → Pacred's `is_admin(roles[])` is the equivalent; the role list maps cleanly.
- **`saveBooking()`** — appends a booking row, **auto-assigns the 5 staff roles** from
  `AUTO_ASSIGN[company_type]`, auto-generates the job ID, creates the Drive folder.
- **Financial reads** — `getAccShipmentData` (AR), `getApDisbursementData` (AP),
  `getFinancialSummary` (joined), `getQuickFinanceOverview` (dashboard card).
- **Integration stubs** (§6.4).
- **Gmail** — inbox/thread/reply + role e-mail notifications on status change.

### 6.2 `SCRIPT GG SHEET - รหัส.gs` — the booking-sheet automation (v6.1)

The **document-number plumbing** — the part Pacred most needs to get right:

- **`onEdit` trigger** wires 6 sheets together. When a row's `SHIPMENT` (col D) is
  filled and complete (has Company+Type) → it **creates/links a Drive job folder** and
  rewrites the cell as `=HYPERLINK(folderUrl, shipmentId)`.
- **QO → IV → RT sync.** `2.SALE BOOKING`, `4.1ACC` and `ตรวจ COMMISSION` are kept in
  lock-step: typing the invoice no. in `4.1ACC` pushes it to `SALE.IV(43)` and vice
  versa (`handleAccIvSync`, `syncSaleTo41ACC`, `batchSync41ACC`); same for receipts.
  → In Pacred this is **one `freight_invoices` row with an `invoice_no` + `receipt`
  state**, not 3 sheets hand-synced. The legacy 2-way sync exists *only* because the
  data is duplicated across sheets — a structural smell to eliminate.
- **Commission 2-way sync** — `ตรวจ COMMISSION` cols 14–33 ↔ `2.SALE BOOKING` cols
  42–61, mapped both directions (`COMM_TO_SALE` / `SALE_TO_COMM`).
- **`forcePullDataFromDoc`** — pulls CTNS/CBM/KGM from `3.DOC DATA`.
- **Calendar sync** — ETD/ATD/ETA/ATA/Delivery → 6 Google Calendars.
- **`syncToAccFile`** (`ACC_CONFIG`) — copies 16 columns from the Main sheet into the
  **separate ACC workbook** (`DEST_FILE_ID`). This cross-file copy is exactly why the
  Excel files exist as detached snapshots.
- **Heavy defensive code** — `normalizeId`, `normalizeIdForMatch` (strips zero-width
  chars, BOM, NBSP), `parseFlexibleDate` (handles Thai months + Buddhist years
  `yyyy>2400 → −543`). The Shipment ID is a **dirty free-text key**; matching it
  reliably took a lot of code. Pacred should make the job ID a real PK from day one.

### 6.3 `(hub)Code.gs` + the upload dialog

- **CargoThai webhook receiver** — `doPost(?page=cargothai_webhook)` appends
  `{received_at, dataStatus, sm_code, ct_status}` rows to a `CARGOTHAI_LOG` sheet.
  CargoThai pushes container-status events (no auth on the webhook — a hole).
- **CargoThai pull API** — `_ctGet()` calls `https://cargothai.tech/api/service/...`
  with a `_token` query param (`GetContainer`, `GetDetail`). So CargoThai *does* have a
  token API (corrects `ttp-cargothai-decoded.md` §0 which said "no documented API").
- **Upload dialog** (`gas backfuction sheet.html`) — staff click a job row, drag a
  slip/PDF, it uploads straight into that job's Drive folder. Pacred's slip-upload
  buckets (`freight-payment-slips/`, `slips/`) replace this.

### 6.4 PEAK + NETBAY — accounting/customs integration (stubs only)

| Integration | State in the legacy code |
|---|---|
| **PEAK** (`api.peakaccount.com/api/v1`) | `_peakApiCall()`, `createPeakInvoice()`, `createPeakQuotation()`, `getPeakInvoices/Quotations/Receipts`, `parsePeakReport()`. **`PEAK_API_KEY` is blank** → none of it runs live. `parsePeakReport` *does* work — it parses a PEAK **Excel export** (header row 12) for `invoice / quotation / receipt / sale_tax / purchase_tax / journal / withheld` and caches it. So the real flow today is **manual: export from PEAK → upload Excel → parse**. |
| **NETBAY** (`api.netbay.co.th`, SOAP/XML) | `parseNetbayDeclaration()` parses a NETBAY declaration **Excel export** — extracts `Declaration No, Importer, DutyRate(c34), DutyAmt(c36), VatAmt(c38)`. `checkNetbayDeclarationStatus()` is a TODO stub (no credentials). |
| **CargoThai** | webhook + token API, working (§6.3). |

**Takeaway:** PEAK is the **system of record for the actual books**. The ERP is an
**operational layer**; its AR/AP sheets are a *parallel* bookkeeping that staff
reconcile against PEAK by exporting Excel. That reconciliation gap = the
`ภพ.30 off by ฿15,192` pain in the cargo-forensics audit.

### 6.5 PEAK invoice/quotation body — useful when Pacred wires the real API

```jsonc
// createPeakInvoice — POST /invoices
{ "reference": "QO-20260200048", "issue_date": "2026-02-23", "due_date": "...",
  "client_id": "V00262",
  "note": "PORT : KOREA - BKK\nSHIPMENT : A2600100092",
  "items": [{ "item_id": "C-IM1", "name": "Customs Registration Service",
              "qty": 1, "price": 1500, "vat_type": "VAT7" }] }
```

`vat_type: "VAT7"` per line; `due_days` default 7; quotation valid 14 days. PEAK item
codes are real SKUs (`C-IM1` = customs registration). Pacred's
[freight-receipt-and-payment spec](../port-specs/freight-receipt-and-payment.md)
V-F2 PEAK push should mirror this body.

---

## 7. The full job → accounting workflow ("รับงานยันจบบัญชี")

Reconstructed from `Flow งาน.txt` (NNB sea + NNB truck), `เคลียร์งานแอร์.txt` (air
import), the booking `STATUS` enum, and the AP/AR sheets.

```
┌─ A. SALES ──────────────────────────────────────────────────────────────┐
│ 1. Enquiry in → Pricing checks carrier rates (LINE rate-check groups +   │
│    the IMPORT pricing-form Excel) → builds SALE_LCL/CUSTOMS/DOC.         │
│ 2. Sales closes the deal → saveBooking() → job ID (A.. / GZS.. / GZE..), │
│    QO issued, Drive folder auto-created, 5 staff auto-assigned.          │
│    STATUS = "รอคอนเฟิร์ม".                                               │
├─ B. DOC / OPERATIONS ───────────────────────────────────────────────────┤
│ 3. Draft INV + PL + ใบขน (declaration). Sea: ENTER B/L, chase carrier    │
│    for the cost e-mail. STATUS → "รอ ENTER" → "รอค่าใช้จ่าย D/O".        │
│ 4. ── เบิก #1 ── file an AP row for ค่า D/O + ค่าเร้น (demurrage), pay   │
│    out of กองกลาง float → status "โอนแล้ว" → exchange the D/O.           │
│ 5. Plan inspection + delivery date; book the truck (เชษฐ์พิทักษ์ group). │
│    STATUS → "รอตรวจปล่อย" / "แลก D/O".                                   │
│ 6. Customs agent (พี่หนุ่ย) confirms the declaration → fire ใบขน via     │
│    NETBAY. ── เบิก #2 ── file the duty/VAT (ภาษี) AP row.                │
│    "VAT พ่วง" jobs (CB_VAT col 33): print ใบขน, the VAT team checks it.  │
│ 7. Goods clear; truck driver info relayed; STATUS → "สำเร็จ".            │
├─ C. BILLING ("วางบิล") ─────────────────────────────────────────────────┤
│ 8. Assemble the billing pack — INV, PL, FE (Form E), ใบขน, ใบเสร็จ of    │
│    each เบิก (D/O receipt, tax receipt). New Drive folder per job.       │
│    เคลียร์งานแอร์.txt: print the customs e-receipt (E-Track กศก.123),    │
│    tick the two checkboxes, file every doc.                              │
│ 9. Cross-check the quotation price against the เบิก (cost) sheet — i.e.  │
│    verify the customer was billed enough to cover actual outflows.       │
│10. Pricing logs the billing in a physical book                          │
│    (date / bill no. _ job no. / tax+fee actual).                         │
├─ D. ACCOUNTING ("จบบัญชี") ─────────────────────────────────────────────┤
│11. Issue the IV (ใบแจ้งหนี้) → col 42; customer pays → record ยอดชำระ +  │
│    เวลาที่ชำระ + slip upload (cols 38-40). Issue RT (ใบเสร็จ/ใบกำกับ      │
│    ภาษี) → col 43. The QO↔IV↔RT sync fans these across 4.1ACC + COMM.   │
│12. 4.1ACC row finalised: advance, cost, revenue, profit, transfer_*.    │
│    CB_CLOSEBILL ticked.                                                  │
│13. Mirror everything into PEAK (manual: create invoice/receipt in PEAK,  │
│    or export PEAK Excel and reconcile). Commission (col 53) credited to  │
│    the salesperson; the sales dashboard tallies it monthly.              │
└─────────────────────────────────────────────────────────────────────────┘
```

`STATUS` enum observed: `รอคอนเฟิร์ม · รอ ENTER · รอตรวจปล่อย · แลก D/O ·
รอค่าใช้จ่าย D/O · อยู่ลาวรอเข้าไทย · เวียดนาม · รอยิงใบขน · สำเร็จ`. The truck route
runs China → Laos/Vietnam → Mukdahan → Thailand (hence the `อยู่ลาวรอเข้าไทย` /
`เวียดนาม` states).

**Key insight for Pacred:** the **billing step (C9) — "cross-check quotation vs the
เบิก sheet" — is the profit-protection control.** It is done by hand today and is
exactly where margin leaks. Pacred should make this a **computed reconciliation**
(invoice total vs sum of recorded costs) surfaced on the job, not a manual eyeball.

---

## 8. Mapping to the existing Pacred design

Most of this is already anticipated by the ADRs/specs — this research **confirms** them
and adds detail:

| Legacy concept | Pacred equivalent (already specced) | Note |
|---|---|---|
| Sell price = 3 buckets | `freight_invoice_lines` (one line per bucket) | V-E7 spec — model the 3 buckets as 3 default lines |
| `4.1ACC` revenue/cost/profit | `freight_invoices` + a job cost model | revenue ✅; **a cost/AP model is the gap** |
| เบิกเงิน AP rows + status | **not yet specced** — `job_costs` / `disbursements` table | see §9 — Pacred has no AP ledger yet |
| กองกลาง float | **not yet specced** — central-fund ledger | see §9 |
| Commission col | **not yet specced** — `sales_commissions` | exists in legacy, absent in Pacred specs |
| QO↔IV↔RT 3-sheet sync | one `freight_invoices` row, state machine | eliminate the duplication entirely |
| WHT (`withheld` PEAK report) | `withholding_tax_entries` (ADR-0015) | ✅ already designed |
| Freight value / VAT / duty | freight value model (ADR-0016) | ✅; legacy duty math = `value×%อากร×7%` matches |
| PEAK invoice push | V-F2 PEAK API | ✅; body shape in §6.5 |
| NETBAY declaration | customs e-declaration | future; duty/VAT cols in §6.4 |
| RBAC roles | `is_admin(roles[])` | role list maps 1:1 |

---

## 9. What Pacred must build / fix for billing — + money-handling risks

### 9.1 Build (gaps not yet in any ADR/spec)

1. **An AP / cost ledger (`job_costs` or `freight_disbursements`).** The legacy "เบิก"
   sheets have **no Pacred equivalent.** Pacred's freight specs model only the **AR**
   side (`freight_invoices`). Without a cost ledger there is no `net_profit`, no
   billing cross-check (workflow C9), no margin visibility. **Needs its own table +
   ADR**: one row per outflow — `{job, vendor, category(D/O·duty·freight·rent·service),
   amount, status[requested→approved→paid], slip, paid_from}`. Categories from the
   air-route note: ค่า D/O, ค่าภาษี, ค่าโกดัง, ค่าเร้น/ค่าล่วง, ต้นทุนบริการ.
2. **A central-fund (กองกลาง) ledger.** Model the revolving float explicitly:
   fund top-ups, disbursements out, recoveries in, running balance. Today it is a
   19 MB spreadsheet with no controls. Tie each disbursement to `paid_from = central
   fund` and each job's `advance` to un-recovered float.
3. **A sales-commission model.** Now decoded (§11.5): commission is **computed** —
   `1% × freight + 5% × customs + 5% × doc`, then `−3% WHT`, split into a SALES and a
   DOC payout. Pacred has no commission table — build one to that formula, attributed
   to `SALES`, paired with the sales dashboard (`salerank.html` aggregations).
4. **A pricing worksheet / quote calculator.** `แบบฟรอมออกราคา IMPORT` is the staff
   pricing tool — port it to an admin "build a quote" UI: cost build-up → markup
   (the §11.1 `30/25/20/15/10%` ladder) → the 3 sell buckets → QO. **The §11.4 rate
   cards must be admin-editable, 3-tier (ปลีก/ประจำ/ส่ง) DB tables** — not hard-coded.
5. **A billing-vs-cost reconciliation view.** Compute `invoice_total − Σ job_costs`
   per job and flag jobs billed below cost. This automates workflow step C9.
6. **A PEAK reconciliation bridge.** Until the PEAK API is live, replicate
   `parsePeakReport` — import the PEAK Excel export and diff it against Pacred's own
   invoices/receipts so the `ภพ.30` gap is caught, not discovered at audit.

### 9.2 🚩 Money-handling risks Pacred must guard against

1. **🔴 Profit double-counting.** `getFinancialSummary` does
   `net_profit = profit_ar − ap_total`, but `profit_ar` was already `revenue − cost`.
   If `cost` and `Σ AP` describe the same outflows, the cost is subtracted twice. **A
   job's cost must have ONE source of truth** — the AP ledger — and `profit` must be
   *derived* (`revenue − Σ confirmed AP`), never a separate hand-entered cell.
2. **🔴 Staff-entered `profit` (and `cost`).** ACC col 15 is typed by hand, not
   computed. A typo silently misstates margin and commission. Pacred: make profit a
   computed column; never writable.
3. **🔴 Free-text Shipment ID as the only join key.** The legacy code needs
   `normalizeIdForMatch` to survive zero-width chars / BOM in the key. A mismatch makes
   an AP cost an **orphan** (`apOnlyEntries`) — silently dropped from its job's profit.
   Pacred: the job ID must be a real FK (uuid PK + immutable human code), with
   referential integrity, not string-matched.
4. **🔴 กองกลาง float has no ledger discipline.** A 19 MB spreadsheet, reconciled with
   the customs agent by hand (`Flow งาน.txt`). No double-entry, no audit trail, no
   "who approved this เบิก". **High embezzlement / leakage surface.** Pacred: every
   disbursement needs an approver, an audit row (ADR-0014 pattern), and the fund
   balance must be a computed running total.
5. **🟠 Inconsistent service-fee rate cards.** `เคลียร์งานแอร์.txt` itself states the
   service fee as `800/1500` in one line and `650 เสมอ` / `1500` in another. Manually-
   maintained rate cards drift. Pacred: rate cards = versioned DB tables, single source.
6. **🟠 No WHT model in the legacy ERP** (only a PEAK `withheld` *report* parser). When
   a juristic customer withholds tax, the legacy receipt total ≠ cash received → the
   reconciliation gap. **ADR-0015 already fixes this** — make sure the freight invoice
   honours `net_expected` and gates the receipt on the 50-ทวิ certificate.
7. **🟠 Two legal entities, one tax ID reused.** Jobs split across `AXELRA`
   (`0105564077716`) and `NNB` (`0115567039173`). Invoices/receipts/VAT filings must be
   issued under the **correct entity** — Pacred must carry an explicit `billing_entity`
   on every invoice and never let the wrong tax ID print (RD compliance + ADR-0006).
8. **🟠 Open CargoThai webhook.** `_ctHandleWebhook` accepts any POST with no auth /
   signature — anyone can inject fake container-status rows. Pacred's webhook
   receivers must verify a signature/secret.
9. **🟠 Manual PEAK mirroring.** The ERP AR/AP sheets and PEAK are reconciled by
   exporting Excel. Two books drift → the `฿15,192` ภพ.30 gap. Pacred should treat one
   system as source of record and reconcile the other automatically.
10. **🟡 Slip-as-image, no amount match.** Payment slips are dragged into a Drive
    folder; nothing checks the slip amount equals the invoice. Pacred should record a
    payment `amount_thb` and compare it to `net_expected` (per the freight-payment
    spec) before confirming.

---

## 10. Excel extraction pass — DONE (2026-05-17)

The 5 workbooks + 2 ZIPs were extracted to text and read. What each yielded:

| File | What was found |
|---|---|
| `แบบฟรอมออกราคา IMPORT .xlsx` | The **pricing worksheet** — 14 tabs (IM EXW/FOB/CIF × SEA FCL/LCL/AIR + service-catalogue + term-glossary). Each tab is a cost-buildup of ~20 line items → `รวมราคา` total, with `COST`/`PROFIT` columns. All rate cards embedded — see §11.4. |
| `AXELRA Cost & Profit & Com.xlsx` | **Not** the `4.1ACC` ledger. 4 tabs: markup-policy (§11.1), Google-Form enquiries, truck Cost/Price table (§11.3), monthly sea-freight rate card (§11.2). |
| `AXELRA & NNB BOOKING.xlsx` | Confirmed sheets: `รหัสใบเสนอราคา` (QO-code scheme), `ตรวจ COMMISSION` (the **commission ledger** — §11.5), `SHIPMENT ตารางงาน`. Commission columns verified (§11.5). |
| `ACC - AXELRA&NNB เบิกเงิน.xlsx` | The AP "เบิก" sheets — `SHIPMENT ตารางงาน` (per-CBM sell rate column), `Axelra เบิกเงินค่าสินค้า`, `Axelraเบิกเงินทั่วไป`. Status values + columns verified (§11.6). |
| `ข้อมูลการเบิก-จ่ายกองกลาง.xlsx` | The **China-warehouse central-fund cash book** — monthly sheets, CNY-rate column. Decoded in §5.3 + §11.6. |
| `ตัวอย่างราคาขาย…zip` | 449 sample per-job pricing sheets (ใบประหน้า Pricing) — same line-item structure as §11.4. Real worked totals: §11.7. |
| `ข้อมูลเช้ก…zip` | Customs documents — supplier `COMMERCIAL INVOICE` / `PACKING LIST` / `SALES CONTRACT` (CNY unit-price × kg). Used for declared-value, not pricing. |

---

## 11. Verified rate cards & figures (extracted 2026-05-17)

> All numbers below are **real cell values** from the Excel dumps. THB unless noted.
> The pricing worksheet quotes **3 customer tiers**: `ปลีก` (retail) / `ลูกค้าประจำ`
> (regular) / `ส่ง` (wholesale) — most fixed fees are tier-flat, services tier-scaled.

### 11.1 Markup policy — `Cost & Profit & Com → เงื่อนไข จ๊อบการทำงาน`

- **Profit ladder (`อัตราการ+กำไร`):** Freight (`เฟรท`) and transport (`ขนส่ง`) each marked
  up at one of **`30% · 25% · 20% · 15% · 10%`** — staff pick the tier (bigger/regular
  customer = lower %). This is the markup the §3.1 `SALE_*` buckets bake in.
- **Credit terms:** `7 / 15 / 30` days; a **credit service charge of `1.25%`** applies;
  negotiable for large customers.
- **Cancellation:** if a customer cancels after work started, charge **50% of the service
  fee, or ฿1,500** (`ปิดตรวจ` example: ฿3,500 service → ฿1,500 retained).

### 11.2 Sea-freight rate card — `Cost & Profit & Com → FRE IM SEA FCL`

Monthly carrier rate sheet, **China → Thailand**, ~500 rows Mar-2025…Feb-2026.
Columns: `AGENT · Continent · Country · POL · POD · CARRIER · EXCHANGE · 20'USD ·
20'THB · 40'USD · 40'HQ'USD/THB · EXPIRE · schedule · localcharge (เมืองนอก / เมืองไทย)`.
Freight quoted **per container in USD**, converted at **EXCHANGE = 34–35 THB/USD**.

Representative ocean-freight ranges (CNY/route-dependent, China→PAT/LCB):

| Route (POL→POD) | 20' USD | 40' USD | 40' THB (≈) |
|---|---|---|---|
| Nansha → PAT | 175–730 | 330–1,350 | 11,550–47,250 |
| Shekou → PAT | 160–650 | 230–1,250 | 8,050–43,750 |
| Shanghai → PAT | 350–680 | 700–1,480 | 24,500–51,800 |
| Qingdao → PAT | 600–1,480 | 650–1,580 | 24,500–55,300 |
| Tianjin → PAT | 600–1,350 | 650–1,750 | 22,750–61,250 |

Carrier **local charges (USD/bill or /cont):** `Manifest USD75/bill · Booking USD15–50/bill ·
EDI USD10/cont · DTHC USD120–180/cont · D/O USD75 · ค่าลาก USD15–50 · ค่าคืน USD15–30`.

### 11.3 Truck/inland rate card — `Cost & Profit & Com → Transport`

~280 rows, **port → Thai-province delivery**. Columns include `Cost (ต้นทุน)` and
`Price (ราคาขาย)` — direct evidence of the cost-vs-sell margin. Examples:

| Route | Vehicle | Cost | Sell price |
|---|---|---|---|
| Khlong Toei → Phitsanulok/Nakhon Sawan | head-truck FCL40 | 27,000 | 29,000 |
| Khlong Toei → Lamphun/Nakhon Sawan | head-truck FCL40 | 31,000 | 39,000 |
| Khlong Toei → Phuket (FCL20) | NINE SPEED | 28,000 | 33,000 |
| Port → Pathum Thani (LCL, 0.11 CBM) | 4-wheel | 1,600 | 2,000 |

BKK-metro container haulage **cost** runs `~4,000–6,500` (20'/40'); long-haul upcountry
`23,000–45,000`. Margin on inland is thin — often `0–8,000` THB, frequently the sell
price equals cost (a margin-leak flagged in §9).

### 11.4 The ออกราคา IMPORT rate card — `แบบฟรอมออกราคา IMPORT`

The customs/local-charge line items, **3-tier** (ปลีก / ลูกค้าประจำ / ส่ง):

| Line item | 20' (ปลีก/ประจำ/ส่ง) | 40' (ปลีก/ประจำ/ส่ง) |
|---|---|---|
| ค่าบริการจองเฟรท (DOC / freight booking) | 3,500 / 3,000 / 2,500 | 3,500 / 3,000 / 2,500 |
| Customs Clearance (พิธีการ) FCL | 4,000 / 3,500 / 3,000 | 4,500 / 4,000 / 3,500 |
| Customs Registration (ลงทะเบียนกรมศุล) | 1,500 (flat, one-time) | 1,500 (flat) |
| Customs Paperless (ค่าธรรมเนียม) | 200 (flat) | 200 (flat) |
| Import Declaration Paperless / EDI | 350 / 250 / 200 | 350 / 250 / 200 |
| D/O Receiving Fee | 421 (flat) | 421 (flat) |
| D/O Services (ใบตราส่ง, by carrier) | 6,000–8,000 | 8,000–13,000 |
| Customs Overtime (ค่าล่วงเวลา หลัง 17:00/เสาร์) | 400 (flat) | 400 (flat) |
| Additional Customs Services (ปิดตรวจ) | 1,000 (flat) | 1,000 (flat) |
| Gate Charge — PAT / LCB | 1,250 / 1,000 | 2,500 / 2,000 |
| Rent (ค่าเช่าโกดัง 3 วัน) — PAT / LCB | 1,765.50 / 670 | 3,049.50 / 1,070 |
| Transport BKK-metro — PAT / LCB | 6,000–5,500 / 11,000–10,000 | 8,500–7,000 / 12,000–11,000 |
| Permission Service (ใบอนุญาต อย./มอก.) | 1,500 / 1,300 / 1,000 | 1,500 / 1,300 / 1,000 |
| Labor Unloading | 3,500 / 3,200 / 3,000 | 4,000 / 3,800 / 3,500 |
| Employee Overtime | 1,000 / 800 / 500 | 1,000 / 800 / 500 |
| STAMP SIGNATURE (ค่าตรายาง) | 350 | 350 |
| VAT 7% | ตามมูลค่าสินค้า (per goods value) | ตามมูลค่าสินค้า |

**SEA LCL — China-side (Shanghai EXW/FOB), 3-tier:** ค่าขนส่งจีน-ไทย **`2,200 / 1,800 /
1,600` THB per CBM** · `B/L # CUSTOM/EXW 2,500/2,000/1,500` · `DOC service 3,500/3,000/
2,500` · `FORM E / CO 2,500/2,000/1,500` → China-side net **`6,000 / 5,000 / 4,000`**.
**Thailand-side LCL net `8,571 / 7,950 / 7,200`.** Inland LCL: 4-wheel (1–5 CBM/1,500 kg)
net `1,990/1,790/1,690`; 6-wheel (6–30 CBM/6,000 kg) net `4,280/4,080/3,980`.
**SEA LCL freight itself:** `USD 15/CBM` (≈฿510–1,020/CBM at EX 34) — air-LCL similar.
**Worked-total examples (รวมราคา) from the form:** FOB SEA FCL ≈ ฿41,086 (20') /
฿66,120 (40'); CIF SEA FCL ≈ ฿16,736 (20') / ฿24,770 (40'); EXW SEA LCL ≈ ฿20,461;
CIF SEA LCL ≈ ฿13,511–14,801; CIF AIR ≈ ฿10,211–13,301.
**AIR China-side (Shanghai):** DTHC USD1, DOC USD65, CUSTOM USD75, EXPORT LICENSE
USD60, PICK UP USD110, WAREHOUSE USD30, F/E USD40.

### 11.5 Commission model — `AXELRA & NNB BOOKING → ตรวจ COMMISSION`

The commission **is computed, per the three sell buckets** — header columns confirm:

```
ยอดขาย LCL/CARGO       → COMMISSION 1%
ยอดขาย Customs Clearance → COMMISSION 5%
ยอดขาย Document Handling → COMMISSION 5%
TOTAL COMMISSION = sum of the three
ยอดรวมหัก 3% ส.พ.  ← TOTAL COMMISSION minus 3% withholding
```

So the legacy `COMMISSION` column (booking col 53) is **not flat** — it is
`1% × freight + 5% × customs + 5% × doc`, then a **3% WHT** is deducted to give the
net payable. Worked rows confirm: e.g. customs ฿3,000 → comm ฿150; doc ฿3,500 → ฿175;
total ฿325 → after −3% = ฿315.25. Commission is split into a **SALES** payout and a
**DOC** payout, each tracked `รอดำเนินการ → จ่ายแล้ว` with a pay date.
This sheet also confirms `profit` is **staff-tracked, not auto-derived** — there is no
`=revenue−cost` formula; the per-job ledger holds typed numbers (§4 / §9.2 risk #2 holds).

### 11.6 AP "เบิก" + per-CBM sell rate — `ACC - AXELRA&NNB เบิกเงิน`

- **`SHIPMENT ตารางงาน`** has a `ราคาขาย THB ต่อ CBM,KGM` column — the **per-CBM (or
  per-kg) sell rate** for consolidation jobs. Observed values **฿7,860–฿27,181 per
  unit**; NNB โชห่วย (mixed-cargo) sea jobs cluster **฿8,000–฿19,000**, almost all at
  **68 CBM** container fill. EK-CARGO / air jobs priced as a lump sum, not per-CBM.
- **`Axelra เบิกเงินค่าสินค้า`** (ฝากจ่าย / pay-on-behalf) columns: `ลำดับ · วันที่ ·
  ชื่อในไลน์/ใบวางแจ้งหนี้ · SHIPMENT · QUOTATION · หมวดหมู่รายการเบิกเงิน · รายการ ·
  จำนวนเงินยอดเบิก · จำนวนเงินยอดคืน · ชื่อบัญชี · เลขบัญชี · ธนาคาร · สถานะโอนเงิน ·
  วันที่โอน · เวลา · สถานะการตามใบเสร็จ`. Disbursement amounts are large CNY goods
  payments (`CNY × rate`, rate **4.54–4.66**) paid via **สแกนจ่าย Alipay**; status
  observed = `โอนแล้ว`. Categories: `ต้นทุนบริการ`, `โอนคืนลูกค้า`.
- **`Axelraเบิกเงินทั่วไป`** (general reimbursement) columns: `ลำดับ · วันที่ · จำนวนเงิน ·
  รายการเบิกเงินทั่วไป · หมายเหตุ · หัก ณ ที่จ่าย · ชื่อผู้เบิกเงิน · ชื่อบัญชี · เลขบัญชี ·
  ธนาคาร · สถานะโอนเงิน · วันที่โอน · เวลาโอน · เลขที่ใบหัก ณ ที่จ่าย · เอกสารอ้างอิง ·
  เลขที่ใบเสร็จรับเงิน`, grouped by `ประจำเดือน MM/YYYY` with per-batch `รวม`. Status
  values in use: **`โอนแล้ว` / `ไม่มีโอน`**, and batch tags `เบิกแล้ว` / `ยังไม่ได้เบิก`,
  rounds `รอบเช้า 09.30` / `รอบบ่าย`. Office costs ฿100–฿20,000 (stamps, fuel, software,
  ปิดตรวจ-officer cash ฿6,000–฿10,000/mo).
- **กองกลาง CNY rate** (`ข้อมูลการเบิก-จ่ายกองกลาง`): observed **4.54–4.66** CNY→THB
  per top-up; ฿45,400–45,900 per 10,000-CNY round; the float is **halved (`ยอดหาร`)**
  between TTP and PCS.

### 11.7 Per-job sell-price examples — `ตัวอย่างราคาขาย` ZIP (449 sheets)

Each is a per-job `ใบประหน้า Sale and Pricing` using the §11.4 line items + a freight
row + `COST` / `PROFIT` columns. Worked examples:

- **Export CIF SEA FCL** (BKK→Iraq): freight USD1,620 (20')/USD2,200 (40') →
  SALE ฿55,080 / ฿74,800; profit on freight ฿270 (20') / ฿400 (40'); transport cost
  ฿25,000 → sell ฿26,000 (profit ฿1,000). **รวมราคา ฿97,891 (20') / ฿130,911 (40').**
- **Import FOB SEA FCL** (Shekou→BKK, plastic pellets): freight USD1,080 → ฿36,720
  (zero freight margin); customs-clearance cost ฿500 → sell ฿4,500 (profit ฿4,000);
  transport cost ฿6,000 → sell ฿7,000. **รวมราคา ฿74,140.**
- **Import EXW SEA FCL** (Nansha→LCB): China local charges (THC USD125/180, DOC
  USD75, customs USD50, pickup USD290) passed through; TH customs-clearance profit
  ฿4,000–7,500. **รวมราคา ฿89,021 (40') / ฿143,361 (2×20').**
- **Export CIF SEA LCL** (LCB→USA): freight **USD110/CBM** + AMS USD30 → ฿15,400 +
  ฿1,050; total **฿27,811** for 4 CBM.

Pattern: **freight is often passed through at ~0 margin**; the **profit lives in the
customs-clearance and DOC buckets** (cost ฿500 → sell ฿2,500–8,000) and a thin
transport margin. This matches the §11.5 commission split (1% freight vs 5% customs/doc).

---

**End — `legacy-accounting-billing-workflow.md`.** Logic decoded from the Apps Script
backend (§3–§7); Excel rate tables extracted and verified (§0, §10, §11).
