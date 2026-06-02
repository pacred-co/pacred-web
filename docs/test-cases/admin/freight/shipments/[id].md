# Test Cases — `/admin/freight/shipments/[id]`

**รายละเอียด shipment freight**

> Source: `app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx` · Group: `(admin)`

## ⚙️ Preconditions

- ต้อง login เป็น **admin** ที่มี role: `super`, `ops`, `sales_admin`, `accounting`
- ต้องมีข้อมูลทดสอบสำหรับ param: `[id]` (ใช้ ID ที่มีจริงในระบบ)

## 📋 สรุปผลทดสอบ (กรอกตอนเทส)

| ผู้ทดสอบ | วันที่ | รวม | ✅ ผ่าน | ❌ ไม่ผ่าน | 🔧 ต้องแก้ |
|---|---|--:|--:|--:|--:|
| _______ | __/__/__ |  |  |  |  |

**สถานะหน้านี้:**  `[ ] ✅ ผ่านทั้งหมด`   `[ ] ⚠️ ผ่านบางส่วน`   `[ ] ❌ มีปัญหาต้องแก้`

---

### TC-01 · สิทธิ์เข้าถึง — เข้าหน้าโดยไม่ล็อกอิน

**ขั้นตอน:** logout แล้วเปิด URL

**ผลที่คาดหวัง:** **redirect → `/login`** (proxy.ts edge backstop)

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-02 · สิทธิ์เข้าถึง — admin ที่ไม่มี role `super`/`ops`/`sales_admin`/`accounting`

**ขั้นตอน:** login เป็น admin role อื่น แล้วเปิด URL

**ผลที่คาดหวัง:** **ถูกปฏิเสธ** (requireAdmin role gate) — เด้งกลับ/แจ้งไม่มีสิทธิ์

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-03 · สิทธิ์เข้าถึง — admin ที่มี role ที่อนุญาต

**ขั้นตอน:** login เป็น admin (super / ops / sales_admin / accounting)

**ผลที่คาดหวัง:** เข้าถึงได้ + แสดงหน้า

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-04 · การแสดงผลหน้า

**ขั้นตอน:** เปิดหน้าในสถานะ login ที่ถูกต้อง

**ผลที่คาดหวัง:**
- หน้าโหลดสำเร็จ (HTTP 200) ไม่มี error/หน้าขาว
- แสดง component หลัก: `work-item-thread`
- ตรวจข้อมูลที่ดึงจาก DB แสดงครบ (ไม่ใช่ ฿0/ว่างทั้งที่ควรมีข้อมูล) — table: `admin_audit_log`, `admins`, `customs_declaration_lines`, `customs_declarations`, `freight_invoice_lines`, `freight_invoice_payments`, `freight_invoices`, `freight_parties`, `freight_shipments`, `hs_codes`, `profiles`, `wallet_transactions`, `withholding_tax_entries`, `work_items`

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-05 · Param ที่ไม่มีอยู่จริง

**ขั้นตอน:** เปิด URL ด้วย ID ที่ไม่มีในระบบ

**ผลที่คาดหวัง:** **หน้า 404 (notFound)**

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-06 · Feature — `adminUpdateFreightShipment()`

**Action:** `actions/admin/freight-shipments` → `adminUpdateFreightShipment`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-07 · Feature — `adminUpsertFreightParty()`

**Action:** `actions/admin/freight-shipments` → `adminUpsertFreightParty`

**ผลที่คาดหวัง:** ➕ กรอกฟอร์ม → submit → สร้างสำเร็จ → ปิดฟอร์ม/redirect + แถวใหม่โผล่ใน list. ฟอร์มไม่ครบ/ผิด → error inline (Zod `invalid_input`)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-08 · Feature — `adminConfirmFreightShipment()`

**Action:** `actions/admin/freight-shipments` → `adminConfirmFreightShipment`

**ผลที่คาดหวัง:** ⚙️ ทำรายการ → ผลสำเร็จแสดง (refresh/toast) · error → ข้อความผิดพลาด

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-09 · Feature — `adminMarkFreightInProgress()`

**Action:** `actions/admin/freight-shipments` → `adminMarkFreightInProgress`

**ผลที่คาดหวัง:** ⚙️ ทำรายการ → ผลสำเร็จแสดง (refresh/toast) · error → ข้อความผิดพลาด

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-10 · Feature — `adminMarkFreightCleared()`

**Action:** `actions/admin/freight-shipments` → `adminMarkFreightCleared`

**ผลที่คาดหวัง:** ⚙️ ทำรายการ → ผลสำเร็จแสดง (refresh/toast) · error → ข้อความผิดพลาด

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-11 · Feature — `adminMarkFreightDelivered()`

**Action:** `actions/admin/freight-shipments` → `adminMarkFreightDelivered`

**ผลที่คาดหวัง:** ⚙️ ทำรายการ → ผลสำเร็จแสดง (refresh/toast) · error → ข้อความผิดพลาด

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-12 · Feature — `adminCancelFreightShipment()`

**Action:** `actions/admin/freight-shipments` → `adminCancelFreightShipment`

**ผลที่คาดหวัง:** 🔀 กดสลับสถานะ → state เปลี่ยน (active/ระงับ) + แสดงผลทันที

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-13 · Feature — `adminCreateFreightInvoice()`

**Action:** `actions/admin/freight-invoices` → `adminCreateFreightInvoice`

**ผลที่คาดหวัง:** ➕ กรอกฟอร์ม → submit → สร้างสำเร็จ → ปิดฟอร์ม/redirect + แถวใหม่โผล่ใน list. ฟอร์มไม่ครบ/ผิด → error inline (Zod `invalid_input`)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-14 · Feature — `adminAddFreightInvoiceLine()`

**Action:** `actions/admin/freight-invoices` → `adminAddFreightInvoiceLine`

**ผลที่คาดหวัง:** ➕ กรอกฟอร์ม → submit → สร้างสำเร็จ → ปิดฟอร์ม/redirect + แถวใหม่โผล่ใน list. ฟอร์มไม่ครบ/ผิด → error inline (Zod `invalid_input`)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-15 · Feature — `adminUpdateFreightInvoiceLine()`

**Action:** `actions/admin/freight-invoices` → `adminUpdateFreightInvoiceLine`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-16 · Feature — `adminDeleteFreightInvoiceLine()`

**Action:** `actions/admin/freight-invoices` → `adminDeleteFreightInvoiceLine`

**ผลที่คาดหวัง:** 🔴 **ต้องมีการยืนยันก่อน** (two-step confirm / dialog / พิมพ์โค้ดยืนยัน). กดยืนยัน → ลบสำเร็จ → รายการหายจาก list (`router.refresh`). ถ้าแถวมีข้อมูลผูกอยู่ (orders/wallet) ระบบควร **ปฏิเสธ** พร้อม error

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-17 · Feature — `adminIssueFreightInvoice()`

**Action:** `actions/admin/freight-invoices` → `adminIssueFreightInvoice`

**ผลที่คาดหวัง:** ➕ กรอกฟอร์ม → submit → สร้างสำเร็จ → ปิดฟอร์ม/redirect + แถวใหม่โผล่ใน list. ฟอร์มไม่ครบ/ผิด → error inline (Zod `invalid_input`)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-18 · Feature — `adminCancelFreightInvoice()`

**Action:** `actions/admin/freight-invoices` → `adminCancelFreightInvoice`

**ผลที่คาดหวัง:** 🔀 กดสลับสถานะ → state เปลี่ยน (active/ระงับ) + แสดงผลทันที

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-19 · Feature — `recordFreightPayment()`

**Action:** `actions/admin/freight-invoice-payments` → `recordFreightPayment`

**ผลที่คาดหวัง:** 💰 **กระทบเงินจริง** — กดทำรายการ → ยอด/สถานะเปลี่ยน (เช่น fstatus 5→6, ตัด/เพิ่ม wallet, ออกใบเสร็จ). ตรวจ output: toast/ข้อความสำเร็จ + ตัวเลขเปลี่ยนถูกต้อง + idempotent (กดซ้ำไม่หักซ้ำ)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-20 · Feature — `uploadFreightPaymentSlip()`

**Action:** `actions/admin/freight-invoice-payments` → `uploadFreightPaymentSlip`

**ผลที่คาดหวัง:** 💰 **กระทบเงินจริง** — กดทำรายการ → ยอด/สถานะเปลี่ยน (เช่น fstatus 5→6, ตัด/เพิ่ม wallet, ออกใบเสร็จ). ตรวจ output: toast/ข้อความสำเร็จ + ตัวเลขเปลี่ยนถูกต้อง + idempotent (กดซ้ำไม่หักซ้ำ)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-21 · Feature — `voidFreightPayment()`

**Action:** `actions/admin/freight-invoice-payments` → `voidFreightPayment`

**ผลที่คาดหวัง:** 💰 **กระทบเงินจริง** — กดทำรายการ → ยอด/สถานะเปลี่ยน (เช่น fstatus 5→6, ตัด/เพิ่ม wallet, ออกใบเสร็จ). ตรวจ output: toast/ข้อความสำเร็จ + ตัวเลขเปลี่ยนถูกต้อง + idempotent (กดซ้ำไม่หักซ้ำ)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-22 · Feature — `adminCreateDeclaration()`

**Action:** `actions/admin/customs-declarations` → `adminCreateDeclaration`

**ผลที่คาดหวัง:** ➕ กรอกฟอร์ม → submit → สร้างสำเร็จ → ปิดฟอร์ม/redirect + แถวใหม่โผล่ใน list. ฟอร์มไม่ครบ/ผิด → error inline (Zod `invalid_input`)

**สังเกตเพิ่ม:** อาจ navigate → `/admin/freight/declarations/${res.data.id}` · list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-23 · Dialog ยืนยัน

**ขั้นตอน:** กดปุ่มที่ต้องยืนยัน (ลบ/อนุมัติ/ยกเลิก)

**ผลที่คาดหวัง:** มี **กล่อง/ขั้นยืนยัน** ขึ้นมา — กด "ยกเลิก" = ไม่เกิดอะไร · กด "ยืนยัน" = ทำรายการจริง

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-24 · สถานะ pending ระหว่างทำรายการ

**ขั้นตอน:** กดปุ่มทำรายการแล้วสังเกตระหว่างรอ

**ผลที่คาดหวัง:** ปุ่ม disabled/แสดง loading กันกดซ้ำ (useTransition) จนทำเสร็จ

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

---

<sub>Auto-generated manual test scaffold (2026-06-02) from page + action signals. 17 action(s) detected. Edit/expand as you test. See [README.md](../../../README.md).</sub>
