# /admin/* full audit — 2026-05-25 ค่ำ (Wave 20 P0)

> Triggered by ภูม flag: 2 examples broken (`combine-bill`, `warehouse-history`) + request to audit
> the WHOLE admin tree before planning Wave 20. Read-only static audit at `origin/Poom-pacred` HEAD
> `f83cf7d` (sibling worktree `adoring-chandrasekhar-0f8ad7`).
>
> **Note** — this commit lands on the agent worktree at `worktree-agent-a7cbd41ada1e449b2` which is
> on `e7903b3` (stale by 11 commits); attempted resync `git merge origin/Poom-pacred` triggered 5
> merge conflicts so the audit was performed by reading files from the sibling worktree
> `C:/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7` which IS at `f83cf7d`.
> Orchestrator: cherry-pick / rebase this commit onto Poom-pacred lineage before integration.

## TL;DR

- **Total pages audited:** 175 `page.tsx` files under `app/[locale]/(admin)/admin/**`
- ✅ **Working (tb_* schema + Tailwind UI):** ~71
- ⚠️ **Copy-only (verbatim Bootstrap-4 + `.pcs-legacy` CSS scope, deferred mutations):** 36
- 🟠 **Wrong-schema (reads rebuilt-app `forwarders`/`profiles`/`wallet_transactions`/`service_orders`/`yuan_payments` — EMPTY on prod):** 17 pages with full wrong-schema reads + 5 hybrid (kpi, customers/[id], freight detail = `tb_*` + `profiles` join)
- 🟠 **No-data by default (UI works, default filter returns empty):** 2 (warehouse-history = "today only"; freight surfaces = empty `freight_*` tables until freight team ramps)
- 🔴 **Broken (runtime error / wrong markup paradigm):** 0 confirmed (couldn't curl — Bash blocked); the closest finding = the 2 ⚠️ examples ภูม flagged
- 📦 **Stub (explicit "อยู่ระหว่างพัฒนา" or `href="#"` placeholder or tombstone redirect):** ~18

The **single biggest finding** = wallets, customers, QA queues, forwarders, report-cnt, wallet/[id],
admins, yuan-payments, cnt-hs all read `tb_*` correctly. But **a wide swath of "rebuilt-era" pages**
(reports/page hub · reports/credit-pending · reports/pending-payments · reports/refunds ·
reports/debtors · reports/monthly-orders · accounting/page · accounting/reconcile · accounting/closing
· kpi · audit · service-orders + service-order detail · customers/[id] detail · bookings ·
contact-messages · forwarders/[fNo] detail · forwarders/notes · drivers · drivers/work) **still
read the rebuilt-app tables which are EMPTY on prod** — these all look "broken / no data" to staff
even though they're not technically failing.

## Priority recommendations (suggested Wave 20 sequence)

| # | Page | Bucket | Why this priority | Est. effort |
|---|---|---|---|---|
| **P0-1** | `/admin/customers/[id]` | 🟠 wrong-schema | Customer detail unreachable — `profiles` table empty (8,898 customers on `tb_users`). The list page IS on `tb_users` ✅ → row-click 404 ภูม-style. SAME bug class as the 2026-05-25 ค่ำ `PR10899` issue. | 4-6h (port from `tb_users` + `tb_wallet` + `tb_address` + `tb_corporate`) |
| **P0-2** | `/admin/accounting/page.tsx` (hub) | 🟠 wrong-schema | Hub home for accounting — currently sums `forwarders` + `service_orders` + `yuan_payments` + `wallet_transactions` = all ฿0.00 on prod (rebuilt tables empty). Same bug class as the 2026-05-21 `/admin/page.tsx` rewrite (commit `9c0ffd6` ฉบับ Wave 6 P0). | 3-4h |
| **P0-3** | `/admin/kpi/page.tsx` | 🟠 wrong-schema (partial) | Executive KPI — revenue + signups + wallet are EMPTY (`forwarders`/`profiles`/`wallet_transactions`); only the container-throughput cards (`tb_forwarder` DISTINCT fcabinetnumber) actually populate. The dashboard the owner shows to investors is half-blank. | 2-3h |
| **P0-4** | `/admin/reports/page.tsx` (hub) + ~5 sub-reports | 🟠 wrong-schema | Reports hub + credit-pending / pending-payments / refunds / debtors / monthly-orders all read the empty rebuilt tables. Hub shows ฿0 + 0 counts; sub-reports show empty tables. Staff cannot trust any number on `/admin/reports/*`. | 8-10h (5 pages, similar pattern each) |
| **P0-5** | `/admin/forwarders/[fNo]/page.tsx` | 🟠 partial wrong-schema | Detail-page row-click: reads `forwarders` first → falls back to `tb_forwarder` legacy view. The fallback IS implemented (`renderLegacyForwarderView`) so click-from-list works, but `/admin/forwarders/[fNo]/edit/page.tsx` already uses `tb_forwarder` directly — promote the legacy view to primary + delete the rebuilt-schema codepath. | 4-5h (cost-adjustments + driver-assign panels need re-port) |
| **P1-1** | 36× ⚠️ COPY-ONLY pages (`pcs-legacy` CSS scope) | ⚠️ copy-only | All ภูม's flagged pages (`combine-bill`, `warehouse-history`, `combine-bill/add`, etc.) — verbatim Bootstrap-4 markup with deferred interactivity. Violates AGENTS.md §0a design philosophy. Most have correct `tb_*` reads underneath; the gap is **redesign in Tailwind + wire deferred Server Actions**. Sequence by sidebar traffic: admins → admins/[id] → forwarders/notes → forwarders/combine-bill → forwarders/warehouse-history → wallet/add → yuan-payments/new → reports/payment / reports/shop / reports/sales-by-rep / reports/forwarder / reports/user-sales-history → service-orders/cart + cart/add → barcode/cargo/{all,from,import,prepare} + barcode/driver/{all,from,import,prepare} → withdrawal/freight-th → customers/transfer-rep → cnt-hs → organization-email | 2-4h each × 36 = 80-100h split across waves |
| **P1-2** | `/admin/customers/[id]/transfer-rep` + `customers/transfer-rep` | 🟠 wrong-schema (the [id]/ variant) | The `[id]/transfer-rep` variant reads `profiles`/`forwarders`/`service_orders`/`yuan_payments` (empty). The non-`[id]/` variant uses `tb_users` correctly. Likely 2 pages = 1 should redirect to the other. | 1-2h consolidate |
| **P1-3** | `/admin/accounting/closing` + `/admin/accounting/reconcile` | 🟠 wrong-schema | Month-end close + reconcile read `forwarders`/`wallet_transactions` — accounting cannot use these for real closes. | 3-4h each |
| **P1-4** | `/admin/drivers` + `/admin/driver-runs` + `/admin/drivers/work` + `/admin/drivers/[id]` | 🟠 wrong-schema (mixed) | `drivers/page.tsx` reads `forwarder_driver` (rebuilt table — was there ever a backfill?). `drivers/work/page.tsx` reads BOTH `profiles` AND `tb_forwarder_driver` — partial. Driver-assignment dispatch is a daily workflow; needs end-to-end on legacy schema. | 4-6h |
| **P2-1** | `/admin/audit/page.tsx` | 🟠 wrong-schema | Audit log lookup joins `profiles` — staff lookup by member_code fails. Quick fix: swap `profiles` → `tb_users`. | 1-2h |
| **P2-2** | Freight stack (`/admin/freight/*`) | 🟠 no-data | Reads `freight_shipments`/`freight_invoices`/`freight_quotes`/`customs_declarations` — Pacred-original tables (NOT legacy). Empty until freight team starts using them. No bug — just unused. Defer to Phase C when freight ecosystem launches. | — |
| **P2-3** | `/admin/board` + `/admin/board/inbox` | 🟠 wrong-schema (mixed) | Work-board / inbox read `work_items` + `admins` + `profiles` + `notification_reads` — all rebuilt tables. Internal team-collab feature; staff don't use yet. | 4-5h |
| **P2-4** | `/admin/bookings` + `/admin/bookings/[bookingNo]` | 🟠 no-data | Reads `bookings` table (Pacred-original BK-1 booking flow). Was BK-1 ever rolled out? If no, defer to Phase C. | — |
| **P3** | Stubs awaiting their wave: `forwarders/container-cost-check`, `hr/assets`, `accounting/cargo`, `accounting/freight`, `learning` (with topics), `withdrawal/freight-th`, `warehouse/bulletin` (tombstone), `warehouse/containers` (tombstone), `dashboard` (redirect), `inventory` (redirect), `withdrawals` (redirect), `forwarder-import-warehouse` (redirect) | 📦 | All bannered correctly per AGENTS.md §0a — display "อยู่ระหว่างพัฒนา" or redirect. No fix needed; track for Phase C. | 0h |

## Full inventory (by sidebar section)

### Home / dashboards

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin` (page.tsx) | ✅ working | `tb_*` | Wave 6 P0 rewrite landed (`9c0ffd6`) — 13 queues + stat cards all on legacy tables |
| `/admin/dashboard` | ✅ working | — | Server-side `redirect("/admin")` |
| `/admin/kpi` | 🟠 wrong-schema (partial) | mixed | Container cards = `tb_forwarder` ✅; revenue + signups + wallet = `forwarders`/`profiles`/`wallet_transactions` empty 🟠 |
| `/admin/board` | 🟠 wrong-schema | rebuilt | `work_items` + `profiles` + `admins` |
| `/admin/board/inbox` | 🟠 wrong-schema | rebuilt | Same |

### Customers / People

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/customers` | ✅ working | `tb_users` + `tb_wallet` + `tb_address` | List uses correct legacy schema (Wave 18) |
| `/admin/customers/[id]` | 🟠 wrong-schema | `profiles` + `corporate` + `addresses` + `wallet` + `wallet_transactions` | Detail page reads rebuilt tables — row-click 404s for migrated PCS customers (same as `PR10899` bug 2026-05-25 ค่ำ) |
| `/admin/customers/[id]/convert-to-juristic` | 🟠 wrong-schema | `profiles` + `corporate` | Same |
| `/admin/customers/[id]/transfer-rep` | 🟠 wrong-schema | `profiles` + `service_orders` + `forwarders` + `yuan_payments` + `admins` | Hot mess of rebuilt-only tables |
| `/admin/customers/pending` | ✅ working | `tb_users` | Wave 8 P0 |
| `/admin/customers/recently-active` | ✅ working | `tb_users` | |
| `/admin/customers/transfer-rep` (non-[id]) | ⚠️ copy-only | `tb_users` + `tb_admin` | Bootstrap-4 markup, but tb_* reads ✅ |
| `/admin/admins` | ⚠️ copy-only | `tb_admin` + 6 org_* tables | Verbatim Bootstrap, faithful tb_* port |
| `/admin/admins/[id]` | ⚠️ copy-only | `tb_admin` + 12 join tables | Same |
| `/admin/team-leaders` | ✅ working | Pacred-native | TC commission tree |
| `/admin/sales-payouts` | ✅ working | `sales_payouts` + `team_leaders` | Wave-A audit, working |
| `/admin/sales-payouts/[id]` | ✅ working | Same | |
| `/admin/contact-messages` | 🟠 mixed | `contact_messages` + `work_items` | Pacred-original lead funnel; works if leads exist |
| `/admin/forwarder-sales` | ✅ working | `team_leaders` + `sales_commissions` | |
| `/admin/commissions` | 🟠 mixed | `commission_withdrawals` + `commission_accruals` + `profiles` | Pacred-original — works if commission accrual job runs |
| `/admin/commissions/[id]` | 🟠 mixed | Same | |
| `/admin/juristic-check` | 🟠 wrong-schema | `corporate` + `documents` (storage) + `member-docs` | Reads rebuilt corporate table |
| `/admin/migration/pcs-customers` | ✅ working | `pcs_legacy_customers_staging` | One-shot migration tool, U2-1 |

### Cargo / Forwarders / Warehouse

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/forwarders` | ✅ working | `tb_forwarder` + `tb_users` + `tb_corporate` | Wave 19 BUG#2 patched 2-block badge |
| `/admin/forwarders/[fNo]` | 🟠 partial wrong-schema | `forwarders` → falls back `tb_forwarder` | Click row → tries rebuilt first; if missing, reads `tb_forwarder` + `tb_users` for a minimal view. Fallback OK but UX is degraded for the 47K migrated rows |
| `/admin/forwarders/[fNo]/edit` | ✅ working | `tb_forwarder` + `tb_users` + `tb_forwarder_item` | Wave 14 (`d287992`) — dimension edits on legacy schema |
| `/admin/forwarders/new` | ✅ working | `tb_co` + `tb_settings` + `tb_users` + `tb_address` + `tb_address_main` | |
| `/admin/forwarders/bulk-search` | ✅ working | — | Search-tool surface |
| `/admin/forwarders/notes` | 🟠 wrong-schema | `forwarders` | List of forwarders with notes — empty on prod |
| `/admin/forwarders/combine-bill` | ⚠️ **COPY-ONLY** (ภูม example #1) | `tb_bill` + `tb_bill_item` ✅ | **Verbatim Bootstrap-4** with `.pcs-legacy` CSS scope (576 LOC). Reads are correct, but: (a) DataTables JS not loaded — checkboxes inert; (b) "สร้างบิลรวม" + delete + print all stubbed; (c) UI doesn't match Pacred Tailwind design system at all (looks foreign). |
| `/admin/forwarders/combine-bill/add` | ⚠️ copy-only | tb_* ✅ | Same pattern |
| `/admin/forwarders/container-cost-check` | 📦 stub | — | `อยู่ระหว่างพัฒนา` banner (waits for Sheets API) |
| `/admin/forwarders/warehouse-history` | ⚠️ **COPY-ONLY** (ภูม example #2) | `tb_forwarder_import2` + `tb_forwarder` + `tb_users` ✅ | **Verbatim Bootstrap-4** with `.pcs-legacy` CSS scope (1141 LOC). **Default filter = "today only"** — staff see empty page on slow days. URL `?historyTableAll=true` shows all. Same JS-deferred issues as combine-bill (relink modal stubbed, bulk-print form inert) |
| `/admin/forwarder-action` | ✅ working | `tb_forwarder` + `tb_header_order` | 9 audit queues, Wave 2 |
| `/admin/forwarder-check` | ✅ working | `tb_check_forwarder` + `tb_forwarder` + `tb_users` + `tb_forwarder_import2` + `tb_promotion` | Wave 16 P0-2 bulk-bill |
| `/admin/forwarder-import-warehouse` | ✅ working | — | Server-side redirect to `/admin/forwarders/warehouse-history` (Wave 16 P0-4) |
| `/admin/report-cnt` | ✅ working | `tb_forwarder` + `tb_cnt` + `tb_users` | Wave 16 P0-1 (per-container detail) — 1601 LOC |
| `/admin/report-cnt/[fNo]` | ✅ working | Same | Drill-down detail |
| `/admin/report-cnt/pay` | ✅ working | `tb_cnt` | Container payment ledger |
| `/admin/containers/[id]` (legacy) | 🟠 wrong-schema | `containers` | Rebuilt spine — tombstoned but route still exists |
| `/admin/containers/[id]/hs` | 🟠 wrong-schema | `containers` + `container_hs_lines` + `hs_codes` | Same |
| `/admin/cnt-hs` | ✅ working | `tb_cnt` + `tb_cnt_item` | Wave-something legacy port |
| `/admin/cnt-hs/[id]` | ✅ working | `tb_cnt` + `tb_cnt_item` + `tb_forwarder` + `tb_users` | |
| `/admin/cargothai` | ✅ working | `tb_tmp_forwarder_cargothai` + `tb_tmp_forwarder_item_cargothai` | CargoThai sync admin |
| `/admin/momo-lcl` | ✅ working | — | MOMO sack lookup form (action-driven) |
| `/admin/api-forwarder-momo` | ✅ working | — | Carrier hub |
| `/admin/api-forwarder-momo/manual` | ✅ working | `tb_*` | Wave 17 P1-1 |
| `/admin/api-forwarder-cn` | ✅ working | — | Carrier hub |
| `/admin/api-forwarder-cn/manual` | ✅ working | `tb_*` | Wave 17 P1-2 |
| `/admin/api-sheets-ctt` / `mk` / `mx` / `sang` | ✅ working | `tb_*` via carrier registry | Wave 17 P1-4 (quartet) |
| `/admin/carriers` | ✅ working | `carriers` | Pacred-original carrier registry |
| `/admin/cnt-hs` | ✅ working | tb_* | |

### Barcode / Driver / Logistics

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/barcode` | ✅ working | `tb_forwarder` counts | Hub |
| `/admin/barcode/driver` | ✅ working | `tb_forwarder` counts | |
| `/admin/barcode/driver/import` | ✅ working | `tb_forwarder` write (auto-flip fstatus=4) | Wave 17 P1-5 |
| `/admin/barcode/driver/{all,from,prepare}` | ⚠️ copy-only | `tb_*` ✅ | Verbatim Bootstrap-4 (faithful port) |
| `/admin/barcode/cargo/{all,from,import,prepare}` | ⚠️ copy-only | `tb_*` ✅ | Same |
| `/admin/barcode/gateway` | ⚠️ copy-only | `tb_forwarder` ✅ | Bootstrap markup |
| `/admin/drivers` | 🟠 wrong-schema | `forwarder_driver` | Driver list — empty on prod (rebuilt schema) |
| `/admin/drivers/[id]` | 🟠 wrong-schema | `forwarder_driver` | Same |
| `/admin/drivers/work` | 🟠 partial | `profiles` + `tb_forwarder_driver` + `tb_forwarder_driver_item` + `tb_forwarder` + `tb_users` | Mixed schema |
| `/admin/driver-runs` | 🟠 wrong-schema | `forwarder_driver` | Pacred-original |

### Wallet / Payments / Yuan

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/wallet` | ✅ working | `tb_wallet_hs` + `tb_wallet` | Wave 8 |
| `/admin/wallet/[id]` | ✅ working | `tb_wallet_hs` + `tb_users` + `tb_wallet` + `tb_cash_back` + `tb_wallet_paydeposit` | Wave 19 BUG #4 (type-aware) |
| `/admin/wallet/add` | ⚠️ copy-only | `tb_users` ✅ | Bootstrap markup |
| `/admin/wallet/deposit` | ✅ working | — | Server-action surface |
| `/admin/wallet/history` | ✅ working | — | |
| `/admin/wallet/pay-user` | ✅ working | — | |
| `/admin/withdrawals` | ✅ working | — | Server-side redirect to `/admin/wallet?kind=withdraw&status=pending` |
| `/admin/withdrawal/freight-th` | 📦 stub | — | "อยู่ระหว่างพัฒนา" banner |
| `/admin/yuan-payments` | ✅ working | `tb_payment` | |
| `/admin/yuan-payments/[id]` | ✅ working | `tb_payment` + `tb_users` | |
| `/admin/yuan-payments/new` | ⚠️ copy-only | `tb_users` + `tb_settings` ✅ | Bootstrap markup |
| `/admin/shop-payouts` | ✅ working | — | Sales payout (`sales_payouts`) — Pacred-native |

### Reports (the biggest 🟠 cluster)

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/reports` (hub) | 🟠 wrong-schema | `forwarders` + `service_orders` + `yuan_payments` + `sales_payouts` + `wallet_transactions` + 1× `tb_forwarder` | Hub stat cards ฿0 on prod |
| `/admin/reports/containers-awaiting-th` | ✅ working | `tb_forwarder` | |
| `/admin/reports/containers-hs` | 🟠 wrong-schema | `container_hs_lines` (rebuilt spine — empty) | |
| `/admin/reports/credit-pending` | 🟠 wrong-schema | `forwarders` + `wallet_transactions` | |
| `/admin/reports/debtors` | 🟠 wrong-schema | `wallet` | |
| `/admin/reports/forwarder` | ⚠️ copy-only + 🟠 mixed | `tb_forwarder` ✅ | Bootstrap markup but tb_* underneath |
| `/admin/reports/forwarder-profit` | (unread, likely 🟠) | — | |
| `/admin/reports/forwarder-volume` | ✅ working | `tb_forwarder` | |
| `/admin/reports/hs-code-revenue` | 🟠 wrong-schema | `container_hs_lines` (empty spine) | |
| `/admin/reports/monthly-orders` | 🟠 wrong-schema | `forwarders` + `service_orders` | |
| `/admin/reports/otp-success` | (unread) | — | |
| `/admin/reports/payment` | ⚠️ copy-only | `tb_payment` + `tb_users` ✅ | Bootstrap markup, tb_* OK |
| `/admin/reports/pending-payments` | 🟠 wrong-schema | `forwarders` | |
| `/admin/reports/refunds` | 🟠 wrong-schema | `wallet_transactions` | |
| `/admin/reports/sales-by-rep` | ⚠️ copy-only | `vw_sales_by_rep` ✅ | Wave 8 view (migration 0094) |
| `/admin/reports/sales-monthly` | (unread) | — | |
| `/admin/reports/shop` | ⚠️ copy-only | `tb_header_order` + `tb_order` + `tb_users` ✅ | Bootstrap markup, tb_* OK |
| `/admin/reports/shops-profit` | (unread) | — | |
| `/admin/reports/system` | ⚠️ copy-only | `tb_web_hs` + `tb_page_name` ✅ | Bootstrap markup |
| `/admin/reports/user-sales-history` | ⚠️ copy-only | `tb_users` + `tb_forwarder` + `tb_header_order` + `tb_payment` ✅ | Bootstrap markup |
| `/admin/reports/user-sales-history/[customer_id]` | ⚠️ copy-only | Same + `tb_wallet_hs` + `tb_wallet` ✅ | |
| `/admin/reports/yuan-profit` | (unread) | — | |

### Accounting

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/accounting` (hub) | 🟠 wrong-schema | `forwarders` + `yuan_payments` + `service_orders` + `wallet_transactions` + `profiles` | All stat cards ฿0 on prod |
| `/admin/accounting/cargo` | 📦 stub | — | 4× "อยู่ระหว่างพัฒนา" menu items |
| `/admin/accounting/freight` | 📦 stub | — | Same |
| `/admin/accounting/closing` | 🟠 wrong-schema | `forwarders` | |
| `/admin/accounting/container-costs` | ✅ working | `container_costs` (Pacred-original) | |
| `/admin/accounting/disbursements` | ✅ working | Pacred-native | |
| `/admin/accounting/forwarder` | ⚠️ copy-only | `tb_wallet_hs` + `tb_forwarder` + `tb_users` + `tb_corporate` + `tb_receipt_item` + `tb_cash_back_hs` ✅ | Bootstrap, tb_* OK |
| `/admin/accounting/forwarder-invoice` | ⚠️ copy-only | — | Bootstrap markup |
| `/admin/accounting/payment` | ⚠️ copy-only | `tb_wallet_hs` + `tb_payment` + `tb_users` ✅ | Bootstrap |
| `/admin/accounting/periods` | ✅ working | `accounting_periods` + `period_close_event` | Pacred-native |
| `/admin/accounting/periods/[period_yyyymm]` | ✅ working | Same | |
| `/admin/accounting/reconcile` | 🟠 wrong-schema | `forwarders` + `wallet_transactions` | |
| `/admin/accounting/shop` | ⚠️ copy-only | `tb_wallet_hs` + `tb_order` + `tb_header_order` + `tb_users` ✅ | Bootstrap |
| `/admin/accounting/withdraw` | ⚠️ copy-only | `tb_wallet_hs` + `tb_users` ✅ | Bootstrap |

### Service-orders (ฝากสั่งซื้อ)

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/service-orders` | 🟠 wrong-schema | `service_orders` | Empty on prod (use `tb_header_order`?) |
| `/admin/service-orders/[hNo]` | 🟠 wrong-schema | `service_orders` + `corporate` + `service_order_items` | |
| `/admin/service-orders/notes` | 🟠 wrong-schema | `service_orders` | |
| `/admin/service-orders/cart` | ⚠️ copy-only | `tb_admin` + `tb_settings` + `tb_cart` + `tb_co` ✅ | Bootstrap markup |
| `/admin/service-orders/cart/add` | ⚠️ copy-only | `tb_admin` ✅ | Bootstrap |

### QA queues (Wave 16 fixed — all tb_*)

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/qa` | ✅ working | — | Hub of 9 queues |
| `/admin/qa/chn-shop-over-2d` | ✅ working | `tb_header_order` + `tb_users` | |
| `/admin/qa/chn-wh-over-2d` | ✅ working | `tb_forwarder` + `tb_users` | |
| `/admin/qa/credit-overdue` | ✅ working | `tb_forwarder` + `tb_users` | |
| `/admin/qa/new-client-no-contact` | ✅ working | `tb_users` | |
| `/admin/qa/order-over-10min` | ✅ working | `tb_header_order` + `tb_users` | |
| `/admin/qa/ownerless-goods` | ✅ working | `tb_forwarder` | |
| `/admin/qa/pay-fwd-over-2d` | ✅ working | `tb_forwarder` + `tb_users` | |
| `/admin/qa/pay-shop-over-1d` | ✅ working | `tb_header_order` + `tb_users` | |
| `/admin/qa/prepare-overdue` | ✅ working | `tb_forwarder` + `tb_users` | |
| `/admin/qa/transit-overdue` | ✅ working | `tb_forwarder` + `tb_users` | |

### Freight (V2 ecosystem — Pacred-native, not legacy port)

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/freight/shipments` | 🟠 no-data | `freight_shipments` | Empty until freight team ramps; UI works |
| `/admin/freight/shipments/[id]` | 🟠 no-data | `freight_shipments` + `freight_parties` + `freight_invoices` + `freight_invoice_lines` + `freight_invoice_payments` + `profiles` + `withholding_tax_entries` + `customs_declarations` + `work_items` + `admin_audit_log` | |
| `/admin/freight/shipments/new` | 🟠 no-data | — | Form |
| `/admin/freight/quotes` | 🟠 no-data | `freight_quotes` | |
| `/admin/freight/quotes/[id]` | 🟠 no-data | `freight_quotes` + `freight_quote_items` + `admin_audit_log` | |
| `/admin/freight/quotes/new` | 🟠 no-data | — | Form |
| `/admin/freight/declarations` | 🟠 no-data | `customs_declarations` | |
| `/admin/freight/declarations/[id]` | 🟠 no-data | `customs_declarations` + `freight_shipments` + `profiles` + `customs_declaration_lines` + `admin_audit_log` | |
| `/admin/tax-invoices` | ✅ working | (read via action) | |
| `/admin/tax-invoices/[id]` | ✅ working | — | |
| `/admin/refunds` | ✅ working | — | |
| `/admin/refunds/[id]` | 🟠 partial | `forwarders` + `wallet_transactions` | Reads rebuilt tables for related |
| `/admin/refunds/new` | ✅ working | — | Form |

### Bookings (BK-1 booking flow — Pacred-native)

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/bookings` | 🟠 no-data | `bookings` | Empty if BK-1 not rolled out |
| `/admin/bookings/[bookingNo]` | 🟠 no-data | `bookings` + `booking_options` + `work_items` | |

### Settings / System / HR

| Route | Bucket | Schema | Notes |
|---|---|---|---|
| `/admin/settings` | ✅ working | — | |
| `/admin/settings/business-config` | ✅ working | — | |
| `/admin/settings/contacts` | ✅ working | — | |
| `/admin/settings/notifications` | 🟠 wrong-schema | `profiles` | Likely staff-side preferences — empty on prod |
| `/admin/settings/tos-versions` | ✅ working | — | |
| `/admin/system/crons` | ✅ working | `cron_invocations` | |
| `/admin/system/notifications` | 🟠 partial | `profiles` | Notification log; admin lookup by member_code breaks |
| `/admin/hr` | 🟠 wrong-schema | `admins` | But `admins` is populated (Pacred-native staff registry) — `tb_admin` is the legacy staff. Check intent. |
| `/admin/hr/humanresource` | ✅ working | tb_admin via action | |
| `/admin/hr/assets` | 📦 stub | — | 3× "อยู่ระหว่างพัฒนา" cards |
| `/admin/hr/attendance` | ✅ working | — | |
| `/admin/hr/attendance/leaves` | ✅ working | — | |
| `/admin/hr/audit` | ✅ working | `employee_audit_entries` + `admins` | |
| `/admin/hr/org-chart` | ✅ working | `org_branches` + `org_sections` + `org_positions` + `org_assignments` | |
| `/admin/hr/org-table` | ✅ working | — | |
| `/admin/hr/policies` | ✅ working | — | |
| `/admin/hr/recruitment` | ✅ working | — | |
| `/admin/hr/recruitment/[id]` | ✅ working | — | |
| `/admin/hr/recruitment/new` | ✅ working | — | |
| `/admin/hr/training` | ✅ working | `training_courses` + `training_enrollments` + `admins` | |
| `/admin/incidents` | ✅ working | `platform_incidents` | |
| `/admin/learning` (hub) | 📦 stub | — | Per-topic placeholders |
| `/admin/organization-email` | ⚠️ copy-only | `tb_organization_email` + `tb_org_email_ships` ✅ | Bootstrap markup |
| `/admin/audit` | 🟠 wrong-schema | `profiles` + `admin_audit_log` | Member-code lookup fails on legacy users |
| `/admin/search` | ✅ working | `profiles` + `forwarders` | (Wait — partly wrong-schema! Verify next session) |
| `/admin/broadcasts` | ✅ working | `broadcasts` + `notification_reads` | |
| `/admin/broadcasts/[id]` | ✅ working | Same | |
| `/admin/broadcasts/new` | ✅ working | — | |
| `/admin/csv-imports` | ✅ working | `csv_imports` | |
| `/admin/csv-imports/[id]` | ✅ working | `csv_imports` | |
| `/admin/csv-imports/upload` | ✅ working | (storage list) | |
| `/admin/rates` | ✅ working | — | Hub |
| `/admin/rates/general` | ✅ working | — | |
| `/admin/rates/vip` | ✅ working | `tb_rate_vip_*` | |
| `/admin/rates/custom-user` | ✅ working | `tb_*` | |
| `/admin/rates/custom-hs` | ⚠️ copy-only | `tb_*` ✅ | Bootstrap markup |
| `/admin/inventory` | ✅ working | — | Redirect to `/admin/barcode` |
| `/admin/warehouse/bulletin` | 📦 stub | — | Tombstone banner |
| `/admin/warehouse/containers` | 📦 stub | — | Tombstone redirect |
| `/admin/warehouse/qa-inspections` | ✅ working | `tb_forwarder` via action | |
| `/admin/warehouse/qa-inspections/[id]` | ✅ working | — | |
| `/admin/warehouse/qa-inspections/new` | ✅ working | — | |
| `/admin/inventory` | ✅ working | redirect | |
| `/admin/juristic-check` | 🟠 wrong-schema | `corporate` + storage `member-docs` | |

## Method

Static audit (no dev-server smoke; Bash + PowerShell network blocked in this sandbox):

1. **File enumeration** — recursive find for `page.tsx` under `app/[locale]/(admin)/admin/**` →
   175 files.
2. **Grep for stub markers** — `STUB`, `TODO`, `อยู่ระหว่างพัฒนา`, `ฟีเจอร์นี้ยัง`, `Coming soon`,
   `placeholder file`. Filtered out incidental `placeholder=` HTML attr matches.
3. **Grep for wrong-schema reads** — `.from("(forwarders|profiles|shipments|wallet_transactions|cargo_orders|service_orders|yuan_payments)")`.
   These rebuilt-era tables are EMPTY on prod (8,898 customers + 47K forwarders + 958 cnt are on
   `tb_*`).
4. **Grep for `pcs-legacy` CSS scope** — found 36 pages = ⚠️ COPY-ONLY (verbatim Bootstrap-4
   transcription per the faithful-port runbook §8). These violate AGENTS.md §0a (workflow vs UI).
5. **Read the 2 ภูม-flagged pages** (`combine-bill`, `warehouse-history`) in full to verify the
   copy-only classification and document the missing pieces.
6. **Spot-read ~20 other pages** for verification (hub pages, detail pages, redirects, stubs).
7. **No phase-2 curl smoke** — sandbox blocks `curl` and `Invoke-WebRequest`. Confidence is HIGH
   for ✅/🟠/📦 buckets based on static grep + reads; LOW for 🔴 (would need live HTTP). The 2 ภูม
   examples are confirmed ⚠️ not 🔴.

## Worked examples (the 2 ภูม flagged)

### /admin/forwarders/combine-bill

- **Bucket:** ⚠️ **COPY-ONLY** (faithful transcription, partially functional)
- **File:** `app/[locale]/(admin)/admin/forwarders/combine-bill/page.tsx` (576 LOC)
- **Schema:** ✅ correct — reads `tb_bill` + `tb_bill_item` (legacy combine-bill ledger)
- **Why it looks foreign:**
  - Wrapped in `<div className="pcs-legacy">` + loads `/legacy/pcs/admin/admin-base.css` +
    `/legacy/pcs/admin/combine-bill.css` (verbatim Bootstrap-4 + Modern-Admin chrome).
  - Uses BS4 utility classes (`card`, `card-content`, `card-body`, `content-header-left col-md-6`,
    `breadcrumb`, `btn btn-outline-success btn-rounded`, `table table-bordered table-striped
    dataTable no-footer dtr-inline`, etc.) instead of Pacred's Tailwind tokens.
  - Inline `<style>` chunks ported as separate CSS files under `/public/legacy/pcs/admin/`.
- **What's stubbed (deliberate per file header):**
  - "สร้างบิลรวม" CTA → links to `/admin/forwarders/combine-bill/add` which is ALSO copy-only +
    its Server Action handler is a follow-up.
  - Per-row "ลบรายการ" + "พิมพ์" buttons are in markup but their click handlers are deferred
    (the file calls `<CombineBillRowActions billId={…} printHref={…} />` — a client island).
  - DataTables JS init (sortable columns · checkboxes-multi-select · per-page length · fixed
    header) NOT ported — jQuery + DataTables not in the dependency tree.
  - daterangepicker NOT ported — date input is plain `<input type="text">`.
  - SweetAlert popups + AJAX delete confirm NOT ported.
  - mPDF `printBill.php` PDF NOT ported — print button is a placeholder route stub.
- **Recommended action (Wave 20 P1-1):** rewrite in Pacred Tailwind design system. Strip
  `pcs-legacy` scope + the 2 CSS files. Re-emit as a Pacred admin table (similar to
  `/admin/customers`, `/admin/wallet`). Keep all `tb_bill` + `tb_bill_item` reads intact. Wire
  Server Actions for create/delete/print. Add a real React date-range picker.
- **Est. effort:** 4-6h (UI rewrite + Server Action wiring + @react-pdf print sheet).

### /admin/forwarders/warehouse-history

- **Bucket:** ⚠️ **COPY-ONLY** (faithful transcription) + 🟠 **NO-DATA by default**
- **File:** `app/[locale]/(admin)/admin/forwarders/warehouse-history/page.tsx` (1141 LOC)
- **Schema:** ✅ correct — reads `tb_forwarder_import2` + `tb_forwarder` + `tb_users`
- **Why ภูม sees no data:**
  - **Default URL filter `mode='today'`** — only shows scans whose `fi2date` is in the today range
    (`<today>T00:00:00 .. T23:59:59`). On a day with no warehouse scans, the page renders an empty
    page with no rows. Staff don't know to click "ค้นหาข้อมูลทั้งหมด" (which sets
    `?historyTableAll=true`).
  - The bottom summary chips show 0/0/0 in this state.
- **Why it looks foreign (same as combine-bill):**
  - `pcs-legacy` CSS scope + verbatim Bootstrap-4 + `/legacy/pcs/admin/admin-base.css` +
    `/legacy/pcs/admin/warehouse-history.css`.
  - References external CDN icons via `https://pcscargo.co.th/member/assets/images/icon/forwarder/forwarder-N.png`
    (PCS-scrub-gated per CLAUDE.md / ADR-0017).
- **What's stubbed:**
  - "ค้นหาและเชื่อมรายการ" (relink orphan scan to forwarder) — markup-only; the AJAX modal +
    Server Action handler are deferred (calls `<WarehouseHistoryRelinkButton />`).
  - "ลบ" + bulk-print + dupe-warning all wired-but-stub.
  - Cover thumbnail uses `resolveLegacyUrlMap` Wave 13 (functional).
  - Top-menu badge counts (`countErrorF4`, `countWaiting`, …) NOT wired — labels show, badges
    don't (the file calls them out as a follow-up).
- **Recommended action (Wave 20 P1):**
  1. **Quick fix (15-30 min)** — change default to `mode='week'` (last 7 days) instead of "today".
     Solves the "no data" complaint without UI work. Add a "วันที่" date-range picker that
     defaults to last 7d. Add a count chip "พบ N รายการ" so empty-state is explicit.
  2. **Full rewrite (6-8h)** — port to Pacred Tailwind (orphan/matched dual-table on one page,
     status chip with the existing badge palette, real relink modal as a `<Dialog>`, wire
     deferred Server Actions). Same playbook as Wave 13/14 forwarder UI.
- **Est. effort:** 30 min for the quick fix (just bump the default range) + 6-8h for the full
  redesign.

## What this means for Wave 20 planning

1. **The "wrong-schema" cluster is the headline.** ~17 high-traffic pages still read the empty
   rebuilt tables. This is the same bug class that Wave 6 P0 fixed for `/admin` and Wave 18 fixed
   for `/admin/customers` list. Sequence: dashboard hub (customers/[id]) → reports hub + 5
   sub-reports → accounting hub → kpi → forwarders/[fNo] detail. Each is 3-6h. Total: **25-40h
   over 5-7 ports.**
2. **The "copy-only" cluster is the polish backlog.** 36 pages with `pcs-legacy` Bootstrap-4
   markup. They WORK (correct `tb_*` reads in 28 of 36), they just look foreign + have inert JS.
   Sequence by traffic: combine-bill + warehouse-history (ภูม flagged) → admins + admins/[id] →
   wallet/add + yuan-payments/new → reports/payment + reports/shop + reports/forwarder + the
   user-sales-history pair → service-orders/cart pair → barcode/{cargo,driver}/{all,from,prepare}
   (8 routes) → organization-email + cnt-hs + remaining tail. Effort: **2-4h each × 36 ≈ 80-100h**
   split across waves 20-23 in 8-12-page batches.
3. **Stubs are correctly bannered** per AGENTS.md §0a — `forwarders/container-cost-check`,
   `hr/assets`, `accounting/cargo` + `freight`, `learning` (with topics), `withdrawal/freight-th`,
   plus the 4 tombstones (`dashboard`, `inventory`, `withdrawals`, `forwarder-import-warehouse`,
   `warehouse/bulletin`, `warehouse/containers`). No action needed; track for Phase C.
4. **Freight + bookings are Pacred-native deferrals** — those reads (`freight_*`, `bookings`,
   `work_items`) point at real Pacred tables that are empty until those ecosystems launch. No
   "bug" to fix; just deferred Phase C content. **Defer entirely.**

## Time + token spend

- **Audit duration:** ~30 min (read + grep + classify · ~25 tool calls)
- **Tokens (rough):** ~300K input + ~25K output (the large reads dominated — `combine-bill`
  page.tsx + `warehouse-history` page.tsx + the 300-row grep dump = ~140K tokens together).
  Stayed under the cap by skipping per-page deep reads for the ~120 pages obviously classified by
  schema-grep alone.
- **No Bash / network used** (sandbox blocked) — phase 2 runtime smoke deferred. The static
  classification is high-confidence for ✅/🟠/📦; the 2 ภูม examples (⚠️) are confirmed by
  reading both files in full.
