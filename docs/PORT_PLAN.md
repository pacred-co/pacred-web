# 🚢 Pacred — Port Plan & Work Split

> **เป้าหมาย:** Port ระบบ PHP `pcs-cargo` ทั้งระบบ (customer + admin) → Next.js + Supabase
> **กติกา:** อ่านเอกสารนี้ครั้งเดียวจบ — **ไม่ต้องกลับไปดูไฟล์ PHP ต้นฉบับอีก**
> **วันที่:** 2026-05-13 · **เวอร์ชัน:** 1.0

---

## 📊 TL;DR — สรุป 5 บรรทัด

| | สถานะปัจจุบัน |
|---|---|
| ✅ **Customer-facing (ฝั่งลูกค้า)** | **~85% เสร็จ** — auth, dashboard, orders, forwarders, wallet, payment ทำงานได้จริง |
| ✅ **Admin HR** | **100% เสร็จ** — org chart, employees, recruitment, attendance, training, policies, audit |
| 🟡 **Admin Operations** | **~40% เสร็จ** — list views มี, ปุ่ม approve/reject/edit ส่วนใหญ่ยังไม่ครบ |
| 🔴 **Admin Finance/Reports** | **~10% เสร็จ** — accounting, reports เป็น stub |
| 🔴 **API Integrations** | **0% เสร็จ** — JMF/TTP/Sheets/PDF generation ยังไม่ทำ |

**Critical gaps สำหรับ launch:** PDF receipts (จริงๆ), admin forwarder/order status workflow, admin wallet approve, rate management UI

---

## 🎯 แผนแบ่งงาน

```
ปอน (podeng)  → ปิด customer-facing gaps + UI polish     [~3 sprints]
ภูม (Poom)    → admin operations ทั้งหมด                  [~4 sprints]
เดฟ (dave)    → integrations + critical infra + coordination [~3 sprints]
```

**Total estimated:** ~3-4 สัปดาห์ ถ้า full-time

---

# Part A — สถานะปัจจุบัน (Status Snapshot)

## A1. Customer-facing pages

> ตรวจสอบจาก worktree `claude/jolly-taussig-7132d7` ณ commit `73cdafc`

### 🟢 REAL — ทำงานได้จริง ครบฟีเจอร์

| Path | ทำได้ |
|---|---|
| `/login` | email/phone/ID + password + Google/Facebook OAuth + LINE (mocked) |
| `/register` | บุคคล + นิติบุคคล 3-step + upload เอกสาร + Zod validation |
| `/auth/callback` | OAuth handler |
| `/auth/signout` | sign out |
| `/dashboard` | 4 stat cards + recent orders/forwarders + sales rep + dashboard banners |
| `/addresses` | CRUD + default flag + soft-delete |
| `/service-order` | list + 6 status tabs + sticky payment bar |
| `/service-order/add` | URL paste (RCGroup/Tamit) + image preview + live price calc + variant select + crate/transport picker |
| `/service-order/cart` | CRUD + 151-item cap (DB trigger) |
| `/service-order/[hNo]` | detail (read-only) |
| `/service-import` | list + 7 status tabs + sticky payment bar |
| `/service-import/add` | warehouse + transport + items + cover upload + live rate calc (waterfall + tier + juristic 1% + service fee) |
| `/service-import/[fNo]` | detail (read-only) |
| `/service-import/[fNo]/receipt` | HTML print receipt (Ctrl+P) |
| `/service-import/receipts` | history + date range + print |
| `/service-payment` | list + status tabs |
| `/service-payment/add` | yuan ↔ THB live + Alipay channel |
| `/wallet/history` | 4-tab transactions |
| `/wallet/deposit` | 3-step QR + drag-drop slip |
| `/wallet/withdraw` | live fee preview |
| `/notifications` | list + mark read |

### 🟡 PARTIAL — ใช้งานได้แต่ขาดบางอย่าง

| Path | ที่ขาด |
|---|---|
| `/profile` | ฟอร์ม edit ยังไม่มี (มีแค่ avatar + security panels) |
| `/complete-profile` | placeholder (redirect logic ทำงาน) |
| `/sales` | greeting + commission summary แต่ analytics ยังน้อย |
| `/sales/history` | basic list |
| `/sales/report` | analytics tbd |
| `/service-order/pending` | filter-only (ซ้ำกับ `?q=pending`) |
| `/service-import/pending` | filter-only (ซ้ำกับ `?q=pending`) |

### 🔴 MISSING — ไม่มีเลย

| Feature ที่ PHP มี | ที่ต้องสร้าง |
|---|---|
| `china-address.php` — list ที่อยู่โกดังจีนสำหรับติดสลาก | `/service-import/warehouse-addresses` |
| `verify-tel.php` post-login (มีตอน register แต่ตอนเปลี่ยนเบอร์ไม่มี) | `/profile/security/change-phone` |
| `printShop.php` — PDF ใบเสร็จ shop order | `/service-order/[hNo]/receipt` |
| `report-user-sales-add.php` — ฟอร์มยื่นเคลม sales referral | `/sales/report/add` |
| `map.php` — Google Maps สำหรับ address | ฝังใน `/addresses` |

## A2. Admin pages

### 🟢 REAL — HR ครบ 100% (Phase 1-3 ของ HR)

| Path | สิ่งที่ทำได้ |
|---|---|
| `/admin/hr` | hub 9 tiles ทุกอันเป็น active link |
| `/admin/hr/org-chart` | tree view 3 ผู้บริหาร + 9 sections + 24 positions + quota color states |
| `/admin/hr/org-table` | flat table view + totals |
| `/admin/hr/employees` | data-table 12 cols + 3 tabs + search + dept/type filter + 4 row actions |
| `/admin/hr/employees/[id]` | profile + edit form + org assignments + roles + meta |
| `/admin/hr/recruitment` | postings list + applicant pipeline counts |
| `/admin/hr/recruitment/new` | create posting form |
| `/admin/hr/recruitment/[id]` | posting detail + 6-stage applicant pipeline + inline add applicant + per-applicant actions |
| `/admin/hr/attendance` | daily dashboard + stat pills + date nav + dept filter + grouped table + clock buttons |
| `/admin/hr/attendance/leaves` | leave queue 4 tabs + approve/reject + add-on-behalf modal |
| `/admin/hr/training` | course list + progress bar + enrollment table + Pass/Fail/Exempt + bulk enroll |
| `/admin/hr/policies` | grid + publish toggle + ack% + markdown/external URL |
| `/admin/hr/audit` | feed-style list + 7 type icons × 5 severity + filter |

### 🟢 REAL — Admin Dashboard

| Path | สิ่งที่ทำได้ |
|---|---|
| `/admin` | 4 revenue cards + rate strip + user stat cards + 13-tab transaction view |
| `/admin/customers` | list + search + filter (personal/juristic) + status + wallet display |
| `/admin/customers/pending` | filter-only (incomplete profiles) |
| `/admin/admins` | grant/revoke/toggle roles + contact extras |

### 🟡 PARTIAL — ใช้ได้แต่ขาดฟีเจอร์

| Path | ที่ขาด |
|---|---|
| `/admin/customers/[id]` | detail page basic — ขาด edit/approve/suspend inline UI |
| `/admin/forwarders` | list works — ขาด bulk status update, search ลึก |
| `/admin/forwarders/[fNo]` | edit form มี — ขาด workflow buttons (move to next status), driver assignment, invoice generation |
| `/admin/service-orders` | list works — ขาด edit, bulk status, refund |
| `/admin/service-orders/[hNo]` | detail มี — ขาด edit items/price, mark payment, issue receipt |
| `/admin/wallet` | list works — ขาด approve/reject slips, bulk operations |
| `/admin/yuan-payments` | list works — ขาด approve/mark-completed UI |
| `/admin/containers` | list มี — ขาด link forwarders/orders to container, ETA updates |
| `/admin/team-leaders` | list มี — ขาด edit commission %, view team members |
| `/admin/sales-payouts` | list มี — ขาด approve/mark-paid actions |
| `/admin/settings` | minimal — ขาด rate edit, fee adjust, notification toggle UI |
| `/admin/juristic-check` | partial — ขาด doc viewer, approve/reject |

### 🔴 STUB — ยังเป็น placeholder

| Path | สาระจาก PHP | สิ่งที่ต้องสร้าง |
|---|---|---|
| `/admin/accounting` | 7 ไฟล์ PHP: acc-forwarder, acc-payment, acc-shop, acc-shop-refund, acc-system-cargo, acc-topup, acc-withdraw | Multi-tab dashboard: รายรับ-รายจ่ายต่อบริการ + คืนเงิน + บัญชี Pacred รวม |
| `/admin/reports` | 30+ ไฟล์ report-* ใน PHP | Multi-tab: รายงานต่อ driver/forwarder/shop/sale/payment/system/OTP/SMS/promo |
| `/admin/barcode` | 9 ไฟล์ barcode-c-* + barcode-d-* | scan รับสินค้าเข้าโกดัง + driver pickup + label print |
| `/admin/learning` | shell มีอยู่ — duplicate กับ `/admin/hr/training` หรือไม่? | clarify scope หรือ redirect |

## A3. Server Actions (ทั้งหมด ~2,700 LOC)

**Customer-facing:** `auth.ts`, `addresses.ts`, `cart.ts`, `service-order.ts`, `forwarder.ts`, `payment.ts`, `wallet.ts`, `otp.ts`, `security.ts`, `profile.ts`, `sales.ts`, `notifications.ts`, `tos.ts`

**Admin:**
- `admin/customers.ts` — list/approve/suspend
- `admin/employees.ts` — assign position, edit info, suspend
- `admin/recruitment.ts` — postings, applicants
- `admin/attendance.ts` — clock, leave decide
- `admin/learning.ts` — courses, enrollments
- `admin/policies.ts` — policies, ack
- `admin/employee-audit.ts` — audit log
- `admin/forwarders.ts` — basic update
- `admin/service-orders.ts` — basic update
- `admin/wallet.ts` — basic
- `admin/yuan-payments.ts` — basic
- `admin/containers.ts` — basic
- `admin/team-leaders.ts` — basic
- `admin/sales-payouts.ts` — basic
- `admin/settings.ts` — basic
- `admin/admins.ts` — grant/revoke/toggle
- `admin/barcode.ts` — basic

## A4. Database — 21 migrations, ~40 tables

ดูรายละเอียดที่ [supabase/migrations/README.md](../supabase/migrations/README.md)

**Storage buckets:** member-docs · slips · forwarder-covers · carts · avatars (public) · resumes

**Cron jobs:** `/api/cron/auto-cancel-orders` (every 15 min)

**Postgres triggers:**
- `wallet_recompute_balance` — sync 3 balance cols
- `generate_h_no` + `generate_f_no` — auto IDs
- `auto_create_wallet` — on profile insert
- `auto_emit_sales_commission` — on order complete
- `recompute_attendance_log` — auto late/worked minutes
- `apply_leave_to_attendance` — on leave approve

---

# Part B — PHP Feature Inventory (Reference)

> สรุปทุก feature ฝั่ง PHP ที่เกี่ยวข้อง — **ทีมไม่ต้องเปิดไฟล์ PHP ดูเอง** ใช้ตารางนี้เป็น single source of truth

## B1. Customer-side PHP modules (42 files — ไม่รวม deprecated)

### Auth & Account
| PHP file | ทำอะไร | ตาราง | Port status |
|---|---|---|---|
| `login.php` | email/phone + password + remember-me cookie 10 ปี | `tb_users`, `tb_pcs_logged` | ✅ ครบ |
| `register.php` | บุคคลธรรมดา | `tb_register`, `tb_users` | ✅ ครบ |
| `regis-tam.php` | นิติบุคคลไทย — 3-step | `tb_corporate` | ✅ ครบ |
| `register-id.php` | นิติบุคคลต่างชาติ | `tb_corporate` | ✅ ครบ |
| `verify-tel.php` (17KB) | OTP เปลี่ยนเบอร์ post-login | `tb_users_otp*` | 🔴 ไม่มี (register OTP มี) |
| `fb-callback.php` | Facebook OAuth callback | `tb_users` | ✅ มีที่ `app/auth/callback` |
| `logout.php` | sign out | session | ✅ ครบ |
| `profile.php` | view + edit profile | `tb_users` | 🟡 view ครบ, edit ขาด |
| `account-settings.php` | password + LINE Notify settings | `tb_users` | 🟡 password มี, LINE Notify deprecated |
| `menu.php` | navbar template | — | ✅ มี navbar |
| `index.php` (member root) | landing redirect | — | ✅ มี `/dashboard` |

### Cargo / Shop Order (ฝากสั่ง)
| PHP file | ทำอะไร | ตาราง | Port status |
|---|---|---|---|
| `shops.php` (165KB!) | ค้น/วาง URL/เพิ่มสินค้าเข้า cart, checkout, promotion | `tb_cart`, `tb_header_order`, `tb_order`, `tb_promotion` | ✅ ครบ (cart, add, checkout, promo schema มี) |
| `cart.php` | ดู/แก้ cart | `tb_cart` | ✅ ครบ |
| `convertURL.php` (1537 LOC) | scrape 1688/Taobao/Tmall เป็น product metadata | — | ✅ ที่ `/api/china-search?mode=url` |
| `search.php` (444 LOC) | keyword search products | `tb_keyword_product`, `tb_product` | ✅ ที่ `/api/china-search?mode=keyword` |
| `printShop.php` (25KB) | PDF ใบเสร็จ shop order via mPDF | `tb_header_order`, `tb_order` | 🔴 ไม่มี |

### Forwarder / Service Import (ฝากนำเข้า)
| PHP file | ทำอะไร | ตาราง | Port status |
|---|---|---|---|
| `forwarder.php` (211KB) | สร้าง/แก้ forwarder + rate engine | `tb_forwarder`, `tb_forwarder_item`, `tb_forwarder_img`, `tb_rate_*` | ✅ ครบ (rate engine + waterfall + tier + juristic 1% + service fee) |
| `forwarder-table.php` | flat list | `tb_forwarder` | ✅ มี at `/service-import` |
| `invoiceF.php` | invoice via mPDF | — | 🟡 HTML print only (Ctrl+P), no real PDF |
| `printReceiptF.php` (31KB) | receipt via mPDF | — | 🟡 HTML print only |
| `receipt-f-hs.php` | history list | — | ✅ ที่ `/service-import/receipts` |

### Wallet / Payment (กระเป๋า / ฝากโอน)
| PHP file | ทำอะไร | ตาราง | Port status |
|---|---|---|---|
| `wallet.php` (57KB) | หน้ารวม wallet | `tb_wallet`, `tb_wallet_hs` | ✅ รวม 4 variants เป็น 1 ที่ `/wallet/*` |
| `wallet-credit.php` | credit balance view | `tb_credit` | ✅ รวมที่ `/wallet/history` |
| `wallet-normal.php` | normal balance view | `tb_wallet` | ✅ |
| `wallet-notblank.php` | filter blank rows | — | ✅ |
| `payment.php` (56KB) | ฝากโอนเงินหยวน (Alipay) | `tb_payment` | ✅ ที่ `/service-payment/*` |
| `pay.php` | confirm payment | `tb_payment` | ✅ |

### Address (ที่อยู่)
| PHP file | ทำอะไร | ตาราง | Port status |
|---|---|---|---|
| `address.php` | CRUD ที่อยู่ลูกค้า + default | `tb_address`, `tb_address_main` | ✅ ครบ |
| `china-address.php` (2KB) | list ที่อยู่โกดังจีน (สำหรับลูกค้า copy ติดสลาก) | static | 🔴 ไม่มี |

### Sales Referral (ระบบเซลล์/แนะนำ)
| PHP file | ทำอะไร | ตาราง | Port status |
|---|---|---|---|
| `user-sales.php` | dashboard ทีม | `tb_user_sales`, `tb_user_sales_pay` | 🟡 view มี |
| `report-user-sales.php` | รายงาน commission | — | 🟡 history มี |
| `report-user-sales-add.php` (18KB) | ฟอร์มยื่นเคลม sales referral พร้อม slip upload | — | 🔴 ไม่มี |
| `report-user-sales-history.php` | history list | — | ✅ ที่ `/sales/history` |

### Notifications
| PHP file | ทำอะไร | ตาราง | Port status |
|---|---|---|---|
| `line-notify.php` (10KB) | LINE Notify push (EOL'd 2025-04) | `tb_users.userLineNotify` | ⚪ ใช้ LINE Messaging API แทน — backend มี |
| `line.php` (5KB) | LINE Login + LIFF | — | ⚪ skipped (Pacred ใช้ LINE OA) |
| `line-notify-admin.php` | admin LINE channel | — | ⚪ skipped |
| `mail.php` (5KB) | send email via PHPMailer | — | ⚪ ใช้ Supabase email/Resend แทน |

### Misc
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `map.php` (3KB) | Google Maps embed | 🔴 ไม่มี |

## B2. Admin-side PHP modules (~179 active files)

### G1 — Identity & RBAC
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `admin-profile.php`, `add-admin.php`, `account-settings.php` | manage admins | ✅ at `/admin/admins` + `/admin/hr/employees` |
| `users.php`, `users-search.php` | manage customers | ✅ at `/admin/customers` |

### G2 — Accounting & Ledger (7 ไฟล์)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `acc-forwarder.php` | dashboard บัญชีฝากนำเข้า | 🔴 ไม่มี |
| `acc-payment.php` | dashboard บัญชีฝากโอน | 🔴 ไม่มี |
| `acc-shop.php` | dashboard บัญชีฝากสั่ง | 🔴 ไม่มี |
| `acc-shop-refund.php` | คืนเงิน shop order | 🔴 ไม่มี |
| `acc-system-cargo.php` | บัญชีรวม Pacred | 🔴 ไม่มี |
| `acc-topup.php` | dashboard topup wallet | 🔴 ไม่มี |
| `acc-withdraw.php` | dashboard withdraw wallet | 🔴 ไม่มี |

### G3 — Forwarder Operations (13 ไฟล์)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `forwarder.php` (admin) | จัดการ shipment master | 🟡 มีที่ `/admin/forwarders/[fNo]` แต่ workflow ขาด |
| `forwarder-action.php` | bulk status update | 🔴 ไม่มี |
| `forwarder-search.php` | search advanced | 🔴 ไม่มี (เฉพาะ basic) |
| `forwarder-search-muti.php` | multi-criteria search | 🔴 ไม่มี |
| `forwarder-bill.php` | invoice matching | 🔴 ไม่มี |
| `forwarder-check.php` | verify items | 🔴 ไม่มี |
| `forwarder-driver.php` | assign driver | 🔴 ไม่มี |
| `forwarder-driver-w.php` | driver workspace | 🔴 ไม่มี |
| `forwarder-sale.php` | commission per forwarder | 🔴 ไม่มี |
| `forwarder-quotation.php` | quotation system | 🔴 ไม่มี |
| `forwarder-import-warehouse.php` | warehouse inventory | 🔴 ไม่มี |
| `forwarder-import-warehouse2.php` | warehouse v2 | 🔴 ไม่มี |

### G4 — Shop Order Operations (admin)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `shops.php` (admin) | คีย์ออเดอร์แทนลูกค้า | 🟡 list มี edit/bulk action ขาด |
| `cart.php` (admin) | view all carts | 🔴 ไม่มี |
| `shopping-return.php` | refund | 🔴 ไม่มี |

### G5 — Wallet/Payment Operations (admin)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `wallet.php` (admin) | approve topup slips | 🟡 list มี approve UI ขาด |
| `payment.php` (admin) | Alipay payout | 🟡 list มี approve UI ขาด |
| `pay-users.php` | payout users | 🔴 ไม่มี |
| `gateway.php`, `gateway-prepare.php` | payment gateway setup | 🔴 ไม่มี (ไม่ต้องการ — ใช้ PromptPay เป็นหลัก) |

### G6 — Barcode (9 ไฟล์)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `barcode-c-all.php`, `barcode-c-from.php`, `barcode-c-import.php`, `barcode-c-import2.php`, `barcode-c-prepare.php` | scan รับสินค้าเข้าโกดัง | 🔴 ไม่มี (stub at `/admin/barcode`) |
| `barcode-d-all.php`, `barcode-d-from.php`, `barcode-d-import.php`, `barcode-d-prepare.php` | driver scan ก่อนส่งของ | 🔴 ไม่มี |

### G7 — API Integrations (8 ไฟล์)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `api-forwarder-cn.php` | sync ไป China warehouse | 🔴 ไม่มี |
| `api-forwarder-jmf.php` | sync ไป JMF carrier | 🔴 ไม่มี |
| `api-forwarder-ttp.php` | sync ไป TTP carrier | 🔴 ไม่มี |
| `api-sheets-ctt.php`, `api-sheets-mk.php`, `api-sheets-mx.php`, `api-sheets-sang.php` | Google Sheets sync rates | 🔴 ไม่มี |

### G8 — Cron / Automation
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `api/autorun/check-apprentice.php` | auto-check ใหม่ | 🔴 |
| `api/autorun/send-line-sales.php` | send LINE ขาย | 🔴 |
| `api/autorun/update-active-customers.php` | update active status | 🔴 |
| `api/autorun/update-sheet-sang.php` | sync sheet | 🔴 |
| auto-cancel orders | — | ✅ ที่ `/api/cron/auto-cancel-orders` |

### G9 — Rate Management
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `rate.php`, `rate-vip.php` | edit rates | 🟡 schema มี (`rate_general`, `rate_vip`, `rate_custom_*`) — admin UI ขาด |
| `settings.php`, `settings-vip.php` | edit settings | 🟡 `/admin/settings` minimal |

### G10 — Reports (30+ ไฟล์)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `report-driver-*`, `report-forwarder-*`, `report-shop-*`, `report-sale-*`, `report-payment-*`, `report-system-*`, `report-OTP-*`, `report-SMS-*`, `report-promo-*` | datatable + date filter | 🔴 stub ที่ `/admin/reports` |
| `closingAccReportForwarder.php` | closing report | 🔴 |

### G11 — Containers
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `cnt.php`, `cnt-hs.php`, `hs-customrate.php`, `report-cnt.php` | container tracking + HS rates | 🟡 schema (`containers`) มี — UI list มี, workflow ขาด |

### G12 — Commission Withdraw
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `withdraw-commission-sale.php` | จ่ายค่าคอมเซลล์ | 🟡 schema (`sales_payouts`) มี — UI partial |
| `withdraw-commission-interpreter.php` | จ่ายล่าม | 🟡 |

### G13 — Customer Management
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `users.php`, `users-search.php` | manage customers | ✅ |
| `transferSalesCustomers.php` | ย้าย sales เจ้าของ | 🔴 |
| `pay-users.php` | pay users | 🔴 |

### G14 — Org/HR (ของเดิม)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `organization-chart.php`, `organization-*.php` | org chart | ✅ ทำใหม่ดีกว่าเดิมที่ `/admin/hr/org-chart` |
| `time-attendance-system.php` | TAS | ✅ ที่ `/admin/hr/attendance` |
| `booking-meeting-room.php` | จองห้อง | 🔴 ไม่ทำ (low priority) |
| `post-job.php` | ลงประกาศ | ✅ ที่ `/admin/hr/recruitment` |
| `contact-list-outsider.php` | external contacts | 🔴 ไม่ทำ |

### G15 — PDF Print (mPDF)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `printShop.php`, `printReceiptF.php`, `invoiceF.php`, `create-f-receipt.php`, `exampleReceiptF.php`, `exampleSummaryF.php` | mPDF receipts | 🟡 HTML @media print only — ต้อง port เป็น `@react-pdf/renderer` |

### G16 — Notifications (admin)
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `notify.php` | cross-DB push (WP) | ⚪ skip (WP จะถูก replace) |
| `popup.php`, `mail.php`, `get-token-linenotify.php` | admin notify config | 🔴 ไม่มี (LINE OA แล้ว) |

### G17 — Validation utils
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `check-juristic.php`, `check-customer-*`, `check-shipby`, `check-payMethod`, `check-price-flash` | validators | 🟡 บางส่วน in Zod schemas |

### G18 — Bulk Import
| PHP file | ทำอะไร | Port status |
|---|---|---|
| `import-excel.php`, `single-code-text-converter.php` | CSV import | 🔴 ไม่มี |

## B3. Helper functions (`include/function.php` 183KB, ~86 ฟังก์ชัน)

> Helpers ส่วนใหญ่ port ไปแล้วในรูป Zod schema + TypeScript utility — แต่บางอันยังขาด

### ✅ Port แล้ว
- Date/time formatters Thai → `Intl.DateTimeFormat("th-TH")` (built-in)
- `nameShipBy()`, `nameProductsType()` etc → enums + label maps in TS
- `optionHShipBy*()`, `optionFShipByCart()` → select options in components
- `calPriceForwarderSumCompany()` → [`lib/forwarder/calc-price.ts`](../lib/forwarder/calc-price.ts)
- `clearCreditBalance()` → ไม่ใช้แล้ว (wallet trigger ทำเอง)
- `statusOrderBadge()`, `statusForwarder*()` → badge components
- `send_sms()` → [`lib/sms/`](../lib/sms/)
- `lineNotify*()` → [`lib/notifications/`](../lib/notifications/) (ใช้ LINE Messaging API แทน)
- `sendMail()` → Supabase email / Resend
- Phone formatters → [`lib/utils/phone.ts`](../lib/utils/phone.ts)

### 🔴 ยังไม่ port (ถ้าจำเป็น)
- `ReadNumber()` — แปลงเลขเป็นคำพูดภาษาไทย (สำหรับใบเสร็จ "หนึ่งร้อยยี่สิบบาทถ้วน") — **ต้องการสำหรับ PDF receipt**
- `chProhNo()`, `chProhF()`, `tagPro()` — promo helpers (ขึ้นกับ promotion module)
- `convertIMGCHN()` — proxy China images (ถ้าโดน block)

## B4. Database — PHP มี ~110 tables, Pacred รวมเหลือ ~40 tables

ตารางที่ PHP มีแต่ Pacred รวม/ตัด:
- `tb_users` + 25 columns → `profiles`
- `tb_users_otp_*` (4 ตาราง) → `otp_codes`
- `tb_pcs_logged` → ไม่ใช้ (Supabase JWT)
- `tb_corporate` → `corporate`
- `tb_address` + `tb_address_main` + `tb_address_maomao_free` + `tb_admin_address` → `addresses` (รวมเป็น 1)
- `tb_wallet` + `tb_wallet_hs` + `tb_cash_back` + `tb_cash_back_hs` + `tb_credit` → `wallet` + `wallet_transactions` (รวมเป็น 2)
- `tb_payment` + `tb_wallet_paydeposit` → `yuan_payments` + `wallet_transactions`
- `tb_header_order` + `tb_order` → `service_orders` + `service_order_items`
- `tb_promotion` → `promotions` + `promotion_applications`
- `tb_forwarder` + `tb_forwarder_item` + `tb_forwarder_img` + `tb_log_forwarder_status` → `forwarders` + items + images + status_log
- `tb_rate_g_*` + `tb_rate_vip_*` + `tb_rate_custom_*` + `tb_co` → `rate_general` + `rate_vip` + `rate_custom_user` + `rate_custom_hs`
- `tb_user_sales` + `tb_user_sales_pay` + `tb_user_sales_admin_pay` → `team_leaders` + `sales_commissions` + `sales_payouts`
- `tb_notify` + `tb_notify_read` → `notifications` + `notification_reads`
- `tb_admin` + `tb_organization_*` → `admins` + `org_branches` + `org_sections` + `org_positions` + `org_assignments`
- `tb_settings` → `settings`
- `tb_api_china_hs` → ใช้ `/lib/china-search/` (ไม่ต้องตาราง)
- `tb_product` + `tb_keyword_product` + `tb_history_key` → ไม่ใช้ (search API ทำงาน live)
- `wp_*` → ไม่ port (WordPress)
- `tb_csvimport` → ไม่ใช้ (จะใช้ Supabase Storage แทน)

## B5. External integrations

| Service | PHP ใช้ | Pacred |
|---|---|---|
| ThaiBulkSMS | `include/sms.class.php` + helpers | ✅ [`lib/sms/`](../lib/sms/) (OTP_BYPASS=true ตอน dev) |
| LINE Notify | `line-notify.php` | ⚪ EOL → ใช้ LINE Messaging API แทน — `lib/notifications/index.ts` |
| LINE Login | `line.php` | 🟡 mocked button, channel TBD |
| Facebook OAuth | `fb-callback.php` | ✅ via Supabase Auth |
| Google OAuth | — | ✅ via Supabase Auth (ใหม่) |
| Google Sheets API | `api-sheets-*.php` | 🔴 ไม่มี (admin rate sync) |
| DBD juristic lookup | `check-juristic.php` | 🟡 manual entry now |
| AkuCargo + RCGroup-TH | search APIs | ✅ at [`lib/china-search/`](../lib/china-search/) |
| PromptPay QR | `assets/js/promptpay.js` | ✅ at [`lib/promptpay.ts`](../lib/promptpay.ts) |
| mPDF | PDF receipts | 🔴 ไม่ใช้ → ต้องใช้ `@react-pdf/renderer` |
| PHPMailer | email | ⚪ ใช้ Supabase email/Resend |
| JMF / TTP / CN carrier APIs | admin sync | 🔴 ไม่มี |

---

# Part C — Gap Analysis (สิ่งที่ขาด)

## C1. Customer-facing gaps (เรียงตาม impact)

| # | Gap | PHP file | impact | est hours |
|---|---|---|---|---|
| C-1 | `/profile` edit form (ฟอร์มแก้ชื่อ-นามสกุล-อีเมล-เบอร์) | `profile.php` | **HIGH** | 2-3h |
| C-2 | `/service-order/[hNo]/receipt` (PDF ใบเสร็จ shop order) | `printShop.php` | **MEDIUM** | 3-4h |
| C-3 | `/sales/report/add` (ฟอร์มยื่นเคลม sales referral) | `report-user-sales-add.php` | **MEDIUM** | 2-3h |
| C-4 | `/profile/security/change-phone` (OTP เปลี่ยนเบอร์ post-login) | `verify-tel.php` | **MEDIUM** | 2-3h |
| C-5 | `/service-import/warehouse-addresses` (PCS warehouse addresses จีน) | `china-address.php` | **LOW** | 1h |
| C-6 | Cart counter ที่ navbar (38/151) | — | LOW | 30 min |
| C-7 | PDF เป็น actual PDF (`@react-pdf/renderer`) แทน HTML print | `printReceiptF.php`, `invoiceF.php` | **HIGH** (ทำดีๆ ครั้งเดียว ใช้ทุกที่) | 8-12h |
| C-8 | `/contact` form submit action | — | LOW | 1h |
| C-9 | Google Maps in `/addresses` (autocomplete) | `map.php` | LOW | 3h |

## C2. Admin operational gaps (เรียงตาม impact)

### Critical for launch (P0)
| # | Gap | PHP source | impact | est hours |
|---|---|---|---|---|
| A-1 | `/admin/forwarders/[fNo]` workflow buttons (move pending→shipped→delivered, assign driver) | `forwarder.php`, `forwarder-action.php`, `forwarder-driver.php` | **CRITICAL** | 6-8h |
| A-2 | `/admin/service-orders/[hNo]` edit + mark payment + issue receipt | `shops.php` (admin), `shopping-return.php` | **CRITICAL** | 6-8h |
| A-3 | `/admin/wallet` approve/reject deposit slips (UI + audit) | `wallet.php` (admin) | **CRITICAL** | 4-6h |
| A-4 | `/admin/yuan-payments` approve/mark-completed (UI + audit) | `payment.php` (admin), `pay-users.php` | **CRITICAL** | 4-6h |
| A-5 | `/admin/customers/[id]` edit + approve/suspend inline | `users.php` | **CRITICAL** | 4-6h |
| A-6 | `/admin/juristic-check` doc viewer + approve/reject | `check-juristic.php` | HIGH | 4-6h |

### Important (P1)
| # | Gap | PHP source | impact | est hours |
|---|---|---|---|---|
| A-7 | `/admin/accounting` full dashboard (7 sub-tabs) | `acc-*.php` (7 files) | HIGH | 12-16h |
| A-8 | `/admin/reports` core reports (driver/forwarder/shop/sale/payment) | `report-*.php` (~30 files) | HIGH | 16-20h (subset) |
| A-9 | `/admin/settings` real edit UI (rate, fees, channels) | `settings.php` | HIGH | 4-6h |
| A-10 | `/admin/team-leaders` edit commission + view team | — | MEDIUM | 4-6h |
| A-11 | `/admin/sales-payouts` approve/mark-paid actions | `withdraw-commission-*.php` | MEDIUM | 3-4h |
| A-12 | `/admin/containers` link forwarders + ETA update | `cnt.php`, `cnt-hs.php` | MEDIUM | 6-8h |
| A-13 | `/admin/forwarders` advanced search + bulk status update | `forwarder-search.php`, `forwarder-action.php` | MEDIUM | 6-8h |

### Operations (P2)
| # | Gap | PHP source | impact | est hours |
|---|---|---|---|---|
| A-14 | `/admin/barcode` scan receive (warehouse) | `barcode-c-*.php` (5 files) | MEDIUM | 12-16h |
| A-15 | `/admin/barcode/driver` scan dispatch | `barcode-d-*.php` (4 files) | MEDIUM | 8-12h |
| A-16 | `/admin/rates` rate edit UI (general + VIP + custom) | `rate.php`, `rate-vip.php` | MEDIUM | 8-12h |
| A-17 | `/admin/customers/[id]/transfer-rep` reassign sales rep | `transferSalesCustomers.php` | LOW | 2-3h |
| A-18 | Bulk import (CSV → Storage → process) | `import-excel.php` | LOW | 6-8h |

### Integrations (P3)
| # | Gap | PHP source | impact | est hours |
|---|---|---|---|---|
| I-1 | Google Sheets sync (rate import/export) | `api-sheets-*.php` | LOW | 8-12h |
| I-2 | JMF carrier API integration | `api-forwarder-jmf.php` | LOW | 8-16h |
| I-3 | TTP carrier API integration | `api-forwarder-ttp.php` | LOW | 8-16h |
| I-4 | China warehouse API | `api-forwarder-cn.php` | LOW | 8-12h |
| I-5 | Auto cron jobs: send-line-sales, update-active-customers | `api/autorun/*` | LOW | 4-6h each |

---

# Part D — แผนปฏิบัติงาน (Priority Phases)

## 🚨 Phase P0 — Pre-Launch Critical (ต้องเสร็จก่อน launch beta)

**เป้าหมาย:** ระบบลูกค้า + admin operations ทำงานครบ end-to-end

| Task | ผู้รับผิดชอบ | Acceptance |
|---|---|---|
| C-1 Profile edit form | ปอน | บันทึก first/last name + email + phone ได้ + validation |
| C-7 PDF receipt @react-pdf | เดฟ | forwarder receipt PDF download ทำงาน + Thai font (Sarabun) |
| A-1 Forwarder admin workflow | ภูม | กดเปลี่ยน status ได้ + audit log + LINE notify ลูกค้า |
| A-2 Service order admin edit | ภูม | แก้ items/price + mark payment ได้ + audit |
| A-3 Wallet approve UI | ภูม | approve/reject slip + balance อัพเดท + notify |
| A-4 Yuan payment approve UI | ภูม | approve/mark-completed + notify |
| A-5 Customer edit + approve inline | ภูม | edit profile + approve/suspend + audit |
| A-6 Juristic check doc viewer | ภูม | view doc + approve/reject + status change |

**เวลารวมประมาณ:** 35-50 ชม. → 1-1.5 สัปดาห์ทำเต็มเวลา

## 🟡 Phase P1 — Beta operations (เสร็จภายใน 2-3 สัปดาห์หลัง launch)

| Task | ผู้รับผิดชอบ | Acceptance |
|---|---|---|
| C-2 PDF shop order receipt | ปอน | print PDF ได้เหมือน forwarder |
| C-3 Sales claim form | ปอน | submit form + upload slip + admin queue |
| C-4 Phone change OTP | ปอน | OTP ส่ง + verify + update phone |
| A-7 Accounting dashboard | ภูม | 7 tabs (acc-forwarder/payment/shop/refund/system/topup/withdraw) ทำงานครบ |
| A-8 Reports core (top 5) | ภูม | report driver/forwarder/shop/sale/payment + date filter + export CSV |
| A-9 Settings edit UI | เดฟ | edit yuan_rate + service_fee + notification toggles |
| A-10 Team leaders edit | เดฟ | edit commission % + view team members |
| A-11 Sales payouts actions | เดฟ | approve/mark-paid + notify |
| A-12 Containers workflow | เดฟ | link forwarders + update ETA + status workflow |
| A-13 Forwarder bulk + search | ภูม | multi-criteria search + bulk status update |

**เวลารวมประมาณ:** 65-90 ชม. → 2-3 สัปดาห์

## 🟢 Phase P2 — Operations excellence (เสร็จภายใน 1 เดือน)

| Task | ผู้รับผิดชอบ |
|---|---|
| A-14 Barcode receive | ภูม |
| A-15 Barcode dispatch (driver) | ภูม |
| A-16 Rate management UI | เดฟ |
| A-17 Transfer sales rep | เดฟ |
| A-18 Bulk CSV import | เดฟ |
| C-5 China warehouse addresses | ปอน |
| C-6 Cart counter at navbar | ปอน |
| C-8 Contact form action | ปอน |
| C-9 Google Maps in addresses | ปอน (low pri) |

## ⚪ Phase P3 — Integrations (ค่อยทำหลัง launch มั่นคง)

| Task | ผู้รับผิดชอบ |
|---|---|
| I-1 Google Sheets sync | เดฟ |
| I-2-4 Carrier APIs (JMF/TTP/CN) | เดฟ |
| I-5 Auto cron jobs | เดฟ |

---

# Part E — แผนงานต่อคน (Per-Dev Assignment)

## 👤 ปอน (podeng) — Customer UI/UX Polish

**Strength:** customer-facing UI/UX (จากประวัติ commits — pricing, banners, knowledge base, reviews, home redesign, booking calculator, profile)

### Sprint 1 (P0)
- [ ] **C-1** `/profile` — สร้าง edit form
  - File: `app/[locale]/(protected)/profile/profile-form.tsx` (มีไฟล์อยู่แล้ว — ขยาย)
  - Field: first_name, last_name, email, phone (phone editable แต่ต้องผ่าน OTP — link ไป C-4)
  - Server action: `updateProfileBasic()` ใน `actions/profile.ts` (มีแล้ว)
  - Acceptance: บันทึกแล้ว `router.refresh()` แสดงค่าใหม่ + toast success + validate phone ตาม `lib/utils/phone.ts`

### Sprint 2 (P1)
- [ ] **C-2** `/service-order/[hNo]/receipt` — PDF shop order receipt
  - **ต้องรอ C-7 (เดฟทำ @react-pdf base) เสร็จก่อน** แล้ว reuse component
  - Layout: ใช้ template เหมือน `printShop.php` (PCS-style — header logo, table items, totals, ผู้รับผิดชอบ)
  - URL pattern: `/service-order/[hNo]/receipt` → render PDF inline
  - Acceptance: ปุ่ม "พิมพ์ใบเสร็จ" ที่ `[hNo]/page.tsx` → เปิด tab ใหม่ download PDF ได้

- [ ] **C-3** `/sales/report/add` — ฟอร์มยื่นเคลม referral
  - Schema: เพิ่ม column ใน `sales_commissions` หรือสร้างตารางใหม่ `sales_claims` (status: pending/approved/rejected)
  - Form: select order (จาก dropdown ลูกค้าที่ referral) + reason + upload slip
  - Server action: `createSalesClaim()` ใน `actions/sales.ts`
  - Acceptance: submit แล้วเข้า queue ฝั่ง admin → admin ใน `/admin/sales-payouts` ดูได้

- [ ] **C-4** `/profile/security/change-phone` — เปลี่ยนเบอร์ post-login
  - Flow: input เบอร์ใหม่ → ส่ง OTP → verify → update
  - Server actions: ใช้ `requestOtp()` + `verifyOtp()` ใน `actions/otp.ts` ที่มีอยู่
  - Acceptance: เปลี่ยนเบอร์เสร็จ → profile update + log ใน audit

### Sprint 3 (P2)
- [ ] **C-5** `/service-import/warehouse-addresses` — list ที่อยู่โกดังจีน
  - Static page เป็นหลัก — เพิ่ม dynamic addresses จาก settings table (key: `china_warehouses`)
  - Layout: card per warehouse (Guangzhou, Yiwu, Bangkok, etc.) + copy-to-clipboard button + print
  - Acceptance: ลูกค้ากด copy → clipboard มีที่อยู่ + ปุ่ม "พิมพ์สลาก" → A4 print

- [ ] **C-6** Cart counter ที่ navbar
  - File: `components/sections/navbar.tsx` + `components/cart-bell.tsx` (สร้างใหม่)
  - Behavior: badge แสดงจำนวน items + click → `/service-order/cart`
  - Implementation: use `useSWR` หรือ server-fetch ใน server component
  - Acceptance: เพิ่ม cart item → badge เพิ่ม realtime (or on next nav)

- [ ] **C-8** `/contact` form submit
  - Server action: `submitContactForm(name, email, message)` → save to `contact_messages` table + email admin
  - Acceptance: form submit ได้ + success message + admin email/notification

- [ ] **C-9** Google Maps ใน `/addresses` (low pri)
  - Use `@vis.gl/react-google-maps`
  - Acceptance: autocomplete address + drop marker + reverse geocode

**Estimated total:** 13-18 ชม. → ~2 สัปดาห์ part-time

---

## 👤 ภูม (Poom) — Admin Operations

**Strength:** admin back office (จากประวัติ commit `75a3f3b` "add full admin back office system")

### Sprint 1 (P0 — บล็อกเกอร์ทั้งหมด)
- [ ] **A-1** `/admin/forwarders/[fNo]` workflow buttons
  - File: `app/[locale]/(admin)/admin/forwarders/[fNo]/update-form.tsx` (มีไฟล์ — ขยาย)
  - เพิ่มปุ่ม: เปลี่ยน status (pending_payment → shipped_china → in_transit → arrived_thailand → out_for_delivery → delivered) + cancel
  - Server action: `adminUpdateForwarderStatus(fNo, status)` ใน `actions/admin/forwarders.ts`
  - Trigger: เปลี่ยน status → write `forwarder_status_log` + send notification ลูกค้า (LINE + in-app)
  - Acceptance: status เปลี่ยน + log + ลูกค้า notify ภายใน 5 วินาที

- [ ] **A-2** `/admin/service-orders/[hNo]` edit + mark payment
  - File: สร้าง `update-form.tsx` ใน detail page
  - Field: items (qty, price, note), shipping address, payment received toggle
  - Server actions: `adminUpdateServiceOrder()`, `adminMarkPaymentReceived()`
  - Acceptance: ปรับ price → total updated + audit log + ลูกค้า notify

- [ ] **A-3** `/admin/wallet` approve/reject deposit slips
  - File: `app/[locale]/(admin)/admin/wallet/page.tsx` + เพิ่ม row actions
  - UI: คลิก slip thumbnail → modal preview → approve/reject buttons
  - Server action: `adminApproveWalletDeposit(txId, note?)`, `adminRejectWalletDeposit(txId, reason)`
  - Behavior: approve → status='completed' → trigger wallet recompute → notify
  - Acceptance: approve → balance ลูกค้าเพิ่มทันที + notify + log

- [ ] **A-4** `/admin/yuan-payments` approve/mark-completed
  - Similar pattern กับ A-3
  - Server action: `adminApproveYuanPayment(id)`, `adminMarkYuanCompleted(id, slip_url)`
  - Acceptance: approve + upload slip Alipay + ลูกค้า notify

- [ ] **A-5** `/admin/customers/[id]` edit + approve/suspend
  - File: `app/[locale]/(admin)/admin/customers/[id]/page.tsx`
  - เพิ่ม edit form (ใช้ Zod) + ปุ่ม approve/suspend (มี action ใน `actions/admin/customers.ts` แล้ว)
  - Acceptance: edit ได้ + approve/suspend ทำงาน + ดู wallet+orders+forwarders ของลูกค้าได้

- [ ] **A-6** `/admin/juristic-check` doc viewer
  - File: `app/[locale]/(admin)/admin/juristic-check/page.tsx`
  - UI: list pending juristic + click → modal doc preview (PDF/image) + approve/reject buttons
  - Server action: `adminApproveJuristic(profile_id)`, `adminRejectJuristic(profile_id, reason)`
  - Acceptance: approve → profiles.status='active' + corporate verified

### Sprint 2 (P1)
- [ ] **A-7** `/admin/accounting` — 7-tab dashboard
  - Tabs: ฝากนำเข้า / ฝากโอน / ฝากสั่ง / คืนเงิน / บัญชี Pacred รวม / topup / withdraw
  - Each tab: date range filter + summary card + transactions table + export CSV
  - Server actions: `accReportForwarder()`, `accReportPayment()`, etc. (รวมที่ `actions/admin/accounting.ts`)
  - Acceptance: ทุก tab แสดงตัวเลขถูก + export CSV ทำงาน + date filter ทำงาน

- [ ] **A-8** `/admin/reports` core 5 reports
  - Tab: report-driver / report-forwarder / report-shop / report-sale / report-payment
  - Each: filter (date range, status, agent) + datatable + export CSV/Excel
  - Acceptance: ทุก report query ถูก + export ได้

- [ ] **A-13** `/admin/forwarders` advanced search + bulk status
  - Multi-criteria: tracking number, customer, date range, status, weight range
  - Bulk: checkbox select rows → "change status to X" dropdown → confirm
  - Acceptance: search returns correct rows + bulk update ทำงาน + audit ทุก row

### Sprint 3 (P2)
- [ ] **A-14** `/admin/barcode` scan receive
  - Use HTML5 BarcodeDetector API หรือ `zxing-js`
  - Workflow: scan barcode → match forwarder_item → mark received → update status
  - Acceptance: scan ได้บนมือถือ + offline-friendly + bulk scan session

- [ ] **A-15** `/admin/barcode/driver` scan dispatch
  - Similar pattern — driver scans items before delivery
  - Acceptance: driver scan → status='out_for_delivery' + customer notify

**Estimated total:** 60-85 ชม. → ~3-4 สัปดาห์ part-time

---

## 👤 เดฟ (dave) — Infrastructure & Integrations + Coordination

**Strength:** lead — coordination + complex/cross-cutting features

### Sprint 1 (P0 — Most Critical)
- [ ] **C-7** PDF receipt infrastructure (`@react-pdf/renderer` + Thai font)
  - `pnpm add @react-pdf/renderer`
  - Setup: font registration (Sarabun ใน `public/fonts/sarabun-*.ttf`)
  - Create base component: `components/pdf/receipt-template.tsx`
  - Build first receipt: forwarder receipt (port จาก current HTML print)
  - URL pattern: `/service-import/[fNo]/receipt.pdf` → return PDF Response
  - Acceptance: download .pdf ได้ + font Thai render ถูก + layout เหมือน HTML version
  - **บล็อกเกอร์:** ปอนรอใช้ template นี้สำหรับ C-2

### Sprint 2 (P1 + coordination)
- [ ] **A-9** `/admin/settings` real edit UI
  - Form: yuan_rate, service_fee, china_warehouses (json), notification channels (email/LINE/SMS toggles)
  - Server actions: `adminUpdateSettings()` ใน `actions/admin/settings.ts`
  - Acceptance: edit ได้ + รี-render ทุกที่ที่ใช้ rate (dashboard, service-order, service-payment)

- [ ] **A-10** `/admin/team-leaders` edit commission + view team
  - Form: edit commission_percentage + view team members (profile list)
  - Server action: `adminUpdateTeamLeaderCommission(id, percent)`
  - Acceptance: edit % → ใช้กับ commission ใหม่ทันที (เก่าไม่กระทบ)

- [ ] **A-11** `/admin/sales-payouts` approve/mark-paid
  - UI: list pending payouts + click → modal (proof of payment upload) → approve
  - Server action: `adminApproveSalesPayout(id, slip_url)`, `adminMarkSalesPaid(id)`
  - Acceptance: approve → status='paid' + notify เซลล์ + log

- [ ] **A-12** `/admin/containers` workflow
  - Link forwarders/orders to container (multi-select)
  - Update ETA + status workflow (preparing → sealed → in_transit → arrived → delivered)
  - Server action: `adminUpdateContainer()`, `adminLinkForwardersToContainer()`
  - Acceptance: container ETA update → linked forwarders/orders แสดง "อยู่ในตู้ X (ETA Y)"

### Sprint 3 (P2/P3)
- [ ] **A-16** `/admin/rates` rate edit UI
  - 4 sub-tabs: general / vip / custom user / custom HS code
  - Inline editable table (ใช้ TanStack Table หรือ manual)
  - Acceptance: edit ได้ + revert + bulk import จาก CSV (link to A-18)

- [ ] **A-17** `/admin/customers/[id]/transfer-rep` reassign sales rep
  - Use existing `adminAssignSalesRep()` action (`actions/admin/admins.ts`)
  - UI: dropdown รายชื่อ sales_admin + confirm
  - Acceptance: ย้ายแล้ว + commission ใหม่ assign ให้ rep ใหม่

- [ ] **A-18** Bulk CSV import
  - Use Storage bucket `csv-imports/{user_id}/`
  - Background process (Edge Function หรือ Vercel cron)
  - Acceptance: upload CSV → preview → confirm → process + report errors

### Sprint 4 (P3 — Integrations — ไม่เร่ง)
- [ ] **I-1** Google Sheets sync (rates)
- [ ] **I-2** JMF carrier API
- [ ] **I-3** TTP carrier API
- [ ] **I-4** China warehouse API
- [ ] **I-5** Auto cron jobs

### Coordination tasks (ไม่ใช่ feature — เดฟดูทุกสัปดาห์)
- [ ] Code review PRs ของปอน + ภูม
- [ ] Merge เข้า main (ทำ release branches)
- [ ] Update `docs/PORT_PLAN.md` นี้ทุก sprint
- [ ] Monitor production logs + bug triage

**Estimated total:** 40-60 ชม. (ไม่รวม integrations) → ~2-3 สัปดาห์ part-time

---

# Part F — Workflow Rules (อ่านก่อนเริ่มทุกวัน)

## F1. Branch policy

```
main           ← เดฟ merge เข้าเท่านั้น (ผ่าน PR หรือ merge ตรง)
├── dave       ← เดฟใช้ branch หลัก
├── podeng     ← ปอนใช้
└── Poom       ← ภูมใช้
```

## F2. Daily sync (ก่อนเริ่มงาน ทุกวัน)

```bash
# 1. Sync main ก่อน
git checkout main
git pull origin main

# 2. Sync branch ตัวเอง + merge main เข้ามา
git checkout <my-branch>
git pull origin <my-branch>
git merge main
git push origin <my-branch>
```

→ ทำไม? ดู [CLAUDE.md](../CLAUDE.md#team--branch-workflow)

## F3. Pre-PR checklist

- [ ] `pnpm lint` ผ่าน
- [ ] `pnpm build` ผ่าน
- [ ] ทดสอบ feature ด้วย browser (golden path + 1-2 edge cases)
- [ ] ถ้ามี migration ใหม่ → เพิ่มที่ [supabase/migrations/README.md](../supabase/migrations/README.md)
- [ ] Update task ใน [docs/PORT_PLAN.md](PORT_PLAN.md) — change ☐ → ☑
- [ ] PR title ตาม commit convention: `feat(<scope>): <summary>`

## F4. Acceptance criteria — universal rules

**ทุก feature ต้อง:**
1. ✅ Server-side validation ผ่าน Zod
2. ✅ Audit log (`logAdminAction` สำหรับ admin actions)
3. ✅ Loading states ตอน pending
4. ✅ Error states + toast feedback
5. ✅ Mobile responsive (test ใน Chrome DevTools mobile mode)
6. ✅ Dark mode ทำงาน (test toggle)
7. ✅ i18n keys ทั้ง TH + EN (ถ้ามี user-facing text ใหม่)
8. ✅ Type-safe (no `any`, no `as never`)

## F5. Migration rules

- ทุก migration: `IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING`
- File name: `00XX_<descriptive>.sql` (ลำดับห้ามชน)
- รันใน Supabase Dashboard SQL Editor (copy-paste ทั้งไฟล์ — **อย่าใช้ `\i`**)
- update README.md
- บอกทีมใน commit message ว่า "ต้องรัน migration 00XX"

## F6. การ split task ระหว่าง dev

**ถ้าจะเริ่ม task ใหม่ที่ทับกับคนอื่น:**
1. โพสต์ใน LINE group ก่อนเริ่ม
2. ถ้า task ใหญ่กว่า 1 วัน → split เป็น sub-tasks เล็กๆ
3. ถ้าต้องแก้ schema → ปรึกษาเดฟก่อน (เพื่อหลีกเลี่ยง migration conflict)

---

# Part G — Migration Checklist (ต้องรันก่อน start dev)

ถ้าเครื่องไหนยังไม่อัพ Supabase production ให้รันตามลำดับ ผ่าน Supabase Dashboard → SQL Editor:

| ลำดับ | ไฟล์ | ต้องรันถ้า |
|---|---|---|
| 1 | [`schema.sql`](../supabase/schema.sql) | first time setup |
| 2-15 | `0002_*.sql` - `0015_*.sql` | ทุกอัน — ตามลำดับ |
| 16 | [`0016_phase_h_upgrades.sql`](../supabase/migrations/0016_phase_h_upgrades.sql) | Phase H base |
| 17 | [`0017_org_chart.sql`](../supabase/migrations/0017_org_chart.sql) | HR Phase 1 |
| 18 | [`0018_hr_employees.sql`](../supabase/migrations/0018_hr_employees.sql) | HR Phase 2a |
| 19 | [`0019_hr_recruitment.sql`](../supabase/migrations/0019_hr_recruitment.sql) | HR Phase 2b |
| 20 | [`0020_hr_attendance.sql`](../supabase/migrations/0020_hr_attendance.sql) | HR Phase 3a |
| 21 | [`0021_hr_learning_policies_audit.sql`](../supabase/migrations/0021_hr_learning_policies_audit.sql) | HR Phase 3b |

ดูรายละเอียดที่ [supabase/migrations/README.md](../supabase/migrations/README.md)

---

# Part H — Environment Variables ที่ต้องตั้ง

ดูที่ [`supabase/migrations/README.md`](../supabase/migrations/README.md#env-vars-production) ส่วน "Env vars" — เหมือนเดิม

**Production ต้องตั้งเพิ่ม (สำหรับ feature ใหม่):**
```
# LINE Messaging API (สำหรับ notification — แทน LINE Notify)
LINE_CHANNEL_ACCESS_TOKEN=<from LINE Developers Console>
LINE_CHANNEL_SECRET=<from LINE Developers Console>

# PDF font path (สำหรับ @react-pdf/renderer — ถ้า hosted)
PDF_FONT_PATH=public/fonts/

# Resend (email fallback)
RESEND_API_KEY=<from resend.com>
```

---

# Part I — Reference Links

## Documentation
- [docs/architecture.md](architecture.md) — full diagrams + DB schema + auth flows
- [supabase/migrations/README.md](../supabase/migrations/README.md) — migration runbook
- [CLAUDE.md](../CLAUDE.md) — project conventions + team workflow

## Code locations
- Customer pages: `app/[locale]/(protected)/`
- Admin pages: `app/[locale]/(admin)/admin/`
- Server actions: `actions/` + `actions/admin/`
- Validators: `lib/validators/`
- Supabase clients: `lib/supabase/`
- Auth: `lib/auth/`
- Migrations: `supabase/migrations/`

## PHP source (reference only — ไม่ต้องเปิดอ่านแล้ว)
- `D:\xampp\htdocs\pcscargo\member\` — customer files
- `D:\xampp\htdocs\pcscargo\member\pcs-admin\` — admin files
- `D:\xampp\htdocs\pcscargo\member\include\function.php` — 183KB helpers
- `D:\SQL\somedata-2026-03-19-1348-pcsc_main.sql` — schema dump (1.38MB — **อย่า `Read` ทั้งไฟล์ ใช้ Grep**)

---

# Part J — Open Decisions (รอเดฟตัดสิน)

| # | Decision | options | impact |
|---|---|---|---|
| D-1 | LINE Notify replacement provider | LINE Messaging API (default) / Resend email / Discord bot | F2 done — มีโครงสร้าง LINE Messaging แล้ว |
| D-2 | PDF library | `@react-pdf/renderer` (recommend) / Puppeteer SSR / `pdfkit` | C-7 |
| D-3 | Barcode scanner library | `zxing-js` / native BarcodeDetector / `quagga2` | A-14, A-15 |
| D-4 | Background job platform | Vercel Cron + Edge Functions / Supabase pg_cron / external (Inngest) | A-18, I-5 |
| D-5 | CSV import processing | client-side parse (Papa Parse) / server-side stream / edge function | A-18 |
| D-6 | Phase I (Pacred Ecosystem expansion) สิ่งที่ไม่มีใน PHP | ทำหลัง launch beta หรือพร้อมกัน | scope |

---

# Part K — Status Tracking

อัพเดทเลข % เมื่อทำเสร็จ:

| Phase | Status |
|---|---|
| HR module (Phase 1-3) | ✅ 100% (commits 039c5d9, 43d7101, 5387fb1, 253f031, 73cdafc) |
| Customer base (Phase B-F) | ✅ 95% (เหลือ C-1 to C-9) |
| Admin operations | 🟡 40% (เหลือ A-1 to A-18) |
| Admin reports/accounting | 🔴 10% (เหลือ A-7, A-8) |
| Integrations | 🔴 0% (I-1 to I-5) |

---

**Last update:** 2026-05-13 by Claude (Opus 4.7) on branch `claude/jolly-taussig-7132d7`
**Next review:** ทุก sprint (1 สัปดาห์)
**File maintained by:** เดฟ (เพิ่ม/แก้ตาม progress)
