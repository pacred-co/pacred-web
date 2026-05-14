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

---

# Part L — Merge State Snapshot (2026-05-13)

> หลัง merge main เข้า dave (commit `12dc7ae`) — เพื่อให้ทุกคน sync จาก main ได้คลีน

## L1. ที่ main นำเข้ามาเพิ่ม (อยู่ใน dave/main ตอนนี้)

### New admin pages (placeholder ส่วนใหญ่ — มาจาก ภูม branch `Poom`)
- `/admin/dashboard` (alternate dashboard — duplicate กับ `/admin/page.tsx`)
- `/admin/forwarder` + `/admin/forwarder/pending` (note: singular — duplicate กับ `/admin/forwarders/` plural)
- `/admin/freight/{air,sea,truck}` (placeholder)
- `/admin/inventory` (placeholder)
- `/admin/orders` + `/admin/orders/{import,shop,transfer,pending}` (placeholder)
- `/admin/payment` (placeholder)
- `/admin/rates` (placeholder)
- `/admin/wallet/deposit` (placeholder)
- `/admin/withdrawals` (placeholder)

### New customer pages (มาจาก ปอน branch `podeng`)
- `/how-to-use` — guide
- `/payment/{1688,alipay,taobao}` — landing pages
- `/services/import-china-{fcl,lcl}` — service detail pages
- `/services/customs-clearance` (updated)
- `/warehouses/{china,guangzhou,yiwu}` — warehouse info pages
- `/about` (updated)
- `/knowledge` (updated)

### New components
- `components/admin/admin-navbar.tsx` (orphan — เราใช้ AdminSidebar เดิม)
- `components/admin/admin-sidebar.tsx` (orphan — duplicate กับ `components/sections/admin-sidebar.tsx`)
- `components/booking/*` (booking calculator)
- `components/sections/clearance-{documents,faq,permits,process}.tsx`
- `components/sections/top-menu.tsx` (ใช้ใน navbar.tsx)

### New API routes
- `/api/dbd/[taxId]` — Department of Business Development lookup (Tax-ID verify)

## L2. ที่ตัดออก (ไม่ใช้)

- `supabase/migrations/0003_admin_role.sql` — เก่า (legacy `profiles.role`)
- `supabase/migrations/0004_full_system.sql` — duplicate schema (`wallets` plural, `exchange_rates`)
- `actions/admin-customers.ts` — legacy path (ใช้ `actions/admin/customers.ts` แทน)

## L3. งานทำความสะอาดที่ทิ้งให้ทีม

| # | Task | ความสำคัญ | เจ้าของ |
|---|---|---|---|
| L-1 | ตัด `/admin/dashboard` ออก หรือ redirect ไป `/admin` | medium | เดฟ |
| L-2 | ตัด `/admin/forwarder/*` (singular) → ใช้ `/admin/forwarders/*` (plural) | medium | ภูม |
| L-3 | รวม `/admin/orders/*` กับ `/admin/service-orders/*` ให้เป็นเส้นเดียว | high | ภูม |
| L-4 | ตัด `/admin/wallet/deposit` (mockup) → ใช้ flow ใน `/admin/wallet/page.tsx` | low | ภูม |
| L-5 | ลบ orphan components/admin/admin-{navbar,sidebar}.tsx ถ้าไม่ใช้ | low | เดฟ |
| L-6 | ตัดสินใจ: `/admin/freight/*` ทำต่อหรือลบ | medium | เดฟ (ปรึกษากับ Pacred ecosystem plan ใน CLAUDE.md) |
| L-7 | `/admin/rates`, `/admin/inventory`, `/admin/payment`, `/admin/withdrawals` ทุกอันยังเป็น stub — เลือก: รวมเข้า admin pages เก่าหรือ keep แล้วทำต่อ | low | ภูม |

## L4. State สำคัญหลัง merge

✅ **HR module** — ครบ 100% ยังทำงานได้  
✅ **Admin schema** — RBAC ผ่าน `admins` table (ไม่ใช้ profiles.role)  
✅ **Customer modules** — ครบ + ปอนเพิ่ม landing pages ใหม่  
🟡 **Admin pages duplicate** — ต้อง cleanup ตาม L1-L7 ก่อน production launch

**กติกาสำคัญ:** อย่าใช้ `profiles.role` ที่ไหนใหม่ — ใช้ `is_admin()` หรือ `admins` table queries เท่านั้น

---

# Part M — Audit Update 2026-05-13 (post-Poom-merge full sweep)

> **Scope:** อ่าน MD ทั้งหมดใน repo + กวาด PHP ที่ `C:\xampp\htdocs\pcscargo` (≈400+ ไฟล์) + เทียบกับ Next.js state ปัจจุบัน (post-merge `7a93cb5` บน `dave`)
> **เจอ gaps ใหญ่ที่ไม่อยู่ใน Part B/C/E** — บันทึกแยกใน Part M เพื่อ trace ง่าย จะค่อย integrate เข้า Part B/C/E ใน iteration ถัดไป

## M1. Branch + Code State (2026-05-13)

### Branches snapshot
| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `facd03a` | ก๊อตยังไม่ได้ merge งานล่าสุดของทีม |
| `dave` (local + remote) | `7a93cb5` | **มี Poom Sprint 1-3 + lint fix entity** |
| `origin/Poom` | `6f192e4` | A-7/8/13/14/15 + L-7 (รวมเข้า dave แล้ว) |
| `origin/podeng` | `facd03a` | ยังไม่มี commit ใหม่หลัง merge ก๊อต |

### Coverage หลัง merge
- ✅ **Customer modules:** auth, profile (view+edit), addresses, wallet, service-order, service-import, service-payment, sales, notifications, dashboard, knowledge, FAQ, holidays, contact (form pending), booking calculator
- ✅ **Admin Sprint 1-3:** A-1 ถึง A-15 ครบ (workflow buttons, approvals, accounting 7-tab, reports 5-tab, barcode scan + driver, advanced search + bulk)
- ✅ **HR module:** ครบ (employees, attendance, leaves, recruitment, training, policies, audit)
- 🟡 **complete-profile/page.tsx:** ยัง placeholder — OAuth new users ที่ profile ไม่ครบจะเจอหน้าว่าง (ดู `M2.5a`)
- 🟡 **3 React Compiler errors + 5 warnings** ใน `scan-form.tsx` ของภูม (อยู่ใน Poom branch — ภูมแก้บน Poom + dave จะ merge ใหม่)

## M2. ระบบที่พบใหม่จาก PHP audit (NOT in Part B)

### 🔴 M2.1 — Payment Gateway (Omise / 2C2P card payments)
**CRITICAL gap.** ไม่อยู่ใน plan เลย

**PHP source:** `pcs-admin/gateway.php`, `gateway-prepare.php`, `gatway-receipt-forwarder.php`

PHP รองรับ card payment (credit/debit) ผ่าน payment gateway — Pacred ปัจจุบันรองรับแค่:
- ✓ PromptPay QR (deposit only)
- ✓ Slip upload + admin manual approve

❌ ไม่มี:
- Card payment automated
- Realtime confirm
- Webhook ตอบกลับจาก gateway
- Refund automation

**Migration ที่ต้องเพิ่ม:**
- `payment_gateway_transactions` table — `id, profile_id, provider, provider_ref, amount, currency, status, raw_response, created_at, captured_at, refunded_at`
- `payment_gateway_webhooks_log` — audit incoming webhooks
- Update `wallet_transactions` / `service_orders` ให้ link กลับ gateway_tx

**Code ที่ต้องเพิ่ม:**
- `lib/payment-gateway/` — adapter layer (Omise / 2C2P / Stripe TH)
- `app/api/webhooks/payment-gateway/[provider]/route.ts` — webhook handler
- Server actions: `initiatePayment()`, `verifyPayment()`, `refundPayment()`
- UI integration: wallet deposit form + service-order checkout

**Estimated:** 40-60h (gateway adapter + webhook + UI + reconciliation + refund + test)
**Owner:** เดฟ (infra/integration) — รอ D-7 decision ก่อน

### 🔴 M2.2 — Payroll / Salary Module
**HR gap.** Current HR มี attendance/leaves/training/policies/audit แต่ **ไม่มี payroll**

**PHP source:** `pcs-admin/salary-hs.php`, `withdraw-commission-sale.php`, `withdraw-commission-interpreter.php`

**Migration:**
- `salary_components` — base/ot/bonus/deduction per employee
- `payroll_runs` — รอบจ่าย (monthly/biweekly)
- `payslips` — generated per employee per run
- Link กับ attendance_logs (วันทำงาน) + leave_requests (วันลา)

**Estimated:** 30-40h
**Owner:** ภูม (admin/HR) — รอ D-9 decision

### 🟡 M2.3 — Customer Bulk Transfer (personal → juristic)
**PHP source:** `pcs-admin/api/customers-move-to-juristic/index.php`

Bulk admin tool — เลือกหลายลูกค้าทีเดียวเปลี่ยน `account_type` (เช่นลูกค้าเปิดบริษัทใหม่)

**Estimated:** 4-6h
**Owner:** ภูม

### 🟡 M2.4 — HS (High-Section) Variants — DESIGN DECISION
**PHP source:** `hs-forwarder-invoice.php`, `salary-hs.php`, `post-job-hs.php`, `hs-customrate.php`, `receipt-f-hs.php`

PHP มี variant "HS" แยกออกจาก main flow — มี invoice, salary, job posting, rate, receipt แยก

**Decision needed (D-8):**
- (A) HS = product line แยก (เช่น VIP tier) → keep แยกใน Pacred
- (B) Deprecate → merge เข้า main flow + ใช้ tier ใน Pacred แทน *(recommend — Pacred = บริษัทใหม่ ออกแบบจากกระดาษเปล่าได้)*

**Owner decision:** Pacred owner + ก๊อต

### 🟡 M2.5 — Misc small items

| # | Item | PHP source | Impact | Est | Owner |
|---|---|---|---|---|---|
| M2.5a | **complete-profile form** | profile.php (incomplete users branch) | OAuth new users blocked | 5-6h | ปอน (C-0) |
| M2.5b | **Forwarder month-end closing** | closingAccReportForwarder.php | Accounting periodic close | 6-8h | ภูม |
| M2.5c | **Forwarder sale tracking** | forwarder-sale.php | Sales attribution | 4-6h | ภูม |
| M2.5d | **Driver work shifts** | forwarder-driver-w.php | HR/Ops shifts | 6-8h | ภูม (after payroll decision) |
| M2.5e | **Image search (reverse)** | searchIMG.php | UX nice-to-have | 6-8h | ปอน (low pri) |
| M2.5f | **Job flowchart viz** | jobFlowchart.php | HR doc viz | 4-6h | ปอน (low pri) |
| M2.5g | **CMS static admin pages** | businessPlan.php, corporateCulture.php, training-regulations.php | replace mPDF | 4-6h | เดฟ (MDX or Sanity decision) |
| M2.5h | **Recently imported customers cache** | recently-used-imported-customers.php | Admin UX | 2-3h | ภูม |

## M3. Helper functions ยังไม่ port (จาก include/function.php × 2)

| Helper | จาก | สำหรับ | Priority |
|---|---|---|---|
| `ReadNumber()` | customer | Thai number → text ("หนึ่งร้อยยี่สิบบาท") — สำหรับ PDF receipt | 🔴 HIGH (blocker for C-7/C-2) |
| `image_resize()` | admin | Server-side image scaling | 🟡 MED (upload optimization) |
| `flashRemoteArea()` | admin | Remote area surcharge calculation | 🟡 MED (pricing accuracy) |
| `calFlashPriceCBM/KG()` | admin | Flash sale variants | 🟢 LOW (promo specific) |
| `calPriceForwarderCostCNT()` | admin | Container-specific cost | 🟡 MED (container ops) |
| `getDatesFromRange()` | admin | Date range expansion | 🟢 LOW |
| `csvProductType()` | admin | CSV export format | 🟢 LOW |
| `breadcrumbAdmin()` | admin | Admin breadcrumbs | 🟢 LOW (UI helper) |
| `extractSubstringAdminID()` | admin | Parse admin ID | 🟢 LOW (one-off) |

## M4. ไฟล์ PHP ที่ลบทิ้งได้ (deprecated — ไม่ต้อง port)

### Customer side (43 ไฟล์ → deprecate ≥ 4)
- `forwarderBackUp.php` (3144 LOC older copy)
- `payment20231213.php` (1457 LOC backup)
- `20260311wallet.php` (849 LOC — verify ก่อนลบ ว่าใหม่กว่าหรือ A/B test)
- `wallet-notblank.php` (820 LOC — duplicate กับ wallet variants)

### Admin side (200+ ไฟล์ → deprecate ≈ 35)
- `*Old.php`, `*BackUp.php`, `* copy.php`, `*-test.php`
- `addmail-test.php`, `a-Test-*.php`, `test-*.php`, `testAPITTP.php`
- `forwarderBackUp.php` (admin)
- `payment20231213.php`
- `report-driver-2023.php` (เก่า)
- Time-bound promos: `user-pro1212.php`, `user-pro-valentine.php`, `report-pro-3-year-anniversary.php`, `oh-my-ghost`, `survey202306`
- Static skeletons: `blank.php`, `blank-new.php`, `code-templet.php`, `descriptionBTN.php`

## M5. Decisions ที่ยังต้องล็อค (รอ Stakeholder)

| # | Decision | Owner | Blocks |
|---|---|---|---|
| **D-7** | Payment Gateway provider — Omise / 2C2P / Stripe TH | เดฟ + Pacred owner | M2.1 implementation |
| **D-8** | HS variants — keep แยกหรือ merge เข้า tier | Pacred owner + ก๊อต | M2.4 design |
| **D-9** | Payroll — standalone module หรือ extend HR | ภูม + เดฟ | M2.2 design |
| D-2 | ✅ PDF library = `@react-pdf/renderer` | ล็อคแล้ว | C-7 unblocked |
| D-3 | ✅ Barcode = native `BarcodeDetector` + fallback | ล็อคแล้ว (ภูมเลือก) | A-14/15 done |
| D-4 | Background jobs — Vercel Cron (มีแล้ว) + Supabase pg_cron? | เดฟ | M2 cron items |
| D-5 | CSV import — server-side process or edge fn | เดฟ | A-18 |

## M6. Sprint 4 — Next Work Assignment (post-merge)

### 👤 ปอน (podeng) — Sprint 4
**Status:** `origin/podeng` == `origin/main` — ยังไม่มี commit ใหม่หลัง merge ก๊อต → เริ่มต่อได้ทันที

ลำดับงาน:
1. **🔴 NEW C-0** `/complete-profile/page.tsx` — รื้อ placeholder + สร้าง form จริง (5-6h)
   - Form: ถ้า personal → first/last/phone/sex/dob; ถ้า juristic → ส่งไปหน้า juristic register flow
   - Server action: `completeProfile()` ใน `actions/profile.ts`
   - Acceptance: OAuth user new → กรอกเสร็จ → `profile.status='active'` → redirect `/dashboard`
2. **C-3** Sales claim form (`/sales/report/add`) (2-3h)
3. **C-4** Phone change OTP (`/profile/security/change-phone`) (2-3h)
4. **C-5** China warehouse addresses (`/service-import/warehouse-addresses`) (1h)
5. **C-6** Cart counter navbar badge (30m)
6. **C-8** Contact form submit handler (1h)
7. **🟡 รอ:** C-2 PDF shop receipt — รอ C-7 + ReadNumber helper จากเดฟ
8. **🟢 Optional:** M2.5e (image search), M2.5f (job flowchart viz) — ถ้ามีเวลาเหลือ

**Estimated:** 13-18h → ~2 สัปดาห์ part-time

### 👤 ภูม (Poom) — Sprint 4
**Status:** Sprint 1-3 เสร็จเต็มที่ — มี lint cleanup ก่อน เพิ่มงานใหม่ได้

ลำดับงาน:
1. **🔴 cleanup-1** Fix 3 React Compiler errors + 5 warnings ใน `scan-form.tsx` (ดู ping message จาก dave) (2-3h)
2. **A-17** Transfer sales rep ownership (`/admin/customers/[id]/transfer-rep`) (2-3h) — re-assign ให้ภูม (เดฟอยู่กับ C-7)
3. **🆕 M2.3** Customer bulk transfer (personal→juristic) — `/admin/customers/bulk-transfer` (4-6h)
4. **🆕 M2.5b** Forwarder month-end closing report — `/admin/accounting/closing` (6-8h)
5. **🆕 M2.5c** Forwarder sale tracking — `/admin/forwarder-sales` (4-6h)
6. **🆕 M2.5h** Recently imported customers cache (admin UX) (2-3h)
7. **🟡 รอ design:** M2.2 Payroll, M2.4 HS variants, M2.5d Driver shifts (รอ decision D-8/D-9)

**Estimated:** 20-29h → 2-3 สัปดาห์ part-time

### 👤 เดฟ (dave) — Sprint 4 (self)
ลำดับงาน:
1. **🔴 helper-1** Port `ReadNumber()` Thai-num-to-text → `lib/utils/thai-number.ts` (2-3h) — blocker for C-2/C-7
2. **🔴 C-7** PDF receipt infrastructure (`@react-pdf/renderer` + Sarabun font) (8-12h) — blocker for C-2
3. **A-9** Settings edit UI (4-6h)
4. **A-10** Team leaders commission edit (4-6h)
5. **A-11** Sales payouts approve actions (3-4h)
6. **A-12** Containers workflow + ETA (6-8h)
7. **D-7 decision call** — Payment Gateway provider (กับ Pacred owner) — schedule meeting
8. **🆕 M2.1 design phase** — Payment gateway architecture (หลัง D-7 ล็อค) — design only, implementation Sprint 5+

**Estimated:** 29-41h → 3 สัปดาห์ part-time

### 👤 ก๊อต (main maintainer) — Sprint 4
1. **Review + merge** `dave` → `main` (Poom Sprint 1-3 + dave's lint fix + Part M audit)
2. **Review + merge** `Poom` (หลังภูม fix React Compiler) → `main`
3. **Schedule decision calls:**
   - D-7 Payment Gateway provider (กับ Pacred owner)
   - D-8 HS variants keep/merge
   - D-9 Payroll module scope
4. (optional) cleanup orphan claude branches `claude/*` หลัง confirm worktrees ปิดแล้ว

---

## M7. End-of-audit summary

> ⚠️ **PART M ถูก SUPERSEDE โดย Part N (2026-05-13 deep audit)** — Part M ใช้ method "ดูไฟล์มีอยู่ + lint pass" ซึ่งพลาด **silent degraded modes** จำนวนมาก เลขที่เคยบอกใน M7 (85%/75% etc.) **ไม่แม่นยำ** — ดู Part N สำหรับสภาพจริง

---

# Part N — Production-Readiness Deep Audit (2026-05-13, post-Poom-merge + post-podeng-merge)

> **Method:** 4 parallel deep-audit agents traced full code path (route → action → validator → DB → trigger → notification) for every feature, checked every `process.env.X`, compared with legacy PHP behavior. This is the **first audit ที่ลึกพอจะ ship ลูกค้าได้** — Part M เป็น file-existence audit ที่ตื้นเกินไป

## N1. Code state ตอนนี้

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `facd03a` | ก๊อตยังไม่ได้ merge งานใหม่ |
| `dave` (local + remote) | `9602e74` | **มี Poom Sprint 1-3 + ปอน i18n Phase 1-4a + lint fixes + Part M+N audit** |
| `origin/Poom` | `6f192e4` | merge เข้า dave แล้ว — ภูมเหลือแก้ scan-form.tsx React Compiler |
| `origin/podeng` | `4059ab0` | merge เข้า dave แล้ว — ปอนเหลือเริ่ม C-0/C-3/C-4 |

## N2. Real coverage (จาก deep audit, ไม่ใช่ "file-exists" audit)

| Domain | True % | สถานะ |
|---|---|---|
| **Customer portal** | **~65%** | Auth/profile/wallet ledger/addresses ok แต่ **OTP bypass / no forgot-password / complete-profile = stub / LINE login = stub / URL-paste demo mode / search broken / PromptPay QR broken** |
| **Admin back office** | **~80%** | Sprint 1-3 ภูมทำงานจริง แต่ **approveCustomer/suspendCustomer ไม่มี audit log + notification + ใช้ guard ผิด** + LINE bypass = ลูกค้าไม่ได้รับ notify |
| **HR module** | **~95%** | ครบ ขาด Payroll (M2.2) |
| **Infrastructure** | **~50%** | ขาด env vars 8 ตัว · ไม่มี payment gateway · ไม่มี Sentry · ไม่มี rate limit · ไม่มี CAPTCHA · ไม่มี CSP · console.log leak PII 7 จุด · file upload ไม่ validate size/MIME |
| **Phase I ecosystem (#1,#5-13)** | **~0%** | ยังไม่เริ่ม |

## N3. 🔴 CRITICAL BLOCKERS — ห้าม launch ลูกค้าก่อนแก้

### N3.1 — Silent degraded modes (ดูเหมือนทำงาน แต่ใช้งานจริงไม่ได้)
ประเภทอันตรายที่สุด — UI render ปกติ แต่ backend ทำงานในโหมด demo/bypass/mock เงียบๆ:

| # | Feature | Trigger | สิ่งที่ลูกค้าเห็น |
|---|---|---|---|
| 1 | **OTP registration** | `OTP_BYPASS=true` ใน .env.local | กรอก OTP อะไรก็ผ่าน — phone never verified → ลูกค้าปลอมเข้าได้ |
| 2 | **URL→cart converter** (1688/Taobao/Tmall) | `PACRED_RCGROUP_API_URL` unset | demo product ราคา ¥0 "Taobao Shop" — ลูกค้ากรอกราคาเอง สับสน |
| 3 | **Keyword search 1688** | `PACRED_TAMIT_API_URL` unset | yellow banner "API ไม่พร้อม" — search ใช้ไม่ได้ |
| 4 | **Image reverse search** | `PACRED_RCGROUP_API_URL` unset | banner "ไม่พร้อม" |
| 5 | **LINE push notification** | `LINE_PUSH_BYPASS` defaults true (ถ้า unset = bypass) + `LINE_CHANNEL_ACCESS_TOKEN` unset | console.log เท่านั้น — ลูกค้าไม่ได้รับแจ้งสถานะ order |
| 6 | **Email notification fallback** | `RESEND_API_KEY` unset | console.warn เท่านั้น — เมล์ไม่ส่งจริง |
| 7 | **DBD Tax-ID lookup** | DBD API down/rate-limited | silently shows "notfound" — ไม่บอกว่าเป็น API issue |
| 8 | **ThaiBulkSMS** | API key placeholder "YOUR_API_KEY" | return `missing_credentials` แต่ UI โชว์ error generic |

### N3.2 — Hard blockers (ใช้ไม่ได้เลย)

| # | Feature | สาเหตุ | Fix |
|---|---|---|---|
| 9 | **Wallet deposit QR** | `PROMPTPAY_ID` unset → throw error | set env var |
| 10 | **OAuth (Google/Facebook)** | ต้อง verify provider config ใน Supabase Dashboard | verify + test |
| 11 | **`/complete-profile`** | placeholder page (มีไฟล์แต่ไม่มี form จริง) | ปอนสร้าง C-0 |
| 12 | **`/forgot-password`** | ไม่มี page เลย | ปอนสร้าง (new task C-10) |
| 13 | **LINE login** | stub "coming soon" — กดแล้ว error | ตัดปุ่มออก หรือ build จริง |
| 14 | **Payment gateway (Omise/2C2P)** | ไม่มีโค้ดเลย | dave M2.1 (40-60h) |

### N3.3 — Code bugs (ใน admin actions ของภูม)

| # | Bug | File:Line | Severity |
|---|---|---|---|
| 15 | `approveCustomer()` ไม่ call `logAdminAction()` | `actions/admin/customers.ts:~103` | 🔴 audit gap |
| 16 | `suspendCustomer()` ไม่ call `logAdminAction()` | `actions/admin/customers.ts:~118` | 🔴 audit gap |
| 17 | `approveCustomer()` ใช้ `requireAdmin()` (any admin) — ควรเป็น `withAdmin(["ops"])` | same file | 🔴 RBAC weak |
| 18 | `suspendCustomer()` same | same | 🔴 RBAC weak |
| 19 | approve/suspend ไม่ call `sendNotification()` | same file | 🟡 customer ไม่รู้ว่าถูก approve |
| 20 | React Compiler errors 3 ตัวใน `scan-form.tsx` (line 130/142/151) | scan-form.tsx | 🟡 ภูม fix แล้วยังไม่ push |

## N4. Missing env vars — definitive list

| Var | ต้อง set เป็น | Feature ที่ break | Priority |
|---|---|---|---|
| `PACRED_RCGROUP_API_URL` | `https://rcgroup-th.com/api-china/get` (legacy) — verify endpoint pattern อาจต้องปรับ | URL→cart converter + image search | 🔴 P0 |
| `PACRED_TAMIT_API_URL` | `https://tamit-cloud.com/api-product/api-search` (legacy — verify ยัง alive) | Keyword search | 🔴 P0 |
| `PROMPTPAY_ID` | phone หรือ tax-id ของบริษัท Pacred | Wallet deposit QR | 🔴 P0 |
| `THAIBULKSMS_API_KEY` | real key (now placeholder "YOUR_API_KEY") | OTP send | 🔴 P0 |
| `THAIBULKSMS_API_SECRET` | real secret | OTP send | 🔴 P0 |
| `LINE_CHANNEL_ACCESS_TOKEN` | จาก Pacred LINE OA (channel access token) | LINE push notification | 🔴 P0 |
| `LINE_PUSH_BYPASS` | `false` (production) — ตอนนี้ default `true` = bypass | LINE notification actual delivery | 🔴 P0 |
| `RESEND_API_KEY` | จาก Resend account | Email fallback | 🟡 P1 |
| `RESEND_FROM` | `Pacred <noreply@pacred.co>` (เปลี่ยน domain ตามจริง) | Email from header | 🟡 P1 |
| `CRON_SECRET` | random secret | Protect cron endpoint | 🟡 P1 |
| `OTP_BYPASS` | `false` (production) — ตอนนี้ `true` ใน dev | OTP verification actually runs | 🔴 P0 |
| `OTP_PEPPER` | random 32-char string (ตอนนี้ placeholder) | OTP hash security | 🔴 P0 |
| `NEXT_PUBLIC_SITE_URL` | `https://pacred.co` (prod) — ตอนนี้ localhost:3000 | OAuth callbacks + notification links | 🔴 P0 |

## N5. Missing code (ที่เคยคิดว่ามี แต่จริงๆ stub/ขาด)

| Feature | สถานะ | Owner |
|---|---|---|
| `/complete-profile` form | **STUB** (placeholder text) | ปอน C-0 |
| `/forgot-password` | **MISSING** | ปอน C-10 (new) |
| `/profile/security/change-phone` (atomic auth.phone + profiles.phone) | **MISSING** | ปอน C-4 |
| `/service-order/[hNo]/receipt` PDF | **MISSING** (forwarder receipt มี แต่ shop ไม่มี) | ปอน C-2 (รอ C-7) |
| Payment gateway integration | **MISSING entire module** | dave M2.1 |
| `ReadNumber()` Thai number→text helper | **MISSING** | dave (blocker C-7/C-2) |
| Sentry / error tracking | **MISSING** | dave (new task D-11) |
| Rate limiting on Server Actions | **MISSING** (มีแค่ OTP per-phone 3/hr) | dave (new task D-12) |
| CAPTCHA / bot protection บน signup | **MISSING** | dave (new task D-13) |
| CSP / security headers | **MISSING** | dave (new task D-14) |
| File upload size/MIME server-side validation | **WEAK** (UI check only) | dave (new task D-15) |
| 4 PHP cron jobs ports: `send-line-sales`, `update-active-customers`, `update-sheet-sang`, `check-apprentice` | **MISSING** | dave/ภูม split |

## N6. Hardening / observability gaps (ต้องมีก่อน production launch)

- [ ] Sentry หรือ Vercel Analytics สำหรับ error tracking
- [ ] Structured logging (เลิก console.log — leak PII ใน lib/sms/gateway.ts:19, lib/notifications/index.ts:50,56,102,125,135,154)
- [ ] Rate limiting (signup/OTP/password-reset/payment endpoints)
- [ ] CAPTCHA / hCaptcha บน signup
- [ ] CSP + security headers (`X-Frame-Options`, `Strict-Transport-Security`, etc.)
- [ ] File upload: server-side size + MIME validation + virus scan optional
- [ ] DB backup strategy (Supabase auto-backup verify)
- [ ] Audit log retention policy
- [ ] CRON_SECRET protect cron endpoint
- [ ] Monitoring: SMS delivery rate, LINE push delivery, OAuth success rate
- [ ] Mobile responsive QA (ยังไม่ verify)
- [ ] i18n completeness — missing keys crash pages, ยังไม่ audit ทุก namespace

## N7. Things ที่ทำงานจริงดี ✅ (production ready)

ให้ credit ส่วนที่ผ่าน audit รอบนี้:

- ✅ Login (email/phone/password)
- ✅ Profile view/edit/avatar/security panels
- ✅ Address CRUD (RLS + soft delete + auto-default)
- ✅ Sales team view + commission history
- ✅ Notifications list/mark-read (badge ไม่ realtime แต่ functional)
- ✅ TOS gate
- ✅ Public landing pages (home/about/services/booking calculator/FAQ/knowledge/etc.)
- ✅ Service-order: manual cart add, cart edit/remove, place order (h_no gen), pending list, detail view
- ✅ Cart 151-item cap (DB trigger)
- ✅ Service-import (forwarder): create with rate engine (waterfall + tier + juristic discount + service fee), list, detail, **PDF receipt** (HTML print)
- ✅ Forwarder rate engine — verified vs PHP `calPriceForwarderSumCompany`
- ✅ Service-payment yuan transfer (rate fallback 5.00 OK)
- ✅ Wallet balance display (3 buckets: main/cashback/credit)
- ✅ Wallet history ledger
- ✅ Wallet deposit slip upload + admin approve flow
- ✅ Wallet withdraw request
- ✅ Wallet recompute trigger (idempotent re-sum)
- ✅ Admin: Forwarder workflow + bulk update (with audit + customer notify)
- ✅ Admin: Service-orders update
- ✅ Admin: Wallet/Yuan/Sales-payouts approve flows (all withAdmin + audit + notify)
- ✅ Admin: Team-leaders CRUD
- ✅ Admin: Barcode scan (3 modes: intake/prepare/driver)
- ✅ Admin: Settings, Containers, Rates, Admins RBAC
- ✅ Admin: Accounting 7-tab + Reports 5-tab + CSV export
- ✅ HR: org chart, employees, attendance, leaves, recruitment, training, policies, audit
- ✅ DB schema: 6 storage buckets created (avatars, member-docs, slips, forwarder-covers, carts, resumes)
- ✅ DB triggers: cart cap, h_no/f_no/c_no gen, wallet recompute, sales commission emit, leave→attendance
- ✅ Vercel cron config: auto-cancel-orders every 15 min
- ✅ DBD Tax-ID lookup (public API, no key)
- ✅ Supabase Auth (email/phone/password + OAuth Google/FB ระดับโค้ด)
- ✅ RLS policies on all 30+ customer-facing tables

## N8. Sprint 5 — Real plan (อิงสภาพจริงจาก audit)

### 👤 ดาด (dave) — Infrastructure rescue mode (~50-70h)

ลำดับสำคัญ (P0 ทำก่อน):
1. 🔴 **D-7a** Set 3rd-party API env vars + verify endpoints (2-4h)
   - Test RCGroup URL ตาม PHP `dataAPI.php` pattern (อาจต้องปรับโค้ดให้ใช้ `/get/?id=` แทน `/?q=`)
   - Test TAMIT API ว่ายัง alive มั้ย ถ้าไม่ก็หา replacement หรือ build scraper
   - หา PromptPay ID จากบริษัท
   - หา ThaiBulkSMS real API key + secret
2. 🔴 **D-7b** LINE Messaging API setup (3-4h)
   - Get `LINE_CHANNEL_ACCESS_TOKEN` จาก Pacred OA
   - Set `LINE_PUSH_BYPASS=false` ใน production env
   - Test push end-to-end
3. 🔴 **helper-1** Port `ReadNumber()` → `lib/utils/thai-number.ts` (2-3h)
4. 🔴 **C-7** PDF receipt infrastructure (`@react-pdf/renderer` + Sarabun font) (8-12h)
5. 🟡 **D-11** Sentry / error tracking setup (3-4h)
6. 🟡 **D-12** Rate limiting (Upstash Redis หรือ Vercel KV) (4-6h)
7. 🟡 **D-13** CAPTCHA บน signup (hCaptcha invisible) (2-3h)
8. 🟡 **D-14** Security headers in `next.config.ts` (1-2h)
9. 🟡 **D-15** File upload server-side validation (size + MIME magic bytes) (3-4h)
10. 🟡 **D-16** Replace 7 `console.log` PII leaks with structured logger (2-3h)
11. 🟡 **D-17** CRON_SECRET protect endpoint (30m)
12. 🟢 **A-9** Settings edit UI (4-6h) — keep from M
13. 🟢 **A-10** Team leaders commission edit (4-6h)
14. 🟢 **A-11** Sales payouts approve (3-4h)
15. 🟢 **A-12** Containers ETA workflow (6-8h)
16. ⚪ **D-7c** Decision: D-7 Payment Gateway provider (Omise/2C2P) + M2.1 design (no code yet)

### 👤 ภูม (Poom) — Bug fixes + admin extras (~20-30h)

1. 🔴 **bug-1** Fix `approveCustomer()` + `suspendCustomer()` ใน `actions/admin/customers.ts`:
   - เพิ่ม `withAdmin(["ops"])` แทน `requireAdmin()` (capture adminId)
   - เพิ่ม `await logAdminAction(adminId, "customer.approve"|"customer.suspend", ...)`
   - เพิ่ม `sendNotification()` ลูกค้าหลัง approve/suspend
   - (1-2h, blocker for compliance)
2. 🔴 **bug-2** Fix 3 React Compiler errors + 5 warnings ใน `scan-form.tsx` (2-3h)
3. 🟡 **bug-3** Verify containers RLS policy (`containers_admin_all` policy) + เพิ่มถ้าขาด (30m)
4. 🟡 **bug-4** Fix service-order status date column naming (`awaiting_chn_dispatch` → consistent column name) (30m)
5. 🟢 **A-17** Transfer sales rep workflow (`/admin/customers/[id]/transfer-rep`) (2-3h)
6. 🆕 **M2.3** Customer bulk transfer personal→juristic (4-6h)
7. 🆕 **M2.5b** Forwarder month-end closing report (6-8h)
8. 🆕 **M2.5c** Forwarder sale tracking (4-6h)
9. 🆕 **M2.5h** Recently imported customers cache (2-3h)
10. ⚪ รอ decision D-8/D-9: M2.2 Payroll · M2.4 HS variants · M2.5d Driver shifts

### 👤 ปอน (podeng) — Customer auth completion + i18n polish (~15-20h)

1. 🔴 **C-0** `/complete-profile/page.tsx` — รื้อ stub สร้าง form จริง (5-6h)
   - Personal: first_name + last_name + phone + sex + birthday + TOS
   - Juristic: redirect ไป register juristic flow + tax_id
   - Server action `completeProfile()` ใน `actions/profile.ts`
   - Acceptance: OAuth user new → submit → `profile.status='active'` → /dashboard
2. 🔴 **C-10 (new)** `/forgot-password` — สร้างใหม่ (3-4h)
   - Page: input phone หรือ email → ส่ง OTP → reset password
   - Server action `requestPasswordReset()` + `confirmPasswordReset()`
3. 🟡 **C-4** Change phone atomic (auth.phone + profiles.phone) (2-3h)
4. 🟢 **C-3** Sales claim form `/sales/report/add` (2-3h)
5. 🟢 **C-5** China warehouse addresses page (1h)
6. 🟢 **C-6** Cart counter badge ใน navbar (30m)
7. 🟢 **C-8** Contact form submit handler (1h)
8. 🟡 **decision** LINE login: ตัดปุ่มออก หรือ build จริง (รอเดฟ verify Supabase LINE OAuth + channel)
9. 🟡 **i18n audit** หา missing translation keys ทั้งโปรเจกต์ (ตามรอบ Phase 4b/5 ของปอน)
10. ⚪ รอเดฟ C-7 → ทำ **C-2** PDF shop receipt

### 👤 ก๊อต — coordination + decisions (~5-10h)

1. Schedule 3 decision calls:
   - **D-7** Payment gateway provider (กับ Pacred owner)
   - **D-8** HS variants keep/merge
   - **D-9** Payroll scope
2. Review + merge `dave` → `main` (Poom + ปอน + Part M+N + lint fix)
3. Review + merge ภูม's bug fixes when ready
4. Coordinate: ปอน + เดฟ on LINE login decision

## N9. Production launch checklist (gate ก่อน customer #1)

**ต้องเสร็จทุกข้อก่อน open ลูกค้าจริง:**

- [ ] OTP_BYPASS=false (production)
- [ ] ทุก env vars ใน N4 ตั้งครบ
- [ ] LINE_PUSH_BYPASS=false + token verified work
- [ ] OAuth Google/Facebook provider config verified ใน Supabase Dashboard
- [ ] LINE login decided (build หรือ remove)
- [ ] complete-profile real form (C-0)
- [ ] forgot-password flow (C-10)
- [ ] Payment gateway integrated (M2.1) **OR** PromptPay-only launch (with PROMPTPAY_ID)
- [ ] approveCustomer/suspendCustomer audit + notify bugs fixed
- [ ] Sentry / error tracking online
- [ ] Rate limiting on signup/OTP/payment
- [ ] CAPTCHA on signup
- [ ] CSP headers
- [ ] CRON_SECRET set
- [ ] PII console.log purged
- [ ] File upload server-side validation
- [ ] Production domain set in NEXT_PUBLIC_SITE_URL
- [ ] DB backup verified
- [ ] Mobile responsive QA on top 10 pages
- [ ] End-to-end customer flow test (register → cart → checkout → pay → receive)

**สิ่งที่ launch beta ได้ก่อน ถ้ายอม:**
- ไม่มี payment gateway (PromptPay-only ผ่าน slip + admin approve manual)
- ไม่มี keyword search (ปิด tab)
- ไม่มี LINE login (เหลือ Google/FB + email/password)
- ไม่มี service-order PDF receipt (browser print)

---

**End of Part N.** Part M/N รวมกันเป็น authoritative state of project ณ 2026-05-13 — Part M สำหรับ PHP feature inventory + Sprint 4 plan, Part N สำหรับ production readiness state.

> 🔁 **Sprint plan in Part N6 SUPERSEDED by Part O** (role restructure 2026-05-13 evening) — ดู Part O ด้านล่าง

---

# Part O — Sprint 5+ Plan with Role Restructure (2026-05-13 evening)

> **Role restructure decision (Pacred owner):** ทีมแบ่งงานชัดเจนตามความเชี่ยวชาญ — ดู [`docs/team.md`](team.md) สำหรับ full role definition
>
> - **ปอน (podeng):** 100% frontend / landing / SEO / acquisition
> - **ภูม (Poom):** 100% backend — เชื่อม frontend ↔ customer backend ↔ admin backend; phase 1 = port PHP cargo 100%; phase 2 = DPX ERP
> - **เดฟ:** project lead + infrastructure
> - **ก๊อต:** senior advisor + co-merger

## O1. งาน ปอน + ภูม โอนใหม่ (จาก Part N6)

### โอนจาก ปอน → ภูม (customer portal คือ backend scope)
| Task | เดิม Part N6 ปอน | ใหม่ Part O ภูม |
|---|---|---|
| C-0 complete-profile form | ปอน 5-6h | ✅ ภูม |
| C-2 PDF shop receipt | ปอน 3-4h (รอ C-7) | ✅ ภูม (รอ C-7) |
| C-3 sales claim form | ปอน 2-3h | ✅ ภูม |
| C-4 phone change OTP atomic | ปอน 2-3h | ✅ ภูม |
| C-5 China warehouse addresses page | ปอน 1h | ✅ ภูม |
| C-6 cart counter navbar badge | ปอน 30m | ✅ ภูม |
| C-8 contact form submit handler | ปอน 1h | ✅ ภูม |
| C-10 forgot-password flow (NEW) | ปอน 3-4h | ✅ ภูม |
| Bug-1 approve/suspend audit | ภูม 1-2h | ✅ already fixed by dave (commit `1a470ee`) |
| Bug-2 scan-form.tsx React Compiler | ภูม 2-3h | ✅ already fixed by dave (commit `1a470ee`) |

### โอนจาก ปอน → ปอน (เน้น frontend/SEO อย่างเดียว)
| Task | เดิม | ใหม่ |
|---|---|---|
| All public/landing/SEO work | — | ✅ ปอน เป็น primary owner |
| i18n keys ทุก namespace | ปอน | ✅ ปอน (continue) |
| Phase I ecosystem landing pages (#1, #5-13) | TBD | ✅ ปอน (new primary owner) |
| Mobile responsive QA | TBD | ✅ ปอน |
| Lighthouse / SEO scores | TBD | ✅ ปอน |
| `app/sitemap.ts` / `app/robots.ts` | (missing) | ✅ ปอน (new task L-1) |

## O2. 👤 ภูม (Poom) — Sprint 5 (CARGO PORT FOCUS)

**Strategy:** Port PHP cargo system → Pacred 100% ก่อน DPX ERP. ทุก feature ที่ PHP เดิมมี ต้อง work ใน Pacred ก่อน

**Status check:**
- ✅ Bug fixes ของ Sprint 1-3 (approve/suspend, scan-form, etc.) — แก้แล้วบน dave commit `1a470ee`
- ✅ Sprint 1-3 admin features ครบ (A-1 ถึง A-15 + L-cleanup)
- 🟡 ลำดับงานใหม่:

### Priority 0 (block customer launch — must finish first)

| # | Task | Est | Description |
|---|---|---|---|
| **P-1** | C-0 `/complete-profile` real form | 5-6h | OAuth new users blocked without this. Personal: first_name + last_name + phone + sex + birthday + TOS. Juristic: redirect to register flow. Server action `completeProfile()`. Acceptance: OAuth user → submit → `profile.status='active'` → /dashboard |
| **P-2** | C-10 `/forgot-password` flow | 3-4h | Input phone/email → request OTP → verify → reset password. Server actions `requestPasswordReset()` + `confirmPasswordReset()`. **BLOCKER** — current customers can't recover accounts |
| **P-3** | C-4 phone change atomic | 2-3h | Update both `auth.phone` + `profiles.phone` atomically with OTP verify. Page `/profile/security/change-phone` |
| **P-4** | Fix DBD silent fail | 1-2h | `actions/auth.ts:355-379` — when DBD API down, show "API ไม่พร้อม กรุณากรอกข้อมูลเอง" instead of "notfound". Add retry |
| **P-5** | C-6 cart counter navbar badge | 30m | Add to `components/sections/navbar.tsx` — fetch count + badge |
| **P-6** | C-8 contact form submit | 1h | `actions/contact.ts` → save to `contact_messages` table + admin notify |
| **P-7** | C-3 sales claim form | 2-3h | `/sales/report/add` — form + server action `createSalesClaim()` |

### Priority 1 (cargo system completeness)

| # | Task | Est | Description |
|---|---|---|---|
| **P-8** | C-5 China warehouse addresses page | 1h | `/service-import/warehouse-addresses` — list with copy buttons |
| **P-9** | A-17 transfer sales rep | 2-3h | `/admin/customers/[id]/transfer-rep` workflow |
| **P-10** | M2.3 customer bulk transfer (personal→juristic) | 4-6h | Admin tool from PHP `customers-move-to-juristic` |
| **P-11** | M2.5b forwarder month-end closing | 6-8h | `/admin/accounting/closing` report from PHP `closingAccReportForwarder` |
| **P-12** | M2.5c forwarder sale tracking | 4-6h | `/admin/forwarder-sales` from PHP |
| **P-13** | M2.5h recently imported customers cache | 2-3h | Admin UX feature |

### Priority 2 (after C-7 from เดฟ lands)

| # | Task | Est | Description |
|---|---|---|---|
| **P-14** | C-2 PDF shop order receipt | 3-4h | Uses `@react-pdf/renderer` infrastructure + `ReadNumber()` helper from เดฟ |

### Priority 3 (waiting for owner decision)

- M2.2 Payroll module (decision D-9 with owner)
- M2.4 HS variants keep/merge (decision D-8 with owner)
- M2.5d Driver work shifts (after payroll decision)

**Estimated total P0+P1+P2:** 40-55h → 3-4 weeks part-time

## O3. 👤 ปอน (podeng) — Sprint 5 (FRONTEND/SEO/LANDING FOCUS)

**Strategy:** ทำ landing pages ทุก service + push SEO + acquisition funnel ให้แรง — เป้า Lighthouse 95+ ทุก public page

### ✅ COMPLETED (Sprint 5 Day 3 — claude session `great-banzai-0675e6` → merged into `podeng` 2026-05-14)

| # | Task | Files / Notes |
|---|---|---|
| ✅ **L-1** | `app/sitemap.ts` | 27 static routes + 15 dynamic knowledge slugs × TH/EN hreflang alternates · Next 16 `MetadataRoute.Sitemap` type |
| ✅ **L-2** | `app/robots.ts` | allow `/`, disallow `/admin /auth /api /dashboard /profile /addresses /wallet /service-* /sales /receipts /complete-profile /login /register /recover` + AI bot allowlist (GPTBot/ChatGPT-User/CCBot/Google-Extended/anthropic-ai/Claude-Web) |
| ✅ **L-3** | JSON-LD on all landing pages | `components/seo/{json-ld.tsx,schemas.ts,site.ts,page-meta.ts}` — Organization + LocalBusiness + WebSite (locale layout) · Service + BreadcrumbList (per service landing) · Article (knowledge slug) · FAQPage (faq page) · ItemList (knowledge index) |
| ✅ **L-4** | OG + Twitter meta + dynamic OG image | `metadataBase` set in root layout · per-page `generateMetadata` with `openGraph` + `twitter` + `alternates.canonical` + `alternates.languages` · `app/opengraph-image.tsx` generates 1200×630 PNG with Sarabun font on demand |
| ✅ **L-6** | Knowledge SEO + RSS | `app/feed.xml/route.ts` — RSS 2.0 with all 15 articles · Article JSON-LD + locale-aware OG on each `/knowledge/[slug]` · `alternates.types["application/rss+xml"]` in root layout |
| ✅ **L-7** | Real FAQ page + FAQPage JSON-LD | `app/[locale]/(public)/faq/page.tsx` — 22 Q&A across 5 categories (general / shipping / payment / customs / support) · `components/sections/faq-accordion.tsx` reusable client accordion · TH + EN content |
| ✅ **L-9** | i18n audit script | `scripts/i18n-audit.mjs` — diffs th vs en, reports missing keys + same-value (untranslated) candidates · current state: 1770 keys each, 0 missing |
| ✅ **Bonus 1** | New `seo.*` namespace | ~70 keys × 2 locales for all SEO titles/descriptions (root, home, services.*, warehouses.*, knowledge.index, faq, about, contact, booking, payment.*, howToUse, deliveryAreas, holidays, joinUs, terms, privacy) |
| ✅ **Bonus 2** | Home rich SEO article block | `components/sections/home-article.tsx` — "Pacred Shipping — ผู้เชี่ยวชาญด้านนำเข้า-ส่งออกครบวงจร 14 ปี" placed under `<Partner />` (home only). 5 sub-sections: 3-paragraph hero with inline service links · pull quote · marketplaces (1688/Taobao/Tmall/Alibaba/JD/Pinduoduo/AliExpress/Weidian) · 16 category pills · 10 port pills · 3 warehouse cards · `homeArticle.*` i18n namespace |
| ✅ **Bonus 3** | Reusable horizontal scroller | `components/sections/horizontal-scroller.tsx` — client component: mouse drag-to-scroll + vertical-wheel→horizontal scroll + touch native momentum + click suppression on drag · used on all 4 pill/card rows in HomeArticle |
| ✅ **Bonus 4** | Red-cloud page background | `app/globals.css` — replaced mismatched yellow radial with 4 uniform red radial blobs (1250–1400px) · `background-attachment: fixed` · removed mobile `#ffffff !important` override (mobile now matches desktop) · dark-mode variant |
| ✅ **Bonus 5** | Page-mover + cleanup | Moved `<Partner />` to bottom (home only) · Office image card now `<Link href="/about">` with hover badge "เกี่ยวกับเรา" · Removed orphan `cert*` i18n keys (7×2) + `public/images/dbd/` (4 cert images) · Removed stale "certificate slider" comment in `about/page.tsx` · Replaced `app/favicon.ico` (default Next.js logo) with `app/icon.png` (`pdiwaicon.png`) + updated `metadata.icons` |

### 🟡 REMAINING (Sprint 5 Day 4+)

| # | Task | Est | Description |
|---|---|---|---|
| 🟡 **L-5** | Audit + polish ทุก service landing | 6-8h | `/services/import-china`, `/services/import-china-fcl`, `/services/import-china-lcl`, `/services/export-worldwide`, `/services/china-shopping` — content, CTAs, mobile UX. (`/services/customs-clearance` already has full content via existing `Clearance*` components.) Recommendation: replace `StubPage` with real layout per service |
| 🔴 **L-8** | Mobile responsive QA top 10 pages | 4-6h | Audit + fix layout issues with browser devtools. **Blocked: needs real device or BrowserStack testing — Claude session can only spot-check via curl/CSS** |

### Priority 2 (Phase I — Pacred Ecosystem expansion landing pages)

11 new service landing pages (#1, #5-13 ตาม CLAUDE.md service catalogue):

| # | Service | slug | Est |
|---|---|---|---|
| **L-10** | customs broker matching | `/services/customs-broker-matching` | 4-6h |
| **L-11** | tax refund | `/services/tax-refund` | 3-4h |
| **L-12** | customs clearance (expand existing) | `/services/customs-clearance` | 2-3h |
| **L-13** | tax invoice issuance | `/services/tax-invoice` | 3-4h |
| **L-14** | shipping document | `/services/shipping-document` | 3-4h |
| **L-15** | export | `/services/export` | 3-4h |
| **L-16** | fumigation | `/services/fumigation` | 3-4h |
| **L-17** | consignment | `/services/consignment` | 3-4h |
| **L-18** | bill payment | `/services/bill-payment` | 3-4h |
| **L-19** | logistics + messenger | `/services/logistics` | 4-6h |
| **L-20** | services hub page redesign | `/services` | 4-6h |

### Priority 3 (performance + acquisition)

| # | Task | Est | Description |
|---|---|---|---|
| **L-21** | Image optimization (lazy + WebP) | 4-6h | Audit `<Image>` usage, use proper sizes, lazy load below-fold |
| **L-22** | Conversion tracking (GTM/GA4) | 3-4h | Setup events: page_view, cta_click, register_start, register_complete |
| **L-23** | Heatmap (Microsoft Clarity or Hotjar) | 1-2h | Setup tracking |
| **L-24** | A/B test infrastructure | TBD | If GrowthBook or similar chosen |

**Estimated total P0+P1:** 30-40h → 2-3 weeks part-time
**Phase I (P2):** +40-50h → ขึ้นกับ priority ของ Pacred owner

## O4. 👤 เดฟ (dave) — Sprint 5 (INFRASTRUCTURE LEAD)

### ✅ COMPLETED (Sprint 5 Days 1-2)
1. ✅ **helper-1** `lib/utils/thai-number.ts` — port of PHP ReadNumber + 50 unit tests passed (commit `8f6d9c3`)
2. ✅ **C-7** PDF receipt infrastructure — `@react-pdf/renderer` + Sarabun font + `lib/pdf/register-fonts.ts` + `components/pdf/{styles,forwarder-receipt}.tsx` + `app/api/pdf/forwarder/[fNo]/route.tsx` + HTML receipt has "ดาวน์โหลด PDF" button (commit `8f6d9c3`)
3. ✅ **D-14** Security headers in `next.config.ts` — HSTS + X-Frame + CSP + Referrer + Permissions (commit `c973ef5`)
4. ✅ **D-15** Server-side file validation — `lib/file-validation.ts` magic bytes check + wired in `actions/wallet.ts createDeposit()` (commit `c973ef5`)
5. ✅ **D-16** Structured logger — `lib/logger.ts` + PII redaction helpers + replaced 8 console.log/warn/error spots (commit `c973ef5`)
6. ✅ **D-17** CRON_SECRET hardening — `/api/cron/auto-cancel-orders` now requires `x-vercel-cron` OR `Bearer ${CRON_SECRET}` in production (commit `c973ef5`)
7. ✅ **A-9** Settings edit UI — **already built by ภูม** (yuan_rate + service_fee + QC + crate + juristic + free-ship)
8. ✅ **A-10** Team Leaders commission edit — **already built by ภูม** (inline % editor + toggle active)
9. ✅ **A-11** Sales Payouts approve actions — **already built by ภูม** (approve/reject/paid + rejection reason)
10. ✅ **A-12** Containers ETA workflow — new `/admin/containers/[id]` detail page with full edit form (ETA + carrier + vessel + note) + linked forwarders list with unlink + "Link forwarders" multi-select (filtered by origin+transport+unlinked) + bulk-link action + status timeline. New server actions `adminLinkForwardersToContainer` + `adminUnlinkForwarder` (with audit logs)

### 🟡 REMAINING (Sprint 5 Days 3+)
11. 🔴 **D-7a** Set 3rd-party API env vars + verify endpoints (2-4h) — **blocked: need real credentials** (RCGroup URL, TAMIT URL, ThaiBulkSMS keys, PromptPay ID)
12. 🔴 **D-7b** LINE Messaging API setup (3-4h) — **blocked: need LINE Channel Access Token from Pacred OA**
13. 🟡 **D-11** Sentry / error tracking setup (3-4h) — **blocked: need Sentry account + DSN**
14. 🟡 **D-12** Rate limiting (Upstash Redis or Vercel KV) (4-6h) — **blocked: need Upstash/Vercel KV setup**
15. 🟡 **D-13** CAPTCHA on signup (hCaptcha invisible) (2-3h) — **blocked: need hCaptcha site key**
16. ⚪ **D-7c** Decision: Payment Gateway provider (with Pacred owner) → M2.1 design

**Estimated remaining:** ~14-21h once credentials/decisions are in hand
**Sprint 5 Days 1-2 actual:** ~3-4 commits, lint clean, build pass, 50/50 tests

## O5. 👤 ก๊อต — co-merger + advisor

1. Code review สำหรับ feature ใหญ่ + ADR
2. Co-merge เข้า main (เดฟ + ก๊อต = highest)
3. Schedule decision calls: D-7 payment gateway, D-8 HS variants, D-9 payroll
4. Architecture consultation: DPX ERP phase 2 planning

---

## O6. Sprint coordination rules

- **ภูม** must finish P-1 (complete-profile) + P-2 (forgot-password) before customer beta
- **เดฟ** must finish C-7 PDF infra before ภูม can start P-14
- **ปอน** ✅ L-1..L-4, L-6, L-7, L-9 ship-ready บน `origin/podeng` แล้ว (claude session 2026-05-14)
- **All:** sync main daily (per [`team.md`](team.md) §3)
- **PR turnaround:** review within 24h target

---

## O7. Live status — 2026-05-14 (latest claude check-in)

> **เป้าหมาย:** ให้ 4 claude code ของทุกคน (เดฟ/ก๊อต/ภูม/ปอน) เปิดมาแล้วเห็นภาพเดียวกันทันที — จบ phase = push เข้า branch ตัวเอง

| Branch | SHA | สถานะเนื้อหา |
|---|---|---|
| `origin/main` | `5475f14` | latest ก่อน claude session |
| `origin/dave` | `1700144` | = `origin/podeng` (1 commit behind main = Poom merge) |
| `origin/Poom` | `3f8b887` | ภูม push 5 commit ใหม่ (admin/auth/notifications fixes) — ไม่กระทบ public scope ของปอน |
| `origin/podeng` | (kept fresh after this session) | ปอนรับงาน SEO bundle + HomeArticle + red cloud + cleanup เข้ามา; ตามตาราง O3 ✅ section |

### ใครเปิดเทอร์มินอลแล้วทำอะไรต่อ
1. **เดฟ/ก๊อต:** pull `origin/podeng` → review งานปอน (ดูตาราง O3 ✅) → pull `origin/Poom` → merge ทั้งคู่เข้า `dave` → verify lint+build → merge → `main`
2. **ปอน:** sync `podeng` ลงเครื่อง (`git pull origin podeng`) → เริ่ม **L-5** (service landing polish) บน branch ตัวเอง — ดูว่า `home-article.tsx` pattern (server component + `useTranslations` + JSON-LD) reuse กับ landing อื่นได้เลย
3. **ภูม:** ทำงาน Poom branch ต่อ (P-7+ admin) ไม่กระทบกัน
4. **claude สำหรับใครก็ตาม:** อ่าน Part O3 ✅ section + ตาราง O7 นี้ก็เข้าใจว่ามาถึงไหนแล้ว

---

**End of Part O.** Part O supersedes Part N6 Sprint 5 plan with proper role mapping.
