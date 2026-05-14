# 🚢 Pacred — Port Plan & Work Split

> **เป้าหมาย:** Port ระบบ PHP `pcs-cargo` ทั้งระบบ (customer + admin) → Next.js + Supabase
> **กติกา:** อ่านเอกสารนี้ครั้งเดียวจบ — **ไม่ต้องกลับไปดูไฟล์ PHP ต้นฉบับอีก**
> **วันที่:** 2026-05-13 · **เวอร์ชัน:** 1.0

---

## 🚨🚨 URGENT — เดฟ + ก๊อต attention (2026-05-15 evening) 🚨🚨

**🆕 Part R: VENDOR CUTOFF + คำตัดสินที่ ก๊อต/เดฟ ต้องล็อคด่วน → ดู [Part R](#part-r--vendor-cutoff--urgent-decisions-for-กอต--เดฟ-2026-05-15)**

ภูมิ flag (2026-05-15 ค่ำ): "ตัด **ทั้งไอแต้ม (TAM/TAMAI/TAMTISO)** ทั้ง **PCS Cargo legacy** ออกให้หมด — ไม่อยากให้ vendor เก่ารู้ว่า Pacred ทำเว็บใหม่".

**ผลกระทบทันที:** Track G ที่ภูมเพิ่ง ship เสร็จ (P-50..P-53 — china-search rewire) wired ไป TAM endpoints ทั้งหมด — code ทำงานถูกต้องตาม audit แต่ strategy ผิด.  **ห้าม flip switch เปิดใน production** จนกว่า ก๊อต/เดฟ จะเลือก replacement strategy.

**Part Q (เดิม):** Production beta blockers — บัญชี/LINE/การเงิน ที่ owner ต้อง provide creds + decisions **→ ดู [Part Q](#part-q--urgent-pacred-owner-blockers-2026-05-14)** สำหรับ 3 bundles + D-1-LIFF + production launch checklist.

**Estimate (revised):** beta launch ขึ้นกับว่า ก๊อต/เดฟ เลือก replacement สำหรับ china-search ภายในกี่วัน. LIFF + PromptPay + SMS + Sentry path ไปต่อได้ทันทีเพราะไม่เกี่ยว vendor เก่า.

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
| `api/autorun/check-apprentice.php` | admin probation expiry + driver assignment 17h timeout | 🟡 deferred — needs `employees.contract_end_date` (admin half) + `forwarder_driver` table (driver half) before scaffolding |
| `api/autorun/send-line-sales.php` | daily 00:05 LINE digest of yesterday's paid sales | 🟡 scaffolded by เดฟ at `/api/cron/sales-daily-digest` (auth + queries done; ภูม wires recipient/dispatch — see P-15) |
| `api/autorun/update-active-customers.php` | mark `profiles.is_active=true` based on activity | ✅ scaffolded by เดฟ at `/api/cron/refresh-active-customers` (full implementation; ภูม verify + enable schedule — see P-16) |
| `api/autorun/update-sheet-sang.php` | sync to "Sang" Google Sheet | ⚪ obsolete — replaced by Pacred admin dashboards; do not port |
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

> **Re-audit 2026-05-15 (P-25 ภูม):** 20/20 rows verified —
> **9 ✅ FIXED in code**, **8 ⏳ BLOCKED on external creds**,
> **2 ⏳ BLOCKED on owner decisions**, **1 🟡 INTENTIONAL dev toggle**
> (OTP_BYPASS — flips at production deploy time when ThaiBulkSMS
> creds land). Code-level audit was direct grep + git log walk;
> env-level status was direct .env.local read.

### N3.1 — Silent degraded modes (ดูเหมือนทำงาน แต่ใช้งานจริงไม่ได้)
ประเภทอันตรายที่สุด — UI render ปกติ แต่ backend ทำงานในโหมด demo/bypass/mock เงียบๆ:

| # | Feature | Trigger | สิ่งที่ลูกค้าเห็น | Status (2026-05-15) |
|---|---|---|---|---|
| 1 | **OTP registration** | `OTP_BYPASS=true` ใน .env.local | กรอก OTP อะไรก็ผ่าน — phone never verified → ลูกค้าปลอมเข้าได้ | 🔴 still degraded — confirmed `OTP_BYPASS=true` ใน .env.local. Intentional for dev. Production prep: flip to `false` + ต้องมี ThaiBulkSMS creds พร้อมใช้ก่อน (ดู #8) |
| 2 | **URL→cart converter** (1688/Taobao/Tmall) | `PACRED_RCGROUP_API_URL` unset | demo product ราคา ¥0 "Taobao Shop" — ลูกค้ากรอกราคาเอง สับสน | ⏳ blocked on D-7a — env var ตั้งแล้ววันนี้แต่ legacy URL ดูเหมือน dead. ภูม shipped 8s timeout (commit `77d4c44`) → graceful fallback to demo. รอเดฟ + Pacred owner verify URL หรือเลือก provider ใหม่ |
| 3 | **Keyword search 1688** | `PACRED_TAMIT_API_URL` unset | yellow banner "API ไม่พร้อม" — search ใช้ไม่ได้ | ⏳ blocked on D-7a — same as #2 |
| 4 | **Image reverse search** | `PACRED_RCGROUP_API_URL` unset | banner "ไม่พร้อม" | ⏳ blocked on D-7a — same RCGroup endpoint |
| 5 | **LINE push notification** | `LINE_PUSH_BYPASS` defaults true (ถ้า unset = bypass) + `LINE_CHANNEL_ACCESS_TOKEN` unset | console.log เท่านั้น — ลูกค้าไม่ได้รับแจ้งสถานะ order | ⏳ blocked on D-7b — `LINE_PUSH_BYPASS=true` ใน .env.local (intentional dev). `LINE_CHANNEL_ACCESS_TOKEN` ยัง unset. รอ Pacred OA setup |
| 6 | **Email notification fallback** | `RESEND_API_KEY` unset | console.warn เท่านั้น — เมล์ไม่ส่งจริง | ⏳ blocked on D-7d — `RESEND_API_KEY` + `RESEND_FROM` ทั้งคู่ unset. รอเดฟสร้าง Resend account |
| 7 | **DBD Tax-ID lookup** | DBD API down/rate-limited | silently shows "notfound" — ไม่บอกว่าเป็น API issue | ✅ FIXED P-4 (commit `ceac3e5`) — distinguishes API down (sawApiError flag) from real notfound. Shows "ระบบค้นหาไม่พร้อม" + retry button when 5xx/network |
| 8 | **ThaiBulkSMS** | API key placeholder "YOUR_API_KEY" | return `missing_credentials` แต่ UI โชว์ error generic | ⏳ blocked on D-7a — `THAIBULKSMS_API_KEY=YOUR_API_KEY` confirmed in .env.local. Real key needed before OTP_BYPASS=false flip |

### N3.2 — Hard blockers (ใช้ไม่ได้เลย)

| # | Feature | สาเหตุ | Fix | Status (2026-05-15) |
|---|---|---|---|---|
| 9 | **Wallet deposit QR** | `PROMPTPAY_ID` unset → throw error | set env var | ⏳ blocked on Pacred owner — `PROMPTPAY_ID` ยัง unset (commented placeholder ใน .env.local) |
| 10 | **OAuth (Google/Facebook)** | ต้อง verify provider config ใน Supabase Dashboard | verify + test | ⏳ blocked on verification — ก๊อต/เดฟ ต้อง check Supabase project settings (no code change needed) |
| 11 | **`/complete-profile`** | placeholder page (มีไฟล์แต่ไม่มี form จริง) | ปอนสร้าง C-0 | ✅ FIXED P-1 (commit `0ff8725`, ภูม) — full personal form + juristic redirect + atomic TOS write. Reassigned ปอน→ภูม per Part O1 |
| 12 | **`/forgot-password`** | ไม่มี page เลย | ปอนสร้าง (new task C-10) | ✅ FIXED P-2 (commit `b7a6ba4`, ภูม) — phone OTP + email magic link both paths. Reassigned ปอน→ภูม per Part O1 |
| 13 | **LINE login** | stub "coming soon" — กดแล้ว error | ตัดปุ่มออก หรือ build จริง | ⏳ blocked on owner decision — ยังเป็น stub, ตัดสินใจ remove vs build เป็น D-7-equivalent |
| 14 | **Payment gateway (Omise/2C2P)** | ไม่มีโค้ดเลย | dave M2.1 (40-60h) | ⏳ blocked on D-7c — Pacred owner เลือก provider ก่อน. Until decided: PromptPay-only beta launch is viable per Part N9 |

### N3.3 — Code bugs (ใน admin actions ของภูม)

| # | Bug | File:Line | Severity | Status (2026-05-15) |
|---|---|---|---|---|
| 15 | `approveCustomer()` ไม่ call `logAdminAction()` | `actions/admin/customers.ts:~103` | 🔴 audit gap | ✅ FIXED (เดฟ commit `1a470ee`, line 121 verified) |
| 16 | `suspendCustomer()` ไม่ call `logAdminAction()` | `actions/admin/customers.ts:~118` | 🔴 audit gap | ✅ FIXED (เดฟ commit `1a470ee` — `customer.suspend` audit row written) |
| 17 | `approveCustomer()` ใช้ `requireAdmin()` (any admin) — ควรเป็น `withAdmin(["ops"])` | same file | 🔴 RBAC weak | ✅ FIXED (เดฟ commit `1a470ee`, line 105: `withAdmin(["ops","super"])`) |
| 18 | `suspendCustomer()` same | same | 🔴 RBAC weak | ✅ FIXED (เดฟ commit `1a470ee`, line 245: `withAdmin(["ops","super"])`) |
| 19 | approve/suspend ไม่ call `sendNotification()` | same file | 🟡 customer ไม่รู้ว่าถูก approve | ✅ FIXED — both call `sendNotification()` now (refactored to `notify.customerApproved()` / `notify.customerSuspended()` templates per P-21 commit `8532f30`) |
| 20 | React Compiler errors 3 ตัวใน `scan-form.tsx` (line 130/142/151) | scan-form.tsx | 🟡 ภูม fix แล้วยังไม่ push | ✅ FIXED (เดฟ commit `1a470ee` — handleSubmitCode reorder + Ref pattern + setCameraErr placement) |

**Re-audit summary (P-25, 2026-05-15) — 20 items grouped by next-action owner:**
- ✅ **FIXED in code** (no further work needed): #7, #11, #12, #15, #16, #17, #18, #19, #20 = **9 items**
- ⏳ **BLOCKED on external creds** (D-7a/b/d, เดฟ + Pacred owner): #2, #3, #4, #5, #6, #8, #9, #10 = **8 items**
- ⏳ **BLOCKED on owner decisions**: #13 (LINE login keep/remove), #14 (payment gateway provider) = **2 items**
- 🟡 **INTENTIONAL dev toggle**: #1 (`OTP_BYPASS=true` in dev — flips false at production deploy. Pure operational; no code change needed) = **1 item**

→ **Zero items remain "internally broken"**. All ⏳ badges trace to external dependencies (creds / 3rd-party signup / business decision). Production launch gate (Part N9) cannot proceed until 10 external-blocked items resolve, but they're all in เดฟ + Pacred owner court — no further ภูม code work required for N3.

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
| 4 PHP cron jobs ports: `send-line-sales`, `update-active-customers`, `update-sheet-sang`, `check-apprentice` | **2/4 SCAFFOLDED** by เดฟ (sales-daily-digest + refresh-active-customers); update-sheet-sang dropped as obsolete; check-apprentice deferred (schema work first) | dave (scaffolding) → ภูม P-15/P-16 (finish + verify) |

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

**Status check (2026-05-14):**
- ✅ P-1 ถึง P-14 เสร็จหมด (รายละเอียดใน commit log `bb747bf`..`1700144`)
- ✅ Bug fixes ของ Sprint 1-3 (approve/suspend, scan-form, etc.) — แก้แล้วบน dave commit `1a470ee`
- ✅ Sprint 1-3 admin features ครบ (A-1 ถึง A-15 + L-cleanup)
- 🟡 4 commits cleanup ค้าง `origin/Poom` (ยังไม่ merge เข้า main) — ต้องผ่าน Phase 0 review fixes ก่อน
- 🟡 ลำดับงานใหม่:

### ✅ Phase 0 — Pre-merge fixes (DONE 2026-05-14 by ภูม)

เดฟ review 4 commits (8db9140, 07535a5, 5cf2499, b8dd259) → flagged 3 fixes → ภูม ship ทั้ง 3 commits ก่อนเดฟกลับจากกินข้าว 🎯

| # | Fix | Resolution commit |
|---|---|---|
| ✅ **rev-1** | inline `<script>` ใน server `<head>` แทน `next/script beforeInteractive` (FOUC fix) — ภูม เพิ่ม `suppressHydrationWarning` ดีกว่าที่แนะนำด้วย | `0da2e71` |
| ✅ **rev-2** | Transfer Rep card ย้ายหลัง `AssignRepForm` | `ee63068` |
| ✅ **rev-3** | "Active ล่าสุด" sidebar gate `roles: ["sales_admin","accounting"]` | `8ad80d8` |

Bonus 5 commits ที่ภูมทำเพิ่ม (ไม่ได้ขอ — ดี proactive):
- `45205ba` cleanup misleading freight stubs + expose `/admin/rates`
- `a2d2e25` wire `contact_message` reference_type end-to-end (close P-6 follow-up gap)
- `ce5792e` support phone-only accounts in password/phone change
- `3f8b887` close minor finds from P-7 + P-9 audit
- `66c8fec` merge main into Poom (sync)

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

### Priority 3 (cron-jobs port — เดฟ scaffolded, ภูม finishes)

เดฟวางโครงไว้ที่ `app/api/cron/{sales-daily-digest,refresh-active-customers}/route.ts` + `vercel.json` อัปเดตแล้ว

| # | Task | Est | Description |
|---|---|---|---|
| **P-15** | Wire `sales-daily-digest` recipient/dispatch | 2-3h | Route at `app/api/cron/sales-daily-digest/route.ts` already computes yesterday + MTD totals across order_payment / import_payment / yuan_payment. Need: (a) extend `profiles.notify_channels` jsonb with `daily_digest` flag (new migration), (b) loop admins where `role IN ('super','sales_admin')` with flag on, (c) call `sendNotification()` per admin with the formatted message. See TODO block at end of route.ts |
| **P-16** | Verify + enable `refresh-active-customers` schedule | 1h | Route already implements full PHP behaviour (3 activity streams → flip `profiles.is_active=true`). Need: (a) confirm forwarder status enum exclusion is right (only `pending_payment` excluded, not `'rejected'` etc.), (b) confirm doesn't conflict with P-13 recently-active dashboard logic, (c) flip on the daily 01:00 UTC cron in production. Vercel cron entry already added |
| **P-17** | Port `check-apprentice` (deferred) | 4-6h | Two halves: (i) admin probation expiry — needs new column `employees.contract_end_date date`, then sweep employees where date passed → set `is_active=false`. (ii) driver assignment 17h timeout — blocked entirely on `forwarder_driver` table (not yet ported in cargo schema). Recommend splitting into two route handlers when ready |

### Priority 4 (waiting for owner decision)

- M2.2 Payroll module (decision D-9 with owner)
- M2.4 HS variants keep/merge (decision D-8 with owner)
- M2.5d Driver work shifts (after payroll decision)

---

## Sprint 6 — long runway for ภูม (self-directed, 2026-05-14 → unblocked)

> **Mode:** เดฟ บอก "ภูมบอกงานหมด ให้ทำยาวๆ ยั้นจบไปเลย ไม่ต้องรอ" → ภูม pick task ตามลำดับด้านล่าง self-direct ไม่ต้องรอ confirm  
> **กฎ:** สำหรับ task ที่ marked "no decision needed" — ลุยได้เลย commit/push ตามปกติ. สำหรับ task ที่ marked "ภูม decide" — เลือก default ที่แนะนำ + log decision ใน commit message (เดฟปรับย้อนหลังได้)  
> **ห้าม:** scope expansion ของแต่ละ task (เพิ่ม feature นอกเหนือสเปค) — ถ้าเห็นว่าควรขยาย ให้ commit ครอบเฉพาะสเปค + flag idea ใน PORT_PLAN เป็น `P-XX-followup`  
> **เป้าหมาย:** ปิด PHP cargo port 100% (Phase G remaining) + เริ่มเตรียม phase 2 (DPX ERP design)

### ✅ Priority 0 — Sprint 5 wrap-up (DONE 2026-05-14 by ภูม)

| # | Task | Resolution commit |
|---|---|---|
| ✅ **P-15** | sales-daily-digest dispatch — daily_digest flag in profiles.notify_channels + admin loop + sendNotification per opt-in | `e440a31` |
| ✅ **P-16** | refresh-active-customers verified + enabled — D-18 resolved as "keep both" (verified P-13 dashboard does NOT depend on is_active flag — independent concerns) | `6b5a517` |
| ✅ **P-17** | check-apprentice admin half — adapted to `admin_contact_extras.contract_end_date` (employees table doesn't exist; HR meta lives there per migration 0018). DECISION logged | `0479949` |

### ✅ Priority 1 — Cargo port completeness (DONE 2026-05-14 by ภูม)

| # | Task | Resolution commit |
|---|---|---|
| ✅ **P-18** | `forwarder_driver` table + admin CRUD + 17h expiry cron — full schema + RLS + composite indexes + cron auth pattern | `8bd04b7` |
| ✅ **P-19** | CSV bulk import (`csv_imports` table + Storage bucket + 3-stage workflow upload→preview→confirm + papaparse + 5MB/1000-row caps) | `e6c970b` |
| ✅ **P-20** | HS code rates (`hs_codes` + `container_hs_lines` + admin entry pages + aggregate report) | `dda663c` |
| 🟡 **P-21** | Notification template system (DRY) | not yet started — เลื่อนเป็น Sprint 6.5 |

### Priority 2 — HR module port + tests (~9-12h, no decisions needed)

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-22** | Time attendance system port | 4-6h | No | Port from PHP `time-attendance-system.php`. Migration `0030_time_attendance.sql` (already partial in 0020 — extend with `clock_in_at`, `clock_out_at` per day per employee, location, ip). Admin pages: `/admin/hr/attendance` (today's status grid) + `/admin/hr/attendance/[employee_id]` (individual log). Employee self-service: `/(protected)/attendance/clock` (browser clock-in with timestamp + IP). **Acceptance:** employee clocks in/out → admin sees status |
| **P-23** | Meeting room booking (`booking-meeting-room`) port | 2-3h | No | Migration `0031_meeting_rooms.sql` — `meeting_rooms` (id, name, capacity, equipment text) + `meeting_room_bookings` (room_id, organizer_id, start_at, end_at, title, attendees jsonb, status). Admin pages: `/admin/hr/rooms` (list+config) + `/admin/hr/rooms/bookings` (calendar view simple). Employee: `/(protected)/rooms/book`. Conflict detection: trigger or app check |
| **P-24** | Forwarder rate engine unit tests | 3-4h | No | Critical correctness path — `lib/forwarder/calc-price.ts` (rate waterfall + tier + juristic discount + service fee). Use `vitest` (not yet installed — add to devDeps). Cover: (a) general rate fallback (b) VIP override (c) custom rate per customer (d) juristic 1% discount on ≥1000 (e) +50 PCS service fee (f) KG vs CBM higher wins (g) free-shipping promo flag. Aim ≥30 test cases |

### Priority 3 — Audit + Phase 2 prep (~5-9h, mostly research)

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-25** | Re-audit Part N3 silent degraded modes | 1-2h | No | Walk Part N3.1 (8 items) + N3.2 (6 items) + N3.3 (6 items). For each, verify status today: still degraded / fixed / blocked on creds. Update Part N3 with current status per row. No code changes — doc only. **Acceptance:** all 20 rows updated with 2026-05-14 status |
| **P-26** | Integration test for service-order placement flow | 2-3h | No | End-to-end happy path test: create cart_items → place order (h_no gen) → admin update status through workflow → verify wallet_transactions ledger entry → verify notification sent. Use vitest + `lib/supabase/admin.ts` against test DB. **Acceptance:** 1 happy-path test green; verifies most-touched code paths |
| **P-27** | Phase 2 DPX ERP design doc draft | 2-4h | No | New file `docs/decisions/0003-dpx-erp-phase-2.md` — initial ADR draft. Cover: (a) what's DPX ERP scope vs cargo phase 1 (b) shared data model implications (c) auth + RBAC reuse (d) frontend redirect strategy. Draft only — not final. ภูม + เดฟ + ก๊อต iterate later. **Acceptance:** ADR file exists with sections + at least 2 open questions for stakeholders |

### 🟡 Audit findings — non-blocking follow-ups (เดฟ audit 2026-05-14 evening)

P-15..P-20 ทั้งหมด ship-ready แต่ผมไล่ review พบรายการเล็กที่ ภูม pick ได้ระหว่างกินข้าว/รอ Sprint 7 spec:

| # | Task | Est | Source | Description |
|---|---|---|---|---|
| **P-15-followup** | Admin self-service UI to toggle `daily_digest` flag | 30m | P-15 audit | ตอนนี้ admin flip flag ผ่าน Supabase Table Editor เท่านั้น — เพิ่ม checkbox ที่ `/admin/profile` หรือ `/admin/settings/notifications` ให้แต่ละ admin เปิด/ปิด digest เอง |
| **P-18-followup-rbac** | `requireAdmin(["ops"])` ที่ page-level | 15m | P-18 audit | `app/[locale]/(admin)/admin/drivers/page.tsx` + `[id]/page.tsx` ใช้ layout default `requireAdmin()` (any role). Sidebar gate แล้ว แต่ direct URL ลูกชาย admin role อื่นเข้าได้ (action enforce แล้ว — ไม่ใช่ security hole แค่ UX inconsistent). Add `await requireAdmin(["ops"])` top of both pages |
| **P-19-followup-batch** | Batch insert ใน `confirmCsvImport` | 30m | P-19 audit | ตอนนี้ N+1 inserts (1000 rows = 1000 round-trips). แก้เป็น `.insert([rows...])` chunked 100/batch |
| **P-19-followup-stale** | Stale "importing" recovery | 1h | P-19 audit | ถ้า process crash ระหว่าง import → row ค้าง `status='importing'` ตลอดไป. เพิ่ม `started_at` column + sweep cron (หรือ check on next read) ที่ flip > 10min old `importing` → `failed` |
| **P-20-followup-rls** | Tighten `hs_codes_select_all` RLS | 5m | P-20 audit | `using (true)` เปิด anon (intent คือ authenticated per comment). แก้เป็น `using (auth.role() = 'authenticated')`. Low-risk (HS code = public reference data) แต่ inconsistent กับ comment |
| **P-vercel-plan** | Verify Vercel plan supports 5 cron jobs | 15m | cross-cutting | vercel.json มี 5 cron entries ตอนนี้: auto-cancel-orders, sales-daily-digest, refresh-active-customers, expire-probation, expire-driver-assignments. Hobby plan limit = 2; Pro = 100/day per cron. เดฟ confirm Pacred ใช้ plan ไหน |

**Estimated total:** ~2-3h เก็บได้ทั้งหมดในรอบเดียว

### Priority 4 (still waiting for owner decision — unchanged)

- M2.2 Payroll module (decision D-9 with owner)
- M2.4 HS variants keep/merge (decision D-8 with owner)
- M2.5d Driver work shifts overlap (after payroll decision; some covered by P-18 forwarder_driver basic CRUD)

---

## Sprint 7+ — long runway tracks (open-ended menu, ~60-90h, self-directed)

> **Context (เดฟ บอก 2026-05-14 evening):** เดฟ + Claude pivoting to landing/customer-acquisition focus to drive growth — ภูม keeps grinding backend ยาวๆ. Pick from any track below in any order. Each track is themed + composable; no strict sequencing within or between tracks unless noted.
> **Mode:** ตาม §6 self-directed. ทุก task `Decision? = No` ยกเว้นที่ระบุ
> **Goal:** Get Pacred to **production-ready beta launch** — code health, observability, perf, docs, ERP phase 2 prep. Once these tracks land + creds + Pacred owner decisions arrive, Pacred can open beta to first customers
> **Order suggestion (high-leverage first):** Track A (tests) → Track B (hardening) → Track C (perf) → Track D (DPX ERP prep) → Track E (DevX/docs/gaps). But interleave at will

### Track A — Test coverage (~12-18h)

The biggest production risk for Pacred today is silent regressions in cargo math + auth flows. Tests = highest ROI safety net.

| # | Task | Est | Description |
|---|---|---|---|
| **P-21** | Notification template system (DRY) | 3-4h | New `lib/notifications/templates.ts` exporting typed builders: `salesDigest`, `forwarderStatusChange`, `walletDepositApproved`, `customerApproved`, `customerSuspended`, `paymentApproved`. Each returns `NotifyPayload` with category/title/body filled. Refactor ≥5 existing call sites in `actions/admin/*` to use templates. **Acceptance:** TS clean + diff shows literals removed |
| **P-24** | Forwarder rate engine unit tests | 3-4h | Critical correctness — `lib/forwarder/calc-price.ts`. Install `vitest` + `vitest.config.ts` + add `pnpm test:unit` script. Cover: (a) general rate fallback (b) VIP override (c) custom rate per customer (d) juristic 1% discount on ≥1000 (e) +50 PCS service fee (f) KG vs CBM higher wins (g) free-shipping promo flag (h) rounding edge cases. **Aim ≥30 cases**, all green |
| **P-26** | Service-order placement integration test | 2-3h | E2E happy path: create cart_items → place order (h_no gen) → admin update status through workflow → verify wallet_transactions ledger entry → verify notification sent. Use vitest + `lib/supabase/admin.ts` against test DB. **Acceptance:** 1 happy-path test green |
| **P-28** | OTP flow integration test | 2-3h | Cover: requestOtp → rate limit (3/h via DB) → verifyOtp success + wrong-code reject + expired reject → consumed-once enforcement. Mock SMS gateway. **Acceptance:** 6 cases green |
| **P-29** | Wallet ledger consistency test | 2-3h | Deposit → admin approve → trigger recomputes balance correctly. Multiple types (main/cashback/credit). Verify pending → completed transitions don't double-count. **Acceptance:** 4 cases green |
| **P-30** | Auth signup flow integration test | 2h | Personal signup → OAuth callback → complete-profile → status='active' → first login. Plus juristic flow. **Acceptance:** 2 happy paths green |
| **P-31** | Cart 151-item cap test (DB trigger) | 1h | Insert 150 items OK → 151st throws `cart cap reached (151 items)`. Verify trigger fires before insert. **Acceptance:** 1 case green |

### Track B — Production hardening (~10-15h)

Each item closes a real gap from Part N audit. Mostly small, high-leverage.

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-25** | Re-audit Part N3 silent degraded modes | 1-2h | No | Walk Part N3.1 (8) + N3.2 (6) + N3.3 (6 — most fixed by Sprint 5/6). Update each row with 2026-05-14 status. Doc only |
| **P-32** | SLA tracking — `started_at`/`completed_at` on long admin actions | 3-4h | No | Add columns to: `csv_imports` (already partial via P-19-followup-stale), `forwarder_driver` (assigned→accepted SLA), `forwarders` (status transition SLAs). Helps spot ops bottlenecks. Migration `0031_sla_tracking.sql`. **Acceptance:** queries against new columns work + 1 sample report at `/admin/reports/sla` |
| **P-33** | DB backup verification + restore drill | 3-4h | No | Document Supabase auto-backup retention; write `docs/runbook/db-restore.md` covering point-in-time restore procedure; do 1 dry-run restore to a staging DB and time it. Critical for production confidence. **Acceptance:** runbook exists + restore time recorded |
| **P-34** | Vercel Web Vitals + Speed Insights | 1-2h | No | Add `@vercel/speed-insights` to root layout + verify dashboard receives data (after deploy). One-line install per Vercel docs |
| **P-35** | Rate limit response headers | 1h | No | When `lib/rate-limit.ts` `checkRateLimit` triggers, return `X-RateLimit-Limit`, `-Remaining`, `-Reset`, `Retry-After` headers. Refactor `checkRateLimit` to optionally return headers object |
| **P-36** | Sentry alert rules (config doc) | 1h | No | Document recommended Sentry alert rules in `docs/runbook/sentry-alerts.md`: error rate > 10/h, specific scopes (auth, payment), new error type detection. **Activates after** Sentry DSN lands; doc-only now |

### Track C — Performance + bundle (~7-10h)

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-41** | N+1 query audit on admin pages | 3-4h | No | Walk every `/admin/*` server component. Look for loops calling `supabase.from()` per item. Fix via `.in()` batch / RLS-aware joins / RPC. Use `EXPLAIN` on slow ones. **Acceptance:** report at `docs/perf/admin-n1-audit.md` listing pages audited + fixes applied |
| **P-42** | Postgres index optimization | 3-4h | No | Run pg_stat_statements (or query the slow query log via Supabase dashboard) to find missing indexes. Add migration `0032_perf_indexes.sql` for the worst offenders. Most likely candidates: `notifications(profile_id, created_at)`, `wallet_transactions(profile_id, kind, status)`, `forwarders(profile_id, status, created_at)` — verify before adding |
| **P-43** | Bundle size audit per route | 2-3h | No | Use `@next/bundle-analyzer`. Run `ANALYZE=true pnpm build`. List routes > 200KB JS. Identify common heavy deps; lazy-load via `dynamic(import())` for non-critical paths. **Acceptance:** report + at least 1 route shrunk by 50KB+ |

### Track D — DPX ERP Phase 2 prep (~10-15h)

ปูทางสำหรับ phase 2 ก่อนที่ phase 1 cargo จะ launch — ออกแบบไว้ก่อน implement หลัง launch

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-27** | DPX ERP Phase 2 ADR draft | 2-4h | No (draft) | New `docs/decisions/0003-dpx-erp-phase-2.md`. Cover: (a) what's in scope vs cargo phase 1 (b) shared data model implications (c) auth+RBAC reuse (d) frontend redirect strategy (e) at least 2 open questions. Draft only — เดฟ + ก๊อต iterate later |
| **P-37** | ERP schema sketch | 3-4h | No | New `docs/decisions/0004-dpx-erp-schema-sketch.md`. List candidate tables (HR payroll, inventory beyond cargo, vendor mgmt, accounts payable, etc.). Mark which reuse phase-1 tables, which are new. Sketch FK relationships. Discussion fodder, not implementation |
| **P-38** | ERP auth + RBAC reuse | 2-3h | No | Document how phase 1 `admins` table + `is_admin()` SECURITY DEFINER reuses for ERP. Identify gaps: ERP-specific roles (e.g., `payroll_admin`), how to scope FE feature flags. Output: `docs/decisions/0005-erp-auth.md` |
| **P-39** | ERP frontend shell decision | 2-3h | เดฟ + ก๊อต | Trade-off: separate Next.js app vs `/erp/*` route in same app vs subdomain. Pros/cons table; recommend one. Output: `docs/decisions/0006-erp-frontend-shell.md` |
| **P-40** | ERP migration strategy | 2-3h | No | Once phase 2 ready, how do active customers transition? Big-bang? Gradual feature flag? Output: `docs/decisions/0007-erp-migration-strategy.md` |

### Track E — DevX + docs + remaining gaps (~13-20h)

Make the codebase pleasant to work in for the next 6 months + close any PHP feature gaps

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-22** | Time attendance system port | 4-6h | No | Port from PHP `time-attendance-system.php`. Migration `0033_time_attendance.sql` (extend HR module — `clock_in_at`, `clock_out_at` per day per employee, location, IP). Admin: `/admin/hr/attendance` (today grid) + `/admin/hr/attendance/[employee_id]` (individual log). Employee self-service: `/(protected)/attendance/clock`. **Acceptance:** employee clocks in/out → admin sees status |
| **P-23** | Meeting room booking port | 2-3h | No | Migration `0034_meeting_rooms.sql` (`meeting_rooms` + `meeting_room_bookings`). Admin: `/admin/hr/rooms` + `/admin/hr/rooms/bookings`. Employee: `/(protected)/rooms/book`. Conflict detection via DB trigger or app check |
| **P-44** | API documentation backfill | 3-4h | No | Add JSDoc `@param`/`@returns`/`@throws` to all server actions in `actions/`. Optional: install `typedoc` + generate `docs/api/`. **Acceptance:** every exported action has JSDoc + auto-generated docs (if typedoc) build green |
| **P-45** | Production runbook | 3-4h | No | New `docs/runbook/` directory. Files: `oncall.md` (who to call when), `common-issues.md` (FAQ for ops), `deploy.md` (rollback procedure), `db-restore.md` (from P-33), `sentry-alerts.md` (from P-36). **Acceptance:** runbook exists + reviewed by ก๊อต at next standup |
| **P-46** | Admin SOP document | 2-3h | No | New `docs/sop/admin-operations.md`. Cover common admin tasks: refund customer, cancel order, transfer rep, approve juristic, recompute wallet, etc. Step-by-step with screenshots if possible. ภูม knows admin UX best — write it down before knowledge atrophies |
| **P-47** | Migration template helper | 1-2h | No | New `scripts/new-migration.mjs`: `pnpm migrate:new <name>` → creates `supabase/migrations/<next-num>_<name>.sql` with header template (Phase ref, RLS reminder, drop-trigger pattern, etc.). Reduces friction for ภูม's many remaining migrations |
| **P-48** | Local data seeding script | 2-3h | No | New `scripts/seed-dev.mjs`: idempotent seed of profiles + admins + 1 forwarder + 1 service-order + sample wallet activity. Run via `pnpm seed:dev`. Critical for new dev onboarding (ดู §8 of team.md). **Acceptance:** new clone → `pnpm seed:dev` → `/dashboard` shows data |
| **P-49** | Search admin tools port (`users-search` / `shop-search`) | 4-6h | No | Port PHP admin search across customers + shops. Already partly done via existing `/admin/customers` filter; this expands with full-text search via Postgres `tsvector` or similar |

### Track F — Anything ภูม spots (open invitation)

ภูม audit codebase ตอน free time → propose new tracks via `docs/decisions/00XX-<theme>.md` ADR + ping เดฟ. Keep this section as a reminder that the runway is intentionally open-ended

### Track G — China search rewire + carrier APIs (URGENT — from PHP audit 2026-05-14)

> **Source:** `docs/audit/php-pcscargo-integrations.md` (deep audit ของ legacy PHP) — เปิดเผยว่า Pacred lib/china-search/index.ts wired ผิด. RCGroup-TH = dead code in PHP! Real flow = TAMIT (detail) + tam-i-t (cache) + AkuCargo (keyword) + Laonet (image)
>
> **Why CRITICAL:** Pacred URL-paste converter, keyword search, image search ทุกอันใช้ `PACRED_RCGROUP_API_URL` ที่ไม่มี response → fallback demo mode → ลูกค้ากรอกราคาเอง สับสน
>
> **🚨 STATUS UPDATE 2026-05-15 (ภูม):** P-50, P-51, P-52, P-53 ✅ shipped to `origin/Poom` per spec.  **BUT — owner (ก๊อต+เดฟ) flagged 2026-05-15 ค่ำ ว่าห้าม activate ใน production** จนกว่าจะตัดสินใจ vendor cutoff strategy.  All 4 endpoints (TAMIT/tam-i-t/AkuCargo/Laonet) เป็น vendor PCS Cargo เก่า — ดู [Part R §R1](#part-r--vendor-cutoff--urgent-decisions-for-กอต--เดฟ-2026-05-15) สำหรับ Option A-E + ก๊อต/เดฟ decision.  Code นั่งนิ่งใน repo รอ env-var flip; demo fallback ทำงานได้ — production interim acceptable.

| # | Task | Est | Decision? | Description |
|---|---|---|---|---|
| **P-50** 🔴 | Rewire `lib/china-search/index.ts` to TAMIT-cloud | 4-6h | No | Replace `convertProductUrl` + `convertProductUrlDetail` to use `PACRED_TAMIT_DETAIL_URL` + endpoint pattern `/get/{1688\|taobao}/?id={productID}`. Keep `buildDemoDetail()` fallback. Update `normaliseDetail` to consume actual TAMIT response shape (`json.status==200 → json.data.{title,vendor,listImage,mainImage,sku,skuMap,priceRanges,referencePrice,mainVedio,detail}`). **Acceptance:** paste real Taobao URL locally → see real product title + image + SKU axes |
| **P-51** | Add tam-i-t.com short-URL cache layer | 2-3h | No | New helper `lib/china-search/short-url-cache.ts`. Before TAMIT call: `GET {PACRED_TAMIT_CACHE_URL}/get[/taobao]/?tk={tk}` → if 204, fetch URL with desktop UA spoof, scrape productID via regex (`Id%3D` / `Foffer%2F` / `id=`), `POST` back to `/save/?tk=...&provider={1\|2}&productID=...`. Cache the result in-memory + DB (cart_items url field already serves as poor-man's cache). **Acceptance:** paste short Taobao URL `m.tb.cn/{tk}` → resolves to detail. Spec verbatim in `docs/audit/php-pcscargo-integrations.md` §3b |
| **P-52** | Add AkuCargo keyword search adapter | 2-3h | No | New `lib/china-search/akucargo.ts`. Replace `searchKeyword()` to call `{PACRED_AKUCARGO_API_URL}/search/v1[/taobao]/?q={words}&page={N}&page_size=15&lang=zh-CN` with desktop Firefox UA. Response shape `json.items.item[i].{detail_url,pic_url,title,price,promotion_price,sales}`. **Acceptance:** type Thai or Chinese keyword → get hits with real prices |
| **P-53** | Add Laonet image search adapter | 2-3h | No | New `lib/china-search/laonet.ts`. Replace `searchByImage(file)` to: (a) upload file as base64 → `{PACRED_LAONET_API_URL}/index.php?route=api_tester/call&api_name=upload_img&imgcode={b64}&key={PACRED_LAONET_KEY}` returns `imgid` (b) search → `?api_name=item_search_img&imgid={imgid}&key={PACRED_LAONET_KEY}` returns hits. **Acceptance:** upload product photo → get similar 1688 products |
| **P-54** ✅ | LINE Messaging API ACTIVATED — creds in `.env.local` | done by เดฟ | — | All 3 vars set 2026-05-14: `LINE_CHANNEL_ID`/`_SECRET`/`_ACCESS_TOKEN`. Production needs same in Vercel env + `LINE_PUSH_BYPASS=false`. ภูม: P-15 dispatch wiring (already done in `e440a31`) → real LINE pushes when bypass off. Future task: webhook receiver for LINE OA (signature verify uses `LINE_CHANNEL_SECRET`) |
| **D-1-LIFF** 🟡 SCAFFOLDED by เดฟ | LINE LIFF for customer→profile linkage (`profiles.line_user_id` populator) | 4-6h spec → 1-2h remaining | No (recommended LIFF default) | **Why:** Pacred has LINE creds + push code ready, BUT no customer has `line_user_id` linked → no customer gets push. Without this, the entire LINE notification pipeline is dead-end. **เดฟ scaffolded** (a)+(b)+(c)+(d) on 2026-05-14 evening: `@line/liff` installed · `app/[locale]/liff/link/page.tsx` client component with full state machine (loading/needs_pacred_login/linking/success/error) · `actions/profile.ts:linkLineAccount(lineUserId)` with U-prefix validation + 23505 unique-constraint error mapping · `NEXT_PUBLIC_LIFF_ID` env var documented. **ภูม pickup remaining:** (e) UI hookup — add "เชื่อม LINE OA" button at `/profile` + landing CTA (could ask ปอน to do landing CTA part) (f) End-to-end test on real device with real LIFF ID after Pacred owner creates LIFF app in console. **Activation order:** owner creates LIFF in LINE Console → Vercel env `NEXT_PUBLIC_LIFF_ID` → ภูม wire CTAs → ship |
| **P-55** | Verify Vercel egress IP allowlist with TAMIT/AkuCargo/Laonet/tam-i-t | 1h | ภูม + เดฟ | Vercel function egress IP differs from legacy XAMPP/cPanel. Check after P-50 lands — if real API returns 403/blocked, contact vendor (likely all 4 services owned by same vendor `tam011plus@gmail.com`) to allowlist Vercel. Document Vercel egress IP block in `docs/runbook/vendor-allowlist.md` |
| **P-56** | (Future) JMFCARGO carrier sync port | 6-8h | เดฟ + ก๊อต | Two-way sync over HTTP. PCS↔JMF via `JMF_CARGO_TOKEN` (concat of legacy Tiso key+secret). Receiving endpoint at `/api/integrations/jmf-cargo/inbound/route.ts`. Outbound calls in admin actions. Lower priority — only if Pacred wants JMF integration. Spec in audit §9a |
| **P-57** | (Future) CargoThai TTP/CN container API port | 4-6h | เดฟ + ก๊อต | Active legacy carrier (`a807f4fe...`, `aea07c4d...` query-string `_token`). Endpoint `https://cargothai.tech/api/service/{GetContainer,GetDetail}`. Lower priority — only if Pacred uses these carriers. Spec in audit §9b |

---

**Sprint 7+ estimate:** ~60-90h → 4-8 weeks part-time. Combined with Sprint 6.5 (~2-3h follow-ups), ภูม has ~70-95h runway

**Hand-off rule (unchanged):** หลังจบ task → push branch + commit อัพเดท PORT_PLAN Part P snapshot ว่า P-XX done. DECISION blocks for trade-offs. Flag scope expansion as `P-XX-followup` instead of widening current task

## O3. 👤 ปอน (podeng) — Sprint 5 (FRONTEND/SEO/LANDING FOCUS)

**Strategy:** ทำงานเป็น phase สั้นๆ — เสร็จ 1 phase → ส่งเดฟ confirm → เริ่ม phase ถัดไป (feedback จากเดฟ 2026-05-14: "เริ่มคิดนานนะ ลองแบ่งเฟส คิด หรือ แยก หัวคิด แล้ว ให้คอนเฟิม")
**สถานะ 2026-05-14 evening:** Phase A (SEO foundation L-1..L-9 + 5 bonus) ✅ shipped — ดูตาราง ✅ COMPLETED ด้านล่าง. งานต่อ = Phase B (L-5 landing polish, ต้อง decision) + L-8 mobile QA (blocked) + Phase D L-9b/c i18n polish + Phase C+ ecosystem expansion (L-10..L-20, ต้อง decision)

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
| ✅ **Bonus 6** | `pacred.co/line` short link | `app/[locale]/(public)/line/page.tsx` — server `redirect()` to `https://lin.ee/Yg3fU0I` (307) so we can print/share `pacred.co/line` and rotate the LINE OA channel from one file. Updated 11 user-facing components (footer, navbar, floating-tabs, contact-sales, clearance-promo, import-export-banner, pricing-section, purchase-banner, warehouse-detail, knowledge/article-content, ui/sales-carousel) + FAQ text to use `/line`. `SOCIAL.line` in `components/seo/site.ts` stays canonical for JSON-LD `sameAs`. **TODO for เดฟ/ก๊อต:** `lib/booking-data.ts` 3 sales reps also use `lin.ee/Yg3fU0I` — swap to `/line` from lead scope when convenient. |
| ✅ **Bonus 7** | Mobile booking tabs + LCL/FCL split + trust-ribbon removed | `components/booking/BookingTabs.tsx` — removed `justify-center` (was hiding sea/truck on mobile because `air` is centered), added `snap-x snap-proximity` + mask-image fade + pulsing `<ChevronRight>` scroll affordance + `scrollIntoView` of active tab on change. `components/sections/pricing-section.tsx` — `FREIGHT_CARDS` now grouped `lcl`/`fcl`, prices refreshed per Google Doc rate sheet (LCL Truck DDP ฿5,500/CBM · LCL Sea DDP ฿3,500/CBM · FCL 20ft DDP ฿135,000 · FCL 40HQ DDP ฿155,000). Render split into 2 stacked `<FreightGroupRow>` sections (LCL row + FCL row), each with own eyebrow/title/sub. **`MobileTrustRibbon` polished 2×2 then dropped entirely** per Pacred owner — `components/sections/mobile-trust-ribbon.tsx` deleted; usages removed from home + customs-clearance pages. |

### ⚠️ L-pricing-fix — RETRACTED (audit false alarm, 2026-05-14 evening)

เดฟ audit รอบแรกอ้างว่า 6 keys (`lcl/fcl SectionEyebrow/Title/Sub`) missing จาก `messages/{th,en}.json` ในcommit `129ef5a`. **ตรวจรอบสองหลัง merge:** keys อยู่ครบที่ line 1705-1710 ในทั้ง 2 locale ของ pricing namespace block. ปอน add ไว้แล้วใน same commit (audit agent miss). NO blocker — `129ef5a` ship-ready. **Bonus 6+7 merged into dave/main** 2026-05-14 evening (commit `<TBD>`)

> **Lesson learned (เพิ่มใน team.md §6 etiquette):** อย่า trust agent audit 100% — verify directly by `grep` ก่อน flag blocker. ทุก audit ที่อ้าง "missing key/file" ต้อง paste grep output ที่แสดง absent ก่อน accept
> **Optional follow-up:** **L-9d-followup** — ขยาย `scripts/i18n-audit.mjs` ให้ grep source `t()` calls vs key existence — ป้องกัน false negatives ในอนาคต

### 🟡 REMAINING (Sprint 5 Day 4+)

| # | Task | Est | Description |
|---|---|---|---|
| 🟡 **L-5** | Audit + polish ทุก service landing | 6-8h | `/services/import-china`, `/services/import-china-fcl`, `/services/import-china-lcl`, `/services/export-worldwide`, `/services/china-shopping` — content, CTAs, mobile UX. (`/services/customs-clearance` already has full content via existing `Clearance*` components.) Recommendation: replace `StubPage` with real layout per service |
| 🔴 **L-8** | Mobile responsive QA top 10 pages | 4-6h | Audit + fix layout issues with browser devtools. **Blocked: needs real device or BrowserStack testing — Claude session can only spot-check via curl/CSS** |
| ✅ **L-line-refactor** DONE 2026-05-14 by เดฟ | Centralise LINE OA URLs from hardcoded strings → `LINE_OA` constants | done | Audit revealed only 5 real refactor targets (most components already used the local `/line` redirect indirection ✅): `app/[locale]/(public)/line/page.tsx` (the redirect itself) + `clearance-banner.tsx` (mismatch `r3b1BuOC` standardised to canonical) + `clearance-cards.tsx` + `promotion.tsx` (4 sites) + `lib/booking-data.ts` (3 sales-rep entries with same default URL). All now import `LINE_OA.shortUrl` or `LINE_OA.addFriendUrl`. Verify: `grep -rn 'lin\.ee\|line\.me/ti/p'` returns only the constant definitions in `components/seo/site.ts` + 1 traceability comment in `clearance-banner.tsx` |

> ✅ **Phase A1+A2+A3 finished as one bundle** by ปอน 2026-05-14 (commit `a0d9d83`) — pattern below applies to remaining work (L-5/L-8/L-10..L-20)
> 🟢 **Bonus 6+7 shipped** 2026-05-14 evening — pacred.co/line shortlink + booking tabs mobile fix + LCL/FCL pricing split + drop MobileTrustRibbon
> ⚠️ **§6 watch-item:** commit `c6c5d58` claims "per Pacred owner" but no LINE/voice trail in repo. Action is scope-correct (clean delete) — log as precedent for §6 trust. ปอน confirm in next standup whether owner walked over to her desk

> **กฎ checkpoint สำหรับ phase ที่เหลือ:** ทุกเฟสจบ → ส่ง output ให้เดฟใน LINE → รอ "go" ก่อนเริ่ม phase ถัดไป — ห้ามทำหลาย phase พร้อมกัน ถ้ายังไม่ได้ confirm

---

### Phase B — Landing page polish (DECISION CHECKPOINT FIRST)

**🛑 ก่อนเริ่ม Phase B ขอเดฟ confirm 2 ข้อใน LINE:**
1. **Priority pages** — page ไหน polish ก่อน? (ปอน suggest: home → import-china → china-shopping → customs-clearance ตามลำดับ)
2. **Style update** — มี design tokens ใหม่หรือยังใช้ของเดิม?

หลัง confirm:
- [ ] **L-5a** Polish page #1 ที่เดฟเลือก (2-3h)
- [ ] **L-5b** Polish page #2 (2-3h)
- ... (ทำทีละ page → checkpoint after each)

ส่วนของ L-5 อื่นๆ:
- [ ] **L-7** FAQ + FAQPage JSON-LD (2h)
- [ ] **L-8** Mobile responsive QA top 10 pages (4-6h) — ใช้ browser devtools / Playwright

**🛑 CHECKPOINT B-final:** หลังทุก page โดน polish — Lighthouse score แต่ละ page > 90 mobile + 95 desktop

---

### Phase D — i18n polish (~2-3h, partial — script done by ปอน)

- [x] ✅ **L-9a script** — `scripts/i18n-audit.mjs` ports diff (committed by ปอน in `a0d9d83`); current state = 1770 keys × 2 locales, 0 missing
- [ ] **L-9b** Normalize namespace pattern (`page.section.element`) — refactor existing keys
- [ ] **L-9c** EN translation polish — run script ออก same-value list → review machine TL

**🛑 CHECKPOINT D:** PR diff ของ messages/*.json — เดฟ review

---

### Phase C+ — Pacred Ecosystem expansion landing pages (DECISION REQUIRED FIRST)

11 new service landing pages (L-10 ถึง L-20) — ต้องถามเดฟ + Pacred owner ก่อน:

**🛑 BEFORE STARTING ANY of L-10..L-20:**
1. **Style guide** — ใช้ของเดิม (red/dark) หรือ design ใหม่?
2. **Content** — ปอนเขียน copy เอง / marketing person / AI draft + edit?
3. **Images** — มี asset library / use stock / commission?
4. **Priority order** — services ไหนสำคัญก่อน? (ปอน suggest: customs-clearance + export ก่อน เพราะ ecosystem ใหม่ไม่ครอบเดิม + revenue สูง)

หลัง decisions ครบ → ทำทีละ service → checkpoint after each

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

---

### Phase E — Performance + analytics (สุดท้าย — เมื่อ landing เสร็จแล้ว)

| # | Task | Est | Description |
|---|---|---|---|
| **L-21** | Image optimization (lazy + WebP) | 4-6h | Audit `<Image>` usage, use proper sizes, lazy load below-fold |
| **L-22** | Conversion tracking (GTM/GA4) | 3-4h | Setup events: page_view, cta_click, register_start, register_complete |
| **L-23** | Heatmap (Microsoft Clarity or Hotjar) | 1-2h | Setup tracking |
| **L-24** | A/B test infrastructure | TBD | If GrowthBook or similar chosen |

**🛑 ก่อน Phase E:** ขอเดฟยืนยันว่า analytics tools เลือกอะไร (GA4? GTM? Clarity? Hotjar?)

---

**Estimated:**
- Phase A1+A2+A3: ~9-12h → 2-3 sessions ของปอน
- Phase B + D: ~15-20h → 4-5 sessions
- Phase C+ (11 services): +40-50h → ขึ้นกับ owner priority + content readiness
- Phase E: +10-15h

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
11. ✅ **cron-scaffold** Cron jobs port (Part N5 row 4 of 4) — scaffolded `/api/cron/sales-daily-digest` (auth + aggregations done; ภูม wires dispatch — P-15) + `/api/cron/refresh-active-customers` (full impl; ภูม verifies + enables — P-16). Dropped `update-sheet-sang` as obsolete. `check-apprentice` deferred (needs schema). vercel.json updated with 2 new entries.
12. ✅ **D-11** Sentry SDK scaffolding — `instrumentation.ts` + `instrumentation-client.ts` + `sentry.{server,edge}.config.ts` + `next.config.ts` wrapped with `withSentryConfig` + `lib/logger.ts` `logger.error()` forwards to `Sentry.captureException` + env vars documented in `.env.example` + `docs/env.md` §13. SDK is no-op when `SENTRY_DSN` unset (safe for dev). Self-audit fix in `cae1082` (drop integrations:[] regression, add edge PII strip, tag cardinality). Activation = drop DSN in Vercel env → redeploy → errors flow
13. ✅ **D-12** Rate limit abstraction — `lib/rate-limit.ts` with Upstash adapter (when `UPSTASH_REDIS_REST_URL`+`_TOKEN` set) + in-memory `Map` fallback (dev only). Pre-configured limits: signup 5/h/IP · login 10/h/IP · passwordReset 5/h/IP · contact 5/h/IP · generic 30/min. `checkRateLimit(name, key)` returns `{ ok:false, error:'rate_limit', retryAfterSeconds }` or `null` to continue. `getClientIp(req)` extracts from `x-forwarded-for`. Sliding-window via Upstash (fairer than fixed). Wiring to specific endpoints = follow-up task (won't auto-wire to avoid surprise UX). Env vars documented `.env.example` + `docs/env.md` §13. Note: complementary to existing OTP DB-backed limit in `actions/otp.ts` (3/h/phone via `otp_codes` table — that one doubles as audit trail)
14. ✅ **D-13** hCaptcha invisible scaffolding — `lib/hcaptcha.ts` server-side `verifyHcaptcha(token, ip)` posting to `api.hcaptcha.com/siteverify` (dev no-op when secret unset; prod fails-closed) + `components/hcaptcha-invisible.tsx` client `forwardRef` component with promise-based `execute()` + `reset()` API. Renders nothing when site key unset. Both vars (`NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY`) documented `.env.example` + `docs/env.md` §12. Wiring to forms (signup / contact / password reset) = D-13-wire follow-up (won't auto-wire to avoid surprise UX). Pairs with D-12 rate limit (defense in depth)

### 🟡 REMAINING (Sprint 5 Days 3+)
15. 🔴 **D-7a** Set 3rd-party API env vars + verify endpoints (2-4h) — **blocked: need real credentials** (RCGroup URL, TAMIT URL, ThaiBulkSMS keys, PromptPay ID)
16. 🔴 **D-7b** LINE Messaging API setup (3-4h) — **blocked: need LINE Channel Access Token from Pacred OA**
17. 🟡 **D-11-activate** Get Sentry account + DSN → drop in Vercel env (15-30m) — **blocked: need Pacred owner to create Sentry account / authorize use**
18. 🟡 **D-12-activate** Create Upstash Redis DB + drop creds in Vercel env (15-30m) — **blocked: need Pacred owner to authorize**
19. ✅ **D-12-wire** DONE 2026-05-14 evening — `checkRateLimit` wired into 6 server actions: `submitContactMessage` (contact 5/h/IP) + `signIn` (login 10/h/IP) + `registerPersonal` + `registerJuristicStep1` (signup 5/h/IP) + `requestPasswordResetByPhone` + `requestPasswordResetByEmail` (passwordReset 5/h/IP). New helper `getClientIpFromHeaders` in `lib/rate-limit.ts` for Server Action use. Returns `{ ok:false, error:'rate_limit', retryAfterSeconds }` — UI shows friendly Thai error
20. 🟡 **D-13-activate** Create hCaptcha site (Type=Invisible) → drop site/secret in Vercel env (15-30m) — **blocked: need Pacred owner to create hCaptcha account**
21. ✅ **D-13-wire** DONE 2026-05-14 evening — `<HCaptchaInvisible />` widget added to `components/contact-form.tsx` + `app/[locale]/(auth)/register/page.tsx` (PersonalForm + JuristicForm step 1) + `app/[locale]/(auth)/forgot-password/page.tsx` (shared between phone+email request flows). Token passed via `captchaToken` field added to validators (`registerPersonalSchema`, `registerJuristicStep1Schema`, `resetByPhoneSchema`, `resetByEmailSchema`, `contactMessageSchema`). Server-side `verifyHcaptcha(token, ip)` enforces in 5 server actions (`signIn` opted out — too friction for credential-stuffing UX). Reset on error so retry obtains fresh token. Dev no-op when site key + secret unset (`HCaptchaInvisible` renders null + `verifyHcaptcha` returns success)
22. ⚪ **D-7c** Decision: Payment Gateway provider (with Pacred owner) → M2.1 design

**Estimated remaining:** ~14-21h once credentials/decisions are in hand
**Sprint 5 Days 1-2 actual:** ~3-4 commits, lint clean, build pass, 50/50 tests
**Sprint 5 Day 3:** cron scaffolding + collab pattern docs (3 commits) → merged into main `eec4b69`
**Sprint 5 Day 3 evening:** D-11 Sentry + audit fix + D-12 rate-limit + D-13 hCaptcha all scaffolded on dave (4 commits) — เดฟ blocked items down to D-7a/b + decisions; activations only need creds

## O5. 👤 ก๊อต — Production Watcher + Senior Advisor (expanded scope 2026-05-15)

**Primary role:** Production gatekeeper — every dave→main merge passes through ก๊อต. Beyond that: architectural review, security audits, upgrades, and ADRs that need senior judgment.

> **เดฟ บอก 2026-05-15:** "ก๊อตบอกไม่มีงาน — คนเก่งๆ อย่าให้เสียของ ให้ upgrade/refactor". Below = substantial track ก๊อต self-direct ก่อน reach for new work.

### Track K1 — Production gatekeeping (continuous)

| # | Task | Cadence |
|---|---|---|
| **K-merge** | Review `dave→main` per `team.md` §3 ก๊อต flow | Per-batch (every 1-3 days) |
| **K-runbook** | Maintain `docs/runbook/` — oncall + deploy + restore + Sentry alerts (per P-45) | Continuous as new infra lands |
| **K-CODEOWNERS** | Set up `.github/CODEOWNERS` so PRs auto-request ก๊อต review | One-time, ~30m |

### Track K2 — Architectural reviews + ADRs (~12-18h)

ก๊อต = senior architect → write ADRs that lock direction before น้อง implements.

| # | Task | Est | Description |
|---|---|---|---|
| **K-ADR-vendor-cutoff** 🚨 | ADR for Part R1 (china-search vendor cutoff strategy) — Option A/B/C/D/E choice + rationale | 2-3h | New `docs/decisions/0003-china-search-vendor.md`. Lock ก๊อต+เดฟ choice. ภูม unblocked |
| **K-ADR-payment-gateway** 🚨 | ADR for D-7 (Omise / 2C2P / Stripe TH / PromptPay-only) | 2-3h | New `docs/decisions/0004-payment-gateway.md`. Once locked, เดฟ leads M2.1 (~40-60h) |
| **K-ADR-erp-phase-2** | Co-author with ภูม (P-27 Sprint 7+ Track D) | 4-6h | DPX ERP phase 2 design — what's in scope vs phase 1 cargo |
| **K-ADR-rbac-future** | Audit current `admins` table + `is_admin()` flow → propose ERP role expansion (P-38 Sprint 7+ Track D) | 2-3h | New ADR; shapes DPX phase 2 auth |
| **K-ADR-tax-invoice** | Lock numbering format (`INV-YYYYMM-NNNN`?) + flow design before ภูม implements | 2-3h | New ADR; needed before tax invoice port |

### Track K3 — Security + production audit (~10-15h)

ก๊อต = production safety lens. ตรวจสอบสิ่งที่ team อาจมองข้าม.

| # | Task | Est | Description |
|---|---|---|---|
| **K-sec-1** | OWASP Top 10 audit on Pacred — go through each: SQL injection (Zod validators), XSS (React+Tailwind = mostly safe), CSRF (Server Actions native), auth (Supabase + RLS), broken access control (admin RBAC), security misconfiguration (CSP+headers), etc. | 4-6h | Output: `docs/audit/owasp-2026-05.md` with status per item + open risks |
| **K-sec-2** | RLS policy comprehensive audit — every Supabase table: who can read/write? — match against `actions/admin/*` callers | 3-4h | Output: `docs/audit/rls-coverage.md`. Critical: missing RLS = data leak |
| **K-sec-3** | Audit log coverage — every admin mutation in `actions/admin/*` calls `logAdminAction()`? | 1-2h | Output: gap report + commits to fix |
| **K-sec-4** | Penetration testing prep — coordinate external pen test (vendor recommendation + scope + timeline) | 2-3h | Plan only, exec post-launch |

### Track K4 — Tech upgrade + tooling (~8-12h, ก๊อต self-direct)

| # | Task | Est | Description |
|---|---|---|---|
| **K-upgrade-1** | Audit Next 16 → 17 upgrade path — dependencies, breaking changes, est effort | 2-3h | Doc only. Don't upgrade yet (Next 16 stable enough for beta) |
| **K-upgrade-2** | Audit Tailwind v4 → future + config strategy | 1-2h | Doc only |
| **K-upgrade-3** | Supabase upgrade strategy (CLI version, migration tooling, plan tier) | 2-3h | Doc + estimate |
| **K-tooling-1** | Set up `.github/workflows/ci.yml` — auto run lint+test+build on PR | 2-3h | CI quality gate before manual review |
| **K-tooling-2** | Renovate / Dependabot setup — automated dep PRs | 1h | Reduces ก๊อต overhead long-term |

### Track K5 — Code quality + refactor (~10-15h)

| # | Task | Est | Description |
|---|---|---|---|
| **K-quality-1** | Read every file in `actions/admin/*` — propose extract-helper / DRY opportunities | 4-5h | Output: refactor proposals; ภูม executes if approved |
| **K-quality-2** | Audit `lib/` for duplicated patterns — e.g., 3 similar fetch wrappers? Consolidate | 3-4h | Output: consolidation proposals |
| **K-quality-3** | TypeScript strictness audit — any `any` slipping through? Loose nullable types? | 2-3h | Output: gap list |
| **K-quality-4** | Bundle size deep dive (alongside ภูม P-43) — identify shared bloat | 2-3h | Co-audit with ภูม Track C |

### Track K6 — Documentation strategy (~5-8h)

| # | Task | Est | Description |
|---|---|---|---|
| **K-docs-1** | Audit `docs/HANDBOOK.md` — is the entry point still accurate after 2 weeks of churn? | 1-2h | Update if drift |
| **K-docs-2** | Audit `docs/PORT_PLAN.md` size (3000+ lines) — propose split into `docs/sprints/` if too long | 1-2h | Don't split yet, but flag threshold |
| **K-docs-3** | Onboarding test — fresh clone + follow `docs/team.md` §8 → does it work? | 2-3h | Output: gap fix; critical for new team members |
| **K-docs-4** | Customer-facing FAQ + product docs strategy (separate from `docs/sop/admin-operations.md` from P-46) | 1-2h | Plan only |

### Track K7 — Strategic / business-side (consulting hours, async)

| # | Task | Est | Description |
|---|---|---|---|
| **K-strat-1** | Pacred owner call agenda runner — ดู Part Q + Part R outstanding | per-call | Schedule + lead |
| **K-strat-2** | Pricing strategy review — booking calculator output vs competitor pricing | 2-3h | Marketing input for ปอน landing |
| **K-strat-3** | DPX ERP phase 2 stakeholder alignment | TBD | Coordinate with Pacred owner + เดฟ |

---

**ก๊อต total runway:** ~50-80h across 7 tracks. Self-directed via §6. Async — no hard sequencing except K2 ADRs that unblock น้อง.

**Recommended start order (high-impact first):**
1. **K-ADR-vendor-cutoff** (2-3h) — unblocks ภูม Track G + production-readiness
2. **K-ADR-payment-gateway** (2-3h) — unblocks เดฟ M2.1
3. **K-tooling-1** CI workflow (2-3h) — quality multiplier going forward
4. **K-sec-1** OWASP audit (4-6h) — production launch confidence
5. **K-CODEOWNERS** (30m) — automates review routing
6. Then K3/K4/K5/K6 in any order

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

---

# Part P — Day 3 evening checkpoint (2026-05-14)

> **What landed since morning:** Two parallel wave merges. ภูม cleared Sprint 6 P-15..P-20 (16-22h work in one session) + Phase 0 review fixes; ปอน shipped SEO bundle L-1..L-9 + 7 bonus items; เดฟ shipped cron scaffolds + Sentry/rate-limit/hCaptcha SDK scaffolds + collab pattern §9. Main went from `5475f14` → `e9da976` in one day across 25+ commits from 3 contributors using §9 async via Claude Code.
> **Per-person tasks:** O2/O3/O4

## P1. State of branches now (post-Day-3-evening)

| Branch | HEAD | Status |
|---|---|---|
| `origin/main` | `e9da976` | latest stable — has P-1..P-20 + Sentry/rate-limit/hCaptcha + SEO bundle + Phase 0 fixes |
| `origin/dave` | `e9da976` | == main |
| `origin/Poom` | `dda663c` | merged into main ✅ — ภูม picks Sprint 6 follow-ups (P-15-followup..P-20-followup, ~2-3h) or Priority 2/3 next |
| `origin/podeng` | `c6c5d58` | merged into dave/main ✅ — L-pricing-fix was a false alarm (keys exist) |

**Validation Claude Code collab pattern (§9):** ภูม commit `0da2e71` อ้างอิง "per Part P review" + ภูม Sprint 6 commits ทุกตัวมี explicit `DECISION:` blocks per §6. ปอน Bonus 6+7 ส่งเสริม Phase A. **3 contributors shipped 14-15h work each in 1 day async, zero coordination meetings** = pattern works.

## P1.5 ที่ landed ใน main today

จาก `5475f14` → `e9da976` (3 wave merges):

**Wave 1 — afternoon merge** (`b941903`): Phase 0 fixes + SEO bundle L-1..L-9 + cron scaffolds (sales-daily-digest + refresh-active-customers) + team.md §9 + Part P
**Wave 2 — Sprint 6 push runway docs** (`eec4b69`): PORT_PLAN P-15..P-27 task list + team.md §6 self-directed mode
**Wave 3 — Day 3 evening** (`e9da976`):
- เดฟ: D-11 Sentry SDK (`bc93be1` + audit fix `cae1082`) + D-12 Upstash rate-limit (`5648d6d`) + D-13 hCaptcha (`4d824b6`) → `4d824b6`
- ภูม: P-15..P-20 ทั้งหมด (`e440a31` `6b5a517` `0479949` `8bd04b7` `e6c970b` `dda663c`) → merged via `e9da976`

## P2. Decisions ที่ยัง outstanding

### 🆕 New

| # | Decision | Owner | Blocks | Recommended |
|---|---|---|---|---|
| **D-18** | P-13 `recently-active customers dashboard` vs `/api/cron/refresh-active-customers` overlap | เดฟ + ภูม | ภูม P-16 enable cron | คงทั้งคู่ — cron flips `is_active` flag (cheap query later); P-13 is real-time aggregate. ภูม confirm ว่า P-13 query depend ที่ flag หรือ on-the-fly aggregate |

### Carried forward

| # | Decision | Owner | Blocks |
|---|---|---|---|
| D-7 | Payment Gateway provider (Omise / 2C2P / Stripe TH) | เดฟ + Pacred owner | M2.1 implementation (40-60h) |
| D-8 | HS variants — keep แยก หรือ merge เข้า tier | Pacred owner + ก๊อต | M2.4 design |
| D-9 | Payroll module — standalone หรือ extend HR | ภูม + เดฟ | M2.2 design + M2.5d driver shifts |

### Credentials / external setup รอ Pacred owner

| Var / Account | Status | Blocks |
|---|---|---|
| ~~`PACRED_RCGROUP_API_URL`~~ | DEAD (was dead in PHP too — see audit §2) | — |
| `PACRED_TAMIT_DETAIL_URL` | unset (need to set + verify) | URL→cart product detail (P-50) |
| `PACRED_TAMIT_CACHE_URL` | unset | Short-URL resolution (P-51) |
| `PACRED_AKUCARGO_API_URL` | unset | Keyword search (P-52) |
| `PACRED_LAONET_API_URL` + `_KEY` | unset | Image search (P-53) |
| `PROMPTPAY_ID` | unset (PCS Cargo legacy `064-174-3836` — Pacred ต้อง new acct) | Wallet deposit QR (throws error) |
| `THAIBULKSMS_API_KEY` + `_SECRET` | placeholder | OTP send |
| `LINE_CHANNEL_ID` + `_SECRET` + `_ACCESS_TOKEN` | ✅ **set in `.env.local` 2026-05-14** (Channel ID 2009931373) — Vercel env ยังต้องตั้ง | LINE push + P-15 dispatch (P-54 activated) |
| `LINE_PUSH_BYPASS=false` | bypass (dev keeps true for safety) | Real LINE delivery production |
| `OTP_BYPASS=false` + `OTP_PEPPER` | bypass + placeholder | Real OTP production |
| `NEXT_PUBLIC_SITE_URL=https://pacred.co` | localhost:3000 | OAuth callback + notification deep links |
| Sentry DSN | none (SDK scaffolded D-11 ✅; need DSN to activate) | Production error tracking activation |
| Upstash Redis | none (lib scaffolded D-12 ✅; need URL+token to switch off memory fallback) | Rate limiting in production (memory fallback leaks quota across function instances) |
| hCaptcha keys | none (lib + component scaffolded D-13 ✅; need keys to activate) | Production bot protection (server fails closed without secret) |
| Resend API key | none | Email fallback |

→ **Action:** ก๊อต schedule Pacred owner call 15-30 นาที — D-7 payment gateway · LINE OA token request · Sentry account · 3rd-party cred consolidation

## P3. Sprint 5+6 burndown (refreshed Day 3 evening, post-Poom-merge)

**Done (across 1 day, 3 contributors):**
- ภูม: P-1..P-14 + Phase 0 review fix + 5 bonus polish + **Sprint 6 P-15..P-20** = **28 deliverables**
- ปอน: L-1..L-9 + 5 SEO bonus + **Bonus 6 + 7 + drop ribbon** = **15 deliverables**
- เดฟ: helper-1 + C-7 + D-14..17 + A-12 + cron-scaffold + collab docs + **D-11 Sentry + D-12 rate-limit + D-13 hCaptcha** = **13 deliverables**
- ก๊อต: review + merge audit (ongoing — เดฟ self-merge in §9 mode)

**Remaining:**
- **ภูม:** Sprint 6 follow-ups (6 items, ~2-3h) + Sprint 7+ Tracks A-G (~70-100h) — all self-directed. **NEW priority injection:** Track G P-50..P-53 (china-search rewire, ~10-15h) is most-leveraged because URL paste / search / image search are core customer flows — recommend doing P-50 + P-51 first (highest user-visible impact)
- **ปอน:** Bonus 6+7 merged ✅ — next = L-5 + L-9b/c + Phase C+ ecosystem (ต้อง decision)
- **เดฟ:** D-7a/b (creds) + D-7c/d (owner decision) = 4 blocked items; D-12-wire + D-13-wire ✅ DONE 2026-05-14 (forms + auth actions all wired, dev no-op until creds activate)
- **ก๊อต:** schedule Pacred owner call to unblock D-7 + 4 sets of creds (Sentry DSN, Upstash, hCaptcha, 3rd-party APIs)

**Real coverage estimate (post-Day-3-evening main):**
- Customer portal: ~88% (P-1..P-3 closed + SEO foundation + Bonus polish)
- Admin: ~98% (P-15..P-20 closed gaps in cron / drivers / CSV import / HS rates)
- Infrastructure: ~85% (Sentry + rate-limit + hCaptcha all SDK-ready; flip on with DSN+creds)
- SEO/landing: ~75% (Phase A + Bonus 1-7; L-5 + Phase C+ pending)
- Phase I ecosystem: ~0% (decision-blocked)

## P4. ลำดับสำคัญ Day 4+ (with strategic pivot 2026-05-14 evening)

> **Strategic shift (เดฟ บอก):** "หลังบ้านให้ ภูม ทำไปก่อนยาวๆ — เดฟ + ผม pivot ไปลุยแลนดิ้ง หาลูกค้าก่อน". Backend = ภูม solo (Sprint 7+ runway 60-90h). Frontend acquisition = เดฟ + Claude **assist ปอน** (ปอน ยังคง lead frontend, เดฟ + Claude join as helpers)

1. **ปอน:** ✅ Bonus 6+7 merged into dave/main (L-pricing-fix was audit false alarm — keys existed)
2. **ภูม:** open menu — Sprint 6.5 follow-ups (6 items, ~2-3h) + Sprint 7+ tracks A-F (~60-90h, 5 themed tracks). Self-directed per §6. Recommended ลำดับ: เก็บ follow-ups quick wins (P-vercel-plan + P-20-followup-rls + P-18-followup-rbac, ~30m) → Track A tests start → interleave tracks. **Goal:** keep grinding while เดฟ pivots
3. **เดฟ + Claude pivot — landing/acquisition:**
   - Help ปอน ที่ Phase B (L-5 service landing polish) + Phase C+ (L-10..L-20 ecosystem expansion)
   - Specific items เดฟ owns naturally: L-22 conversion tracking (GTM/GA4) + L-23 heatmap + L-24 A/B infra
   - Coordinate with ปอน on division of labor (ปอน lead design/copy; เดฟ + Claude assist with structure/scaffolding/scripts)
4. **ก๊อต:** schedule Pacred owner call (~30m bundle):
   - D-7 payment gateway choice
   - ✅ ~~LINE OA channel access token~~ — **DONE 2026-05-14** (Channel ID 2009931373 + Secret + Long-lived token in `.env.local`)
   - Sentry DSN + Upstash creds + hCaptcha keys
   - ThaiBulkSMS real keys + PromptPay ID (Pacred new bank acct — PCS Cargo legacy `064-174-3836` ใช้ไม่ได้)
   - **NEW:** approval to pivot to landing-first focus (confirm with owner that beta launch priority order = customer acquisition channels working > more backend features)
   - **NEW:** Track G china-search rewire — verify with vendor (`tam011plus@gmail.com` likely owns TAMIT/AkuCargo/Laonet/tam-i-t) that Vercel egress IP is allowlisted
5. ✅ **เดฟ work DONE 2026-05-14:** D-12-wire + D-13-wire — rate-limit + hCaptcha both wired into 5 server actions + 3 form components (no-op until Vercel creds set)

**Estimate production beta-ready:** 1-2 weeks ถ้า creds + 1 owner call ได้ในweek นี้ · 3-4 weeks ถ้าไม่
**Estimate to first 10 paying customers:** depends entirely on landing/acquisition push (เดฟ pivot focus) — backend is ahead of demand
**Sprint 6 expected wrap:** ~3-4 สัปดาห์หลังจากนี้ (เมื่อภูม clear P-15..P-27 หมด) → ทันที DPX ERP phase 2 design lock พร้อม impl

---

## P5. Day 4 update — ภูม Sprint 6 progress + blockers (2026-05-15)

### Sprint 6 progress: 11/13 done · D-1-LIFF URGENT shipped (~14h actual)

| Task | Status | Commit |
|---|---|---|
| P-15 sales-daily-digest dispatch wired | ✅ | `e440a31` |
| P-16 refresh-active-customers verified + D-18 resolved | ✅ | `6b5a517` |
| P-17 check-apprentice probation expiry (admin half) | ✅ | `0479949` |
| P-18 forwarder_driver table + admin CRUD + expiry cron | ✅ | `8bd04b7` |
| P-19 CSV bulk import (forwarders) | ✅ | `e6c970b` |
| P-19 follow-up: bucket-not-found UX (banner + hint) | ✅ | `e0c5976` |
| P-20 HS code rates + container line items + report | ✅ | `dda663c` |
| P-21 notification template builders (DRY) | ✅ | `8532f30` |
| P-24 forwarder rate engine unit tests (49 assertions) | ✅ | `36ac681` |
| P-25 re-audit Part N3 silent degraded modes | ✅ | `f39af74` |
| P-26 service-order placement integration test (12 assertions) | ✅ | `52c7331` |
| **🚨 D-1-LIFF (URGENT NEW from Part Q)** — LINE LIFF customer linkage | ✅ | `dba11a6` |
| **🔴 P-50 (Track G URGENT)** — china-search rewire to TAMIT-cloud | ✅ | `01f0cc1` |
| **P-51 (Track G)** — tam-i-t.com short-URL cache layer | ✅ | `1dc4ed3` |
| **P-52 (Track G)** — AkuCargo keyword search adapter | ✅ | `74db555` |
| **P-53 (Track G)** — Laonet image search adapter (closes Track G core) | ✅ | `f8e1a20` |
| **Sprint 6.5 batch (6 follow-ups)** — RLS, RBAC, batch insert, stale recovery, daily_digest UI, vercel cron doc | ✅ | this commit |
| P-22 / P-23 / P-27 remaining Sprint 6 | ⏳ deferred to runway | — |

**Decisions logged in commit messages** (per §6 self-directed mode): migration numbering bumps (0028→0030 chain), schema adaptations (`employees` → `admin_contact_extras`), audit-log skip for cron actions, target table CHECK starts at `forwarders` only. Lead can adjust retroactively.

### 🔴 New blocker found by manual QA — D-7a critical

ภูม เจอตอน manual-test /service-order/add หลัง Sprint 6 batch:

1. **Paste URL Tmall/Taobao** → page hung indefinitely (no UI feedback)
2. **Keyword search** → yellow banner "ระบบค้นหาไม่พร้อมใช้งาน (not_configured)"

**Root cause:** legacy URLs จาก `.env.example`:
```
PACRED_RCGROUP_API_URL=https://rcgroup-th.com/api-china/api-search
PACRED_TAMIT_API_URL=https://tamit-cloud.com/api-product/api-search
```
ภูมตั้ง 2 URLs นี้บน `.env.local` ตามค่า default แล้ว — แต่ endpoint ดูเหมือน dead (ไม่ตอบใน reasonable time)

**ภูม shipped 1 mitigation** (commit `77d4c44` `fix(china-search): add 8s/15s timeouts`):
- เพิ่ม `AbortSignal.timeout(8000)` ใน `convertProductUrl` + `convertProductUrlDetail` + `searchKeyword`
- เพิ่ม `AbortSignal.timeout(15000)` ใน `searchByImage`
- ผล: hang → 8s wait → graceful fallback to demo mode (UI editable, customer can still proceed)

**ยังต้องการจาก เดฟ + Pacred owner (D-7a):**
1. Confirm URLs `https://rcgroup-th.com/api-china/api-search` + `https://tamit-cloud.com/api-product/api-search` ยัง alive มั้ย? มี per-customer key มั้ย?
2. ถ้า dead → ขอ replacement URL จาก Pacred owner หรือเลือก provider ใหม่
3. ถ้า alive แต่ต้อง auth header → ภูม wire เพิ่มได้ (คือ scope code) แต่ต้องการ key

**ภูม ไม่ blocked** — ทำ P-21 (notification templates, no external dep) ต่อได้ทันที. แค่ flag ไว้ตรงนี้เพื่อให้เดฟ priority D-7a ตอนหา window

### 🟡 Other env vars ยังขาด (ภูม noted ใน .env.local เป็น comment)

```
# CRON_SECRET=               # required for cron endpoints in production
# LINE_CHANNEL_ACCESS_TOKEN= # for real LINE push (LINE_PUSH_BYPASS=false)
# PROMPTPAY_ID=              # for /wallet/deposit QR
# RESEND_API_KEY=            # for /forgot-password email path (P-2)
# RESEND_FROM=               # email From: header
```

ทั้ง 5 ตัวเป็น D-7b/c/d scope ของเดฟ (ดู P3 `Credentials / external setup ที่รอ Pacred owner`). ไม่ block Sprint 6 cont.

### Migrations รอเดฟรันบน production Supabase (ลำดับ)

ภูมรันบน dev project แล้ว ครบทั้ง 8 — verified via 3-query check. รอ เดฟ run บน production ตอน merge Poom → main batch ถัดไป:
```
0023_otp_purpose_change_phone.sql
0024_notification_ref_contact_message.sql
0025_profiles_notify_channels_daily_digest.sql
0026_notification_category_sales_digest.sql
0027_admin_contact_extras_contract_end_date.sql
0028_forwarder_driver.sql
0029_csv_imports.sql            ← creates 'csv-imports' storage bucket
0030_hs_codes_rates.sql         ← seeds 9 common HS codes
```

### Next from ภูม (continuing self-directed)

🎉 **Track G core closed + Sprint 6.5 follow-ups all shipped.**  Code repo is clean from low-hanging follow-ups.  Block on R1 decision (vendor cutoff strategy from ก๊อต+เดฟ — see Part R) before any further china-search work.

→ **Track A tests (~7-9h)** — P-28 OTP flow + P-29 wallet ledger + P-30 auth signup + P-31 cart cap.  Pure DB/server-side coverage, doesn't touch china-search at all → safe parallel work while waiting on R1.

After Track A: **Sprint 6 leftover** P-22 (HR attendance, 4-6h) + P-23 (meeting room, 2-3h) + P-27 (DPX ERP ADR, 2-4h) — or **Track B production hardening** (10-15h: SLA tracking, DB backup runbook, Web Vitals, rate limit headers, Sentry alert rules) if Pacred owner prefers ops focus.

### Sprint 6.5 batch shipped (this commit — 6 follow-ups, ~2.5h actual)

| # | Task | Where | Notes |
|---|---|---|---|
| **P-15-followup** | Admin self-service UI for daily_digest toggle | `/admin/settings/notifications` (new page + form) | Reuses existing `updateNotifyChannels` action; `notifyChannelsSchema` extended with optional `daily_digest` field. Eligibility hint shown for non-(super/sales_admin) admins |
| **P-18-followup-rbac** | `requireAdmin(["ops"])` page-level | `/admin/drivers/page.tsx` + `[id]/page.tsx` | Sidebar gate already filtered, but direct URL bypass closed. Defence in depth |
| **P-19-followup-batch** | Chunked batch insert | `actions/admin/csv-imports.ts::confirmCsvImport` | 2-pass refactor: validate-then-insert in chunks of 100. 1000-row CSV: 1000 round-trips → 10 round-trips. Per-chunk failure marks whole chunk skipped (no fall-back to per-row — same FK violations would just re-fire) |
| **P-19-followup-stale** | Stale 'importing' recovery | Migration `0032_csv_imports_started_at.sql` + `lib/admin/csv-import-sweep.ts` | Sweep-on-read at admin list page + at top of `confirmCsvImport`. 10-min threshold. Migration backfills existing zombie rows on first run. Started_at stamped when status flips to 'importing' |
| **P-20-followup-rls** | Tighten `hs_codes_select_all` RLS | Migration `0031_hs_codes_rls_authenticated.sql` | `using (true)` → `using (auth.role() = 'authenticated')`. Low-risk reference data but matches the policy comment intent |
| **P-vercel-plan** | Vercel plan vs cron count check | `docs/runbook/vercel-cron-plan.md` (new) | Doc-only audit: Pacred has 5 crons, Hobby plan limit is 2. Clear action items for เดฟ if on Hobby (upgrade to Pro $20/mo OR consolidate to 2 batch crons). If on Pro: ✅ no action |

**Acceptance gate:**
- `tsc --noEmit` clean ✅
- `pnpm exec eslint <touched files>` clean ✅
- `pnpm test` chain → 207 assertions all green (no test additions needed for these — they're plumbing changes, behaviour verified by existing P-19 manual QA path)
- Migrations 0031 + 0032 ready for เดฟ to run on production Supabase

**Migrations รอเดฟรันบน production Supabase:**
```
0031_hs_codes_rls_authenticated.sql   ← P-20-followup-rls
0032_csv_imports_started_at.sql        ← P-19-followup-stale (auto-recovers any existing zombies)
```

### P-53 shipped (Track G closes)

`lib/china-search/laonet.ts` (server-only) + `laonet-helpers.ts` (testable) per audit §4b:

- **2-step flow** mirrors PHP `searchIMG.php`:
  1. Read `Blob` → `Buffer` → base64 → POST to `/index.php` with `route=api_tester/call&api_name=upload_img&imgcode=<b64>&key=<email>` (auto-switches to GET when URL < 1500 chars; long base64 always POSTs)
  2. Parse `imgid` from response (defensive — top-level `imgid`/`img_id`/`id`/`url` and nested `data.*`/`result.*` variants)
  3. GET `/index.php?route=api_tester/call&api_name=item_search_img&imgid=<id>&key=<email>` → parse hits via the same shape-variant parser used by AkuCargo
- **5 MB upload cap** enforced server-side (matches the route handler's pre-check; defence in depth — Laonet itself rejects > ~8 MB)
- **All hits marked `provider: "1688"`** — Laonet's image-search backend only indexes 1688 even though the same wrapper serves Taobao detail in the audit
- **Env vars**: `PACRED_LAONET_API_URL` (default `https://laonet.online`), `PACRED_LAONET_KEY` (default `tam011plus@gmail.com` — the vendor's literal-email-as-key per audit; Pacred shares this key with the legacy install for now)
- **`searchByImage`** in `index.ts` now delegates to `laonetImageSearch(file)`; the dead RCGroup path with its `normaliseHits` helper has been removed (was the last consumer)
- **Tests:** 31 new assertions across 7 areas in `laonet-helpers.test.ts`:
  - (a) buildLaonetUploadUrl encoding + trailing slash
  - (b) buildLaonetSearchUrl encoding
  - (c) parseLaonetUploadResponse top-level fields (`imgid`/`img_id`/`id`/`url`)
  - (d) parseLaonetUploadResponse nested wrappers (`data.*`/`result.*`)
  - (e) parseLaonetUploadResponse defensive (null/undef/string/empty/wrong-type)
  - (f) parseLaonetSearchResponse canonical hits (8 field assertions)
  - (g) parseLaonetSearchResponse alt shapes + edge cases

**Acceptance gate:**
- `pnpm tsx lib/china-search/laonet-helpers.test.ts` → 31 pass ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/ app/api/china-search/` clean ✅
- `pnpm test` chain → **207 assertions** all green (176 + 31 new)
- Real Laonet response owner-blocked: needs Vercel egress IP allowlist verification (P-55).  Locally: image upload likely 403s from Vercel IPs → UI banner gracefully degraded.  Logic verified by unit tests covering both upload + search response shape variants.

### Track G summary (complete)

| Task | Lines added | Tests |
|---|---|---|
| P-50 — TAMIT-cloud URL→detail rewire | ~430 | 19 assertions |
| P-51 — tam-i-t.com short-URL cache | ~260 | 22 assertions |
| P-52 — AkuCargo keyword search | ~280 | 24 assertions |
| P-53 — Laonet image search | ~330 | 31 assertions |
| **Total** | **~1300** | **96 new assertions** |

**Suite total** 207 assertions across 7 test files (49 + 50 + 19 + 22 + 24 + 31 + 12).  No more wired-to-dead-endpoint code in `lib/china-search/`.  All adapters share the same posture: `available: true` with empty hits / demo product on graceful failures, `available: false` only when env unset at the route layer.

### P-52 shipped (Track G)

`lib/china-search/akucargo.ts` (server-only) + `akucargo-helpers.ts` (testable) per audit §4a:

- **Endpoint**: `https://akucargo.com/api3/api-2022/search/v1[/taobao]/?q=<words>&page=<N>&page_size=15&lang=zh-CN` — Tmall maps to taobao (AkuCargo doesn't separately route Tmall).  Default base URL hard-coded so `PACRED_AKUCARGO_API_URL` env var being unset still works (vendor allowlist permitting).
- **Auth**: none.  Spoofs desktop Firefox UA per audit (mobile UA returns thinner / different results).
- **Response parser** handles 3 top-level shape variants:
  - canonical `{ items: { item: [...] } }`
  - flat `{ items: [...] }`
  - legacy `{ data: [...] }`
- **Per-row defensive parsing**: skips rows with no title AND no url; numeric-or-undef coercion for prices; promo wins when `> 0` AND `< base`; falls back to base if promo missing/zero/higher.
- **Wired into** `searchKeyword(words, page, _order, platform)` — `_order` kept for API back-compat (AkuCargo doesn't expose order-by; the `/api/china-search` route handler doesn't need to change).
- **Types extracted** to new `lib/china-search/types.ts` so helper modules + their tsx tests can `import type` without dragging the Next.js `server-only` sentinel into a node test runner.  `index.ts` re-exports types for back-compat.
- **Tests:** 24 new assertions across 7 areas in `akucargo-helpers.test.ts`:
  - (a) buildAkucargoUrl — 1688 path
  - (b) buildAkucargoUrl — taobao path
  - (c) buildAkucargoUrl — defensive inputs (trailing slash, zero/negative page)
  - (d) parseAkucargoResponse — canonical items.item[]
  - (e) parseAkucargoResponse — price fallback rules (promo=0, promo≥base, base missing, both missing)
  - (f) parseAkucargoResponse — alt response shapes (flat items, legacy data)
  - (g) parseAkucargoResponse — defensive edge cases (null, undefined, string, empty list, rows lacking title+url)

**Acceptance gate:**
- `pnpm tsx lib/china-search/akucargo-helpers.test.ts` → 24 pass ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/` clean ✅
- `pnpm test` chain → **176 assertions** all green (152 + 24 new)
- Real AkuCargo response owner-blocked: needs Vercel egress IP allowlist verification (P-55).  Locally: keyword search with default base URL → likely network error → UI banner "ระบบไม่พร้อม" gracefully degraded (was the same before P-52, just on a different broken endpoint).  Logic verified by unit tests covering all branches.

### P-51 shipped (Track G)

`lib/china-search/short-url-cache.ts` + `short-url-helpers.ts` per audit §3b:

- **Detect**: `detectShortUrl(url)` recognises `m.tb.cn/<tk>` (Taobao, provider 2, cache subpath `/get/taobao/`) and `qr.1688.com/s/<tk>` (1688, provider 1, cache subpath `/get/`).
- **Resolve flow** (mirrors PHP `convertURLChinna()`):
  1. In-memory LRU hit → return immediately (5-min TTL, max 200 entries, FIFO eviction)
  2. GET tam-i-t.com cache → if 200 with productID, cache in memory + return
  3. On 204 / network blip: fetch the short URL itself with desktop Firefox UA spoof (mobile UA returns a different DOM that hides the productID) → scrape productID from final URL + body via PHP-equivalent regex set
  4. POST back to `/save/?tk=&provider=&productID=` (best-effort, fire-and-forget) so the next paste of the same tk skips the scrape
- **Wired into** `convertProductUrlDetail` ahead of the `extractProductId` step — short URLs now resolve to a productID instead of falling through to demo.  Failure at any layer still falls through to demo so the customer is never blocked.
- **Helpers split** into `short-url-helpers.ts` (no `server-only`) so tsx tests can load `detectShortUrl` + `scrapeProductId` without dragging the Next.js server-only sentinel into a node runner.  Same pattern as `extract-product-id.ts`.
- **Tests:** 22 new assertions across 6 areas in `short-url-cache.test.ts`:
  - (a) Taobao m.tb.cn detection (4)
  - (b) 1688 qr.1688.com detection (4)
  - (c) non-short URLs return null (5)
  - (d) encoded redirect patterns (`Id%3D`, `Foffer%2F`) (2)
  - (e) plain querystring patterns (`?id=`, `/offer/<id>.html`, `?offerId=`) (3)
  - (f) HTML body fragments + edge cases (4)

**Acceptance gate:**
- `pnpm tsx lib/china-search/short-url-cache.test.ts` → 22 pass ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/` clean ✅
- `pnpm test` chain → **152 assertions** all green (130 + 22 new)
- Real cache+scrape flow owner-blocked: needs Vercel egress IP allowlist (P-55) before tam-i-t.com responds outside legacy XAMPP IP.  Locally short URL paste → cache miss → scrape attempt → demo fallback (graceful), but unit-tested path covers all logic branches.

### P-50 shipped (Track G URGENT)

`lib/china-search/index.ts` rewired to TAMIT-cloud per audit §3a:

- **New env var** `PACRED_TAMIT_DETAIL_URL` (default `https://tamit-cloud.com/api-product`) — `.env.example` already had this from เดฟ audit commit; `.env.local` updated to match (RCGroup vars commented out as legacy).
- **Endpoint pattern** changed from `?q=<full-url>` to `/get/{1688|taobao}/?id=<productID>` per the canonical PHP `convertURLChinna()` — Tmall maps to taobao at TAMIT.
- **`extractProductId()`** extracted to its own file `lib/china-search/extract-product-id.ts` (no `server-only`) so it's tsx-testable. Handles 1688/Taobao/Tmall desktop + mobile patterns + `?offerId=` fallback + generic numeric path segments.
- **`normaliseTamitDetail()`** parses TAMIT's actual response shape: `json.status==200 → json.data.{title, vendor, mainImage, listImage[], referencePrice, priceRanges[], sku[], skuMap[]}`.  Defensive: missing/wrong-typed fields degrade gracefully (e.g., no priceRanges → no promo price; sku_axes empty → UI single-row fallback).
- **Demo fallback preserved** — if productID not extractable (short URLs, P-51 will fix), TAMIT unreachable, response status !== 200, or any throw → returns `available: true` with `buildDemoDetail()` so the customer can still type price/qty manually and place the order. Same posture the legacy PHP took on API outages.
- **`searchKeyword` + `searchByImage`** kept on legacy wiring for now with explicit `TODO(P-52)` / `TODO(P-53)` comments — those rewires come next in this same Track G batch.
- **Tests:** new `extract-product-id.test.ts` with 19 assertions across 7 areas (a-g): 1688 desktop, Taobao item.htm, Tmall, ?offerId fallback, generic path segments, short URLs return null, malformed inputs. Wired into `pnpm test` chain → total now **130 assertions** all green.

**Acceptance gate:**
- `extractProductId` unit tests green ✅
- `tsc --noEmit` clean ✅
- `pnpm exec eslint lib/china-search/` clean ✅
- `pnpm test` chain green (130 assertions) ✅
- Real TAMIT smoke test owner-blocked: needs Vercel egress IP allowlist verification (P-55) once first paste hits production. Locally a Tmall URL → demo fallback (TAMIT may not respond from dev IP) but extractProductId → correct productID, so the rewire is verified in unit tests + shape-compatible.

### D-1-LIFF shipped (this batch — URGENT from Part Q)

Spec from Part Q + Part O2 line 1749. What's in:

- `actions/profile.ts::linkLineAccount(lineUserId)` — Zod-style regex guard `^U[a-f0-9]{32}$`, pre-check unique-index conflict, returns `line_already_linked` instead of crashing
- `app/[locale]/liff/link/page.tsx` — server wrapper (`requireAuth`, allow-incomplete) + client `LinkLineClient` that does `liff.init` → `liff.login` → `liff.getProfile` → server action POST
- `@line/liff` 2.29.0 added (dynamic import keeps it out of rest-of-app bundle)
- "เชื่อม LINE OA" button at `/profile` now navigates to `/liff/link` (was disabled placeholder)
- i18n: full `liff.*` namespace TH + EN (16 keys)
- env: `NEXT_PUBLIC_LIFF_ID` documented in `.env.example`; `.env.local` notes "set when LIFF app created in console"

**Page handles 8 states:** boot · needs_liff_id · needs_login · ready · linking · linked · already_linked · error

**Acceptance gate:** flow tested locally:
- `/liff/link` without session → redirect `/login` ✅
- `/liff/link` with session, NEXT_PUBLIC_LIFF_ID unset → "ระบบยังไม่พร้อม" notice ✅
- `/liff/link` with already-linked profile → "เชื่อมไว้แล้ว" + back button ✅
- Production wiring: requires LIFF app created in LINE Console (uses Pacred Channel ID 2009931373) + `NEXT_PUBLIC_LIFF_ID` set in Vercel + `LINE_PUSH_BYPASS=false` + ปอน drops "QR add friend" CTA at landing per Part Q Q4

**Customer-side test (manual, owner-blocked):** needs LIFF app published in LINE console first. Once `NEXT_PUBLIC_LIFF_ID` lands → end-to-end test from Part Q4 Q1 acceptance: scan QR → add Pacred OA → click LIFF link → see "เชื่อมสำเร็จ" → admin pushes test notification → see in LINE chat.

---

**End of Part P.** Snapshot ณ 2026-05-15 หลัง Sprint 6 + Track G + Sprint 6.5 complete (P-15..P-21, P-24, P-25, P-26 + D-1-LIFF + P-50..P-53 + 6 follow-ups).  **🚨 ภูม flag (2026-05-15 ค่ำ):** owner = ก๊อต+เดฟ; ห้าม activate Track G in production จนกว่าจะตัดสินใจ vendor cutoff — ดู Part R.  Next parallel work: Track A tests (~7-9h).

> **🟢 เดฟ merge sweep 2026-05-15 evening** — Pulled both `origin/Poom` (16 commits) + `origin/podeng` (6 commits) into `dave` + `main` (commits `e90e594` + `ccb3dc4`). Verified: pnpm install ok · eslint clean · tsc clean · pnpm build passes · all 7 test files green (147 assertions chained: calc-price 49 + thai-number 50 + extract-product-id 19 + short-url-cache 22 + akucargo-helpers 24 + laonet-helpers 31 + placement 12 env-gated).
>
> **Conflicts resolved:**
> - `actions/profile.ts` — took ภูม's `linkLineAccount` (improved: pre-check + race-fallback)
> - `app/[locale]/liff/link/page.tsx` — took ภูม's version (Server+Client split, 8-state machine, full i18n)
> - `app/layout.tsx` — kept ปอน's intent (`defaultTheme="light"`) but stripped 3 next-themes-API props that current `theme-provider.tsx` doesn't yet support → flagged as **`theme-provider-followup`** (extend `theme-provider.tsx` with `enableSystem`/`disableTransitionOnChange`/`attribute` to match next-themes API for ปอน's first-visit lock UX completeness)
>
> **2 follow-up flags for เดฟ post-merge** (ภูม's audit notes):
> 1. **🚨 Vercel cron count = 5** (Hobby max=2). Confirm Pacred Vercel Pro tier OR consolidate before next prod deploy. Documented in `docs/runbook/vercel-cron-plan.md`
> 2. **🚨 Per Part R1: do NOT set Track G env vars** (`PACRED_TAMIT_DETAIL_URL` etc.) ใน Vercel production until vendor cutoff strategy lands — code degrades to demo mode cleanly when unset (intended interim per Option E hybrid)
>
> **§6 watch-item (ปอน):** `da60747` first-visit lock edited `app/layout.tsx` + `i18n/routing.ts` — root-level files outside ปอน's allowed scope (`docs/team.md` §1). Sensible UX intent (light default + locale lock for non-TH) but no DECISION block in commit message. Log as 2nd §6 watch-item (after Bonus 5 "per Pacred owner" claim from Sprint 5) — both delivered correct fixes with self-audit, accept; tighten review only if any future commit fails verification

---

# 🚨 Part Q — URGENT Pacred owner blockers (2026-05-14)

> **เดฟ บอก** "เน้นพวกเรื่อง บัญชี เรื่อง ไลน์ เรื่อง อะไรที่เป็นการเงิน อะไรที่จำเป็นต้องรอก็บอก ก็เตือน". This part = single-page alert for เดฟ + ก๊อต. ทุกคนอ่านอันนี้แล้ว pick action ของตัวเอง

## Q1. Status — บัญชี / LINE / การเงิน

### ✅ ใช้งานได้แล้ว (ใน main `b2064e5`, code+infra ครบ)

**LINE:** wrapper push via Messaging API + `profiles.line_user_id` column ready + P-15 sales digest dispatch wired (`e440a31`)

**บัญชี/การเงิน:**
- Wallet ledger 3 buckets + recompute trigger
- Wallet deposit slip → admin approve
- Wallet withdraw request → admin approve
- Yuan transfer (Alipay) request → admin approve
- Service-import + service-order full flow + receipt PDFs
- Sales commission ledger + claim form (P-7)
- Forwarder month-end closing (P-11)
- Cross-team commission dashboard (P-12)
- CSV bulk import for forwarders (P-19)
- HS code rates + container line items + report (P-20)

### 🟡 พร้อมระดับ code — ต้อง flip switch ใน production

| Item | Action |
|---|---|
| **LINE push** | ✅ creds ใน `.env.local` → ตั้ง 3 vars (`LINE_CHANNEL_ID`/`_SECRET`/`_ACCESS_TOKEN`) ใน Vercel env + flip `LINE_PUSH_BYPASS=false` |
| **Sentry** | SDK scaffolded → ตั้ง `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` ใน Vercel |
| **Rate limit** | lib scaffolded + ✅ **wired into 6 actions** (D-12-wire DONE 2026-05-14) → ตั้ง `UPSTASH_REDIS_REST_URL` + `_TOKEN` ใน Vercel = production-grade |
| **CAPTCHA** | scaffold ready + ✅ **wired into 3 forms + 5 actions** (D-13-wire DONE 2026-05-14) → ตั้ง `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` ใน Vercel = bot protection live |

### 🔴 BLOCKED — รอ Pacred owner ก่อน beta launch

#### 1. PromptPay QR (wallet deposit จะ throw error)
ต้อง 3 ค่าจาก Pacred:
- PromptPay number (เบอร์โทร 10 หลัก หรือ tax-ID 13 หลัก)
- Bank account number (สำหรับพิมพ์ใน QR receipt)
- Account name (ชื่อบริษัท Pacred)

⚠️ PCS Cargo legacy ใช้ `064-174-3836` Kasikorn — **Pacred ใช้ไม่ได้** ต้องเปิดบัญชีใหม่

#### 2. Payment gateway (D-7 decision — owner)
ตอนนี้ launch ได้เฉพาะ **PromptPay-only manual** (slip upload + admin approve). ถ้าจะรับ credit card — ต้องเลือก:
- **Omise** — Thai-friendly, simple integration
- **2C2P** — Pacred industry standard
- **Stripe TH** — international, more features

หลัง decide → M2.1 implementation (~40-60h) — เดฟ ทำ

#### 3. ThaiBulkSMS real keys (OTP fail ถ้า OTP_BYPASS=false)
- `THAIBULKSMS_API_KEY`
- `THAIBULKSMS_API_SECRET`

ปัจจุบัน `YOUR_API_KEY` placeholder — production OTP ใช้ไม่ได้

#### 4. 🚨 LINE customer linkage — **ใหญ่กว่าที่คิด** (D-1-LIFF NEW)
**`profiles.line_user_id` column มี แต่ NO mechanism populate มัน:**
- ❌ ไม่มี LINE OA webhook receiver (เก็บ user_id ตอน customer add friend)
- ❌ ไม่มี LIFF / LINE Login OAuth (auto-link ตอน customer login)

**ผลกระทบ:** LINE push ทำงานกับ admin ได้ (ถ้า seed `line_user_id` manually ใน DB) แต่ **customer ไม่ได้รับ push เลย** จนกว่าจะมี linkage

**ต้องเลือก 1 ใน 3 patterns:**
| Option | Friction | Est | Note |
|---|---|---|---|
| **LIFF in OA** ⭐ | ต่ำสุด | 4-6h | Customer click link → open LIFF → auto-link via LINE userID. ใช้ Pacred OA ที่มีแล้ว |
| LINE OA webhook + DM bot | กลาง | 6-8h | Customer add friend → bot ส่ง code → customer paste ใน profile |
| LINE Login OAuth | สูง | 6-8h | Separate channel — full auth replacement |

**แนะนำ:** LIFF (lowest friction, fastest, reuses existing OA channel). New task **D-1-LIFF** assigned to ภูม → ดู Part O2 Track G

### ⚠️ ขาดทั้งระบบ (PHP เดิมไม่มีหรือ partial — Pacred ยังไม่ได้ build)

**บัญชี/Tax (post-launch OK ก่อน):**
- ❌ Tax invoice (ใบกำกับภาษี) issuance flow + numbering
- ❌ Withholding tax (ภ.ง.ด. 3, 53) handling สำหรับ B2B juristic
- ❌ Aging report — admin ไม่เห็น overdue accounts
- ❌ Profit/Loss report comprehensive
- ❌ Bank reconciliation (slip vs bank statement auto-match)

**Refund/dispute (post-launch OK):**
- ❌ Formal refund workflow (ปัจจุบัน wallet adjustment manual)
- ❌ Dispute / chargeback model

**Phase I services (ecosystem expansion — design only):**
- Service #5 tax-refund · #7 tax-invoice · #8 shipping-document · #12 bill-payment

## Q2. ของที่ก๊อต ต้องเตรียมก่อน owner call

### Bundle 1 — เปิดได้ทันที (no decisions, just provide values)
```
□ PromptPay number (เบอร์/tax-ID, no dash)
□ Bank account number + ชื่อธนาคาร + ชื่อบัญชี (สำหรับพิมพ์ใน QR receipt)
□ ThaiBulkSMS account → API key + API secret (login ที่ thaibulksms.com)
□ Pacred company info (ใช้สำหรับ tax invoice + footer + email):
  □ Tax ID (เลข 13 หลัก)
  □ ที่อยู่จดทะเบียน (สำหรับใบกำกับ)
  □ ชื่อบริษัท Thai + English
  □ เบอร์โทรกลาง + email contact
□ Sentry account → DSN (free tier OK pre-launch)
□ Upstash Redis DB → URL + token (free tier OK)
□ hCaptcha site (Type=Invisible) → site key + secret
```

### Bundle 2 — Decisions ที่ต้องตอบ
```
□ D-7: Payment gateway = Omise / 2C2P / Stripe TH? หรือ PromptPay-only ก่อน?
□ D-1: LINE customer linkage = LIFF (แนะนำ) / Webhook+DM / OAuth?
□ D-8: HS code variants = แยก หรือ merge เข้า tier?
□ Tax invoice numbering format? (auto INV-YYYYMM-NNNN?)
□ ใครเป็น approver ของ wallet deposit? (super only / accounting role / both?)
```

### Bundle 3 — ✅ landed already (ไม่ต้องคุย)
```
✅ LINE OA channel access token (Pacred provided 2026-05-14)
✅ LINE OA Basic ID (@683wolja) + Premium ID (@pacred) provided 2026-05-14
   → in components/seo/site.ts as LINE_OA.{basicId, premiumId, addFriendUrl}
   → premium ID add-friend URL = https://line.me/R/ti/p/%40pacred
✅ Sentry SDK + Rate limit + hCaptcha — scaffolded รอ creds เท่านั้น
✅ D-12-wire + D-13-wire — rate-limit + CAPTCHA wired into 6 actions + 3 forms
```

## Q3. Production launch checklist (priority order)

```
Sequence ถ้าจะ launch beta แบบ "PromptPay-only + admin manual":
  1. PromptPay creds → wallet deposit ทำงาน
  2. ThaiBulkSMS keys → OTP จริง (OTP_BYPASS=false)
  3. Sentry DSN → จับ error production
  4. LINE LIFF (D-1-LIFF) + LINE_CHANNEL_* ใน Vercel → customer notification
  5. Pacred company info → tax invoice เตรียมในอนาคต
  6. Upstash + hCaptcha → bot/abuse protection production-grade
  7. (Optional) Payment gateway D-7 — ถ้ายังไม่พร้อมก็ใช้ PromptPay-only ไปก่อน
```

**Estimate ถ้า creds week นี้:** 1-2 weeks ถึง beta launch (PromptPay-only + LIFF + บัญชีพื้นฐาน)
**ถ้า payment gateway ต้อง launch:** +3-4 weeks สำหรับ M2.1

## Q4. Action assignments (per role)

### ⚠️ All roles — cost discipline (ก๊อต flag 2026-05-15)
> **`docs/team.md` §3.0 — push frequency rule:** commit local ฟรี, push เฉพาะ save point. Target ~1-3 push/day/คน. Vercel build minutes คิดตัง.

### ก๊อต (URGENT)
- [ ] **Schedule Pacred owner call this week** — Bundle 1 (creds) + Bundle 2 (decisions)
- [ ] หลัง owner call: review งานน้อง 2-day batch + merge dave→main (per `team.md` §3 ก๊อต flow)
- [ ] D-7 payment gateway intro — owner discuss + เลือก provider

### เดฟ (URGENT — ตอนนี้ pivot landing แต่ยังต้อง track)
- [x] ✅ D-12-wire + D-13-wire DONE 2026-05-14 (no-op until creds activated in Vercel env)
- [ ] หลัง D-7 lock → lead M2.1 payment gateway implementation (~40-60h)
- [ ] Continue landing pivot กับ Claude (current pivot focus)

### ภูม (URGENT — backend self-directed)
- [ ] **NEW D-1-LIFF (URGENT, ~4-6h)** — LINE LIFF for customer linkage. ดู Part O2 Track G
- [ ] **P-50 china-search rewire (CRITICAL, ~4-6h)** — TAMIT-cloud per audit
- [ ] Sprint 6.5 follow-ups (~2-3h)
- [ ] Sprint 7+ Tracks A-G ตามลำดับ self-directed

### ปอน (URGENT — frontend self-directed)
- [ ] Continue Phase B landing polish (decisions ก็ pull เดฟ assist)
- [ ] **NEW: หลัง D-1-LIFF lands** — เพิ่ม "เพิ่ม LINE OA" CTA + LIFF entry point ที่ landing pages + dashboard
- [ ] Phase D L-9b/c i18n polish (self-directed, anytime)
- [ ] Phase C+ ecosystem (รอ Pacred owner decisions ที่ Bundle 2)

---

**End of Part Q.** Single-page alert บัญชี/LINE/การเงิน. Cross-link to Part O2 (per-task spec) + Part P §P3 burndown + audit `docs/audit/php-pcscargo-integrations.md`

---

# 🚨 Part R — VENDOR CUTOFF + URGENT decisions for ก๊อต / เดฟ (2026-05-15)

> **ภูม flag (2026-05-15 ค่ำ):** "Pacred owner = ก๊อต + เดฟ — ตัดสินได้เลย ไม่ต้องคุยใคร".  **"ตัด ทั้งไอแต้ม (TAM/TAMAI/TAMTISO/tam-i-t/tamit-cloud/akucargo/laonet) ทั้ง PCS Cargo legacy ออกให้หมด — ไม่อยากให้ vendor เก่ารู้ว่า Pacred ทำเว็บใหม่"**.
>
> Part Q เดิมมี "Pacred owner ต้องตอบ" เป็นจำนวนมาก — ภูม clarify ว่า "owner" = ก๊อต+เดฟ.  ดังนั้นเรื่องที่ถูก block อยู่จริงๆ มีแค่บางตัว (creds external เช่น Sentry/Upstash/hCaptcha) — ที่เหลือ ก๊อต+เดฟ ตัดสินได้เลย.

## R1. 🆘 Track G ที่เพิ่ง ship — ห้าม activate ใน production จนกว่าจะตัดสินใจ

**Status:** P-50, P-51, P-52, P-53 ภูม ship ครบใน `origin/Poom` (5 commits, ~1,300 LOC, 96 test assertions all green).  **โค้ดทำงานถูกต้องตาม audit แต่ wired ไปหา vendor ที่เจ้าของไม่อยากเกี่ยว.**

**Endpoints ที่ Track G ใช้** (audit-derived; ทั้งหมดเป็น vendor PCS Cargo เก่า):

| File | Endpoint | จัดการ |
|---|---|---|
| `lib/china-search/index.ts` (P-50) | `tamit-cloud.com/api-product/get/{1688\|taobao}/?id=` | URL→detail |
| `lib/china-search/short-url-cache.ts` (P-51) | `tam-i-t.com/api/convert-link-china/{get,save}` | short URL resolver |
| `lib/china-search/akucargo.ts` (P-52) | `akucargo.com/api3/api-2022/search/v1[/taobao]/` | keyword search |
| `lib/china-search/laonet.ts` (P-53) | `laonet.online/index.php?api_name={upload_img,item_search_img}` | image search |
| `.env.local` `PACRED_LAONET_KEY` | `tam011plus@gmail.com` (vendor's literal email-as-key) | shared with PCS legacy |

**Decision needed (ก๊อต+เดฟ — เลือก 1):**

| Option | Effort | Risk | Note |
|---|---|---|---|
| **A. Build Pacred-owned scraper** (Cheerio + Puppeteer + Vercel function) | ~30-50h | Med (1688/Taobao change anti-scraper rules) | Full independence; matches what TAM/AkuCargo do internally |
| **B. Apply for official Taobao Open API** (Alibaba Open Platform) | ~10h apply + 5-10h integrate | Low (official) | Need Pacred company verification documents to Alibaba; might take weeks for approval |
| **C. Pay 3rd-party SaaS** (RapidAPI / Apify Taobao Scraper / similar) | ~5h | Low | Monthly recurring cost; not under our control but cleanly contracted |
| **D. Cut feature short-term** — customer pastes URL/title/price/qty manual | 0h (revert wiring) | Low | UI already supports demo mode (P-50 demo fallback); just don't enable Track G in production. Add notice "ใส่ข้อมูลสินค้าเอง — ระบบ search กำลังพัฒนา" |
| **E. Hybrid (recommended interim)** | 0h decision + 1-3 days implement when ready | Low | Keep Track G code as-is in repo (it's correct) but **don't set the env vars in Vercel**.  Production runs in demo mode (option D).  When option A/B/C ready, just set the env vars and traffic flows.  Zero throwaway work. |

**ภูม ความเห็น (advice — final call to ก๊อต/เดฟ):** **Option E (hybrid)** ตอนนี้ — Track G code นั่งนิ่ง ๆ ไม่กระทบใคร, prod ใช้ demo mode (UI เปลี่ยน label ให้ลูกค้าเข้าใจ).  ขนาน ก๊อต/เดฟ ตัดสินใจ A/B/C เป็นการบ้าน Phase H/I ไม่ rush.

**ถ้าอยาก Option D ตัดทันที:** ภูม ใช้ ~1h revert wiring (set `PACRED_TAMIT_DETAIL_URL=disabled` หรือ feature flag) — บอกได้เลย.

## R2. 🆘 PCS Cargo branding cutoff (audit-needed)

ภูม flag: "ตัด PCS ออกหมดด้วย".  ตอนนี้ในโค้ด/comment/test ยังมี references ที่อาจหลงเหลือ:

| ที่ | สิ่งที่อาจรั่ว | Action |
|---|---|---|
| `docs/audit/php-pcscargo-integrations.md` | สรุป PHP เก่าทั้งหมด — มี secret PCS, social tokens, etc. | **internal-only doc** ไม่ commit ออก public; ถ้า leak Git history ของ vendor/ก๊อต/เดฟ — flag |
| Code comments mentioning "PCS Cargo" / "pcscargo.co.th" | บอกที่มา legacy | Replace ด้วย "Pacred (formerly the same team / new company)" หรือ "legacy" generic |
| Test data / migrations using PCS member codes | `PCS<num>` เก่า | ✅ ไม่มี — ใช้ `PR<num>` ตั้งแต่แรก (CLAUDE.md decision A1) |
| `.env.local` legacy variable names with `PCS_` prefix | naming leak | ✅ ตรวจแล้ว — ใช้ `PACRED_*` prefix ทั้งหมด |
| Bank account `064-174-3836` Kasikorn (PCS legacy) | ไม่อยู่ในโค้ด แต่ถ้า hardcode = leak | ⏳ เดฟ block ใน Part Q — รอ Pacred bank acct ใหม่ |
| LINE Notify legacy tokens (audit §1.3) | ไม่อยู่ในโค้ด — ทั้งหมด LINE Notify EOL แล้ว | ✅ ไม่ใช้แน่นอน |

**Action ก๊อต/เดฟ:**
- [ ] Confirm `docs/audit/php-pcscargo-integrations.md` เป็น internal-only doc (ไม่ใช่ public docs)
- [ ] Decide: ในโค้ด/comment ที่อ้างถึง "PCS Cargo" / "pcscargo.co.th" / "legacy PHP" — เก็บไว้เพื่อ context หรือลบทิ้ง?
- [ ] Pacred new bank account + PromptPay number (Part Q Bundle 1 #1)

## R3. ของเร่งด่วน — Pacred owner = ก๊อต/เดฟ ตัดสินได้ตอนนี้เลย

ที่ Part Q เดิม mark "BLOCKED on owner" — ภูม clarify ว่า ก๊อต+เดฟ ตัดสินได้เลย:

| # | Decision | Owner | Sub-decision details |
|---|---|---|---|
| 1 | **D-7 Payment Gateway** | ก๊อต+เดฟ | Omise / 2C2P / Stripe TH / PromptPay-only?  Beta launch ใช้ PromptPay-only ได้ตามที่เดฟ note ใน Part Q. |
| 2 | **D-1 LINE customer linkage** | ก๊อต+เดฟ | LIFF (เดฟ บอกแนะนำ) / Webhook+DM / OAuth?  ภูมิ ship LIFF code แล้ว — แค่ตัดสินใจ "OK ใช้ LIFF" + create LIFF app ใน LINE Console + set `NEXT_PUBLIC_LIFF_ID` ใน Vercel |
| 3 | **D-8 HS code variants** | ก๊อต+เดฟ | แยก หรือ merge? |
| 4 | **D-9 Payroll module** | ก๊อต+เดฟ | M2.2 spec |
| 5 | **Tax invoice numbering format** | ก๊อต+เดฟ | `INV-YYYYMM-NNNN`? Sequential? |
| 6 | **Wallet deposit approver role** | ก๊อต+เดฟ | super only / accounting role / both? |
| 7 | **R1 — Track G replacement strategy** | ก๊อต+เดฟ | Option A/B/C/D/E (ดู R1 ด้านบน) |
| 8 | **R2 — PCS branding cutoff** | ก๊อต+เดฟ | จะเก็บ comment context หรือ scrub? |

**ของที่ external-blocked จริงๆ (ไม่ใช่ ก๊อต/เดฟ ตัดสินใจคนเดียวได้):**

| # | Decision | External party | Notes |
|---|---|---|---|
| A | Sentry account → DSN | sentry.io signup | free tier OK pre-launch |
| B | Upstash Redis DB → URL + token | upstash.com signup | free tier OK |
| C | hCaptcha site (Type=Invisible) → site key + secret | hcaptcha.com signup | free tier OK |
| D | ThaiBulkSMS account → API key + secret | thaibulksms.com signup | paid (per SMS) |
| E | Pacred company info | Pacred legal | tax ID, address, bank acct |

→ **Action ก๊อต:** Bundle A-E สามารถสมัครเอง / ขอ Pacred legal เอง (15-30 นาที per service)

## R4. Action checklist (priority order, ก๊อต+เดฟ คนละครึ่ง)

### ก๊อต — URGENT (this week)
- [ ] **R1 decision**: เลือก Option E (hybrid) ไหม? ถ้าเลือก = แค่ "OK" reply → ภูม ทำ Option D parallel (UI label change) ระหว่างรอ A/B/C
- [ ] **R2 decision**: scrub PCS comments หรือเก็บ?
- [ ] Sign up: Sentry + Upstash + hCaptcha (Bundle A/B/C — ฟรีหมด)
- [ ] Apply: ThaiBulkSMS account (Bundle D)
- [ ] Provision: Pacred company bank acct + PromptPay number (Bundle E + Part Q #1)
- [ ] Create: LIFF app ใน LINE Console (Pacred Channel ID 2009931373) → set `NEXT_PUBLIC_LIFF_ID` ใน Vercel

### เดฟ — URGENT (this week)
- [ ] **R1 decision** ร่วมกับ ก๊อต — ถ้า A (build scraper) → spec ออกเป็น Phase H task
- [ ] D-7 Payment Gateway lock (ก๊อต+เดฟ ตัดสิน) → ถ้า PromptPay-only ก่อน beta = OK
- [ ] D-12-wire (rate limit drop into forms) — เมื่อ Upstash creds เข้า
- [ ] D-13-wire (hCaptcha drop into signup/contact/password-reset) — เมื่อ hCaptcha keys เข้า
- [ ] Continue Phase H landing pivot กับ Claude

### ภูม — รอ R1 decision (parallel work meanwhile)
- [ ] **ถ้า ก๊อต/เดฟ บอก Option E (hybrid)** → ภูม ทำ Option D label-change UI (~1h) parallel + ทำ Sprint 6.5 follow-ups (~2-3h) + Track A tests (~7-9h) ไป
- [ ] **ถ้า ก๊อต/เดฟ บอก Option D (cut feature)** → ภูม revert Track G env-var wiring + label change (~1.5h) + ทำ Sprint 6.5 + Track A
- [ ] **ถ้า ก๊อต/เดฟ บอก Option A (build scraper)** → ภูม + เดฟ design call → spec → build (~30-50h, push เป็น Sprint 8 ใหม่)
- [ ] **default action ระหว่างรอ:** ทำ Sprint 6.5 follow-ups ก่อน (admin digest UI, RBAC, batch insert, stale recovery, RLS, vercel cron — ทุกอันไม่ touch china-search) (~2-3h)

### ปอน — ไม่กระทบ
- [ ] Phase B landing polish (ตามเดิม)
- [ ] หลัง LIFF app created (ก๊อต) → drop "เพิ่ม LINE OA" CTA ตามที่ Part Q4 บอก

## R5. Burndown estimate (revised)

| Path | Time-to-beta | Notes |
|---|---|---|
| **Hybrid (Option E)** | 1-2 weeks | ก๊อต/เดฟ ตัดสินวันนี้ + Bundle creds เข้าสัปดาห์นี้ + ภูม Sprint 6.5 + Track A. China-search = demo mode in prod (acceptable) |
| **Cut feature (Option D)** | 1-2 weeks | เหมือน hybrid + ภูม revert wiring (~1h) |
| **Pacred-owned scraper (Option A)** | 4-6 weeks | hybrid first → ภูม + เดฟ ทำ scraper parallel → swap when ready |
| **Official Taobao API (Option B)** | unknown (Alibaba approval) | hybrid first → ผูกกับ application timeline ของ Alibaba |
| **3rd-party SaaS (Option C)** | 1-2 weeks | hybrid first → contract + integrate (~5-7h) |

---

**End of Part R.** Single-page alert vendor cutoff + ก๊อต/เดฟ decisions.  ภูม block on R1 decision but has parallel work (Sprint 6.5 + Track A) ที่ไม่ blocked.

---

# 🤝 Part S — เดฟ → ก๊อต async hand-off (2026-05-16)

> **Purpose:** ก๊อต = senior advisor / นานๆ ว่างที — ฉะนั้นเวลาก๊อตเปิด Claude Code/repo มาแล้ว ควรเห็น "batch of decisions + ADRs" ที่ pre-loaded ไว้ให้ลุยรวดเดียวจบ. เดฟ encode งานก๊อต ที่นี่ ก๊อต tick off ใน commit เมื่อเสร็จ.
>
> **Mode:** Async (per `team.md` §9). เดฟ + ก๊อต ไม่ต้องเจอกันแบบ real-time. ก๊อต อ่าน → ทำ → push → commit ปิด task. เดฟ pick up changes ใน sync ครั้งถัดไป.

## S1. ✅ Decisions ที่เดฟ confirm 2026-05-16 (R1 + R2 = locked)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| **R1** | China-search vendor cutoff strategy | ✅ **Option E (hybrid)** | Track G code ภูม ship ครบ — งดงาม. Keep ใน repo, **อย่า set Track G env vars (`PACRED_TAMIT_*`/`PACRED_AKUCARGO_*`/`PACRED_LAONET_*`) ใน Vercel** prod. Prod = demo mode (UI label change). Zero throwaway work. ก๊อต/เดฟ ตัดสินใจ A/B/C parallel เป็นการบ้าน Phase H/I ไม่ rush. **ภูม unblocked** ทำ Track A tests parallel + label-change UI (~1h เมื่อพร้อม) |
| **R2** | PCS Cargo branding cutoff | ✅ **Scrub** | ลบ "PCS Cargo" / "pcscargo.co.th" / "legacy PHP" mentions ใน code comments / test data / migrations. Replace ด้วย "legacy" generic หรือลบทิ้ง ถ้า rot context. `docs/audit/php-pcscargo-integrations.md` คงไว้เป็น **internal-only** doc (ไม่อยู่ใน landing-public scope). บัญชี `064-174-3836` ห้าม hardcode (ยังไม่อยู่ในโค้ดอยู่แล้ว ✅) |

**Action:** ก๊อต confirm 2 decisions นี้ + spec ออกเป็น 2 ADRs (S2 #1 + S2 #3 ด้านล่าง) → ภูม + ปอน + เดฟ pick up

---

## S2. 🎯 ก๊อต batch — Priority order (~13-17h total, self-directed pace)

### Priority 1 — Unblock work (do first)

| # | Task | Est | Output | Unblocks |
|---|---|---|---|---|
| **K-1** | ✅ ADR-0003: China-search vendor cutoff (lock Option E + Phase H/I A/B/C exploration plan) | 2-3h | `docs/decisions/0003-china-search-vendor.md` | ภูม Track G label-change + future scraper work |
| **K-2** | ✅ ADR-0004: Payment Gateway (lock D-7 = PromptPay-only ก่อน beta; defer Omise/2C2P/Stripe TH to post-beta) | 2-3h | `docs/decisions/0004-payment-gateway.md` | เดฟ ไม่ต้อง spend cycles หา gateway ก่อน launch; M2.1 deferred |
| **K-3** | R2 PCS scrub execution plan | 1h | New section ใน `docs/decisions/0005-pcs-branding-scrub.md` หรือ inline note ที่ Part R2 — list files + grep patterns + who executes (recommend: ภูม + ปอน batch ระหว่างทำ task ปกติ) | ทีม execute scrub ได้ทันที |

### Priority 2 — Quick decisions (~1h batched)

| # | Task | Recommended | Rationale |
|---|---|---|---|
| **K-4** | D-8 HS variants — แยก / merge เข้า tier? | (ก๊อต lock) | ภูม P-20 ship `hs_codes` + `container_hs_lines` แล้ว — review schema + decide |
| **K-5** | D-9 Payroll module — standalone / extend HR? | (ก๊อต lock) | Affects ภูม P-22 attendance + future Phase 2 ERP |
| **K-6** | Tax invoice numbering format | (ก๊อต lock) | `INV-YYYYMM-NNNN` sequential ดูสมเหตุสมผล — confirm |
| **K-7** | Wallet deposit approver role | (ก๊อต lock) | `super` only / `accounting` role / both? — affects RLS policy |

### Priority 3 — Deep work (when time permits)

| # | Task | Est | Output |
|---|---|---|---|
| **K-8** | ADR-0006: Tax invoice flow + numbering (build on K-6 decision) | 2-3h | `docs/decisions/0006-tax-invoice.md` — lock before ภูม implements |
| **K-9** | K-CODEOWNERS setup (`.github/CODEOWNERS`) | 30m | Auto-route PR reviews to ก๊อต — reduces overhead long-term |
| **K-10** | K-tooling-1: CI workflow `.github/workflows/ci.yml` (lint + test + build on PR) | 2-3h | Quality gate before manual review |
| **K-11** | K-sec-1: OWASP Top 10 audit | 4-6h | `docs/audit/owasp-2026-05.md` — launch confidence |

### Priority 4 — Nice-to-have (after Priority 1-3)

- K-sec-2 RLS policy comprehensive audit (3-4h)
- K-sec-3 Audit log coverage gap report (1-2h)
- K-ADR-erp-phase-2 co-author with ภูม (4-6h) — see Sprint 7+ Track D
- K-quality-* refactor proposals (Sprint 7+ Track K5)

---

## S3. 🔄 เดฟ → ภูม / ปอน hand-off (after R1+R2 lock)

### ภูม
- 🟢 **Continue self-directed:** Track A tests P-28..P-31 (~7-9h, no R1 dependency)
- 🟡 **After K-1 ADR ships:** P-50 Option E label change UI (~1h) — "ใส่ข้อมูลสินค้าเอง — ระบบ search กำลังพัฒนา"
- 🟡 **After K-3 ADR ships:** PCS scrub task list — ภูม own backend half (actions/, lib/, migrations/, supabase/)
- 🟢 **Continue:** Sprint 6 leftover P-22 attendance + P-23 meeting room (after K-5 D-9 decision) + P-27 ADR draft

### ปอน
- 🟢 **Continue:** Phase D L-9b/c i18n polish (anytime)
- 🟡 **After K-3 ADR ships:** PCS scrub frontend half (components/, app/, messages/) — coordinate w/ ภูม
- 🟡 **Blocked on เดฟ confirm:** Phase B L-5 priority page order (เดฟ pick: home → import-china → china-shopping → customs-clearance per ปอน suggestion)
- 🟡 **Blocked on เดฟ LIFF app creation:** "เพิ่ม LINE OA" CTA drop at landing pages

---

## S4. 🚀 เดฟ self-batch (this week, parallel with ก๊อต batch)

| # | Task | Est | Blocker |
|---|---|---|---|
| **DV-1** | External signups: Sentry + Upstash + hCaptcha (all free tier) | 30m | None — เดฟ ทำได้ทันที |
| **DV-2** | Create LIFF app ใน LINE Console (use Channel ID `2009931373`) → set `NEXT_PUBLIC_LIFF_ID` ใน Vercel | 30m | None |
| **DV-3** | ThaiBulkSMS account apply + API keys → Vercel env | 30m | None (paid per SMS) |
| **DV-4** | Pacred owner ติดต่อ ขอ PromptPay # + bank acct | 15m + รอ | Pacred legal |
| **DV-5** | Landing pivot: L-22 GTM/GA4 conversion tracking | 3-4h | None — เดฟ self-directed |
| **DV-6** | Landing pivot: L-23 heatmap integration (Microsoft Clarity = ฟรี, recommended) | 2-3h | None |
| **DV-7** | Landing pivot: L-24 A/B infra scaffold (GrowthBook free tier or Vercel Edge Config) | 3-4h | None |
| **DV-8** | Help ปอน Phase B L-5 — เดฟ confirm priority page order + scaffold helpers | 6-8h | ปอน sync |

**Estimate รวม:** ~16-22h งานเดฟ this week. หลัง creds เข้าจาก DV-1..DV-4 → activate Sentry/Upstash/hCaptcha ใน Vercel + redeploy = unblock production hardening

---

**End of Part S.** เดฟ→ก๊อต hand-off pattern: ทุกครั้งที่เดฟต้อง offload งานสำคัญให้ก๊อต → append entry ใน Part S ใหม่ (new section S5, S6, ...) พร้อม commit message `docs(port-plan): hand-off batch to ก๊อต — <topics>`. ก๊อต tick off ใน follow-up commit.
