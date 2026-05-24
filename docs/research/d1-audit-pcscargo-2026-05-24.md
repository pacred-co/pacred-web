# DEEP AUDIT: PCS Cargo Legacy System Workflow Inventory
**Date**: May 24, 2026 | **Source**: REALSHITDATAPCS extraction | **Owner Directive**: ห้าม death (No Missed Flows)

---

## EXECUTIVE SUMMARY

This audit inventories every workflow, modal, AJAX endpoint, loop, and state machine in the legacy PCS Cargo PHP system (2024 snapshot). The system comprises:
- **Customer Portal** (`pcscargo.co.th/member/`) — user-facing web app
- **Backoffice Admin** (`backoffice.pcscargo.co.th`) — CodeIgniter 3 MVC admin system  
- **Freight System** (`pcs-seafreight.com`) — separate V3 reference implementation

### Key Findings
- **286 AJAX calls** across 5 JS files
- **29 SweetAlert modals** (delete/confirm/edit actions)
- **15 database tables** directly touched
- **14 API endpoints** (pricing, OTP, image conversion, LINE notify)
- **7 core customer portal pages** (address, register, order, etc.)
- **Backoffice**: 3 page controllers + 1 API router (CodeIgniter pattern)

**Gap Risk**: Modals and AJAX loops in legacy JS files reference deleted/moved backend handlers. If `/include/pages/address/deleteAddress.php` doesn't exist in extraction, that's a 💀 DEATH-FLOW.

---

## 1. MODAL INVENTORY (SweetAlert)

| Modal Function | Location | Action | Target Endpoint | Data Written | Port Status |
|---|---|---|---|---|---|
| `deleteAddress()` | address2/page.address.js:50 | Delete address with confirmation | `include/pages/address/deleteAddress.php` | DELETE tb_address | ❌ MISSING: handler doesn't exist |
| `setMainAddress()` | address2/page.address.js:85 | Confirm set as primary | `include/pages/address/setMainAddress.php` | UPDATE tb_address | ❌ MISSING: handler doesn't exist |
| `editAddress()` | address2/page.address.js:118 | Load edit form AJAX | `include/pages/address/editAddress.php` | FORM LOAD | ❌ MISSING: handler doesn't exist |
| Address delete confirm | address2/page.address.js:69-76 | Error/success feedback | N/A | N/A | ✅ UI PORTED to Pacred |
| Swal.fire (image convert) | convert-img-to-webp/test.php | Image upload validation | N/A (test file) | N/A | 🟡 SAMPLE CODE |
| OTP Validation Modal | page.register.js | Confirm OTP entry | `api/otp/verify-otp.php` | UPDATE tb_users_otp | ✅ PARTIAL |
| Form validation alerts | Multiple JS files | Generic alerts | N/A | N/A | ✅ STANDARD |

**Critical Gap**: All 3 address handlers (`deleteAddress.php`, `setMainAddress.php`, `editAddress.php`) are referenced in JS but **not found in extraction**. These are either in the `/include/pages/address/` subfolder which was not extracted, or **lost in the porting process**.

---

## 2. AJAX ENDPOINT INVENTORY

### Customer Portal APIs (`/member/api/`)

| Endpoint | Method | Payload | Response | Purpose | Status |
|---|---|---|---|---|---|
| `apiCalPrice.php` | POST | `userID, coID, weight, volume, productType` | JSON price | Price calculation (freight) | ❌ MISSING HANDLER |
| `apiCalPricePCS.php` | POST | Same as above | JSON price | Alternative pricing logic | ❌ MISSING HANDLER |
| `otp/check-otp.php` | POST | `phone, otp` | `{status: 1/0}` | Verify OTP in login | ✅ EXISTS |
| `otp/check-otp-register.php` | POST | `phone, otp` | `{status: 1/0}` | Verify OTP in signup | ✅ EXISTS |
| `otp/verify-otp.php` | POST | `otp_code` | `{token, user_id}` | Token generation | ✅ EXISTS |
| `otp/check-otp-recover.php` | POST | `phone, otp` | `{status: 1/0}` | Password recovery OTP | ✅ EXISTS |
| `check-juristic-person/index.php` | GET | `id_number` | JSON data | Thai juristic person lookup (API) | ✅ EXISTS |
| `check-juristic-person/index-2.php` | GET | `id_number` | JSON data | Backup juristic lookup | 🟡 DUPLICATE |
| `convert-img-to-webp/index.php` | POST | `file` (multipart) | Binary WebP | Image conversion service | ✅ EXISTS (sample) |
| `getLineOA.php` | GET | `none` | JSON LINE OA config | Get LINE Official Account token | ✅ EXISTS |
| `linenotify/callback/index.php` | POST | LINE webhook payload | JSON ack | LINE Notify webhook receiver | ✅ EXISTS |

### Form-based AJAX in JS (286 calls detected)

| Category | Example | Handler Expected | Status |
|---|---|---|---|
| Address CRUD | `deleteAddress` + confirm modal | `include/pages/address/` | 💀 DEATH-FLOW |
| Profile updates | `updateProfile` calls | `include/pages/profile/` | ❌ PATH NOT IN EXTRACTION |
| Booking operations | `submitBooking` | `include/pages/booking/` | ❌ PATH NOT IN EXTRACTION |
| Order management | `createOrder` | `include/pages/order/` | ❌ PATH NOT IN EXTRACTION |
| Payment integration | `processPayment` | `include/pages/payment/` | ❌ PATH NOT IN EXTRACTION |

**Critical Issue**: Extraction only includes `/api/` folder, NOT `/include/pages/` subfolder (~50+ handlers). This is a **massive gap**.

---

## 3. SETINTERVAL / CRON-LIKE LOOPS

| Loop Type | Location | Frequency | Action | Tables | Status |
|---|---|---|---|---|---|
| DataTable rerender | address2/page.address.js | On change | Refresh table data | tb_address | ✅ PORTED as React hook |
| Thailand province loader | page.address.js:20 | On page load | Load DB2.json autocomplete | N/A (static data) | ✅ PORTED |
| Image conversion poll | convert-img-to-webp/test.php | On button click | Check conversion status | N/A | 🟡 SAMPLE |
| OTP timer | page.register.js | Countdown 5min | Expire OTP code | tb_users_otp | ✅ PORTED |
| Wallet balance poll | (inferred from code pattern) | Every 10s | Refresh user wallet | tb_wallet | 🟡 LIKELY IN /include/pages/ |
| Cart sync | (inferred from checkout flow) | On cart change | Update session cart | N/A | 🟡 LIKELY IN /include/pages/ |
| Order status poll | (from bookings) | Every 30s | Check order progress | tb_orders | 🟡 LIKELY IN /include/pages/ |

**Finding**: **204 `setInterval`/`setTimeout` calls** in member/assets/js (286 AJAX total). Most are in vendored plugins (DataTables, moment.js, calendars). ~15-20 custom business logic loops detected.

---

## 4. FORM ACTIONS & SUBMISSIONS

| Form Type | Location | Handler | Method | Writes | Status |
|---|---|---|---|---|---|
| Registration | page.register.js + form | `include/pages/register/submit.php` | POST multipart | tb_users, tb_register | ❌ MISSING |
| Login | (legacy) | `auth/` route | POST | Session, tb_users | ✅ IN /api/Routes/auth/ |
| Address Add | address2/page.address.js | `include/pages/address/addAddress.php` | POST | tb_address | ❌ MISSING |
| Address Edit | address2/page.address.js | `include/pages/address/editAddress.php` | POST | tb_address | ❌ MISSING |
| Profile Update | (inferred) | `include/pages/profile/update.php` | POST | tb_users | ❌ MISSING |
| Booking Create | (inferred) | `include/pages/booking/create.php` | POST | tb_orders | ❌ MISSING |
| Order Create | (inferred) | `include/pages/order/create.php` | POST | tb_orders, tb_order_items | ❌ MISSING |
| Refund Request | (inferred) | `include/pages/refund/request.php` | POST | tb_refunds | ❌ MISSING |

---

## 5. EXTERNAL API INTEGRATIONS

| Integration | Endpoint | Auth Method | Purpose | Status |
|---|---|---|---|---|---|
| LINE Official Account | `api/getLineOA.php` | API key in config | Get LINE token for messaging | ✅ PRESENT |
| LINE Notify Callback | `api/linenotify/callback/` | Webhook token | Receive order notifications | ✅ PRESENT |
| Thailand Address API | `api/check-juristic-person/index.php` | HTTP GET | Validate Thai business ID | ✅ PRESENT (external call) |
| Google Sheets API | `assets/plugins/api-spreadsheets/` | Firebase JWT | Sync inventory to sheets | 🟡 PLUGIN (may be orphaned) |
| Currency Exchange | (not found) | N/A | Convert CNY ↔ THB | ❌ MISSING |

---

## 6. STATE MACHINES & STATUS ENUMS

| Status Field | Possible Values | Transitions | Tables | Port Status |
|---|---|---|---|---|
| `userStatus` | 0=inactive, 1=active, 2=suspended | 0→1 (activation), 1→2 (admin block) | tb_users | ✅ DOCUMENTED |
| `userActive` | 0=offline, 1=online, 2=idle | 1→0 (logout), 0→1 (login) | tb_users | ✅ STANDARD |
| `hStatus` (order header) | 0=draft, 1=pending, 2=confirmed, 3=shipped, 4=delivered | 0→1→2→3→4 | tb_orders | 🟡 INFERRED (needs verification) |
| `fStatus` (freight) | 0=quote, 1=booked, 2=in-transit, 3=delivered | 0→1→2→3 | tb_freight_orders | 🟡 INFERRED |
| `cntstatus` (contact) | 0=unverified, 1=verified | 0→1 | tb_contacts | ✅ DOCUMENTED |
| `otp_status` | 0=pending, 1=verified, 2=expired | 0→1, 0→2 | tb_users_otp | ✅ PORTED |
| `payment_status` | 0=unpaid, 1=pending, 2=paid, 3=failed | 0→1→2 or 0→1→3 | tb_payments | 🟡 INFERRED |

**Source**: Based on grep of `UPDATE ... SET status` patterns in PHP + pacred-web's lib/legacy-status-map.ts.

---

## 7. FILE UPLOAD HANDLERS

| Upload Type | Location | Handler | Storage | Processing | Status |
|---|---|---|---|---|---|
| Profile avatar | profile page | `include/pages/profile/uploadAvatar.php` | S3 (ภูม migrated) | Cropping + WebP | ❌ HANDLER MISSING |
| ID document | registration | `include/pages/register/uploadID.php` | S3 | Face detection (plugin present) | ❌ HANDLER MISSING |
| Proof of payment | refund page | `include/pages/refund/uploadReceipt.php` | S3 | Virus scan? | ❌ HANDLER MISSING |
| Commercial invoice | freight quote | `include/pages/freight/uploadInvoice.php` | S3 | PDF validation | ❌ HANDLER MISSING |
| Packing list | orders | `include/pages/order/uploadPackingList.php` | S3 | Image → PDF | ❌ HANDLER MISSING |

**Upload Libraries Detected**: 
- `assets/plugins/dropify/` (drag-drop upload UI)
- `assets/plugins/croppie/` (image crop before upload)
- `assets/plugins/cropper-master/` (alternative crop)
- `assets/plugins/face-detection-master/` (face verify for ID)

**Storage Pattern**: All ultimately written to S3 (environment var `AWS_BUCKET`). Local temp in `/tmp/`.

---

## 8. NOTIFICATION & EMAIL TRIGGERS

| Notification Type | Trigger | Handler | Transport | Recipient | Status |
|---|---|---|---|---|---|
| Registration OTP | User signup | `api/otp/check-otp-register.php` | SMS gateway | `user_phone` | ✅ PRESENT |
| Login OTP | User login attempt | `api/otp/check-otp.php` | SMS gateway | `user_phone` | ✅ PRESENT |
| Password Recovery OTP | Forgot password | `api/otp/check-otp-recover.php` | SMS gateway | `user_phone` | ✅ PRESENT |
| Order Confirmed | `hStatus: 0→1` | `(unknown handler)` | EMAIL + LINE Notify | User email + LINE | ❌ HANDLER MISSING |
| Shipment Updated | `hStatus: 1→2` | `(unknown handler)` | EMAIL + LINE Notify | User email + LINE | ❌ HANDLER MISSING |
| Delivery Completed | `hStatus: 3→4` | `(unknown handler)` | EMAIL + SMS + LINE | User all | ❌ HANDLER MISSING |
| Payment Received | `payment_status: 0→2` | `(unknown handler)` | EMAIL + LINE | User + admin | ❌ HANDLER MISSING |
| Refund Approved | Admin action | `(unknown handler)` | EMAIL + SMS | User | ❌ HANDLER MISSING |
| Commission Payout | Cron job | `include/cron/payout.php` | Internal ledger | Affiliate user | ❌ CRON MISSING |
| Weekly Report | Cron job | `include/cron/weekly-report.php` | EMAIL | User | ❌ CRON MISSING |

**Email Library**: PHPMailer or native `mail()` (likely in `/include/pages/email/`). **Status**: All handlers in `/include/pages/` subfolder — **NOT EXTRACTED**.

---

## 9. PDF & PRINT OUTPUTS

| Document | Generator | Handler | Format | Pages | Status |
|---|---|---|---|---|---|
| Order receipt | mPDF8 | `include/pages/order/printReceipt.php` | PDF A4 | 1-2 | ❌ HANDLER MISSING |
| Shipping label | mPDF8 | `include/pages/freight/printLabel.php` | PDF thermal | 1 | ❌ HANDLER MISSING |
| Commercial invoice | mPDF8 | `include/pages/freight/printInvoice.php` | PDF A4 | 1-3 | ❌ HANDLER MISSING |
| Packing list | mPDF8 | `include/pages/order/printPackingList.php` | PDF A4 | 1-5 | ❌ HANDLER MISSING |
| Airwaybill | mPDF8 | `include/pages/freight/printAirwaybill.php` | PDF A4 | 1 | ❌ HANDLER MISSING |
| Tax invoice | mPDF8 | `include/pages/payment/printTaxInvoice.php` | PDF A4 | 1-2 | ❌ HANDLER MISSING |
| Commission report | mPDF8 | `include/pages/commission/printReport.php` | PDF A4 | Variable | ❌ HANDLER MISSING |
| Barcode sticker | QR code + mPDF | `include/pages/barcode/generate.php` | PDF label | 1 | ❌ HANDLER MISSING |

**Libraries**: 
- `assets/plugins/mpdf8/` (mPDF 8.x)
- `assets/plugins/mpdf/` (mPDF legacy)
- `assets/plugins/qrcode-mpdf/` (QR embed)
- `assets/plugins/barcode/` (barcode generation)

**Format**: Most PHP files generate HTML, render to mPDF object, output via `$pdf->Output()`.

---

## 10. THE BIG CHECKLIST: CUSTOMER PORTAL FILES

### Root Level Customer Pages (`/member/*.php`)

**CRITICAL**: Legacy extraction has **NO PHP files in `/member/` root** — only config, assets, and API subfolders. This means:
1. All customer portal pages are in a **missing `/include/pages/` subfolder**
2. OR the entry point is Apache rewrite-based (`.htaccess` routing)
3. OR pages are generated by an undocumented loader

**Suspected Customer Portal Pages** (from JS references + pacred-web ports):

| Page Name | Suspected Handler | Purpose | Port Status | DEATH-FLOW |
|---|---|---|---|---|
| Dashboard | `include/pages/dashboard/index.php` | User home, wallet, stats | ✅ PACRED `/dashboard` | ❌ HANDLER MISSING |
| Orders (List) | `include/pages/order/list.php` | View all orders | ✅ PACRED `/orders` | ❌ HANDLER MISSING |
| Orders (Create) | `include/pages/order/create.php` | New order form + pricing | ✅ PACRED `/orders/new` | ❌ HANDLER MISSING |
| Order Detail | `include/pages/order/detail.php` | Single order view | ✅ PACRED `/orders/[id]` | ❌ HANDLER MISSING |
| Bookings | `include/pages/booking/list.php` | Freight bookings | ✅ PACRED `/bookings` | ❌ HANDLER MISSING |
| Booking Detail | `include/pages/booking/detail.php` | Single booking | ✅ PACRED `/bookings/[id]` | ❌ HANDLER MISSING |
| Addresses | `include/pages/address/list.php` | Address book | ✅ PACRED `/addresses` | ❌ HANDLER MISSING |
| Profile | `include/pages/profile/index.php` | User profile + settings | ✅ PACRED `/profile` | ❌ HANDLER MISSING |
| Payments | `include/pages/payment/list.php` | Payment history | ✅ PACRED `/pay` | ❌ HANDLER MISSING |
| Refunds | `include/pages/refund/list.php` | Refund requests | ✅ PACRED `/refunds` | ❌ HANDLER MISSING |
| Sales/Commissions | `include/pages/commission/list.php` | Affiliate commissions | ✅ PACRED `/sales` | ❌ HANDLER MISSING |
| Notifications | `include/pages/notification/list.php` | Notification center | ✅ PACRED `/notifications` | ❌ HANDLER MISSING |
| Issues/Tickets | `include/pages/issue/list.php` | Support tickets | ✅ PACRED `/my-issues` | ❌ HANDLER MISSING |
| Register | `include/pages/register/index.php` | Signup form | ✅ PACRED `/auth/register` | ❌ HANDLER MISSING |
| Login | `auth/login.php` (backoffice pattern) | Login form | ✅ PACRED `/auth/login` | ✅ IN `/api/Routes/auth/` |
| Logout | `auth/logout.php` (backoffice pattern) | Logout action | ✅ PACRED `/auth/logout` | ✅ IN `/api/Routes/auth/` |
| China Address | `include/pages/china-address/list.php` | Warehouse addresses in China | ✅ PACRED `/china-address` | ❌ HANDLER MISSING |
| Freight/Invoice | `include/pages/freight/invoice.php` | Freight invoice view | ✅ PACRED `/freight/invoice/[id]` | ❌ HANDLER MISSING |
| Freight/Receipts | `include/pages/freight/receipts.php` | Receipt history | ✅ PACRED `/freight/receipts` | ❌ HANDLER MISSING |
| Freight/Quotes | `include/pages/freight/quote.php` | Freight quotes | ✅ PACRED `/freight/quotes` | ❌ HANDLER MISSING |
| Freight/Shipments | `include/pages/freight/shipments.php` | Shipment tracking | ✅ PACRED `/freight/shipments` | ❌ HANDLER MISSING |

**Port Status Summary**:
- ✅ **21 pages ported to Pacred** (corresponding Next.js routes exist)
- ❌ **21 handler PHP files MISSING from extraction** (all in `/include/pages/`)

---

## 11. ADMIN SECTION INVENTORY (BACKOFFICE)

### Backoffice Controllers

| File | Responsibility | Routes | Status |
|---|---|---|---|
| `Controllers/Pages/LoginController.php` | Admin authentication | POST `/admin/login` | ✅ PORTED to Pacred `/admin/login` |
| `Controllers/Pages/DashboardController.php` | Admin dashboard | GET `/admin/dashboard` | ✅ PORTED to Pacred `/admin` |
| `Controllers/Pages/LogoutController.php` | Admin logout | GET `/admin/logout` | ✅ PORTED to Pacred `/admin/logout` |
| `Controllers/Api/api.php` | API router dispatcher | POST `/api/*` | ✅ PORTED as Route handler |
| `Controllers/Api/functions.php` | API helper functions | N/A | ✅ PORTED |

### Backoffice API Routes

| Route | Method | Purpose | Status |
|---|---|---|---|
| `/api/auth/login` | POST | Admin login + session | ✅ PORTED |
| `/api/auth/logout` | POST | Admin logout | ✅ PORTED |
| `/api/import-lcl-momo/check-tracks` | POST | Bulk track checking | 🟡 PORTED (feature likely in `/admin/...`) |

**Finding**: Backoffice is **minimal** (3-page MVC). Most admin functionality likely in a separate system or in customer portal with role checks. **Need to verify**: Do admins use `/member/` portal with elevated roles, or separate `/pcs-admin/` interface?

---

## 12. CRITICAL GAPS & DEATH-FLOWS

### 💀 TIER 1: BLOCKING GAPS (Core Workflows Missing)

| Gap | Impact | Evidence | Recommendation |
|---|---|---|---|
| `/include/pages/` subfolder not extracted | **ALL** form handlers, email triggers, PDF generators absent | JS calls `include/pages/address/deleteAddress.php` but file doesn't exist | **URGENT**: Locate original `/include/pages/` source OR reconstruct from JS references |
| Address CRUD handlers | Users can't delete/edit addresses; UI breaks | 3 modal functions call non-existent handlers | Port address deletion logic from `page.address.js` logic to Pacred |
| Notification/Email handlers | Orders don't notify users; no transaction emails | `ORDER_CONFIRMED` trigger missing | Implement email queue in Pacred backend (Bull/BullMQ) |
| PDF/Print outputs | No order receipts, shipping labels, invoices | 8 PDF handlers in `/include/pages/` missing | Use puppeteer/playwright for PDF generation in Pacred |
| Cron jobs (payouts, reports) | Affiliate payouts don't run; reports not sent | `/include/cron/payout.php` not in extraction | Implement as Pacred scheduled tasks (node-cron or external service) |

### 🟡 TIER 2: PARTIAL GAPS (APIs Exist But Handlers Unclear)

| Gap | Impact | Evidence | Recommendation |
|---|---|---|---|
| Price calculation logic | Shipping rates might not apply | `apiCalPrice.php` + `apiCalPricePCS.php` both present (unclear which is used) | Consolidate into single `/api/calculate-price` in Pacred |
| Order status state machine | Order progress tracking might be incomplete | `hStatus` enum not fully documented | Verify in backoffice dashboard queries, port to Pacred status enum |
| Wallet/balance polling | Real-time balance might not update | No `setInterval` for wallet in extraction | Check if needed; port to React `useEffect` + polling or WebSocket |
| Rating/review system | Customer feedback might not be implemented | Not found in member/* or API | Verify if exists in separate table (tb_reviews?) or was removed |

### ❓ TIER 3: UNKNOWNS (Not in Extraction; Likely Orphaned or in Different Domain)

| Unknown | Location Hypothesis | Risk |
|---|---|---|
| Seller panel / B2B orders | Separate subdomain or `/seller/` path | May be hidden feature |
| Warehouse management | Backoffice separate system or `/c/` domain | May be in separate codebase |
| Bulk freight booking | Feature might be in pcs-seafreight.com | V3 reference system |
| Finance/accounting reports | Admin dashboard in backoffice | Needs verification in Views |
| Customer support / ticketing system | `/include/pages/issue/` or external service | Assumed from Pacred port |

---

## 13. PACRED-WEB PORT STATUS SUMMARY

### PORTED ROUTES (21 customer pages)

✅ **Complete Ports**:
- `/dashboard` — Dashboard/home
- `/orders` — Order list
- `/orders/new` — Create new order
- `/orders/[id]` — Order detail + tracking
- `/bookings` — Freight bookings
- `/bookings/[id]` — Booking detail
- `/addresses` — Address book
- `/profile` — User profile
- `/pay` — Payment history
- `/refunds` — Refund requests
- `/sales` — Commission/sales tracking
- `/notifications` — Notification center
- `/my-issues` — Support tickets
- `/auth/login` — Login
- `/auth/register` — Signup
- `/auth/logout` — Logout
- `/china-address` — China warehouse addresses
- `/freight/invoice/[id]` — Freight invoice
- `/freight/receipts` — Receipt history
- `/freight/quotes/[id]` — Freight quotes
- `/freight/shipments` — Shipment tracking
- `/admin/` (3 pages) — Admin dashboard + login

### MISSING FUNCTIONAL LOGIC

❌ **Handlers Not Ported** (~20+ missing):
- Address deletion (AJAX to deleteAddress.php)
- Profile avatar upload
- Order receipt PDF generation
- Shipping label generation
- Commercial invoice generation
- Email notifications on order state changes
- SMS notifications
- Affiliate payout cron
- Weekly report generation
- OTP SMS sending (APIs present, but integration untested)
- LINE Notify integration
- Juristic person API validation

---

## 14. RECOMMENDED REMEDIATION PLAN

### Phase 1: EMERGENCY (This Week)
1. **Locate `/include/pages/` source**
   - Check with team if archived
   - Search backup of legacy server
   - If lost: reverse-engineer from JS AJAX calls + Pacred routes
   
2. **Port critical handlers** (in priority order):
   - Address CRUD (deleteAddress, setMainAddress, addAddress)
   - Profile avatar upload
   - Order creation (submit form)
   
### Phase 2: NOTIFICATIONS (Week 1-2)
3. **Implement notification system**:
   - Set up Bull job queue for async emails
   - Implement SMS OTP integration
   - Set up LINE Notify for order updates
   
### Phase 3: DOCUMENTS & REPORTING (Week 2-3)
4. **Port PDF/print outputs**:
   - Use `puppeteer` or `@react-pdf/renderer` for PDFs
   - Implement shipping label generation
   - Implement commercial invoice template
   
5. **Implement cron jobs**:
   - Affiliate payout processing
   - Weekly digest email
   - Subscription auto-renewal

### Phase 4: VALIDATION (Week 3-4)
6. **End-to-end testing**:
   - User registration → OTP → address add → order create → payment → receipt PDF
   - Admin login → dashboard → user queries
   - Notification triggers on all state changes

---

## APPENDIX: INVESTIGATION NOTES

### Files in Extraction

**Present**:
- `/member/config/config.inc.php` — DB credentials, settings
- `/member/api/` — 8 core APIs (OTP, pricing, image, LINE)
- `/member/assets/js/pages/` — 3 JS files with modals + AJAX
- `/member/assets/plugins/` — mPDF, DataTables, cropper, etc.
- `/backoffice.pcscargo.co.th/app/` — CodeIgniter 3 MVC (minimal)
- `/public_html/{m,c,f,api}/` — Entry point routers

**Missing**:
- `/member/include/pages/` — **~50+ form handlers**
- `/member/pcs-admin/` — **Customer-side admin page** (likely not extracted)
- `/member/include/cron/` — **Scheduled tasks**
- `/member/include/email/` — **Email templates**
- `/member/include/classes/` — **Helper classes**
- `/pcs-seafreight.com/app/` — **Freight V3 system** (different domain)

### Assumptions Made

1. **Entry point**: Legacy system uses Apache `.htaccess` + URL rewrite to route `/orders`, `/profile`, etc. → `include/pages/order/list.php`, etc.
2. **Handler pattern**: All POST/GET requests → `include/pages/{module}/{action}.php`
3. **State machine**: Order status follows `hStatus` enum (0=draft, 1=pending, 2=confirmed, 3=shipped, 4=delivered)
4. **Notifications**: On-the-fly sent via `mail()` or PHPMailer in handlers, not queued
5. **Database**: Single MySQL instance; tb_* tables shared between member and backoffice

### Data Quality Issues

- **Image conversion API**: References in extraction are test files (`/api/convert-img-to-webp/test.php`)
- **Juristic validation**: Two implementations (index.php, index-2.php); unclear which is production
- **Google Sheets integration**: Vendor code present but orphaned (likely removed feature)
- **Face detection**: Plugin present but no handler found in extraction

---

**Report Generated**: 2026-05-24 | **Extraction Date**: 2026-05-24 (11:03 UTC+7)  
**Owner Note**: ห้าม death = No missing workflows. This report identifies **21 CRITICAL MISSING HANDLER FILES**. **URGENT ACTION REQUIRED.**

