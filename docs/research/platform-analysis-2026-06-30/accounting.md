# Pacred accounting — the real-world money model (from the ACC spreadsheets)

> **Source:** 12 working xlsx in `C:\Users\Admin\Desktop\ข้อมูล data ต้นทุน บัญชี\` (the live accounting team's Google-Sheets-exported workbooks, มิ.ย. 2569) + the `inv_draft_system auto` Python tool. Read 2026-06-30.
> **Purpose:** map what the accounting team actually runs on (spreadsheets) → what our DB already represents → **the gap to build**. This is the AR/AP/cost/profit/tax-invoice/withdrawal/central-fund/fixed-OPEX reality, NOT the customer-portal cargo flow.
>
> **Three banks are in `lib/payment/bank-accounts.ts`:** SERVICE `204-1-55856-6` (ออมทรัพย์ · PromptPay นิติ · no VAT), LOGISTICS `225-2-91144-0` (กระแสรายวัน · ค่าขนส่งไทย/ฝากนำเข้า leg · no VAT), TRADING `232-1-07669-9` (กระแสรายวัน · **ออกใบกำกับ + VAT 7%**). The spreadsheets confirm this and add nuance below.
>
> ⚠️ **Multi-entity reality the code doesn't model yet.** The books span **PACRED + AXELRA + NNB + PCS CARGO + TTP** as separate legal entities sharing one operation. "PACRED 1440" and "PACRED 6699" are the two Pacred Kasikorn accounts (`…91144-0`=LOGISTICS, `…07669-9`=TRADING); AXELRA's account is `204-1-55856-6` (= our "SERVICE/PACRED" number — **the SERVICE PromptPay account number is actually shared/aliased with AXELRA in the books**). Cost-of-goods is reimbursed via **NNB / Haoze Song (宋浩泽)** China accounts. This entity-split is invisible in our DB.

---

## 1. `ACC - PACRED&PCS เบิกเงิน.xlsx` — the **AP / disbursement (เบิกเงิน) ledger** — THE operational heart

**Purpose:** every baht that flows OUT to do a job — the "request money / approve / transfer / chase the receipt" workflow. 16 sheets, mostly per-mode disbursement registers.

**Key sheets & columns:**
- **`เงื่อนไข จ๊อบทำงาน`** — business rules (ปิดตรวจ cancel = keep 50% or ฿1,500; จองรถ book 2 days ahead; เบิกเงินรอบเวลา).
- **`SHIPMENT ตารางงาน`** — master job table: `SHIPMENT/เลขงาน · QUOTATION · INVOICE · CTRN.NO · TYPE · CONSIGNEE · PRODUCT · ประเภทชำระเงิน · ราคาขาย THB/CBM,KGM · CTNS · CBM · KGM · ยอดชำระ(หัก ณ จ่าย) · UPLOAD slip · ต้นทุนทำจ่ายNNB · กำไร/ขาดทุน`.
- **`เบิกเงินทำงานSEA / AIR / TRUCK / 6699-TR / SEA โชห่วย / Cargo`** — the per-mode AP registers. Columns (the canonical disbursement row):
  `ลำดับ · วันที่ · ชื่อในไลน์/ใบวางแจ้งหนี้ · SHIPMENT · QUOTATION(QO-…) · หมวดหมู่รายการ(ต้นทุนบริการ / เงินทดรองจ่าย / เบิก-คืนเงิน) · รายการเบิกเงิน · หมายเหตุ · ยอดเบิก · ยอดคืน · REMARK · ชื่อบัญชี · เลขบัญชี · ธนาคาร · สถานะโอนเงิน · วันที่โอน · เวลา · สถานะการตามใบเสร็จ · ใบหัก(WT…)`
- **`ตั๋วชน ลงข้อมูล`** — ตั๋วชน (consolidated-bill cargo) disbursements.
- **`Export ลงข้อมูล`** — export-job disbursements (IV-…/RT-…).
- **`เบิกเงินคืนภาษีโกดังจีน`** — China-warehouse VAT-refund payouts (`ขอคืนภาษีโกดังจีน` · paid via Alipay to FEISHENG/โกดังจีน · e.g. 150×4.58 = ฿687).
- **`เบิกเงินทั่วไป / Cargo`** — general OPEX disbursements with an **expense-category column** (`ค่าใช้จ่ายทั่วไป · ค่าใช้จ่ายบุคลากร · ค่าใช้จ่ายซ่อมแซม · เงินสดย่อย · ต้นทุนค่าขนส่งจีน-ไทย MOMO/กวางโจว`).
- **`ปิดตรวจ วิสิฐ`** — the owner's (วิสิฐ/พี่ป๊อป) personal "ปิดตรวจ" (customs-inspection-clearing) cash advances, tracked as money-in/money-out to his account, with `ACC AP · สถานะได้รับเงิน · วันที่ได้รับโอนเข้าบัญชีพี่ป๊อป`. This is a related-party loan/settlement ledger.
- **`NNB เบิกเงินสั่งซื้อสินค้า`** — cost-of-goods reimbursement (เบิกเงินค่าสินค้า to **Haoze Song 宋浩泽**, the China-side purchaser) + customer over-transfer refunds.

**Money model it encodes — the disbursement taxonomy (`หมวดหมู่รายการ`):**
1. **ต้นทุนบริการ** (service cost) — ค่าลงทะเบียน+จับคู่ YY · ค่าบริการพิธีการศุลกากร(1)(2) · ค่าผ่านพิธีการ อย. · ค่ารถหัวลาก 20'/40' · ค่าผ่านท่า · ค่า D/O · ค่าบริการ FORM E (727.5 via Alipay 柏盛泰财务群) · ค่าแรงงาน · ค่ารถ 4ล้อ.
2. **เงินทดรองจ่าย** (advance / pass-through) — ค่าธรรมเนียมกรมศุลกากร(200)+VAT · ค่าเช่าโกดัง RENT · ค่าล่วงเวลา. These have "**มีใบเสร็จรับเงินชื่อลูกค้า**" (the receipt is in the CUSTOMER's name = pure reimbursable, not Pacred revenue).
3. **เบิก/คืนเงิน และอื่นๆ** — เบิกเงินคืนลูกค้า (over-transfer refunds), inter-account corrections (โอนผิดบัญชี → คืน), credit-card/loan settlements.

**WHT-out on the AP side:** disbursements to individuals carry "**หัก 3% / บัตร ปชช**" (3% WHT on service to a person, e.g. pay 4,455 = 4,500 − 1%? note also "หัก 1%" for transport/หัวลาก). The note column captures both the gross + the withheld basis (e.g. "58,000 หัก 1% / มีใบเสร็จชื่อเอเซลร่า").

**Bank mapping:** each row has explicit `ชื่อบัญชี / เลขบัญชี / ธนาคาร` of the **payee** (not a Pacred account) — i.e. this is the OUTFLOW leg. The Pacred SOURCE account is implied by the sheet name (`6699` = TRADING `…07669-9`). There's an explicit error row: "บัญชี 6699 โอนคืน เนื่องจากใช้บัญชีผิด" → confirms the 3-account routing is enforced manually and mistakes get reversed.

---

## 2. `PACRED BOOKING.xlsx` — the **operations + sales + commission master** (the AX-JOB cockpit on a sheet)

**Purpose:** the cross-department pipeline: lead → quote → booking → docs → ACC, plus the **commission split** the business actually pays. 13 sheets.

**Key sheets:**
- **`QO-CARGO` / `รหัสใบเสนอราคา`** — quotation-code registry + the quote-type taxonomy (`นำเข้าทาง AIR/CARGO · TERM CIF/EXW/FOB · ขนาดรถ 4/6 ล้อ` → composite code `AIR_CIF_4ล้อ`, `CARGO_เรือ`, `CARGO_รถ`).
- **`ตรวจ COMMISSION`** — ⭐ **THE commission model.** Per shipment: `SALES · PRICING · DOCS/CS · DOCS/BILLING · ACC/AP · ACC/AR` (6 role owners) → then three revenue streams each with its commission %:
  - **ยอดขาย LCL CARGO → COM 1%**
  - **ยอดขาย Customs Clearance → COM 5%**
  - **ยอดขาย Document Handling Charge → COM 5%**
  - **TOTAL COMMISSION · ยอดรวมหัก 3% ส.พ. (WHT on the commission payout) · HR/AC เช็คการเก็บเงิน · HR จ่ายค่าคอม SALES · HR จ่ายค่าคอม DOC · วันที่จ่ายค่าคอม**.
  This is the **1% / 5% / 5% − 3% WHT** rule the DB's `freight_commission_tiers` (0167) was seeded for but ships DORMANT.
- **`MESSENGER จ่ายงานแมส`** — messenger job dispatch + **commission rule embedded in header**: "วิ่งงาน 25 บาท/LOCATION · การันตี START 100 บาท/วัน · โลเคชั่นที่ 5 ขึ้นไป +25 บาท". Per-job: PO · EX/IM · pickup+dropoff addr · LOCATIONS · ผู้รับผิดชอบ · งานในพื้นที่/นอกพื้นที่ · สำเร็จ · COMMISSION.
- **`ส่งสอบถามราคา PRICING` / `PRICING STATUS` / `SETUP PRICING`** — the pricing-request queue: `ORDER NO · สินค้า · PRICING-rep · SALES-rep · TERM · ขนส่งทาง · FCL/LCL · ขนาดตู้ · POL/POD · ที่อยู่ผู้ส่ง/รับ · ราคาที่ต้องการ · HS CODE · ใบอนุญาต · สถานะงาน PRICING/SALES`. `SETUP PRICING` carries the **commission rules for SALES/PRICING** ("ปิดงานได้ ใช้เกณฑ์ 5%+5%+1%" · "PRICING ปิดงานได้ +10 บาท/ชิปเม้นเฟิม · บวกเพิ่ม 20% จากยอดต่อรองเฟรท").
- **`1.MEMBER SALE`** — the customer master (MEMBER `PRxxx` · SALE-rep · CONSIGNEE name/addr · TAX ID/บัตร · LINE/FB · email).
- **`2.SALE BOOKING SHIPMENT COMMI`** — the shipment booking spine (~40 cols): MEMBER · ORDER · SHIPMENT · QUOTATION · INVOICE · AGENT · COMPANY(PACRED/AXELRA/NNB) · TYPE · 6 role-owners · CONSIGNEE/SHIPPER · EX/IM · SERVICE&TERM · SIZE · POD · STATUS · ETD/ATD/ETA/ATA · ใบขน VAT/ลง STOCK · (AP)ปิดชุดงาน · (AR)ปิดวางบิล · IV.
- **`3.1 DOC DATA COMMISSION` / `3.2 DOC PLAN SUP`** — the doc-team detail: BL/AWB · VESSEL/VOY · CTRN.NO · SEAL · ขอ FORM E · TRANSHIP เวียดนาม · TRANSIT ลาว · DEM/DET · carrier · CY/CUTOFF/SI dates · ชื่อคนขับ/ทะเบียนรถ.
- **`4.1 STATEMENT Pacred 1440` / `4.2 STATEMENT Pacred 6699`** — ⭐ **the bank statements, reconciled.** Per transaction: `วันที่ · เวลา · รายการ(รับโอน/โอน) · ถอน · ฝาก · ยอดคงเหลือ · ช่องทาง · รายละเอียด(payer/payee) · SHIPMENT · ใบเสนอราคา · ใบเสร็จ/ใบกำกับ(RT-…) · ชื่อใบแจ้งหนี้ · ใบหัก ณ ที่จ่ายของลูกค้า`. The reconciliation column flags each deposit as "เปิดใบกำกับ PR / รอเปิดใบกำกับ PR / ยอดฝากโอน / เงินค่าภาษี+ส่วนต่าง+กำไรล่าม". **1440 = LOGISTICS, 6699 = TRADING** — and the note "เงินโอนเงินค่า ภาษี+ส่วนต่าง+กำไรล่าม เข้าบัญชีนี้" confirms VAT+margin+interpreter-profit lands in TRADING.

**Money model:** this is the **AR + revenue-recognition + commission-accrual** layer. Revenue is split into 3 commissionable streams (LCL freight 1% · clearance 5% · docs 5%), each with a role owner, and the payout is HR-gated with 3% WHT on the commission. Bank statements are reconciled line-by-line back to SHIPMENT + RT (receipt/tax-invoice) number.

---

## 3. `ข้อมูลการชำระ ACC.xlsx` — **fixed recurring-payment schedule (AP calendar) + vendor credentials**

**Purpose:** the standing-order calendar — what to pay, when, to whom, every week/month — for PACRED, NNB, AXELRA (shared OPEX split across the 3 entities).

**Sheets:** `1. ACC PACRED · 3. HR NNB · 2. HR Axelra` (each: `วันที่จ่าย · กำหนดชำระ · รายการ · ข้อมูลยอด · ชื่อ/บัญชี` per รายสัปดาห์/รายเดือน) + `ข้อมูลบริษัท PCS FREIGHT` (vendor logins — Jobthai/ประกันสังคม/gmail/dtac — **plaintext passwords, do NOT port to DB**).

**Money model — the recurring fixed AP:**
- **รายสัปดาห์:** วันพระ ฿400-500 · เงินเดือนแม่บ้าน ฿500/วัน.
- **รายเดือน (วันที่ 1):** ค่าเช่าตึก/โกดัง (multiple buildings, **WHT ค่าเช่า 5%** — e.g. ยอด 26,315.79 → โอน 25,000; โกดัง 47,368.42 → โอน 45,000; tax-grossed base shown) · ค่า รปภ. (วางบิล, หัก 3% +VAT, เครดิต 30 วัน) — **cost-shared หาร 2 / หาร 3 across entities**.
- **วันที่ 5:** ค่าบัตรเครดิต (วิสิฐ/พี่ป๊อป · วันดี/พี่แนท · AXELRA).
This is the **5% rental-WHT + shared-OPEX-split** model — entirely absent from the DB.

---

## 4. `เคลียร์ยอด ตั๋วพ่วง ตู้พี่ดำ.xlsx` — **piggyback-customs ("ตั๋วพ่วง") settlement with a partner container ("ตู้พี่ดำ")**

**Purpose:** Pacred files customs declarations (ใบขน) for many small jobs by *piggybacking* them onto a partner's ("พี่ดำ" / NNB) full container, then settles the shared duty/fee **หาร 2** with the container owner.

**Sheets:** `งานพ่วง` (the draft queue: `ชุดงานพ่วงรอลงตู้ · ภาษีอากร · ธรรมเนียมกรม(200) · Shipment · Clearance Date · ประเภทสินค้า · ทำฟอร์ม · สถานะ · บริษัท · สถานะจ่ายเงิน`) · `PLAN งานใบขนพ่วง` · then per-round clearing sheets `เคลียร์ยอด … 18 ใบ / 169 / 269 / 369 / 669` listing `รายการตั๋วพ่วง · ยอดภาษีอากร · ค่าธรรมเนียม(200) · เลขที่ใบขน · INVOICE · สถานะ(ชำระแล้ว รอบ N หาร2 / ยิงแล้ว ยังไม่ชำระ)`.

**Money model:** each piggyback job = `อากร (duty) + ฿200 ธรรมเนียม`, accumulated per round, **หาร 2** = the amount owed to the container owner (พี่ดำ). "มี FE / ไม่มี FE" (Form-E availability) gates whether the job can join. This is a **partner cost-sharing / settlement ledger** — not in the DB at all.

---

## 5. `ลงข้อมูลเปิดใบกำกับภาษี_ต้นทุนกำไร.xlsx` — ⭐ **the ฝากสั่งซื้อ (China-shop) COST→PROFIT→VAT ledger**

**Purpose:** the per-line cost/profit/VAT calculator for **ฝากสั่งซื้อ orders that get a ใบกำกับภาษี** (NNB-VAT model). 14 monthly sheets (`ต้นทุนขาย 0768 … 0669`) + a `(รวม)` rollup + a `VAT` summary.

**Columns (the canonical cost-profit row, per product line):**
`ลำดับ · รหัสลูกค้า · REF · ชื่อลูกค้า · นิติบุคคล(taxID) · บุคคลธรรมดา(บัตร) · ใบเสนอราคา(วันที่ออก, QO-…) · ใบเสร็จ/ใบกำกับ(วันที่ออก VAT, RT-…) · เลขตู้ · รายการ(product) · เลขตู้ PCS ซื้อสินค้า(GZE/GZS…) · เลขแทคกิ้ง · เลขตู้ NNB(A0300…) ·`
**COST block:** `จำนวน(หยวน) · ราคา(หยวน) · รวมเป็น(หยวน) · ค่าขนส่งจีน(ต้นทุน/หยวน) · อัตราแลกเปลี่ยน(ต้นทุน) · รวม(บาท ต้นทุน) · วันที่เบิกต้นทุน · หมายเหตุ ·`
**SELL block:** `จำนวน · ค่าขนส่งจีน(ขาย) · ราคา(ขาย/หยวน) · หักส่วนลด · อัตราแลกเปลี่ยน(ขาย) · อาการขาเข้า(%) · อาการขาเข้า(บาท) · รวมราคาก่อน VAT · VAT 7% · ราคารวม VAT · ลูกค้าชำระ(โอน) · เลขที่ใบกำกับ(RT-…) ·`
**PROFIT:** `ขาย−ต้นทุน (กำไร/ขาดทุน)`.

**Money model — the 3-number + dual-FX cost engine:**
- **Two FX rates per line:** a COST rate (`อัตราแลกเปลี่ยน ต้นทุน` ≈ 4.58-4.65, what NNB actually paid in China) and a SELL rate (`ขาย/หยวน` ≈ 4.7-4.9, what the customer is billed). The **FX spread is part of the margin**.
- **PROFIT = ขาย − ต้นทุน** computed per line and summed per customer (`รวมเบิกต้นทุน` vs `รวม กำไร/ขาดทุน`). Margins are thin (a line can be **negative**, e.g. −5.7฿ — they accept per-line losses, win on the aggregate).
- **VAT 7%** is charged on the SELL side (รวมราคาก่อน VAT → VAT 7% → ราคารวม VAT) only for these tax-invoice orders → routes to the TRADING account.
- **อาการขาเข้า (import duty)** captured separately as % and ฿ — mostly 0 here (these are low-duty consumer goods) but the column exists.
- **`VAT` sheet** = the monthly VAT-payable rollup **per entity** (PCS CARGO vs TTP), tracking `ยอด VAT · ยอดถอนจากระบบ · วันที่ถอน` — i.e. how much output-VAT was collected and when it was withdrawn/remitted. PCS 7/68=11,210 … 12/68=138,235; TTP 11/68=729,526. **This is the ภพ.30 input.**

---

## 6. `ลงข้อมูลฝากจ่าย_ต้นทุนกำไร.xlsx` — **the ฝากโอน (Yuan-transfer / Alipay) COST→PROFIT ledger**

**Purpose:** same shape as #5 but for **ฝากโอนชำระสินค้า** (pay-a-Chinese-supplier-on-behalf, no goods imported by us). Sheets: `(รวม) · PR ฝากจ่าย 05-69 · 06-69 · VAT`.

**Columns:** like #5 but with an extra **`กำไรล่าม / กำไรล่าม บาท`** (interpreter-margin) column and a **`หัก VAT 7% → กำไรขาดทุนสุทธิ`** column.

**Money model — the ฝากโอน margin:**
- COST = ¥amount × cost-FX (≈4.76-4.87) → THB paid to supplier. SELL = ¥amount × sell-FX (slightly higher) → THB billed customer.
- **กำไร = ขาย − ต้นทุน**, then **กำไรขาดทุนสุทธิ = กำไร − (VAT 7% on the margin)** — i.e. even when no ใบกำกับ is issued, they internally net VAT off the margin (matching `lib/tax/tax-doc-mode.ts`'s "ใบขน=Non → VAT 7% from margin, internal"). Margins are tiny (฿0.78 on a ฿49 order; ฿2,537 on a ฿658k order ≈ 0.4%) — **ฝากโอน is a thin-margin volume/FX-spread + interpreter-fee business.**
- Note column tracks the receiving account: "โอนเข้า PACRED … 225-2-91144-0" (LOGISTICS) and flags "ไม่มีการยื่น VAT" (no ใบกำกับ) vs "เป็นเครดิต".

---

## 7. `ใบหักลูกค้า.xlsx` — **customer-issued WHT certificates (หนังสือรับรองหัก ณ ที่จ่าย, ม.50 ทวิ, 3%)**

**Purpose:** when Pacred/AXELRA *pays* a vendor (shipping line / freight forwarder — MSC, CEVA, etc.) for a service, Pacred **withholds 3% WHT** and issues the ม.50ทวิ certificate. This file is the certificate register/template (`เลขที่ 202606001` · ผู้มีหน้าที่หัก = APIRAT/AXELRA · ผู้ถูกหัก = the vendor).

**Money model:** the **WHT-payable (ภงด.53) side** — 3% withheld from vendor service payments, certificate-numbered, to be remitted to สรรพากร. The DB has `0044_withholding_tax` + `0053_freight_invoice_wht` + `0175_receipt_wht_cert_gate` (the customer-side 1% on receipts) but **NOT this vendor-side 3% certificate register**.

---

## 8. `ข้อมูลการเบิก-จ่ายกองกลาง.xlsx` + 9. `รายละเอียดกลองกลางโกดังจีน.xlsx` — **China-warehouse central fund (กองกลางโกดังจีน)**

**Purpose:** the float that funds the China warehouse's daily operating cash, **cost-shared TTP↔PCS (หาร 2)**.

- **#8 `ข้อมูลการเบิก-จ่ายกองกลาง`** (monthly sheets ธ.ค.68–มี.ค.69): `วันที่ · รายการ(สำรองเงินกองกลาง ครั้งที่ N / ค่าเช่าโกดังจีน / เงินเดือนพนักงาน / กล้องวงจรปิด / ค่ามัดจำ office) · ยอดรวม(หยวน) · เรท · ยอดรวม(บาท) · ยอดหาร(บาท หาร2)`. Top-ups are ฿10,000-batches (¥10,000 × ~4.57); running balance tracked in หมายเหตุ ("ยอดคงเหลือ 2853.17").
- **#9 `รายละเอียดกลองกลางโกดังจีน`** (Chinese-language detail, monthly): the line-item spend the float covers — `装ttp/pcs陆运柜/海运柜` (ค่าขึ้นตู้ รถ/เรือ ฿650/550) · `加班` (OT) · `临时工` (daily labor ¥400) · `叉车加油` (forklift fuel) · ค่าจ้างพนักงานใหม่ · supplies. Running balance in ¥ ("金额剩 1,040.85元").

**Money model:** a **petty-cash / imprest float in CNY at the China warehouse**, replenished in ฿10k tranches, spent on warehouse labor + container-loading + rent + supplies, and the *total* cost split 50/50 between TTP and PCS. This is the **upstream cost-of-operations** that ultimately sits behind every cargo job's margin — entirely absent from the DB.

---

## 10. `ค่าใช้จ่ายบริษัทคงที่.xlsx` — **fixed company OPEX (budget)**

**Purpose:** the monthly fixed-cost budget. One sheet: `รายการ · จำนวนเงิน · หมายเหตุ`.
**Lines:** เงินเดือนพนักงานออฟฟิศ ฿370,000 · ค่าจ้างฟรีแลนซ์เมส ฿13,000 (฿500/วัน) · ค่าน้ำมันเมส ฿3,000 · การตลาดฟรีแลนซ์ ฿10,000 · ค่าน้ำ/ไฟ/เน็ต ออฟฟิต 28/40 (฿400 / ฿10,000 / ฿638.18). **Money model:** the fixed-OPEX baseline used for break-even/budget — pure reference, ~฿400k+/month fixed nut. Not in DB.

---

## 11. `ใบกำกับฝั่ง PACRED.xlsx` (139 MB) + 12. `PACRED ใบกำกับภาษี.xlsx` (24 MB, corrupt on read) — **the tax-invoice REQUEST forms**

**Purpose:** one sheet **per customer/shipment** that requested a ใบกำกับภาษี (~70 sheets, "สำเนาของ <customer>"). Sheet 1 `ตย.ฟอร์มใบกำกับภาษี PACRED` is the template.

**The request form captures:** issuing entity header (**"AXELRA (THAILAND) CO., LTD." — note: the ใบกำกับ is issued under AXELRA, ADD 14 Soi Phetkasem, taxID 0115567039173**) · ชื่อบริษัท/บุคคล · ที่อยู่ · เลขทะเบียน 13 หลัก · สำนักงานใหญ่/สาขา · **เรทหยวน(4.87)** · **โอนผ่านบัญชี (225-2-91144-0 LOGISTICS หรือ 232-1-07669-9 TRADING)** · รหัสลูกค้า(PCS…/PR…) · SHIPMENT.NO · IMPORT CODE · เลขที่ปิดตู้ · วันที่ตู้ถึงไทย · วันที่ชำระ · เลขที่เอกสารใบกำกับ · ราคาขาย/รายรับ vs ราคาซื้อ/รายจ่าย · slip โอนไทย(รวม VAT) + slip โอนจีน.

**Money model:** the **input to issuing a ใบกำกับ** — links customer + shipment + the two slips (TH-with-VAT + CN-cost) + the receiving bank account. Confirms: **ใบกำกับ-bearing jobs route to TRADING `…07669-9` (or LOGISTICS `…91144-0`) and the issuing legal entity is AXELRA, not Pacred** (the "borrowed VAT entity" — a brand-split nuance the bank-accounts.ts doesn't capture). ⚠️ file 12 read as "not a zip" — likely Google-Sheets export quirk; structure inferred from file 11 (identical purpose).

---

## The `inv_draft_system auto` tool — auto-drafts the **Customs INVOICE + PACKING LIST** (ใบขน input)

**What it drafts:** for each order still marked **"Mark ใบขน == ลงข้อมูลยังไม่ครบ"** in a master Google Sheet (`สถานะงาน` tab, 3 source sheets in `config.json`), it pulls per-item data from a linked "ฟอร์ม VAT" sheet and writes a **2-sheet Excel: `Invoice2` + `PACKING`** from `template.xlsx`.

**Sheet→invoice mapping (`skills.json` + `processor.py`):**
| Source (dest VAT sheet) | → Template cell |
|---|---|
| EN description | `Invoice2!D` (row 18+) |
| TH name | `Invoice2!G` |
| Qty | `Invoice2!H` |
| Total USD | `Invoice2!K` |
| Gross weight | `Invoice2!B` |
| Package/CT | `Invoice2!C` |
| HS code | `Invoice2!E` |
| Order no | `Invoice2!F` |
| อากร % (duty) | `Invoice2!R` (col 18) |
| exchange rate (USD) | `Invoice2!O` (col 15) — default `usd_rate` 31.33 |
| Invoice no | `Invoice2!D5` |
| Date | `PACKING!H7` |

**Calc model (`calc_order_totals`):** per item — `P = USD × rate; S(duty) = P × duty%; V(VAT) = (P+S) × 7%; W = S+V`. **อากรจริง = ΣS, ภาษีจริง = ΣW.** The PACKING sheet mirrors Invoice2 cells. It writes a **CIF / BY TRUCK / consignee = "THE N N B TRADING CO.,LTD." → MUKDAHAN** invoice (the มุกดาหาร land-border ใบขน pattern). Header issuer = "MAITU INTERNATIONAL TRADE (SHENZHEN)" (the China-side shipper of record). The tool is the **มูลค่าสำแดง (declared-value) ใบขน generator** — declared from USD-converted cost with a duty+VAT calc, distinct from the customer SELL price.

---

## What our DB DOES represent (so we don't double-count the gap)

| Spreadsheet concept | DB coverage |
|---|---|
| ฝากสั่ง/ฝากโอน per-line cost/declared/profit (3-number) | ✅ `0158_cargo_3number_lines` (cost_unit/cost_rate_cny/declared_value_thb/hs_code on tb_order + tb_forwarder_item) + `0179` declared-FX |
| ใบกำกับภาษี issuance (forwarder + shop/yuan) | ✅ `tb_forwarder_tax_invoice` (live) / `0152_shop_yuan_tax_invoice` (DORMANT) ; `0034 tax_invoices` = dead twin |
| Customs declaration (ใบขน) | ✅ `0057_customs_declarations` + `0162_customs_decl_cargo_link` + `0161_cargo_taxdoc_job` |
| Freight quote→shipment→invoice→payment spine | ✅ `0048/0050/0051/0052` |
| Freight commission 1%/5%/5% −3% WHT | ⚠️ `0167_freight_commission_ledger` exists but **DORMANT** (flag off, rates unconfirmed) |
| Container cost rate-card + AP disbursements | ⚠️ `0069_container_costs/disbursements` + `0089` (kinds: D/O, duty, freight, handling, fuel, storage, trucking, container_lease) — but the **kind taxonomy is narrower than the sheet's** (no FORM-E, ปิดตรวจ, ลงทะเบียน+YY, ค่าน้ำนายตรวจ, เงินทดรองจ่าย-vs-ต้นทุนบริการ split) and **AP is largely unused** (the real ledger lives in `ACC เบิกเงิน.xlsx`) |
| WHT (customer 1% on receipt) | ✅ `0044/0053/0175` |
| Accounting period freeze | ✅ `0056/0172` |
| Freight P&L / margin cap | ✅ `0165` (display snapshot) |

---

## ⛔ The GAP — what's in the spreadsheets but NOT in our DB (the build backlog)

1. **The AP / disbursement (เบิกเงิน) workflow as a first-class ledger.** The sheet's per-shipment disbursement rows (หมวดหมู่: ต้นทุนบริการ / เงินทดรองจ่าย / เบิก-คืน · รายการ · ยอดเบิก/ยอดคืน · payee bank · สถานะโอน · สถานะตามใบเสร็จ · ใบหัก WT…) are the operational heart and are NOT modeled. `container_disbursements` is too narrow (per-container only, narrow kind enum, no QO/shipment link, no "request→approve→transfer→chase-receipt" status machine, no WHT-on-disbursement, no payee-account capture). **This is the single biggest gap.**
2. **The commission engine (real values + flow).** The 1%/5%/5% per-stream split with 6 role-owners (SALES/PRICING/CS/BILLING/AP/AR), −3% WHT on payout, HR-gated `จ่ายค่าคอม`, plus the PRICING +฿10/shipment & +20% negotiation rules, and the **messenger commission** (฿25/location, ฿100/day guarantee). `freight_commission_tiers` is dormant + freight-only; cargo commission lives in `tb_user_sales` but the 3-stream model isn't there.
3. **Bank-statement reconciliation.** No table mirrors `4.1/4.2 STATEMENT` (per-transaction deposit/withdrawal reconciled to SHIPMENT + RT/IV + "เปิดใบกำกับ/รอเปิด" status). This is how AR is actually closed.
4. **Multi-entity ledgers (PACRED / AXELRA / NNB / PCS / TTP) + cost-sharing splits** (หาร 2 / หาร 3). The books are multi-entity; the DB assumes one entity. The **ใบกำกับ issuer = AXELRA** nuance isn't in `bank-accounts.ts`.
5. **ตั๋วพ่วง (piggyback customs) settlement** with partner containers (ตู้พี่ดำ) — duty+200 per job, หาร2, per-round clearing, Form-E gate. Not modeled.
6. **China central-fund (กองกลางโกดังจีน) imprest float** — ¥-denominated petty cash, ฿10k top-ups, warehouse labor/loading/rent spend, TTP/PCS 50/50 split, running balance. The upstream cost base behind every margin — not modeled.
7. **Fixed recurring AP calendar** (ค่าเช่า 5% WHT, รปภ. 3%+VAT credit-30, credit cards, แม่บ้าน, วันพระ) + **fixed-OPEX budget** (~฿400k/mo). No standing-order / budget tables.
8. **Vendor-side WHT certificate register (ม.50ทวิ, 3%)** — `ใบหักลูกค้า` issues certificates to shipping lines/forwarders; DB only has the customer-1% side, not the vendor-3% (ภงด.53) side.
9. **Monthly VAT-payable rollup (ภพ.30) per entity** — the `VAT` sheet (ยอด VAT collected, ยอดถอน, วันที่ถอน per PCS/TTP). No VAT-return aggregation table.
10. **เงินทดรองจ่าย (customer-name pass-throughs)** as a distinct class from Pacred service revenue — "มีใบเสร็จรับเงินชื่อลูกค้า" advances must NOT be booked as revenue/margin, but the DB has no advance-vs-revenue flag on cost lines.

---

## Accounting model in one picture

Pacred (operating as PACRED + the borrowed-VAT entity **AXELRA**, with **NNB/Haoze Song** as the China purchasing arm and **TTP/PCS** sharing the China warehouse) runs a **per-shipment job ledger** where every job carries a **QO (quote) → SHIPMENT → IV/RT (invoice/receipt-tax-invoice)** chain: revenue is recognized as three commissionable streams (**LCL freight 1% · customs clearance 5% · document handling 5%**, each owned by a role and paid out via HR less **3% WHT**), while cost is tracked two ways — a **per-line ฝากสั่ง/ฝากโอน cost-vs-sell engine** using a **dual FX rate** (cost-CNY ~4.6 vs sell-CNY ~4.8, the spread being part of margin) that nets **VAT 7%** off the margin and optionally issues a **ใบกำกับ → routed to the TRADING account `…07669-9` (else SERVICE/LOGISTICS, no VAT)**, and a **per-shipment disbursement (เบิกเงิน) ledger** that pays out ต้นทุนบริการ + เงินทดรองจ่าย (customer-name pass-throughs) less 1-3% vendor WHT, all reconciled against the two Pacred bank statements (1440 LOGISTICS / 6699 TRADING) and settled upstream against a **¥-denominated China central-fund** and partner cost-shares (ตั๋วพ่วง หาร2, OPEX หาร3) — and **almost none of the AP/disbursement, bank-reconciliation, multi-entity, central-fund, commission-payout, recurring-OPEX, or VAT/WHT-remittance machinery exists in our DB yet** (which models only the customer-facing 3-number cost/declared/sell + tax-invoice issuance, leaving the entire back-office money loop on spreadsheets).
