# Legacy gap audit — adm-12-accounting (Admin · accounting)

**Lane:** `adm-12-accounting` · **Side:** admin · **Auditor:** เดฟ session 2026-05-30
**Legacy files:** `pcs-admin/{acc-forwarder,acc-payment,acc-topup,acc-withdraw,acc-shop,acc-shop-refund,acc-system-cargo,closingAccReportForwarder,pay-users,withdraw-commission-sale,withdraw-commission-interpreter}.php`
**Pacred target:** `(admin)/admin/accounting/*` + `(admin)/admin/reports/*` + `(admin)/admin/wallet/pay-user` + `actions/admin/*` + `lib/tax/*`

Source-of-truth read exhaustively at `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/`.

---

## Overview

### Legacy scope (what these PHP files actually do)

The legacy accounting lane splits into **three kinds** of surface:

1. **Read-only date-filtered reports** (the `acc-*.php` family) — each one is the SAME canonical template:
   - RBAC gate `departmentKey IN (CEO, Manager, QAAndQC, Accounting, ITDT)`.
   - A date filter (range picker `name=date` "YYYY-MM-DD - YYYY-MM-DD" OR a year+month dropdown via `generateYearDropdown(2021)` + `dateGroup`); **default = first→last day of THIS month**.
   - A pinned **totals row** prepended to the top of the table via DataTables `fnDrawCallback`.
   - DataTables export buttons: **copy / csv / excel / print**.
   - A per-row profit computation joined off `tb_wallet_hs` to the source table.
   - A "คำอธิบายระบบ" help modal (mostly empty except acc-forwarder which documents the cost/profit formula).
   - One role (`companyType==1 && department==2 && section==2` — a sales section staffer) is denied the totals row + export.
   - Members:
     - `acc-topup.php` → `tb_wallet_hs status='2' AND imagesSlip<>''` (completed top-ups), filter by `dateSlip`.
     - `acc-withdraw.php` → `tb_wallet_hs type=3 AND status=2` (direct-transfer withdrawals).
     - `acc-payment.php` → `tb_wallet_hs type=6` JOIN `tb_payment payStatus=2` (ฝากโอนหยวน completed) — profit = (payYuan·payRate) − (payYuan·payRateCost).
     - `acc-shop.php` → `tb_wallet_hs status=2` JOIN `tb_header_order` (ฝากสั่งซื้อ) + a `type=5` refund sub-query (`$arrReW`) so each row shows ลูกค้าจ่ายมา / คืนเงินลูกค้า / ราคาขาย / ต้นทุน / ค่าบริการ; profit suppressed when `hStatus=6` (cancelled).
     - `acc-forwarder.php` → `tb_wallet_hs type=4 AND status NOT IN ('1','3')` JOIN `tb_forwarder` + `tb_users` + `tb_corporate` + `tb_receipt_item` + `tb_cash_back_hs (cbhStatus=2)` (ฝากนำเข้า) — the richest report: cost = fCostTotalPrice+fTransportPrice+fShippingService+priceCrate+priceOther+fPriceUpdate+fTransportPriceCHNTHB; real price; discount; **1% หัก ณ ที่จ่าย for `fUserCompany=1`**; ลค จ่าย vs computed mismatch is flagged red; userType filter (1=ทั่วไป cp.userID IS NULL / 2=นิติบุคคล cp.userID IS NOT NULL).

2. **The `closingAccReportForwarder.php` month-end closing report** + **`acc-system-cargo.php` PEAK-style accounting dashboard**:
   - `closingAccReportForwarder.php` → router (home/add/detail); home is a **`tb_receipt` + `tb_receipt_item` + `tb_users` + `tb_corporate` receipt-centric** month report split by `userCompany` (juristic vs personal), counts per type. Read-only.
   - `acc-system-cargo.php` → a NEWER (2025) PEAK-clone accounting shell: a 65 KB cascading top-menubar (`header-menu/index.php`), a mostly-**stub** dashboard (home/income are empty card skeletons — chart placeholders, "สร้างใบแจ้งหนี้→ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ" dropdowns with empty hrefs, top-seller/debtor widgets with no queries). Only real leaf = `income/receipt-forwarder-item/home.php` (a `tb_receipt` issued-invoice report sliced by `corporateType` + `rStatus 1..4`).

3. **Two genuine WRITE workflows:**
   - **`pay-users.php` (1,140 LOC) — "จ่ายเงินแทนลูกค้า"** — admin pays on behalf of a customer. List view = `tb_wallet_hs WHERE adminIDCrate<>'' AND (type=2 OR type=4)`. `?action=add` → pick service (1=ฝากสั่งซื้อ / 2=ฝากนำเข้า) + customer (AJAX `getUserID`) → `getWallet` shows wallet+cashback → `getItem`/`getListPay`/`getListPayForwarder` list eligible orders (shop `hStatus='2'`; import `fStatus='5' OR fCredit=1`) → admin selects + confirms (QR/slip upload + `cashBackKey`). **POST `paymentOrder`** (shop): debit `tb_wallet`, insert `tb_wallet_hs type=2`, flip `tb_header_order.hStatus='3' + hDate3 + paydeposit=1`, insert `tb_wallet_paydeposit`, `lineNotifyShops`. **POST `paymentForwarderNew`** (import): SVIP (`tb_rate_custom_cbm`) / VIP (`coID<>'PCS'`) / Pro11.11 (`tb_promotion promoID=16`) / PCSMao (`fShipBy='PCSF' fTransportPrice=0` → +50) / corporate (≥1000 → 1% discount + `fUserCompany=1`) branches; three money paths (no wallet+top-up-slip / enough-wallet / insufficient-wallet+top-up); insert `tb_wallet_hs type=4`, flip `tb_forwarder.fStatus='6' + fDateStatus6 + paydeposit=1` (or clear `fCredit`), **auto-mint receipt** (`tb_receipt` + `tb_receipt_item` with FR-prefixed running rID), `lineNotifyForwarder`.
   - **`withdraw-commission-sale.php` + `withdraw-commission-interpreter.php`** — pay sales/interpreter commission. Router home/add/detail. `add` POST inserts a header (`tb_withdraw_comm_sale_h` / `tb_withdraw_comm_interpreter_h` — date, amount, status=1, adminIDCreate, bank cols from `tb_account_pcs`, title, commBefore, withholding) + item rows (`tb_withdraw_comm_sale_item (fID, wcsID)` / `tb_withdraw_comm_interpreter_item (hNo, diffYaun, wciID)`). `detail` POST `update` uploads a slip + flips `status 1→2`. WHT (`withholding`) captured at header.

### Pacred scope (what exists)

- **Faithfully ported acc-* reports → tb_*:** `/admin/accounting/{forwarder,payment,shop,withdraw}/page.tsx` each read the correct `tb_*` tables with the same JOINs, date filter, totals row, profit formula, CSV export. `forwarder/page.tsx` is **exemplary** (all 6 legacy JOINs incl. `tb_cash_back_hs cbhStatus=2` + `tb_corporate` + `tb_receipt_item`, the 1% WHT, the userType filter, the red-mismatch flag).
- **Accounting hub** `/admin/accounting/page.tsx` (Wave 20) — a 7-tab summary/forwarder/yuan/shop/topup/withdraw/refund dashboard reading `tb_forwarder`/`tb_payment`/`tb_header_order`/`tb_wallet_hs` correctly. (Beyond-legacy: revenue trend chart, pipeline cards — Phase-C-ish but harmless.)
- **Topup report:** no dedicated `/accounting/topup` route, but the hub's `topup` tab covers it (tb_wallet_hs type=1 status=2). acc-topup filtered on `dateSlip` not `date` — minor.
- **Forwarder-invoice (tax-invoice mint)** `/admin/accounting/forwarder-invoice/*` + `actions/admin/freight-invoice-payments.ts` — reads tb_forwarder + tb_receipt_item + tb_users (good).
- **`lib/tax/{wht,rates}.ts`** — WHT 1%/3% computation helpers (tested).
- **Rebuilt-table accounting surfaces (Phase-C-era, NOT legacy ports):** `/admin/accounting/{periods,reconcile,container-costs,disbursements}` + `actions/admin/{accounting-periods,payment-reconciliation,commissions,sales-payouts}.ts`.

### % complete

**~55%.** The acc-* report family (5 of the heaviest legacy reports) is ported well to tb_*. But the lane's single biggest WRITE workflow (`pay-users.php`, 1,140 LOC) is a **redirect stub**, the legacy commission-withdrawal workflow (`withdraw-commission-*`) has **no UI/action against its loaded `tb_withdraw_comm_*` tables** (Pacred built a parallel rebuilt-table commission system instead), the month-end `closing` page **dead-reads the empty rebuilt `forwarders` table** (legacy reads `tb_receipt`), and all five `/admin/reports/*-profit` pages **dead-read rebuilt tables**.

---

## Workflow-by-workflow gap table

| Legacy flow | Pacred equiv | status | flow-order-correct? | owner |
|---|---|---|---|---|
| `acc-topup.php` — completed top-up report (`tb_wallet_hs status=2 imagesSlip<>''`, by dateSlip) | `/admin/accounting?tab=topup` (tb_wallet_hs type=1 status=2) | 🟡 | mostly — filters on `date` not `dateSlip`; no dedicated route | ภูม |
| `acc-withdraw.php` — direct-transfer withdraw report (`type=3 status=2`) | `/admin/accounting/withdraw/page.tsx` (tb_wallet_hs) | ✅ | yes | ภูม |
| `acc-payment.php` — ฝากโอนหยวน report (`type=6` JOIN tb_payment payStatus=2, profit=yuan·(rate−cost)) | `/admin/accounting/payment/page.tsx` (tb_wallet_hs + tb_payment) | ✅ | yes | ภูม |
| `acc-shop.php` — ฝากสั่งซื้อ report (status=2 JOIN tb_header_order + type=5 refund subquery) | `/admin/accounting/shop/page.tsx` (tb_wallet_hs + tb_order + tb_header_order) | ✅ | yes — incl. reWallet refund column | ภูม |
| `acc-forwarder.php` — ฝากนำเข้า report (type=4 + 6 JOINs + 1% WHT + userType) | `/admin/accounting/forwarder/page.tsx` (all 6 tb_* JOINs) | ✅ | yes — exemplary 1:1 | ภูม |
| `acc-shop-refund.php` — shop refund report (the `acc-shop` refund column is its own report) | covered partially by hub `tab=refund` (tb_wallet_hs type=5) + acc-shop reWallet col | 🟡 | partial — no standalone refund-by-order report w/ totals | ภูม |
| `closingAccReportForwarder.php` — month-end **receipt** report (tb_receipt + tb_receipt_item, split juristic/personal) | `/admin/accounting/closing/page.tsx` | 💀 | **NO — dead-reads rebuilt `forwarders`/`profiles`/`corporate` (empty on prod) instead of tb_receipt; also keyed on forwarders not receipts** | ภูม |
| `acc-system-cargo.php` — PEAK accounting shell + top-menubar (mostly stub) | `/admin/accounting` hub + `PageTopMenubar` (CARGO_MENUBAR placeholders) + `/accounting/cargo/income/*` | 🟡 | shell present; income leaves = placeholders (matches legacy which was also stub) | ภูม |
| `acc-system-cargo` → `income/receipt-forwarder-item/home.php` — issued-invoice report (tb_receipt, by corporateType + rStatus) | `/accounting/cargo/income/[type]/[service]/[[...slug]]` (placeholder leaves) | ❌ | no — the one real acc-system leaf is unported | ภูม |
| **`pay-users.php` — "จ่ายเงินแทนลูกค้า" list + add-form + 2 POST writers (1,140 LOC)** | `/admin/wallet/pay-user/page.tsx` | 💀 | **NO — pure `redirect("/admin/wallet?kind=order_payment")` stub; entire admin pay-on-behalf workflow absent** | เดฟ |
| ↳ pay-users list (`tb_wallet_hs adminIDCrate<>'' type IN 2,4`) | — | ❌ | no | เดฟ |
| ↳ pay-users AJAX getUserID/getWallet/getItem/getListPay(Forwarder) | — | ❌ | no | เดฟ |
| ↳ POST `paymentOrder` (shop) — debit wallet, tb_wallet_hs type=2, hStatus='3' | — (customer-side `service-orders-tb.ts` debit exists but is not the admin pay-behalf path) | ❌ | no | เดฟ |
| ↳ POST `paymentForwarderNew` (import) — SVIP/VIP/Pro11/PCSMao/corporate, tb_wallet_hs type=4, fStatus='6', auto-receipt | — | ❌ | no | เดฟ |
| `withdraw-commission-sale.php` — sales-commission payout batch (tb_withdraw_comm_sale_h/_item + tb_account_pcs, slip→status 1→2) | `actions/admin/sales-payouts.ts` + `/admin/sales-payouts` | 💀 | **NO — Pacred built a parallel rebuilt `sales_payouts`/`sales_commissions` system; the loaded `tb_withdraw_comm_sale_*` legacy data has no UI/action** | ภูม |
| `withdraw-commission-interpreter.php` — interpreter-commission payout batch (tb_withdraw_comm_interpreter_h/_item, diffYaun, slip→1→2) | `actions/admin/commissions.ts` + `/admin/commissions` | 💀 | **NO — rebuilt `commission_tiers`/`commission_accruals`/`commission_withdrawals` paradigm; legacy `tb_withdraw_comm_interpreter_*` unused** | ภูม |
| `report-forwarder-profit.php` (companion) | `/admin/reports/forwarder-profit` ← `reports.ts getForwarderProfitReport` | 💀 | **NO — dead-reads rebuilt `forwarders` + `profiles`** | ภูม |
| `report-shops-profit.php` | `/admin/reports/shops-profit` ← `getShopsProfitReport` | 💀 | **NO — dead-reads rebuilt `service_orders` + `profiles`** | ภูม |
| `report-payments-profit.php` | `/admin/reports/yuan-profit` ← `getYuanProfitReport` | 💀 | **NO — dead-reads rebuilt `yuan_payments` + `profiles`** | ภูม |
| `report-sale.php` (monthly sales-by-rep) | `/admin/reports/sales-monthly` ← `getSalesMonthlyReport` | 💀 | **NO — dead-reads rebuilt `forwarders` + `profiles.sales_admin_id`** | ภูม |
| `report-otp-success.php` | `/admin/reports/otp-success` ← `getOtpSuccessReport` | 🟡 | reads `otp_codes` + `profiles` (rebuilt auth tables) — profiles empty for migrated users so likely thin | ภูม |
| (Pacred-original — no legacy) monthly period open/close | `/admin/accounting/periods` (accounting_periods, period_close_event) | ✅ | n/a — extra Phase-C feature | ภูม |
| (Pacred-original — no legacy) payment reconciliation | `/admin/accounting/reconcile` (dead-reads `forwarders`+`wallet_transactions`) | ❌ | n/a — extra feature but dead-reads rebuilt tables | ภูม |

Legend: ✅ faithful · 🟡 partial / minor divergence · ❌ missing · 💀 present-but-dead (dead-read/dead-write to empty rebuilt table, or stub) or wrong source-of-truth.

---

## Death-flows (P0 / P1 detailed)

### P0-1 💀 `pay-users.php` "จ่ายเงินแทนลูกค้า" is a redirect stub (DEATH — biggest write-gap in lane)

- **Legacy:** `pcs-admin/pay-users.php` (1,140 LOC) — the daily admin tool to take a customer's wallet payment for them (phone/LINE customers who can't self-serve). Two POST writers debit `tb_wallet`, write `tb_wallet_hs` (type=2 shop / type=4 import), flip order status (`hStatus='3'` / `fStatus='6'`), insert `tb_wallet_paydeposit`, auto-mint a `tb_receipt`, and LINE-notify. Handles SVIP/VIP/Pro11.11/PCSMao promo + corporate 1% + 3 wallet-funding paths.
- **Pacred:** `app/[locale]/(admin)/admin/wallet/pay-user/page.tsx` = `redirect("/admin/wallet?kind=order_payment")`. Its own header comment admits "The full PHP page is 1,140 lines… Until that ships, this stub redirects". The sidebar's wallet "จ่ายแทน" sub-item lands here.
- **Impact:** Admins **cannot pay on behalf of a customer at all** through Pacred. For the large phone/LINE customer base this is a primary fulfillment path — every such payment today would have to be hand-stitched via separate wallet-adjust + status-edit + receipt screens, with no atomicity and high error risk. The promo/corporate/cashback math (PCSMao +50, corporate 1% + `fUserCompany=1`, Pro11.11, cashBackKey spend) is entirely absent.
- **Owner:** เดฟ (cross-cutting: wallet ledger + order-status cascade + receipt mint + notify spine — architecture/integration). The two writers must target `tb_wallet` / `tb_wallet_hs` / `tb_header_order` / `tb_forwarder` / `tb_receipt` (NOT rebuilt tables).

### P0-2 💀 `/admin/accounting/closing` dead-reads rebuilt `forwarders` (empty on prod) + wrong source-of-truth

- **Legacy:** `closingAccReportForwarder.php` home reads **`tb_receipt` JOIN `tb_receipt_item` JOIN `tb_users` JOIN `tb_corporate`** — a *receipt*-centric month closing split by `userCompany` (juristic vs personal) with per-type counts. The closing is over **issued receipts**, not forwarder rows.
- **Pacred:** `closing/page.tsx` queries `.from("forwarders").eq("status","delivered")` + `profiles` + `corporate` — all rebuilt tables that are EMPTY on prod (the 8,898-customer import loaded `tb_forwarder`/`tb_receipt`, not `forwarders`/`profiles`). Result: the month-end closing report shows **zero rows on production**. Worse, even if pointed at tb_*, it keys off forwarders-delivered, not receipts, so it would still diverge from legacy's receipt-based closing.
- **Impact:** Finance's month-end revenue reconciliation + the juristic-customer tax-invoice cut list is blank. Silent — page renders fine, just empty.
- **Owner:** ภูม. Rewrite to read `tb_receipt` + `tb_receipt_item` + `tb_users` + `tb_corporate`, split by `userCompany`, matching legacy.

### P0-3 💀 All 5 `/admin/reports/*-profit` + sales-monthly dead-read rebuilt tables (`reports.ts`)

- **Legacy:** `report-forwarder-profit.php` / `report-shops-profit.php` / `report-payments-profit.php` / `report-sale.php` — order-by-order P&L + monthly sales-by-rep, reading `tb_forwarder` / `tb_header_order` / `tb_payment` / `tb_sales_report`.
- **Pacred:** `actions/admin/reports.ts` fetchers `getForwarderProfitReport` (`.from("forwarders")`), `getShopsProfitReport` (`.from("service_orders")`), `getYuanProfitReport` (`.from("yuan_payments")`), `getSalesMonthlyReport` (`.from("forwarders")` + `profiles.sales_admin_id`) — **every one reads a rebuilt table that is empty on prod.** Consumed by `/admin/reports/{forwarder-profit,shops-profit,yuan-profit,sales-monthly}/page.tsx`. The page headers even say "Source: forwarders…" — confirming the wrong target.
- **Impact:** All four profit dashboards render empty on production. The owner-facing profit/commission visibility is dead. (Note: the *accounting hub* tabs + the four `accounting/{forwarder,payment,shop,withdraw}` reports DO read tb_* correctly — so there are TWO parallel report families and only one works.)
- **Owner:** ภูม. Pivot `reports.ts` to the tb_* tables (mirror the field-map already proven in `accounting/forwarder/page.tsx`).

### P1-1 💀 Legacy commission-withdrawal workflow (`withdraw-commission-sale/interpreter`) has no UI against loaded `tb_withdraw_comm_*` tables

- **Legacy:** two near-identical batch-payout workflows. `add` creates a header (`tb_withdraw_comm_sale_h` / `tb_withdraw_comm_interpreter_h`) with bank details pulled from `tb_account_pcs`, `commBefore`, `withholding` (WHT), + item rows linking the source orders (`tb_withdraw_comm_sale_item.fID` / `tb_withdraw_comm_interpreter_item.hNo + diffYaun`). `detail` uploads a transfer slip and flips `status 1→2`.
- **Pacred:** built an entirely different paradigm — `commissions.ts` (`commission_tiers` + `commission_accruals` + `commission_withdrawals`, tier-based rate accrual) and `sales-payouts.ts` (`sales_payouts` + `sales_commissions`). These are Pacred-original (Phase-C-flavoured) systems. The legacy `tb_withdraw_comm_sale_*` / `tb_withdraw_comm_interpreter_*` tables WERE loaded by the migration (they appear only in `0081`/`0082` schema/index migrations) but have **zero UI or action reading/writing them**. So the historical commission-payout records + the legacy batch workflow staff knew are gone.
- **Impact:** Commission/interpreter-payout staff face a brand-new tool (zero-retraining violated) AND lose visibility of the legacy payout history. Marked P1 (not P0) because both flows are behind `phase: 2` sidebar gates ("not live to customers") — they are not in the launch-critical daily path, but they ARE a faithful-port gap the owner mandate covers.
- **Owner:** ภูม. Decision needed (ก๊อต/เดฟ): port legacy 1:1 onto `tb_withdraw_comm_*`, OR keep the rebuilt system + backfill-migrate the legacy rows into it. Faithful-first leans to the 1:1 port.

### P1-2 ❌ `acc-system-cargo` `income/receipt-forwarder-item` issued-invoice report unported

- **Legacy:** the one substantive leaf of the PEAK shell — a `tb_receipt` issued-invoice report sliced by `corporateType` (1/2) and `rStatus` (1..4), with `issueDate` date filter.
- **Pacred:** the `cargo/income/[type]/[service]/[[...slug]]` route renders placeholders only.
- **Impact:** Accounting can't list issued tax invoices by status/customer-type inside the cargo accounting shell. Lower urgency (the `forwarder-invoice` route covers single-invoice view/mint).
- **Owner:** ภูม.

### P1-3 ❌ `/admin/accounting/reconcile` dead-reads rebuilt `forwarders` + `wallet_transactions`

- Pacred-original (no legacy equivalent) reconciliation page, but it reads the empty rebuilt `forwarders` + `wallet_transactions` tables → blank on prod. Not a legacy gap, but a dead surface in the lane. Owner: ภูม (retarget to tb_* or hide until built).

---

## Flow-order divergences

1. **`closing` keys off forwarders-delivered, legacy keys off issued receipts.** Even after fixing the dead-read (P0-2), the *unit* of the month-end closing differs: legacy iterates `tb_receipt` rows (one receipt may bundle several forwarders via `tb_receipt_item`), Pacred iterates delivered forwarders. A forwarder delivered this month whose receipt was cut last month (or vice-versa) lands in a different period. Must follow legacy's `tb_receipt.rDate`-based bucketing.

2. **pay-users receipt-mint ordering.** Legacy mints the receipt **only after** the wallet debit + `fStatus='6'` flip all succeed for the batch (`if($sweetalert=='sPay')`), using a FR-prefixed running rID with a year-boundary rule (pre-2023 vs 2023+ numbering). Any Pacred port must keep: debit → status-flip → `tb_wallet_paydeposit` → notify → THEN receipt (not receipt-first), or receipts get minted for failed payments.

3. **acc-topup date axis.** Legacy `acc-topup.php` filters on `dateSlip` (the slip date the customer wrote), Pacred hub `tab=topup` filters on `date` (system-created). Minor, but a faithful topup report should expose the `dateSlip` axis.

4. **pay-users two-admin / status semantics.** Legacy `paymentForwarderNew` sets `fStatus='6'` (เตรียมส่ง) on payment — NOT '7'. (Confirms the audit warning: do not assume status codes — verified `'6'` + `fDateStatus6` here.) A port must use `'6'`.

---

## Modals / AJAX / cron / print inventory

**Legacy modals:**
- "คำอธิบายระบบ" (`#recom`) help modal on every acc-* report (empty body except acc-forwarder's cost/profit explainer).
- pay-users add-form: PromptPay QR modal (`#myModal`, ppID `0105560160694`), `#list-payment` confirm modal, `formPay()` confirm() guard before wallet debit.

**Legacy AJAX endpoints (pay-users add-form):**
- `include/pages/pay-users/getUserID.php` — POST `{coID}` → all `tb_users.userID` (select2 source).
- `getWallet.php` — POST `{userID}` → wallet + cashback balance HTML.
- `getItem.php` (36 KB) — POST `{userID,keyType}` → eligible-order list (shop `hStatus='2'` / import `fStatus='5' OR fCredit=1`) with full forwarder field set + driver-item + promotion joins.
- `getListPay.php` (19 KB) — shop confirm panel + PromptPay QR + slip dropzone (`name=imagesSlip`) + hidden `hNo,userID,amount` → submit `paymentOrder`.
- `getListPayForwarder.php` (33 KB) — import confirm panel + `cashBackKey` input + QR + slip → submit `paymentForwarderNew`.
→ **None ported** (the Pacred page is a stub).

**Legacy print/PDF:** all acc-* report `<form action=printReceipt.php>` + DataTables `print` button + per-row links to `printReceipt.php?id=rID`. Pacred replaces DataTables-print with CSV export (acceptable per master-fidelity "Google Sheets dependency dropped" precedent) but the row→receipt-PDF link must resolve to Pacred's receipt print route.

**Cron:** none in this lane (the acc-* reports are pull-on-demand; pay-users + commission are admin-initiated). No cron gap.

**Status enums touched:** `tb_wallet_hs.status` 1/2/3 (รอ/สำเร็จ/ไม่สำเร็จ); `tb_wallet_hs.type` 1=เติม 2=ชำระฝากสั่ง 3=ถอน 4=ชำระฝากนำเข้า 5=คืนเงิน 6=ฝากโอน 7=หักยอดเดิม; `tb_payment.payStatus` 2=สำเร็จ; `tb_header_order.hStatus` →'3' on pay; `tb_forwarder.fStatus`→'6' on pay; `tb_withdraw_comm_*_h.status` 1→2 on slip; `tb_receipt.rStatus` 1..4.

---

## Recommended fixes (ranked, with owner)

| # | Fix | Severity | Owner | Notes |
|---|---|---|---|---|
| 1 | Build `/admin/wallet/pay-user` (or `/admin/accounting/pay-user`) — port `pay-users.php` 1:1: list (tb_wallet_hs adminIDCrate type 2/4) + add-form (getUserID/getWallet/getItem AJAX equivalents) + both POST writers against `tb_wallet`/`tb_wallet_hs`/`tb_header_order`/`tb_forwarder`/`tb_receipt`/`tb_wallet_paydeposit`. Keep SVIP/VIP/Pro11.11/PCSMao/corporate-1% math + receipt-after-success ordering + `fStatus='6'`. | **P0** | เดฟ | biggest write-gap; cross-cutting wallet+status+receipt+notify spine |
| 2 | Rewrite `/admin/accounting/closing/page.tsx` to read `tb_receipt`+`tb_receipt_item`+`tb_users`+`tb_corporate`, split juristic/personal, bucket by `rDate`. | **P0** | ภูม | currently blank on prod (dead-reads rebuilt) |
| 3 | Pivot `actions/admin/reports.ts` (forwarder/shops/yuan profit + sales-monthly) from rebuilt → tb_* tables; mirror `accounting/forwarder/page.tsx` field-map. Or retire `/admin/reports/*-profit` in favour of the working `/accounting/*` reports. | **P0** | ภูม | 4 profit dashboards blank on prod |
| 4 | Decide + execute the commission-withdrawal path: port `withdraw-commission-sale/interpreter` 1:1 onto `tb_withdraw_comm_*` (+ `tb_account_pcs`), OR backfill legacy rows into the rebuilt `commission_*`/`sales_*` system. | **P1** | ภูม (decision: ก๊อต/เดฟ) | phase-2 gated; faithful-first prefers 1:1 |
| 5 | Add a standalone `acc-shop-refund` report (shop refunds by order with totals) + expose `dateSlip` axis on the topup report. | **P1** | ภูม | minor report-completeness |
| 6 | Port `acc-system-cargo` `income/receipt-forwarder-item` issued-invoice report (tb_receipt by corporateType + rStatus). | **P1** | ภูม | the one real acc-system leaf |
| 7 | Retarget or hide `/admin/accounting/reconcile` (dead-reads rebuilt `forwarders`+`wallet_transactions`). | **P2** | ภูม | Pacred-original, not legacy — but dead surface |
| 8 | Verify all acc-* report row→receipt links resolve to Pacred's receipt-print route (legacy → `printReceipt.php?id=rID`). | **P2** | ภูม | print handoff |

---

## Verified GOOD (no action — confirms/extends prior art)

- `/admin/accounting/forwarder/page.tsx` — **exemplary 1:1 port** of `acc-forwarder.php` (all 6 tb_* JOINs, 1% WHT, userType filter, red-mismatch flag, totals, CSV). Use as the template for fixes #2/#3.
- `/admin/accounting/{payment,shop,withdraw}/page.tsx` — faithful tb_* ports (payment: tb_payment profit; shop: tb_order/tb_header_order + reWallet refund column; withdraw: tb_wallet_hs type=3).
- `/admin/accounting/page.tsx` hub — reads tb_* correctly across all 7 tabs.
- `/admin/accounting/forwarder-invoice/*` + `freight-invoice-payments.ts` — reads tb_forwarder + tb_receipt_item + tb_users.
- `acc-system-cargo.php` dashboard home/income = mostly empty stubs in LEGACY too → Pacred's placeholder menubar is an acceptable match for the shell (only the `receipt-forwarder-item` leaf is a real miss, see #6).
