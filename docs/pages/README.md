# 📄 Pages — Route Documentation

> One file per `page.tsx` (365 routes). Each documents: auth gate · request params · database tables (incl. via server actions) · components · server actions / API routes · 3rd-party services · env vars · lib modules · exported functions.

Auto-derived from code on **2026-06-02**. Folder mirrors the route tree (route groups collapsed). See [methodology](#methodology).

## 🌐 Public — 44 pages

| Route | คืออะไร | DB | Comp |
|---|---|--:|--:|
| [`/`](index.md) | หน้าแรกเว็บไซต์ Pacred — hero + บริการ + จุดขาย + CTA เข้าระบบ | 0 | 24 |
| [`/about`](about.md) | เกี่ยวกับบริษัท Pacred — ประวัติ วิสัยทัศน์ ทีมงาน | 0 | 9 |
| [`/book`](book.md) | เริ่มขั้นตอนจองบริการ | 0 | 4 |
| [`/book-start`](book-start.md) | จุดเริ่มจอง (auth-gated) | 5 | 0 |
| [`/book/[service]`](book/[service].md) | เลือกบริการที่จะจอง | 1 | 5 |
| [`/book/[service]/[route]`](book/[service]/[route].md) | เลือกเส้นทางขนส่งของบริการนั้น | 1 | 5 |
| [`/book/[service]/[route]/confirmation`](book/[service]/[route]/confirmation.md) | ยืนยันการจองสำเร็จ | 2 | 2 |
| [`/book/[service]/[route]/review`](book/[service]/[route]/review.md) | ทบทวนรายการก่อนยืนยันการจอง | 6 | 3 |
| [`/booking`](booking.md) | Landing: จองบริการขนส่ง (freight booking) | 0 | 7 |
| [`/contact`](contact.md) | หน้าติดต่อ + ฟอร์มส่งข้อความ (lead funnel → contact_messages) | 1 | 6 |
| [`/customs-clearance-shipping-suvarnabhumi`](customs-clearance-shipping-suvarnabhumi.md) | Landing SEO: เคลียร์ของสนามบินสุวรรณภูมิ | 0 | 16 |
| [`/customs-clearance-shipping-suvarnabhumi/[port]`](customs-clearance-shipping-suvarnabhumi/[port].md) | Landing SEO ตามด่าน/ท่า | 0 | 9 |
| [`/delivery-areas`](delivery-areas.md) | พื้นที่ให้บริการจัดส่ง | 0 | 4 |
| [`/faq`](faq.md) | คำถามที่พบบ่อย | 0 | 8 |
| [`/freight-quote`](freight-quote.md) | ขอใบเสนอราคา freight (ฟอร์มลูกค้า) | 0 | 6 |
| [`/holidays`](holidays.md) | วันหยุดบริษัท | 0 | 4 |
| [`/how-to-use`](how-to-use.md) | วิธีใช้งานระบบ Pacred (คู่มือลูกค้า) | 0 | 5 |
| [`/join-us`](join-us.md) | หน้าสมัครงาน / ร่วมงานกับ Pacred | 0 | 4 |
| [`/knowledge`](knowledge.md) | คลังความรู้ (knowledge base) — รายการบทความ | 0 | 9 |
| [`/knowledge/[slug]`](knowledge/[slug].md) | บทความความรู้รายชิ้น | 0 | 10 |
| [`/line`](line.md) | หน้า redirect/เชื่อม LINE OA | 0 | 1 |
| [`/news`](news.md) | รายการข่าว/บทความ | 0 | 10 |
| [`/news/[slug]`](news/[slug].md) | หน้าข่าว/บทความรายชิ้น | 0 | 10 |
| [`/payment/1688`](payment/1688.md) | ชำระ/ฝากโอนผ่าน 1688 | 0 | 4 |
| [`/payment/alipay`](payment/alipay.md) | ชำระ/ฝากโอนผ่าน Alipay | 0 | 4 |
| [`/payment/taobao`](payment/taobao.md) | ชำระ/ฝากโอนผ่าน Taobao | 0 | 4 |
| [`/privacy`](privacy.md) | นโยบายความเป็นส่วนตัว | 0 | 4 |
| [`/reviews`](reviews.md) | รีวิวจากลูกค้า | 0 | 9 |
| [`/reviews/[id]`](reviews/[id].md) | รีวิวรายชิ้น | 0 | 7 |
| [`/services`](services.md) | ภาพรวมบริการทั้งหมด (service grid) | 0 | 10 |
| [`/services/china-shopping`](services/china-shopping.md) | Landing: ฝากสั่งซื้อสินค้าจีน | 0 | 14 |
| [`/services/customs-clearance`](services/customs-clearance.md) | Landing: เคลียร์ศุลกากร | 0 | 0 |
| [`/services/export-worldwide`](services/export-worldwide.md) | Landing: ส่งออกสินค้าทั่วโลก | 0 | 13 |
| [`/services/import-china`](services/import-china.md) | Landing: นำเข้าจากจีน | 0 | 14 |
| [`/services/import-china-fcl`](services/import-china-fcl.md) | Landing: นำเข้าจากจีนแบบ FCL (เต็มตู้) | 0 | 14 |
| [`/services/import-china-lcl`](services/import-china-lcl.md) | Landing: นำเข้าจากจีนแบบ LCL (ไม่เต็มตู้) | 0 | 14 |
| [`/services/yuan-transfer`](services/yuan-transfer.md) | Landing: ฝากโอนเงินหยวน | 0 | 14 |
| [`/start-order`](start-order.md) | จุดเริ่มสั่งซื้อ (buy-bridge) | 0 | 0 |
| [`/status`](status.md) | หน้าตรวจสถานะระบบ | 1 | 1 |
| [`/terms`](terms.md) | ข้อกำหนดการใช้บริการ | 0 | 4 |
| [`/warehouses/china`](warehouses/china.md) | ข้อมูลโกดังจีน (ที่อยู่รับของ) | 0 | 7 |
| [`/warehouses/guangzhou`](warehouses/guangzhou.md) | ข้อมูลโกดังกวางโจว | 0 | 8 |
| [`/warehouses/thailand`](warehouses/thailand.md) | ข้อมูลโกดังไทย | 0 | 7 |
| [`/warehouses/yiwu`](warehouses/yiwu.md) | ข้อมูลโกดังอี้อู | 0 | 8 |

## 👤 Auth (guests only) — 3 pages

| Route | คืออะไร | DB | Comp |
|---|---|--:|--:|
| [`/forgot-password`](forgot-password.md) | ขอรีเซ็ตรหัสผ่าน | 4 | 3 |
| [`/login`](login.md) | เข้าสู่ระบบ (เบอร์/อีเมล + รหัสผ่าน · รองรับ legacy PCS login) | 4 | 2 |
| [`/register`](register.md) | สมัครสมาชิกใหม่ (+ assign sales rep รอบ round-robin) | 5 | 3 |

## 🔒 Customer portal (protected) — 67 pages

| Route | คืออะไร | DB | Comp |
|---|---|--:|--:|
| [`/account-settings`](account-settings.md) | ตั้งค่าบัญชี (ข้อมูลส่วนตัว/รหัสผ่าน) | 2 | 0 |
| [`/addresses`](addresses.md) | สมุดที่อยู่จัดส่งของลูกค้า | 4 | 0 |
| [`/bookings`](bookings.md) | รายการการจองของลูกค้า | 5 | 0 |
| [`/bookings/[bookingNo]`](bookings/[bookingNo].md) | รายละเอียดการจอง | 6 | 1 |
| [`/cart`](cart.md) | ตะกร้าฝากสั่งซื้อ | 13 | 1 |
| [`/cart/add`](cart/add.md) | เพิ่มสินค้าเข้าตะกร้า | 0 | 0 |
| [`/china-address`](china-address.md) | ที่อยู่โกดังจีนสำหรับให้ลูกค้าส่งของเข้า | 1 | 0 |
| [`/commissions`](commissions.md) | คอมมิชชัน (มุมมองลูกค้า/ตัวแทน) | 3 | 1 |
| [`/commissions/me`](commissions/me.md) | คอมมิชชันของฉัน | 5 | 0 |
| [`/commissions/me/[id]`](commissions/me/[id].md) | รายละเอียดคอมมิชชันรายการหนึ่ง | 3 | 0 |
| [`/dashboard`](dashboard.md) | แดชบอร์ดลูกค้า — สรุปออเดอร์/กระเป๋าเงิน/แจ้งเตือน | 6 | 1 |
| [`/freight`](freight.md) | Landing freight (FCL/LCL/AIR ระหว่างประเทศ) | 3 | 1 |
| [`/freight/invoice/[id]`](freight/invoice/[id].md) | ใบแจ้งหนี้ freight | 8 | 3 |
| [`/freight/quotes/[quote_no]`](freight/quotes/[quote_no].md) | ใบเสนอราคา freight ของลูกค้า | 4 | 1 |
| [`/freight/receipts/history`](freight/receipts/history.md) | ประวัติใบเสร็จ freight | 3 | 0 |
| [`/freight/receipts/print/[id]`](freight/receipts/print/[id].md) | พิมพ์ใบเสร็จ freight | 8 | 3 |
| [`/freight/shipments`](freight/shipments.md) | รายการ shipment freight ของลูกค้า | 2 | 0 |
| [`/freight/shipments/[id]`](freight/shipments/[id].md) | รายละเอียด shipment freight | 5 | 2 |
| [`/line-settings`](line-settings.md) | ตั้งค่าการเชื่อม/แจ้งเตือน LINE | 1 | 1 |
| [`/m/dashboard`](m/dashboard.md) | แดชบอร์ดลูกค้าเวอร์ชันมือถือ | 5 | 1 |
| [`/map`](map.md) | แผนที่/ที่ตั้งสำนักงาน-โกดัง | 0 | 0 |
| [`/my-issues`](my-issues.md) | เคส/ปัญหาที่ลูกค้าแจ้งไว้ | 0 | 1 |
| [`/notifications`](notifications.md) | การแจ้งเตือนของลูกค้า | 2 | 1 |
| [`/orders`](orders.md) | รายการคำสั่งซื้อของลูกค้า | 1 | 0 |
| [`/orders/new`](orders/new.md) | สร้างคำสั่งซื้อใหม่ | 1 | 0 |
| [`/pay`](pay.md) | หน้าชำระเงิน (รวม) | 0 | 0 |
| [`/payment-due`](payment-due.md) | รายการที่รอชำระ (ค้างจ่าย) | 4 | 0 |
| [`/profile`](profile.md) | โปรไฟล์ลูกค้า | 8 | 0 |
| [`/profile/security/change-phone`](profile/security/change-phone.md) | เปลี่ยนเบอร์โทร (มี OTP) | 1 | 1 |
| [`/refunds`](refunds.md) | คำขอคืนเงินของลูกค้า | 5 | 1 |
| [`/sales`](sales.md) | หน้าเซล (ตัวแทน/พนักงานขาย) | 6 | 0 |
| [`/sales/history`](sales/history.md) | ประวัติการขาย/คอมมิชชัน | 2 | 0 |
| [`/sales/history/[id]`](sales/history/[id].md) | รายละเอียดรายการขาย | 5 | 0 |
| [`/sales/report`](sales/report.md) | รายงานยอดขาย | 4 | 0 |
| [`/sales/report/add`](sales/report/add.md) | เพิ่มรายงานยอดขาย | 7 | 0 |
| [`/search`](search.md) | ค้นหาสินค้าจีน (China-search · วางลิงก์/รูป) | 12 | 0 |
| [`/service-import`](service-import.md) | ฝากนำเข้า — รายการออเดอร์นำเข้าของลูกค้า | 14 | 0 |
| [`/service-import/[fNo]`](service-import/[fNo].md) | รายละเอียดออเดอร์ฝากนำเข้า (สถานะ/ค่าใช้จ่าย/ชำระ) | 11 | 0 |
| [`/service-import/[fNo]/invoice`](service-import/[fNo]/invoice.md) | ใบแจ้งหนี้ของออเดอร์นำเข้า | 9 | 3 |
| [`/service-import/[fNo]/receipt`](service-import/[fNo]/receipt.md) | ใบเสร็จของออเดอร์นำเข้า | 0 | 0 |
| [`/service-import/add`](service-import/add.md) | สร้างรายการฝากนำเข้าใหม่ | 5 | 0 |
| [`/service-import/air`](service-import/air.md) | ฝากนำเข้าทางอากาศ | 0 | 0 |
| [`/service-import/pending`](service-import/pending.md) | ออเดอร์นำเข้าที่รอดำเนินการ | 8 | 0 |
| [`/service-import/receipts`](service-import/receipts.md) | รวมใบเสร็จฝากนำเข้า | 3 | 0 |
| [`/service-import/receipts/print`](service-import/receipts/print.md) | พิมพ์ใบเสร็จฝากนำเข้า | 9 | 2 |
| [`/service-import/sea`](service-import/sea.md) | ฝากนำเข้าทางเรือ | 0 | 0 |
| [`/service-import/table`](service-import/table.md) | ตารางออเดอร์นำเข้า (มุมมองตาราง) | 5 | 0 |
| [`/service-import/truck`](service-import/truck.md) | ฝากนำเข้าทางรถ | 0 | 0 |
| [`/service-import/warehouse-addresses`](service-import/warehouse-addresses.md) | ที่อยู่โกดังสำหรับฝากนำเข้า | 1 | 0 |
| [`/service-order`](service-order.md) | ฝากสั่งซื้อ — รายการออเดอร์สั่งซื้อ | 4 | 0 |
| [`/service-order/[hNo]`](service-order/[hNo].md) | รายละเอียดออเดอร์ฝากสั่งซื้อ | 8 | 1 |
| [`/service-order/[hNo]/receipt`](service-order/[hNo]/receipt.md) | ใบเสร็จออเดอร์ฝากสั่งซื้อ | 12 | 4 |
| [`/service-order/add`](service-order/add.md) | สร้างออเดอร์ฝากสั่งซื้อใหม่ | 14 | 0 |
| [`/service-order/cart`](service-order/cart.md) | ตะกร้าฝากสั่งซื้อ | 0 | 0 |
| [`/service-order/pending`](service-order/pending.md) | ออเดอร์ฝากสั่งซื้อที่รอดำเนินการ | 8 | 0 |
| [`/service-order/print`](service-order/print.md) | พิมพ์ออเดอร์ฝากสั่งซื้อ | 4 | 1 |
| [`/service-payment`](service-payment.md) | ฝากโอนหยวน — รายการรายการโอน | 5 | 0 |
| [`/service-payment/[id]`](service-payment/[id].md) | รายละเอียดรายการฝากโอน | 8 | 1 |
| [`/service-payment/add`](service-payment/add.md) | สร้างรายการฝากโอนใหม่ | 8 | 0 |
| [`/shipments`](shipments.md) | รายการพัสดุ/การขนส่งของลูกค้า | 0 | 0 |
| [`/shipments/[code]`](shipments/[code].md) | ติดตามพัสดุตามรหัส | 0 | 0 |
| [`/wallet`](wallet.md) | กระเป๋าเงินลูกค้า (ยอดคงเหลือ) | 4 | 0 |
| [`/wallet-credit`](wallet-credit.md) | วงเงินเครดิตลูกค้า | 6 | 1 |
| [`/wallet-shop`](wallet-shop.md) | กระเป๋าเงินร้านค้า | 3 | 0 |
| [`/wallet/deposit`](wallet/deposit.md) | เติมเงินเข้ากระเป๋า (อัปโหลดสลิป) | 7 | 0 |
| [`/wallet/history`](wallet/history.md) | ประวัติเดินบัญชีกระเป๋าเงิน | 8 | 0 |
| [`/wallet/withdraw`](wallet/withdraw.md) | ถอนเงินจากกระเป๋า | 6 | 1 |

## 🛡 Admin back-office — 248 pages

| Route | คืออะไร | DB | Comp |
|---|---|--:|--:|
| [`/admin`](admin.md) | หน้าแรกหลังบ้าน admin (ภาพรวม/เมนู) | 9 | 0 |
| [`/admin/accounting`](admin/accounting.md) | ศูนย์บัญชี (hub) | 6 | 4 |
| [`/admin/accounting/ar-aging`](admin/accounting/ar-aging.md) | ลูกหนี้คงค้างตามอายุ (AR-aging · canonical) | 5 | 2 |
| [`/admin/accounting/cargo`](admin/accounting/cargo.md) | บัญชีฝั่ง cargo | 0 | 0 |
| [`/admin/accounting/cargo/income/[type]/[service]/[[...slug]]`](admin/accounting/cargo/income/[type]/[service]/[[...slug]].md) | รายได้ cargo แยกตามประเภท/บริการ | 1 | 0 |
| [`/admin/accounting/closing`](admin/accounting/closing.md) | ปิดงวดบัญชี | 3 | 1 |
| [`/admin/accounting/container-costs`](admin/accounting/container-costs.md) | ต้นทุนตู้ | 2 | 0 |
| [`/admin/accounting/disbursements`](admin/accounting/disbursements.md) | การเบิกจ่าย | 1 | 0 |
| [`/admin/accounting/documents`](admin/accounting/documents.md) | เอกสารบัญชี (PEAK hub) | 4 | 1 |
| [`/admin/accounting/etax`](admin/accounting/etax.md) | e-Tax (ออก XML ภาษีอิเล็กทรอนิกส์) | 2 | 2 |
| [`/admin/accounting/forwarder`](admin/accounting/forwarder.md) | บัญชีออเดอร์นำเข้า | 7 | 0 |
| [`/admin/accounting/forwarder-invoice`](admin/accounting/forwarder-invoice.md) | ใบแจ้งหนี้ฝั่งนำเข้า | 1 | 0 |
| [`/admin/accounting/forwarder-invoice/[id]`](admin/accounting/forwarder-invoice/[id].md) | รายละเอียดใบแจ้งหนี้นำเข้า | 8 | 1 |
| [`/admin/accounting/forwarder-invoice/add`](admin/accounting/forwarder-invoice/add.md) | สร้างใบแจ้งหนี้นำเข้า | 6 | 0 |
| [`/admin/accounting/freight`](admin/accounting/freight.md) | บัญชี freight | 1 | 2 |
| [`/admin/accounting/margin-monitor`](admin/accounting/margin-monitor.md) | มอนิเตอร์กำไรขั้นต้น (CEO ≤15k/ตู้) | 3 | 2 |
| [`/admin/accounting/payment`](admin/accounting/payment.md) | บัญชีรายการชำระ | 4 | 0 |
| [`/admin/accounting/peak-export`](admin/accounting/peak-export.md) | ส่งออกข้อมูลเข้า PEAK | 5 | 2 |
| [`/admin/accounting/periods`](admin/accounting/periods.md) | งวดบัญชี | 7 | 0 |
| [`/admin/accounting/periods/[period_yyyymm]`](admin/accounting/periods/[period_yyyymm].md) | รายละเอียดงวดบัญชี | 7 | 0 |
| [`/admin/accounting/quote-compare`](admin/accounting/quote-compare.md) | เครื่องมือเทียบราคา (CEO pricing) | 4 | 1 |
| [`/admin/accounting/receipts`](admin/accounting/receipts.md) | รวมใบเสร็จ | 5 | 0 |
| [`/admin/accounting/reconcile`](admin/accounting/reconcile.md) | กระทบยอด (reconciliation) | 3 | 0 |
| [`/admin/accounting/shop`](admin/accounting/shop.md) | บัญชีฝั่งร้านค้า | 5 | 0 |
| [`/admin/accounting/wht-certs`](admin/accounting/wht-certs.md) | หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) | 3 | 1 |
| [`/admin/accounting/withdraw`](admin/accounting/withdraw.md) | การเบิกถอน (บัญชี) | 3 | 0 |
| [`/admin/accounting/withdraw/comm-interpreter`](admin/accounting/withdraw/comm-interpreter.md) | เบิกคอมล่าม | 3 | 2 |
| [`/admin/accounting/withdraw/comm-interpreter/[id]`](admin/accounting/withdraw/comm-interpreter/[id].md) | รายละเอียดเบิกคอมล่าม | 3 | 1 |
| [`/admin/accounting/withdraw/comm-sale`](admin/accounting/withdraw/comm-sale.md) | เบิกคอมเซล | 3 | 2 |
| [`/admin/accounting/withdraw/comm-sale/[id]`](admin/accounting/withdraw/comm-sale/[id].md) | รายละเอียดเบิกคอมเซล | 3 | 1 |
| [`/admin/admins`](admin/admins.md) | รายชื่อผู้ดูแลระบบ (staff roster) | 3 | 0 |
| [`/admin/admins/[id]`](admin/admins/[id].md) | รายละเอียดผู้ดูแลรายคน | 3 | 0 |
| [`/admin/admins/[id]/edit`](admin/admins/[id]/edit.md) | แก้ไขข้อมูลผู้ดูแล | 4 | 0 |
| [`/admin/admins/new`](admin/admins/new.md) | เพิ่มผู้ดูแลใหม่ | 4 | 0 |
| [`/admin/api-forwarder-cn`](admin/api-forwarder-cn.md) | เชื่อม API CN forwarder | 1 | 1 |
| [`/admin/api-forwarder-cn/manual`](admin/api-forwarder-cn/manual.md) | กรอกข้อมูล CN forwarder เอง | 1 | 2 |
| [`/admin/api-forwarder-momo`](admin/api-forwarder-momo.md) | เชื่อม API MOMO forwarder | 4 | 1 |
| [`/admin/api-forwarder-momo/manual`](admin/api-forwarder-momo/manual.md) | กรอกข้อมูล MOMO เอง | 1 | 2 |
| [`/admin/api-forwarder-momo/review`](admin/api-forwarder-momo/review.md) | ตรวจ/commit ข้อมูล MOMO | 8 | 0 |
| [`/admin/api-forwarder-momo/sync`](admin/api-forwarder-momo/sync.md) | sync ข้อมูล MOMO (พรีวิว/ดึง) | 4 | 0 |
| [`/admin/api-sheets-ctt`](admin/api-sheets-ctt.md) | นำเข้าจาก Sheet CTT | 6 | 1 |
| [`/admin/api-sheets-mk`](admin/api-sheets-mk.md) | นำเข้าจาก Sheet MK | 6 | 1 |
| [`/admin/api-sheets-mx`](admin/api-sheets-mx.md) | นำเข้าจาก Sheet MX | 6 | 1 |
| [`/admin/api-sheets-sang`](admin/api-sheets-sang.md) | นำเข้าจาก Sheet Sang | 6 | 1 |
| [`/admin/audit`](admin/audit.md) | บันทึกการกระทำของผู้ดูแล (audit log) | 3 | 0 |
| [`/admin/barcode`](admin/barcode.md) | ระบบบาร์โค้ด (hub) | 0 | 0 |
| [`/admin/barcode/cargo/all`](admin/barcode/cargo/all.md) | บาร์โค้ด cargo — ทั้งหมด | 1 | 2 |
| [`/admin/barcode/cargo/from`](admin/barcode/cargo/from.md) | บาร์โค้ด cargo — จากต้นทาง | 1 | 2 |
| [`/admin/barcode/cargo/import`](admin/barcode/cargo/import.md) | บาร์โค้ด cargo — นำเข้า | 4 | 2 |
| [`/admin/barcode/cargo/prepare`](admin/barcode/cargo/prepare.md) | บาร์โค้ด cargo — เตรียมส่ง | 1 | 2 |
| [`/admin/barcode/driver`](admin/barcode/driver.md) | บาร์โค้ดคนขับ (hub) | 0 | 0 |
| [`/admin/barcode/driver/all`](admin/barcode/driver/all.md) | บาร์โค้ดคนขับ — ทั้งหมด | 1 | 2 |
| [`/admin/barcode/driver/from`](admin/barcode/driver/from.md) | บาร์โค้ดคนขับ — จากต้นทาง | 1 | 2 |
| [`/admin/barcode/driver/import`](admin/barcode/driver/import.md) | บาร์โค้ดคนขับ — สแกนนำเข้า (USB scanner) | 4 | 1 |
| [`/admin/barcode/driver/prepare`](admin/barcode/driver/prepare.md) | บาร์โค้ดคนขับ — เตรียมส่ง | 1 | 2 |
| [`/admin/barcode/gateway`](admin/barcode/gateway.md) | gateway routing บาร์โค้ด | 2 | 0 |
| [`/admin/board`](admin/board.md) | กระดานงาน (work-board) | 3 | 0 |
| [`/admin/board/inbox`](admin/board/inbox.md) | กล่องงานเข้า (inbox) | 3 | 0 |
| [`/admin/bookings`](admin/bookings.md) | การจอง (admin) | 2 | 0 |
| [`/admin/bookings/[bookingNo]`](admin/bookings/[bookingNo].md) | รายละเอียดการจอง | 7 | 1 |
| [`/admin/broadcasts`](admin/broadcasts.md) | แคมเปญ broadcast | 2 | 0 |
| [`/admin/broadcasts/[id]`](admin/broadcasts/[id].md) | รายละเอียด broadcast | 7 | 0 |
| [`/admin/broadcasts/new`](admin/broadcasts/new.md) | สร้าง broadcast | 7 | 0 |
| [`/admin/cargothai`](admin/cargothai.md) | หน้า CargoThai (warehouse-ops/ติดตาม) | 3 | 1 |
| [`/admin/carriers`](admin/carriers.md) | ผู้ให้บริการขนส่ง (carriers) | 1 | 0 |
| [`/admin/cnt-hs`](admin/cnt-hs.md) | เบิกเงินค่าตู้ (cnt-hs) | 3 | 1 |
| [`/admin/cnt-hs/[id]`](admin/cnt-hs/[id].md) | รายละเอียดเบิกค่าตู้ | 5 | 0 |
| [`/admin/commissions`](admin/commissions.md) | คอมมิชชัน (admin · live tb_user_sales) | 4 | 1 |
| [`/admin/commissions/[id]`](admin/commissions/[id].md) | รายละเอียดคอมมิชชัน | 1 | 0 |
| [`/admin/commissions/tiers`](admin/commissions/tiers.md) | ตั้งค่าขั้นคอมมิชชัน | 5 | 0 |
| [`/admin/contact-messages`](admin/contact-messages.md) | ข้อความติดต่อจากหน้าเว็บ | 2 | 1 |
| [`/admin/containers`](admin/containers.md) | จัดการตู้ (containers) | 1 | 0 |
| [`/admin/containers/[id]`](admin/containers/[id].md) | รายละเอียดตู้ | 1 | 0 |
| [`/admin/containers/[id]/hs`](admin/containers/[id]/hs.md) | HS lines ของตู้ | 3 | 1 |
| [`/admin/crm`](admin/crm.md) | CRM omni-inbox + customer-360 + routing | 9 | 0 |
| [`/admin/csv-imports`](admin/csv-imports.md) | งานนำเข้า CSV | 2 | 1 |
| [`/admin/csv-imports/[id]`](admin/csv-imports/[id].md) | รายละเอียดงานนำเข้า CSV | 2 | 1 |
| [`/admin/csv-imports/upload`](admin/csv-imports/upload.md) | อัปโหลด CSV | 2 | 1 |
| [`/admin/customers`](admin/customers.md) | รายการลูกค้าทั้งหมด | 9 | 3 |
| [`/admin/customers/[id]`](admin/customers/[id].md) | โปรไฟล์ลูกค้า (สถิติ/ที่อยู่/เรท/แก้ไข/hard-delete) | 17 | 0 |
| [`/admin/customers/[id]/convert-to-juristic`](admin/customers/[id]/convert-to-juristic.md) | แปลงลูกค้าเป็นนิติบุคคล | 7 | 1 |
| [`/admin/customers/[id]/transfer-rep`](admin/customers/[id]/transfer-rep.md) | ย้ายเซลผู้ดูแลลูกค้ารายนี้ | 7 | 1 |
| [`/admin/customers/new`](admin/customers/new.md) | สร้างลูกค้าใหม่โดย admin (ไม่ต้อง self-register) | 12 | 1 |
| [`/admin/customers/pending`](admin/customers/pending.md) | ลูกค้ารออนุมัติ | 11 | 0 |
| [`/admin/customers/recently-active`](admin/customers/recently-active.md) | ลูกค้าที่ active ล่าสุด | 2 | 0 |
| [`/admin/customers/transfer-bulk`](admin/customers/transfer-bulk.md) | ย้ายเซลแบบกลุ่ม | 2 | 0 |
| [`/admin/customers/transfer-rep`](admin/customers/transfer-rep.md) | ย้ายเซล (รายเดียว) | 5 | 0 |
| [`/admin/dashboard`](admin/dashboard.md) | แดชบอร์ดผู้ดูแล (KPI/สรุป) | 0 | 0 |
| [`/admin/driver-runs`](admin/driver-runs.md) | รอบวิ่งคนขับ | 4 | 1 |
| [`/admin/drivers`](admin/drivers.md) | รายชื่อคนขับ | 5 | 0 |
| [`/admin/drivers/[id]`](admin/drivers/[id].md) | รายละเอียดคนขับ | 6 | 0 |
| [`/admin/drivers/[id]/print`](admin/drivers/[id]/print.md) | พิมพ์ใบงานคนขับ | 6 | 2 |
| [`/admin/drivers/new`](admin/drivers/new.md) | เพิ่มคนขับ | 5 | 0 |
| [`/admin/drivers/work`](admin/drivers/work.md) | งานคนขับ | 6 | 0 |
| [`/admin/forwarder-action`](admin/forwarder-action.md) | การกระทำต่อออเดอร์นำเข้า (bulk action) | 3 | 1 |
| [`/admin/forwarder-check`](admin/forwarder-check.md) | ตรวจ/ออกบิลแบบกลุ่ม (bulk-bill) | 6 | 1 |
| [`/admin/forwarder-import-warehouse`](admin/forwarder-import-warehouse.md) | นำเข้าข้อมูลเข้าโกดัง | 0 | 0 |
| [`/admin/forwarder-sales`](admin/forwarder-sales.md) | คอมมิชชันการขายจากออเดอร์นำเข้า | 5 | 3 |
| [`/admin/forwarders`](admin/forwarders.md) | รายการออเดอร์ฝากนำเข้า (admin) | 8 | 1 |
| [`/admin/forwarders/[fNo]`](admin/forwarders/[fNo].md) | รายละเอียด/แก้ไขออเดอร์นำเข้า (เครื่องมือ admin ครบ) | 20 | 2 |
| [`/admin/forwarders/[fNo]/edit`](admin/forwarders/[fNo]/edit.md) | แก้ไขมิติ/ค่าใช้จ่ายของออเดอร์นำเข้า | 11 | 0 |
| [`/admin/forwarders/bulk-search`](admin/forwarders/bulk-search.md) | ค้นหาออเดอร์นำเข้าแบบกลุ่ม | 3 | 0 |
| [`/admin/forwarders/combine-bill`](admin/forwarders/combine-bill.md) | รวมบิลส่งสินค้า | 5 | 1 |
| [`/admin/forwarders/combine-bill/[id]`](admin/forwarders/combine-bill/[id].md) | รายละเอียดบิลรวม | 5 | 2 |
| [`/admin/forwarders/combine-bill/add`](admin/forwarders/combine-bill/add.md) | สร้างบิลรวมใหม่ | 5 | 0 |
| [`/admin/forwarders/combine-bill/print`](admin/forwarders/combine-bill/print.md) | พิมพ์ใบส่งสินค้า (บิลรวม) | 3 | 2 |
| [`/admin/forwarders/container-cost-check`](admin/forwarders/container-cost-check.md) | ตรวจต้นทุนตู้ | 1 | 1 |
| [`/admin/forwarders/new`](admin/forwarders/new.md) | สร้างออเดอร์นำเข้าใหม่ (admin) | 8 | 0 |
| [`/admin/forwarders/notes`](admin/forwarders/notes.md) | โน้ตของออเดอร์นำเข้า | 3 | 0 |
| [`/admin/forwarders/print`](admin/forwarders/print.md) | พิมพ์ออเดอร์นำเข้า | 2 | 2 |
| [`/admin/forwarders/tran-th`](admin/forwarders/tran-th.md) | งานขนส่งในไทย (TH-transport batch) | 4 | 0 |
| [`/admin/forwarders/tran-th/[id]`](admin/forwarders/tran-th/[id].md) | รายละเอียด batch ขนส่งในไทย | 4 | 0 |
| [`/admin/forwarders/warehouse-history`](admin/forwarders/warehouse-history.md) | ประวัติเข้าโกดัง | 5 | 1 |
| [`/admin/freight/declarations`](admin/freight/declarations.md) | ใบขนสินค้า (customs declarations) | 3 | 0 |
| [`/admin/freight/declarations/[id]`](admin/freight/declarations/[id].md) | รายละเอียดใบขนสินค้า | 9 | 0 |
| [`/admin/freight/quotes`](admin/freight/quotes.md) | ใบเสนอราคา freight (admin) | 2 | 0 |
| [`/admin/freight/quotes/[id]`](admin/freight/quotes/[id].md) | รายละเอียดใบเสนอราคา freight | 5 | 0 |
| [`/admin/freight/quotes/new`](admin/freight/quotes/new.md) | สร้างใบเสนอราคา freight | 4 | 0 |
| [`/admin/freight/shipments`](admin/freight/shipments.md) | shipment freight (admin) | 2 | 0 |
| [`/admin/freight/shipments/[id]`](admin/freight/shipments/[id].md) | รายละเอียด shipment freight | 14 | 1 |
| [`/admin/freight/shipments/new`](admin/freight/shipments/new.md) | สร้าง shipment freight | 4 | 1 |
| [`/admin/hr`](admin/hr.md) | ทรัพยากรบุคคล (hub) | 2 | 0 |
| [`/admin/hr/assets`](admin/hr/assets.md) | ทรัพย์สินพนักงาน | 1 | 1 |
| [`/admin/hr/attendance`](admin/hr/attendance.md) | ลงเวลาทำงาน | 3 | 1 |
| [`/admin/hr/attendance/leaves`](admin/hr/attendance/leaves.md) | การลา | 4 | 1 |
| [`/admin/hr/audit`](admin/hr/audit.md) | audit ฝั่ง HR | 2 | 1 |
| [`/admin/hr/humanresource`](admin/hr/humanresource.md) | ข้อมูลพนักงาน | 1 | 1 |
| [`/admin/hr/org-chart`](admin/hr/org-chart.md) | ผังองค์กร (chart) | 5 | 0 |
| [`/admin/hr/org-table`](admin/hr/org-table.md) | ผังองค์กร (ตาราง) | 5 | 0 |
| [`/admin/hr/policies`](admin/hr/policies.md) | นโยบายบริษัท | 3 | 1 |
| [`/admin/hr/recruitment`](admin/hr/recruitment.md) | รับสมัครงาน | 2 | 0 |
| [`/admin/hr/recruitment/[id]`](admin/hr/recruitment/[id].md) | รายละเอียดผู้สมัคร | 3 | 1 |
| [`/admin/hr/recruitment/new`](admin/hr/recruitment/new.md) | เพิ่มประกาศ/ผู้สมัคร | 3 | 1 |
| [`/admin/hr/training`](admin/hr/training.md) | อบรมพนักงาน | 3 | 1 |
| [`/admin/incidents`](admin/incidents.md) | บันทึก/ติดตามเหตุการณ์ระบบ | 2 | 0 |
| [`/admin/inventory`](admin/inventory.md) | สต็อก/คลังสินค้า | 0 | 0 |
| [`/admin/juristic-check`](admin/juristic-check.md) | ตรวจ/อนุมัติเอกสารนิติบุคคล | 7 | 2 |
| [`/admin/kpi`](admin/kpi.md) | แดชบอร์ด KPI ผู้บริหาร | 7 | 0 |
| [`/admin/leads`](admin/leads.md) | คิวโทรลูกค้าเย็น (cold-leads) | 4 | 1 |
| [`/admin/learning`](admin/learning.md) | ศูนย์เรียนรู้/คู่มือพนักงาน | 0 | 0 |
| [`/admin/line-inbox`](admin/line-inbox.md) | กล่องข้อความ LINE (อ่านข้อมูลจาก Worker) | 1 | 0 |
| [`/admin/migration/pcs-customers`](admin/migration/pcs-customers.md) | เครื่องมือ migrate ลูกค้า PCS เดิม | 4 | 0 |
| [`/admin/momo-lcl`](admin/momo-lcl.md) | MOMO LCL | 2 | 1 |
| [`/admin/notifications/dispatch`](admin/notifications/dispatch.md) | ส่งการแจ้งเตือน | 2 | 0 |
| [`/admin/organization-channels`](admin/organization-channels.md) | ช่องทางองค์กร (LINE/WeChat/โทร) | 5 | 1 |
| [`/admin/organization-email`](admin/organization-email.md) | อีเมลองค์กร | 2 | 1 |
| [`/admin/partners`](admin/partners.md) | ไดเรกทอรีพันธมิตร (logistics/business partners · CRUD) | 2 | 0 |
| [`/admin/payment-reconciliation`](admin/payment-reconciliation.md) | กระทบยอดการชำระ | 3 | 0 |
| [`/admin/printAll`](admin/printAll.md) | พิมพ์รวม (admin) | 2 | 2 |
| [`/admin/qa`](admin/qa.md) | ศูนย์ QA (คิวตรวจสอบ) | 1 | 1 |
| [`/admin/qa/chn-shop-over-2d`](admin/qa/chn-shop-over-2d.md) | QA: ร้านจีนเกิน 2 วัน | 3 | 0 |
| [`/admin/qa/chn-wh-over-2d`](admin/qa/chn-wh-over-2d.md) | QA: ค้างโกดังจีนเกิน 2 วัน | 3 | 0 |
| [`/admin/qa/credit-overdue`](admin/qa/credit-overdue.md) | QA: เครดิตเกินกำหนด | 3 | 0 |
| [`/admin/qa/new-client-no-contact`](admin/qa/new-client-no-contact.md) | QA: ลูกค้าใหม่ยังไม่ติดต่อ | 2 | 0 |
| [`/admin/qa/order-cancellations`](admin/qa/order-cancellations.md) | QA: ออเดอร์ถูกยกเลิก | 3 | 0 |
| [`/admin/qa/order-over-10min`](admin/qa/order-over-10min.md) | QA: ออเดอร์ค้างเกิน 10 นาที | 3 | 0 |
| [`/admin/qa/ownerless-goods`](admin/qa/ownerless-goods.md) | QA: สินค้าไม่มีเจ้าของ | 2 | 0 |
| [`/admin/qa/pay-fwd-over-2d`](admin/qa/pay-fwd-over-2d.md) | QA: ค้างจ่ายนำเข้าเกิน 2 วัน | 3 | 0 |
| [`/admin/qa/pay-shop-over-1d`](admin/qa/pay-shop-over-1d.md) | QA: ค้างจ่ายร้านเกิน 1 วัน | 3 | 0 |
| [`/admin/qa/prepare-overdue`](admin/qa/prepare-overdue.md) | QA: เตรียมส่งเกินกำหนด | 3 | 0 |
| [`/admin/qa/transit-overdue`](admin/qa/transit-overdue.md) | QA: ขนส่งเกินกำหนด | 3 | 0 |
| [`/admin/rates`](admin/rates.md) | จัดการเรท (hub) | 1 | 0 |
| [`/admin/rates/custom-hs`](admin/rates/custom-hs.md) | เรทเฉพาะตาม HS code | 10 | 1 |
| [`/admin/rates/custom-user`](admin/rates/custom-user.md) | เรทเฉพาะรายลูกค้า | 10 | 1 |
| [`/admin/rates/general`](admin/rates/general.md) | เรททั่วไป (engine) | 10 | 0 |
| [`/admin/rates/vip`](admin/rates/vip.md) | เรท VIP | 0 | 0 |
| [`/admin/refunds`](admin/refunds.md) | คำขอคืนเงิน (admin) | 2 | 0 |
| [`/admin/refunds/[id]`](admin/refunds/[id].md) | รายละเอียดคืนเงิน | 8 | 0 |
| [`/admin/refunds/new`](admin/refunds/new.md) | สร้างคำขอคืนเงิน | 7 | 0 |
| [`/admin/report-cnt`](admin/report-cnt.md) | รายงานตู้ (per-container) | 3 | 1 |
| [`/admin/report-cnt/[fNo]`](admin/report-cnt/[fNo].md) | รายละเอียดตู้ + แก้ต้นทุน | 13 | 2 |
| [`/admin/report-cnt/pay`](admin/report-cnt/pay.md) | จ่าย/เบิกค่าตู้ | 0 | 0 |
| [`/admin/reports`](admin/reports.md) | ศูนย์รายงาน (hub) | 9 | 3 |
| [`/admin/reports/agent-payouts`](admin/reports/agent-payouts.md) | รายงานจ่ายคอมตัวแทน | 5 | 2 |
| [`/admin/reports/ar-aging`](admin/reports/ar-aging.md) | รายงานลูกหนี้ตามอายุ (redirect → accounting) | 0 | 0 |
| [`/admin/reports/cockpit`](admin/reports/cockpit.md) | Cockpit ผู้บริหาร (AR/funnel) | 4 | 0 |
| [`/admin/reports/containers-awaiting-th`](admin/reports/containers-awaiting-th.md) | ตู้ที่รอถึงไทย | 2 | 2 |
| [`/admin/reports/containers-hs`](admin/reports/containers-hs.md) | ตู้แยกตาม HS code | 1 | 0 |
| [`/admin/reports/credit-pending`](admin/reports/credit-pending.md) | เครดิตที่รออนุมัติ | 3 | 2 |
| [`/admin/reports/debtors`](admin/reports/debtors.md) | ลูกหนี้ค้างชำระ | 4 | 1 |
| [`/admin/reports/forwarder`](admin/reports/forwarder.md) | รายงานออเดอร์นำเข้า | 3 | 1 |
| [`/admin/reports/forwarder-profit`](admin/reports/forwarder-profit.md) | กำไรออเดอร์นำเข้า | 9 | 1 |
| [`/admin/reports/forwarder-volume`](admin/reports/forwarder-volume.md) | ปริมาณออเดอร์นำเข้า | 2 | 1 |
| [`/admin/reports/hs-code-revenue`](admin/reports/hs-code-revenue.md) | รายได้ตาม HS code | 2 | 1 |
| [`/admin/reports/monthly-orders`](admin/reports/monthly-orders.md) | ออเดอร์รายเดือน | 5 | 1 |
| [`/admin/reports/otp-success`](admin/reports/otp-success.md) | อัตราสำเร็จ OTP | 9 | 1 |
| [`/admin/reports/payment`](admin/reports/payment.md) | รายงานการชำระ | 3 | 1 |
| [`/admin/reports/pending-payments`](admin/reports/pending-payments.md) | รายการรอชำระ | 3 | 2 |
| [`/admin/reports/profit-analytics`](admin/reports/profit-analytics.md) | วิเคราะห์กำไร (BI) | 2 | 0 |
| [`/admin/reports/refunds`](admin/reports/refunds.md) | รายงานคืนเงิน | 4 | 2 |
| [`/admin/reports/sales-by-rep`](admin/reports/sales-by-rep.md) | ยอดขายแยกตามเซล | 2 | 1 |
| [`/admin/reports/sales-monthly`](admin/reports/sales-monthly.md) | ยอดขายรายเดือน | 9 | 1 |
| [`/admin/reports/search-demand`](admin/reports/search-demand.md) | ดีมานด์การค้นหาสินค้า | 3 | 1 |
| [`/admin/reports/shop`](admin/reports/shop.md) | รายงานฝั่งร้านค้า | 4 | 1 |
| [`/admin/reports/shops-profit`](admin/reports/shops-profit.md) | กำไรร้านค้า | 9 | 1 |
| [`/admin/reports/shops-profit-pay`](admin/reports/shops-profit-pay.md) | กำไร/จ่ายร้านค้า | 4 | 2 |
| [`/admin/reports/sla-cycle-time`](admin/reports/sla-cycle-time.md) | เวลา cycle/SLA | 3 | 1 |
| [`/admin/reports/sms-usage`](admin/reports/sms-usage.md) | การใช้ SMS | 3 | 1 |
| [`/admin/reports/system`](admin/reports/system.md) | รายงานระบบ | 3 | 1 |
| [`/admin/reports/user-sales-history`](admin/reports/user-sales-history.md) | ประวัติยอดขายต่อลูกค้า | 5 | 1 |
| [`/admin/reports/user-sales-history/[customer_id]`](admin/reports/user-sales-history/[customer_id].md) | ประวัติยอดขายของลูกค้ารายหนึ่ง | 7 | 0 |
| [`/admin/reports/yuan-profit`](admin/reports/yuan-profit.md) | กำไรจากฝากโอนหยวน | 9 | 1 |
| [`/admin/sales-payouts`](admin/sales-payouts.md) | จ่ายคอมเซล | 7 | 1 |
| [`/admin/sales-payouts/[id]`](admin/sales-payouts/[id].md) | รายละเอียดจ่ายคอมเซล | 7 | 0 |
| [`/admin/search`](admin/search.md) | ค้นหาข้ามระบบ (admin) | 8 | 0 |
| [`/admin/service-orders`](admin/service-orders.md) | รายการออเดอร์ฝากสั่งซื้อ (admin) | 4 | 2 |
| [`/admin/service-orders/[hNo]`](admin/service-orders/[hNo].md) | รายละเอียด/แก้ไขออเดอร์ฝากสั่งซื้อ | 8 | 2 |
| [`/admin/service-orders/cart`](admin/service-orders/cart.md) | ตะกร้าฝากสั่งซื้อ (admin) | 8 | 0 |
| [`/admin/service-orders/cart/add`](admin/service-orders/cart/add.md) | เพิ่มสินค้าในตะกร้า (admin) | 7 | 0 |
| [`/admin/service-orders/notes`](admin/service-orders/notes.md) | โน้ตออเดอร์ฝากสั่งซื้อ | 3 | 0 |
| [`/admin/service-orders/print`](admin/service-orders/print.md) | พิมพ์ออเดอร์ฝากสั่งซื้อ | 5 | 1 |
| [`/admin/settings`](admin/settings.md) | ตั้งค่าระบบ (hub · read-through) | 2 | 0 |
| [`/admin/settings/business-config`](admin/settings/business-config.md) | ตั้งค่าธุรกิจ (key-value) | 2 | 0 |
| [`/admin/settings/contacts`](admin/settings/contacts.md) | ตั้งค่าข้อมูลติดต่อ | 2 | 0 |
| [`/admin/settings/forwarder-costs`](admin/settings/forwarder-costs.md) | ตั้งค่าต้นทุนนำเข้า (matrix) | 3 | 1 |
| [`/admin/settings/legacy-rates`](admin/settings/legacy-rates.md) | เรทจริง (tb_settings) | 3 | 1 |
| [`/admin/settings/notifications`](admin/settings/notifications.md) | ตั้งค่าการแจ้งเตือน | 4 | 1 |
| [`/admin/settings/promos`](admin/settings/promos.md) | จัดการโปรโมชัน + อัปโหลดรูปแบนเนอร์ | 2 | 0 |
| [`/admin/settings/tos-versions`](admin/settings/tos-versions.md) | จัดการเวอร์ชันข้อกำหนด | 3 | 0 |
| [`/admin/shop-disbursement`](admin/shop-disbursement.md) | เบิกจ่ายร้านค้า | 8 | 1 |
| [`/admin/shop-disbursement/history`](admin/shop-disbursement/history.md) | ประวัติเบิกจ่ายร้านค้า | 8 | 1 |
| [`/admin/shop-disbursement/history/[id]`](admin/shop-disbursement/history/[id].md) | รายละเอียดเบิกจ่ายร้านค้า | 8 | 1 |
| [`/admin/shop-disbursement/history/[id]/print`](admin/shop-disbursement/history/[id]/print.md) | พิมพ์ใบเบิกจ่ายร้านค้า | 8 | 2 |
| [`/admin/shop-payouts`](admin/shop-payouts.md) | จ่ายเงินร้านค้า | 2 | 2 |
| [`/admin/system/cron-health`](admin/system/cron-health.md) | สุขภาพ cron | 0 | 0 |
| [`/admin/system/crons`](admin/system/crons.md) | จัดการ cron jobs | 2 | 0 |
| [`/admin/system/notifications`](admin/system/notifications.md) | การแจ้งเตือนระบบ | 3 | 0 |
| [`/admin/tax-invoices`](admin/tax-invoices.md) | ใบกำกับภาษี (รายการ) | 2 | 0 |
| [`/admin/tax-invoices/[id]`](admin/tax-invoices/[id].md) | รายละเอียดใบกำกับภาษี | 7 | 1 |
| [`/admin/team-leaders`](admin/team-leaders.md) | หัวหน้าทีม | 4 | 1 |
| [`/admin/wallet`](admin/wallet.md) | จัดการกระเป๋าเงินลูกค้า (admin) | 5 | 1 |
| [`/admin/wallet/[id]`](admin/wallet/[id].md) | กระเป๋าเงินลูกค้ารายคน (เติม/สลิป) | 11 | 0 |
| [`/admin/wallet/add`](admin/wallet/add.md) | เติมเงินให้ลูกค้า (admin manual) | 11 | 0 |
| [`/admin/wallet/deposit`](admin/wallet/deposit.md) | อนุมัติรายการเติมเงิน | 0 | 0 |
| [`/admin/wallet/history`](admin/wallet/history.md) | ประวัติกระเป๋าเงิน (admin) | 1 | 0 |
| [`/admin/wallet/pay-user`](admin/wallet/pay-user.md) | จ่ายเงินแทนลูกค้า (ตัดกระเป๋า) | 9 | 0 |
| [`/admin/wallet/withdrawals`](admin/wallet/withdrawals.md) | คำขอถอนเงิน (admin) | 11 | 1 |
| [`/admin/warehouse/bulletin`](admin/warehouse/bulletin.md) | ประกาศโกดัง | 1 | 0 |
| [`/admin/warehouse/containers`](admin/warehouse/containers.md) | ตู้ในโกดัง | 1 | 0 |
| [`/admin/warehouse/qa-inspections`](admin/warehouse/qa-inspections.md) | ตรวจ QA สินค้าในโกดัง | 5 | 0 |
| [`/admin/warehouse/qa-inspections/[id]`](admin/warehouse/qa-inspections/[id].md) | รายละเอียดการตรวจ QA | 5 | 0 |
| [`/admin/warehouse/qa-inspections/new`](admin/warehouse/qa-inspections/new.md) | สร้างการตรวจ QA | 5 | 0 |
| [`/admin/wht`](admin/wht.md) | หัก ณ ที่จ่าย (WHT) | 2 | 0 |
| [`/admin/withdrawal/freight-th`](admin/withdrawal/freight-th.md) | เบิกค่าขนส่งในไทย (freight) | 1 | 1 |
| [`/admin/withdrawals`](admin/withdrawals.md) | คำขอถอนเงิน (รวม) | 0 | 0 |
| [`/admin/yuan-payments`](admin/yuan-payments.md) | รายการฝากโอนหยวน (admin) | 7 | 0 |
| [`/admin/yuan-payments/[id]`](admin/yuan-payments/[id].md) | รายละเอียด/อนุมัติรายการฝากโอน | 4 | 0 |
| [`/admin/yuan-payments/new`](admin/yuan-payments/new.md) | สร้างรายการฝากโอนให้ลูกค้า (admin) | 7 | 0 |

## 🧩 Misc — 3 pages

| Route | คืออะไร | DB | Comp |
|---|---|--:|--:|
| [`/complete-profile`](complete-profile.md) | กรอกข้อมูลโปรไฟล์ให้ครบหลังสมัคร (mid-signup) | 3 | 2 |
| [`/liff/link`](liff/link.md) | LINE LIFF — เชื่อมบัญชี LINE กับลูกค้า | 1 | 1 |
| [`/reset-password`](reset-password.md) | ตั้งรหัสผ่านใหม่ (จากลิงก์รีเซ็ต) | 4 | 2 |

## Methodology

- **Auth** resolved from the page's own `requireAuth`/`requireAdmin([...])`/`requireGuest`, else the nearest `layout.tsx`, else the route-group default. Admin role lists are the literal roles passed to `requireAdmin([...])`.
- **Database / env / API** include signals reached **transitively through imported server actions + lib modules (1 level)** — so a page that renders by calling an action is credited with that action's tables.
- **Components** = `@/components/*` imports (page + co-located client islands).
- Counts in the tables: DB tables · components · server actions.
- Edge gating: `proxy.ts` redirects unauthenticated `/admin/*` to `/login`, and bounces non-`super` roles off Phase-2+ routes (`lib/admin/phase-access.ts`). The layout `requireAdmin()` is the authoritative role gate.

**Total: 365 pages.**
