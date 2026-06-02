# Test Cases — `/admin/forwarders/[fNo]`

**รายละเอียด/แก้ไขออเดอร์นำเข้า (เครื่องมือ admin ครบ)**

> Source: `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` · Group: `(admin)`

## ⚙️ Preconditions

- ต้อง login เป็น **admin** ที่มี role: `ops`, `accounting`
- ต้องมีข้อมูลทดสอบสำหรับ param: `[fNo]` (ใช้ ID ที่มีจริงในระบบ)

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

### TC-02 · สิทธิ์เข้าถึง — admin ที่ไม่มี role `ops`/`accounting`

**ขั้นตอน:** login เป็น admin role อื่น แล้วเปิด URL

**ผลที่คาดหวัง:** **ถูกปฏิเสธ** (requireAdmin role gate) — เด้งกลับ/แจ้งไม่มีสิทธิ์

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-03 · สิทธิ์เข้าถึง — admin ที่มี role ที่อนุญาต

**ขั้นตอน:** login เป็น admin (ops / accounting)

**ผลที่คาดหวัง:** เข้าถึงได้ + แสดงหน้า

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-04 · การแสดงผลหน้า

**ขั้นตอน:** เปิดหน้าในสถานะ login ที่ถูกต้อง

**ผลที่คาดหวัง:**
- หน้าโหลดสำเร็จ (HTTP 200) ไม่มี error/หน้าขาว
- แสดง component หลัก: `bill-to-override-panel`, `button`
- ข้อมูลที่ดึงจาก DB แสดงครบ (ไม่ใช่ ฿0/ว่างทั้งที่ควรมีข้อมูล)

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-05 · Param ที่ไม่มีอยู่จริง

**ขั้นตอน:** เปิด URL ด้วย ID ที่ไม่มีในระบบ

**ผลที่คาดหวัง:** **หน้า 404 (notFound)**

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-06 · Feature — `adminUpdateForwarder()`

**Action:** `actions/admin/forwarders` → `adminUpdateForwarder`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-07 · Feature — `adminMarkForwarderPaid()`

**Action:** `actions/admin/forwarders` → `adminMarkForwarderPaid`

**ผลที่คาดหวัง:** ⚙️ ทำรายการ → ผลสำเร็จแสดง (refresh/toast) · error → ข้อความผิดพลาด

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-08 · Feature — `adminBulkUpdateForwarderTbStatus()`

**Action:** `actions/admin/forwarders` → `adminBulkUpdateForwarderTbStatus`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-09 · Feature — `adminSaveForwarderNote()`

**Action:** `actions/admin/forwarders` → `adminSaveForwarderNote`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-10 · Feature — `adminPayForwardersOnBehalf()`

**Action:** `actions/admin/pay-user` → `adminPayForwardersOnBehalf`

**ผลที่คาดหวัง:** 💰 **กระทบเงินจริง** — กดทำรายการ → ยอด/สถานะเปลี่ยน (เช่น fstatus 5→6, ตัด/เพิ่ม wallet, ออกใบเสร็จ). ตรวจ output: toast/ข้อความสำเร็จ + ตัวเลขเปลี่ยนถูกต้อง + idempotent (กดซ้ำไม่หักซ้ำ)

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-11 · Feature — `adminPickForwarderAddress()`

**Action:** `actions/admin/forwarders-field-edits` → `adminPickForwarderAddress`

**ผลที่คาดหวัง:** ➕ กรอกฟอร์ม → submit → สร้างสำเร็จ → ปิดฟอร์ม/redirect + แถวใหม่โผล่ใน list. ฟอร์มไม่ครบ/ผิด → error inline (Zod `invalid_input`)

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-12 · Feature — `adminUpdateForwarderTransportType()`

**Action:** `actions/admin/forwarders-field-edits` → `adminUpdateForwarderTransportType`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-13 · Feature — `adminReassignForwarderOwner()`

**Action:** `actions/admin/forwarders-field-edits` → `adminReassignForwarderOwner`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-14 · Feature — `adminUpdateForwarderCover()`

**Action:** `actions/admin/forwarders-field-edits` → `adminUpdateForwarderCover`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-15 · Feature — `adminUpdateForwarderShipBy()`

**Action:** `actions/admin/forwarders-field-edits` → `adminUpdateForwarderShipBy`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-16 · Feature — `adminUpdateForwarderCostAdjust()`

**Action:** `actions/admin/forwarders-field-edits` → `adminUpdateForwarderCostAdjust`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-17 · Feature — `adminUpdateForwarderAmountCount()`

**Action:** `actions/admin/forwarders-field-edits` → `adminUpdateForwarderAmountCount`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-18 · Feature — `adminMarkForwarderCredit()`

**Action:** `actions/admin/forwarders-field-edits` → `adminMarkForwarderCredit`

**ผลที่คาดหวัง:** 💰 **กระทบเงินจริง** — กดทำรายการ → ยอด/สถานะเปลี่ยน (เช่น fstatus 5→6, ตัด/เพิ่ม wallet, ออกใบเสร็จ). ตรวจ output: toast/ข้อความสำเร็จ + ตัวเลขเปลี่ยนถูกต้อง + idempotent (กดซ้ำไม่หักซ้ำ)

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-19 · Feature — `bulkAssignDriver()`

**Action:** `actions/admin/forwarders-bulk` → `bulkAssignDriver`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-20 · Feature — `adminAssignDriverToForwarder()`

**Action:** `actions/admin/forwarder-drivers` → `adminAssignDriverToForwarder`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-21 · Feature — `adminAddForwarderCostAdjustment()`

**Action:** `actions/admin/forwarder-cost-adjustments` → `adminAddForwarderCostAdjustment`

**ผลที่คาดหวัง:** ➕ กรอกฟอร์ม → submit → สร้างสำเร็จ → ปิดฟอร์ม/redirect + แถวใหม่โผล่ใน list. ฟอร์มไม่ครบ/ผิด → error inline (Zod `invalid_input`)

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-22 · Feature — `adminMarkCostAdjustmentPaid()`

**Action:** `actions/admin/forwarder-cost-adjustments` → `adminMarkCostAdjustmentPaid`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-23 · Feature — `adminCancelCostAdjustment()`

**Action:** `actions/admin/forwarder-cost-adjustments` → `adminCancelCostAdjustment`

**ผลที่คาดหวัง:** ✏️ แก้ค่า → บันทึก → ค่าใหม่แสดงผลทันที (refresh). ค่าไม่ถูกต้อง → error inline

**สังเกตเพิ่ม:** list refresh อัตโนมัติ (`router.refresh`) · ส่งค่าว่าง/ผิด → error `invalid_input` (Zod) แสดง inline ไม่ submit

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-24 · Dialog ยืนยัน

**ขั้นตอน:** กดปุ่มที่ต้องยืนยัน (ลบ/อนุมัติ/ยกเลิก)

**ผลที่คาดหวัง:** มี **กล่อง/ขั้นยืนยัน** ขึ้นมา — กด "ยกเลิก" = ไม่เกิดอะไร · กด "ยืนยัน" = ทำรายการจริง

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

### TC-25 · สถานะ pending ระหว่างทำรายการ

**ขั้นตอน:** กดปุ่มทำรายการแล้วสังเกตระหว่างรอ

**ผลที่คาดหวัง:** ปุ่ม disabled/แสดง loading กันกดซ้ำ (useTransition) จนทำเสร็จ

**ผลทดสอบ:**  `[ ] ✅ ผ่าน`   `[ ] ❌ ไม่ผ่าน`   `[ ] 🔧 ต้องแก้/ไม่ถูกต้อง`   `[ ] ⏭ ข้าม`

**หมายเหตุ / บั๊กที่เจอ:** _______________________________________________

---

<sub>Auto-generated manual test scaffold (2026-06-02) from page + action signals. 18 action(s) detected. Edit/expand as you test. See [README.md](../../README.md).</sub>
