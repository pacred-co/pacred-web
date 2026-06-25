# นิติบุคคล + เครดิต + เอกสารภาษี — legacy dig + ความพร้อมก่อนย้าย PR099/PR999 (2026-06-24)

> Owner: ก่อนพึ่งลูกค้าเครดิตใหญ่ PCS99→PR099 + PCS999→PR999 ต้องทำวงจร นิติ+เครดิต ให้ครบแบบ legacy — วางบิล → ใบแจ้งหนี้ → เก็บเงิน → ใบหัก ณ ที่จ่าย → ปิดชุดงาน — และเลือก/แก้ "ออกใบกำกับ / ไม่เอาเอกสาร" ได้. "ห้ามขาดตกบกพร่อง." (workflow auto-dig ล่มเพราะ legacy ไฟล์ใหญ่ → ไล่อ่าน source ตรง)

## 1. โมเดล legacy (ยืนยันจาก source)

**เครดิต — `forwarder.php` fStatus=='c' (L1396-1440):**
- วงเงินรวม = `tb_users.userCreditValue` · ยอดค้างปัจจุบัน = `tb_credit.creditValue` (keyed by userID) · เทอม = `userCreditDate` (วัน).
- `pricePay` = ผลรวมราคาทุกช่อง − `fDiscount`. **ถ้า `userCompany==1` (นิติ) → `pricePay = pricePay − pricePay*0.01`** (หัก ณ ที่จ่าย 1% หักจากยอดที่ลงเครดิต).
- ถ้า (วงเงินรวม − ค้าง) ≥ pricePay → `UPDATE tb_forwarder SET paydeposit='2', fCredit='1', fCreditDate=<due>, fStatus='6'` + `tb_credit.creditValue += pricePay`. ไม่พอ → "วงเงินไม่พอ".

**หัก ณ ที่จ่าย 1% — `create-f-receipt.php` (L350-365, L689):**
- เงื่อนไข: `corporateNumber != '' && != '-'` (= เป็นบริษัท) → `Dis1per = totalPriceAll*0.01` → แสดง "LESS WITHHOLDING TAX 1%".
- ใบนี้ = **"ใบเสร็จรับเงิน (ไม่ใช่ใบกำกับภาษี)"** (L251-252) — ใบเสร็จธรรมดา; ใบกำกับภาษีจริงเป็นเอกสารคนละตัว.

**เอกสารภาษี (เลือกตอนไหน):** legacy ผูกกับ **นิติบุคคล (`userCompany='1'`) + `corporateNumber` (เลขภาษี)** — มีเลขภาษี = ได้ใบกำกับ + โดนหัก 1%; ไม่มี = ใบเสร็จ "(ไม่ใช่ใบกำกับ)" เฉยๆ.

## 2. สถานะระบบเรา — **สร้างไว้แล้วเกือบครบ** ✅

| ส่วน | ของเรา (file:line) | สถานะ |
|---|---|---|
| เอกสารภาษี 3 โหมด | `lib/tax/tax-doc-mode.ts` (`tax_invoice`=ใบกำกับ · `customs`=ใบขน · `none`=ใบเสร็จ) | ✅ มี |
| แก้เอกสารภาษี/รายการ | `adminUpdateForwarderTaxDocMode` ([forwarders-field-edits.ts:1089](actions/admin/forwarders-field-edits.ts)) · UI `forwarder-inline-edits.tsx`/`tb-edit-panel.tsx` | ⚠️ มี แต่**หายาก** (pain ของ owner) |
| เลือกตอนสร้าง | `CartTaxDocPref` (cart) · `forwarders-new` · quick-add | ✅ มี |
| ตั้งวงเงินเครดิต | `adminSetCustomerCreditLimit` ([admin/credit.ts:52](actions/admin/credit.ts)) · `adminSetUserCredit` (users-pricing.ts → `tb_users.userCreditValue`) | ✅ มี |
| ลงเครดิต / ยอดค้าง | `adminChargeToCredit` (credit.ts:147) · ยอดค้าง lazy ใน `tb_credit` · `calcForwarderOutstanding` | ✅ มี |
| ชำระเครดิต | `customerPayCreditFromWallet` ([credit.ts:186](actions/credit.ts)) · AR aging `reports-ar` | ✅ มี |
| วางบิล | `createBillingRunInvoice`/`markBillingRunPaid` ([admin/billing-run.ts](actions/admin/billing-run.ts)) · `billing-eligibility.ts` | ✅ มี |
| ใบเสร็จอัตโนมัติ | `autoIssueReceiptOnPaymentLand` ([lib/admin/auto-issue-receipt.ts](lib/admin/auto-issue-receipt.ts)) · mao_fee mig 0209 | ✅ มี |
| ใบหัก 50 ทวิ | `actions/admin/wht-cert.ts` · `receipt-wht-cert.ts` (mig 0175 gate พิมพ์ใบเสร็จจนกว่าจะอัปใบหัก) | ✅ มี |

## 3. ช่องโหว่จริง (สิ่งที่ต้องทำ)

1. **เอกสารภาษี — แก้ได้แต่หายาก (pain หลักของ owner).** `adminUpdateForwarderTaxDocMode` มีอยู่ แต่ฝังในจุดที่หาไม่เจอ + **ไม่มี "ค่าเริ่มต้นต่อลูกค้า"** → ลูกค้านิติที่ต้องการใบกำกับทุกออเดอร์ต้องมาตั้งทีละชิป. **ต้องทำ:** (a) ปุ่ม/dropdown "เอกสารภาษี: ใบกำกับ / ใบขน / ไม่เอา" ชัดๆ บนหน้า forwarder detail (แก้ต่อชิป) + (b) ตั้ง **default ต่อลูกค้า** (`tb_users` ฟิลด์ใหม่ หรือ corporate record) → ออเดอร์ใหม่ดึง default อัตโนมัติ.
2. **PR099/PR999 — เครดิตพร้อม แต่ยังเป็น "บุคคล".** เครดิต migrate มาแล้ว (**PR099 = 300,000 · PR999 = 1,000,000** · เปิด · เทอม 15 วัน · ยอดค้าง 0 ถูกต้อง). แต่ `userCompany=''` (ไม่ใช่นิติ) + ไม่มี corporate data → **WHT 1% + ใบกำกับ จะไม่ทำงาน**. ต้อง: ตั้ง `userCompany='1'` + เลขผู้เสียภาษี + ชื่อบริษัท/ที่อยู่ (รอ owner ยืนยัน).
3. **WHT locus ให้ตรง legacy + ไม่หักซ้ำ.** legacy หัก 1% ที่ (ก) ตอนลงเครดิต (forwarder.php) และ (ข) บนใบเสร็จเมื่อมี corporateNumber. ของเราหักบนใบวางบิล (นิติ ≥฿1,000). ต้อง **audit ว่าหักครั้งเดียว** ไม่ซ้อน.
4. **ปิดชุดงาน (`acc-forwarder.php`/`closingAccReportForwarder.php`).** ตรวจว่าเรามี report/เอกสารปิดงานเทียบเท่า — ถ้าไม่มี = สร้าง (read-only report ปลอดภัย).

## 4. ความพร้อม migrate PR099/PR999 — เช็คบน prod
- ✅ ย้ายแล้ว (profile active · ชื่อ PR099=ลีนวัฒน์ ดาลัดวงศ์ · PR999=นันทพร จีนงี่)
- ✅ เครดิตเปิด + วงเงิน (300k / 1M) + เทอม 15 วัน
- ❌ ยังเป็น "บุคคล" (userCompany='') → ต้องตั้งนิติ + corporate data ถ้าเป็นนิติจริง
- ❌ default เอกสารภาษี ยังไม่ได้ตั้ง (ลูกค้านิติเครดิตควร = ใบกำกับ)
- platform: 76 เปิดเครดิต · 75 มีวงเงิน · 364 นิติ · tb_credit ว่าง (ยอดค้าง 0 = ถูกต้อง lazy)

## 5. ลำดับงาน (money-safe · gate ทุกสเต็ป)
1. **(pure code)** ปุ่มแก้ "เอกสารภาษี" ชัดๆ บน forwarder detail (ใช้ `adminUpdateForwarderTaxDocMode` ที่มีอยู่ · §0f confirm) — แก้ pain "หาที่แก้ไม่เจอ".
2. **(migration เล็ก)** default เอกสารภาษีต่อลูกค้า (`tb_users.tax_doc_default` หรือผูก corporate) → create order ดึง default.
3. **(owner input)** ยืนยัน PR099/PR999 (และลูกค้าเครดิตอื่น) เป็นนิติ? → ตั้ง userCompany='1' + corporate (เลขภาษี/ชื่อ/ที่อยู่).
4. **(audit)** WHT หักครั้งเดียว end-to-end (credit-grant vs ใบวางบิล vs ใบเสร็จ).
5. **(read-only)** report ปิดชุดงาน เทียบ acc-forwarder.
6. **(QA)** เดินจริง 1 รอบกับ PR099: สร้างชิป → วางบิล → ใบแจ้งหนี้ → ลงเครดิต → เก็บเงิน → ใบหัก → ปิดงาน.

## คำถามถึง owner (ปลดล็อกสเต็ป 2-3)
1. **PR099/PR999 (+ ลูกค้าเครดิตเจ้าไหนบ้าง) เป็นนิติบุคคลจริงไหม?** ถ้าใช่ ขอ เลขผู้เสียภาษี + ชื่อบริษัท + ที่อยู่ (เพื่อออกใบกำกับ + หัก 1% ถูกต้อง). ถ้าเป็นบุคคลที่ให้เครดิต = ปล่อยเป็นบุคคลได้.
2. **ลูกค้านิติ+เครดิต ตั้ง default เอกสาร = "ใบกำกับ" เลยไหม?** (ออเดอร์ใหม่จะออกใบกำกับอัตโนมัติ ไม่ต้องติ๊กทีละชิป)
