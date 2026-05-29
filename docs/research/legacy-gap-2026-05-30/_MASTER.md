# MASTER GAP — Pacred vs legacy PCS Cargo (2026-05-30)

> **Synthesis of 14 subsystem audits + 2 completeness critics.** Legacy = the spec (the owner's "ห้าม death" mandate). Every claim in §3's top-15 was independently re-verified against the live `dave-pacred` HEAD before ranking — see "Verification" notes inline.
>
> **Source of truth:** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/` (customer) + `member/pcs-admin/` (admin).
> **Compared against:** `/Users/dev/pacred-web` @ `dave-pacred`.
> **Sibling docs:** the 14 `cust-*` / `adm-*` lane files + `_CRITIC-customer.md` + `_CRITIC-admin.md` in this folder. This file dedupes + ranks + assigns; the lane files hold the per-flow evidence.

---

## 1. Executive summary

**The port is a Potemkin village in two senses.** On both the customer and admin side, the *read* surfaces are largely faithful and wired to the legacy `tb_*` tables where the 8,898 customers' real data lives — so a migrated user logs in and **sees** real orders, balances, containers, receipts. But a large fraction of the *write* surfaces (place order, pay, withdraw, approve a slip, price a quote, verify a juristic customer, run a cron) silently write to **rebuilt, empty tables** that no migrated data ever landed in. The action returns a green toast; zero real rows change. This is the dominant failure mode and it passes a route-200 smoke test, because the page renders and the list (reading `tb_*`) looks populated — the write only fails on submit, silently.

**Coverage estimate (weighted by workflow count, read+write):**

| Side | Approx. faithful coverage | Reading | Read-faithful, write-dead | Notes |
|---|---|---|---|---|
| **Customer portal** | **~55%** | mostly faithful | the whole money loop (cart→order→pay→withdraw), auth side-effects, addresses, commission | 7 lanes; weighted by `legacyFlowCount` |
| **Admin back-office** | **~58%** | ops lists + the `acc-*` report family faithful | wallet approval, juristic cluster, identity edit, 5-tab shop workflow, 5 profit reports, 3-of-3 crons in adm-14 | 7 lanes + the NEW adm-15 wallet lane the critic surfaced |

**Death-flows by severity (deduped across lanes):**

- **🔴 P0 — 23** (launch-blocking: money holes, security hole, dead write-paths on the revenue path)
- **🟠 P1 — 31** (workflow gaps staff currently work around with hand-SQL or by falling back to legacy PHP)

**The single biggest risk: the wallet/money loop never closes, across four lanes at once.** A customer can submit a yuan transfer paid from wallet and their balance never drops (double-spend — cust-04 P0-1); withdraw writes a rebuilt ledger so migrated customers see ฿0 withdrawable and admin never sees the request (cust-05 P0-1); admin approval of a top-up slip credits nothing (the NEW adm-15 / MS-1 cash-inflow hole); pay-from-wallet on a real shop order 0-row-fails (cust-02 P0-4). All four share one unmade decision: **is the canonical wallet ledger `tb_wallet`+`tb_wallet_hs` (legacy, where the balances are) or `wallet`+`wallet_transactions` (rebuilt, empty)?** Until เดฟ+ก๊อต make that call, no money-loop fix can be ordered — and any one of these is enough to lose real customer money on launch day. **This is the #1 gate.**

**Runner-up risk:** OTP is fully bypassed in production (`EMERGENCY_OTP_BYPASS = true` hardcoded, not env-gated — verified `actions/otp.ts:42`). Anyone can register or password-reset any phone with zero verification. Pure security hole, independent of the wallet question, fixable as soon as the SMS route is confirmed live.

---

## 2. Per-subsystem scorecard

| # | Lane | Side | %done | P0 | P1 | Top death-flow | Lane owner* |
|---|---|---|---|---|---|---|---|
| 1 | cust-01-auth | customer | 72% | 2 | 4 | OTP fully bypassed (`EMERGENCY_OTP_BYPASS=true`) | ก๊อต / เดฟ |
| 2 | cust-02-shop | customer | 20% | 5 | 3 | Customer cannot place/pay/cancel a real order (all write rebuilt) | เดฟ |
| 3 | cust-03-forwarder | customer | 78% | 0 | 5 | `getShipBy` carrier picker unwired on add form | เดฟ |
| 4 | cust-04-yuan | customer | 62% | 2 | 3 | Wallet-paid yuan never settles → balance never drops (double-spend) | เดฟ |
| 5 | cust-05-wallet | customer | 48% | 3 | 5 | Withdraw + history read/write rebuilt; migrated see ฿0 | เดฟ / ภูม |
| 6 | cust-06-misc | customer | 62% | 0 | 5 | Address edit/delete/set-main buttons inert; reverse-image search dead | เดฟ |
| 7 | cust-07-sales | customer | 48% | 2 | 3 | Commission split-brain; earn-trigger never fires | เดฟ / ภูม |
| 8 | adm-08-customers | admin | 62% | 3 | 2 | Edit-identity orphaned + juristic cluster writes rebuilt `corporate` | เดฟ |
| 9 | adm-09-forwarder-ops | admin | 82% | 5 | ~7 | List-bar status-flip + assign-driver silent dead-writes (task #41) | ภูม |
| 10 | adm-10-shop-ops | admin | 32% | 4 | 3 | 5-tab update workflow missing for 21,950 real orders (no quote 1→2) | ภูม |
| 11 | adm-11-yuan-ops | admin | 62% | 4 | 2 | Per-row approve form not built; bulk-approve hard-errors on UUID overflow | ภูม |
| 12 | adm-12-accounting | admin | 55% | 3 | 2 | `pay-users.php` pay-on-behalf is a redirect stub | เดฟ / ภูม |
| 13 | adm-13-reports | admin | 62% | 2 | 5 | 5 profit/rep/otp reports dead-read rebuilt tables (one stale `reports.ts`) | ภูม |
| 14 | adm-14-hr-settings-api | admin | 45% | 4 | ~6 | 3-of-3 lane crons dead-write rebuilt tables | ภูม / ก๊อต |
| **15** | **adm-15-wallet (NEW — critic-surfaced)** | admin | **~35%** | **1** | **1** | **Admin approves top-up slip → customer never credited (cash inflow hole)** | **เดฟ** |

\* "Lane owner" = the natural home for the *bulk* of the lane. The §6 work-split re-assigns each individual gap to exactly one owner per the owner's lane rules (a lane can have tasks for >1 owner — e.g. cust-05 has both เดฟ customer-backend and ภูม admin-approval tasks).

**Total: 23 P0 + 31 P1** after dedup (raw lane sum is higher; several P0s are the same architectural decision counted in multiple lanes — e.g. the wallet-SOT and the UUID-vs-legacy detail-page pattern).

---

## 3. The master death-flow list (deduped, ranked)

Sorted by **severity → revenue/money impact → blast-radius**. "FO?" = does this also reorder the legacy step sequence (the owner's specific concern; see §4). Each row's claim was checked against live code where marked ✓verified.

### 🔴 P0 — launch-blocking

| # | Death-flow | Legacy source | Pacred target | Why it's dead | FO? | OWNER |
|---|---|---|---|---|---|---|
| **P0-1** | **WALLET SOT decision** (the gate for P0-2,3,4,5,9) — legacy ledger is `tb_wallet`/`tb_wallet_hs`; rebuilt `wallet`/`wallet_transactions` is empty on prod. Every money fix below depends on this one call. | `tb_wallet` + `tb_wallet_hs` (8,898 balances) | `wallet`/`wallet_transactions` (rebuilt, empty) | Not a code bug — an unmade architecture decision blocking all money-loop fixes | n/a | **เดฟ + ก๊อต** |
| **P0-2** | **Yuan wallet-paid debit never settles → double-spend.** ✓verified `createYuanPayment` writes a *pending* `wallet_transactions` row; the 0007 trigger sums only `completed`; no approve path flips it → balance never drops after สำเร็จ. | `payment.php` L51-69 (synchronous `tb_wallet.wallettotal` debit on submit) | `actions/payment.ts` L400-421 + `actions/admin/tb-bulk.ts` L295-333 | Customer pays from wallet, transfer succeeds, displayed balance unchanged — can re-spend the same THB | ✓ | **เดฟ** |
| **P0-3** | **Customer cannot PLACE an order** — live nav → `placeServiceOrder` ✓writes empty `service_orders`; the faithful `submitCartOrder`→`tb_header_order` (cart.ts L228) is orphaned (nothing links to `/cart`). | `shops.php` addOrder L4-159 | `actions/service-order.ts` placeServiceOrder + `/service-order/cart` | New orders invisible to admin AND to the customer's own list (both read `tb_header_order`) | ✓ | **เดฟ** |
| **P0-4** | **Split-brain cart** — every customer add-to-cart writes `cart_items`; the faithful `/cart` reads `tb_cart`; the only `tb_cart` INSERT is admin-on-behalf. | `cart.php` + `include/pages/cart/*` | `actions/cart.ts` addCartItem (writes `cart_items`) | Customer adds an item, faithful cart shows empty; the two carts never reconcile | — | **เดฟ** |
| **P0-5** | **Customer cannot CANCEL a real order + wrong status value.** `cancelServiceOrder` `UPDATE service_orders SET status='cancelled'` → 0 rows. Legacy = `tb_header_order.hStatus='6'` (one-char, **NOT** 'cancelled' and **NOT** '99'), guard `hStatus<3`. | `cancelOrder.php` | `actions/service-order.ts` cancelServiceOrder | Wrong table + wrong value + missing guard; silent no-op, UI shows success | ✓ | **เดฟ** |
| **P0-6** | **Pay-from-wallet on a real shop order 0-row-fails** + debits rebuilt wallet. `payServiceOrderFromWallet` SELECTs `service_orders` (empty) → not_found for every migrated order. | `shops.php` update2 wallet guard L919 | `actions/service-order.ts` payServiceOrderFromWallet | Self-pay completely broken on real orders; compounds the rebuilt-wallet leak | ✓ | **เดฟ** (pay leg depends on P0-1) |
| **P0-7** | **Customer WITHDRAW writes rebuilt `wallet_transactions`** + checks rebuilt `wallet.balance`. ✓verified migrated customers have balance in `tb_wallet.walletTotal`, ฿0 in rebuilt → withdraw page shows ฿0; request never hits `tb_wallet_hs`; admin queue never sees it. | `wallet.php?page=withdraw` + `load_wallet_hs_withdraw.php` | `actions/wallet.ts` createWithdraw | Migrated customers can't withdraw; any request that goes through is invisible to admin | ✓ | **เดฟ** |
| **P0-8** | **`/wallet/history` reads rebuilt tables → contradicts `/wallet`.** Migrated customer sees real balance+ledger on `/wallet` (tb_*) but ฿0 + empty on `/wallet/history` (rebuilt). The `/wallet` breadcrumb links straight to the dead page. | `wallet.php` history tabs + `load_wallet_hs.php` | `app/.../wallet/history/page.tsx` | Two pages in the same portal show contradictory balances | ✓ | **เดฟ** |
| **P0-9** | **MS-1 / adm-15 — Admin approves a top-up slip → customer never credited (cash INFLOW hole).** ✓verified `/admin/wallet` slip-review-modal + actions-cell + bulk-approve-bar all call `adminUpdateWalletTransaction`/`adminBulkApproveDeposits` (actions/admin/wallet.ts) writing empty `wallet_transactions` by UUID. The faithful twin `wallet-hs.ts` writes `tb_wallet_hs`+`tb_wallet` but the detail `[id]/edit-form` imports the dead one. | `wallet.php?page=deposit` (slip approval) | `actions/admin/wallet.ts` adminUpdateWalletTransaction/adminBulkApproveDeposits | Reads `tb_wallet_hs` so the pending-slip list looks real; approve writes 0 real rows — money paid in is never credited | — | **เดฟ** |
| **P0-10** | **Yuan bulk-approve writes 36-char UUID into `tb_payment.adminid varchar(10)`.** ✓verified `tb-bulk.ts` L318 uses raw `adminId` (the wallet path L155 correctly uses `resolveLegacyAdminId()` — the yuan path skips it) → Postgres 22001, whole batch fails. This is the *only* working yuan approve path today. | `payment.php` approve UPDATE | `actions/admin/tb-bulk.ts` L318 adminBulkApproveYuanPaymentsTb | One-line fix (`resolveLegacyAdminId()`), but currently hard-errors every bulk approve | — | **ภูม** |
| **P0-11** | **Yuan per-row approve/reject form not built** — `[id]/page.tsx` is read-only ("Wave 7 read-only · approve/reject → Wave 8"); `YuanPaymentActions` mounted nowhere. Combined with P0-10 = staff cannot approve a single ฝากโอน row from Pacred at all. | `payment.php` L607-911 (update mode) | `/admin/yuan-payments/[id]` + actions-cell.tsx | The action `adminUpdateYuanPayment` is correct (writes tb_payment) but has no UI surface to invoke it | ✓ | **ภูม** |
| **P0-12** | **Yuan manual-create inserts `paystatus='2'` (self-approve, SOD bypass) + no customer notify.** Legacy inserts pending (`'1'`) awaiting a 2nd admin + fires 2 `sendLine`. (NB the wallet-debit hole here is already CLOSED by Tier-A1.) | `payment.php` L34-95 add handler | `actions/admin/yuan-payments-tb.ts` L202 | One admin can create+approve in one click; customer never told | ✓ | **ภูม** |
| **P0-13** | **5-tab admin shop UPDATE workflow missing for 21,950 orders** — on the legacy-view path (where all real orders render) there is NO quote handler (1→2, prices `hTotalPriceUser`, sets `hDatePayment`) and NO ordered handler (3→4, records `cShippingNumber`). The forward state machine is unreachable; new orders can never be priced/billed. | `shops.php` L916-1185 (update2/update3) + `update/update{1,3,4,5}.php` | `/admin/service-orders/[hNo]/*` + `actions/admin/service-orders.ts` | The middle of the revenue state machine is absent — biggest single admin build | ✓ | **ภูม** |
| **P0-14** | **Status-flip/cancel/saveNote form unreachable on real orders** — `AdminServiceOrderUpdateForm` ✓writes `tb_header_order` correctly (cancel→'6' verified) but `page.tsx` renders it ONLY on the rebuilt path; real orders fall to `legacy-view.tsx` which doesn't render it. ✓verified legacy-view is not a consumer. | `cancelOrder.php` (hStatus=6) + `shops.php` saveNote | `/admin/service-orders/[hNo]/legacy-view.tsx` | Working action wired to a UI the 21,950 orders never see — ~1h to render the form in legacy-view | — | **ภูม** |
| **P0-15** | **Admin print receipt/invoice points at the user-pinned CUSTOMER route** — `/service-order/print` is `requireAuth()` filtered to the caller's `member_code`; admin clicking print on any customer row gets `notFound()`. No `/admin/service-orders/print` exists. | `printShop.php` (381 LOC) | NEW `/admin/service-orders/print` (admin auth, no userid pin) | Staff have zero way to print a shop invoice/receipt for migrated orders | — | **เดฟ** |
| **P0-16** | **Per-item refund (`repayItem`/shopping-return) entirely unported** — partial-qty split of `tb_order`, INSERT `tb_wallet_hs` type=5, credit `tb_wallet`, recompute totals. China shops short/cancel items daily → customers owed wallet credit; staff hand-craft money-moving SQL. | `repayItem.php` (153 LOC) + `shopping-return.php` | NEW `actions/admin/service-orders-refund.ts` | Money-correctness hole; no UI path at all | — | **ภูม** |
| **P0-17** | **Edit customer identity orphaned + dead-write.** ✓verified `customers.ts:editCustomer` writes empty `profiles` by UUID AND is imported nowhere; the live detail page edits only note/rep/corporate/address. No `tb_users` identity editor exists. | `users.php` update POST L30-128 + `editUser.php` | `actions/admin/customers.ts:editCustomer` (dead) → NEW `adminUpdateUserIdentity` on `tb_users` | Admin physically cannot correct any of the 8,898 customers' name/phone/email/birthday | ✓ | **เดฟ** |
| **P0-18** | **Juristic verify/reject + DBD-compare + convert write rebuilt `corporate` by UUID.** ✓verified `/admin/juristic-check` reads `.from('corporate')`. The 8,898 migrated juristic customers (data in `tb_corporate`) are invisible in the queue and unverifiable. Correct pattern already exists (`adminUpdateCorporate` writes `tb_corporate` by userid). | `check-juristic.php` + `compare.php` + `users.php` editCompStatus | `actions/admin/customers.ts` {verifyJuristic,rejectJuristic,lookupDbdJuristic,adminConvertToJuristic} | Tax-invoice eligibility gate; migrated juristic customers cannot be verified | ✓ | **เดฟ** |
| **P0-19** | **`pay-users.php` pay-on-behalf is a redirect stub** — the 1,140-LOC daily tool to take a phone/LINE customer's wallet payment (debit `tb_wallet`, `tb_wallet_hs` type 2/4, flip `hStatus='3'`/`fStatus='6'`, mint `tb_receipt`, SVIP/VIP/corporate-1% math). Pacred page = `redirect('/admin/wallet?kind=order_payment')` (which itself lands in the dead wallet family). | `pay-users.php` + 5 AJAX includes | `/admin/wallet/pay-user/page.tsx` (stub) | Admins cannot pay on behalf of a customer at all — a daily staff action | ✓ | **เดฟ** (shares MS-1 wallet spine) |
| **P0-20** | **5 profit/rep/otp reports dead-read rebuilt tables** (one stale `reports.ts`) — `getForwarderProfitReport`/`getShopsProfitReport`/`getYuanProfitReport`/`getSalesMonthlyReport`/`getOtpSuccessReport` ✓read `forwarders`/`service_orders`/`yuan_payments`/`profiles`/`otp_codes`. Pages render (pass route-200) but show ฿0 / 0 rows vs 21,950 real orders. Field-map proven in the hub Wave-20 swap. | `report-{forwarder,shops,payments}-profit.php` / `report-sale.php` / `report-otp-success.php` | `actions/admin/reports.ts` → `/admin/reports/{forwarder-profit,shops-profit,yuan-profit,sales-monthly,otp-success}` | All profit/rep dashboards blank on prod; accounting + management see ฿0 | ✓ | **ภูม** |
| **P0-21** | **`/admin/accounting/closing` dead-reads `forwarders`** (empty) — keys off forwarders-delivered, not issued `tb_receipt`. Month-end revenue recon + juristic tax-invoice cut list renders blank. | `closingAccReportForwarder.php` | `/admin/accounting/closing/page.tsx` | Month-end close blank; even if pointed at tb_*, the key is wrong (delivery date vs receipt date) | ✓ | **ภูม** |
| **P0-22** | **3-of-3 adm-14 crons are dead-writes** — `refresh-active-customers` (writes `profiles.is_active`, reads rebuilt; `tb_users.userActive` never flips for 8,898), `sales-daily-digest` (reads empty `wallet_transactions` → always ฿0), `expire-probation` (reads `admin_contact_extras`, interns on `tb_admin` never auto-suspend). Run daily doing nothing. | `update-active-customers` / `send-line-sales` / `check-apprentice` | `app/api/cron/{refresh-active-customers,sales-daily-digest,expire-probation}/route.ts` | `userActive` drives every active-customer filter/report/segment → all silently wrong; cheapest correctness-per-minute (~2-3h all together) | partial | **ภูม** |
| **P0-23** | **Commission feature non-functional E2E** — Path A `/sales/*` reads real `tb_user_sales` but has ZERO write; Path B `/commissions`+`sales_commissions`/`sales_payouts` is full CRUD but ✓verified never backfilled from `tb_user_sales` (no `INSERT…SELECT FROM tb_user_sales` in any migration). 4 partner agents can't see/withdraw commission. | `report-user-sales*.php` | `actions/commissions.ts` + `/sales` + `/commissions` + `sales-payouts.ts` | Affiliate revenue-share wholly dead; needs an architecture pick (recommend Path A faithful) | ✓ | **เดฟ** (architecture) + **ภูม** (earn-trigger) |

### 🟠 P1 — workflow gaps (staff currently work around / fall back to legacy)

| # | Death-flow | Legacy source | Pacred target | Why | FO? | OWNER |
|---|---|---|---|---|---|---|
| P1-1 | adm-09 list-bar `bulkUpdateStatus` silent dead-write (status-flip → empty `forwarders`); faithful `adminBulkUpdateForwarderTbStatus` exists — repoint + swap enum to numeric. **= open task #41.** | `forwarder.php` bulk dropdown | `forwarders-bulk.ts::bulkUpdateStatus` + bulk-actions-toolbar.tsx | Green toast, zero `tb_forwarder` rows change | — | ภูม |
| P1-2 | adm-09 list-bar `bulkAssignDriver` dead-write + wrong model — inserts rebuilt `forwarder_driver`, never the legacy batch `tb_forwarder_driver`+`_item`. **= open task #41.** | `forwarder-driver.php?page=add` | `forwarders-bulk.ts::bulkAssignDriver` | On real data every row fails 'ไม่พบรายการ'; the batch shape is wrong too | ✓ | ภูม |
| P1-3 | adm-09 `[fNo]` detail editor dead on every real row — full edit/driver/cost/bill panels render only on the rebuilt-UUID branch; real rows get near-read-only. Architectural: make legacy-id canonical. **Same bug as adm-10 P0-14 (UUID-vs-legacy dual-mode).** | `forwarder.php?page=detail` | `[fNo]/page.tsx` + update/driver/cost panels | Staff cannot run the mega-edit on real forwarders | ✓ | เดฟ |
| P1-4 | adm-09 driver-expiry cron writes rebuilt `forwarder_driver` — legacy auto-expiry (17/24/30h) effectively never runs; stale batches accumulate. **= open task (sibling of P0-22).** | `forwarder-driver.php` L4-17 | `expire-driver-assignments/route.ts` | Smallest highest-leverage (~20min): swap table + columns | — | ภูม |
| P1-5 | adm-09 `tb_user_sales` agent-commission not inserted on `fStatus=7` delivery (4 hardcoded agent codes). Pacred has the affiliate map only at signup. **Confirms cust-07 P0-23 earn-trigger.** | `forwarder-driver/takePhoto.php` + `forwarder.php?page=update` | `driver-work.ts` deliver + `adminBulkUpdateForwarderTbStatus` | 4 partner agents lose commission visibility per delivery | — | ภูม |
| P1-6 | adm-09 single-container manual cnt-payment with slip image missing (`adminCreateCntPayment` is bulk-only, writes `cntImagesSlip:''`). | `report-cnt.php?id=` POST add L741-810 | `/admin/report-cnt/[fNo]` + cnt-payment.ts | No entry point to pay a single carrier invoice with a bank slip | — | ภูม |
| P1-7 | adm-09 per-row bill-to-customer (4→5) from the container drill-down missing (`update_forwarder_to5`). | `report-cnt.php` L835-911 | `report-cnt-detail.ts` (missing handler) | "Looking at this container, bill this one customer" requires leaving the screen | ✓ | ภูม |
| P1-8 | adm-09 `printAll` scan-to-print + gateway `type=6` driver preview missing — breaks the scan→print-label single motion. | `printAll.php` (969 LOC) + `gateway.php` type=6/from | `barcode/gateway/page.tsx` + NEW `/admin/printAll` | Warehouse double-scan loop broken; brand decision (PCS vs Pacred) needed first | ✓ | ภูม |
| P1-9 | adm-09 `saveNote` pushes nothing on note-only save + note text never pushed even on status change. | `forwarder.php?page=detail` saveNote | `[fNo]/tb-action-panel.tsx` + forwarders.ts | Customer/admin notes invisible in Pacred | — | ภูม |
| P1-10 | adm-10 Tab-4 spawn lacks 4→5 auto-flip + `tb_promotion` carry + 4-channel notify — orders stuck at 4 forever, completed-tab under-counts, promo customers lose downstream discount. **Verify with cust-02 P1 (auto-spawn `tb_forwarder`).** | `shops.php` L1514-1580 | `service-orders-spawn.ts` | Customer never told order completed; promo lost | ✓ | ภูม |
| P1-11 | adm-10 status-change notify single-channel (legacy = Email+SMS+LINE-Notify+LINE-OA); mark-paid fires none. The SMS payment-link drove payment in legacy. | `shops.php` L994-1065 / L1139-1183 | `service-orders-tb.ts` + service-orders.ts | Customers without LINE-OA bind silently miss billing prompts | — | ภูม |
| P1-12 | adm-10 13 header-edit handlers + IP-operator reassign + per-item/hard delete all missing (change address / switch to sea / pay-on-delivery / crate / reassign interpreter). | `shops.php` L1186-1362, L1793-1850 + editIPC/deleteItem/deleteOrder | `/admin/service-orders/[hNo]/*` | Daily ops asks all go to hand-SQL | — | ภูม |
| P1-13 | adm-11 refund-with-slip modal + `adminMarkYuanPaymentRefunded` write empty `yuan_payments` AND mounted nowhere — dead Phase-C code. | `payment.php` L658-688 (reject=refund) | yuan-payments/refund-modal.tsx + yuan-payments.ts | Slip-required refund unreachable + would no-op on tb_payment | — | ภูม |
| P1-14 | adm-11 two-wallet-ledger split — customer yuan debit → `wallet_transactions`, admin refund credit → `tb_wallet`/`tb_wallet_hs`. **Subsumed by P0-1 wallet SOT.** | `payment.php` L666-682 | payment.ts vs yuan-payments.ts refund | Balance integrity depends on which ledger the dashboard reads | — | เดฟ |
| P1-15 | cust-01 `adminIDSale` round-robin moved register-time→approval-time + different algorithm — new customers have no sales rep at signup, breaking 'ทีมเซลล์จะโทรหา'. | `check-otp-register.php` L60-95 | `actions/admin/customers.ts` approveCustomer | Sales expects every lead to already carry a rep | ✓ | เดฟ |
| P1-16 | cust-01 register inversion — `tb_wallet`+`tb_cash_back` not seeded + juristic data dead-writes to rebuilt `corporate` not `tb_corporate`. **= the auth-side root of the dead-write pattern.** | `check-otp-register.php` L97-120 | `actions/auth.ts` + `legacy-bridge-tb-users.ts` | Native signups are functional orphans in the tb_* data plane | ✓ | เดฟ |
| P1-17 | cust-01 `userActive` `''` (legacy) vs `'0'` (Pacred) splits the pending-approval queue between migrated and native customers. | `usersActive.php` (WHERE userActive='') | `legacy-bridge-tb-users.ts:175` + pending filter | Whichever value the queue filters on misses the other half | ✓ | ภูม |
| P1-18 | cust-03 `getShipBy` carrier picker unwired on add form (`#selectShipBy` is a TODO) + `checkFreeArea` ZIP-validation unported. | `getShipBy.php` + `checkFreeArea.php` | `service-import/add/page.tsx` + forwarder-legacy.ts | Customer creates a forwarder with no carrier selected — core add flow broken | ✓ | เดฟ |
| P1-19 | cust-03 no customer self-delete/cancel forwarder (`fStatus=1 AND refOrder='' AND userID=self`). | `deleteForwarder.php` | forwarder.ts/forwarder-legacy.ts (none) | Mis-created rows can't be removed → support burden | — | เดฟ |
| P1-20 | cust-03 rebuilt-table dead-write cluster (`payForwarderFromWallet`/`listForwarders`/`getForwarderByNo`/`createForwarder`) + dead `/pending` view + orphan add-form. `payForwarderFromWallet` also implements a pay method legacy explicitly DISABLED — flag for removal. | n/a (legacy disabled it) | forwarder.ts + pending/page.tsx | Silent landmines on empty tables; not user-visible yet | ✓ | เดฟ |
| P1-21 | cust-03 affiliate/sales-agent commission withdrawal missing (`report-user-sales`: 1% −3% WHT, min 1,000, ID-card PDF). **Same family as cust-07.** | `report-user-sales/getListForwarder.php` | `/report-user-sales` (none) | Affects THADA/SIN/OOAEOM/SWAN agents | — | เดฟ |
| P1-22 | cust-04 QRPay shortfall PromptPay flow missing on yuan create (pay the wallet difference, then proceed). Reused by the shop lane — port once as a shared component. | `QRPay.php` (full file) | yuan-payment-form.tsx | The "pay the difference then proceed" step order is gone | ✓ | เดฟ |
| P1-23 | cust-04 never-paid + juristic gates enforced only on the list, not on `/service-payment/add` or in `createYuanPayment` — a blocked customer can navigate to /add and submit. | `payment.php` L256-280 | `/service-payment/add` + createYuanPayment | Gate bypass | ✓ | เดฟ |
| P1-24 | cust-04 / cust-07 no admin-group LINE notification on customer create (legacy pings staff so they verify promptly). **Pattern: notify fan-out narrowed.** | `payment.php` L63-65 | createYuanPayment L425-433 | Verification latency up; staff get no ping | — | เดฟ |
| P1-25 | cust-05 admin reject does NOT refund (withdraw type-3 refund + type-7 cascade missing) + type-enum inverted (Pacred treats type-7=withdraw, legacy type-3=withdraw). `wallet-hs.ts` inserts admin-manual withdraw as type='7' → wrong history tab. **Becomes P0 once P0-7 lands.** | `wallet.php?page=deposit/withdraw` | wallet-trans.ts + tb-bulk.ts + wallet-hs.ts | A held withdraw can neither be paid nor refunded | ✓ | ภูม |
| P1-26 | cust-05 admin WITHDRAW approve/reject queue missing (no debit-hold/refund engine). Pairs with P0-7. | `wallet.php?page=withdraw` L744-844 | wallet-trans.ts (none) + `/admin/wallet/[id]` | No path to pay or refund a withdraw | ✓ | ภูม |
| P1-27 | cust-05 `tb_wallet_paydeposit` batch-settle (1 slip → N pending orders) entirely missing — no app code writes it. | `getListPay.php` + wallet.php deposit cascade | none | Multi-order batch payment cannot be reproduced | ✓ | ภูม |
| P1-28 | cust-05 affiliate SHOP WALLET 100% rebuilt (`tb_wallet_shop`/`tb_shop_transactions` keyed by profile_id); legacy `tb_wallet_shop_hs` not even in the 0081 schema. **Needs owner confirm it was live in prod — if never live, P2 Phase-C.** | `wallet-shop/load_wallet_hs*.php` | affiliate-shop-wallet.ts + 0104/0105 | Affiliates with real legacy balances see ฿0 | ✓ | เดฟ + ก๊อต |
| P1-29 | cust-06 customer address edit/delete/set-main — 3 legacy AJAX endpoints, ✓verified buttons inert (`data-legacy-onclick` only); rebuilt `actions/addresses.ts` ✓orphaned (imported only by addresses-manager.tsx which is unreachable). Admin path proves `tb_address` writes work. | `editAddress/deleteAddress/setMainAddress.php` | `/addresses/page.tsx` (inert) → NEW `actions/addresses-tb.ts` | Customer can't manage their own delivery addresses | — | เดฟ |
| P1-30 | cust-06 reverse-image/camera "find-similar" search dead — backend (`api/china-search/image` + laonet) EXISTS but no customer UI wires it; `/search` ignores `?img=`. | `searchIMG*.php` + top-menu imagesSearch | `/search/page.tsx` (no img handling) | Heavily-used photo-discovery flow silently dead | — | เดฟ |
| P1-31 | cust-06 customer juristic tax-invoice autofill is admin-only — legacy customer-facing DBD lookup (tax-ID → company+address) gone; cart types it by hand. The lib (`lib/dbd/parse-juristic.ts`) is written, needs a customer-scoped wrapper. | `check-juristic-person/index.php` | cart-tax-doc-pref.tsx (no autofill) | Customer re-types data the system could fetch | — | เดฟ |

**Cross-lane admin P1s also in scope (adm-12/13/14, ภูม-owned unless noted):** withdraw-commission-sale/interpreter batch workflow has no UI vs loaded `tb_withdraw_comm_*` (P1, decision ก๊อต/เดฟ); `acc-system-cargo` issued-invoice report unported (P1); profit reports invent a `vat7` column legacy lacks + drop the daily-profit graph + `5plus` filter (P1 fidelity violation); agent-commission payout report missing (name-collision with user-sales-history); เบิกจ่ายค่าสินค้า admin-push WRITE flow (`tb_shop_pay_h`) not ported (P1, เดฟ — migration + ADR); 3 monitoring reports (search `tb_history_key` / China-API / SMS `tb_sms_hs`) have no Pacred surface (P1, ปอน); `tb_notify_wp`→`tb_notify` broadcast reaches almost no one (P1 — see FG-1 correction below); HR attendance/recruitment ignore migrated `tas_*`/`tb_post_job` (P1); general rate-card editor decoupled from the live pricing engine (P1); ~120 `settings.php` config fields + 128-cell cost matrix have no editor (P1); TTP partner integration absent (P1, ก๊อต).

---

## 4. Flow-order divergences (the owner's specific concern)

> "เรียง flow ถูกต้องตามเขาหรือยัง" — even when all the pieces exist, Pacred sometimes runs them in the wrong sequence. These count as gaps under D1 fidelity. Consolidated from all lanes:

1. **Register creation order INVERTED** (cust-01) — legacy `tb_register → OTP → tb_users` (one INSERT = the customer, `tb_users` canonical). Pacred `auth.users → profiles → (best-effort mirror) tb_users`. No staging table; canonical table inverted; mirror silently no-ops on collision → orphans.
2. **Sales-rep assignment relocated** (cust-01, P1-15) — register-time round-robin → approval-time least-loaded, different eligibility filter. New leads carry no rep.
3. **Account-activation semantics reframed** (cust-01, P1-17) — legacy `userActive` is a sales-contacted flag (`''→'1'`) that never gated login; Pacred reframes `'0'→'1'` as an approval GATE (different value + meaning + queue split).
4. **Juristic side-effects split + wrong table** (cust-01) — legacy creates `tb_corporate` atomically in the OTP-verify step; Pacred splits step1→2→3→complete, landing corporate data in rebuilt `corporate`, with a window where a juristic user exists incomplete with no corporate row.
5. **Wallet seeding dropped from the creation step** (cust-01) — legacy seeds `tb_wallet`+`tb_cash_back` inline on signup; Pacred omits/defers.
6. **Order-create skips the รอดำเนินการ(1) review step** (cust-02, P0-3) — legacy seeds `hstatus='1'` then admin prices → `'2'`; Pacred `placeServiceOrder` jumps straight to `awaiting_payment` (=legacy 2). Wiring the faithful `submitCartOrder` (seeds '1') fixes this for free.
7. **Cancel status + guard** (cust-02, P0-5) — `tb_header_order.hStatus='6'` (one-char) not `'cancelled'`; guard `hStatus<3` dropped. **Verified: shop cancel = '6', NOT '99' (the '99' is forwarder/yuan only).**
8. **Search→cart split across two screens** (cust-06, P1-30) — legacy added to cart in place on the `/search` result card; Pacred relocated add-to-cart to `/service-order/add`, forcing the customer to re-paste the same product link.
9. **Wallet-debit TIMING inverted** (cust-04, P0-2) — legacy debits `tb_wallet` synchronously on submit; Pacred writes a pending `wallet_transactions` row that no approve path ever settles. Whole money-movement order inverted then dropped.
10. **Yuan funding-source step replaced** (cust-04, P0-2 sibling) — legacy "ensure wallet covers it, top up shortfall first via QRPay" → optional wallet-or-slip bypass; slip-only submissions skip the wallet entirely.
11. **Yuan gate placement** (cust-04, P1-23) — legacy gates create at the same screen as the gated list; Pacred gates only the list.
12. **Yuan manual-create status** (adm-11, P0-12) — legacy create→2nd-admin-verify (2-step); Pacred collapses to create+self-approve (1-step).
13. **Quote→pay→order sequence unreachable on real shop orders** (adm-10, P0-13) — legacy 1→2 (price) precedes 2→3 (pay) precedes 3→4 (order); Pacred legacy-path can only do 2→3 + Tab-4 spawn. State 2 unreachable from 1, state 4 unreachable from 3 — the middle of the state machine is absent.
14. **4→5 transition never auto-fires** (adm-10, P1-10) — legacy flips to 5 when the last tracking is entered; Pacred spawn leaves the header at 4 forever.
15. **`adminIDIP` interpreter assignment** (adm-10) — legacy round-robins across section 3/4 staff; Pacred always assigns the current admin → single-operator bottleneck.
16. **Detail-page editor entry order** (adm-09 P1-3 = adm-10 P0-14) — legacy: open detail → full in-place editor → single Save; Pacred: open detail → UUID miss → read-only legacy view → bounce to `/edit` with only dimensions editable. Single-screen edit-everything became multi-screen read-then-bounce.
17. **Driver model granularity** (adm-09, P1-2) — legacy assigns drivers as a batch run (1 header + N items + accept window + auto-expire); the list-bar creates flat per-forwarder rebuilt rows with no batch/expiry — wrong shape even if repointed.
18. **Sales-rep report generation** (adm-13) — legacy materialises `tb_sales_report` on `fStatus=7` then GROUP BY materialised rows; Pacred recomputes live from `tb_forwarder`, skipping materialisation + missing the per-rep monthly detail drill.
19. **เบิกจ่ายค่าสินค้า direction reversed** (adm-13) — legacy admin-PUSH (select orders → create batch → flip `hShopPay=1`); Pacred substitutes a customer-PULL queue (`tb_shop_transactions`). Actor + direction + target table all differ.
20. **Closing report keys off the wrong date** (adm-12) — legacy buckets issued `tb_receipt` rows by `rDate`; Pacred keys off forwarders-delivered → a forwarder delivered this month whose receipt was cut last month lands in the wrong period.

---

## 5. Cross-cutting root-cause patterns

Distilled from both critics. Fixing the *pattern* is higher-leverage than fixing instances one at a time.

- **#1 — Silent dead-write to rebuilt empty tables (DOMINANT, ~70% of P0s).** In every customer lane and every admin lane, a write targets a rebuilt table (`profiles`/`corporate`/`cart_items`/`service_orders`/`forwarders`/`forwarder_driver`/`wallet`/`wallet_transactions`/`yuan_payments`/`addresses`/`sales_commissions`/`rate_general`/`attendance_logs`/`job_postings`/`org_contacts`/`broadcasts`) while the 8,898-customer data lives in `tb_*`. **The per-domain SOT decision (legacy vs rebuilt) gates almost everything** — make it once per domain, not per file.
- **#2 — Duplicate action files; the FAITHFUL one is the orphan, the DEAD rebuilt one is LIVE.** `submitCartOrder`(orphan) vs `placeServiceOrder`(live); `wallet-hs.ts`(faithful ✓) vs `wallet.ts`(live dead 💀); `yuan-payments-tb.ts`(tb_payment) vs `yuan-payments.ts`(rebuilt); `rate-edits.ts`(faithful) vs `rates.ts`(dead); `/sales` Path A vs `/commissions` Path B. **The fix is usually just re-point the import + delete the twin** — high leverage, low risk.
- **#3 — The money loop never closes (debit-timing / settle-gap).** Yuan parked-pending-never-settled (double-spend); withdraw never debits + reject never refunds + paydeposit batch-settle absent; pay-from-wallet on rebuilt ledger; admin top-up approval credits nothing. Legacy debits `tb_wallet` synchronously + settles via approve/reject + `tb_wallet_paydeposit` cascade; Pacred's pending→trigger model is half-wired. **SOT decision + settle paths must land together** or you get a half-state worse than either.
- **#4 — Notification fan-out narrowed.** Legacy fans every transition to 4 channels (Email + SMS + LINE Notify + LINE OA) + an admin/staff-group ping + customer broadcasts. Pacred kept the customer half (and only on submit, often not on status flip) and dropped the admin-group ping (yuan create, order transitions, wallet flip) and the broadcast channel. **The load-bearing loss is the SMS payment-link that drove payment in legacy.**
- **#5 — Missing admin print.** `printShop.php` (shop invoice/receipt) and `printAll.php` (warehouse scan-to-print) not ported; the one print button that exists points at a user-pinned customer route that 404s for admins. Staff can't print docs for the 21,950 migrated orders.
- **#6 — Session-lock universally absent.** Legacy `updateLock.php` puts a 60s heartbeat lock on forwarder/service-order/yuan/wallet/pay-users edits. Pacred has none → 13 prod admins editing concurrently = overwrite risk, *once the writes actually land*. Build one shared `lib/admin/edit-lock.ts`. (Lower urgency until the dead-writes are fixed — locking a no-op is pointless.)
- **#7 — Flow-order drift even when the pieces exist** (the owner's §4 concern) — register inversion, order created at status-2, cancel guard dropped, wallet-debit timing inverted, search→cart re-paste. Right pieces, wrong sequence.
- **#8 — Status-enum / value drift.** `userActive` `''` vs `'0'`; cancel `'cancelled'` vs `'6'`; wallet type-3 vs type-7 mis-mapped; yuan 5-state enum over legacy 2-outcome. Writing a word or wrong digit where legacy uses a specific 1-char code recurs across lanes.
- **#9 — Dual-mode UUID-vs-legacy detail pages.** `forwarder/[fNo]` and `service-order/[hNo]` render the full editor only on the empty-UUID branch → near-read-only on every real `tb_*` row. **One decision (legacy numeric id canonical, retire the UUID path) closes several P0s at once.**
- **#10 — Improvement smuggled into a port diff (fidelity violation).** Invented `vat7` column (adm-13); rep-auto-assign + welcome-SMS folded into "recover customer" (adm-08); 5-state yuan enum (adm-11). These hide divergence inside good-looking changes — run `legacy-fidelity-check`. **Guard against re-flagging INTENTIONAL rebrands:** `PCS<n>→PR<n>` member code, Google-Sheets→native-CSV cost upload, forwarder-check LINE+email (which *exceeds* legacy) are all approved divergences, NOT gaps.

### Two factual corrections to the source lane docs (verified against real PHP)

- **FG-1 (corrects adm-14 P0-3):** the customer-portal login announcement popup reads **`tb_notify` + `tb_notify_read`** (verified `member/include/all-script.php` L617/625 + `popup.php` reads `tb_notify`), **NOT** `tb_notify_wp`. `notify.php`→`tb_notify_wp` feeds the WordPress *marketing* site only. The direction (broadcasts reach almost no one) is right; the correct fix target is `tb_notify`/`tb_notify_read`, and Pacred's `notifications`/`notification_reads` rebuilt tables are the dead twin. Owner: เดฟ.
- **Soft severity note (cust-05 P0-28, affiliate shop wallet):** `wallet-shop` is NOT in the legacy customer left-menu (dir + AJAX loaders exist but are unlinked — a customer cannot navigate there in legacy). If it was never live in prod, it's a P1/P2 Phase-C label, not launch-blocking. **ก๊อต/owner to confirm before treating as P0.**

### The structural gap of THIS audit (the critic's root cause)

The lanes were partitioned by **left-menu item**, but the `index/all-popup/*` layer (broadcast popups, ToS gate, 7-15-day re-verify gate, credit-due nudges, and the dashboard they all mount on) is **cross-menu infra with no menu item** — so no lane owned it. Five subsystems fell through:

- **M-1** General notification center + admin-broadcast popups (`tb_notify`/`tb_notify_read`) — Pacred has a rebuilt version on `notifications`/`notification_reads`, fidelity unassessed. **P1, ปอน.**
- **M-2** Terms-of-Service acceptance gate (`tb_terms_service`) — Pacred reframed onto `tos_versions` (0047); migrated acceptances orphaned. **P1, ปอน.**
- **M-3** 7-15-day re-verification OTP gate (`verify-tel.php`) — Pacred has NONE. **P1, เดฟ (pairs with the OTP-route fix).**
- **M-4** Credit-due reminder auto-popups (`credit-due-1d/3d/past-due.php`) — Pacred has NONE; fell between the forwarder and wallet-credit lanes. **P1, เดฟ.**
- **M-5** Home/member-root dashboard not audited as a whole, nor confirmed as the mount point for M-1..M-4. **P2, ปอน.**

**→ Recommend a dedicated follow-up lane `cust-08-notify-gates`** rather than wedging these into existing lanes.

---

## 6. THE WORK-SPLIT (no lane collision)

Four owners, each drawn ONLY from that owner's assigned gaps. **Collision files** (touched by >1 owner) are called out with a sequence rule. Effort: S ≈ <2h, M ≈ 2-6h, L ≈ >6h or needs a decision.

### เดฟ — architecture · integration spine · customer-backend · hard cross-cutting

> เดฟ owns the decisions and the customer write-path. Several tasks are **gates** that unblock ภูม.

| Pri | Task | Closes | Eff | Files | Collision |
|---|---|---|---|---|---|
| **1** | **Make the WALLET-SOT decision** — declare `tb_wallet`+`tb_wallet_hs` canonical (recommended; that's where the 8,898 balances are), document in an ADR, write a one-page settle-contract (debit-on-submit, settle/refund-on-approve/reject, `tb_wallet_paydeposit` cascade). **With ก๊อต.** | P0-1 (gates P0-2/6/7/9, P1-14/25/26/27) | M | NEW `docs/decisions/0018-wallet-sot.md` | **Gate for ภูม P1-25/26/27 + เดฟ P0-2/6/7. Nobody touches wallet writes until this lands.** |
| **2** | **Restore OTP gating** — flip `EMERGENCY_OTP_BYPASS` to env-gated `false`, confirm ThaiBulkSMS route live (with ก๊อต). | cust-01 P0 (security) + unblocks M-3 | S | `actions/otp.ts:42` | Coordinate ก๊อต on SMS route; otherwise isolated |
| **3** | **Unify customer cart+order onto `tb_header_order`** — re-point nav (protected-sidebar L76-79, pcs-icon-grid L47, cart-badge) to `/cart`; make `addCartItem` write `tb_cart`; keep `submitCartOrder` as the only checkout (seeds `hstatus='1'`, fixing the status-1 skip); `cancelServiceOrder`→`hStatus='6'` guard `<3`; delete the rebuilt `service_orders`/`cart_items` half. | P0-3, P0-4, P0-5 + FO-6/7 | L | `actions/cart.ts`, `actions/service-order.ts`, `components/.../protected-sidebar`, `pcs-icon-grid`, `cart-badge` | Pay leg (P0-6) waits on Task 1 |
| **4** | **Close the yuan money-hole + restore wallet-always funding** — settle the matching wallet row on approve/reject per the Task-1 contract; drop the slip-only bypass; restore the QRPay shortfall flow as a shared component; re-add the gate on `/service-payment/add`. | P0-2, P1-22, P1-23 | L | `actions/payment.ts`, `yuan-payment-form.tsx`, `/service-payment/add` | Depends on Task 1. **`actions/payment.ts` also read by ภูม's yuan-ops — เดฟ owns the customer create + wallet-settle; ภูม owns the admin approve. Split by function, not file.** |
| **5** | **Re-wire customer WITHDRAW + HISTORY onto tb_*** — `createWithdraw`→`tb_wallet`/`tb_wallet_hs` type=3; `/wallet/history`→legacy ledger. Ship **with** ภูม's withdraw approve/refund (P1-25/26) so a rejected withdraw actually refunds. | P0-7, P0-8 | M | `actions/wallet.ts`, `/wallet/withdraw/*`, `/wallet/history/page.tsx` | **Co-ship with ภูม P1-25/26. เดฟ = customer submit side; ภูม = admin approve/refund side. Pair-review the type-enum (3=withdraw) together.** |
| **6** | **Fix MS-1 admin top-up approval** — re-point `adminUpdateWalletTransaction`/`adminBulkApproveDeposits` (and the `[id]/edit-form` import) to the `wallet-hs.ts` pattern (`tb_wallet_hs`+`tb_wallet`). | P0-9 | M | `actions/admin/wallet.ts`, `wallet/slip-review-modal.tsx`, `actions-cell.tsx`, `bulk-approve-bar.tsx`, `[id]/edit-form.tsx` | Depends on Task 1. Shares the `tb_wallet` spine with P0-19 — do P0-9 first, P0-19 reuses it |
| **7** | **Resolve register canonical-table inversion** — make `tb_users` the canonical signup write (or a transactional fail-closed mirror) + seed `tb_wallet`/`tb_cash_back`/`tb_corporate` inline; move `adminIDSale` to register-time round-robin. | P1-15, P1-16, FO-1/2/4/5 | L | `actions/auth.ts`, `lib/auth/legacy-bridge-tb-users.ts` | Touches `tb_users` write — **ภูม's P1-17 (`userActive` queue) reads the same column; align on `userActive=''` for native signups in one sitting** |
| **8** | **Pick commission architecture** (recommend Path A faithful `tb_user_sales`) + spec the earn-trigger for ภูม; then the withdraw-modal + approve handler on the faithful path. | P0-23 (architecture), P1-21 | L | `docs/decisions/`, `/sales/*`, `actions/commissions.ts` (retire) | **เดฟ picks the model; ภูม builds the earn-trigger (P1-5). Decision must precede ภูม's trigger work.** |
| 9 | **adm-08 cluster** — `adminUpdateUserIdentity` on `tb_users` (delete orphaned `editCustomer`); juristic verify/reject/lookup/convert → `tb_corporate` by userid (follow `adminUpdateCorporate`); delete the two dead transfer-rep paths. | P0-17, P0-18, adm-08 P1 | L | `actions/admin/customers.ts`, `juristic-check/page.tsx`, `[id]/profile-sections.tsx`, `convert-to-juristic/` | Isolated to customers admin; `customers.ts` not in ภูม's list |
| 10 | **`pay-users.php` pay-on-behalf** — full build on the Task-1 wallet spine (`tb_wallet`/`tb_wallet_hs`/`tb_header_order`/`tb_forwarder`/`tb_receipt` + promo/corporate math). | P0-19 | L | `/admin/wallet/pay-user/page.tsx` + NEW action | Reuses P0-9 wallet writer; do after Task 6 |
| 11 | **Customer self-service misc** — address edit/delete/set-main → NEW `actions/addresses-tb.ts` (wire the inert buttons; delete orphaned `actions/addresses.ts`); reverse-image search UI → wire to existing `api/china-search/image`; customer juristic autofill wrapper over `lib/dbd/parse-juristic.ts`. | P1-29, P1-30, P1-31 | M | `/addresses/page.tsx`, NEW `actions/addresses-tb.ts`, `/search/page.tsx`, `cart-tax-doc-pref.tsx` | Isolated |
| 12 | **cust-03 forwarder add** — wire `getShipBy` carrier picker + `checkFreeArea`; add customer self-delete (`fStatus=1 AND refOrder='' AND userID=self`); **remove** `payForwarderFromWallet` (legacy DISABLED it) + the rebuilt dead-write cluster. | P1-18, P1-19, P1-20 | M | `service-import/add/page.tsx`, `actions/forwarder-legacy.ts`, `actions/forwarder.ts` | Isolated to customer forwarder |
| 13 | **M-3 re-verify gate + M-4 credit-due popups** (pairs with Task 2). | M-3, M-4 | M | NEW under `(protected)/` popup infra | Isolated; could fold into the `cust-08-notify-gates` lane |

### ภูม — admin back-office BACKEND (long-haul)

> ภูม owns the admin server actions + `tb_*` queries. **Wallet-write tasks (P1-25/26/27) wait on เดฟ Task 1.** Start with the cheap dead-write retargets — highest correctness-per-minute.

| Pri | Task | Closes | Eff | Files | Collision |
|---|---|---|---|---|---|
| **1** | **Yuan bulk-approve UUID fix** — call `resolveLegacyAdminId()` before the `tb_payment` UPDATE (the wallet path L155 already does it). | P0-10 | S | `actions/admin/tb-bulk.ts:318` | None — one-line, ship immediately |
| **2** | **Cron retargets ×4 (batch)** — `refresh-active-customers`→`tb_users.userActive`+`tb_*` reads; `sales-daily-digest`→`tb_wallet_hs`; `expire-probation`→`tb_admin`; `expire-driver-assignments`→`tb_forwarder_driver` (fdstatus 1→3 + cascade items). | P0-22, P1-4 | M | `app/api/cron/{refresh-active-customers,sales-daily-digest,expire-probation,expire-driver-assignments}/route.ts` | None — cheapest correctness-per-minute (~2-3h all four) |
| **3** | **Yuan manual-create + per-row form** — flip manual-create to `paystatus='1'` + customer notify; mount `YuanPaymentActions` on `/admin/yuan-payments/[id]` (action `adminUpdateYuanPayment` already correct). | P0-11, P0-12 | M | `actions/admin/yuan-payments-tb.ts`, `/admin/yuan-payments/[id]/page.tsx`, `actions-cell.tsx` | **`yuan-payments.ts`(rebuilt) is the dead twin — delete after wiring `-tb`. Do NOT touch `actions/payment.ts` (เดฟ's customer create).** |
| **4** | **Render the service-order update form in legacy-view** — `legacy-view.tsx` renders `AdminServiceOrderUpdateForm` (already writes `tb_header_order`, cancel→'6' verified). | P0-14 | S | `/admin/service-orders/[hNo]/legacy-view.tsx` | None — ~1h, unblocks cancel/status/note for 21,950 orders |
| **5** | **Forwarder list-bar retargets** — `bulkUpdateStatus`→`adminBulkUpdateForwarderTbStatus` (exists) + numeric `fStatus` enum; `bulkAssignDriver`→`driver-batches` (`tb_forwarder_driver`+`_item`). **= open task #41.** | P1-1, P1-2 | M | `actions/admin/forwarders-bulk.ts`, `bulk-actions-toolbar.tsx` | None — faithful actions already exist |
| **6** | **`tb_user_sales` earn-trigger** — INSERT on `fStatus=7` for the 4 agent codes, on the deliver cascade. **Spec comes from เดฟ Task 8.** | P1-5 (+ cust-07 P0-23 half) | M | `actions/admin/driver-work.ts`, `forwarders.ts::adminBulkUpdateForwarderTbStatus` | **เดฟ decides the model (Task 8) first; ภูม implements the trigger.** |
| **7** | **5 reports → tb_*** — rewrite `reports.ts` fetchers (forwarder/shops/yuan/sales-monthly/otp) to `tb_forwarder`/`tb_header_order`/`tb_payment`/`tb_users_otp`/`tb_users`; field-map from the hub Wave-20 swap. **Remove the invented `vat7` column + restore the daily-profit graph + `5plus` filter** (fidelity). | P0-20, adm-13 P1 fidelity | L | `actions/admin/reports.ts` + the 5 report pages | None — one stale file |
| **8** | **`/admin/accounting/closing` → tb_receipt** — key off issued `tb_receipt` bucketed by `rDate`, split by `userCompany`. | P0-21 | M | `/admin/accounting/closing/page.tsx` | None |
| **9** | **Per-item refund (`repayItem`)** — NEW `actions/admin/service-orders-refund.ts`: partial-qty split `tb_order`, INSERT `tb_wallet_hs` type=5, credit `tb_wallet`, recompute totals. **Uses the Task-1 wallet contract.** | P0-16 | M | NEW `actions/admin/service-orders-refund.ts` + `/admin/service-orders/[hNo]/refund` | **Wallet-credit side depends on เดฟ Task 1 contract** |
| **10** | **Withdraw approve/reject + refund engine + type-enum fix** — admin withdraw queue: status→2 (no balance change), reject→3 + refund `tb_wallet`; fix the type-3=withdraw mapping in `wallet-trans.ts`/`tb-bulk.ts`/`wallet-hs.ts`. | P1-25, P1-26 | M | `actions/admin/wallet-trans.ts`, `tb-bulk.ts`, `wallet-hs.ts` | **CO-SHIP with เดฟ P0-7 (customer withdraw). Depends on Task 1. Pair-review the enum.** |
| **11** | **`tb_wallet_paydeposit` batch-settle** — deposit-approval cascade: 1 slip → N linked `tb_wallet_hs` rows + flip `tb_header_order.hStatus`/`tb_forwarder.fStatus`; reject DELETEs links. | P1-27 | L | `actions/admin/wallet-trans.ts` + NEW paydeposit writer | Depends on Task 1 |
| **12** | **5-tab shop UPDATE workflow** — NEW quote handler (1→2, price + `hDatePayment`) + ordered handler (3→4, `cShippingNumber`) on `tb_header_order`; 4→5 auto-flip + `tb_promotion` carry + 4-channel notify on spawn; 13 header-edit handlers + IP-reassign. **Biggest build.** | P0-13, P1-10, P1-11, P1-12 | L | `/admin/service-orders/[hNo]/*`, `actions/admin/service-orders.ts`, `service-orders-spawn.ts` | **Detail-page editor architecture (UUID-vs-legacy, P1-3/P0-14 dual-mode) is เดฟ's call — coordinate before the [hNo] page surgery.** |
| 13 | **adm-09 forwarder detail tail** — single-container cnt-payment + slip; per-row bill-to-customer 4→5; `saveNote` LINE text push; the `update_fAddress`/`fCover`/`fTransportType`/`fUserID`/credit-flip/7-button ribbon. | P1-6, P1-7, P1-9 | L | `report-cnt-detail.ts`, `cnt-payment.ts`, `[fNo]/tb-action-panel.tsx` | None (the `[fNo]` *editor shell* is เดฟ P1-3; ภูม fills the handlers) |
| 14 | **Long-tail admin backend** — `cust-01 userActive` queue filter align to `''` (with เดฟ Task 7); withdraw-commission-sale/interpreter UI on `tb_withdraw_comm_*`; `acc-system-cargo` issued-invoice report; HR attendance/recruitment → `tas_*`/`tb_post_job`; general rate-card editor → `tb_rate_g_*`; ~120 `settings.php` fields + 128-cell matrix editor. | P1-17 + the adm-12/13/14 P1 tail | L | many admin actions/pages | P1-17 pairs with เดฟ Task 7 |

### ปอน — customer FRONTEND · data-analysis / monitoring / sync-platform / dashboards

> ปอน owns customer-facing surfaces + the monitoring/analytics reports. **No write-path / `tb_*`-mutation work** (that's ภูม/เดฟ). Several of these are the `cust-08-notify-gates` follow-up + the monitoring reports.

| Pri | Task | Closes | Eff | Files | Collision |
|---|---|---|---|---|---|
| **1** | **Notification-center + broadcast-popup fidelity audit (M-1)** — assess Pacred's `notifications`/`notification_reads` vs legacy `tb_notify`/`tb_notify_read`; decide port-vs-keep; if keep-rebuilt, ensure recipient resolution covers all 8,898 (not just logged-in `profiles`). **Decision input feeds เดฟ FG-1.** | M-1, FG-1 (frontend half) | M | `/notifications`, `actions/notifications.ts` (read), broadcast popup component | **The `tb_notify` write target is เดฟ (FG-1); ปอน owns the customer-facing popup render + the audit. Coordinate the recipient-set decision.** |
| **2** | **3 monitoring/usage reports** — surface ยอดการค้นหาสินค้า (`tb_history_key`), ยอดการใช้ API จีน (China search-API volume/cost), ยอดการใช้ SMS (`tb_sms_hs`). Read-only dashboards. | adm-13 P1 monitoring | M | NEW `/admin/reports/{product-search,china-api,sms-usage}` pages reading `tb_*` | Read-only — no collision with ภูม's `reports.ts` write-path fixes |
| **3** | **ToS gate fidelity check (M-2)** — confirm `tos_versions` (0047) reframe vs legacy `tb_terms_service`; flag orphaned migrated acceptances; verify the force-modal is wired in `(protected)/layout.tsx`. | M-2 | S | `lib/tos-server.ts`, `tos-gate.tsx`, `(protected)/layout.tsx` | Isolated |
| **4** | **Member-root dashboard fidelity audit (M-5)** — audit `(protected)/dashboard/page.tsx` whole (summary cards + 9-icon launchpad vs legacy menu); confirm it's the mount point for M-1..M-4 popups; apply ปอน podeng brand chrome where legacy-CSS placeholders remain. | M-5 + branding | M | `(protected)/dashboard/page.tsx` | Isolated |
| **5** | **Customer-facing receipt/popup polish** — receipt-arrival popup + `rPopup` ack (cust-03 P2); LINE-connect nag popup (cust-07 P2); China-warehouse address content (cust-06 P2 — legacy was empty but customers still need it). | cust-03/06/07 P2 | M | `service-import/receipts`, `/line-settings`, `/china-address` | Isolated |
| 6 | **Status-color + label drift sweep** — yuan สำเร็จ badge color (cust-04 C-22), `usStatus` label (cust-07), yuan admin 'อนุมัติแล้ว' vs customer 'สำเร็จ' (adm-11) — align customer-visible labels to legacy. | scattered cosmetic | S | customer status-badge components | Isolated |

### ก๊อต — architecture · hard decisions · partner APIs · production gate

> ก๊อต co-owns the cross-cutting decisions with เดฟ and owns partner-API + the launch gate.

| Pri | Task | Closes | Eff | Files | Collision |
|---|---|---|---|---|---|
| **1** | **Co-decide WALLET SOT** (with เดฟ Task 1) — sign off `tb_wallet` canonical + the settle-contract; this is the launch gate for the whole money loop. | P0-1 | M | `docs/decisions/0018-wallet-sot.md` | Joint with เดฟ — **the single highest-leverage decision in the audit** |
| **2** | **Confirm ThaiBulkSMS route live** so เดฟ can flip OTP off bypass; confirm whether the JMF partner switched to the pull contract (vs the inbound webhook that doesn't exist). | cust-01 P0 (SMS), adm-14 JMF | S | env / partner config | Joint with เดฟ Task 2 |
| **3** | **Confirm affiliate shop-wallet prod-liveness** — was `tb_wallet_shop`/`tb_wallet_shop_hs` ever live? (Not in the customer left-menu.) If never live → re-label cust-05 P0-28 as P2 Phase-C. | P1-28 severity | S | decision note | Gates เดฟ's shop-wallet scope |
| **4** | **TTP partner integration** — port `api-forwarder-ttp.php` (per-SM tracking → `tb_forwarder`); decide MK/MX/Sang sheet-adapter completion. | adm-14 P1 partner | L | NEW `lib/integrations/ttp` | Partner-API lane — isolated from app actions |
| **5** | **Production gate** — before any `dave-pacred → main`, run `qa-flow-simulator` on the money loop (assert a real `tb_wallet` balance delta) + the route-200 smoke. **The route smoke alone cannot catch a dead-write** — require a `tb_*` row-delta assertion. | gate for all P0 fixes | M | CI / smoke scripts | Owns the merge gate |
| 6 | **Build the shared session-lock** (`lib/admin/edit-lock.ts`, 60s heartbeat) — cross-cutting infra used by forwarder/service-order/yuan/wallet edits. Schedule **after** the dead-writes land (locking a no-op is pointless). | pattern #6 | M | NEW `lib/admin/edit-lock.ts` | Cross-cutting — coordinate which write-actions adopt it once they're real |

---

## 7. Recommended sprint sequence

**Sprint 0 — decisions + cheap wins (parallel, ~1 day).** No code-collision risk.
- เดณ+ก๊อต: **WALLET-SOT ADR** (gates everything money). ← do this hour-1.
- เดฟ: flip OTP bypass off (ก๊อต confirms SMS).
- ภูม (parallel, independent): **P0-10** yuan UUID one-liner · **P0-22/P1-4** the 4 cron retargets · **P0-14** render the form in legacy-view. ~½ day, four landmines defused, zero dependency on the wallet decision.

**Sprint 1 — close the money loop (serialized on the wallet ADR).** This is the launch-blocker cluster; ship as one reviewed batch so no half-state reaches prod.
- เดฟ: P0-3/4/5 cart+order unification → then P0-6 pay-leg → P0-2 yuan settle → P0-9 admin top-up approval.
- เดฟ+ภูม **co-ship**: P0-7 (customer withdraw) + P1-25/26 (admin approve/refund + enum). Pair-review the type-3 enum.
- ภูม: P0-9-dependent P0-19 pay-on-behalf after the wallet writer exists.
- Gate: ก๊อต runs `qa-flow-simulator` asserting a real `tb_wallet` delta before merge.

**Sprint 2 — admin revenue path + identity (mostly parallel).**
- ภูม: P0-13 5-tab shop workflow (biggest build) — coordinate the `[hNo]` editor shell with เดฟ's UUID-vs-legacy decision (P1-3/P0-14 dual-mode) FIRST.
- เดฟ: P0-17/18 identity + juristic cluster (isolated to `customers.ts`).
- ภูม (parallel): P0-20 reports→tb_* + P0-21 closing→tb_receipt (one stale file, no collision).
- เดฟ: P0-11/12 dependent — actually ภูม owns yuan-ops; เดฟ stays on customer-backend.

**Sprint 3 — commission + workflow tail + the notify-gates lane.**
- เดฟ: P0-23 commission architecture pick → ภูม builds P1-5 earn-trigger.
- ภูม: P0-16 per-item refund + P1-27 paydeposit batch-settle (both on the now-real wallet spine) + the adm-09 detail tail (P1-6/7/9).
- ปอน: the `cust-08-notify-gates` lane (M-1..M-5) + the 3 monitoring reports — fully parallel, frontend/read-only.
- เดฟ: P0-15 admin print + M-3/M-4 popups.
- ก๊อต: TTP + session-lock (now that writes are real).

**Parallel-safe at any time:** ปอน's entire list (frontend + read-only dashboards), ภูม's cron/report retargets, ก๊อต's partner-API + decisions. **Strictly serialized:** everything that writes the wallet (waits on the ADR), and the `[hNo]`/`[fNo]` detail-page editor surgery (waits on the UUID-vs-legacy architecture call).

**The one-sentence sequencing rule:** *Decide the wallet SOT and the detail-page id model first; then the dead-write retargets are independent, parallel, mostly one-file fixes — but the money-loop fixes must ship as a single reviewed batch, gated by a real `tb_wallet` balance-delta assertion, never a route-200 smoke.*

---

## 8. REACHABILITY — the 3rd dimension (owner directive 2026-05-30)

> Owner: "ทุกฟังชั่น ต้องมีปุ่ม หรือทางเข้า ให้เข้าถึง เข้าใช้ได้หมดนะ ไม่งั้นจะทำมาทำไม" — every function MUST have a clickable entry point (sidebar / menu / row-button / dashboard card). Present + correct-table + still **invisible** = useless. This audit measured dimensions 1 (workflow exists) + 2 (right table / flow-order); reachability is dimension 3 and it FAILS in several places the lane docs already flagged:

- **P0-3** — the faithful `submitCartOrder` exists but `/cart` has **no inbound nav** (orphan). The live nav points at the dead `placeServiceOrder`. Reachability + dead-write in one.
- **P0-11/P0-14** — `adminUpdateYuanPayment` + `AdminServiceOrderUpdateForm` are correct but **mounted on no UI surface** the real rows reach. Pure reachability failures.
- **P0-15** — admin print has no `/admin/service-orders/print` entry at all.
- **P1-29** — customer address buttons are inert (`data-legacy-onclick` only); `actions/addresses.ts` was orphaned (deleted 2026-05-30, branch `cleanup/dead-address-stack`).
- **M-1..M-5** — the entire `index/all-popup` infra layer (broadcast popups, ToS gate, re-verify gate, credit-due nudges) has **no menu item** → no lane owned it.

**Definition-of-done rule (applies to EVERY §6 task):** a task is NOT done until its function is reachable in ≤3 clicks from the sidebar/dashboard, verified by a click-through that STARTS at the real entry point (not `curl /the/url`). If the only way you reached it was typing the URL, a real user can't.

**Dedicated deliverable — orphan/entry-point sweep (owner: ปอน frontend-nav + เดฟ review):** for every route under `app/[locale]/(admin)/admin/*` + `(protected)/*`, confirm ≥1 inbound `<Link href>` / sidebar entry / button. Zero-inbound = orphan → wire it (add nav) or delete it (like the address stack). Output: an orphan-route table appended to this folder. **This is a Sprint-0 parallel-safe task** (read-only discovery, frontend-owned, no wallet dependency).

Reachability rule captured in memory `reachability_rule_2026_05_30` + AGENTS.md §0d.
