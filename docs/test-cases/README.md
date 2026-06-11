# 🧪 Manual Test Cases — Pacred

> เทสเคสสำหรับ manual test ทุกหน้า (365 routes). สร้างจาก docs (database + pages + components) + signal จาก code จริง. **รวม 1905 test cases.**

แต่ละไฟล์ = 1 หน้า มี: preconditions · TC สิทธิ์เข้าถึง · TC การแสดงผล · TC ราย-feature (ต่อ server action) · dialog/redirect/pending · mobile.

👉 อ่าน [`_cross-cutting.md`](_cross-cutting.md) สำหรับเทสกลางที่ใช้ทุกหน้า

## วิธีอ่าน expected output

| สัญลักษณ์ | หมายถึง |
|---|---|
| 🔴 destructive | ลบ/อันตราย — ต้องมีขั้นยืนยัน |
| 💰 money | กระทบเงินจริง — ตรวจตัวเลข + idempotent |
| ➕ create / ✏️ update / 🔀 toggle | mutation ปกติ |

## วิธีบันทึกผล (ในแต่ละไฟล์)

แต่ละ TC มีช่องให้ติ๊ก — เปลี่ยน `[ ]` เป็น `[x]`:

```
**ผลทดสอบ:**  [x] ✅ ผ่าน   [ ] ❌ ไม่ผ่าน   [ ] 🔧 ต้องแก้/ไม่ถูกต้อง   [ ] ⏭ ข้าม
**หมายเหตุ / บั๊กที่เจอ:** (พิมพ์สิ่งที่เจอตรงนี้)
```

หัวไฟล์มีตาราง "สรุปผลทดสอบ" ให้กรอกผู้ทดสอบ/วันที่/จำนวน. คอลัมน์ **สถานะ** ในดัชนีข้างล่าง อัปเดตเป็น ✅/⚠️/❌ เมื่อเทสหน้านั้นเสร็จ.

## ดัชนีตามกลุ่ม

### 🌐 Public — 44 pages

| Route | คืออะไร | #TC | สถานะ |
|---|---|--:|---|
| [`/`](index.md) | หน้าแรกเว็บไซต์ Pacred — hero + บริการ + จุดขาย + CTA เข้าระบบ | 3 | ✅ ผ่านทั้งหมด |
| [`/about`](about.md) | เกี่ยวกับบริษัท Pacred — ประวัติ วิสัยทัศน์ ทีมงาน | 3 | ✅ ผ่านทั้งหมด |
| [`/book`](book.md) | เริ่มขั้นตอนจองบริการ | 3 | ✅ ผ่านทั้งหมด |
| [`/book-start`](book-start.md) | จุดเริ่มจอง (auth-gated) | 4 | ❌ มีปัญหาต้องแก้ |
| [`/book/[service]`](book/[service].md) | เลือกบริการที่จะจอง | 4 | ⚠️ ผ่านบางส่วน |
| [`/book/[service]/[route]`](book/[service]/[route].md) | เลือกเส้นทางขนส่งของบริการนั้น | 4 | ⬜ ยังไม่เทส |
| [`/book/[service]/[route]/confirmation`](book/[service]/[route]/confirmation.md) | ยืนยันการจองสำเร็จ | 4 | ⬜ ยังไม่เทส |
| [`/book/[service]/[route]/review`](book/[service]/[route]/review.md) | ทบทวนรายการก่อนยืนยันการจอง | 6 | ⬜ ยังไม่เทส |
| [`/booking`](booking.md) | Landing: จองบริการขนส่ง (freight booking) | 3 | ⬜ ยังไม่เทส |
| [`/contact`](contact.md) | หน้าติดต่อ + ฟอร์มส่งข้อความ (lead funnel → contact_messages) | 3 | ✅ ผ่านทั้งหมด |
| [`/customs-clearance-shipping-suvarnabhumi`](customs-clearance-shipping-suvarnabhumi.md) | Landing SEO: เคลียร์ของสนามบินสุวรรณภูมิ | 3 | ✅ ผ่านทั้งหมด |
| [`/customs-clearance-shipping-suvarnabhumi/[port]`](customs-clearance-shipping-suvarnabhumi/[port].md) | Landing SEO ตามด่าน/ท่า | 4 | ⬜ ยังไม่เทส |
| [`/delivery-areas`](delivery-areas.md) | พื้นที่ให้บริการจัดส่ง | 3 | ✅ ผ่านทั้งหมด |
| [`/faq`](faq.md) | คำถามที่พบบ่อย | 3 | ✅ ผ่านทั้งหมด |
| [`/freight-quote`](freight-quote.md) | ขอใบเสนอราคา freight (ฟอร์มลูกค้า) | 3 | ✅ ผ่านทั้งหมด |
| [`/holidays`](holidays.md) | วันหยุดบริษัท | 3 | ✅ ผ่านทั้งหมด |
| [`/how-to-use`](how-to-use.md) | วิธีใช้งานระบบ Pacred (คู่มือลูกค้า) | 3 | ✅ ผ่านทั้งหมด |
| [`/join-us`](join-us.md) | หน้าสมัครงาน / ร่วมงานกับ Pacred | 3 | ⬜ ยังไม่เทส |
| [`/knowledge`](knowledge.md) | คลังความรู้ (knowledge base) — รายการบทความ | 3 | ✅ ผ่านทั้งหมด |
| [`/knowledge/[slug]`](knowledge/[slug].md) | บทความความรู้รายชิ้น | 4 | ⬜ ยังไม่เทส |
| [`/line`](line.md) | หน้า redirect/เชื่อม LINE OA | 3 | ✅ ผ่านทั้งหมด |
| [`/news`](news.md) | รายการข่าว/บทความ | 3 | ✅ ผ่านทั้งหมด |
| [`/news/[slug]`](news/[slug].md) | หน้าข่าว/บทความรายชิ้น | 4 | ⬜ ยังไม่เทส |
| [`/payment/1688`](payment/1688.md) | ชำระ/ฝากโอนผ่าน 1688 | 3 | ❌ มีปัญหาต้องแก้ (เอาหน้านี้ออก) |
| [`/payment/alipay`](payment/alipay.md) | ชำระ/ฝากโอนผ่าน Alipay | 3 | ❌ มีปัญหาต้องแก้ (เอาหน้านี้ออก) |
| [`/payment/taobao`](payment/taobao.md) | ชำระ/ฝากโอนผ่าน Taobao | 3 | ❌ มีปัญหาต้องแก้ (เอาหน้านี้ออก) |
| [`/privacy`](privacy.md) | นโยบายความเป็นส่วนตัว | 3 | ✅ ผ่านทั้งหมด |
| [`/reviews`](reviews.md) | รีวิวจากลูกค้า | 3 | ✅ ผ่านทั้งหมด |
| [`/reviews/[id]`](reviews/[id].md) | รีวิวรายชิ้น | 4 | ⬜ ยังไม่เทส |
| [`/services`](services.md) | ภาพรวมบริการทั้งหมด (service grid) | 3 | ✅ ผ่านทั้งหมด |
| [`/services/china-shopping`](services/china-shopping.md) | Landing: ฝากสั่งซื้อสินค้าจีน | 3 | ✅ ผ่านทั้งหมด |
| [`/services/customs-clearance`](services/customs-clearance.md) | Landing: เคลียร์ศุลกากร | 3 | ❌ มีปัญหาต้องแก้ (หน้าไม่มี) |
| [`/services/export-worldwide`](services/export-worldwide.md) | Landing: ส่งออกสินค้าทั่วโลก | 3 | ✅ ผ่านทั้งหมด |
| [`/services/import-china`](services/import-china.md) | Landing: นำเข้าจากจีน | 3 | ❌ มีปัญหาต้องแก้ (แก้ UI)|
| [`/services/import-china-fcl`](services/import-china-fcl.md) | Landing: นำเข้าจากจีนแบบ FCL (เต็มตู้) | 3 | ❌ มีปัญหาต้องแก้ (แก้ UI)|
| [`/services/import-china-lcl`](services/import-china-lcl.md) | Landing: นำเข้าจากจีนแบบ LCL (ไม่เต็มตู้) | 3 | ✅ ผ่านทั้งหมด |
| [`/services/yuan-transfer`](services/yuan-transfer.md) | Landing: ฝากโอนเงินหยวน | 3 | ✅ ผ่านทั้งหมด |
| [`/start-order`](start-order.md) | จุดเริ่มสั่งซื้อ (buy-bridge) | 4 | ⬜ ยังไม่เทส |
| [`/status`](status.md) | หน้าตรวจสถานะระบบ | 3 | ❌ มีปัญหาต้องแก้ (เอาหน้านี้ออก) |
| [`/terms`](terms.md) | ข้อกำหนดการใช้บริการ | 3 | ✅ ผ่านทั้งหมด |
| [`/warehouses/china`](warehouses/china.md) | ข้อมูลโกดังจีน (ที่อยู่รับของ) | 3 | ✅ ผ่านทั้งหมด |
| [`/warehouses/guangzhou`](warehouses/guangzhou.md) | ข้อมูลโกดังกวางโจว | 3 | ✅ ผ่านทั้งหมด |
| [`/warehouses/thailand`](warehouses/thailand.md) | ข้อมูลโกดังไทย | 3 | ✅ ผ่านทั้งหมด |
| [`/warehouses/yiwu`](warehouses/yiwu.md) | ข้อมูลโกดังอี้อู | 3 | ✅ ผ่านทั้งหมด |

### 👤 Auth — 3 pages

| Route | คืออะไร | #TC | สถานะ |
|---|---|--:|---|
| [`/forgot-password`](forgot-password.md) | ขอรีเซ็ตรหัสผ่าน | 8 | ⬜ ยังไม่เทส |
| [`/login`](login.md) | เข้าสู่ระบบ (เบอร์/อีเมล + รหัสผ่าน · รองรับ legacy PCS login) | 7 | ⬜ ยังไม่เทส |
| [`/register`](register.md) | สมัครสมาชิกใหม่ (+ assign sales rep รอบ round-robin) | 10 | ⬜ ยังไม่เทส |

### 🔒 Customer portal — 67 pages

| Route | คืออะไร | #TC | สถานะ |
|---|---|--:|---|
| [`/account-settings`](account-settings.md) | ตั้งค่าบัญชี (ข้อมูลส่วนตัว/รหัสผ่าน) | 5 | ⬜ ยังไม่เทส |
| [`/addresses`](addresses.md) | สมุดที่อยู่จัดส่งของลูกค้า | 5 | ⬜ ยังไม่เทส |
| [`/bookings`](bookings.md) | รายการการจองของลูกค้า | 4 | ⬜ ยังไม่เทส |
| [`/bookings/[bookingNo]`](bookings/[bookingNo].md) | รายละเอียดการจอง | 5 | ⬜ ยังไม่เทส |
| [`/cart`](cart.md) | ตะกร้าฝากสั่งซื้อ | 13 | ⬜ ยังไม่เทส |
| [`/cart/add`](cart/add.md) | เพิ่มสินค้าเข้าตะกร้า | 4 | ⬜ ยังไม่เทส |
| [`/china-address`](china-address.md) | ที่อยู่โกดังจีนสำหรับให้ลูกค้าส่งของเข้า | 4 | ⬜ ยังไม่เทส |
| [`/commissions`](commissions.md) | คอมมิชชัน (มุมมองลูกค้า/ตัวแทน) | 7 | ⬜ ยังไม่เทส |
| [`/commissions/me`](commissions/me.md) | คอมมิชชันของฉัน | 6 | ⬜ ยังไม่เทส |
| [`/commissions/me/[id]`](commissions/me/[id].md) | รายละเอียดคอมมิชชันรายการหนึ่ง | 5 | ⬜ ยังไม่เทส |
| [`/dashboard`](dashboard.md) | แดชบอร์ดลูกค้า — สรุปออเดอร์/กระเป๋าเงิน/แจ้งเตือน | 4 | ⬜ ยังไม่เทส |
| [`/freight`](freight.md) | Landing freight (FCL/LCL/AIR ระหว่างประเทศ) | 4 | ⬜ ยังไม่เทส |
| [`/freight/invoice/[id]`](freight/invoice/[id].md) | ใบแจ้งหนี้ freight | 5 | ⬜ ยังไม่เทส |
| [`/freight/quotes/[quote_no]`](freight/quotes/[quote_no].md) | ใบเสนอราคา freight ของลูกค้า | 7 | ⬜ ยังไม่เทส |
| [`/freight/receipts/history`](freight/receipts/history.md) | ประวัติใบเสร็จ freight | 4 | ⬜ ยังไม่เทส |
| [`/freight/receipts/print/[id]`](freight/receipts/print/[id].md) | พิมพ์ใบเสร็จ freight | 5 | ⬜ ยังไม่เทส |
| [`/freight/shipments`](freight/shipments.md) | รายการ shipment freight ของลูกค้า | 4 | ⬜ ยังไม่เทส |
| [`/freight/shipments/[id]`](freight/shipments/[id].md) | รายละเอียด shipment freight | 5 | ⬜ ยังไม่เทส |
| [`/line-settings`](line-settings.md) | ตั้งค่าการเชื่อม/แจ้งเตือน LINE | 7 | ⬜ ยังไม่เทส |
| [`/m/dashboard`](m/dashboard.md) | แดชบอร์ดลูกค้าเวอร์ชันมือถือ | 6 | ⬜ ยังไม่เทส |
| [`/map`](map.md) | แผนที่/ที่ตั้งสำนักงาน-โกดัง | 4 | ⬜ ยังไม่เทส |
| [`/my-issues`](my-issues.md) | เคส/ปัญหาที่ลูกค้าแจ้งไว้ | 4 | ⬜ ยังไม่เทส |
| [`/notifications`](notifications.md) | การแจ้งเตือนของลูกค้า | 5 | ⬜ ยังไม่เทส |
| [`/pay`](pay.md) | หน้าชำระเงิน (รวม) | 4 | ⬜ ยังไม่เทส |
| [`/payment-due`](payment-due.md) | รายการที่รอชำระ (ค้างจ่าย) | 4 | ⬜ ยังไม่เทส |
| [`/profile`](profile.md) | โปรไฟล์ลูกค้า | 4 | ⬜ ยังไม่เทส |
| [`/profile/security/change-phone`](profile/security/change-phone.md) | เปลี่ยนเบอร์โทร (มี OTP) | 7 | ⬜ ยังไม่เทส |
| [`/refunds`](refunds.md) | คำขอคืนเงินของลูกค้า | 6 | ⬜ ยังไม่เทส |
| [`/sales`](sales.md) | หน้าเซล (ตัวแทน/พนักงานขาย) | 4 | ⬜ ยังไม่เทส |
| [`/sales/history`](sales/history.md) | ประวัติการขาย/คอมมิชชัน | 4 | ⬜ ยังไม่เทส |
| [`/sales/history/[id]`](sales/history/[id].md) | รายละเอียดรายการขาย | 5 | ⬜ ยังไม่เทส |
| [`/sales/report`](sales/report.md) | รายงานยอดขาย | 4 | ⬜ ยังไม่เทส |
| [`/sales/report/add`](sales/report/add.md) | เพิ่มรายงานยอดขาย | 6 | ⬜ ยังไม่เทส |
| [`/search`](search.md) | ค้นหาสินค้าจีน (China-search · วางลิงก์/รูป) | 8 | ⬜ ยังไม่เทส |
| [`/service-import`](service-import.md) | ฝากนำเข้า — รายการออเดอร์นำเข้าของลูกค้า | 8 | ⬜ ยังไม่เทส |
| [`/service-import/[fNo]`](service-import/[fNo].md) | รายละเอียดออเดอร์ฝากนำเข้า (สถานะ/ค่าใช้จ่าย/ชำระ) | 8 | ⬜ ยังไม่เทส |
| [`/service-import/[fNo]/invoice`](service-import/[fNo]/invoice.md) | ใบแจ้งหนี้ของออเดอร์นำเข้า | 6 | ⬜ ยังไม่เทส |
| [`/service-import/[fNo]/receipt`](service-import/[fNo]/receipt.md) | ใบเสร็จของออเดอร์นำเข้า | 5 | ⬜ ยังไม่เทส |
| [`/service-import/add`](service-import/add.md) | สร้างรายการฝากนำเข้าใหม่ | 6 | ⬜ ยังไม่เทส |
| [`/service-import/air`](service-import/air.md) | ฝากนำเข้าทางอากาศ | 4 | ⬜ ยังไม่เทส |
| [`/service-import/pending`](service-import/pending.md) | ออเดอร์นำเข้าที่รอดำเนินการ | 4 | ⬜ ยังไม่เทส |
| [`/service-import/receipts`](service-import/receipts.md) | รวมใบเสร็จฝากนำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/service-import/receipts/print`](service-import/receipts/print.md) | พิมพ์ใบเสร็จฝากนำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/service-import/sea`](service-import/sea.md) | ฝากนำเข้าทางเรือ | 4 | ⬜ ยังไม่เทส |
| [`/service-import/table`](service-import/table.md) | ตารางออเดอร์นำเข้า (มุมมองตาราง) | 4 | ⬜ ยังไม่เทส |
| [`/service-import/truck`](service-import/truck.md) | ฝากนำเข้าทางรถ | 4 | ⬜ ยังไม่เทส |
| [`/service-import/warehouse-addresses`](service-import/warehouse-addresses.md) | ที่อยู่โกดังสำหรับฝากนำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/service-order`](service-order.md) | ฝากสั่งซื้อ — รายการออเดอร์สั่งซื้อ | 4 | ⬜ ยังไม่เทส |
| [`/service-order/[hNo]`](service-order/[hNo].md) | รายละเอียดออเดอร์ฝากสั่งซื้อ | 8 | ⬜ ยังไม่เทส |
| [`/service-order/[hNo]/receipt`](service-order/[hNo]/receipt.md) | ใบเสร็จออเดอร์ฝากสั่งซื้อ | 6 | ⬜ ยังไม่เทส |
| [`/service-order/add`](service-order/add.md) | สร้างออเดอร์ฝากสั่งซื้อใหม่ | 8 | ⬜ ยังไม่เทส |
| [`/service-order/cart`](service-order/cart.md) | ตะกร้าฝากสั่งซื้อ | 4 | ⬜ ยังไม่เทส |
| [`/service-order/pending`](service-order/pending.md) | ออเดอร์ฝากสั่งซื้อที่รอดำเนินการ | 4 | ⬜ ยังไม่เทส |
| [`/service-order/print`](service-order/print.md) | พิมพ์ออเดอร์ฝากสั่งซื้อ | 4 | ⬜ ยังไม่เทส |
| [`/service-payment`](service-payment.md) | ฝากโอนหยวน — รายการรายการโอน | 4 | ⬜ ยังไม่เทส |
| [`/service-payment/[id]`](service-payment/[id].md) | รายละเอียดรายการฝากโอน | 7 | ⬜ ยังไม่เทส |
| [`/service-payment/add`](service-payment/add.md) | สร้างรายการฝากโอนใหม่ | 4 | ⬜ ยังไม่เทส |
| [`/shipments`](shipments.md) | รายการพัสดุ/การขนส่งของลูกค้า | 4 | ⬜ ยังไม่เทส |
| [`/shipments/[code]`](shipments/[code].md) | ติดตามพัสดุตามรหัส | 5 | ⬜ ยังไม่เทส |
| [`/wallet`](wallet.md) | กระเป๋าเงินลูกค้า (ยอดคงเหลือ) | 4 | ⬜ ยังไม่เทส |
| [`/wallet-credit`](wallet-credit.md) | วงเงินเครดิตลูกค้า | 5 | ⬜ ยังไม่เทส |
| [`/wallet-shop`](wallet-shop.md) | กระเป๋าเงินร้านค้า | 7 | ⬜ ยังไม่เทส |
| [`/wallet/deposit`](wallet/deposit.md) | เติมเงินเข้ากระเป๋า (อัปโหลดสลิป) | 7 | ⬜ ยังไม่เทส |
| [`/wallet/history`](wallet/history.md) | ประวัติเดินบัญชีกระเป๋าเงิน | 8 | ⬜ ยังไม่เทส |
| [`/wallet/withdraw`](wallet/withdraw.md) | ถอนเงินจากกระเป๋า | 7 | ⬜ ยังไม่เทส |

### 🛡 Admin — 248 pages

| Route | คืออะไร | #TC | สถานะ |
|---|---|--:|---|
| [`/admin`](admin.md) | หน้าแรกหลังบ้าน admin (ภาพรวม/เมนู) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting`](admin/accounting.md) | ศูนย์บัญชี (hub) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/ar-aging`](admin/accounting/ar-aging.md) | ลูกหนี้คงค้างตามอายุ (AR-aging · canonical) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/cargo`](admin/accounting/cargo.md) | บัญชีฝั่ง cargo | 3 | ⬜ ยังไม่เทส |
| [`/admin/accounting/cargo/income/[type]/[service]/[[...slug]]`](admin/accounting/cargo/income/[type]/[service]/[[...slug]].md) | รายได้ cargo แยกตามประเภท/บริการ | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/closing`](admin/accounting/closing.md) | ปิดงวดบัญชี | 5 | ⬜ ยังไม่เทส |
| [`/admin/accounting/container-costs`](admin/accounting/container-costs.md) | ต้นทุนตู้ | 7 | ⬜ ยังไม่เทส |
| [`/admin/accounting/disbursements`](admin/accounting/disbursements.md) | การเบิกจ่าย | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/documents`](admin/accounting/documents.md) | เอกสารบัญชี (PEAK hub) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/etax`](admin/accounting/etax.md) | e-Tax (ออก XML ภาษีอิเล็กทรอนิกส์) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/forwarder`](admin/accounting/forwarder.md) | บัญชีออเดอร์นำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/forwarder-invoice`](admin/accounting/forwarder-invoice.md) | ใบแจ้งหนี้ฝั่งนำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/forwarder-invoice/[id]`](admin/accounting/forwarder-invoice/[id].md) | รายละเอียดใบแจ้งหนี้นำเข้า | 5 | ⬜ ยังไม่เทส |
| [`/admin/accounting/forwarder-invoice/add`](admin/accounting/forwarder-invoice/add.md) | สร้างใบแจ้งหนี้นำเข้า | 7 | ⬜ ยังไม่เทส |
| [`/admin/accounting/freight`](admin/accounting/freight.md) | บัญชี freight | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/margin-monitor`](admin/accounting/margin-monitor.md) | มอนิเตอร์กำไรขั้นต้น (CEO ≤15k/ตู้) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/payment`](admin/accounting/payment.md) | บัญชีรายการชำระ | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/peak-export`](admin/accounting/peak-export.md) | ส่งออกข้อมูลเข้า PEAK | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/periods`](admin/accounting/periods.md) | งวดบัญชี | 6 | ⬜ ยังไม่เทส |
| [`/admin/accounting/periods/[period_yyyymm]`](admin/accounting/periods/[period_yyyymm].md) | รายละเอียดงวดบัญชี | 10 | ⬜ ยังไม่เทส |
| [`/admin/accounting/quote-compare`](admin/accounting/quote-compare.md) | เครื่องมือเทียบราคา (CEO pricing) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/receipts`](admin/accounting/receipts.md) | รวมใบเสร็จ | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/reconcile`](admin/accounting/reconcile.md) | กระทบยอด (reconciliation) | 6 | ⬜ ยังไม่เทส |
| [`/admin/accounting/shop`](admin/accounting/shop.md) | บัญชีฝั่งร้านค้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/wht-certs`](admin/accounting/wht-certs.md) | หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) | 7 | ⬜ ยังไม่เทส |
| [`/admin/accounting/withdraw`](admin/accounting/withdraw.md) | การเบิกถอน (บัญชี) | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/withdraw/comm-interpreter`](admin/accounting/withdraw/comm-interpreter.md) | เบิกคอมล่าม | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/withdraw/comm-interpreter/[id]`](admin/accounting/withdraw/comm-interpreter/[id].md) | รายละเอียดเบิกคอมล่าม | 5 | ⬜ ยังไม่เทส |
| [`/admin/accounting/withdraw/comm-sale`](admin/accounting/withdraw/comm-sale.md) | เบิกคอมเซล | 4 | ⬜ ยังไม่เทส |
| [`/admin/accounting/withdraw/comm-sale/[id]`](admin/accounting/withdraw/comm-sale/[id].md) | รายละเอียดเบิกคอมเซล | 5 | ⬜ ยังไม่เทส |
| [`/admin/admins`](admin/admins.md) | รายชื่อผู้ดูแลระบบ (staff roster) | 3 | ⬜ ยังไม่เทส |
| [`/admin/admins/[id]`](admin/admins/[id].md) | รายละเอียดผู้ดูแลรายคน | 4 | ⬜ ยังไม่เทส |
| [`/admin/admins/[id]/edit`](admin/admins/[id]/edit.md) | แก้ไขข้อมูลผู้ดูแล | 10 | ⬜ ยังไม่เทส |
| [`/admin/admins/new`](admin/admins/new.md) | เพิ่มผู้ดูแลใหม่ | 6 | ⬜ ยังไม่เทส |
| [`/admin/api-forwarder-cn`](admin/api-forwarder-cn.md) | เชื่อม API CN forwarder | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-forwarder-cn/manual`](admin/api-forwarder-cn/manual.md) | กรอกข้อมูล CN forwarder เอง | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-forwarder-momo`](admin/api-forwarder-momo.md) | เชื่อม API MOMO forwarder | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-forwarder-momo/manual`](admin/api-forwarder-momo/manual.md) | กรอกข้อมูล MOMO เอง | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-forwarder-momo/review`](admin/api-forwarder-momo/review.md) | ตรวจ/commit ข้อมูล MOMO | 7 | ⬜ ยังไม่เทส |
| [`/admin/api-forwarder-momo/sync`](admin/api-forwarder-momo/sync.md) | sync ข้อมูล MOMO (พรีวิว/ดึง) | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-sheets-ctt`](admin/api-sheets-ctt.md) | นำเข้าจาก Sheet CTT | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-sheets-mk`](admin/api-sheets-mk.md) | นำเข้าจาก Sheet MK | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-sheets-mx`](admin/api-sheets-mx.md) | นำเข้าจาก Sheet MX | 4 | ⬜ ยังไม่เทส |
| [`/admin/api-sheets-sang`](admin/api-sheets-sang.md) | นำเข้าจาก Sheet Sang | 4 | ⬜ ยังไม่เทส |
| [`/admin/audit`](admin/audit.md) | บันทึกการกระทำของผู้ดูแล (audit log) | 4 | ⬜ ยังไม่เทส |
| [`/admin/barcode`](admin/barcode.md) | ระบบบาร์โค้ด (hub) | 3 | ⬜ ยังไม่เทส |
| [`/admin/barcode/cargo/all`](admin/barcode/cargo/all.md) | บาร์โค้ด cargo — ทั้งหมด | 4 | ⬜ ยังไม่เทส |
| [`/admin/barcode/cargo/from`](admin/barcode/cargo/from.md) | บาร์โค้ด cargo — จากต้นทาง | 4 | ⬜ ยังไม่เทส |
| [`/admin/barcode/cargo/import`](admin/barcode/cargo/import.md) | บาร์โค้ด cargo — นำเข้า | 6 | ⬜ ยังไม่เทส |
| [`/admin/barcode/cargo/prepare`](admin/barcode/cargo/prepare.md) | บาร์โค้ด cargo — เตรียมส่ง | 4 | ⬜ ยังไม่เทส |
| [`/admin/barcode/driver`](admin/barcode/driver.md) | บาร์โค้ดคนขับ (hub) | 3 | ⬜ ยังไม่เทส |
| [`/admin/barcode/driver/all`](admin/barcode/driver/all.md) | บาร์โค้ดคนขับ — ทั้งหมด | 4 | ⬜ ยังไม่เทส |
| [`/admin/barcode/driver/from`](admin/barcode/driver/from.md) | บาร์โค้ดคนขับ — จากต้นทาง | 4 | ⬜ ยังไม่เทส |
| [`/admin/barcode/driver/import`](admin/barcode/driver/import.md) | บาร์โค้ดคนขับ — สแกนนำเข้า (USB scanner) | 7 | ⬜ ยังไม่เทส |
| [`/admin/barcode/driver/prepare`](admin/barcode/driver/prepare.md) | บาร์โค้ดคนขับ — เตรียมส่ง | 4 | ⬜ ยังไม่เทส |
| [`/admin/barcode/gateway`](admin/barcode/gateway.md) | gateway routing บาร์โค้ด | 4 | ⬜ ยังไม่เทส |
| [`/admin/board`](admin/board.md) | กระดานงาน (work-board) | 9 | ⬜ ยังไม่เทส |
| [`/admin/board/inbox`](admin/board/inbox.md) | กล่องงานเข้า (inbox) | 3 | ⬜ ยังไม่เทส |
| [`/admin/bookings`](admin/bookings.md) | การจอง (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/bookings/[bookingNo]`](admin/bookings/[bookingNo].md) | รายละเอียดการจอง | 11 | ⬜ ยังไม่เทส |
| [`/admin/broadcasts`](admin/broadcasts.md) | แคมเปญ broadcast | 4 | ⬜ ยังไม่เทส |
| [`/admin/broadcasts/[id]`](admin/broadcasts/[id].md) | รายละเอียด broadcast | 8 | ⬜ ยังไม่เทส |
| [`/admin/broadcasts/new`](admin/broadcasts/new.md) | สร้าง broadcast | 6 | ⬜ ยังไม่เทส |
| [`/admin/cargothai`](admin/cargothai.md) | หน้า CargoThai (warehouse-ops/ติดตาม) | 6 | ⬜ ยังไม่เทส |
| [`/admin/carriers`](admin/carriers.md) | ผู้ให้บริการขนส่ง (carriers) | 6 | ⬜ ยังไม่เทส |
| [`/admin/cnt-hs`](admin/cnt-hs.md) | เบิกเงินค่าตู้ (cnt-hs) | 4 | ⬜ ยังไม่เทส |
| [`/admin/cnt-hs/[id]`](admin/cnt-hs/[id].md) | รายละเอียดเบิกค่าตู้ | 8 | ⬜ ยังไม่เทส |
| [`/admin/commissions`](admin/commissions.md) | คอมมิชชัน (admin · live tb_user_sales) | 4 | ⬜ ยังไม่เทส |
| [`/admin/commissions/[id]`](admin/commissions/[id].md) | รายละเอียดคอมมิชชัน | 5 | ⬜ ยังไม่เทส |
| [`/admin/commissions/tiers`](admin/commissions/tiers.md) | ตั้งค่าขั้นคอมมิชชัน | 6 | ⬜ ยังไม่เทส |
| [`/admin/contact-messages`](admin/contact-messages.md) | ข้อความติดต่อจากหน้าเว็บ | 5 | ⬜ ยังไม่เทส |
| [`/admin/containers`](admin/containers.md) | จัดการตู้ (containers) | 4 | ⬜ ยังไม่เทส |
| [`/admin/containers/[id]`](admin/containers/[id].md) | รายละเอียดตู้ | 5 | ⬜ ยังไม่เทส |
| [`/admin/containers/[id]/hs`](admin/containers/[id]/hs.md) | HS lines ของตู้ | 7 | ⬜ ยังไม่เทส |
| [`/admin/crm`](admin/crm.md) | CRM omni-inbox + customer-360 + routing | 6 | ⬜ ยังไม่เทส |
| [`/admin/csv-imports`](admin/csv-imports.md) | งานนำเข้า CSV | 5 | ⬜ ยังไม่เทส |
| [`/admin/csv-imports/[id]`](admin/csv-imports/[id].md) | รายละเอียดงานนำเข้า CSV | 7 | ⬜ ยังไม่เทส |
| [`/admin/csv-imports/upload`](admin/csv-imports/upload.md) | อัปโหลด CSV | 4 | ⬜ ยังไม่เทส |
| [`/admin/customers`](admin/customers.md) | รายการลูกค้าทั้งหมด | 9 | ⬜ ยังไม่เทส |
| [`/admin/customers/[id]`](admin/customers/[id].md) | โปรไฟล์ลูกค้า (สถิติ/ที่อยู่/เรท/แก้ไข/hard-delete) | 5 | ⬜ ยังไม่เทส |
| [`/admin/customers/[id]/convert-to-juristic`](admin/customers/[id]/convert-to-juristic.md) | แปลงลูกค้าเป็นนิติบุคคล | 8 | ⬜ ยังไม่เทส |
| [`/admin/customers/[id]/transfer-rep`](admin/customers/[id]/transfer-rep.md) | ย้ายเซลผู้ดูแลลูกค้ารายนี้ | 7 | ⬜ ยังไม่เทส |
| [`/admin/customers/new`](admin/customers/new.md) | สร้างลูกค้าใหม่โดย admin (ไม่ต้อง self-register) | 6 | ⬜ ยังไม่เทส |
| [`/admin/customers/pending`](admin/customers/pending.md) | ลูกค้ารออนุมัติ | 8 | ⬜ ยังไม่เทส |
| [`/admin/customers/recently-active`](admin/customers/recently-active.md) | ลูกค้าที่ active ล่าสุด | 4 | ⬜ ยังไม่เทส |
| [`/admin/customers/transfer-bulk`](admin/customers/transfer-bulk.md) | ย้ายเซลแบบกลุ่ม | 6 | ⬜ ยังไม่เทส |
| [`/admin/customers/transfer-rep`](admin/customers/transfer-rep.md) | ย้ายเซล (รายเดียว) | 7 | ⬜ ยังไม่เทส |
| [`/admin/dashboard`](admin/dashboard.md) | แดชบอร์ดผู้ดูแล (KPI/สรุป) | 3 | ⬜ ยังไม่เทส |
| [`/admin/driver-runs`](admin/driver-runs.md) | รอบวิ่งคนขับ | 5 | ⬜ ยังไม่เทส |
| [`/admin/drivers`](admin/drivers.md) | รายชื่อคนขับ | 4 | ⬜ ยังไม่เทส |
| [`/admin/drivers/[id]`](admin/drivers/[id].md) | รายละเอียดคนขับ | 8 | ⬜ ยังไม่เทส |
| [`/admin/drivers/[id]/print`](admin/drivers/[id]/print.md) | พิมพ์ใบงานคนขับ | 5 | ⬜ ยังไม่เทส |
| [`/admin/drivers/new`](admin/drivers/new.md) | เพิ่มคนขับ | 6 | ⬜ ยังไม่เทส |
| [`/admin/drivers/work`](admin/drivers/work.md) | งานคนขับ | 7 | ⬜ ยังไม่เทส |
| [`/admin/forwarder-action`](admin/forwarder-action.md) | การกระทำต่อออเดอร์นำเข้า (bulk action) | 4 | ⬜ ยังไม่เทส |
| [`/admin/forwarder-check`](admin/forwarder-check.md) | ตรวจ/ออกบิลแบบกลุ่ม (bulk-bill) | 8 | ⬜ ยังไม่เทส |
| [`/admin/forwarder-import-warehouse`](admin/forwarder-import-warehouse.md) | นำเข้าข้อมูลเข้าโกดัง | 3 | ⬜ ยังไม่เทส |
| [`/admin/forwarder-sales`](admin/forwarder-sales.md) | คอมมิชชันการขายจากออเดอร์นำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/forwarders`](admin/forwarders.md) | รายการออเดอร์ฝากนำเข้า (admin) | 8 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/[fNo]`](admin/forwarders/[fNo].md) | รายละเอียด/แก้ไขออเดอร์นำเข้า (เครื่องมือ admin ครบ) | 25 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/[fNo]/edit`](admin/forwarders/[fNo]/edit.md) | แก้ไขมิติ/ค่าใช้จ่ายของออเดอร์นำเข้า | 7 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/bulk-search`](admin/forwarders/bulk-search.md) | ค้นหาออเดอร์นำเข้าแบบกลุ่ม | 5 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/combine-bill`](admin/forwarders/combine-bill.md) | รวมบิลส่งสินค้า | 8 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/combine-bill/[id]`](admin/forwarders/combine-bill/[id].md) | รายละเอียดบิลรวม | 10 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/combine-bill/add`](admin/forwarders/combine-bill/add.md) | สร้างบิลรวมใหม่ | 6 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/combine-bill/print`](admin/forwarders/combine-bill/print.md) | พิมพ์ใบส่งสินค้า (บิลรวม) | 4 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/container-cost-check`](admin/forwarders/container-cost-check.md) | ตรวจต้นทุนตู้ | 4 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/new`](admin/forwarders/new.md) | สร้างออเดอร์นำเข้าใหม่ (admin) | 7 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/notes`](admin/forwarders/notes.md) | โน้ตของออเดอร์นำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/print`](admin/forwarders/print.md) | พิมพ์ออเดอร์นำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/tran-th`](admin/forwarders/tran-th.md) | งานขนส่งในไทย (TH-transport batch) | 4 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/tran-th/[id]`](admin/forwarders/tran-th/[id].md) | รายละเอียด batch ขนส่งในไทย | 5 | ⬜ ยังไม่เทส |
| [`/admin/forwarders/warehouse-history`](admin/forwarders/warehouse-history.md) | ประวัติเข้าโกดัง | 7 | ⬜ ยังไม่เทส |
| [`/admin/freight/declarations`](admin/freight/declarations.md) | ใบขนสินค้า (customs declarations) | 4 | ⬜ ยังไม่เทส |
| [`/admin/freight/declarations/[id]`](admin/freight/declarations/[id].md) | รายละเอียดใบขนสินค้า | 15 | ⬜ ยังไม่เทส |
| [`/admin/freight/quotes`](admin/freight/quotes.md) | ใบเสนอราคา freight (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/freight/quotes/[id]`](admin/freight/quotes/[id].md) | รายละเอียดใบเสนอราคา freight | 17 | ⬜ ยังไม่เทส |
| [`/admin/freight/quotes/new`](admin/freight/quotes/new.md) | สร้างใบเสนอราคา freight | 6 | ⬜ ยังไม่เทส |
| [`/admin/freight/shipments`](admin/freight/shipments.md) | shipment freight (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/freight/shipments/[id]`](admin/freight/shipments/[id].md) | รายละเอียด shipment freight | 24 | ⬜ ยังไม่เทส |
| [`/admin/freight/shipments/new`](admin/freight/shipments/new.md) | สร้าง shipment freight | 6 | ⬜ ยังไม่เทส |
| [`/admin/hr`](admin/hr.md) | ทรัพยากรบุคคล (hub) | 3 | ⬜ ยังไม่เทส |
| [`/admin/hr/assets`](admin/hr/assets.md) | ทรัพย์สินพนักงาน | 4 | ⬜ ยังไม่เทส |
| [`/admin/hr/attendance`](admin/hr/attendance.md) | ลงเวลาทำงาน | 6 | ⬜ ยังไม่เทส |
| [`/admin/hr/attendance/leaves`](admin/hr/attendance/leaves.md) | การลา | 6 | ⬜ ยังไม่เทส |
| [`/admin/hr/audit`](admin/hr/audit.md) | audit ฝั่ง HR | 6 | ⬜ ยังไม่เทส |
| [`/admin/hr/humanresource`](admin/hr/humanresource.md) | ข้อมูลพนักงาน | 4 | ⬜ ยังไม่เทส |
| [`/admin/hr/org-chart`](admin/hr/org-chart.md) | ผังองค์กร (chart) | 3 | ⬜ ยังไม่เทส |
| [`/admin/hr/org-table`](admin/hr/org-table.md) | ผังองค์กร (ตาราง) | 3 | ⬜ ยังไม่เทส |
| [`/admin/hr/policies`](admin/hr/policies.md) | นโยบายบริษัท | 7 | ⬜ ยังไม่เทส |
| [`/admin/hr/recruitment`](admin/hr/recruitment.md) | รับสมัครงาน | 3 | ⬜ ยังไม่เทส |
| [`/admin/hr/recruitment/[id]`](admin/hr/recruitment/[id].md) | รายละเอียดผู้สมัคร | 10 | ⬜ ยังไม่เทส |
| [`/admin/hr/recruitment/new`](admin/hr/recruitment/new.md) | เพิ่มประกาศ/ผู้สมัคร | 5 | ⬜ ยังไม่เทส |
| [`/admin/hr/training`](admin/hr/training.md) | อบรมพนักงาน | 9 | ⬜ ยังไม่เทส |
| [`/admin/incidents`](admin/incidents.md) | บันทึก/ติดตามเหตุการณ์ระบบ | 10 | ⬜ ยังไม่เทส |
| [`/admin/inventory`](admin/inventory.md) | สต็อก/คลังสินค้า | 3 | ⬜ ยังไม่เทส |
| [`/admin/juristic-check`](admin/juristic-check.md) | ตรวจ/อนุมัติเอกสารนิติบุคคล | 9 | ⬜ ยังไม่เทส |
| [`/admin/kpi`](admin/kpi.md) | แดชบอร์ด KPI ผู้บริหาร | 4 | ⬜ ยังไม่เทส |
| [`/admin/leads`](admin/leads.md) | คิวโทรลูกค้าเย็น (cold-leads) | 6 | ⬜ ยังไม่เทส |
| [`/admin/learning`](admin/learning.md) | ศูนย์เรียนรู้/คู่มือพนักงาน | 3 | ⬜ ยังไม่เทส |
| [`/admin/line-inbox`](admin/line-inbox.md) | กล่องข้อความ LINE (อ่านข้อมูลจาก Worker) | 3 | ⬜ ยังไม่เทส |
| [`/admin/migration/pcs-customers`](admin/migration/pcs-customers.md) | เครื่องมือ migrate ลูกค้า PCS เดิม | 6 | ⬜ ยังไม่เทส |
| [`/admin/momo-lcl`](admin/momo-lcl.md) | MOMO LCL | 5 | ⬜ ยังไม่เทส |
| [`/admin/notifications/dispatch`](admin/notifications/dispatch.md) | ส่งการแจ้งเตือน | 6 | ⬜ ยังไม่เทส |
| [`/admin/organization-channels`](admin/organization-channels.md) | ช่องทางองค์กร (LINE/WeChat/โทร) | 18 | ⬜ ยังไม่เทส |
| [`/admin/organization-email`](admin/organization-email.md) | อีเมลองค์กร | 9 | ⬜ ยังไม่เทส |
| [`/admin/partners`](admin/partners.md) | ไดเรกทอรีพันธมิตร (logistics/business partners · CRUD) | 9 | ⬜ ยังไม่เทส |
| [`/admin/payment-reconciliation`](admin/payment-reconciliation.md) | กระทบยอดการชำระ | 7 | ⬜ ยังไม่เทส |
| [`/admin/printAll`](admin/printAll.md) | พิมพ์รวม (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa`](admin/qa.md) | ศูนย์ QA (คิวตรวจสอบ) | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/chn-shop-over-2d`](admin/qa/chn-shop-over-2d.md) | QA: ร้านจีนเกิน 2 วัน | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/chn-wh-over-2d`](admin/qa/chn-wh-over-2d.md) | QA: ค้างโกดังจีนเกิน 2 วัน | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/credit-overdue`](admin/qa/credit-overdue.md) | QA: เครดิตเกินกำหนด | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/new-client-no-contact`](admin/qa/new-client-no-contact.md) | QA: ลูกค้าใหม่ยังไม่ติดต่อ | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/order-cancellations`](admin/qa/order-cancellations.md) | QA: ออเดอร์ถูกยกเลิก | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/order-over-10min`](admin/qa/order-over-10min.md) | QA: ออเดอร์ค้างเกิน 10 นาที | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/ownerless-goods`](admin/qa/ownerless-goods.md) | QA: สินค้าไม่มีเจ้าของ | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/pay-fwd-over-2d`](admin/qa/pay-fwd-over-2d.md) | QA: ค้างจ่ายนำเข้าเกิน 2 วัน | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/pay-shop-over-1d`](admin/qa/pay-shop-over-1d.md) | QA: ค้างจ่ายร้านเกิน 1 วัน | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/prepare-overdue`](admin/qa/prepare-overdue.md) | QA: เตรียมส่งเกินกำหนด | 4 | ⬜ ยังไม่เทส |
| [`/admin/qa/transit-overdue`](admin/qa/transit-overdue.md) | QA: ขนส่งเกินกำหนด | 4 | ⬜ ยังไม่เทส |
| [`/admin/rates`](admin/rates.md) | จัดการเรท (hub) | 3 | ⬜ ยังไม่เทส |
| [`/admin/rates/custom-hs`](admin/rates/custom-hs.md) | เรทเฉพาะตาม HS code | 7 | ⬜ ยังไม่เทส |
| [`/admin/rates/custom-user`](admin/rates/custom-user.md) | เรทเฉพาะรายลูกค้า | 7 | ⬜ ยังไม่เทส |
| [`/admin/rates/general`](admin/rates/general.md) | เรททั่วไป (engine) | 8 | ⬜ ยังไม่เทส |
| [`/admin/rates/vip`](admin/rates/vip.md) | เรท VIP | 3 | ⬜ ยังไม่เทส |
| [`/admin/refunds`](admin/refunds.md) | คำขอคืนเงิน (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/refunds/[id]`](admin/refunds/[id].md) | รายละเอียดคืนเงิน | 9 | ⬜ ยังไม่เทส |
| [`/admin/refunds/new`](admin/refunds/new.md) | สร้างคำขอคืนเงิน | 6 | ⬜ ยังไม่เทส |
| [`/admin/report-cnt`](admin/report-cnt.md) | รายงานตู้ (per-container) | 4 | ⬜ ยังไม่เทส |
| [`/admin/report-cnt/[fNo]`](admin/report-cnt/[fNo].md) | รายละเอียดตู้ + แก้ต้นทุน | 13 | ⬜ ยังไม่เทส |
| [`/admin/report-cnt/pay`](admin/report-cnt/pay.md) | จ่าย/เบิกค่าตู้ | 3 | ⬜ ยังไม่เทส |
| [`/admin/reports`](admin/reports.md) | ศูนย์รายงาน (hub) | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/agent-payouts`](admin/reports/agent-payouts.md) | รายงานจ่ายคอมตัวแทน | 5 | ⬜ ยังไม่เทส |
| [`/admin/reports/ar-aging`](admin/reports/ar-aging.md) | รายงานลูกหนี้ตามอายุ (redirect → accounting) | 3 | ⬜ ยังไม่เทส |
| [`/admin/reports/cockpit`](admin/reports/cockpit.md) | Cockpit ผู้บริหาร (AR/funnel) | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/containers-awaiting-th`](admin/reports/containers-awaiting-th.md) | ตู้ที่รอถึงไทย | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/containers-hs`](admin/reports/containers-hs.md) | ตู้แยกตาม HS code | 3 | ⬜ ยังไม่เทส |
| [`/admin/reports/credit-pending`](admin/reports/credit-pending.md) | เครดิตที่รออนุมัติ | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/debtors`](admin/reports/debtors.md) | ลูกหนี้ค้างชำระ | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/forwarder`](admin/reports/forwarder.md) | รายงานออเดอร์นำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/forwarder-profit`](admin/reports/forwarder-profit.md) | กำไรออเดอร์นำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/forwarder-volume`](admin/reports/forwarder-volume.md) | ปริมาณออเดอร์นำเข้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/hs-code-revenue`](admin/reports/hs-code-revenue.md) | รายได้ตาม HS code | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/monthly-orders`](admin/reports/monthly-orders.md) | ออเดอร์รายเดือน | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/otp-success`](admin/reports/otp-success.md) | อัตราสำเร็จ OTP | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/payment`](admin/reports/payment.md) | รายงานการชำระ | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/pending-payments`](admin/reports/pending-payments.md) | รายการรอชำระ | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/profit-analytics`](admin/reports/profit-analytics.md) | วิเคราะห์กำไร (BI) | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/refunds`](admin/reports/refunds.md) | รายงานคืนเงิน | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/sales-by-rep`](admin/reports/sales-by-rep.md) | ยอดขายแยกตามเซล | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/sales-monthly`](admin/reports/sales-monthly.md) | ยอดขายรายเดือน | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/search-demand`](admin/reports/search-demand.md) | ดีมานด์การค้นหาสินค้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/shop`](admin/reports/shop.md) | รายงานฝั่งร้านค้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/shops-profit`](admin/reports/shops-profit.md) | กำไรร้านค้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/shops-profit-pay`](admin/reports/shops-profit-pay.md) | กำไร/จ่ายร้านค้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/sla-cycle-time`](admin/reports/sla-cycle-time.md) | เวลา cycle/SLA | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/sms-usage`](admin/reports/sms-usage.md) | การใช้ SMS | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/system`](admin/reports/system.md) | รายงานระบบ | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/user-sales-history`](admin/reports/user-sales-history.md) | ประวัติยอดขายต่อลูกค้า | 4 | ⬜ ยังไม่เทส |
| [`/admin/reports/user-sales-history/[customer_id]`](admin/reports/user-sales-history/[customer_id].md) | ประวัติยอดขายของลูกค้ารายหนึ่ง | 5 | ⬜ ยังไม่เทส |
| [`/admin/reports/yuan-profit`](admin/reports/yuan-profit.md) | กำไรจากฝากโอนหยวน | 4 | ⬜ ยังไม่เทส |
| [`/admin/sales-payouts`](admin/sales-payouts.md) | จ่ายคอมเซล | 5 | ⬜ ยังไม่เทส |
| [`/admin/sales-payouts/[id]`](admin/sales-payouts/[id].md) | รายละเอียดจ่ายคอมเซล | 8 | ⬜ ยังไม่เทส |
| [`/admin/search`](admin/search.md) | ค้นหาข้ามระบบ (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/service-orders`](admin/service-orders.md) | รายการออเดอร์ฝากสั่งซื้อ (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/service-orders/[hNo]`](admin/service-orders/[hNo].md) | รายละเอียด/แก้ไขออเดอร์ฝากสั่งซื้อ | 7 | ⬜ ยังไม่เทส |
| [`/admin/service-orders/cart`](admin/service-orders/cart.md) | ตะกร้าฝากสั่งซื้อ (admin) | 9 | ⬜ ยังไม่เทส |
| [`/admin/service-orders/cart/add`](admin/service-orders/cart/add.md) | เพิ่มสินค้าในตะกร้า (admin) | 6 | ⬜ ยังไม่เทส |
| [`/admin/service-orders/notes`](admin/service-orders/notes.md) | โน้ตออเดอร์ฝากสั่งซื้อ | 4 | ⬜ ยังไม่เทส |
| [`/admin/service-orders/print`](admin/service-orders/print.md) | พิมพ์ออเดอร์ฝากสั่งซื้อ | 3 | ⬜ ยังไม่เทส |
| [`/admin/settings`](admin/settings.md) | ตั้งค่าระบบ (hub · read-through) | 3 | ⬜ ยังไม่เทส |
| [`/admin/settings/business-config`](admin/settings/business-config.md) | ตั้งค่าธุรกิจ (key-value) | 6 | ⬜ ยังไม่เทส |
| [`/admin/settings/contacts`](admin/settings/contacts.md) | ตั้งค่าข้อมูลติดต่อ | 9 | ⬜ ยังไม่เทส |
| [`/admin/settings/forwarder-costs`](admin/settings/forwarder-costs.md) | ตั้งค่าต้นทุนนำเข้า (matrix) | 8 | ⬜ ยังไม่เทส |
| [`/admin/settings/legacy-rates`](admin/settings/legacy-rates.md) | เรทจริง (tb_settings) | 7 | ⬜ ยังไม่เทส |
| [`/admin/settings/notifications`](admin/settings/notifications.md) | ตั้งค่าการแจ้งเตือน | 5 | ⬜ ยังไม่เทส |
| [`/admin/settings/promos`](admin/settings/promos.md) | จัดการโปรโมชัน + อัปโหลดรูปแบนเนอร์ | 7 | ⬜ ยังไม่เทส |
| [`/admin/settings/tos-versions`](admin/settings/tos-versions.md) | จัดการเวอร์ชันข้อกำหนด | 8 | ⬜ ยังไม่เทส |
| [`/admin/shop-disbursement`](admin/shop-disbursement.md) | เบิกจ่ายร้านค้า | 8 | ⬜ ยังไม่เทส |
| [`/admin/shop-disbursement/history`](admin/shop-disbursement/history.md) | ประวัติเบิกจ่ายร้านค้า | 5 | ⬜ ยังไม่เทส |
| [`/admin/shop-disbursement/history/[id]`](admin/shop-disbursement/history/[id].md) | รายละเอียดเบิกจ่ายร้านค้า | 6 | ⬜ ยังไม่เทส |
| [`/admin/shop-disbursement/history/[id]/print`](admin/shop-disbursement/history/[id]/print.md) | พิมพ์ใบเบิกจ่ายร้านค้า | 6 | ⬜ ยังไม่เทส |
| [`/admin/shop-payouts`](admin/shop-payouts.md) | จ่ายเงินร้านค้า | 6 | ⬜ ยังไม่เทส |
| [`/admin/system/cron-health`](admin/system/cron-health.md) | สุขภาพ cron | 3 | ⬜ ยังไม่เทส |
| [`/admin/system/crons`](admin/system/crons.md) | จัดการ cron jobs | 6 | ⬜ ยังไม่เทส |
| [`/admin/system/notifications`](admin/system/notifications.md) | การแจ้งเตือนระบบ | 4 | ⬜ ยังไม่เทส |
| [`/admin/tax-invoices`](admin/tax-invoices.md) | ใบกำกับภาษี (รายการ) | 4 | ⬜ ยังไม่เทส |
| [`/admin/tax-invoices/[id]`](admin/tax-invoices/[id].md) | รายละเอียดใบกำกับภาษี | 14 | ⬜ ยังไม่เทส |
| [`/admin/team-leaders`](admin/team-leaders.md) | หัวหน้าทีม | 8 | ⬜ ยังไม่เทส |
| [`/admin/wallet`](admin/wallet.md) | จัดการกระเป๋าเงินลูกค้า (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/wallet/[id]`](admin/wallet/[id].md) | กระเป๋าเงินลูกค้ารายคน (เติม/สลิป) | 11 | ⬜ ยังไม่เทส |
| [`/admin/wallet/add`](admin/wallet/add.md) | เติมเงินให้ลูกค้า (admin manual) | 6 | ⬜ ยังไม่เทส |
| [`/admin/wallet/deposit`](admin/wallet/deposit.md) | อนุมัติรายการเติมเงิน | 3 | ⬜ ยังไม่เทส |
| [`/admin/wallet/history`](admin/wallet/history.md) | ประวัติกระเป๋าเงิน (admin) | 4 | ⬜ ยังไม่เทส |
| [`/admin/wallet/pay-user`](admin/wallet/pay-user.md) | จ่ายเงินแทนลูกค้า (ตัดกระเป๋า) | 9 | ⬜ ยังไม่เทส |
| [`/admin/wallet/withdrawals`](admin/wallet/withdrawals.md) | คำขอถอนเงิน (admin) | 7 | ⬜ ยังไม่เทส |
| [`/admin/warehouse/bulletin`](admin/warehouse/bulletin.md) | ประกาศโกดัง | 4 | ⬜ ยังไม่เทส |
| [`/admin/warehouse/containers`](admin/warehouse/containers.md) | ตู้ในโกดัง | 4 | ⬜ ยังไม่เทส |
| [`/admin/warehouse/qa-inspections`](admin/warehouse/qa-inspections.md) | ตรวจ QA สินค้าในโกดัง | 4 | ⬜ ยังไม่เทส |
| [`/admin/warehouse/qa-inspections/[id]`](admin/warehouse/qa-inspections/[id].md) | รายละเอียดการตรวจ QA | 8 | ⬜ ยังไม่เทส |
| [`/admin/warehouse/qa-inspections/new`](admin/warehouse/qa-inspections/new.md) | สร้างการตรวจ QA | 6 | ⬜ ยังไม่เทส |
| [`/admin/wht`](admin/wht.md) | หัก ณ ที่จ่าย (WHT) | 4 | ⬜ ยังไม่เทส |
| [`/admin/withdrawal/freight-th`](admin/withdrawal/freight-th.md) | เบิกค่าขนส่งในไทย (freight) | 4 | ⬜ ยังไม่เทส |
| [`/admin/withdrawals`](admin/withdrawals.md) | คำขอถอนเงิน (รวม) | 3 | ⬜ ยังไม่เทส |
| [`/admin/yuan-payments`](admin/yuan-payments.md) | รายการฝากโอนหยวน (admin) | 6 | ⬜ ยังไม่เทส |
| [`/admin/yuan-payments/[id]`](admin/yuan-payments/[id].md) | รายละเอียด/อนุมัติรายการฝากโอน | 5 | ⬜ ยังไม่เทส |
| [`/admin/yuan-payments/new`](admin/yuan-payments/new.md) | สร้างรายการฝากโอนให้ลูกค้า (admin) | 6 | ⬜ ยังไม่เทส |

### 🧩 Misc — 3 pages

| Route | คืออะไร | #TC | สถานะ |
|---|---|--:|---|
| [`/complete-profile`](complete-profile.md) | กรอกข้อมูลโปรไฟล์ให้ครบหลังสมัคร (mid-signup) | 5 | ⬜ ยังไม่เทส |
| [`/liff/link`](liff/link.md) | LINE LIFF — เชื่อมบัญชี LINE กับลูกค้า | 5 | ⬜ ยังไม่เทส |
| [`/reset-password`](reset-password.md) | ตั้งรหัสผ่านใหม่ (จากลิงก์รีเซ็ต) | 5 | ⬜ ยังไม่เทส |

**รวม 365 หน้า · 1905 test cases.**

<sub>Auto-generated 2026-06-02. Scaffold — ปรับแต่ง/เพิ่ม assertion เฉพาะหน้าได้ตามจริง.</sub>
