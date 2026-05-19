# Audit D — Admin workspace inventory (every existing page.tsx)

> Companion to Audits A (`01-broken-links.md` — broken sidebar hrefs),
> B (`02-wallet-withdrawal-pattern.md` — wallet pattern), C
> (`03-mislinks.md`), and the D1 Phase-B sidebar fidelity workstream.
> Read-only.
>
> Source: `app/[locale]/(admin)/admin/**/page.tsx` globbed from
> commit `d0319f5` on branch `claude/adoring-chandrasekhar-0f8ad7`.

## 1. Counts

- **Total `page.tsx` files: 129**
  - **LIST: 67** — table/feed of rows with filters
  - **DETAIL: 19** — single-record view at a `[param]` segment
  - **FORM: 17** — create/edit standalone form (or hub with primary form)
  - **REDIRECT: 16** — 1-line `redirect(…)` stub (no UI)
  - **HUB: 6** — multi-card landing / dashboard with stats + cross-links
  - **OTHER: 4** — special (conditional redirect, dual-mode, breadcrumb-only chrome)

> Methodology: a page that has a primary `<table>` for browsing rows = LIST.
> A page where the page body IS the form = FORM. A redirect-only page (entire
> default export = `redirect(…)`) = REDIRECT. A multi-card landing with stat
> tiles + links to sub-routes = HUB.

## 2. Inventory — sorted by route

> Notes:
> - **Role gate** column lists the `requireAdmin([…])` argument. `any-admin`
>   means a bare `requireAdmin()` (or no page-level call — falls through
>   to the layout-level `requireAdmin()` at `app/[locale]/(admin)/layout.tsx`
>   which gates "any admin").
> - **Dyn?** column shows the dynamic segment(s) in the route.

| Route | H1 heading | Purpose | Type | Role gate | Dyn? |
|---|---|---|---|---|---|
| `/admin` | (no h1 — stat cards header) | Per-role office dashboard — revenue stats (month + today) + tabbed pending queues (top-up / withdraw / shop / forwarder / yuan / inactive) | HUB | `ops, accounting, sales_admin` | — |
| `/admin/accounting` | "ระบบบัญชี" | Accounting hub — KPI roll-up of wallet deposits/withdraws/refunds + revenue snapshots | HUB | `accounting` | — |
| `/admin/accounting/closing` | "ปิดงบฝากนำเข้ารายเดือน" | Month-end closing report for delivered forwarders sliced by customer type (all/juristic/personal) | LIST | `accounting` | — |
| `/admin/accounting/container-costs` | "Carrier rate cards (container_costs)" | Carrier rate-card editor (container_costs CRUD list + inline add/edit/archive) | LIST | `super, accounting` | — |
| `/admin/accounting/container-payments` | "ตารางจ่ายเงินค่าตู้ (ค่าตู้สินค้า)" *(i18n `pcsContainer.pageTitle`)* | Legacy PCS `tb_cnt` ledger — China-side container payment list (เลขตู้ / ยอด / สถานะรอจ่าย·จ่ายแล้ว / สลิป) | LIST | `super, accounting` | — |
| `/admin/accounting/container-payments/[id]` | "{cntname}" or "#{id}" | Container payment detail — view + edit a single tb_cnt row | DETAIL | `super, accounting` | `[id]` |
| `/admin/accounting/disbursements` | "AP Ledger / สมุดจ่าย (Container disbursements)" / "AP Ledger / สมุดจ่าย" | AP ledger list — container_disbursements with filters (kind, carrier, date) + inline add/edit | LIST | `super, accounting` | — |
| `/admin/accounting/periods` | "📅 ปิดงวดบัญชีรายเดือน" | Accounting periods list — last 24 months × status + "เปิดงวด" button per row | LIST | `super, accounting, ops` | — |
| `/admin/accounting/periods/[period_yyyymm]` | "งวด {formatted}" | Accounting period detail — close + snapshot revenue for one yyyymm | DETAIL | `super, accounting, ops` | `[period_yyyymm]` |
| `/admin/accounting/reconcile` | "Payment ↔ Order Reconciliation" | Reconcile pending_payment vs wallet_tx (3 mismatch buckets — auto-clear / leak signal / orphan) | LIST | `accounting` | — |
| `/admin/admins` | "จัดการ admin (super only)" | Staff RBAC console — admins table + role grants + active toggle + display-contact edit | LIST | `super` | — |
| `/admin/audit` | "บันทึกการกระทำของแอดมิน" | Admin audit log viewer — admin_audit_log filterable by member_code/action/target/date | LIST | `super` | — |
| `/admin/barcode` | "สแกนรับเข้าโกดัง" | Warehouse barcode scan — receive forwarder packages into warehouse + today stats | FORM | `any-admin` (layout) | — |
| `/admin/barcode/driver` | "สแกนปล่อยคนขับ" | Driver barcode scan — mark out_for_delivery + delivered + today stats | FORM | `any-admin` (layout) | — |
| `/admin/board` | "กระดานงานข้ามแผนก (Work Board)" | Cross-department work-board — every live work_item across roles + status filters | LIST | `any-admin` (explicit) | — |
| `/admin/board/inbox` | "กล่องงานของฉัน (My Inbox)" | Per-admin work inbox with 3 tabs (mine / waiting-on-me / @mentions) | LIST | `any-admin` | — |
| `/admin/bookings` | "การจองทั้งหมด (BK-1)" *(i18n `booking.admin.listTitle`)* | Bookings list (BK-1) — submitted/contacted/quoted/won/lost queue, filter chips | LIST | `super, ops, sales_admin, accounting` | — |
| `/admin/bookings/[bookingNo]` | "{detailTitle} {booking_no}" *(i18n)* | Single booking detail — service · contact · estimate · options · pin · lead notes | DETAIL | `super, ops, sales_admin, accounting` | `[bookingNo]` |
| `/admin/broadcasts` | "📢 Broadcasts" | LINE broadcast list — drafts/scheduled/sending/sent with sent+failed counts | LIST | `super, sales_admin` | — |
| `/admin/broadcasts/[id]` | "{bc.title}" | Broadcast detail — body + audience + sent stats | DETAIL | `super, sales_admin` | `[id]` |
| `/admin/broadcasts/new` | "สร้าง Broadcast ใหม่" | New broadcast form — title + body + audience picker → draft | FORM | `super, sales_admin` | — |
| `/admin/carriers` | "จัดการขนส่ง (Carriers)" | Carriers CRUD — SPX/J&T/Flash/EMS/Lalamove etc. + tracking URL templates | LIST | `any-admin` (layout) | — |
| `/admin/commissions` | "ค่าคอม + Payouts (V-E8)" | Commissions list — pending accruals + withdrawal queue + history | LIST | `super, accounting` | — |
| `/admin/commissions/[id]` | "คำขอเบิก {withdrawal_no}" | Single commission withdrawal request detail (approve/reject/paid) | DETAIL | `super, accounting` | `[id]` |
| `/admin/contact-messages` | "ข้อความติดต่อจากเว็บไซต์" | Inbound `/contact` form messages — new/read/replied/closed queue | LIST | `any-admin` (layout) | — |
| `/admin/containers` | (no h1 — redirect) | REDIRECT → `/admin/warehouse/containers` (legacy 0016 path) | REDIRECT | `super, ops, warehouse` | — |
| `/admin/containers/[id]` | (no h1 — redirect) | REDIRECT → `/admin/warehouse/containers/{spine_code}` resolved from `legacy_container_id` join | REDIRECT | `super, ops, warehouse` | `[id]` |
| `/admin/containers/[id]/hs` | "HS code lines · {container_no}" | HS code line editor for one legacy container (still functional during cutover) | FORM | `any-admin` (layout) | `[id]` |
| `/admin/csv-imports` | "นำเข้าข้อมูล CSV" | CSV import history list — uploaded/previewed/imported/failed + row actions | LIST | `any-admin` (layout) | — |
| `/admin/csv-imports/[id]` | "{row.filename}" | Single CSV import detail (preview rows + import status + errors) | DETAIL | `any-admin` (layout) | `[id]` |
| `/admin/csv-imports/upload` | "อัปโหลด CSV ใหม่" | Upload CSV file → preview → confirm import | FORM | `any-admin` (layout) | — |
| `/admin/customers` | "ลูกค้า{group label}" | All-customers list with `?group=` filter (general/vip/svip/corporate/credit/comparison) + search | LIST | `ops, sales_admin, accounting` | — |
| `/admin/customers/[id]` | "{displayName}" | Customer profile detail — bio + wallet + orders + forwarders | DETAIL | `ops, sales_admin, accounting` | `[id]` |
| `/admin/customers/[id]/convert-to-juristic` | "เปลี่ยนเป็นบัญชีนิติบุคคล" | Form — upgrade a personal account to juristic (tax_id + company_name + address) | OTHER | `any-admin` (layout) | `[id]` |
| `/admin/customers/[id]/transfer-rep` | "โอนเซลล์ที่ดูแลลูกค้า" | Per-customer rep transfer form (combobox + current-rep + sales stats) | FORM | `any-admin` (layout) | `[id]` |
| `/admin/customers/pending` | "รอ Approve" | Customers with status='incomplete' — approve/open queue | LIST | `ops, sales_admin, accounting` | — |
| `/admin/customers/recently-active` | "รายงานลูกค้าที่ใช้งานล่าสุด{sla}" | Per-customer activity ranking (header_order/forwarder/payment) + segmentation + `?sla=no-contact-2d` chip | LIST | `ops, sales_admin, accounting` | — |
| `/admin/customers/transfer-rep` | "ย้ายเซลล์ผู้ดูแลลูกค้า" | Bulk rep-transfer — filter customers `?from=<rep>` then re-assign | FORM | `ops, sales_admin` | — |
| `/admin/dashboard` | (no h1 — redirect) | REDIRECT → `/admin` (legacy stub) | REDIRECT | `any-admin` (layout) | — |
| `/admin/driver-runs` | "งานขนส่งที่ได้รับมอบหมาย" | Driver "งานของฉัน" — own forwarder_driver assignments + accept/complete buttons | LIST | `any-admin` (driver-only by design) | — |
| `/admin/drivers` | "รายการมอบหมายคนขับ" | Driver assignments list — forwarder_driver rows by status (1/2/3/4) | LIST | `ops` | — |
| `/admin/drivers/[id]` | "มอบหมาย {f_no}" | Assign driver to one forwarder (forwarder_driver row create/edit) | FORM | `ops` | `[id]` |
| `/admin/forwarder` | (no h1 — redirect) | REDIRECT → `/admin/forwarders` | REDIRECT | `any-admin` (layout) | — |
| `/admin/forwarder/pending` | (no h1 — redirect) | REDIRECT → `/admin/forwarders?status=pending_payment` | REDIRECT | `any-admin` (layout) | — |
| `/admin/forwarder-sales` | "รายงานค่าคอมมิชชันฝากนำเข้า" | Sales commission dashboard with leader picker + status filter (port of forwarder-sale.php) | LIST | `accounting, sales_admin` | — |
| `/admin/forwarders` | "ฝากนำเข้า — Ops" | Forwarders ops list — status filter + search + table | LIST | `ops, accounting` | — |
| `/admin/forwarders/[fNo]` | "{f.f_no}" *(font-mono)* | Single forwarder detail — status timeline + customer + payment + tracking | DETAIL | `ops, accounting` | `[fNo]` |
| `/admin/forwarders/bulk-search` | "ค้นหา tracking หลายเลข (Bulk Search)" | Bulk tracking lookup form — paste many tracking numbers, get forwarder hits | FORM | `ops, accounting` | — |
| `/admin/forwarders/container-cost-check` | "เช็คต้นทุนตู้ Sheet" | STUB — placeholder for Google Sheets cost-audit integration (Phase C eligible) | OTHER | `super, ops, accounting` | — |
| `/admin/freight/declarations` | "ใบขนสินค้า (V-E11)" | Freight customs declarations list — status chips + search | LIST | `super, accounting` | — |
| `/admin/freight/declarations/[id]` | "ใบขนสินค้า {declaration_no}" | Single declaration detail (header + line items + status) | DETAIL | `super, accounting` | `[id]` |
| `/admin/freight/quotes` | "ใบเสนอราคา (Freight quotes)" | Freight quotes list — draft/pending/approved/sent/accepted etc + search | LIST | `super, ops, sales_admin, accounting` | — |
| `/admin/freight/quotes/[id]` | "ใบเสนอราคา {quote_no}" | Single quote detail — header + line items + send/approve/accept | DETAIL | `super, ops, sales_admin, accounting` | `[id]` |
| `/admin/freight/quotes/new` | "สร้างใบเสนอราคาใหม่ (ร่าง)" | Create freight quote header → redirect to detail for line items | FORM | `super, ops, sales_admin, accounting` | — |
| `/admin/freight/shipments` | "งานขนส่ง freight (shipments)" | Freight shipments list — V-E1 status chips + search | LIST | `super, ops, sales_admin, accounting` | — |
| `/admin/freight/shipments/[id]` | "งาน {job_no}" | Single freight shipment detail — parties + commercial value + lines + status | DETAIL | `super, ops, sales_admin, accounting` | `[id]` |
| `/admin/freight/shipments/new` | "สร้างงานขนส่ง freight ใหม่" | Create new freight shipment — customer + logistics → job_no → detail | FORM | `super, ops, sales_admin, accounting` | — |
| `/admin/hr` | "👥 ฝ่ายทรัพยากรบุคคล" | HR hub — admin roster by department + sub-module quick links | HUB | `any-admin` | — |
| `/admin/hr/attendance` | "บันทึกเวลาเข้างาน" | HR attendance — daily clock in/out + late tracking + monthly calendar | LIST | `any-admin` | — |
| `/admin/hr/attendance/leaves` | "คำขอลา" | HR leave requests — pending/approved/rejected/cancelled queue | LIST | `any-admin` | — |
| `/admin/hr/audit` | "ออดิทพนักงาน" | HR employee audit log — praise/note/warning/disciplinary/training/review entries | LIST | `any-admin` | — |
| `/admin/hr/employees` | "รายชื่อพนักงานทั้งหมดแบบตารางข้อมูล" | All-employees data table with department/section breadcrumbs + row actions | LIST | `any-admin` | — |
| `/admin/hr/employees/[id]` | "{fullName}" | Employee profile detail — bio + contact + assignments | DETAIL | `any-admin` | `[id]` |
| `/admin/hr/org-chart` | "Pacred — Organization Chart" | Visual org tree — branches → sections → positions with quotas | LIST | `any-admin` | — |
| `/admin/hr/org-table` | "Pacred — Org Chart (ตาราง)" | Tabular org chart view | LIST | `any-admin` | — |
| `/admin/hr/policies` | "Library นโยบาย" | Policy library — published/draft/requires-ack categories with sign tracking | LIST | `any-admin` | — |
| `/admin/hr/recruitment` | "สรรหา / รับสมัครงาน" | Recruitment postings list — draft/open/paused/closed + applicants buckets | LIST | `any-admin` | — |
| `/admin/hr/recruitment/[id]` | "{posting.title}" | Single recruitment posting detail — applicants pipeline + edit | DETAIL | `any-admin` | `[id]` |
| `/admin/hr/recruitment/new` | "ลงประกาศรับสมัครงานใหม่" | Create new recruitment posting (position picker + form) | FORM | `any-admin` | — |
| `/admin/hr/training` | "หลักสูตรอบรม" | Training courses + per-admin enrollments management | LIST | `any-admin` | — |
| `/admin/incidents` | "รายงานสถานะระบบ — Incident triage" | IO-1 platform incidents triage — filterable by source/kind/severity/status | LIST | `super, ops, accounting, sales_admin` (multi-role) | — |
| `/admin/inventory` | (no h1 — redirect) | REDIRECT → `/admin/barcode` | REDIRECT | `any-admin` (layout) | — |
| `/admin/juristic-check` | "🏢 เช็คข้อมูลลูกค้านิติบุคคล" | Juristic verification queue — pending/verified/rejected + document signed URLs | LIST | `any-admin` (layout) | — |
| `/admin/kpi` | "KPI ภาพรวมธุรกิจ" | Executive KPI dashboard — revenue + orders by status + containers + signups + wallet | HUB | `ops, accounting, sales_admin` | — |
| `/admin/learning` | "📚 เรียนรู้และข้อมูลภายใน" or "📚 {topic label}" | Learning hub — 4 section cards (rules/training/news/customer-terms) OR `?topic=` placeholder when sidebar arrives with a sub-topic | OTHER | `any-admin` (layout) | — |
| `/admin/migration/pcs-customers` | "PCS → Pacred customer migration" | One-shot launch-week migration — drain pcs_legacy_customers_staging into auth.users + profiles | FORM | `super` | — |
| `/admin/orders` | (no h1 — redirect) | REDIRECT → `/admin/service-orders` | REDIRECT | `any-admin` (layout) | — |
| `/admin/orders/import` | (no h1 — redirect) | REDIRECT → `/admin/forwarders` | REDIRECT | `any-admin` (layout) | — |
| `/admin/orders/import/pending` | (no h1 — redirect) | REDIRECT → `/admin/forwarders?status=pending_payment` | REDIRECT | `any-admin` (layout) | — |
| `/admin/orders/pending` | (no h1 — redirect) | REDIRECT → `/admin/service-orders?status=pending` | REDIRECT | `any-admin` (layout) | — |
| `/admin/orders/shop` | (no h1 — redirect) | REDIRECT → `/admin/service-orders` | REDIRECT | `any-admin` (layout) | — |
| `/admin/orders/shop/pending` | (no h1 — redirect) | REDIRECT → `/admin/service-orders?status=pending` | REDIRECT | `any-admin` (layout) | — |
| `/admin/orders/transfer` | (no h1 — redirect) | REDIRECT → `/admin/yuan-payments` | REDIRECT | `any-admin` (layout) | — |
| `/admin/payment` | (no h1 — redirect) | REDIRECT → `/admin/yuan-payments` | REDIRECT | `any-admin` (layout) | — |
| `/admin/rates` | "อัตราค่าบริการ" | Rates summary (read-only KPIs) — yuan rate + service fees + thresholds. Edit at `/admin/settings` | HUB | `any-admin` (layout) | — |
| `/admin/rates/custom-hs` | "ตารางเรท Custom-HS — แก้ไขได้" | Per-customer × HS-code rate override editor (highest priority in calc-price waterfall) | LIST | `super, accounting` | — |
| `/admin/rates/custom-user` | "ตารางเรท Custom (รายลูกค้า) — แก้ไขได้" | Flat per-customer rate override editor | LIST | `super, accounting` | — |
| `/admin/rates/general` | "ตารางเรท General — แก้ไขได้" | General tier-based rate table editor (group × warehouse × transport × product × basis) | LIST | `super, accounting` | — |
| `/admin/rates/vip` | "ตารางเรท VIP — แก้ไขได้" | VIP-group rate override editor | LIST | `super, accounting` | — |
| `/admin/refunds` | "คำขอคืนเงิน (Refunds — U1-6)" | Refunds list — pending-first default + status filter + free text | LIST | `super, accounting, ops, sales_admin` | — |
| `/admin/refunds/[id]` | "คำขอคืนเงิน {request_no}" | Single refund request detail — approve / reject / mark-paid | DETAIL | `super, accounting, ops, sales_admin` | `[id]` |
| `/admin/refunds/new` | "สร้างคำขอคืนเงิน (admin → ลูกค้า)" | Admin-initiated refund request form (manual / cancel-after-paid / over-collection) | FORM | `super, accounting` | — |
| `/admin/reports` | "รายงาน" | Reports hub — tabbed cross-source explorer + quick-cards to per-report drill-downs | HUB | `ops, accounting, sales_admin` | — |
| `/admin/reports/containers-awaiting-th` | "ตู้คอนเทนเนอร์รอเข้าโกดังไทย{sla}" | Containers in pipeline (packing/sealed/in_transit/arrived/unloading) sorted by ETA | LIST | `super, ops, warehouse, accounting` | — |
| `/admin/reports/containers-hs` | "รายงาน HS code — สะสมจากทุก container" | HS-code aggregate across all containers — qty/weight/value/duty per code | LIST | `any-admin` (layout) | — |
| `/admin/reports/credit-pending` | "เครดิตค้างนำเข้า{sla}" | Forwarders shipped/arrived but unpaid (credit COD customers) — `?sla=overdue` chip | LIST | `super, ops, accounting` | — |
| `/admin/reports/debtors` | "ลูกค้าติดหนี้" | Customers with negative wallet/credit/cashback balance — deepest debt first | LIST | `super, accounting` | — |
| `/admin/reports/forwarder-volume` | "ปริมาณฝากนำเข้า แยกตามต้นทาง × ขนส่ง" | Forwarder volume aggregated by (source_warehouse × transport_type) per period | LIST | `super, ops, accounting` | — |
| `/admin/reports/hs-code-revenue` | "รายได้ตาม HS code" | HS-code declared-value analysis + which containers carry top codes | LIST | `super, ops, accounting` | — |
| `/admin/reports/monthly-orders` | "ออเดอร์ในเดือน · {label}{sla}" | Monthly orders report | LIST | `super, ops, accounting` | — |
| `/admin/reports/pending-payments` | "ฝากนำเข้ารอชำระเงิน{sla}" | Forwarders in pending_payment — oldest first + `?sla=shop-1d / forwarder-2d` chip | LIST | `super, ops, accounting` | — |
| `/admin/reports/refunds` | "รายการคืนเงิน" | Refunds issued (wallet_tx kind='refund') — last 30 days default | LIST | `super, accounting` | — |
| `/admin/reports/sales-by-rep` | "ยอดขายแยกตาม Sales rep" | Sales revenue per sales rep (forwarder + shop + yuan-payment volumes) | LIST | `super, ops, accounting, sales_admin` | — |
| `/admin/reports/user-sales-history` | "ประวัติยอดขายต่อลูกค้า" | Top 50 customers by lifetime value + search-and-redirect to drill-down | LIST | `super, ops, accounting, sales_admin` | — |
| `/admin/reports/user-sales-history/[customer_id]` | "ประวัติยอดขาย — {customerName}" | Single-customer sales history drill-down | DETAIL | `super, ops, accounting, sales_admin` | `[customer_id]` |
| `/admin/sales-payouts` | "เบิกเงินค่าสินค้า" or "เบิกค่าคอม (sales payouts)" *(branches by ?kind)* | Sales payouts queue — pending/approved/paid/rejected. `?kind=shop-goods` toggle is sidebar-honoured but not yet column-filtered (Wave-B TODO) | LIST | `accounting, sales_admin` | — |
| `/admin/search` | "ค้นหาทุกที่" | U4-1 global search — across profiles/forwarders/service_orders/freight/tax_invoices/containers/refunds/quotes | LIST | `super, ops, accounting, sales_admin` | — |
| `/admin/service-orders` | "ฝากสั่ง — Ops" | Service orders ops list — status filter (pending/awaiting_payment/ordered/etc) | LIST | `any-admin` (layout) | — |
| `/admin/service-orders/[hNo]` | "{o.h_no}" *(font-mono)* | Single service order detail — items + customer + status timeline | DETAIL | `any-admin` (layout) | `[hNo]` |
| `/admin/settings` | "ตั้งค่าระบบ" | System settings — yuan rate + service fees + thresholds (editable form) | FORM | `any-admin` (layout) | — |
| `/admin/settings/business-config` | "Business Config (super)" | Super-only business_config CRUD (OTP TTL · top-up min · cashback % · bank acct · feature flags) | LIST | `super` | — |
| `/admin/settings/contacts` | "ข้อมูลติดต่อองค์กร" | V-G5 org_contacts CRUD with kind tabs (domain/email/line_oa/phone/wechat/social/address) | LIST | `super, accounting, sales_admin` | — |
| `/admin/settings/notifications` | "การแจ้งเตือนของฉัน" | Per-admin notification prefs — daily_digest opt-in + per-channel toggles | FORM | `any-admin` | — |
| `/admin/settings/tos-versions` | "จัดการเวอร์ชัน TOS (ข้อตกลงและเงื่อนไข)" | V-G4 super-only TOS versions CRUD (versions list + body_md + activation) | LIST | `super` | — |
| `/admin/system/crons` | "Cron health" | Cron health panel — per-cron card with schedule + last fire + 7-day success rate + manual trigger | LIST | `super, ops` | — |
| `/admin/system/notifications` | "Notification delivery log" | Notification delivery log — filter by category/severity/recipient/date/delivery_status | LIST | `super, ops` | — |
| `/admin/tax-invoices` | "ใบกำกับภาษี" | Tax invoices list — status chips (pending / issued / cancelled / all) | LIST | `accounting` | — |
| `/admin/tax-invoices/[id]` | "ใบกำกับภาษี — {serial_no}" or "(รออนุมัติ)" | Single tax invoice detail — approve / issue / cancel | DETAIL | `accounting` | `[id]` |
| `/admin/team-leaders` | "ทีมขาย — Team Leaders" | Team leaders CRUD + commission % + customer-group assignment | LIST | `accounting, sales_admin` | — |
| `/admin/wallet` | "กระเป๋าเงิน — รายการ" | Wallet transactions list (deposit/withdraw/refund/adjustment/etc) — `?kind=` + `?status=` filters | LIST | `accounting` | — |
| `/admin/wallet/deposit` | (no h1 — redirect) | REDIRECT → `/admin/wallet?kind=deposit&status=pending` (legacy deposit queue stub) | REDIRECT | `any-admin` (layout) | — |
| `/admin/warehouse/bulletin` | "บุลเลตินตู้คอนเทนเนอร์รายวัน" | Auto-generate daily LINE bulletin from cargo_containers state (copy + paste) | OTHER | `any-admin` (layout) | — |
| `/admin/warehouse/containers` | "ตู้คอนเทนเนอร์ (Spine)" | Container spine list (0033) — code/transport/origin/destination/source + status filter + new-container inline form | LIST | `super, ops, warehouse` | — |
| `/admin/warehouse/containers/[code]` | "{container.code}" *(font-mono)* | Single container detail — shipments + status timeline + edit | DETAIL | `super, ops, warehouse` | `[code]` |
| `/admin/warehouse/qa-inspections` | "การตรวจคุณภาพ (QA/QC) คลัง" | V-E10 QA inspections list + pending queue (arrived shipments without inspection yet) | LIST | `super, accounting, warehouse` | — |
| `/admin/warehouse/qa-inspections/[id]` | "ใบตรวจ {inspection_no}" | Single QA inspection detail | DETAIL | `super, accounting, warehouse` | `[id]` |
| `/admin/warehouse/qa-inspections/new` | "บันทึกการตรวจคุณภาพ" | New QA inspection form (`?shipment=<uuid>` keyed) | FORM | `super, accounting, warehouse` | — |
| `/admin/withdrawals` | (no h1 — redirect) | REDIRECT → `/admin/wallet?kind=withdraw&status=pending` (legacy withdrawals queue stub) | REDIRECT | `any-admin` (layout) | — |
| `/admin/yuan-payments` | "ฝากโอนหยวน" | Yuan-payment ops list — pending/processing/completed/failed/refunded + bulk approve | LIST | `accounting` | — |

> Row count = **129** — matches the §1 total.

## 3. Noteworthy patterns

### 3.1 REDIRECT-only pages (16 — ภูม's frustration is real)

Pages whose entire body is a single `redirect(…)` call. These exist purely
because something (sidebar items / muscle memory / old bookmarks / old
notifications) still links to the OLD path. They will trip up the
synthesis agent's "this sidebar item should point at the target directly"
recommendation.

| Route | Redirects to | Reason it exists |
|---|---|---|
| `/admin/dashboard` | `/admin` | Old "Dashboard" sidebar item — superseded |
| `/admin/withdrawals` | `/admin/wallet?kind=withdraw&status=pending` | Wallet pattern audit B (option C hybrid) |
| `/admin/wallet/deposit` | `/admin/wallet?kind=deposit&status=pending` | Wallet pattern audit B §5.1a |
| `/admin/containers` | `/admin/warehouse/containers` | Legacy 0016 → 0033 spine migration |
| `/admin/containers/[id]` | `/admin/warehouse/containers/{spine_code}` | Same — looks up the `legacy_container_id` join |
| `/admin/forwarder` | `/admin/forwarders` | Pluralisation typo from legacy |
| `/admin/forwarder/pending` | `/admin/forwarders?status=pending_payment` | Same |
| `/admin/inventory` | `/admin/barcode` | Conceptual rename |
| `/admin/orders` | `/admin/service-orders` | Renamed module |
| `/admin/orders/import` | `/admin/forwarders` | Renamed module |
| `/admin/orders/import/pending` | `/admin/forwarders?status=pending_payment` | Renamed module |
| `/admin/orders/pending` | `/admin/service-orders?status=pending` | Renamed module |
| `/admin/orders/shop` | `/admin/service-orders` | Renamed module |
| `/admin/orders/shop/pending` | `/admin/service-orders?status=pending` | Renamed module |
| `/admin/orders/transfer` | `/admin/yuan-payments` | Renamed module |
| `/admin/payment` | `/admin/yuan-payments` | Renamed module |

**Synthesis implication:** any sidebar item pointing at one of these 16
routes is a candidate for direct rewiring to the redirect's destination
(no functional change, but one fewer HTTP hop + a cleaner audit). The
exception is the 2 wallet-deposit/withdraw stubs (`?kind=…&status=…`) and
the 1 container legacy id lookup — those embed semantic intent in the
redirect (filtered destination URL); the sidebar should adopt that
filtered URL too rather than pointing at the redirect.

### 3.2 Duplicate / near-duplicate headings (re-implementations across roles)

Looking for workspaces that share a H1 string or strong purpose overlap:

- **Container payments vs disbursements vs container-costs.** Three
  different `/admin/accounting/*` pages with overlapping container/cost
  vocabulary:
  - `/admin/accounting/container-payments` — legacy PCS `tb_cnt` China-side
    payment ledger (PCS port — paid/unpaid per cabinet).
  - `/admin/accounting/disbursements` — modern AP ledger (container_disbursements,
    kind = freight/customs_duty/handling/fuel/storage/trucking/container_lease).
  - `/admin/accounting/container-costs` — carrier rate-card editor (not a ledger).
  Their H1 strings make the distinction clear, but a casual sidebar
  reader would pick the wrong one. Worth a short README in `/admin/accounting`.

- **Containers (3 surfaces — 2 redirects + 1 spine).** `/admin/containers`
  + `/admin/containers/[id]` redirect to `/admin/warehouse/containers` +
  `/admin/warehouse/containers/[code]`. The legacy "HS lines" sub-route
  `/admin/containers/[id]/hs` is NOT redirected and remains functional
  (intentional per the cutover note). Sidebar mislink risk is high here.

- **Reports — 11 separate report pages.** Each has its own H1 and clear
  purpose, but the `/admin/reports` hub + 11 leaf pages may benefit from
  a single tabbed report explorer; the 7-page split is legacy-shaped.

- **Containers HS code reports vs containers spine.** Both deal with
  "containers" but: `/admin/reports/containers-hs` (aggregate HS code
  report), `/admin/reports/containers-awaiting-th` (pipeline SLA queue),
  `/admin/warehouse/containers` (spine — the source-of-truth table).

- **HR `org-chart` vs `org-table`** — same data, two views (visual tree
  vs table). Intentional dual-presentation, not a duplicate.

### 3.3 Pages without an `<h1>` (17 total)

All 16 REDIRECT-only pages naturally have no `<h1>` (no UI at all). The
17th is the **admin root `/admin/page.tsx`** — it renders straight into
stat cards under a "Row 1: 4 revenue stat cards" section header. The H1
slot is implied by the page-title chrome but missing — a small a11y +
fidelity gap worth a one-line fix.

### 3.4 Conditional / pseudo-redirect pages (3)

These are NOT in the REDIRECT-only count because they have full UI under
the conditional bounce:

- `/admin/customers/[id]/convert-to-juristic` — renders a juristic-conversion
  form, but if the customer is already juristic, redirects back to the
  customer detail.
- `/admin/learning` — renders the 4-card learning hub by default, but if
  `?topic=<key>` arrives from the sidebar, renders a per-topic placeholder
  page instead.
- `/admin/warehouse/qa-inspections/new` — renders the inspection form when
  `?shipment=<uuid>` is present, but redirects back to the list if no
  shipment is given.

These are "OTHER" type — the synthesis agent should not flag them as
"sidebar shouldn't point here" candidates the way it might with the 16
true REDIRECT-only stubs.

### 3.5 Stubs / coming-soon pages

- `/admin/forwarders/container-cost-check` — labelled in code as a "Phase-C
  eligible STUB". Per `_MASTER-FIX-PLAN.md` row A-1 this is an audit-A
  recommendation. Sidebar should land here for now (keeps link clickable),
  but the implementation is intentionally a placeholder.

### 3.6 Title text quirks (sidebar mismatch candidates)

- **`/admin/admins`** H1 = **"จัดการ admin (super only)"** — appends a
  parenthetical role hint inline. Sidebar likely says "admins" or "จัดการ
  admin" — gap to check.
- **`/admin/bookings`** H1 = **"การจองทั้งหมด (BK-1)"** — appends the
  internal ticket code `(BK-1)`. Customer-facing surfaces would NOT carry
  the ticket code, but this is internal admin — fine, just worth noting
  for consistency.
- **`/admin/commissions`**, **`/admin/freight/declarations`** — also append
  `(V-E8)`, `(V-E11)` ticket codes. Same flavour.
- **`/admin/refunds`** H1 = **"คำขอคืนเงิน (Refunds — U1-6)"** — code
  + English fall-through. Sidebar fidelity audit may want to normalise.
- **`/admin/sales-payouts`** H1 branches on `?kind=` — "เบิกเงินค่าสินค้า"
  vs "เบิกค่าคอม (sales payouts)". Per the file's audit comment, the
  `?kind=` filter is sidebar-respected via chip-only (no column filter
  yet — Wave-B TODO). The synthesis agent should flag this as a 🟡
  "incomplete sidebar contract" — sidebar promises a filter that the
  workspace doesn't fully honour.

### 3.7 Page-level vs layout-level role gates

- The `(admin)` layout already calls a bare `requireAdmin()` ("any-admin"),
  so 27 pages without an explicit `requireAdmin([…])` are gated only at
  the layout floor.
- The synthesis agent should pay attention to pages **without** a
  page-level role-pin that read PII or money state via `createAdminClient()`
  (RLS-bypass). The wallet/yuan/sales-payouts pages explicitly added
  `requireAdmin(["accounting"])` for this reason (`W-1` audit comment in
  each file). A scan of layout-only pages might reveal more.

## 4. Cross-link target

This inventory is half of the workspace ↔ sidebar pairing task. The other
half (sidebar map) is in `05-sidebar-map.md` (TBD). Synthesis is in
`07-IA-restructure-proposal.md` (TBD).
