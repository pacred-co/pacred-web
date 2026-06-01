# Freight pricing / booking model (excels) — 2026-06-01

**Cluster:** FREIGHT PRICING / BOOKING MODEL.
**Sources** (all under `/Users/dev/Desktop/olddata dev/data งานเก่า/`):
- `Project dev/AXELRA Cost & Profit & Com.xlsx` — **THE freight pricing model** (16 sheets: job-conditions, Google-Form responses, Transport, FRE IM/EX SEA FCL/LCL, FRE IM/EX AIR, EK IM/EX, COST, ACC AR, Profit-ledger, NNB tax-package).
- `data and excel data/AXELRA & NNB BOOKING.xlsx` + `PACRED & PCS BOOKING.xlsx` + `…เปลี่ยนเจ้าของแล้ว.xlsx` — the **booking/shipment operating system** (16 sheets: the pricing→sale→booking→doc→acc→commission pipeline).
- `Project dev/แบบฟรอมออกราคา IMPORT .xlsx` — the **import quote-builder form** (per-incoterm × per-mode rate sheets with COST/PROFIT/TAX + 3-tier sell prices).
- `data and excel data/เครื่องมือสรุปการโทรออก.xlsx` — the **call-tracking tool** (VoIP CDR → per-rep call pivot).
- `data and excel data/เครื่องมือสรุปยอดขาย PCS.xlsx` — sales summary (revenue + per-rep commission).
- `Project dev/Flow งาน.txt`, `ท่า Port.txt` — workflow + customs-port reference.

> **One-line thesis:** This is a **freight forwarder / customs-broker ERP run on Google Sheets** (AXELRA = the old company; NNB = its DDP "tax-package-under-shipping-name" sub-brand; PACRED & PCS = the rebrand to our entity). Pacred's *cargo* side (China→TH consolidation) is ported; this *freight* side (FCL/LCL/AIR/truck import-export + customs clearance + the quote→booking→commission pipeline) is **almost entirely missing** from our system. Everything here maps onto entities we could build natively.

---

## 1. BUSINESS MODEL / WORKFLOW

### 1.1 What the business does
International **freight forwarding + Thai customs brokerage**, China-centric, all modes:
- **SEA FCL** (full container, 20'/40'/40HQ), **SEA LCL** (share-container, priced per CBM), **AIR** (priced per KG with weight breaks), **TRUCK / EK** (cross-border China→Mukdahan/Laem Chabang container trucking), and **domestic transport** (last-mile by truck type).
- Both **IMPORT** (นำเข้า) and **EXPORT** (ส่งออก), but the business is ~95% import-from-China.

### 1.2 The two "brands" / service styles (load-bearing)
The same back office runs two product lines that differ by **who holds the customs paperwork**:

| Brand | Style | Customs name on declaration | Documents to customer | Tax | When used |
|---|---|---|---|---|---|
| **AXELRA / PACRED** | Real, by-the-book | **Customer's own name** (ใบขนชื่อลูกค้า) | Real ใบขน + ใบกำกับ VAT 7% | Correct, declared 100% | Customer needs documents to import legally / claim VAT |
| **NNB** ("เหมาภาษีชื่อชิปปิ้ง") | Flat-rate "tax included under shipping's name" | **Shipping company's name (NNB)** | **No documents** (NON) | Bundled into a flat container price | Customer just wants goods landed cheap, no paperwork |

NNB = **DDP flat-rate share/whole-container** (e.g. 20' single-item from 155,000฿; 40' from ~185,000฿; +30,000฿ if licensed goods) — origin Yiwu/Guangzhou. AXELRA/PACRED = itemised freight + customs + transport, customer's name, full docs.
*(This is the freight-side analogue of cargo's "A/M/X/O/Z type" + the cargo "แผน VAT" engineering already decoded in `docs/audit/cargo-ops-forensics-2026-05-16.md`.)*

### 1.3 Incoterm = the scope selector (drives the quote)
`เงื่อนไข term` sheet — the 5 import incoterms define exactly which legs the customer buys (= which cost lines appear in the quote):
1. **DDP** — buyer books freight + customs + Thai transport (door-to-door, all-in).
2. **EXW** — buyer pays from factory door: freight + customs + Thai transport + origin pickup.
3. **FOB** — buyer pays freight themselves; we do customs clearance + Thai transport.
4. **CIF** — **Thai customs clearance only** + Thai transport (most common; freight already paid by seller to TH port).
5. **CFR** — book the freight (sea/air) + Thai transport, clearance by customer.

### 1.4 The job lifecycle (the operational pipeline)
From the booking workbook's numbered sheets — this is the **state machine**, run as a relay across teams:

```
LEAD/QUOTE INTAKE → PRICING → SALE/BOOKING → DOC (CS) → DOC PLAN → ACC (AP+AR) → STATEMENT → COMMISSION payout
  Google Form /        PRICING       SALES        DOCS CS /     3.1 PLAN     ACC AP /     bank        HR
  "ส่งสอบถามราคา"      checks rate    closes deal  DOCS BILLING  status track ACC AR       reconcile   pays com
```

**Status vocabulary observed** (the real enum values in `STATUS` / `สถานะงาน PRICING` / `สถานะงาน SALES` columns):
- Pricing/sales funnel: `SALE เสนอราคาลูกค้า` (quote sent) → `SALE สอบถามขอมูลลูกค้าเพิ่ม` (need more info) → `รอลูกค้าตัดสินใจ` (awaiting decision) → `SALE ลูกค้าตกลงรับงาน` (won) / `ยกเลิก` (cancelled).
- Operational shipment status: `รอยิงใบขน` (awaiting declaration filing) → `ปิดตรวจ` (inspection closed/cleared) → `สำเร็จ` (done). Plus per-leg date stamps `ETD/ATD/ETA/ATA` and `วันที่ส่งสินค้า` (delivery date).
- `ตกลงรับงาน` boolean = the win/loss gate from PRICING→SALE.

**The NNB sea & truck SOP** (`Flow งาน.txt`) is a literal 12-step checklist per job: draft INV/PL/declaration → check ETA + carrier "Enter" mail → request D/O + rent advance → swap D/O → plan inspection + delivery date → book truck (group "เชษฐ์พิทักษ์") → file declaration + pay duty → release + clear → assemble billing set. **This is the workflow Pacred lacks entirely** — our cargo system handles consolidation, not this customs-clearance relay.

### 1.5 Credit terms & job-doc structure (`เงื่อนไข จ๊อบการทำงาน`)
- **Document set = 4 parts** per job: (1) cover sheets (Sale + Pricing covers + slips), (2) quotation set (ใบเสนอราคา + ใบแจ้งหนี้/invoice + ใบเสร็จยอดโอน), (3) reimbursement set (ใบเบิกเงิน + slips, payer = company / shipping / customer), (4) operational docs (inspection orders, ใบขน, etc.).
- **Profit-margin tiers:** freight + transport priced at **30 / 25 / 20 / 15 / 10 %** markup bands.
- **Credit:** terms **7 / 15 / 30 days**; credit-service fee **1.25 %**; negotiable for big customers.

---

## 2. DATA MODEL (entities, fields, statuses, codes)

### 2.1 The BOOKING / SHIPMENT entity (`2.SALE BOOKING SHIPMENT COMMI` — the master record, 66 columns)
This is THE central freight job entity. Field groups:

**Identity / routing**
- `DATE`, `MEMBER ID` (= customer code, e.g. `PR001` / `AX086` / `TTW`), `PRICING ORDER NO.`, `SHIPMENT เลขงาน` (job no.), `QUOTATION เลขใบเสนอราคา` (`QO-YYYYMM00NNN`), `INVOICE หมายเลขอินวอยซ์` (`IV-…`), `AGENT ตัวแทนส่ง`, `COMPANY นามบริษัท` (AXELRA / NNB / PACRED — which legal entity issues), `TYPE ประเภทงาน` (SEA / AIR / `TRUCK ใบขนทางรถ`).

**People / role assignment (the relay owners)**
- `SALES`, `PRICING`, `DOCS CS`, `DOCS BILLING`, `ACC AP`, `ACC AR` — each cell = the staff member who owns that leg (nicknames: BAM/WIN/KIMHO/POOM/PLOY/BOW/NUN/KAE…). This is the per-job RBAC/assignment.

**Parties**
- `CONSIGNEES NAME` + `CONSIGNEE ADDRESS`, `SHIPPER NAME` + `SHIPPER ADDRESS`, `PRODUCT สินค้า`, `ประเภทชำระเงิน` (payment type, e.g. `เครดิต/ตั๋ว R`).

**Shipment spec**
- `EX/IM` (`IM (N)` = import-non-doc / etc.), `SERVICE & TERM` (incoterm: CIF/FOB/EXW/DDP/CFR), `SIZE` (`FCL 20`/`FCL 40`/`LCL`/`TRUCK`), `ADD-SERVICE` (เคลียร์เจ้าหน้าที่ / ปิดตรวจ / QC / domestic), `POD ท่าปลายทาง` (LCB/PAT BKK T1-T2/มุกดาหาร/สุวรรณภูมิ), `ประเภทรถ` (truck type: หัวลาก18ล้อ / พื้นเรียบ10ล้อ / 4ล้อ / ไปรษณีย์…).

**Timeline / status**
- `STATUS สถานะ` (สำเร็จ / รอยิงใบขน / …), `ETD/ATD/ETA/ATA`, `วันที่ส่งสินค้า`, `ใบขน VAT ลง STOCK`, `(AP) ปิดชุดงาน`, `หมายเหตุการทำงาน`.

**Money / settlement**
- `วันที่ชำระ` + `เวลาที่ชำระ` + `ยอดชำระ (หัก ณ จ่าย)`, `UPLOAD 1/2 แนบสลิบ` (slip attachments), `(AR) ปิดวางบิล`, `ใบแจ้งหนี้ IV`, `ใบเสร็จรับเงิน/ใบกำกับภาษี RE/RT`.

**Pricing / commission (the per-line revenue split)**
- `ราคาขาย THB ต่อ CBM,KGM`, `CTNS`, `CBM`, `KGM`.
- Three commissionable revenue lines, each with its own rate:
  - `ยอดขาย LCL CARGO` → **COMMISSION 1 %**
  - `ยอดขาย Customs Clearance` → **COMMISSION 5 %**
  - `ยอดขาย Document Handling Charge` → **COMMISSION 5 %**
  - `TOTAL COMMISSION`, then `ยอดรวมหัก 3 % ส.พ.` (minus 3 % WHT/ภงด.).
- `HR / AC เช็คการเก็บเงิน`, `HR จ่ายค่าคอม SALES`, `HR จ่ายค่าคอม DOC`, `HR วันที่จ่ายค่าคอม`, `HR Remark` — the commission-payout state.
- Extra `COMMISSION PC Shipment` + `Negotiate USD/บาท` columns for a per-container-broker commission (the "PC" / ปิดงาน close-bonus).

### 2.2 The DOC/CS detail entity (`3.DOC DATA COMMISSION`, 65 columns)
The operations-heavy twin of the booking row — adds the customs/carrier execution fields:
`CY/DATE`, `LOADDING/DATE`, `CUTOF/DATE`, `RE`, `SI/VGM`, `TRANSHIP`, `POL`, `CARRIER`, `BL-AWY NO.`, `VESS/VOY`, `CTRN. NO.` (container no.), `SEAL CON.`, `CONFIRM B/L`, `ขอ FORM E` (ACFTA cert-of-origin request), `TRANSHIP เวียดนาม`, `TRANSIT ลาว`, `DEM/DET`, `ENTER-CONFIRM`, `รับ-แลก D/O-B/L`, `วันตรวจปล่อย` (release-inspection date), `วันที่ขึ้นตู้`, `ชิปปิ้ง`, `ชื่อใบเสร็จผ่านท่า` (port-pass receipt name), `บริษัทขนส่ง / ชื่อคนขับ / ทะเบียนรถ / เบอร์ติดต่อคนรถ` (carrier + driver), and `COMMISSION DOC CS` (note: **EK TRUCK & AIR = flat 20/shipment**, SEA = the %).
`3.1 DOC PLAN SUP` = a slimmed status-tracking view of the same (the dispatcher dashboard).

### 2.3 The QUOTE-REQUEST / lead entity — two intake channels
**(a) Web Google-Form** (`การตอบแบบฟอร์ม` in the cost workbook) — customer-facing intake, columns:
`สถานะ`, `เลขที่ใบเสนอราคา`, `ประทับเวลา`, `ชื่อ-นามสกุล`, `Line ID/Name/Phone`, `EXPORT incoterm`, `บริการ TERM CIF IMPORT`, `รูปแบบเอกสาร` (doc style: company-name vs no-doc-shipping-name), `TYPE ขนส่ง` (AIR/SEA/TRUCK), `รูปแบบ เหมาตู้/แชร์ตู้ + container size`, `IMPORT incoterm`, `Shipper`, `Consignee`, `Deadline`, `Product name`, `Dimension`, `CBM/CTNS/pallets`, `Product type` (มอก/อย/general/…), `Additional services` (Form D/E, QC, domestic), `attached docs`, `urgent contact`.

**(b) Internal pricing-request queue** (`ส่งสอบถามราคา PRICING`) — sales→pricing handoff, columns:
`DATE`, `ORDER NO.` (`YYYYMMDD-NNN`), `SHIPMENT`, `สินค้าคือ`, `COMPANY` (AX/NNB), `PRICING` (assigned pricer), `SALES` (assigned rep), `TERM` (IM CIF/FOB/EXW), `ขนส่งทาง`, `FCL/LCL`, `ขนาดตู้`, `คลัง` (warehouse: BFS/เรือ), `ชื่อลูกค้า`, `POL`, `POD`, addresses, `ราคาที่ต้องการ` (target price), `HS CODE`, `ใบอนุญาติ` (permit), `ตกลงรับงาน` (won bool), `สถานะงาน PRICING`, `สถานะงาน SALES`, `เวลาที่ SALE/DOC/PS ลงงาน`.

### 2.4 The RATE CARDS (`AXELRA Cost & Profit & Com.xlsx` — per-mode sheets)
Each freight mode is its own rate table. Common spine + mode-specific rate columns:

**FRE IM SEA FCL** (import full-container) — the richest:
`เดือน`, `AGENT`, `Continent`, `Country`, `POL`, `POD`, `CARRIER`, `EXCHANGE` (e.g. `35/USD`), **`20' USD` / `20' THB` / `40' USD` / `40' THB` / `40 HQ' USD/THB`** (the ocean-freight cost), `EXPIRE`, schedule (`CLS`/`Time`/`ETD`/`ETA`/`T/T`/`T/S`/`LSS`/`RTN`), then **Local Charge เมืองนอก** (overseas: BL/BL-Surrender/AFS/THC 20-40-HQ/CFS/SEAL/FORM/Transport/DOC/CUSTOMS CLEARANCE/Manifest/Booking/EDI) + **Local Charge เมืองไทย** (Thailand: D/O / ค่าลาก / ค่าคืน / พิธีการ per 20'/40'/40HQ), plus incoterm split columns **CFR / FOB / EXW**.

**FRE IM SEA LCL** — same spine but rate columns are **per-CBM bands**: `0-3 CBM` / `3-10 CBM` / `5-15` (e.g. `5$/CBM`), + LCL-specific locals (VGM, EBS+CIC, LICENSE, MANIFEST).

**FRE IM AIR** — rate by **weight break**: `KGM/45+`, `KGM/100`, `KGM/250`, `KGM/350`, `KGM/450`, `KGM/550` (e.g. `USD 2/KGS`), AWB-based locals.

**FRE EX SEA FCL / LCL / AIR** — export variants; columns `SALE/20'`, `SALE/40'` and Local-Charge groups split by **PORT / CIF&CFR / EXW** + DDU-DDP-with-agent.

**EK IM / EK EX** — the cross-border container-truck mode; links the freight job to the **same cargo container model** Pacred already has: `Number of booking`, `Container code` (e.g. `GZS251122-1` — identical scheme to `tb_cnt`/`momo_sack`!), `Container no.` (`CAAU9582998`), `TRACKING NUMBER`, `WEIGHT`, CY/Loading/ETD/ETA/RTN. **This is the bridge: EK freight jobs and cargo containers share the GZS/GZE code namespace.**

**Transport** (domestic) — `Consignee`, `Freight of Transport` (SEA/AIR), `Container Size`, `Origin`, `Destination`, `Product`, `Weight`, `CBM`, `Carrier (truck co.)`, `Truck Type` (รถหัวลาก / 4ล้อ / เฮี้ยบ6ล้อ), **`Cost (ต้นทุน)` + `Price (ราคาขาย)`** — the buy/sell pair for the last-mile leg.

### 2.5 The QUOTE BUILDER (`แบบฟรอมออกราคา IMPORT .xlsx`)
Per-incoterm-per-mode quote sheets (`IM EXW SEA FCL`, `IM CIF AIR`, `IM FOB TRUCK`, …). Left column = job header (Shipper/Consignee/Description/POL/POD/Carrier-agent/Transport-agent/Pricing-name/Shipment-no/Quotation-no). Right block = **itemised line items with explicit `COST` / `PROFIT` / `TAX` and 3 sell tiers** `ปลีก (retail) / ลูกค้าประจำ (regular) / ส่ง (wholesale)`:
- Ocean/Air Freight Charge, D/O fee (per port: PAT/LCB, per size), Customs Registration (1,500), Customs Paperless (200), Import Declaration Paperless (200-350), Package DOC (Clearance + DOC Freight, 3,000-4,500), Transport (by distance), Gate Charge.
- Example margins (`IM CIF AIR`): Customs Clearance SELL 3,500 / COST 500 / PROFIT 3,000; Customs Registration SELL 1,500 / COST 800 / PROFIT 700; Declaration SELL 350 / COST 200 / PROFIT 150.

### 2.6 The PROFIT LEDGER (`Profit AXELRAPRICING` — the per-job P&L, ~56 columns)
The most valuable analytical sheet. Per completed job: `DATE`, `รหัสลูกค้า` (`AX001`…), `INV`, `PO`, `เลขใบเสนอราคา`, `Type`, `SIZE`, `CARRIER`, `CTNS/CBM/KGM`, `POD`, address, `CS`, `Sales`, `EX/IM`, `SERVICE`, `Consignees`, `POL`, `D/T`, dates, booking/BL/container no., then **THREE cost-check/sell/margin/commission blocks** —
1. **เฟรท** (freight): `เช็ค` (cost) / `ขาย` (sell) / `ต่อ` / `กำไร` (profit) / `ต่อลองได้` + `com.20% USD/THB`
2. **ขนส่งต้นทาง** (origin transport): same 4 + `com.20%`
3. **ขนส่งไทย** (Thai transport): same 4 + `com.20%`
— then `total/com.`, `ต้นทุนซื้อ` (total cost), `ราคาขาย` (total sell), `vat 7%`, `เงินทดลองจ่าย` (advances/disbursements), `ยอดสุทธิ` (net), `Profits`, `กำไรรวมทั้งหมด %`, and a separate `custom จ่ายเจ้าหน้าที่` / `custom เก็บลูกค้า` / `Profits custom` (the under-the-table customs-officer pay vs what's charged to the customer — the margin on "เคลียร์เจ้าหน้าที่").

### 2.7 Reference codes
- **Member/customer code:** `PR001`/`PR002` (Pacred), `AX001…AX086` (Axelra), `TTW`/`TTP`/`NNB` (partner-entity jobs) — same min-3-digit running scheme as cargo.
- **Shipment no.:** `PR26040001` (Pacred freight), `A2600200036`/`A2501200062` (Axelra A+yyMM+seq), `GZS251202-T2` (sea-container job, GZS = the cargo container namespace).
- **Quotation no.:** `QO-YYYYMM00NNN`. **Invoice:** `IV-YYYYMM000NN`. **Receipt/Tax-inv:** `RE-…` / `RT-…`.
- **Rate-card template keys:** `SEA_FCL_CIF40_LCB`, `AIR_CIF_4ล้อ`, `CARGO_เรือ`, `NNB` — composable `{mode}_{incoterm}{size}_{port}` keys.
- **Customs port codes** (`ท่า Port.txt`): SEA `0119`=BKK port, `2801`=Laem Chabang, `0121/0122`=T1/T2; AIR `1190`=Suvarnabhumi, `1193`=BFS(Fedex/DHL); TRUCK `3601`=Mukdahan. POD shorthand `PAT`=BKK, `LCB`=Laem Chabang, `SUV`=Suvarnabhumi.

### 2.8 Commission model (canonical — the payout rules)
- **SALES rep:** 1 % of freight/cargo sell + 5 % of Customs-Clearance sell + 5 % of Doc-Handling sell ("5%+5%+1%" per `SETUP PRICING`). Cargo-style sales also earn **1 % of import value** (`เครื่องมือสรุปยอดขาย`).
- **DOC/CS:** flat **20฿/shipment** for EK-truck & AIR; the % for SEA.
- **PC (ปิดงาน / container-close broker):** separate negotiable USD/THB bonus.
- **MESSENGER:** **25฿/location** for document runs (`MESSENGER จ่ายงานแมส`).
- **All commissions − 3 % WHT (ส.พ./ภงด.)**; HR pays out with date + slip + remark state.

---

## 3. SYSTEM / API RELATIONSHIPS (AX ↔ TTP ↔ CargoThai ↔ MOMO ↔ JMF ↔ PCS)

- **AXELRA = the old freight company**; **NNB** = its no-doc DDP flat-rate sub-brand (shipping holds the declaration). **PACRED & PCS BOOKING.xlsx is the verbatim rebrand** of `AXELRA & NNB BOOKING.xlsx` — identical 16-sheet template, only `COMPANY` flipped AXELRA→PACRED, member codes AX→PR, kept the same SHIPMENT/QO/IV numbering. The "เปลี่ยนเจ้าของแล้ว" (owner-changed) file is the handover snapshot. **→ The freight ERP was already being lifted into Pacred's identity; we just never built the software.**
- **CARGOTHAI_LOG sheet** (in both booking files) = a **webhook receiver**: rows `received_at / dataStatus (PARSING…) / sm_code / status / raw_preview` capturing URL-encoded `data[container_name]=…` posts. This is a **CargoThai → Sheet inbound status feed** (the same "fire container status APIs to each other" relationship the CEO described between AX↔TTP, now CargoThai). `sm_code` ties to the sea-container shipment.
- **TTP / TTW** appear as `AGENT`/`COMPANY`/customer (`THE N N B TRADING`, `TTW บางกระดี่ warehouse`) on NNB sea jobs — confirming AX+TTP closed sea containers together; the container no./seal/carrier flow on those rows is the shared close-container data.
- **MOMO** appears as the China-side CS contact on container handoffs (`OMO CS.ผึ้ง`). Pacred now closes containers with MOMO (per `momo_*` tables) instead of TTP — the EK/GZS container namespace is the join.
- **JMF (ไอแต้ม)** — not in these pricing/booking sheets directly (it's the cargo-web + a partner consolidator); but EK/GZS container codes are the shared spine across JMF/MOMO/TTP/CargoThai.
- The booking workbook is backed by **Google Apps Script** (`Code.gs`, `SCRIPT GG SHEET - รหัส.gs`, `(hub)Code.gs`) + HTML front-ends (`AX BOOKING.html`, `AX JOB.html`, `axelra_login_th draft.html`) — i.e. it was being turned into a Sheet-backed web app (Apps-Script-as-backend) with a login + booking/job UI. **PEAK accounting** is the downstream system (invoice/receipt links `doc.peakaccount.com/invoice?…` live in the booking rows).

---

## 4. WHAT PACRED LACKS (gap vs our current cargo system)

Pacred's cargo system (`tb_forwarder`/`tb_cnt`/`tb_header_order`/`tb_payment`/`tb_wallet`) covers **China→TH consolidation (ฝากสั่ง/ฝากนำเข้า/ฝากโอน)** — a *self-serve* model where the customer pre-pays a wallet and we forward goods. The **entire freight/customs-broker business is absent**:

1. **No freight QUOTE entity / quote-builder.** No `quotation` table, no incoterm-driven line-item pricing, no `QO-` numbering, no 3-tier (retail/regular/wholesale) sell, no COST/PROFIT/TAX per line. The Google-Form intake + `ส่งสอบถามราคา` queue have no equivalent.
2. **No freight BOOKING / SHIPMENT entity.** The 66-column shipment record (parties, incoterm, POL/POD, carrier, BL/AWB, container/seal, ETD/ATD/ETA/ATA, customs status) has no home. Our `tb_forwarder` is cargo-consolidation, not a B2B freight job.
3. **No customs-clearance workflow.** No ใบขน (declaration) filing, no D/O exchange, no FORM E (ACFTA), no DEM/DET, no port-pass, no inspection/release state, no HS-code/permit handling. The 12-step NNB SOP is entirely manual-in-chat today.
4. **No rate-card engine for FCL/LCL/AIR/truck.** No per-POL-POD-carrier ocean rate table, no per-CBM LCL bands, no per-KG air weight-breaks, no exchange-rate-per-month, no expiry/schedule. (Cargo only has the China→TH cargo rate `tb_rate_*`.)
5. **No per-job P&L / profit ledger.** No 3-block freight/origin-transport/Thai-transport cost-vs-sell-vs-margin, no `เงินทดลองจ่าย` (disbursement/advance) tracking, no `custom จ่ายเจ้าหน้าที่ vs เก็บลูกค้า` margin.
6. **No freight commission engine.** Cargo has a sales-commission (1 % of import value, already ported) but **not** the freight split (1%+5%+5% by revenue category, flat 20/shipment for DOC, PC close-bonus, 25/loc messenger, all −3 % WHT).
7. **No per-job role-relay / assignment.** No SALES/PRICING/DOCS-CS/DOCS-BILLING/ACC-AP/ACC-AR ownership per shipment (our admin RBAC is global, not per-job).
8. **No call/lead-acquisition tooling.** No VoIP CDR ingest, no per-rep call dashboard, no lead/call-queue. (This is the acquisition kickoff piece — see §2.3 of the call-tracking tool below.)
9. **No NNB flat-rate DDP product** (whole/share container, tax-bundled, no-doc) as a sellable SKU.
10. **No CargoThai/TTP/MOMO status-webhook ingestion for freight containers** (the `CARGOTHAI_LOG` receiver) wired to a shipment record.

### Call-tracking tool (the acquisition lead/call-queue piece — §1's "kickoff")
`เครื่องมือสรุปการโทรออก.xlsx` is a **VoIP/PBX call-detail-record (CDR) export → per-rep pivot**:
- **`DATA` sheet (raw CDR):** `Start Date`, `End Date`, `Duration (secs)`, `Call ID`, `Dir.` (OUT), `Local Party` (rep's outbound number, e.g. `+66992345196` = "PCS CARGO CO LTD 11"), `Remote Party` (the lead's number), `Last/First Name`.
- **Per-rep sheets** (AX BANK, AX BAM, Tangmo, But, Ploy, Fogus, MEW = the sales reps): pivot of `Remote Party` → `Count(OUT)`, `Total Seconds`, `Total Minutes`, `Last Call(Start Date)`. = an outbound-call leaderboard / dial-count per lead per rep.
- **What we'd build:** a lead/call-queue where each lead (phone) has call history, last-touch, total talk-time, and an owning rep — fed by the telephony provider's CDR webhook. Pairs with the 6,937 never-contacted leads + win-back the omni-CRM lane already wants (big-audit goldmine pattern C).
- **Revenue scale** (`เครื่องมือสรุปยอดขาย`): cargo import sales ฿11.2M (2024) → ฿20.3M (2025) → ฿5.7M (Jan-Feb 2026) — the call effort drives this; commission = 1 % of import value per rep (`admin_mew`/`admin_ploy`/`admin_but`/…).

---

## 5. MAX-POTENTIAL — how to build it BETTER (CEO "expand + improve")

The whole freight ERP is a **Google-Sheet-as-database with Apps-Script glue** — fragile, single-table, no validation, role-relay via colored cells. Pacred can build the native version that is **10× better**:

1. **Native freight `quotation` → `booking/shipment` entities** (Supabase `tb_freight_quote` + `tb_freight_shipment`) with the 66-field shipment model, the incoterm-scope selector, and the status state-machine (lead→pricing→won→doc→cleared→delivered→billed→commission-paid). Reuse the GZS/GZE container namespace to **link freight EK jobs to existing `tb_cnt`/`momo_sack`** — one container model across cargo + freight.
2. **Rate-card engine** (`tb_freight_rate_{sea_fcl,sea_lcl,air,truck}`) keyed by POL/POD/carrier/month/exchange, with FCL per-container, LCL per-CBM bands, AIR per-KG weight-breaks, expiry + schedule. An admin rate editor (we already have the pattern from cargo `tb_rate_g_*`). → instant accurate quotes vs today's manual sheet lookup.
3. **Quote-builder UI** that composes line items from the rate card + the incoterm scope + the 3-tier (retail/regular/wholesale) sell + auto COST/PROFIT/TAX, mints `QO-` numbers, renders a branded PDF, and one-click-converts a won quote into a shipment. Driven off the same Google-Form intake (port the public quote form to `/services/import` → creates a quote-request row).
4. **Customs-clearance workflow module** — declaration (ใบขน) status, D/O exchange, FORM E/ACFTA, HS-code + permit checks, DEM/DET timers, inspection/release stamps, the 12-step NNB SOP as a checklist with notifications (replaces chat-driven ops). Tie the HS-code/permit assistant (the `ท่า Port.txt` customs-strategy prompt) as an internal tool.
5. **Per-job P&L + disbursement ledger** — the 3-block freight/origin/Thai cost-vs-sell-vs-margin auto-computed, `เงินทดลองจ่าย` advances tracked against the customer's account, gross-margin % per job/rep/route surfaced in BI (feeds the profit-analytics lane).
6. **Freight commission engine** — codify 1%+5%+5% (sales), flat-20/shipment (DOC), PC close-bonus, 25/loc (messenger), all −3 % WHT, with HR payout state + slip. Unify with the cargo commission engine ภูม is already porting.
7. **Per-shipment role-relay** — assign SALES/PRICING/DOCS-CS/BILLING/ACC-AP/ACC-AR per job; each role sees only their queue; hand-off triggers a notification. (Maps onto our admin RBAC + the work-board.)
8. **Lead/call-queue + telephony integration** — ingest the VoIP CDR (webhook from the PBX), build a lead record with call-history/last-touch/talk-time/owner, an outbound-call dashboard per rep, auto-assign never-contacted leads, win-back flows. This is the acquisition engine — directly the kickoff the orchestrator flagged.
9. **NNB flat-rate DDP as a productized SKU** on the public site (whole/share container, tax-bundled, no-doc, from-price) → a lead-gen funnel feeding the quote pipeline.
10. **CargoThai/TTP/MOMO status-webhook ingestion** wired to the freight shipment (the `CARGOTHAI_LOG` receiver becomes a real endpoint updating `tb_freight_shipment.status` + container ETA) — closes the partner-API loop ก๊อต owns. Plus PEAK accounting integration (invoice/receipt links already in the data) for AR/AP.

> **Strategic note:** the freight side is **higher-margin B2B** (a single FCL customs-clearance job nets 3,000-20,000฿ profit per the ledger) vs cargo's high-volume small-ticket. Building it makes Pacred the **full-loop** import-export platform the DNA promises ("ฝากนำเข้า — FCL/LCL ทุกเทอม" already in the service catalogue but backend = TBD). The data + workflow are fully decoded here; it's a build, not a discovery.
