# Accounting B1 — VAT 7% เข้า AR billing-run (plan · 2026-06-29 · รอ owner เคาะก่อนสร้าง)

อ่านประกอบ: [`pay-and-accounting-gap-2026-06-21.md`](pay-and-accounting-gap-2026-06-21.md) (B1-B7). **money/legal-critical → ห้ามสร้างจนกว่า owner เคาะ Q1-Q5.** plan นี้ source-grounded (agent อ่านโค้ดจริง).

## แก่นที่เจอ (สำคัญ)
- **billing-run = บิลฝากนำเข้า** (`tb_forwarder_invoice` + `_item` · mig 0138) สร้างที่ `createBillingRunInvoice` (`actions/admin/billing-run.ts`). แต่ละ line = `calcForwarderGross` (Σ 7 price col − ส่วนลด). **วันนี้มีแค่ WHT 1% line · ไม่มี VAT เลย** → ไม่มี double-charge เริ่มต้น.
- **VAT ฐานไม่ใช่ทั้งบิล.** forwarder bill แยก (per `lib/tax/wht.ts computeForwarderTax`): ขนส่งระหว่างประเทศ `ftotalprice`+`ftransportpricechnthb` = **VAT 0%** (zero-rated · ม.80/1 · = ค่าฝากนำเข้า/ใบขน ที่ owner บอกไม่เก็บ VAT) · ขนส่งในไทย `ftransportprice` + บริการ `fshippingservice+pricecrate+fpriceupdate+priceother` = **VAT 7%**.
- **VAT gate = doc-mode ไม่ใช่ juristic.** ตามกฎสรรพากร: ออกใบกำกับ = มี VAT ทุกลูกค้า (บุคคล+นิติ). gate ที่ `tb_forwarder.tax_doc_pref` (mig 0127): `tax_invoice`=ใบกำกับ→มี VAT · `customs`(ใบขน)/`none`(รับเอกสาร)→**ไม่มี VAT line** (margin-VAT ภายในเท่านั้น · ตรง D5). ฝากนำเข้าส่วนใหญ่ = none → **VAT จะ ฿0 เกือบทั้งหมด** ในทางปฏิบัติ.
- **engine มีอยู่แล้ว ห้ามคูณ 7% เอง:** `computeTaxForMode(mode, parts, {isJuristic, rates})` (`lib/tax/tax-doc-mode.ts`) + ฝั่ง payment-land `issueForwarderTaxInvoice` (`lib/admin/forwarder-tax-invoice.ts` · mig 0129) ออกใบกำกับจริงอยู่แล้ว. B1 = ทำฝั่ง **bill-time** ให้ match payment-land เป๊ะถึงสตางค์.

## 🔴 owner เคาะก่อน (5 ข้อ · money/legal)
1. **VAT ขึ้นบิลเฉพาะตอนลูกค้าเลือก "ใบกำกับภาษี" ใช่ไหม?** (ตาม D5 · customs/none = ไม่มี VAT → บิลฝากนำเข้าส่วนใหญ่ VAT=฿0). หรือ owner อยากให้เก็บ VAT ทุกบิลนิติ? (scope+กฎหมายต่างกันมาก)
2. **VAT ไม่ผูก juristic** (ใบกำกับ = มี VAT ทุกลูกค้าตามกฎหมาย · เฉพาะ WHT ที่ผูกนิติ) — ยืนยัน gate ด้วย doc-mode?
3. **ฐาน VAT = ค่าส่งในไทย + ค่าบริการ เท่านั้น** (ตัด ค่าขนส่ง CN→TH + ค่าส่งจีน ที่ 0%). + 3 ช่องปรับมือ (ค่าส่งจีน/ค่าส่งไทย/อื่นๆ) อันไหน VATable? (ค่าส่งไทย=น่าจะใช่ · ค่าส่งจีน=ไม่ · อื่นๆ=คลุมเครือ).
4. **WHT 1% ฐานก่อน VAT** (กฎสรรพากร: WHT base = ไม่รวม VAT) → ลำดับ = ยอด → +VAT 7% → −WHT 1% → สุทธิ. ยืนยัน arithmetic + layout บิล.
5. **ไม่ VAT ซ้ำ** กับใบกำกับฝั่ง payment-land (mig 0129 · live แล้ว) — B1 = แสดง VAT ตัวเดียวกัน ไม่ใช่เก็บ 2 รอบ.

## build steps (หลัง owner เคาะ · NEXT FREE mig = 0223)
1. **mig 0223** extend `tb_forwarder_invoice` (idempotent add col · NUMERIC(12,2) DEFAULT 0): `service_amount_thb` · `vatable_base_thb` · `vat7_amount_thb` · `vat_doc_mode` varchar(20) · `vat_pct` default 7. **ห้าม fork table.**
2. validator: ไม่ต้องรับ input ใหม่ (VAT คิด server-side จาก tax_doc_pref).
3. server (`createBillingRunInvoice` step d ~L1117-1185): ดึง `tax_doc_pref`+price cols → derive batch mode (`pickForwarderTaxDocMode` · mixed→flag) → สร้าง `TaxableParts` (domestic=Σftransportprice · intl=Σ(ftotalprice+ftransportpricechnthb) · service=Σ4 · goods=0 · discount=Σfdiscount) → `computeTaxForMode` → persist vat. `total_thb = pre-VAT gross + vat`. **WHT คงคิดบน pre-VAT gross** (ย้าย 4 จุด: getInvoiceList:718 · getInvoiceDetail:886 · markBillingRunPaid:1371 · add-client:236).
4. read side + add-client + `billing-run-paper.tsx` + customer `billing-run/[id]/page.tsx`: mirror VAT line **display-only recompute** (อย่าเก็บ 2 แหล่ง) · gate `vat7_amount_thb>0`.
5. test parity: B1 bill VAT == `issueForwarderTaxInvoice` VAT (rows เดียวกัน) · customs/none→vat=0 · tax_invoice→7%×(ftransportprice+service) ตัด intl · WHT ไม่เปลี่ยน · total ตรงสตางค์. DEV-SYNC + dry-run + อ่าน exit จริง.

## money-safety (ห้ามพลาด)
double-charge=0 (VAT ใหม่ · เพิ่มจุดเดียว mirror ที่เหลือ) · WHT independence (base pre-VAT) · zero-rated cargo ตัดออกจากฐาน (อย่า subtotal×7%) · mode-correct (customs/none→0) · reconcile payment-land · overflow guard (billing-run.ts:1190) ครอบ total รวม VAT · `getTaxRates()` ไม่ hardcode 7.
