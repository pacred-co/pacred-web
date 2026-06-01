# Customs-Document Kit + Accounting/Tax — freight-knowledge cluster 04 (2026-06-01)

> **Cluster scope:** the customs-clearance + DO-release + FE/CO document workflow (inputs/outputs/who), and
> the accounting/tax-invoice/disbursement model of the OLD FREIGHT business (**AX/Axelra · NNB · TTP · PCS-Freight**).
> Decoded from `Project dev/FORM/`, the LINE chats, and the accounting/booking spreadsheets under
> `/Users/dev/Desktop/olddata dev/data งานเก่า/`. **Analysis only.** Cross-references the CEO's 3 tax-doc modes
> (`docs/research/ceo-directives-2026-06-01.md` §3) and confirms how they actually work from the real docs.

**One-line thesis:** Pacred's ported PCS system covers the *China-cargo* leg (ฝากสั่ง/ฝากนำเข้า/ฝากโอน) but has
**almost none** of the *freight + customs-broker* machinery this folder reveals: the customs **declaration (ใบขน)** flow,
the **DO-release** Letter-of-Indemnity engine, **Form E / FE (CO)** issuance, **HS-code value-engineering**, the
**ตั๋วพ่วง** (shared-container piggyback declaration) cost-split, the **per-Incoterm × mode pricing matrix**, and the
**operational disbursement ledger** (เบิกเงิน) that is the real freight P&L + the PEAK-integrated tax-invoice pipeline.

---

## PART 1 — THE CUSTOMS-DOCUMENT KIT (the freight-doc workflow)

### 1.1 The legal entities behind the documents
The freight business runs under **multiple operating names** depending on who the document needs to be "in the name of":
- **THE N N B TRADING CO.,LTD.** — `166 MOO1 BANGPRONG, MUEANG SAMUTPRAKAN 10270` — the **shipping/importer-of-record
  name** used on almost all DO-release letters, B/Ls, INV/PL. Director who signs = **ศราวุธ ภู่พยอม (นายศราวุธ ภู่พะยอม)**.
  This is the "in the name of shipping" consignee for the *no-docs / เหมาภาษี* mode.
- **บจก. เอเซลร่า (ประเทศไทย) จำกัด / AXELRA (Thailand)** — bank acct `225-2-91144-0` กสิกร — the freight company; cost
  receipts (D/O, freight, หัวลาก) are issued in **เอเซลร่า's** name (see disbursement REMARK "มีใบเสร็จชื่อเอเซลร่า").
- **PCS Cargo Co Ltd** / **Pacred** — the cargo/customer-facing brands.
- Each customer can also be the **importer-of-record** ("ใบขนในนามลูกค้า") → then the customer's own company name + 13-digit
  tax-ID goes on the declaration + tax invoice (e.g. `SAHA MONGKOLBHAN LP`, `บริษัท ทีเอ็ม บิซ จำกัด`).

### 1.2 The document types (each = a templated artifact in `FORM/`)
| Doc | File(s) | Purpose / when issued | Key fields |
|---|---|---|---|
| **DO-release letter (Letter of Indemnity)** | `DO RCL.docx`, `DO ZIM.doc`, `จดหมายแลก DO FUJIT.docx`, `LETTER TO RELEASED DO COSSCO.docx`, `จดหมาย DO HEDE.xlsx`, `DO UPS_TYLER.docx` | Request the shipping line / agent to **release the D/O without the Original B/L** (because B/L was *Surrendered / Telex-release / Sea-Waybill* at origin). The indemnity ("ยินดีรับผิดชอบทุกประการ" / hold-harmless). | Vessel + voyage, B/L no., consignee, B/L status **(OBL / SWB / TLX / Surrender)**, container no., port of loading/discharge, cargo desc, gross weight, **director signature + company stamp** |
| **DO Appointment / payment form** | `BKK_DO Appointment Form 1.docx` | Book the appointment to *collect* the D/O at the BKK office; lists ZIM **invoice no + net payment + transfer date** | Customer co., contact, staff name+phone, BL no, BL status, ZIM invoice no, net payment, transfer date |
| **ZIM Split DO template** | `ZIM Split DO template.xlsx` | **Split one B/L's cargo into multiple D/O sets** (ชุดที่ 1..N) — for ตั๋วพ่วง / multi-consignee containers | per-set: consignee, marks&numbers, no.&kind of packages, description, container no., total weight (KG), total volume (CBM), **สเตตัสตู้** |
| **Form E / FE (CO — Certificate of Origin)** | `fe 产地证格式 DRAFT.doc`, `DRAFT FE - GZS250826-1.xls` | The **ASEAN-China FTA (ACFTA)** preferential-origin certificate → unlocks **0% import duty** on eligible HS codes. Bilingual (CN/EN), issued in China. | Exporter (CN, must be registered w/ 商检局), consignee, **FORM E** header, means of transport + vessel/voyage + departure date, port of discharge, **HS code per line + origin criterion (e.g. "PE")**, gross weight / FOB value, invoice no+date |
| **Commercial Invoice + Packing List (INV/PL/CI)** | `INV_Draft.xlsx`, `INV_GZS250829-1_Draft-.xlsx` | The declared **value document** for the import declaration. The China exporter (`HANGZHOU KAIYUE I&E`) is shipper; consignee = NNB. | INVOICE NO (=`GZS…` import code), ship-to/from, **CIF / FOB / term (T/T)**, per-line: HS code, EN+TH desc, qty, unit price USD, **amount, exchange-rate (~32.46–32.72), duty %, VAT 7%** columns — the **value-engineering worksheet** |
| **Amendment letter (Amend consignee/BL)** | `หนังสือขออาเมนแก้ไขชื่อผู้รับ_Thai cargo.docx`, `หนังสือขออาเมน...Thai cargo` | Correct the **consignee name** on the AWB/BL after arrival | AWB/BL no, flight/import date, old consignee, new consignee, requester signature |
| **45-day overdue-goods waiver** | `ตย. หนังสือผ่อนผัน 45 วัน-2.pdf`, `ฟอร์มขอผ่อนผันของเกิน 45 วัน.pdf` | Customs **Form 304 04 15** — request to clear *overdue/abandoned* goods (>2 months 15 days) before customs auctions them. Must deposit **25% of estimated duty** as guarantee + clear within 15 working days of approval. | B/L, invoice, manager-signature-card copy, vessel+voyage, packages, customs office, LIST F |
| **Power of Attorney (มอบอำนาจ to collect DO)** | `มอบอำนาจรับ DO ทาง AIR บริษัท.docx` | Authorize a named individual (ID card no.) to **collect the D/O on behalf** (air freight) — tracking no., date, packages, weight | grantor co.+tax-ID, grantee name+ID, AWB tracking no, packages, weight |
| **Import-permit confirmation letter (IP / brand-license)** | `Subject หนังสือยืนยันการอนุญาตให้ผลิตและนำเข้(1).docx` | For **licensed/branded goods** (e.g. Crayon Shin-chan), the IP-holder confirms to customs the importer is licensed → avoids IPR seizure | licensor + licensee co.+tax-ID, contract no.+date, IP/character name |
| **Lost-document police report** | `รายงานประจำวันแจ้งเอกสารหาย.docx` | When the **original customs receipt (กศก.122)** is lost in transit (มุกดาหาร→กทม via Flash Express) → police report to re-issue from customs. Lists every lost กศก.122 receipt no. | date, courier + tracking no., list of lost receipt numbers, route |
| **Customs receipt (กศก.122)** | (referenced) | The **import duty/VAT payment receipt** issued by customs (20-digit doc no.) — proof of duty paid | 20-digit receipt no. e.g. `68112701416200000182` |
| **Brand-guideline / corp-cert pack** | `รวมเอกสารหนังสือรับรอง เอเซลร่า.pdf`, `ตราปั๊ม NNB.png`, `บัตรพี่ป๊อป.pdf`, `VISA POP.pdf` | Company registration certs + rubber stamps + director ID/visa attached to letters | — |

### 1.3 Port / customs-station codes (`Project dev/ท่า Port.txt` + `รหัสท่าเรือ.pdf`)
The **customs-house code** (a load-bearing field on every ใบขน). Decoded:
- **SEA:** `0119`=ท่าเรือกรุงเทพ(PAT/T1-T2) · `0121/0122`=Terminal 1/2 · `2801`=แหลมฉบัง · `2809`=Kerry Siam Seaport ·
  `2814/2839/2840`=สทบ แหลม / Kerry2 / แหลม D1.
- **AIR (สุวรรณภูมิ `1190`):** `1191/1194`=Thai Airways cargo (1194 = UPS Express, ค่า DO 498) · `1192/1193`=WFS-PG Cargo
  (1193 = BFS Cargo for FedEx/DHL, ค่า DO 428, +2฿ before ×7% VAT).
- **TRUCK (cross-border land):** `3601`=ด่านศุลกากรมุกดาหาร(ศภ.2) · `3612/3615`=มุกดาหารลานทอง / K.D.Express RPT.
- `พิกัดกรมมลพิษ.pdf` = Pollution-Control-Dept restricted HS list; `ACFTA ตรวจ FE.pdf` = the ACFTA Form-E eligibility check.

### 1.4 The cross-border LAND-FREIGHT route (`สรุป Process การเดินทางและจุดเปลี่ยนรถ.docx`) — the GZE/มุกดาหาร leg
The "BY TRUCK" mode is a **4-station China→Thailand overland corridor** (NOT a single truck):
1. **จุด A — Guangzhou warehouse** (Jianggao, Baiyun): China truck (e.g. `粤ABU698`) loads, seals, runs south to Guangxi.
2. **จุด B — Dongxing↔Mong Cai (China→Vietnam):** *truck-change #1*; China **export** clearance (random crate-cutting/inspection
   point); container re-hitched to a **Vietnamese tractor** (e.g. `15H 06489`).
3. **จุด C — Cha Lo↔Na Phao (Vietnam→Laos):** same VN truck does **transit** onto road R12 through Khammouane → Savannakhet.
4. **จุด D — Savannakhet↔Mukdahan (Laos→Thailand, Friendship Bridge 2):** *truck-change #2 = the job-close point*. **คุณบี (shipping)
   fires the import declaration (ยิงใบขนขาเข้า)**; front team **transloads** goods from the VN truck to a **Thai trailer** (e.g. `70-xxxx`);
   damage is photographed here; Thai truck runs Mukdahan→BKK/Samut Sakhon → unload → job done.

> This is why **มุกดาหาร** appears as the คลังจีน/transload hub in the disbursement + ตั๋วพ่วง sheets, and why the lost-doc
> report is "มุกดาหาร → กทม". The MOMO/CargoThai cabinet codes (`GZE…` truck / `GZS…` sea) map to this corridor.

### 1.5 The DO-release decision logic (the reusable rule)
B/L arrives in one of 4 states; the doc team picks the release path:
- **OBL (Original B/L present)** → straightforward, surrender original.
- **Surrender B/L / Telex-release (TLX) / Sea-Waybill (SWB)** → **no original exists** → must issue the **Letter of Indemnity**
  (the `DO …` letters) so the line releases the D/O against the hold-harmless. **This is the dominant case** (most China shipments
  are surrendered at origin) → the LOI letter is generated on nearly every shipment.

### 1.6 WHO does what (roles, from the chats + the doc-set sheet)
- **Sale (เซล / Sale_PcsFreight):** quotes the customer, captures the intake form, gets the deposit, asks "เรทวันนี้เท่าไหร่".
- **DOC / AUDIT DOC team (`AUDIT AX DOC ~Win`, `doc-gring`, `BOW`, `Pasit`):** the **HS-code + Form-E + tax-invoice + ใบขน** brain —
  given a product photo, returns: **HS code · Form-E 0% eligibility · "ออกใบกำกับภาษีได้ครับ ✅/❌" · duty %** + a "safer" alt name/HS to
  **avoid** มอก./อย./permit traps ("สินค้าติด มอก. แนะนำเลี่ยง"). Drafts the ใบขน, including **ตั๋วพ่วง** (piggyback) sets.
- **CS IMPORT / Shipping Doc IM:** fires the actual declaration in **NETBAY** (`เปิดใบขนชุดที่ 1/2/3`), computes the VAT.
- **คุณบี (shipping, Mukdahan):** fires the cross-border import declaration at the บริดจ์.
- **บัญชี / ACC (Aom, gring):** issues the **tax invoice via PEAK**, manages the disbursement ledger, sends to สรรพากร.
- **คุณ H.P.q / front team:** physical transload + damage photos at มุกดาหาร.

---

## PART 2 — THE ACCOUNTING / TAX-INVOICE / DISBURSEMENT MODEL

### 2.1 The 3 tax-document modes — CONFIRMED from the real intake form + pricing sheet
The CEO §3 spec is **literally the freight intake-form's billing question** (`แบบฟรอมออกราคา IMPORT.xlsx` → sheet "บริการของบริษัท"
+ the `AXELRA Cost & Profit` "การตอบแบบฟอร์ม" intake). The customer picks ONE at quote time:

| Mode (form wording) | In the name of | VAT base | Receives | Real-doc evidence |
|---|---|---|---|---|
| **ใบกำกับภาษี (tax invoice)** | the **customer's** company (ใบขนในนามลูกค้า) — OR sold-by-us | **VAT 7% on GOODS VALUE** (goods × Alipay-rate, +duty) | full tax invoice (RD-86) via PEAK + customs declaration | the P'BEE template tab-3 issues a PEAK receipt; "ใบกำกับภาษี VAT 7% = AX+NNB" |
| **ใบขน (customs declaration)** | customer or shipping | VAT 7% on the **goods** at customs (the declaration itself) + WHT **1%** on the freight/clearance service | the **ใบขน** + กศก.122 receipt, no full sales tax-invoice | "ใบขนสินค้า = AX"; "หัก ณ ที่จ่าย 1% = AX+NNB" |
| **ไม่รับเอกสาร / NON (no docs / เหมาภาษี)** | **shipping's** name (NNB) | none to customer — flat **เหมาภาษี** all-in price (profit booked internally) | nothing — payment convenience only | "NON = AX … ไม่ได้รับเอกสารใดใดทั้งสิ้นสำหรับฝากโอน" |

**Invoice-eligibility gate (confirmed):** to issue a **ใบกำกับ**, the goods value must be *known to us* — which in practice means the
customer **ฝากโอน (paid the Alipay/yuan through us)** so we hold the China slip + the real FOB. The P'BEE tab-1 literally demands
**"แนบใบสลิปการโอนเงินไทย-จีน"** + "สลิปโอนเงินไทย ยอดรวม VAT / สลิปโอนเงินจีน". No China-transfer-with-us → no verifiable value → can't issue.

**VAT computation (from `HS.CODE-VAT` chat, a real worked example):**
`goods_value(¥57,300) × Alipay_rate(4.84) = ฿277,332` → `×7% = ฿19,413` VAT → total `฿296,735`. If the customer pays in
**two installments on different days**, the rate differs → **issue 2 separate tax invoices** (one per rate/date) — a real rule
the team follows (`Aom: น่าจะต้องแบ่งเป็นเปิดใบกำกับ 2 ใบ เพราะเรทต่างกัน`).

### 2.2 The new tax-invoice template "P'BEE" — a 3-tab pipeline wired to PEAK
`data and excel data/สำเนาของ ต้นแบบฟอร์มใบกำกับภาษี ใหม่ P'BEE.xlsx` (207 sheets — one per real job, named `<staff> TTP<code> #B<no>`).
The **canonical 3-stage handoff** (= maps directly onto the org chart Sales→Customs-Doc→Accounting):
1. **Tab "1. สำหรับลูกค้าเซลล์"** — customer/sales fills: บริษัท/บุคคล name + 13-digit tax-ID + HQ/branch (สำนักงานใหญ่ 00001) + address +
   **IMPORT CODE (`GZS…`/FDSR…)** + รหัสลูกค้า (`TTP…`) + SHIPMENT.NO + เลขที่ปิดตู้ (`GZE…`) + bank slip (TH+CN). Per-line goods:
   **รูปสินค้า · HS CODE · อากร% · ชื่อ EN/TH · BRAND · จำนวน · หน่วย · ราคาก่อน VAT · ราคา-อากร · ราคารวม Final · tracking**.
2. **Tab "2. สำหรับเจ้าหน้าที่ คีย์ใบขน"** — the **NETBAY declaration sheet**: `USD RATE (32.4608)` + per-line **Traffic code (HS) · EN/TH
   desc · brand · shipping mark · package/CT · qty invoice · gross weight · price USD · price Baht total/unit**. (= the ใบขน data.)
3. **Tab "3. สำหรับเจ้าหน้าที่ บัญชี"** — the **PEAK tax-invoice input**: customer billing block + line items (สินค้า/บริการ · จำนวน ·
   ราคา/หน่วย · จำนวน×ราคา · ส่วนลด) + **PEAK download link** (`doc.peakaccount.com/receipt?emi=…`). **→ Pacred should issue tax invoices
   THROUGH PEAK**, exactly as ภูม's PEAK lane assumes.
4. **Tab "สถานะงาน"** — job status tracker across the pipeline.

Doc-numbering seen: tax-invoice/receipt `RT-YYYYMM00###` (ฝากโอน/transfer), quotation `QO-YYYYMM000##`, `RT-`/`AX`/`PR`/`A` job codes.

### 2.3 The disbursement ledger (เบิกเงิน) — the REAL freight P&L spine
`data and excel data/ACC - PACRED&PCS เบิกเงิน.xlsx` (13 sheets) + `ACC - AXELRA&NNB เบิกเงิน.xlsx` (18 sheets). Each booking job =
a block of **cost lines**; this is **where freight profit is actually computed** (revenue from the quote − these disbursements).
**Sheet taxonomy (= the disbursement matrix):**
- **By transport mode:** `เบิกเงินทำงาน SEA / AIR / TRUCK / TRUCK(AX) / CARGO(NNB)`.
- **ตั๋วชน ลงข้อมูล** — "ticket-collision/joint" cost entries (goods value paid to AX on behalf — ช็อคโกแลต/ซิการ์ etc.).
- **เบิกเงินคืนภาษีโกดังจีน** — China-warehouse VAT-refund disbursements (`150×4.58`, `450×4.61` paid via **Alipay to 颾(FEISHENG)/โกดังจีน**).
- **เบิกเงินค่าสินค้า (ฝากจ่าย)** — pay-on-behalf for goods.
- **เบิกเงินทั่วไป** — general/misc; **AIR ปิดตรวจ วิสิฐ** — inspection-clearance ("ปิดตรวจ") payments.

**Per-line columns (the data model):** `ลำดับ · วันที่ · ชื่อในไลน์/ชื่อใบวางแจ้งหนี้ · SHIPMENT · QUOTATION(QO/RT) · หมวดหมู่รายการเบิกเงิน ·
รายการเบิกเงิน · หมายเหตุ · จำนวนเงินยอดเบิก · จำนวนเงินยอดคืน · REMARK · ชื่อบัญชี · เลขบัญชี · ธนาคาร · สถานะโอนเงิน · วันที่+เวลาโอน · (mode)`.

**Cost categories (หมวดหมู่):** (a) **ต้นทุนบริการ** (service cost — pay vendor) · (b) **เงินทดรองจ่าย** (advance/reimbursable — has
customer's-name receipt) · (c) **เบิก/คืนเงิน และอื่นๆ** (refund to customer for overpayment). **Real line examples:**
`ค่าลงทะเบียน+จับคู่ YY · ค่าบริการพิธีการศุลกากร(1)(2) · ค่าน้ำ นายตรวจ · ค่าผ่านพิธีการ อย. · ค่ารถขนส่งหัวลาก 20' (หัก1%) · ค่าผ่านท่ารถหัวลาก ·
ค่าเช่าโกดัง/RENT · ค่าล่วงเวลา · ค่า D/O · ค่าธรรมเนียมกรมศุลกากร(200)+VAT · สติกเกอร์ อย`. **WHT marked inline** ("หัก 3% / บัตร ปชช", "หัก 1%").
Whose receipt is whose ("มีใบเสร็จชื่อเอเซลร่า / ชื่อลูกค้า / ลูกค้าสแกนจ่าย") drives the tax treatment. Payment = **PromptPay / scan-pay / bank
transfer** to the vendor account, with a **โอนแล้ว / รอ** status — i.e. a **per-line payment-status ledger**, exactly like our wallet ledger but
for *outbound vendor disbursements* + reconciled to a quotation.

### 2.4 ตั๋วพ่วง (piggyback / shared-container declaration) — the cost-split mechanic
`เคลียร์ยอด ตั๋วพ่วง ตู้พี่ดำ.xlsx` (8 sheets). **Many customers' goods ride ONE shared container ("ตู้พี่ดำ")**; each customer still gets
**their own ใบขน** but the **import duty/cost is shared/split** — status "**ชำระแล้ว รอบ 1 (หาร 2)**" = paid round-1, divided-by-2. Fields:
`รายการตั๋วพ่วง (QEUT…+job name) · ยอดภาษีอากร · เลข INVOICE (A…/PR…/AX…) · Clearance Date · ประเภทสินค้า · มี/ไม่มี FE · สถานะ(รอดราฟ→ยิงแล้ว→เสร็จ) ·
SALE · เลขตู้ที่ของมา · พ่วงตู้ · บริษัท(AX/PACRED/NNB)`. The **NOTE rule:** "ต้องส่งของกับเรา แล้วระบุให้ได้ว่ารถคันไหน — ของ OK ลงตั๋ว, ของไม่ OK ไป
ลงใบกำกับ". This is a **freight-specific feature our cargo system has zero concept of**: a declaration shared across N customers on one
container with a duty-allocation rule.

### 2.5 Pricing matrix — per Incoterm × mode (`แบบฟรอมออกราคา IMPORT.xlsx`)
- **Incoterms supported:** `DDP · EXW · FOB · CIF · CFR` (sheet "เงื่อนไข term" defines each — who books freight, who pays Thai
  import tax, pickup/delivery scope). Sheets exist for **every combination**: `IM EXW SEA FCL/LCL · IM CFR SEA LCL · IM FOB SEA FCL/LCL ·
  IM CIF SEA FCL/LCL · IM EXW/CIF AIR · IM FOB/CIF TRUCK`.
- **เหมาภาษี (no-docs flat) DDP price book** (sheet "งาน", NNB shipping name, อี้อู–กว่างโจว): **20'** = ฿98,000 single-item / ฿115,000 mixed
  (โชห่วย) / ฿155,000 licensed-goods · **40'** = ฿110,000 / ฿135,000 / ฿155,000. LCL share-container: เรือ ฿3,500 / รถ ฿5,500.
- **CEO profit-cap context (§4):** the freight margin engine here is *exactly* where the "งานตู้ กำไรไม่เกิน 15,000฿/ตู้" rule must live —
  quote − Σ disbursements ≤ 15k. `AXELRA Cost & Profit & Com.xlsx` (sheets `COST`, `Profit AXELRAPRICING`, `ACC AR`) is the legacy
  profit model + AR aging — the blueprint for the Pacred margin-guard + AR module.

### 2.6 The accounting **voucher/doc-set assembly** (`AXELRA Cost & Profit` → "เงื่อนไข จ๊อบการทำงาน")
Every finished freight job is filed as a **4-part document set** (the audit/period-close unit):
1. **ใบปะหน้า** — Sale cover + Pricing cover + slips related to the Sale cover (e.g. ปิดตรวจ 6,000฿).
2. **ใบเสนอราคา** — quotation + invoice + transfer receipt (amount must reconcile to the quote total).
3. **ใบสำคัญจ่าย / ใบเบิกเงิน** — the disbursement vouchers (from §2.3).
4. (4th part — settlement/closing). → A Pacred **"freight job close" packet** should bundle these automatically.

### 2.7 Sales / commission / call-out tools (context)
- `เครื่องมือสรุปยอดขาย PCS.xlsx` — **commission = 1% of import revenue** per `เซลล์ผู้ดูแล` (admin_mew/but/ploy/bam/jean…); monthly sheets
  `MMYY`. Revenue trend: **2024 ฿~10.8M → 2025 ฿~18.3M → 2026 climbing** (Mar ฿5.7M). Tracks per-customer น้ำหนัก/CBM/revenue/discount/comm.
- `เครื่องมือสรุปการโทรออก.xlsx` — **outbound-call CDR** (3CX-style: start/end/duration/dir/local/remote party) rolled up per-sales-rep
  + per-number call counts → the **call-queue / call-effort KPI** the CEO §6 acquisition engine needs (this is the proven manual version).
- `PACRED & PCS BOOKING.xlsx` / `AXELRA & NNB BOOKING.xlsx` — the **booking master** (the freight-job spine the disbursement+invoice sheets
  reference by SHIPMENT + QUOTATION). "เปลี่ยนเจ้าของแล้ว" copy = the AX→Pacred ownership-migration snapshot.

---

## PART 3 — WHAT PACRED LACKS (gap vs current cargo system) + how to build it BETTER

**Today Pacred = the China-cargo leg only** (`tb_forwarder`/`tb_cnt`/wallet/ฝากโอน). The **freight + customs-broker** layer above is
essentially **un-built**. Ranked gaps:

1. **Customs declaration (ใบขน) entity + NETBAY pipeline — MISSING.** No `tb_*` for a declaration: HS-code lines, customs-house code,
   USD rate, duty %, VAT base, กศก.122 receipt no. **Build:** a `freight_declaration` + `freight_declaration_item` model fed by the
   P'BEE 3-tab handoff (Sales→DocKeyer→Accounting), with the NETBAY export.
2. **DO-release Letter-of-Indemnity generator — MISSING.** The most-repeated freight doc; today hand-typed per-line per-shipment.
   **Build:** a templated LOI generator (pick line=ZIM/RCL/COSCO/HEDE/FUJIT/UPS, fill vessel/BL/container, auto company+stamp+director
   signature) + the **ZIM Split-DO** multi-set variant. Inputs already exist in `FORM/`.
3. **Form E / FE (CO) eligibility + draft — MISSING.** No ACFTA check, no Form-E draft, no "0% duty" flag. **Build:** an HS-code→ACFTA
   lookup (from `ACFTA ตรวจ FE.pdf` + customs HH22 tariff) that returns *Form-E eligible? duty%? restricted by มลพิษ/อย./มอก.?* — and
   surfaces the doc-team's "ออกใบกำกับได้ ✅/เลี่ยงชื่อนี้" recommendation. This is a candidate **AI-assist** (the `ท่า Port.txt` prompt is
   literally a system prompt for an HS-classification assistant the team already drafted).
4. **The disbursement (เบิกเงิน) ledger — MISSING.** Pacred tracks customer *inbound* wallet, but has **no outbound vendor-disbursement
   ledger** reconciled to a quotation with WHT + whose-receipt + payment-status. **Build:** `freight_disbursement` (job-linked, category =
   ต้นทุนบริการ/ทดรองจ่าย/คืนเงิน, WHT %, vendor bank, status) → this *is* the freight P&L + the AR/AP the CEO profit-cap needs.
5. **ตั๋วพ่วง shared-container cost-split — MISSING (no equivalent).** A declaration shared across N customers on one container with a
   duty-allocation rule (หาร2). **Build:** a `freight_container_share` join (container ↔ many jobs, each with its declaration + allocated duty).
6. **Per-Incoterm × mode pricing + profit-cap — PARTIAL.** Cargo rates exist; freight DDP/EXW/FOB/CIF/CFR × SEA-FCL/LCL/AIR/TRUCK price
   book + the **≤15,000฿/ตู้ margin-guard** does not. **Build:** extend the rate engine with Incoterm dimension + the margin-guard rule.
7. **3 tax-doc modes + PEAK integration + invoice-eligibility gate — PARTIAL.** ภูม's PEAK lane + `tb_forwarder_tax_invoice` must
   implement: per-mode VAT base (goods-value vs service-fee vs none), the **ฝากโอน-with-us + China-slip** eligibility gate, the
   **multi-invoice-per-rate-date** split rule, and push to **PEAK** (`doc.peakaccount.com`) — not a home-grown tax invoice.
8. **Customs-house code + port master — MISSING.** A reference table of sea/air/truck customs-station codes (§1.3) + per-port DO-cost +
   VAT-rounding quirks (BFS +2฿ before ×7%).
9. **45-day waiver / amend / lost-doc / POA / IP-permit letters — MISSING.** A small **customs-letter kit** (templated, company-stamped) —
   low effort, high staff-time saving.
10. **Cross-border land-corridor status (มุกดาหาร transload) — PARTIAL via MOMO.** The 4-station route + truck-change + transload-damage
    photo step isn't modeled as job status; CargoThai (Theme 7) is the natural home — add stations A/B/C/D + "transload @ Mukdahan" status.
11. **Outbound-call queue + commission engine — PARTIAL.** The call-CDR + 1%-commission tools are manual; the CEO §6 `/admin/leads`
    call-queue should ingest CDR (3CX) for call-effort KPI, and the 1%-of-import commission rule should be in the system.

**Max-potential / "build it BETTER":** unify these into a **Freight Job object** that threads quote(Incoterm×mode) → booking →
declaration(HS+Form-E+NETBAY) → DO-release(LOI) → disbursement-ledger(P&L, ≤15k margin-guard) → PEAK tax-invoice(3 modes) →
4-part doc-set close — with the **HS-code/ACFTA AI-assistant** as the doc-team force-multiplier and the **ตั๋วพ่วง** container-share as a
first-class concept. That turns the freight side into the same "runs-itself" engine the CEO wants for cargo, and is the data backbone for
the multi-company holding (Pacred Logistics/Service) + the CargoThai partner-API.

---
*Source folder:* `/Users/dev/Desktop/olddata dev/data งานเก่า/` — `Project dev/FORM/` (doc kit), `Project dev/แบบฟรอมออกราคา IMPORT.xlsx`
(+`ท่า Port.txt`), `data and excel data/ACC - *เบิกเงิน.xlsx` (disbursement), `…P'BEE…xlsx` (PEAK tax-invoice template), `เคลียร์ยอด ตั๋วพ่วง
ตู้พี่ดำ.xlsx` (piggyback), the `[LINE] HS.CODE-VAT-PCS-PACRED.txt` + `[LINE]…TTP NNB ขอใบกำกับ-ขอใบขน INV-PL CI.txt` + `[LINE]DOC SHIPPING.txt`
chats, `สรุป Process การเดินทางและจุดเปลี่ยนรถ.docx` (land corridor).
