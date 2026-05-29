# Customer-profile fidelity audit + per-customer rate editor (เดฟ · 2026-05-30)

> เดฟ ส่งหน้า legacy `users/profile/PCS8304/` มาถามว่า **"เอามาครบทุกอย่างรวม legacy จริงไหม — ลูกค้าปรับเรทขาย/เรทต้นทุน ได้ในหน้า user เลย เชื่อมหลังบ้าน-หน้าบ้านวางบิล"**. คำตอบสั้น: **ยังไม่ครบ** — หน้า profile เราเป็น read-only stub + ตัวปรับเรท per-user ที่มีแยกหน้าก็ **เขียนแค่ history ไม่เขียน live rate** (bug แฝง). รอบนี้ปิด gap ตัวหลัก = **ฝังตัวปรับเรท (live + history) ในหน้า profile**.

แหล่งความจริง (verified จาก PHP source เอง · §0b ไม่เชื่อ HTML paste):
`C:\Users\Admin\Desktop\newrealdatapcs\pcscargo\member\pcs-admin\users.php` (customRate handler L333-593) + `include/function.php` (`calPriceForwarder()` L1973-2122).

---

## 1) Legacy customer-profile = ทำอะไรได้บ้าง (inventory)

| Feature | Legacy | Pacred ก่อนรอบนี้ |
|---|---|---|
| **ตั้งค่าเรทขนส่ง (gear→modal) — ปรับเรทขายต่อลูกค้า** | ✅ เขียน `tb_rate_custom_kg/cbm` + history + ราคาขั้นต่ำ | ❌ ไม่มีเลย |
| 8 stat cards (ฝากสั่ง/นำเข้า/ชำระ/wallet/เติม/จ่าย/ถอน/cashback) | ✅ | 🟡 มีแค่การ์ด wallet + recent lists |
| แก้ไขข้อมูลนิติบุคคล (เลขภาษี/ชื่อ/ที่อยู่/PDF) | ✅ `tb_corporate` | ❌ อ่านอย่างเดียว (convert-to-juristic เขียน rebuilt `corporate` คนละตาราง) |
| แก้ sales rep (editSale) | ✅ `tb_users.adminIDSale` | 🟡 transfer-rep เขียน `profiles.sales_admin_id` (split-brain — หน้า profile โชว์ `tb_users.adminIDSale`) |
| แก้ note (inline) | ✅ `tb_users.userNote` | ❌ อ่านอย่างเดียว |
| ที่อยู่ CRUD (add/edit/delete/set-main) | ✅ `tb_address` + `tb_address_main` | ❌ อ่านอย่างเดียว (admin) |
| ตารางออเดอร์เต็ม (shop/forwarder/payment/wallet-hs DataTables) | ✅ ทั้งหมด | 🟡 recent 10 แถว |

## 2) ตัวปรับเรท per-customer — การ wiring เข้า billing (verified)

**Legacy `customRate` (users.php):** เขียน **live** `tb_rate_custom_kg` + `tb_rate_custom_cbm` (key `userID`+`sourceWarehouse`+`rTransportType`+`rProductsType`, 16 แถว/โกดัง) **+ history** `tb_customrate_hs` + `tb_hs_rate_custom_kg/cbm`. SVIP = **มีแถวใน `tb_rate_custom_cbm`** (ไม่ flip column). per-user รองรับแค่ รถ(1)+เรือ(2) ไม่มีเครื่องบิน.

**Legacy billing waterfall (`calPriceForwarder`):**
`per-order manual (customRateSwitch)` → **per-user SVIP (`tb_rate_custom_*`)** → VIP-group (`tb_rate_vip_*` by coID) → general tiered (`tb_rate_g_*`). ไม่มีชั้น HS-code (`tb_hs_rate_custom_*` = history only). ไม่มีการ enforce ราคาขั้นต่ำ.

**ของเรา (ก่อนรอบนี้) — 3 ระบบ rate ขนานกัน + live `tb_forwarder` ไม่อ่าน rate เลย:**
- `/admin/rates/custom-user` = mislabeled → จริงๆ แก้ per-coid VIP group (`tb_rate_vip_*`)
- `/admin/rates/custom-hs` + `adminUpdateCustomerHsRates` = **เขียนแค่ history (`tb_customrate_hs` + `tb_hs_rate_custom_*`) ไม่เขียน live `tb_rate_custom_*`** → ตั้งเรทแล้ว **ไม่มีผล** (bug แฝง)
- `lib/forwarder/calc-price.ts` waterfall ใช้แค่ rebuilt `forwarders` lane (`service-import/add`) ที่แทบไม่มี data prod
- live `tb_forwarder` create/dimension-edit → zero-fill ทุก price field, **admin พิมพ์ราคามือ** (ไม่ calc)

## 3) สิ่งที่ ship รอบนี้ ✅ (faithful · safe · verified)

ฝัง **ตัวปรับเรท per-customer ในหน้า profile** (`/admin/customers/[id]`) — port `#rate-settings` modal:
- `lib/admin/customer-rate-tables.ts` — constants: warehouse (**1=กวางโจว 2=อี้อู** · แก้ของเดิมที่สลับ), transport (1รถ 2เรือ), product (1-4), DEFAULT_START (verbatim จาก source), COST_FLOOR (ค่า prod ปัจจุบันที่ owner ส่ง)
- `actions/admin/customer-rate.ts` — `adminSaveCustomerRate` เขียน **live `tb_rate_custom_kg/cbm` + history พร้อมกัน** (สิ่งที่ custom-hs เดิมขาด) · per-cell UPSERT · `getCustomerRateMatrix` reader · role `super/accounting/sales_admin`
- `app/.../customers/[id]/rate-editor.tsx` — Pacred Tailwind tabs (กวางโจว/อี้อู/คำอธิบาย+ราคาขั้นต่ำ) · pre-fill live-or-default · floor แดง (advisory) · confirm+diff · SVIP badge
- wire เข้า `legacy-view.tsx` + SVIP badge หัว + reword banner

**Floor = advisory เท่านั้น** (ไม่ block) — legacy ไม่ enforce + ลูกค้าจริง (PW: KG=0, CBM 4500<floor 5300) ต่ำกว่า floor อยู่แล้ว. **0 = ไม่คิดตามหน่วยนั้น** (ไม่นับว่าต่ำกว่า floor). Hard-enforce = owner policy decision (defer).

Verified บน prod (PW · SVIP จริง): render ✓ · pre-fill ✓ · SVIP badge ✓ · floor แดงเฉพาะ >0-below-floor ✓ · save round-trip ✓ (no-op = "0 ช่องเปลี่ยน" · ไม่ pollute) · 0 console errors. tsc 0 · lint 0.

## 4) ยังไม่ทำ — ตั้งโจทย์รอบหน้า (ต้อง owner sign-off เพราะกระทบเงิน)

1. 🔴 **Billing auto-apply (เชื่อมเข้าวางบิลจริง):** port `calPriceForwarder` waterfall → wire เข้า `adminUpdateForwarderDimensions` ให้ตอน admin กรอกขนาด/น้ำหนัก ระบบดึง per-user rate → คำนวณ `ftransportprice`/`ftotalprice` อัตโนมัติ. **เปลี่ยน logic ราคา live ของทั้ง `tb_forwarder` (45k แถว)** + พันกับ tax flow (WHT/VAT P0/P1 ที่ค้าง) → ทำพร้อมกัน + ตัดสินใจ deliberately. ตอนนี้ editor เขียน live rate รอไว้แล้ว (prerequisite พร้อม).
2. 🟡 Profile features ที่เหลือ: stat cards · edit-corporate (`tb_corporate`) · editSale inline (`tb_users.adminIDSale` · แก้ split-brain) · userNote · address CRUD · full order tables.
3. 🟡 แก้ warehouse label สลับใน `/admin/rates/{vip,custom-user,custom-hs}` (1↔2) + custom-hs ให้เขียน live ด้วย (หรือ retire ไปใช้ profile editor).
