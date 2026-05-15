# 🧪 Pacred — ภูม browser-test playbook (2026-05-16)

> **Purpose:** ภูม เปิดเบราว์เซอร์เทสต์งานที่ shipped แล้ว — เดินทุก path เหมือนลูกค้า + พนักงานจริง. เจอบั๊ก → จดบรรทัด + commit/issue กลับมาแก้ได้เลย.
>
> Last reviewed: 2026-05-16 night (ภูม via Claude)
> Coverage: ทุก commit ใน `Poom` ที่ shipped session นี้ (`93d23eb..HEAD`) + smoke ของฟีเจอร์เดิมที่อาจ touch.
> Dev server: `pnpm dev` → http://localhost:3000

---

## 📋 Pre-flight (ก่อนเริ่ม)

- [ ] รัน migrations ครบ `0041_bill_to_name_override` + `0042_cargo_containers_close_at` + `0043_slip_transferred_at` บน dev Supabase
- [ ] `pnpm dev` ขึ้นด้วย Ready in <5s (ถ้านานต้อง investigate)
- [ ] เปิด DevTools → Network + Console (เจอ error/warning ระหว่างทาง)
- [ ] เคลียร์ cookie ถ้ามี AuthApiError "Invalid Refresh Token" ในเซสชันก่อน

---

## 🛍 ลูกค้าใหม่ — full signup → first order (~10 นาที)

### A. Signup
- [ ] เข้า `/register` → personal flow
- [ ] กรอกข้อมูล step 1 (ชื่อ+เบอร์+password) → ถ้า `OTP_BYPASS=true` ข้าม OTP, อื่น ๆ ใส่ 123456
- [ ] step 2 (อัปโหลด ID + ที่อยู่)
- [ ] step 3 (ยอมรับ TOS)
- [ ] redirect ไป `/dashboard` → เห็น member_code `PR0XXXX`
- [ ] หรือ juristic flow `/register?type=juristic` — 3 step + tax_id 13 หลัก

### B. Profile + address
- [ ] `/profile` — เห็นข้อมูลตัวเอง
- [ ] `/profile/security/change-phone` — เปลี่ยนเบอร์ (ต้อง OTP)
- [ ] `/addresses` → เพิ่มที่อยู่ใหม่ → ตั้งเป็น default

### C. Wallet deposit
- [ ] `/wallet/deposit` → กรอกยอด + เลือกธนาคาร + อัปโหลดสลิป → submit
- [ ] เห็น "รอตรวจสอบ" ใน `/wallet`

### D. Place service-order (ฝากสั่งซื้อ)
- [ ] `/service-order/add` → URL ของ 1688/Taobao (หรือ manual) → กรอก qty + ราคา
- [ ] ไป `/service-order/cart` → กดสั่งซื้อ → กรอกที่อยู่จัดส่ง → submit
- [ ] `/service-order/[hNo]` → status `pending` → รออนุมัติ

### E. Place service-import (ฝากนำเข้า)
- [ ] `/service-import/add` → กรอก tracking + 描述 + กล่อง/น้ำหนัก/CBM + เลือกขนส่ง
- [ ] `/service-import/[fNo]` → status `pending_payment`

### F. ดู shipments tracking (V-D2/D3/V-C3 polish)
- [ ] `/shipments` → list (รอแอดมิน create cargo_shipment ก่อนถึงเห็น)
- [ ] `/shipments/[code]` (หลังจาก admin create) → check:
  - [ ] หัวการ์ด status + relative-time pill (U1-7)
  - [ ] ตู้คอนเทนเนอร์ — ถ้า admin ใส่ B/L เห็น "เลขตู้สายเรือ (B/L)"
  - [ ] ประเภทสินค้า — ถ้า admin ตั้ง cargo_type เห็น Thai label
  - [ ] **⏰ การ์ดตัดตู้** — ถ้า close_at ตั้งและยังไม่ถึง → countdown "อีก N วัน" (amber ถ้า ≤1 วัน)
  - [ ] timeline newest-first

### G. Pay from wallet
- [ ] หลังแอดมิน approve deposit + total order → `/service-order/[hNo]` ปุ่ม "ชำระจาก wallet"
- [ ] กด → ดู balance อัพเดท + status flip

### H. ดูใบเสร็จ / ใบกำกับภาษี
- [ ] `/service-order/[hNo]/receipt` — HTML + ปุ่มดาวน์โหลด PDF
- [ ] กดดาวน์โหลด PDF → ตรวจ:
  - [ ] ชื่อบนหัวบิล — ถ้าแอดมินตั้ง bill_to_name_override จะใช้ override; ถ้าไม่ ตามชื่อจริง (ลูกค้าทั่วไป = first+last, นิติบุคคล = company_name)
- [ ] (juristic only) panel "ขอใบกำกับภาษี" → กรอก buyer info → submit → รอแอดมิน issue → ดาวน์โหลด PDF

---

## 👷 พนักงาน admin — รับงานลูกค้า (~15 นาที)

### Admin login
- [ ] `/login` ด้วย admin account → redirect `/admin`
- [ ] Sidebar ครบ groups (ภาพรวม / ปฏิบัติการ / การเงิน / ลูกค้า·ขาย / องค์กร / ระบบ / **รีพอร์ตเฉพาะกิจ**)

### I. Approve deposit (V-A1 — slip_transferred_at)
- [ ] `/admin/wallet` → kind=deposit, status=pending
- [ ] ดูคอลัมน์วันที่ — เห็น 2 บรรทัด: "ระบบ" (created_at) + "⏱ โอน:" (slip_transferred_at)
- [ ] ครั้งแรกเห็น "— ไม่ได้บันทึก" + ปุ่ม ✏️ — กด → เปิด datetime-local picker → ใส่เวลาจริงจากสลิป → บันทึก
- [ ] ลอง bulk-select pending → bulk approve sticky bar
- [ ] ตรวจ wallet ลูกค้าได้รับเงินจริง

### J. Approve yuan payment (V-A1)
- [ ] `/admin/yuan-payments` → ทำเหมือน wallet (slip_transferred_at เหมือนกัน)

### K. Manage forwarder (V-C2 bill_to + V-D2/D3 cargo_type/B/L)
- [ ] `/admin/forwarders` → คลิก f_no
- [ ] sidebar เห็น panels: status form / driver assign / cost adjustments / **🧾 ชื่อบนบิล**
- [ ] panel "ชื่อบนบิล" — ใส่ "บริษัท ทดสอบ จำกัด" → save → กดดาวน์โหลด PDF (`/api/pdf/forwarder/[fNo]`) → ตรวจชื่อหัวบิลเปลี่ยน
- [ ] กด adminMarkForwarderPaid (ปุ่ม wallet หรือ cash override)

### L. Service-order admin
- [ ] `/admin/service-orders/[hNo]` → sidebar update-form + "ชื่อบนบิล" panel (เหมือนกัน)
- [ ] ⚠️ **known issue F-1**: default name hint แสดง first+last แม้ลูกค้านิติบุคคล (PDF จริงใช้ company_name). Override ทำงานถูก — แค่ hint ไม่ตรง.
- [ ] กด mark-paid

### M. Container + warehouse (V-D2/D3 + V-C3 ครบชุด)
- [ ] `/admin/warehouse/containers` → "➕ สร้างตู้ใหม่"
  - [ ] ใส่ origin/destination, **B/L** "BLOU2025012", **ตัดตู้** datetime-local (ตั้งวันพรุ่งนี้)
- [ ] เปิดตู้ที่สร้าง → `/admin/warehouse/containers/[code]`
  - [ ] header เห็น "เลขตู้สายเรือ / B/L: BLOU2025012"
  - [ ] header chip "⏰ ตัดตู้: ... (อีก N ชม.)" amber/blue
  - [ ] sidebar เห็น 3 panels: status / **⏰ ตัดตู้ (close_at)** / **+ shipment manual**
- [ ] sidebar manual-shipment form → ใส่ member_code + tracking + qty + select cargo_type → submit
- [ ] เห็น shipment row + 🏷️ ประเภท badge + 3 buttons (📦 รับเข้า / 🔄 ย้ายตู้ / 🏷️ ประเภท)
- [ ] กด 🏷️ → เปลี่ยน cargo_type → save
- [ ] **เทสต์ V-C3 guard:** ลบ close_at → ตั้งใหม่เป็นอดีต (1 ชม. ก่อน) → กลับมาที่หน้า detail → manual-shipment form กลายเป็น "⏰ ปิดรับแล้ว"
- [ ] ลองสร้าง shipment ใหม่ผ่าน form อื่น (ถ้ามี) → server reject พร้อม Thai error

### N. Tax invoice (T-P4 G2c)
- [ ] `/admin/tax-invoices` → status filter chips
- [ ] เปิด pending → กด "ออกใบกำกับ" 2-step (confirm → fire) → ดาวน์โหลด PDF
- [ ] กด "ยกเลิก" → ใส่ reason ≥3 chars → fire → PDF render มี CANCELLED watermark

### O. รีพอร์ต self-serve (V-B1 — 6 อัน)
- [ ] sidebar "รีพอร์ตเฉพาะกิจ" group:
  - [ ] **รอชำระเงิน** — forwarders pending_payment; ดู badge "ค้าง ≥ 7 วัน" สีแดง + CSV
  - [ ] **เครดิตค้างนำเข้า** — shipped+ forwarders ไม่มี wallet_tx import_payment; date filter + CSV
  - [ ] **ตู้รอเข้าไทย** — cargo_containers in transit; ดู ETA countdown + overdue chip
  - [ ] **ลูกค้าติดหนี้** — wallet balance < 0 OR credit < 0; ดูยอดสีแดง + ลิงก์ไป /admin/customers/[id]
  - [ ] **คืนเงิน** — wallet_tx kind=refund completed; default 30-day; CSV includes slip_transferred_at (V-A1 polish)
  - [ ] **ออเดอร์รายเดือน** — 13-month picker + 2-pane forwarders/service_orders + status breakdown + combined CSV

### P. รัฐบาลแก้ rates (LP-1a/b/c1)
- [ ] `/admin/rates` → 3 cards ทุกใบ live
- [ ] `/admin/rates/general?group=PR` → tab ลูกค้ากลุ่ม → แก้ tier1/2/3 inline → save dirty-only → delete confirm; add new row form
- [ ] `/admin/rates/vip?group=PR` → flat rate; เพิ่มใหม่ลอง upsert (ใส่คีย์เดิม ค่าใหม่ → ทับ)
- [ ] `/admin/rates/custom-user` → add ด้วย member_code (PR00001) → ดูจัดกลุ่มตามลูกค้า; กรอง `?member=PR00001`

### Q. Daily container bulletin (U2-1)
- [ ] `/admin/warehouse/bulletin` → ปุ่ม 📋 copy-to-clipboard → paste ไหนก็ได้ดูฟอร์แมท

### R. CSV imports (P-19)
- [ ] `/admin/csv-imports` → upload CSV → ดู import + audit

---

## 🚨 อะไรเป็นบัค → ทำอย่างไร

1. จดบรรทัด + URL + step ที่ทำ
2. ส่งให้ฉัน (ภูม via Claude) ใน chat
3. ฉันแก้ + commit + push → real-time sync (per feedback_test_before_push)
4. ภูม pull → เทสต์ซ้ำ

---

## หมายเหตุ

- เทสบนเครื่อง home machine: dev server อาจ slow first-compile ต่อ route ใหม่ — รอประมาณ 2-9s ต่อ route ใหม่
- ตู้ legacy `/admin/containers` (0016 schema) คนละหน้ากับ `/admin/warehouse/containers` (0033 spine) — อย่าสับสน
- Sidebar items ขึ้นตาม role: super เห็นครบ, ops เห็น operations + warehouse, accounting เห็นการเงิน + reports
