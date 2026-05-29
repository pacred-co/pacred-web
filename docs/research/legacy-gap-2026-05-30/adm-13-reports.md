# Legacy gap audit — adm-13-reports (Admin · ออกรายงาน)

**Lane:** `adm-13-reports` · **Side:** admin · **Date:** 2026-05-30
**Legacy scope:** `pcs-admin/report-*.php` (31 files) + `report-api-sms.php` + the MVC report dirs (`include/pages/report-*`).
**Pacred target:** `app/[locale]/(admin)/admin/{reports,kpi,audit,incidents}/*` + `actions/admin/reports.ts` (+ `report-cnt-*`, `shop-payouts.ts`).
**Method:** read all 31 legacy report files exhaustively (titles, FROM tables, formulas, write-flows, the canonical `OOP/Cargo/menu-report.php` menu), then grep + open every Pacred report page/action. TRUST-BUT-VERIFY: opened the real PHP + the real TSX, traced `.from("...")` targets.

> ⚠️ Read against branch `dave-pacred` HEAD. Worktree base may be stale — verify with `git show dave-pacred:<file>` if a path is missing.

---

## Overview

### Legacy report inventory (31 files — canonical)

The legacy reports menu (`include/pages/left-menu/OOP/Cargo/menu-report.php`) is the source-of-truth for which reports are LIVE (linked) vs vestigial. Grouping + step order from that file:

| # | Legacy file | Menu label (TH) | Menu group | FROM table(s) | Kind |
|---|---|---|---|---|---|
| 1 | `report-shops.php` (`report-shops/`) | ฝากสั่งซื้อ › ข้อมูลทั่วไป | ฝากสั่งซื้อ | `tb_header_order` | list |
| 2 | `report-shop-group-by-user.php` | ฝากสั่งซื้อ › รวมตามรหัสลูกค้า | ฝากสั่งซื้อ | `tb_header_order` (per userID) | rollup |
| 3 | `report-shops-profit.php` | (profit drill — linked from shops) | ฝากสั่งซื้อ | `tb_header_order` | P&L |
| 4 | `report-shops-profit-pay.php` | ทำรายการเบิกเงิน (เบิกจ่ายค่าสินค้า) | ฝากสั่งซื้อ | `tb_account_pcs` + `tb_header_order` + **INSERT** `tb_shop_pay_h`/`tb_shop_pay_sub` | **WRITE** |
| 5 | `report-shops-profit-pay-history.php` | ประวัติจ่ายเงินค่าสินค้า | ฝากสั่งซื้อ | `tb_header_order` + `tb_shop_pay_h` | list |
| 6 | `report-forwarder.php` (`report-forwarder/`) | ฝากนำเข้า › ข้อมูลทั่วไป | ฝากนำเข้า | `tb_forwarder` | list |
| 7 | `report-forwarder-profit.php` | (profit drill — graph + table) | ฝากนำเข้า | `tb_forwarder` | P&L |
| 8 | `report-forwarder-volume.php` | (sample-page stub — **dead in legacy**) | ฝากนำเข้า | `sample-page` (detail/add) · home only | stub |
| 9 | `report-payments.php` (`report-payments/`) | ฝากโอน › ข้อมูลทั่วไป | ฝากโอน | `tb_payment` | list |
| 10 | `report-payments-profit.php` | (profit drill — graph + table) | ฝากโอน | `tb_payment` | P&L |
| 11 | `report-sale.php` | ยอดพนักงานขาย (legacy = `report-sale-new.php` in menu) | top-level | `tb_sales_report` (materialised) + `tb_admin` + `tb_forwarder` | rep rollup |
| 12 | `report-sale-new.php` | ยอดพนักงานขาย | top-level | (no direct FROM — pages dir) | rep rollup |
| 13 | `report-user-all.php` | ยอดรวมทุกบริการ | top-level | `tb_forwarder`+`tb_header_order`+`tb_payment`+`tb_users` | per-customer all-service sum |
| 14 | `report-sales-group-by-user.php` | ยอดขายรวมตามรหัส | top-level | `tb_name` (MVC home) | rollup |
| 15 | `report-driver-2023.php` | รายงานคนขับรถ | top-level | `tb_forwarder_driver_item` | driver run list |
| 16 | `report-driver.php` | ยอดพนักขับรถ (vestigial) | — | `tb_sales_report` | driver volume |
| 17 | `report-driver2.php` | ยอดพนักขับรถ (vestigial) | — | `tb_sales_report` | driver volume |
| 18 | `report-system.php` | การเข้าถึงเว็บไซต์ | การเข้าถึงเว็บไซต์ | `tb_web_hs` (+ `tb_page_name`) | analytics (6 charts) |
| 19 | `report-system-profile.php` | (per-profile access drill) | การเข้าถึงเว็บไซต์ | `tb_web_hs` | analytics |
| 20 | `report-api-china.php` | ยอดการใช้ API จีน | การเข้าถึงเว็บไซต์ | (China search API hits) | usage |
| 21 | `report-user-search.php` / `report-search.php` | ยอดการค้นหาสินค้า | การเข้าถึงเว็บไซต์ | `tb_history_key` | search analytics |
| 22 | `report-pro-survey202306.php` | Surveyนี้ โอเคมั๊ย | รายงานโปรโมชัน | `tb_survey` | promo |
| 23 | `report-pro-3-year-anniversary.php` | 3 Year Anniversary | รายงานโปรโมชัน | `tb_promotion` + `tb_wallet_hs` | promo |
| 24 | `report-pro-oh-my-ghost.php` | Oh My Ghost | รายงานโปรโมชัน | `tb_wallet_hs` | promo |
| 25 | `report-api-sms.php` | ยอดการใช้ SMS | top-level | `tb_sms_hs` | usage |
| 26 | `report-otp-not-pass.php` | ลูกค้าสมัครใหม่ OTP ไม่ผ่าน | รายงาน SMS OTP | `tb_register` + `tb_users` | list |
| 27 | `report-otp-success.php` | ลูกค้ายืนยัน OTP แล้ว | รายงาน SMS OTP | `tb_users_otp` | list |
| 28 | `report-user-sales.php` | (ตัวแทน/sales-agent payout) | (sales agent flow) | `tb_user_sales`+`tb_user_sales_pay`+`tb_user_sales_admin_pay` | agent payout |
| 29 | `report-user-sales-history.php` | ประวัติจ่ายเงินลูกค้าตัวแทน | (sales agent flow) | `tb_user_sales`+`tb_user_sales_pay`+`tb_user_sales_admin_pay` | agent payout history |
| 30 | `report-user-service.php` | (customer service-usage detail) | — | `tb_forwarder`+`tb_header_order`+`tb_payment`+`tb_users` | per-customer |
| 31 | `report-user-service-all.php` | (customer service-usage all) | — | `tb_forwarder`+`tb_header_order`+`tb_payment`+`tb_users` | per-customer |
| + | `report-cnt.php` (`report-cnt/`) | (ตู้/container cost ledger) | — | `tb_cnt` | container P&L — **own lane adm-cnt** |

### Pacred report inventory (what exists)

`/admin/reports` hub (`page.tsx`, 1075 LOC) + 21 sub-pages + `actions/admin/reports.ts` (437 LOC) + `report-cnt*` + `shop-payouts.ts`.

- **Hub** `page.tsx` — 5 tabs (forwarder/shop/yuan/sales/payment) **correctly swapped to `tb_*`** (Wave 20 P0-4) + 10 quick-link cards. ✅ faithful-source.
- **tb_*-backed sub-pages (genuine ports):** `forwarder` (506 LOC), `shop` (533), `payment` (485), `user-sales-history` + `[customer_id]` (566), `system` (777 — all 6 legacy charts), `shops-profit-pay` (709, read-only), `sales-by-rep` (`vw_sales_by_rep` over tb_*), `forwarder-volume`, `containers-hs`, `containers-awaiting-th`, `pending-payments`, `credit-pending`, `debtors`, `refunds`, `monthly-orders`, `hs-code-revenue`.
- **REBUILT-table sub-pages (DEAD on prod):** `shops-profit`, `forwarder-profit`, `yuan-profit`, `sales-monthly`, `otp-success` — all import `actions/admin/reports.ts`, which reads `forwarders` / `service_orders` / `yuan_payments` / `otp_codes` / `profiles` (empty rebuilt tables).
- **KPI/audit/incidents:** `/admin/kpi` (Pacred-native exec dashboard), `/admin/audit` + `/api/admin/audit/export` + `/admin/hr/audit` (audit log — Pacred-native, no legacy report equiv), `/admin/incidents` (Pacred-native). These are Phase-C additions, NOT legacy report ports — not counted as gaps.

### % complete

**~62% complete** on faithful report coverage.

- Of the ~24 *substantive* legacy reports (excluding 3 vestigial drivers, the sample-page stub, the cnt own-lane, and treating the agent-payout pair as one): **~13 present & tb_*-correct**, **5 present-but-DEAD (rebuilt reads)**, **~6 fully MISSING**.
- The 5 dead profit/rep/otp reports are the worst: they look shipped (page renders, CSV button, date filter) but show ฿0 / empty on prod against 21,950 real orders. Classic Pattern-1 silent dead-READ.

---

## Workflow-by-workflow gap table

| Legacy flow | Pacred equiv | Status | Flow-order correct? | Owner |
|---|---|---|---|---|
| `report-forwarder.php` — ฝากนำเข้า list (tb_forwarder) | `/admin/reports/forwarder` + hub `forwarder` tab → `tb_forwarder` | ✅ | yes (tb_forwarder + 2-pass tb_users) | ภูม |
| `report-shops.php` — ฝากสั่งซื้อ list (tb_header_order) | `/admin/reports/shop` + hub `shop` tab → `tb_header_order` | ✅ | yes | ภูม |
| `report-payments.php` — ฝากโอน list (tb_payment) | `/admin/reports/payment` + hub `yuan` tab → `tb_payment` | ✅ | yes | ภูม |
| `report-user-all.php` — ยอดรวมทุกบริการ/customer (3-service SUM) | `/admin/reports/user-sales-history` → tb_forwarder+tb_header_order+tb_payment+tb_users | ✅ | yes (same 3-source merge per userID) | ภูม |
| `report-system.php` — การเข้าถึงเว็บ (6 charts) | `/admin/reports/system` → `tb_web_hs`+`tb_page_name` | ✅ | yes (all 6 aggregations + device/browser filters + tb_page_name overflow) | ภูม |
| `report-shops-profit.php` — ฝากสั่งซื้อ P&L | `/admin/reports/shops-profit` → **`service_orders` (REBUILT)** | 💀 | NO — dead read; legacy reads tb_header_order | ภูม |
| `report-forwarder-profit.php` — ฝากนำเข้า P&L (graph + fStatus selector) | `/admin/reports/forwarder-profit` → **`forwarders` (REBUILT)** | 💀 | NO — dead read; + ADDED VAT7 col not in legacy; missing the daily-profit graph + `5plus` status filter | ภูม |
| `report-payments-profit.php` — ฝากโอน P&L (payStatus=2, payProfitTHB) | `/admin/reports/yuan-profit` → **`yuan_payments` (REBUILT)** | 💀 | NO — dead read; legacy reads tb_payment | ภูม |
| `report-sale.php` / `report-sale-new.php` — ยอดพนักงานขาย (tb_sales_report materialised, fStatus=7) | `/admin/reports/sales-monthly` → **`forwarders` (REBUILT)** | 💀 | NO — dead read + wrong mechanism (legacy = materialised tb_sales_report keyed by srAdminIDSale; Pacred = live forwarders + profiles.sales_admin_id) | ภูม |
| (same — ยอดพนักงานขาย, tb_* alt) | `/admin/reports/sales-by-rep` → `vw_sales_by_rep` (tb_*) | 🟡 | partial — tb_*-correct but a SECOND parallel rep report; not the menu-canonical `report-sale` shape (no materialised-row click-to-generate, no monthly drill detail page) | ภูม |
| `report-otp-success.php` — ยืนยัน OTP แล้ว (tb_users_otp) | `/admin/reports/otp-success` → **`otp_codes`+`profiles` (REBUILT)** | 💀 | NO — dead read; legacy reads tb_users_otp keyed by userID | ภูม |
| `report-shops-profit-pay.php` — เบิกจ่ายค่าสินค้า (INSERT tb_shop_pay_h + set hShopPay=1) | `/admin/reports/shops-profit-pay` (READ-ONLY) → tb_header_order/tb_wallet_hs | 🟡 | partial — list faithful BUT the core multi-select **เบิกจ่าย WRITE flow is absent** (page banners "read-only · Phase C"); redirects to `/admin/shop-payouts` (different model: tb_shop_transactions, customer-pull not admin-push) | เดฟ |
| `report-shops-profit-pay-history.php` — ประวัติจ่ายค่าสินค้า | (none — folded into shops-profit-pay read view, no tb_shop_pay_h history list) | ❌ | NO — tb_shop_pay_h not surfaced | ภูม |
| `report-user-sales.php` / `report-user-sales-history.php` — ประวัติจ่ายเงินลูกค้าตัวแทน (sales-AGENT payout, tb_user_sales*) | (none — `user-sales-history` is the customer-service-sum report, NOT the agent-payout report; name collision) | ❌ | NO — the tb_user_sales / tb_user_sales_pay agent-commission payout report is entirely missing | ภูม |
| `report-search.php` / `report-user-search.php` — ยอดการค้นหาสินค้า (tb_history_key) | (none anywhere) | ❌ | NO | ปอน |
| `report-api-china.php` — ยอดการใช้ API จีน | (none anywhere) | ❌ | NO | ปอน |
| `report-api-sms.php` — ยอดการใช้ SMS (tb_sms_hs) | (none anywhere — `/admin/system/notifications` does not surface tb_sms_hs usage) | ❌ | NO | ปอน |
| `report-driver-2023.php` — รายงานคนขับรถ (tb_forwarder_driver_item) | `/admin/driver-runs` (menu points reports "คนขับ" here) | 🟡 | partial — driver lane covered elsewhere (adm-driver); verify run-list parity there | ภูม |
| `report-driver.php` / `report-driver2.php` — ยอดพนักขับรถ (vestigial tb_sales_report) | (none) | ✅ ignore | n/a — vestigial in legacy, not in menu | — |
| `report-pro-survey202306.php` — Survey promo (tb_survey) | (none) | ❌ | NO (low priority — one-off 2023 promo) | ปอน |
| `report-pro-3-year-anniversary.php` — promo (tb_promotion+tb_wallet_hs) | (none) | ❌ | NO (low priority — one-off promo) | ปอน |
| `report-pro-oh-my-ghost.php` — promo (tb_wallet_hs) | (none) | ❌ | NO (low priority — one-off promo) | ปอน |
| `report-forwarder-volume.php` — (sample-page stub) | `/admin/reports/forwarder-volume` (tb_forwarder volume) | ✅ exceeds | n/a — legacy was a dead stub; Pacred built a real one | ภูม |
| `report-shop-group-by-user.php` / `report-sales-group-by-user.php` — รวมตามรหัส | (partially via user-sales-history per-customer rollup) | 🟡 | partial — per-customer aggregate exists; not the exact "group-by-รหัส" landing | ภูม |

---

## Death-flows (P0/P1 detailed)

### 💀 P0-1 — 5 report sub-pages are DEAD READS against rebuilt tables (`actions/admin/reports.ts`)

**The single biggest finding in this lane.** `actions/admin/reports.ts` has 5 fetchers, every one reading a REBUILT (empty-on-prod) table:

| Fetcher (reports.ts line) | Reads | Should read | Consuming page |
|---|---|---|---|
| `getShopsProfitReport` (L225) | `service_orders` | `tb_header_order` | `/admin/reports/shops-profit` |
| `getForwarderProfitReport` (L139) | `forwarders` | `tb_forwarder` | `/admin/reports/forwarder-profit` |
| `getYuanProfitReport` (L304) | `yuan_payments` | `tb_payment` | `/admin/reports/yuan-profit` |
| `getSalesMonthlyReport` (L44) | `forwarders` + `profiles` | `tb_sales_report`/`tb_forwarder` + `tb_admin` | `/admin/reports/sales-monthly` |
| `getOtpSuccessReport` (L381) | `otp_codes` + `profiles` | `tb_users_otp` + `tb_users` | `/admin/reports/otp-success` |

**Why it's a death-flow:** the page renders fine (header, date filter, CSV button, status chips) so it passes a route-200 smoke. On prod it returns **0 rows / ฿0** because the rebuilt tables were never backfilled (Phase A loaded only `tb_*`). Accounting opens "รายงานกำไรฝากนำเข้า" → sees ฿0 profit → either panics or stops trusting reports. This is the exact "looks present but is dead" pattern the owner mandate flags as P0.

**Fix:** pivot each fetcher to its `tb_*` source (the hub `page.tsx` already proves the field-map: `tb_forwarder.ftotalprice`/`fcosttotalprice`/`fprofittotal`, `tb_header_order.htotalpriceuser`/`hcostallth`, `tb_payment.paythb`/`paythbcost`/`payprofitthb`, `tb_users_otp`). Owner: **ภูม**.

### 💀 P0-2 — `forwarder-profit` / `payments-profit` formula + UI divergence (faithfulness)

Even after the table pivot, the profit pages diverge from legacy:
- **Legacy `report-forwarder-profit.php`** profit = `fTotalPrice − fDiscount − fCostTotalPrice`, and shows precomputed `fProfitTransportCHN` + `fProfitPriceUpdate` + `fProfitTotal` columns, a **daily-profit bar graph** (`SUM(fProfitTotal) WHERE fStatus=7 GROUP BY DATE`), and an `fStatus` selector with a special **`5plus`** option (`fStatus>5`). Pacred's version has none of the graph/selector and **invents a `vat7 = profit*0.07` column legacy does not have**.
- **Legacy `report-payments-profit.php`** profit = `payTHB − payTHBCost` (filter `payStatus=2`), precomputed `payProfitTHB`, daily graph. Pacred adds VAT7 (not in legacy).

**Fix:** match legacy profit formula exactly (use the precomputed `fprofittotal`/`payprofitthb` columns), drop the invented VAT7 column (or move to a Phase-C enhancement clearly labelled), restore the daily-profit graph + `5plus` filter. Owner: **ภูม**. P1 (P0 is the dead-read; this is the fidelity layer on top).

### 💀 P0-3 — ยอดพนักงานขาย mechanism divergence (`report-sale.php`)

Legacy `report-sale.php` is a **materialised** report: `tb_sales_report` rows are INSERTed (srDate=fDateStatus7, srAdminIDSale) at the point a forwarder hits `fStatus=7`; the report then `GROUP BY MONTH(srDate), srAdminIDSale` joined to `tb_admin`. Pacred has **two** non-faithful substitutes:
- `sales-monthly` → reads rebuilt `forwarders` (DEAD).
- `sales-by-rep` → reads `vw_sales_by_rep` (tb_*-correct but a live recompute, not the materialised-row model, and missing the click-to-generate + per-rep monthly detail page `report-sale.php?page=detail`).

**Decision needed (architecture):** keep the live-recompute `sales-by-rep` as the canonical rep report and retire `sales-monthly`, OR port the materialised `tb_sales_report` model faithfully. Recommend the former (live recompute is strictly better and tb_*-correct) but it must absorb the missing per-rep monthly **detail drill** + be wired as the menu-canonical "ยอดพนักงานขาย". Owner: **เดฟ** (architecture call), execution **ภูม**.

### ❌ P1-4 — Agent-commission payout report missing (`report-user-sales*.php`)

`report-user-sales.php` + `report-user-sales-history.php` are the **customer-as-sales-agent** payout reports over `tb_user_sales` / `tb_user_sales_pay` / `tb_user_sales_admin_pay` (ประวัติจ่ายเงินลูกค้าตัวแทน). Pacred's `/admin/reports/user-sales-history` is a **name collision** — it's actually the `report-user-all.php` per-customer 3-service SUM, NOT the agent-payout report. The agent-commission payout report has **no Pacred equivalent**. Owner: **ภูม**.

### ❌ P1-5 — เบิกจ่ายค่าสินค้า WRITE flow absent (`report-shops-profit-pay.php`)

Legacy `report-shops-profit-pay.php` is a **write** flow: multi-select paid orders (`hShopPay<>1`) → INSERT `tb_shop_pay_h` (batch header) + `tb_shop_pay_sub` (per-hNo) → `UPDATE tb_header_order SET hShopPay='1'`. Pacred's page is explicitly **read-only** (banner says Phase C) and points to `/admin/shop-payouts` — a **different model** (`tb_shop_transactions`, customer-pull). The admin-push batch-disbursement to the China shops is not ported. Owner: **เดฟ** (needs migration + payout-batch state-machine ADR).

### ❌ P1-6 — Usage/analytics reports fully missing (search · China-API · SMS)

Three monitoring reports have **zero** Pacred surfacing anywhere (verified across all of `app/(admin)` + `actions/admin`):
- `report-search.php` / `report-user-search.php` — ยอดการค้นหาสินค้า (`tb_history_key`) — what customers search for; product-demand signal.
- `report-api-china.php` — ยอดการใช้ API จีน — China search-API call volume (cost monitoring).
- `report-api-sms.php` — ยอดการใช้ SMS (`tb_sms_hs`) — SMS credit burn; cost monitoring (note: customer OTP now ThaiBulkSMS — usage still needs a report).

These are data-analysis / monitoring surfaces. Owner: **ปอน** (per lane assignment: customer-facing + monitoring/dashboards).

### ❌ P2-7 — One-off promo reports missing (3 pro-* files)

`report-pro-survey202306.php`, `report-pro-3-year-anniversary.php`, `report-pro-oh-my-ghost.php` — historical 2023 promo participation reports (`tb_survey`, `tb_promotion`, `tb_wallet_hs`). Low priority (one-off campaigns, not recurring ops). Owner: **ปอน**. Likely WONTFIX / Phase-C unless those promos recur.

---

## Flow-order divergences

1. **Profit reports read-table order** — legacy: graph(fStatus=7 daily) → filter form → detail table (status-filtered). Pacred dead-read pages render filter → table only (no graph), AND read the wrong table. Order + completeness both diverge.
2. **ยอดพนักงานขาย generation order** — legacy: forwarder hits fStatus=7 ⇒ materialise tb_sales_report row ⇒ report GROUP BYs the materialised rows. Pacred recomputes live from tb_forwarder (`fstatus IN 6,7`) — skips the materialisation step entirely. Different sequence; faithfulness gap (though arguably superior).
3. **เบิกจ่ายค่าสินค้า** — legacy: select orders → create tb_shop_pay_h batch → flip hShopPay=1 (admin-push). Pacred substitutes a customer-pull queue (`shop-payouts` → tb_shop_transactions). The actor + direction + target table all differ.
4. **VAT7 injected** — Pacred forwarder-profit/yuan-profit add a `vat7 = profit * 0.07` column that does not exist in the legacy report — an "improvement" smuggled into a port diff (violates "copy 100% first").

---

## Modals / AJAX / cron / print inventory

| Legacy artifact | Where | Pacred status |
|---|---|---|
| `print-report-shop.php` (print selected paid-orders) | shops-profit-pay form `action=print-report-shop.php` | ❌ no Pacred print route for shops-profit-pay |
| Chart.js charts (top20 pages, low20 load_time, top20 users, device pie, browser pie, OS pie) | `report-system.php` | ✅ ported (system/page.tsx has all 6 aggregations + fallbacks) |
| Daily-profit bar graph `SUM(fProfitTotal) GROUP BY DATE` | `report-forwarder-profit.php` / `report-payments-profit.php` | ❌ not ported (Pacred profit pages have no graph) |
| tb_sales_report INSERT-on-view (materialise on fStatus=7) | `report-sale.php` L15-28 | ❌ not ported (Pacred recomputes live) |
| Multi-select → INSERT tb_shop_pay_h batch | `report-shops-profit-pay.php` L26-53 | ❌ not ported (read-only) |
| DataTables CSV/Excel/PDF/copy export buttons | most report pages | 🟡 Pacred has `CsvButton` (CSV only) — no Excel/PDF/copy parity |
| `fStatus` selector incl `5plus` (fStatus>5) | `report-forwarder-profit.php` | ❌ not ported |
| Date-range filter | all reports | ✅ `AdminDateFilter` / `report-date-form` |
| **Cron:** weekly-report email (`include/cron/weekly-report.php`) | (per d1-audit-pcscargo §165) | ❌ no scheduled task (out of strict report-page scope but report-adjacent) |
| **No PDF/mPDF** in core report-*.php | verified — reports are HTML+DataTables, NOT mPDF | n/a (print routes are separate `print-report-*.php`) |

---

## Recommended fixes (ranked, with owner)

| Rank | Fix | Files | Owner | ETA |
|---|---|---|---|---|
| **1 (P0)** | Pivot 5 `reports.ts` fetchers from rebuilt → `tb_*` (forwarder-profit→tb_forwarder, shops-profit→tb_header_order, yuan-profit→tb_payment, otp-success→tb_users_otp, sales-monthly→tb_forwarder/tb_admin). Field-map already proven in hub `page.tsx`. | `actions/admin/reports.ts` (+ the 5 pages' type imports) | ภูม | 4-6h |
| **2 (P0)** | Architecture call: retire `sales-monthly` (dead) in favour of `sales-by-rep` (`vw_sales_by_rep`, tb_*-correct) as the menu-canonical "ยอดพนักงานขาย"; add the missing per-rep monthly **detail drill** page. | `sales-monthly/`, `sales-by-rep/`, menu | เดฟ (call) → ภูม (build) | 3h |
| **3 (P1)** | Drop invented `vat7` column from forwarder-profit/yuan-profit; restore legacy profit formula (`fProfitTotal`/`payProfitTHB`) + daily-profit graph + `5plus` filter. | `reports.ts`, profit pages | ภูม | 4h |
| **4 (P1)** | Build the agent-commission payout report (`tb_user_sales`/`tb_user_sales_pay`/`tb_user_sales_admin_pay`) — distinct from the misnamed `user-sales-history`. | new `/admin/reports/agent-payouts` | ภูม | 4h |
| **5 (P1)** | Port the เบิกจ่ายค่าสินค้า admin-push WRITE flow (multi-select → tb_shop_pay_h/tb_shop_pay_sub → hShopPay=1) + tb_shop_pay_h history list + print-report-shop. Needs migration + payout-batch ADR. | new action + migration, `shops-profit-pay/` | เดฟ | 6-8h |
| **6 (P1)** | Build monitoring reports: search (`tb_history_key`), China-API usage, SMS usage (`tb_sms_hs`). Group under a "monitoring" report section. | new sub-pages | ปอน | 5h |
| **7 (P2)** | Export parity: add Excel/PDF/copy alongside CSV on report tables (legacy DataTables had all 4). | `components/admin/csv-button.tsx` | ภูม | 2h |
| **8 (P2)** | Decide WONTFIX vs port for 3 one-off `report-pro-*` promo reports + `report-driver`/`report-driver2` vestigials. | — | ปอน | 1h triage |
| **9 (P2)** | Wire weekly-report email cron as a Pacred scheduled task. | scheduled task | เดฟ | 2h |

---

### Honesty notes
- **NOT a gap:** `/admin/kpi`, `/admin/audit`, `/admin/incidents` are Pacred-native (no legacy report counterpart) — Phase-C, excluded.
- **report-cnt** (`tb_cnt` container ledger) is its own lane (adm-cnt / ภูม's master-fidelity Agent E) — referenced from this menu but not scored here.
- **The good news:** the 4 highest-traffic operational reports (forwarder/shop/payment list + per-customer all-service + web-access analytics) ARE faithfully ported to `tb_*`. The rot is concentrated in the **profit/rep/otp** drill-downs (all via the one stale `reports.ts`) and the **monitoring + agent-payout + admin-push-disbursement** reports that were never built.
