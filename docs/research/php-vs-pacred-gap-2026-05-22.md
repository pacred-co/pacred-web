# PHP PCS Cargo ↔ Pacred Next.js — Gap Audit (2026-05-22)

**Author:** เดฟ (Claude session · `distracted-bhabha` worktree)
**Sources surveyed:**
- Legacy PHP source: `C:\Users\devvork\Desktop\newrealdatapcs\pcscargo\` (~20k .php files · WordPress + member + pcs-admin)
- ภูม's PCS LEARNING corpus: `BUSINESS_FLOW.md` · `PCS_ADMIN_ROLES_AND_MENUS.md` · `PCS_CARGO_COMPLETE_ANALYSIS.md` (44k tokens · partial read) · `PCS_Cargo_Guidebook_TH.md` · `docs.md`
- Real-data SQL dumps: `database-member/2026-05-18-1358-pcsc_main.sql` (latest · 117 tables · ~8,898 customers) + 3 historic snapshots
- Customer-portal Next.js inventory: branch `dave-pacred` HEAD `6eeb815` (57 protected + 7 public service routes · ~20 with legacy CSS)
- Admin Next.js inventory: branch `Poom-pacred` HEAD `09369f3` (161 admin routes · ~105 full + 12 partial + 25 placeholder + 19 redirect)
- Migration state: `0081_pcs_legacy_schema.sql` ports all 117 legacy tables 1:1 · `0082..0093` infra

---

## 0. Headline findings

1. **Schema port: COMPLETE.** All 117 legacy `pcsc_main` tables (110 `tb_*` + 6 `tas_*` + `reserve_meeting_room`) are present in migration `0081`. There is NO structural gap in the DB. Phase A schema work is DONE.
2. **The real gap is workflow + integrations, not tables.** Specifically the warehouse-intake APIs (JMF · TTP · CTT/MK/MX Sheet sync · CargoCenter CN), the 12 QA escalation queues, the container-HS approval flow, barcode scanning, and the 7 detailed accounting/closing reports that staff use daily.
3. **Customer portal: ~25 screens transcribed of ~30 PHP customer pages.** 5-7 customer screens still missing (history · regis-tam · register-id · invoiceF · some print variants) — and our "modern" customer routes (orders · bookings · refunds · freight) need a fidelity check against legacy `shops.php` · `forwarder.php` · `payment.php` to confirm zero-retraining.
4. **Admin: 105 full of ~187 PHP entry pages.** Major missing groups: 12 QA-escalation pages · 8 barcode pages · 6 commission/payout pages · 15+ reports · all 4 partner-API integrations (JMF · TTP · CN · MX/CTT/MK Sheet imports) · admin-acc · admin-table-linenotify · organization-line/tell/wechat/domainname.
5. **Pacred-original capability (KEEP, do NOT retire):** the freight stack (~10 tables · quotes/shipments/invoices/QA/customs) · tax-invoice + WHT · refund flow · accounting periods · org-chart · work-items · bookings. These coexist with the ported `tb_*` schema and stay for Phase C.

---

## 1. Customer portal — gap table

Legend: ✅ shipped + faithful · 🟢 shipped (modern, fidelity-check needed) · 🟡 partial · 🔴 missing · ⚫ Pacred-original (keep)

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `member/index.php` | `(protected)/dashboard` | ✅ | `index.css` ported · 9-icon launchpad + promo carousel + 4 stat cards |
| `member/login.php` | `(auth)/login` + `/pcs-login` | ✅ | Legacy-auth bridge (`lib/auth/pcs-legacy-bridge.ts`) verifies the 79-char legacy hash |
| `member/register.php` | `(auth)/register` | ✅ | OTP-gated |
| `member/regis-tam.php` | — | 🔴 | TAMIT integration registration — paste 1688/Taobao link + auto-fill TAMIT user. Defer to Phase C if not active. |
| `member/register-id.php` | — | 🔴 | Corporate-juristic registration (separate signup form for juristic entity). Currently we treat all signups the same. |
| `member/account-settings.php` | `(protected)/account-settings` | ✅ | `account-settings.css` ported |
| `member/profile.php` | `(protected)/profile` | ✅ | + `/profile/security/change-phone` |
| `member/address.php` | `(protected)/addresses` | ✅ | `address.css` ported |
| `member/china-address.php` | `(protected)/china-address` | ✅ | `china-address.css` ported |
| `member/cart.php` | `(protected)/cart` | ✅ | `cart.css` ported · L424-755 transcribed |
| `member/shops.php` | `(protected)/service-order` | ✅ | `shops.css` ported · `/add`, `/[hNo]`, `/[hNo]/receipt`, `/cart`, `/pending`, `/print` |
| `member/forwarder.php` | `(protected)/service-import` | ✅ | `service-import.css` ported · `/add`, `/[fNo]`, `/[fNo]/receipt`, `/pending`, `/receipts`, `/receipts/print`, `/table`, `/warehouse-addresses` |
| `member/forwarder-table.php` | `(protected)/service-import/table` | ✅ | `forwarder-table.css` ported |
| `member/payment.php` | `(protected)/service-payment` | ✅ | `payment.css` ported · `/add`, `/[id]` |
| `member/wallet/...` (folder) | `(protected)/wallet` + `/deposit /withdraw /history` + `/wallet-credit` | ✅ | `wallet.css` ported |
| `member/pay.php` | `(protected)/pay` | ✅ | `pay.css` ported (PromptPay QR generator) |
| `member/search.php` | `(protected)/search` | ✅ | `search.css` ported (China product search via TAMIT/AkuCargo/Laonet) |
| `member/map.php` | `(protected)/map` | ✅ | Google Maps embed |
| `member/invoiceF.php` | — | 🔴 | Customer-side standalone invoice PDF for forwarder orders. We have admin-side at `/admin/accounting/forwarder-invoice` but no customer download endpoint. Customer printing currently goes through `/service-import/[fNo]/receipt` which may not be the same document. |
| `member/printShop.php` | `(protected)/service-order/print` | 🟢 | `print-shop.css` ported · **fidelity check needed:** does the print layout match legacy 1:1? |
| `member/printReceiptF.php` | `(protected)/service-import/receipts/print` | 🟢 | `print-receipt-f.css` ported · **fidelity check needed** |
| `member/history.php` | — | 🔴 | Customer usage history page (last login + actions + audit-log feed). Common admin support tool — "เราโทรหาคุณตอนไหน". Defer? Phase B nice-to-have. |
| `member/line-notify.php` + `member/line.php` | — | 🟡 | LINE webhook/notify endpoints. We have Messaging API + LIFF in code — confirm equivalent endpoints exist and the legacy LINE Notify EOL behavior is handled. |
| `member/fb-callback.php` | — | 🔴 | Facebook OAuth callback. Currently NOT WIRED — `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` keeps social login OFF per [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md) (legacy was password-only). Defer to Phase C. |
| `member/mail.php` | — | ⚫ | Server-side helper — Pacred uses Resend SDK. Not a customer-facing page. |
| `member/convertURL.php` | — | ⚫ | URL parser for 1688/Taobao/Tmall — used by search. Pacred routes through TAMIT API. Helper, not a page. |
| `member/report-user-sales.php` (× 3 files) | `(protected)/sales` + `/sales/history` + `/sales/report` | ✅ | `report-user-sales.css` ported · agent view |

**🟢 Modern routes — fidelity check against legacy needed (likely diverge from PHP UX):**
- `(protected)/orders` + `/orders/new` (replaces legacy `shops.php` flow — already have `/service-order`, this is a DIFFERENT modern path — verify these two coexist intentionally)
- `(protected)/bookings` + `/bookings/[bookingNo]` (BK-1 booking flow — Pacred-original, KEEP)
- `(protected)/freight/*` (Pacred-original FCL/LCL stack, KEEP)
- `(protected)/refunds` (Pacred-original — KEEP, more capable than legacy `tb_credit`)
- `(protected)/commissions/me` + `/commissions/me/[id]` (Pacred-original self-serve — KEEP)
- `(protected)/notifications` (Pacred-original notification feed — verify legacy parity)
- `(protected)/my-issues` (Pacred-original incident-status page — KEEP)
- `(protected)/shipments` + `/shipments/[code]` (modern container tracker — verify legacy `forwarder.php?ID=` detail-view parity)

---

## 2. Admin — gap table (by category)

### 2.1 Customer management

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `users.php` | `/admin/customers` | ✅ | + `/pending`, `/recently-active` |
| `users-search.php` | `/admin/search` | ✅ | Global search hub |
| `users/all/` (subdir) | `/admin/customers` | ✅ | All members tab |
| `users/general/` | `/admin/customers?type=general` | 🟡 | Filter exists? Verify it serves the "สมาชิกทั่วไป" tab the way legacy does |
| `users/vip/` | `/admin/customers?type=vip` | 🟡 | Same — verify dedicated tab |
| `users/svip/` | `/admin/customers?type=svip` | 🟡 | SVIP tab |
| `users/corporation/` | `/admin/customers?type=corporation` | 🟡 | Juristic-entity tab |
| `users/credit/` | `/admin/customers?type=credit` | 🟡 | VIP-credit tab |
| `users/comparison/` | `/admin/customers?type=comparison` | 🟡 | "คิดค่าเทียบ" tab |
| `recently-used-imported-customers.php` | `/admin/customers/recently-active` | ✅ | |
| `transferSalesCustomers.php` | `/admin/customers/transfer-rep` | ✅ | |
| `shop-search.php` | `/admin/search` (overlap) | 🟡 | Specifically for shop orders — verify separate tab |
| `pay-users.php` | `/admin/wallet/pay-user` (redirect) | 🟡 | "จ่ายแทนลูกค้า" — pay on behalf of customer · need to verify the redirect target works |
| Customer detail tabs (`users/profile-*`): `profile-shop`, `profile-forwarder`, `profile-payment`, `profile-cash-back`, `profile-wallet`, `profile-wallet-add`, `profile-wallet-his`, `profile-wallet-payment`, `profile-wallet-withdraw` | `/admin/customers/[id]` | 🟡 | Single page — verify all 9 tabs/sections are present |

### 2.2 Forwarder operations (cargo import)

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `forwarder.php` | `/admin/forwarders` | ✅ | List + `/[fNo]`, `/bulk-search`, `/combine-bill`, `/container-cost-check`, `/notes`, `/warehouse-history` |
| `forwarder-search.php` + `forwarder-search-muti.php` | `/admin/forwarders/bulk-search` | ✅ | |
| `forwarder-action.php` | `/admin/forwarder-action` | ✅ | Bulk actions |
| `forwarder-bill.php` | `/admin/forwarders/combine-bill` | ✅ | Combine multiple imports into one invoice |
| `forwarder-check.php` | — | 🔴 | Pre-shipment check workflow — used before container close. Verify if folded into `/container-cost-check` |
| `forwarder-driver.php` | `/admin/driver-runs` | 🟢 | Admin-side driver assignment — **fidelity check:** does the assignment grid match legacy? |
| `forwarder-driver-w.php` | — | 🔴 | **Driver mobile work-list** — the page drivers open on their phone to see "งานที่ต้องส่งวันนี้". CRITICAL for driver role. Not yet ported. |
| `forwarder-import-warehouse.php` + `forwarder-import-warehouse2.php` | `/admin/forwarder-import-warehouse` (placeholder) | 🔴 | Warehouse-import intake (TH arrival). PHP `…2.php` likely a newer revision. We have a STUB. |
| `forwarder-quotation.php` | `/admin/freight/quotes` | 🟢 | Pacred has a freight quote system — verify it serves the cargo-forwarder quote case too, not just freight |
| `forwarder-sale.php` | `/admin/forwarder-sales` | ✅ | |
| `shopping-return.php` | `/admin/refunds` | 🟢 | Returns flow — verify fidelity to legacy shopping-return workflow |
| `notify.php` (front-page announcement) | `/admin/broadcasts` | 🟢 | We have broadcasts — verify it covers the "ประกาศหน้าแรก" front-page banner edit |
| `popup.php` (customer popup) | — | 🔴 | Customer-popup notifications (modal on login). Not in Pacred. |

### 2.3 Container + HS code (CRITICAL revenue path)

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `cnt-hs.php` | `/admin/cnt-hs` (placeholder!) | 🔴 | **Container HS code mgmt + cost ledger** — this is the page where ภูม approves per-container HS-coded costs before paying suppliers. We have a PLACEHOLDER. CRITICAL P0. |
| `cnt-hs/?q=1` (approval queue) | `/admin/cnt-hs?q=1` (placeholder) | 🔴 | Approval queue for container HS costs. Same as above. |
| `cnt.php` | `/admin/containers` (redirect) | 🟡 | Container list — redirects to where? Verify the redirect terminus works |
| `check-sang-cost.php` | `/admin/forwarders/container-cost-check` | ✅ | Sheet-based cost audit |
| `report-cnt.php` | `/admin/report-cnt` (redirect) | 🟡 | Container report — verify redirect target works |
| `freight-th/` (approval queue) | — | 🔴 | **Thailand-freight cost approval queue** — separate from cargo HS. Approve TH-side container delivery costs before paying drivers/carriers. NOT in Pacred yet. |
| `freight-th/?q=1` | `/admin/withdrawal/freight-th` (placeholder) | 🔴 | Same — we have placeholder |
| `hs-customrate.php` | `/admin/rates/custom-hs` | ✅ | |
| `hs-forwarder-invoice.php` | `/admin/accounting/forwarder-invoice` | 🟡 | partial in our admin — verify the HS-line breakdown matches legacy invoice |
| `hs-forwarder-receipt.php` | `/admin/accounting/forwarder` (?) | 🔴 | HS-coded forwarder receipt — separate from generic forwarder receipt. Verify presence. |
| `hs-receipt-forwarder.php` | `/admin/accounting/forwarder` (?) | 🟡 | Receipt history view |
| `single-code-text-converter.php` + `…-uncomma.php` | — | 🔴 | HS-code text utility (paste comma-separated codes, normalize). Small utility, ship as `/admin/tools/hs-code-converter`. |
| `salary-hs.php` | — | 🔴 | HS-code based salary (??) — pay warehouse staff by HS code count. Verify the model before porting. |

### 2.4 Barcode scanning (Warehouse — 8 PHP files)

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `barcode-d-all.php` (scanner: find all) | `/admin/barcode/cargo/all` (redirect) | 🟡 | Redirect — verify terminus |
| `barcode-c-all.php` (camera: find all) | `/admin/barcode/cargo` | ✅ | Hub page |
| `barcode-d-import.php` (scanner: import-to-warehouse) | `/admin/barcode/cargo/import` | ✅ | |
| `barcode-c-import.php` (camera version) | `/admin/barcode/cargo/import` | ✅ | Verify camera fallback in same page |
| `barcode-d-prepare.php` (scanner: prepare-to-ship) | `/admin/barcode/cargo/prepare` | ✅ | |
| `barcode-c-prepare.php` (camera version) | `/admin/barcode/cargo/prepare` | ✅ | |
| `barcode-d-from.php` (scanner: from-box) | `/admin/barcode/cargo/from` | ✅ | |
| `barcode-c-from.php` (camera version) | `/admin/barcode/cargo/from` | ✅ | |
| Driver-mobile barcode pages | `/admin/barcode/driver/*` | 🟡 | All 4 driver-side variants redirect — verify they land on the actual mobile scan UI |
| `barcode-c-import2.php` | — | 🔴 | "v2" import scanner — newer revision · verify which version is the live one |

### 2.5 Accounting (recognize-revenue · close · refund)

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `acc-system.php` (รายรับ-รายจ่าย) | `/admin/accounting` | ✅ | Hub |
| `acc-topup.php` | `/admin/accounting` (?) | 🟡 | Topup-only listing — verify dedicated tab |
| `acc-shop.php` | `/admin/accounting/shop` | ✅ | |
| `acc-forwarder.php` | `/admin/accounting/forwarder` | ✅ | |
| `acc-payment.php` | `/admin/accounting/payment` | ✅ | |
| `acc-withdraw.php` | `/admin/accounting/withdraw` | ✅ | |
| `acc-shop-refund.php` | `/admin/refunds` | 🟢 | Verify refund accounting feeds the same view |
| `acc-system-cargo.php` | `/admin/accounting/cargo` | 🟡 | partial · verify the full Cargo-only acc dashboard renders |
| `closingAccReportForwarder.php` | `/admin/accounting/closing` + `/periods/[period_yyyymm]` | ✅ | Period close flow |
| `gateway.php` + `gateway-prepare.php` + `gatway-receipt-forwarder.php` | — | 🔴 | Payment gateway dispatcher — verify Pacred's PromptPay/Omise wiring covers all legacy gateway cases |
| `create-f-receipt.php` | — | 🔴 | Generate forwarder receipt PDF — verify printing flow in Pacred |

### 2.6 Reports (a LOT — many placeholders in Pacred)

| PHP page | Next.js route | Status | Priority |
|---|---|---|---|
| `report-shops.php` + `…-profit` + `…-profit-pay` + `…-profit-pay-history` | `/admin/reports/shop` (placeholder) | 🔴 | P1 — daily-use sales reports |
| `report-shop-group-by-user.php` | `/admin/reports/forwarder-volume` (?) | 🟡 | Verify it serves "ยอดขายรวมตามรหัส" |
| `report-forwarder.php` + `…-volume` + `…-profit` | `/admin/reports/forwarder-volume` (full) + `/forwarder` (placeholder) | 🟡 | Volume done, profit page missing |
| `report-payments.php` + `…-profit` | `/admin/reports/payment` (placeholder) | 🔴 | P1 |
| `report-sale.php` + `report-sale-new.php` | `/admin/reports/sales-by-rep` (placeholder) | 🔴 | P1 — sales-rep leaderboard. **NEW vs OLD methods exist** — the new calc method is `report-sale-new.php`. |
| `report-sales-group-by-user.php` | — | 🔴 | Sales rolled-up by customer rep code |
| `report-user-all.php` | — | 🔴 | All-services rollup per user (shop + forwarder + payment + wallet) |
| `report-user-sales-history.php` | `/admin/reports/user-sales-history/[customer_id]` (redirect) | 🟡 | Verify redirect terminus |
| `report-user-service.php` + `…-all` | — | 🔴 | Per-user service usage |
| `report-search.php` | — | 🔴 | Search-bar usage analytics (what users search for in China-product search) |
| `report-system.php` + `…-profile` | `/admin/reports/system` (placeholder) | 🟡 | P2 |
| `report-driver-2023.php` + `report-driver.php` + `report-driver2.php` | — | 🔴 | Driver activity (km · delivery count · failures). 3 versions — port the 2023 one. |
| `report-cnt.php` + `report-cnt/pay` | `/admin/report-cnt` (redirect) + `/admin/report-cnt/pay` (placeholder) | 🔴 | Container reports — P0 (container-cost approval) |
| `report-api-sms.php` | — | 🔴 | SMS usage (cost tracking) — also see `/admin/reports/...` |
| `report-otp-not-pass.php` + `…-success` | — | 🔴 | OTP failure/success funnel — important for register-conversion debug |
| `report-pro-3-year-anniversary.php` + `…-oh-my-ghost` + `…-survey202306` | — | ⚫ | Promo-campaign reports — Pacred-original Phase-C |
| `report-forwarder-volume.php` | `/admin/reports/forwarder-volume` | ✅ | |
| `report-shops-profit-pay.php` (เบิกเงินค่าสินค้า) | `/admin/sales-payouts` | 🟡 | Verify the payouts flow matches |
| `report-shops-profit-pay-history.php` | `/admin/sales-payouts/[id]` history | 🟡 | |

### 2.7 QA & Quality Control (12 escalation queues — ALL stubbed)

Pacred has `/admin/qa` as a PLACEHOLDER hub. The PHP system has 12 distinct escalation queues that QA staff work through daily. All are missing — this is a major workflow gap.

| PHP page | Next.js route | Priority | Description |
|---|---|---|---|
| `delayedPaymentShop.php` | — | 🔴 P1 | Shop orders unpaid > 1 day (auto-promote to QA queue) |
| `delayedPaymentForwarder.php` | — | 🔴 P1 | Forwarder unpaid > 2 days |
| `orderCancellationList.php` | — | 🔴 P1 | Cancellation review queue |
| `creditOverdueForwarder.php` | — | 🔴 P1 | VIP credit overdue list |
| `shopS1Over10Min.php` | — | 🔴 P1 | Shop in status=1 (cart) > 10 min — CS follow-up |
| `chineseShopDelay.php` | — | 🔴 P1 | Chinese shop hasn't shipped > 2 days |
| `delayedWarehouseChineseEntry.php` | — | 🔴 P1 | Goods not in China warehouse > 2 days |
| `thaiDeliveryDelay.php` | — | 🔴 P1 | Thai delivery overdue |
| `ownerlessProducts.php` | — | 🔴 P1 | Items in warehouse with no owner (orphan tracking) |
| `shippingPrepOverdue.php` | — | 🔴 P1 | Ship-prep overdue |
| `newClientFollowUpDelay.php` | — | 🔴 P1 | New customers not contacted > 2 days |
| `transferSalesCustomers.php` (in QA context) | `/admin/customers/transfer-rep` | ✅ | Done |

**Implementation approach for QA queue:** all 12 share the same shape — a filtered list of rows from `tb_shops` / `tb_forwarder` / `tb_user` matching a "stale" condition + ?s=1 ("ที่ต้องดำเนินการ") tab + history tab + per-row action (snooze · close · escalate). Build one shared `<QAQueue>` component, drive each route off a config (table + filter + columns + actions). **Use `copyist-unlimited` skill** — 12 variants of one template.

### 2.8 HR + Organization

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `admin-table.php` (พนักงานทั้งหมด) | `/admin/admins` | ✅ | |
| `add-admin.php` | `/admin/admins` (?) | 🟡 | Verify add-admin flow is in the list page or separate |
| `admin-profile.php` | `/admin/admins/[id]` | ✅ | |
| `admin-acc.php` (bank accounts) | — | 🔴 | Admin bank accounts (for payroll) — NOT in Pacred. P2 |
| `admin-table-linenotify.php` | — | 🔴 | Admins connected to LINE Notify — DEAD because LINE Notify EOL Apr 2025; need a Messaging-API equivalent (admin LINE OA opt-in). Defer. |
| `organization-chart.php` | `/admin/hr/org-chart` | ✅ | |
| `organization-table.php` | `/admin/hr/org-table` | ✅ | |
| `organization-tell.php` | — | 🔴 | Org phone directory |
| `organization-email.php` | `/admin/organization-email` | ✅ | |
| `organization-line.php` | — | 🔴 | Org LINE handles directory |
| `organization-wechat.php` | — | 🔴 | Org WeChat directory (China staff) |
| `organization-domainname.php` | — | 🔴 | Org domain list |
| `organization-category-product.php` | — | 🔴 | Product category mgmt |
| `time-attendance-system.php` (FULL) | `/admin/hr/attendance` + `/leaves` + `/leave-record` | ✅ | + holiday calendar + Maid calendar |
| `post-job.php` + `post-job-hs.php` | `/admin/hr/recruitment` + `/new` + `/[id]` | ✅ | |
| `jobFlowchart.php` | — | 🔴 | Onboarding flowchart for new hires (HR doc page) |
| `businessPlan.php` | — | 🔴 | Internal business plan doc |
| `corporateCulture.php` | — | 🔴 | Corporate culture doc |
| `training-regulations.php` | `/admin/hr/training` | 🟢 | Training module · fidelity check needed |
| `termsOfServiceCargo.php` | `/admin/settings/tos-versions` | ✅ | |
| `contact-list-outsider.php` | — | 🔴 | External-contact directory (suppliers · contractors · partners) — used by ฝ่ายซ่อมบำรุงทรัพย์สิน. P3 |
| `disbursement-of-expenses/` | `/admin/accounting/disbursements` | ✅ | |
| `stock-used-organization/` | — | 🔴 | Stock of office supplies — separate from cargo inventory |
| `booking-meeting-room.php` | — | 🔴 | Meeting-room booking (we have `bookings` table for FREIGHT bookings — different domain) |

### 2.9 Commission (sales rep + interpreter)

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `withdraw-commission-sale.php` | `/admin/commissions` + `/[id]` | ✅ | History |
| `withdraw-commission-sale.php?page=add` | `/admin/commissions/[id]` (action) | 🟡 | Verify the "ทำรายการเบิกเงิน" form is reachable |
| `withdraw-commission-sale.php?q=1` (approval queue) | — | 🔴 | Approval queue — NOT obvious in Pacred. P1. |
| `withdraw-commission-sale-new.php` | — | 🔴 | **NEW** commission calc method — the legacy is keeping both running. **Decision point: which is canonical?** Ask owner. |
| `withdraw-commission-interpreter.php` | — | 🔴 | Chinese-interpreter commission ("ค่าคอมล่ามจีน") — separate role from sales rep. NOT in Pacred. P1. |
| `withdraw-commission-interpreter.php?q=1` | — | 🔴 | Approval queue for interpreter commissions |
| `withdraw-commission-interpreter-new.php` | — | 🔴 | NEW calc method for interpreter |
| `report-user-sales/THADAVIP/` + `SINVIP/` + `OOAEOMVIP/` + `SWAN/` | — | 🔴 | Per-VIP-agent reports (4 named groups). Hardcoded VIP-tier agents. Defer to Phase C if not active. |
| `report-user-sales-history/?s=2` (approval queue) | — | 🔴 | "อนุมัติรายการเบิกเงินตัวแทน" — agent payout approval |

### 2.10 Settings + Marketing

| PHP page | Next.js route | Status | Notes |
|---|---|---|---|
| `settings.php` (ทั่วไป) | `/admin/settings` | ✅ | |
| `settings-vip.php` | — | 🔴 | VIP membership-tier setup (define VIP/SVIP rules). NOT in Pacred. P2 |
| `rate.php` + `rate/general/` | `/admin/rates/general` | ✅ | |
| `rate-vip.php` + `rate-vip/` | `/admin/rates/vip` | ✅ | |
| `notify.php` (ประกาศหน้าแรก) | `/admin/broadcasts` | 🟢 | Fidelity check — does broadcasts cover the legacy "ประกาศหน้าแรก" use case? |
| `popup.php` | — | 🔴 | Customer-side popup announcement on login. P2 (marketing tool) |
| `adjust-words-below-search.php` | — | 🔴 | Marketing copy below search bar (rotating SEO words). P3 |
| `check-juristic.php` | `/admin/juristic-check` | ✅ | |
| `thai-transport/` | — | 🔴 | Thai transport carriers' contact + capabilities directory. Used by ops. P2 |
| `check-customer-maomao-free.php` + `…-maomao-vip.php` | — | 🔴 | "Maomao" customer-flag QA pages (special VIP scheme). Verify with owner if still in use. |
| `check-customer-shipby-freedom.php` | — | 🔴 | "ShipBy Freedom" flag check — likely a deprecated VIP scheme |

### 2.11 Partner APIs / Integrations (CRITICAL P0 — warehouse intake)

| PHP file | Pacred equivalent | Status | Notes |
|---|---|---|---|
| `api-forwarder-cn.php` | — | 🔴 **P0** | **CargoCenter (CN)** API · `tb_forwarder.fWarehouseName=7`. Real-time tracking from Chinese partner. Dashboard at `/api-forwarder-cn.php?page=dashboard` + scan endpoint at `?page=APICheckSM` |
| `api-forwarder-jmf.php` + `api-forwarder-jmf-backup.php` | `MOMO_JMF_TOKEN` env exists, no impl | 🔴 **P0** | **JMF Cargo Import** (Chiang Mai partner — บริษัท เจเอ็มเอฟ คาร์โก้ อิมพอร์ต เซอร์วิส จำกัด · taxID 0735563005872). `tb_forwarder.fWarehouseName=5`. Critical for container intake from China. JWT already issued. |
| `api-forwarder-ttp.php` + `testAPITTP.php` | — | 🔴 **P0** | **TTP** partner API (TTP = old PCS sister-co). Need to check if Pacred should still call this or if it's being scrubbed. Per `docs/runbook/pcs-scrub-plan.md` — wait for ก๊อต's switchover signal. |
| `api-sheets-ctt.php` | — | 🔴 **P0** | **CTT warehouse Sheet sync** (Google Sheets → `tb_forwarder` rows). Warehouse staff paste tracking + product details in a Sheet, this endpoint pulls them into the DB. P0 because warehouse intake currently relies on this. |
| `api-sheets-mk.php` | — | 🔴 **P0** | MK warehouse Sheet sync (same pattern as CTT) |
| `api-sheets-mx.php` | — | 🔴 **P0** | MX warehouse Sheet sync |
| `api-sheets-sang-2023.php` | — | 🔴 **P0** | "Sang" Sheet 2023 — generic sheet importer. May be the canonical successor to CTT/MK/MX-specific ones. Check. |
| `a-jmf-invoice.php` | — | 🔴 P1 | JMF-branded invoice PDF (uses mPDF + sarabun font). Need to port the PDF generation pattern. |
| `import-excel.php` | `/admin/csv-imports` | 🟢 | Pacred has CSV imports — verify XLSX too |
| `convertURL.php` (1688/Taobao URL parser) | `lib/forwarder/...` (?) | 🟡 | Used by China-search. Verify the Next.js implementation handles all 4 URL formats |
| `automation/php/reset-credit-forwarder.php` | `/admin/system/crons` | 🟡 | Cron job — reset credit limits monthly. Verify it's wired in our cron list |
| `api-new-1.php` + `api-new-2.php` | — | 🔴 | Unknown — open files to identify |

### 2.12 Print + Document Generation

| PHP page | Pacred | Status | Notes |
|---|---|---|---|
| `printAll.php` | — | 🔴 | Print "all" overview — likely batch-print for cargo manifest |
| `printBill.php` + `printBill copy.php` | — | 🟡 | Bill printing — verify `/admin/forwarders/combine-bill` handles it |
| `printDriver.php` | — | 🔴 | Driver-side print (delivery manifest) |
| `printPCSF.php` | — | 🔴 | "PCS-F" print — probably forwarder receipt master template |
| `printReceipt.php` | — | 🟡 | Generic receipt — verify our `/receipts/print/[id]` covers it |
| `printShop.php` | `/service-order/print` | ✅ | Customer-side done |
| `printZone.php` | — | 🔴 | Print zone-based delivery sheet |
| `print-report-shop.php` | — | 🔴 | Print shop report (admin) |
| `exampleReceiptF.php` + `exampleSummaryF.php` | — | ⚫ | Examples — skip |

---

## 3. Database — V2-original tables to retire / keep (Phase B follow-on)

Per agent-3 schema diff: 0 missing tables · 101 Pacred-original tables exist. **50ish of those are duplicates** of legacy `tb_*` and should retire AFTER Phase B reroutes off them. **50ish are Pacred-original capability** that we KEEP (freight stack · tax-invoice · refund · accounting periods · org-chart · work-items · bookings).

🔁 **Retire pattern is established:** `0090_drop_spine_tables.sql` already dropped 3 V2 cargo-spine tables. Continue the pattern for these next:

| V2 table | Legacy replacement | Retire-priority |
|---|---|---|
| `orders` / `service_orders` / `service_order_items` | `tb_order` + `tb_shops` | P1 |
| `cart_items` | `tb_cart` | P1 |
| `wallet` + `wallet_transactions` | `tb_wallet` + `tb_wallet_hs` + `tb_wallet_paydeposit` | P1 |
| `yuan_payments` | `tb_payment` + `tb_shop_pay_h/sub` | P1 |
| `addresses` | `tb_address` + `tb_address_main` + `tb_admin_address` | P2 |
| `forwarders` + items + images + status_log | `tb_forwarder` + `tb_forwarder_item` + `tb_forwarder_img` + `tb_log_forwarder_status` | P1 |
| `containers` | `tb_cnt` + `tb_cnt_item` + `tb_cost_container` | P1 — 0090 started this |
| `customer_groups` + `settings` + `rate_*` | `tb_settings` + `tb_rate_g_*` + `tb_rate_vip_*` | P2 |
| `notifications` + `notification_reads` | `tb_notify` + `tb_notify_read` + `tb_notify_sheet_ctt` + `tb_notify_wp` | P2 |
| `team_leaders` + `sales_payouts` + `sales_commissions` | `tb_user_sales` + `tb_user_sales_pay` + `tb_user_sales_admin_pay` + `tb_sales_report` + `tb_withdraw_comm_*` | P1 |
| `promotions` + `promotion_applications` | `tb_promotion` + `tb_promotion33` + `tb_pro_valentine` | P3 |
| `csv_imports` | `tb_csvimport` | P3 |
| `hs_codes` + `container_hs_lines` | `tb_api_china_hs` + `tb_customrate_hs` + `tb_hs_rate_custom_cbm/kg` | P2 |
| V2 attendance: `attendance_logs` + `leave_requests` + `job_postings` + `job_applicants` | `tas_historydata_mobile/old/old_tmp` + `tas_leave` + `tas_holiday` + `tb_post_job` | P2 |

⚫ **KEEP** (Pacred-original, no legacy equivalent — coexist with `tb_*` schema permanently):
- `tax_invoice_*` (RD Code 86 e-tax invoice)
- `withholding_tax_entries` (ADR-0015 WHT)
- `freight_*` (FCL/LCL international stack — 10 tables)
- `qa_inspections` + `freight_qa_inspections` + `customs_declarations` (Phase C-ready)
- `refund_requests` + `refund_request_seq` (more capable than legacy `tb_credit`)
- `commission_tiers` + `commission_accruals` + `commission_withdrawals` (cleaner than legacy — consolidate with `tb_withdraw_comm_*`)
- `broadcasts` + `business_config` + `cron_invocations` + `impersonation_sessions` + `platform_incidents` + `work_items` + `bookings` (admin operational tooling)
- `org_branches` + `org_sections` + `org_positions` + `org_assignments` + `org_contacts` (org-chart richer than legacy)
- `tos_versions` + `tos_acceptances` (versioned ToS — richer than legacy `tb_terms_service`)
- `accounting_periods` + `period_close_event` (Pacred-original period close)
- `contact_messages` (lead-funnel from public site)

---

## 4. Implementation order — Top 20 highest-leverage gaps

Sorted by **revenue-impact × frequency of use × faithfulness-mandate**.

### 🔴 P0 — Daily operational blockers (do FIRST)

1. **JMF API integration** — port `api-forwarder-jmf.php`. JWT already in env (`MOMO_JMF_TOKEN`). Container intake from Chiang Mai partner depends on this. ETA 2 days.
2. **Sheet warehouse sync** — port `api-sheets-ctt.php` + `…-mk.php` + `…-mx.php` + `…-sang-2023.php`. Decide if one canonical importer or four. Warehouse intake currently bottlenecked on manual entry. ETA 3 days (one importer · 4 sheet configs).
3. **Container HS approval flow** — turn `/admin/cnt-hs` from placeholder into the full PHP `cnt-hs.php` + `cnt-hs/?q=1` flow. P0 because container release waits on this approval. ETA 2 days.
4. **Thailand-freight cost approval** — port `/freight-th/?q=1` to `/admin/withdrawal/freight-th`. ETA 1.5 days.
5. **CargoCenter (CN) API** — port `api-forwarder-cn.php` for China-side real-time tracking. Less critical than JMF but needed for `fWarehouseName=7` containers. ETA 1.5 days.
6. **QA escalation queue** — build shared `<QAQueue>` component + 12 routes (delayedPaymentShop / chineseShopDelay / thaiDeliveryDelay / etc.). Use `copyist-unlimited`. Staff currently can't escalate. ETA 4 days for all 12 (one template + 12 configs).

### 🟠 P1 — Faithful-port + workflow staff already knows

7. **Driver mobile work-list** — `forwarder-driver-w.php` ported to `/admin/driver-runs/me` (mobile-first). Drivers open this on phone to see "งานวันนี้". ETA 2 days.
8. **forwarder-import-warehouse** — turn `/admin/forwarder-import-warehouse` from stub into the legacy intake flow. ETA 2 days.
9. **Sales commission approval queue** — port `withdraw-commission-sale.php?q=1` + interpreter version. Currently no approval UI. ETA 2 days.
10. **NEW commission calc method** — port `withdraw-commission-sale-new.php` + interpreter `…-new.php`. Decision needed: is NEW canonical or both? Ask owner. ETA 2 days after decision.
11. **All 7 missing core reports**: shop · payment · sales-by-rep · forwarder-profit · user-all · user-service · driver-2023. ETA 1 day each = 7 days.
12. **Forwarder check workflow** — `forwarder-check.php` pre-shipment check. ETA 1 day.
13. **Combine-bill fidelity check** — verify `/admin/forwarders/combine-bill` matches legacy `forwarder-bill.php` exactly. ETA 0.5 day.

### 🟡 P2 — Settings + admin tooling

14. **VIP membership-tier setup** — `settings-vip.php` ported. Defines VIP/SVIP/Corporate/Credit rules. ETA 1 day.
15. **Org directories** — `organization-tell.php` + `…-line.php` + `…-wechat.php` + `…-domainname.php` + `…-category-product.php`. 5 small list pages. Use `copyist-unlimited`. ETA 1.5 days total.
16. **HS-code text utility** — `single-code-text-converter.php` → `/admin/tools/hs-code-converter`. ETA 0.5 day.
17. **Customer popup** — `popup.php` admin + customer-side modal on login. ETA 1.5 days.
18. **Customer-detail tab fidelity** — verify all 9 tabs in `/admin/customers/[id]` (shop · forwarder · payment · cash-back · wallet · wallet-add · wallet-his · wallet-payment · wallet-withdraw). ETA 1 day.

### 🟢 P3 — Customer portal faithfulness

19. **Customer print fidelity** — verify `/service-order/print` matches `printShop.php` 1:1 + `/service-import/receipts/print` matches `printReceiptF.php`. Use `legacy-fidelity-check` skill. ETA 0.5 day each = 1 day.
20. **Modern-route fidelity audit** — for each "🟢 modern" customer route (orders · bookings · refunds · notifications · my-issues · shipments) — confirm with owner whether the modern UX OR a faithful PHP port is desired. ETA 1 day discovery + decision.

**Estimated total ETA for top-20:** ~40 dev-days (1 dev) → ~10 dev-days with 4 devs in parallel.

---

## 5. Quick wins (≤ 0.5 day each — ship between bigger items)

- ✅ HS-code text utility (item 16)
- ✅ Verify combine-bill fidelity (item 13)
- ✅ Verify customer print pages (item 19)
- ✅ Wire admin LINE Notify retirement (rename `admin-table-linenotify.php` use to Messaging API — opt-in)
- ✅ Sync `api-new-1.php` + `api-new-2.php` purpose (read 100 lines each → label or scrub)
- ✅ `salary-hs.php` decision — confirm with owner if real or dead
- ✅ All `test-*.php` files — confirm DEAD CODE (scrub from any port plan)
- ✅ Verify Maomao/Freedom flags — confirm with owner if still in use or dead VIP schemes

---

## 6. Decisions needed from the owner / ก๊อต before starting

1. **Commission calc — old vs new method.** Both `withdraw-commission-sale.php` and `…-new.php` exist. Which is canonical? (#10)
2. **TTP integration switchover.** Per `docs/runbook/pcs-scrub-plan.md` — when does Pacred stop calling TTP? Affects #2/#5 priority.
3. **Modern customer routes (orders · bookings · refunds · etc.).** Owner mandate is "100% sameness FIRST". Do we retire the modern routes (port back to legacy UX) or are these the agreed-upon Phase-C improvements that bypass the mandate? Decision affects item 20.
4. **VIP-agent groups (THADAVIP · SINVIP · OOAEOMVIP · SWAN).** Are these named agents still active? Hardcoding them feels Phase C-deferred.
5. **Maomao + ShipBy Freedom + Corporate-credit + Comparison.** Are these VIP-scheme flags still active or deprecated? Affects `/admin/customers/[id]` tab list.
6. **Customer popup announcements.** Does marketing actively use this? Affects #17.

---

## 7. Cross-links

- D1 direction (current): [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
- Master phase plan: [`docs/UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)
- Faithful-port branch model: [`docs/runbook/faithful-port-plan.md`](../runbook/faithful-port-plan.md)
- Transcription method: [`docs/runbook/faithful-port-transcription.md`](../runbook/faithful-port-transcription.md)
- ภูม's PCS deep docs (source-of-truth for legacy workflows): `C:\Users\devvork\Desktop\newrealdatapcs\N'POOM - PCS LEARNNING\`
- Legacy CSS files (transcribed-screen signal): `public/legacy/pcs/*.css` + `public/legacy/pcs/admin/*.css`
- Skills for this work: `copyist-unlimited` (QA queue · org directories) · `legacy-php-sweep` (per-feature port) · `legacy-fidelity-check` (before-merge gate)
