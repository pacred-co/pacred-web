# Big audit 2026-06-01 — cluster 03: SHOP-ORDER + PAYMENT + WALLET (ฝากสั่ง / ฝากโอน / กระเป๋าเงิน)

> Money-critical cluster. Built on `legacy-resweep-2026-05-31/m2-money-loop.md` (customer side) +
> `_MASTER-FRESH.md` (which declared the money loop CLOSED). This doc adds the **data-level inventory
> (row counts + key columns queried from prod 2026-06-01)** and the **ADMIN-side shop-disbursement /
> yuan-approve / wallet-adjust** flows that m2 explicitly deferred to the admin sweep.
>
> **Headline (verified at data level):** the money SOT is unambiguously `tb_wallet` + `tb_wallet_hs`
> (the legacy ledger). The rebuilt `wallet` / `wallet_transactions` / `yuan_payments` / `service_orders`
> tables are **dead seeds or empty** and touched only by orphan twins + tests. **No live double-spend.**
> The live customer + admin money paths write the real `tb_*`. What remains is **(a) orphan dead-write
> twins still on disk = re-route landmines, (b) 1 dead customer credit-line feature for 24 real
> customers, (c) the legacy "wallet covers part + slip the shortfall" model dropped on 3 pay surfaces,
> (d) a missing per-customer shop report.** None lose money today.

---

## 1. DATA INVENTORY (prod `yzljakczhwrpbxflnmco`, queried 2026-06-01)

### 1a. Shop-order (ฝากสั่งซื้อ) — cart → order

| Table | Rows | Purpose | Key columns ("หัวข้อ") |
|---|---:|---|---|
| `tb_cart` | 15,477 | Customer shopping cart (pre-order). `shops.php` cart. | `id, userid, ctitle, curl, cnameshop, cprovider(1688/taobao/tmall), cimages, cprice, camount, ccolor, csize, cdetails` |
| `tb_header_order` | 21,950 | **The shop-order header** (one per ฝากสั่ง batch). The real SOT. | 57 cols: `hno (P+ID), hstatus(1-6), hshoppay, paydeposit, htitle, hcover, hcount, htransporttype, htotalpricechn, htotalpriceuser, hshippingchn, hrate, hratecost, hcostall, hcostallth, hshipby, hfreeshipping, hwarehousechina(1=อี้อู/2=กวางโจว), haddress*, userid, adminidcreate, tax_doc_pref/tax_id/address` |
| `tb_order` | 124,345 | **Order line items** (one per product in an order; FK `hno`). | `id, hno, userid, ctitle, curl, cnameshop, cprovider, cprice, cshippingchn, cpriceupdate, camount, ccolor, csize, ctrackingnumber, crewallet(0/1/2 refund flag), hwarehousename, hcrate, hqc` |
| `tb_product` | **0** | (legacy product catalog — unused on prod) | — |
| `tb_product_category` | **0** | (unused) | — |
| `tb_keyword_product` | **0** | (unused — search-keyword catalog) | — |

### 1b. Shop disbursement (admin เบิกจ่ายค่าสินค้า to shops/agents)

| Table | Rows | Purpose | Key columns |
|---|---:|---|---|
| `tb_shop_pay_h` | 877 | **Disbursement batch header** (one per pay-out run to shops). | `id, date, dateupdate, amount, title, status(1=รอ/2=จ่ายแล้ว), adminidcreate, namebank, nameuserbank, nouserbank, imagesslip, adminidupdate` |
| `tb_shop_pay_sub` | 14,587 | Fan-out (one row per order in a batch). | `id, hno, sphid (FK→tb_shop_pay_h), hcostallth (per-order China cost THB)` |

### 1c. Yuan transfer (ฝากโอนหยวน — Alipay)

| Table | Rows | Purpose | Key columns |
|---|---:|---|---|
| `tb_payment` | 1,460 | **The ฝากโอนหยวน SOT** (one per yuan-transfer request). | `id, paydate, paydeposit, paystatus(1=pending/2=approved/3=rejected), paytype, paydetail, payyuan, payrate, payratecost, paythb, paythbcost, payprofitthb, userid, adminid, imagesslip, certifiedtruecopy, slip_transfer_time` |

### 1d. Wallet ledger (กระเป๋าเงิน) — **the money SOT**

| Table | Rows | Purpose | Key columns |
|---|---:|---|---|
| `tb_wallet` | 8,899 | **Current balance per customer.** 254 have `wallettotal>0`. | `userid, wallettotal` |
| `tb_wallet_hs` | 104,591 | **The real ledger** (every movement). | `id, date, amount, status(1=pending/2=settled), type(1=deposit/2=shop-pay/3=withdraw-hold/4=forwarder-pay/6=yuan-pay), typenew, typeservice, paydeposit, imagesslip, depositnamebank/nameuserbank/nouserbank, adminid, reforder/reforder2 (FK to order/payment), whno, wusercredit (credit flag), userid` |
| `tb_wallet_paydeposit` | 57,163 | Links a wallet-deposit ledger row to the shop-order(s) it paid (`whid→tb_wallet_hs, hno→order`). | `id, whid, hno` |
| `tb_cash_back` | 8,810 | Current cashback balance per customer. **6 have `cbtotal>0`.** | `userid, cbtotal` |
| `tb_cash_back_hs` | 3,741 | Cashback movement history. | `cbhid, cbhdate, cbhstatus, cbhamount, userid, cbhrefid` |
| `tb_credit` | 76 | **Customer credit-line limit.** **24 have `creditvalue>0`.** | `userid, creditvalue` |

### 1e. Affiliate shop-wallet (ฝากขาย agent earnings) — legacy

| Table | Rows | Note |
|---|---:|---|
| `tb_wallet_shop` | **0** | Legacy affiliate-shop balance. **Empty on prod** — superseded by rebuilt `tb_shop_transactions` (also 0; see §2). |
| `tb_shop_transactions` | **0** | Rebuilt affiliate ledger (migration 0104, profile_id UUID). Empty. |

---

## 2. REBUILT TWIN — canonical vs dead (verified at data level)

| Rebuilt table | Rows | Balance/data? | Verdict | Live code? |
|---|---:|---|---|---|
| `wallet` | **8,939** | **ALL balance=0** (queried `?balance=gt.0` → 0 rows) | **DEAD SEED** — 8,939 rows exist but every balance is 0; real money is in `tb_wallet` (254 non-zero). | ❌ only `lib/wallet/*.test.ts` touch it. No live action reads/writes `.from("wallet")`. |
| `wallet_transactions` | **0** | empty | **DEAD** — the rebuilt ledger, never populated. | ⚠️ referenced by ~20 action files but only in **orphan branches** (createDeposit, payForwarderFromWallet, credit.ts, the old yuan bulk-bar) — see landmines below. |
| `yuan_payments` | **0** | empty | **DEAD** — UUID-keyed yuan twin. | ⚠️ `adminBulkApproveYuanPayments` + `adminSetYuanSlipTransferredAt` read/write it (orphan bar — superseded by `TbYuanBulkBar`). |
| `service_orders` / `service_order_items` | **0 / 0** | empty | **DEAD** — `placeServiceOrder` was pivoted away (comment L609 "the previous body wrote the REBUILT empty service_orders"). | ✅ both cart actions now write `tb_header_order`+`tb_order`. |
| `orders` | **0** | empty | DEAD (Pacred-native order schema, never used by cargo). | ❌ |
| `cart_items` | **4** | 4 stray rows | effectively DEAD; live cart = `tb_cart` (15,477). | ❌ |
| `promotion_applications` | **0** | empty | DEAD; live promo = `tb_promotion` (8,540). | ❌ |
| `v_customer_credit_outstanding` | **0** | empty view | **DEAD** — yet `getMyCredit` READS it → credit panel shows ฿0 for all. | 🔴 `actions/credit.ts` (live, on `/wallet`). |
| `tb_shop_transactions` | **0** | empty | the affiliate-shop loop runs here per `affiliate-shop-wallet.ts` but **no rows yet** → either unused or a latent gap. | ✅ `/admin/shop-payouts` reads it (shows 0). |

**Conclusion:** the money SOT is `tb_wallet`/`tb_wallet_hs`/`tb_payment`/`tb_header_order`. Every rebuilt twin is empty or a dead seed. This **confirms `_MASTER-FRESH`'s "money loop CLOSED" verdict at the data level** — and refines the prior claim that "wallet/wallet_transactions are empty": `wallet` actually has 8,939 zero-balance seed rows (a migration artifact), which is harmless because no live code reads it.

---

## 3. LEGACY GAPS (member + admin) — building on m2 + adding NEW admin finds

### 3a. Carried from `m2-money-loop.md` (customer side — still valid, verified)

| Ref | Gap | Sev | Status note |
|---|---|---|---|
| m2 #9 | **Customer credit-line dead for migrated customers** — `getMyCredit` reads empty `v_customer_credit_outstanding`; `customerPayCreditFromWallet` debits dead `wallet_transactions`. **24 customers have real `tb_credit.creditvalue>0`** but the `/wallet` "ชำระยอดค้างเครดิต" panel shows ฿0 → they cannot pay credit. Fails SAFE (no wrong debit). | **P1** | Repoint to legacy `tb_credit` + `tb_users` credit fields + `tb_wallet_hs.wusercredit`. NEW data point: 24 real customers affected (not "all 0"). |
| m2 #2 | **Wallet-partial + slip-shortfall model dropped** on ALL 3 pay surfaces (yuan / shop-order / forwarder). Legacy `QRPay.php` L23-30, `getListPay*.php` let wallet cover PART + PromptPay slip the remainder in one submit. Pacred is all-or-nothing. | **P1** | Not money-loss (full slip still works) but a real ×3 workflow regression. |
| m2 #3 | **Forwarder-import pay ignores existing wallet balance + cashback** — legacy `getListPayForwarder.php` deducts walletTotal+cashBack first, slips only the shortfall; Pacred treats whole bill as slip. | **P1** | — |
| m2 #1,#4,#6,#7 | Orphan dead-write twins on disk (createYuanPayment wallet branch · payForwarderFromWallet invoice button · /commissions page · deposit-form.tsx). | P1/P2 | Re-route landmines, not active. |
| m2 #5 | Customer forwarder self-cancel button inert. | P2 | Shipped since? (forwarder self-cancel was in 2026-06-01 marathon "customer ปอน lane"). Re-verify. |

### 3b. NEW admin-side finds (this sweep — not in m2 which was customer-only)

| # | Gap | Legacy file | Pacred | Sev | Detail |
|---|---|---|---|---|---|
| **A** | **Orphan dead yuan bulk-approve twin** | `payment.php` (yuan approve writes `tb_payment` + `tb_wallet_hs`) | `actions/admin/yuan-payments.ts::adminBulkApproveYuanPayments` (L295) | **P2** (latent) | The LIVE page renders `<TbYuanBulkBar/>` → `adminBulkApproveYuanPaymentsTb` (tb-bulk.ts) → faithful `tb_payment`/`tb_wallet`. ✅ But the OLD `bulk-approve-bar.tsx` + `adminBulkApproveYuanPayments` (reads/writes empty `yuan_payments` by UUID → "not_found" on every real row) is **still on disk, just not rendered**. Same for `adminSetYuanSlipTransferredAt` (writes `yuan_payments`, wired to `slip-transferred-at-cell.tsx`). **Re-route landmine** — delete `bulk-approve-bar.tsx`+`adminBulkApproveYuanPayments`; repoint slip-transferred to `tb_payment.slip_transfer_time`. *(Initially looked like a live dead-write; confirmed orphan after tracing page.tsx L289.)* |
| **B** | **`report-shop-group-by-user` missing** | `report-shop-group-by-user.php` | (no Pacred equiv) | **P2** | Legacy report = all shop-orders grouped per customer (spend/order-count per customer). Pacred has shops-profit + shops-profit-pay + shop, but NOT the per-customer rollup. Useful for sales/CS. |
| **C** | **Cashback NOT applied/debited at any pay step** | `getListPayForwarder.php` (cashBack folded into wallet math) | `actions/service-order.ts`, `cart.ts`, `payment-tb.ts`, `forwarder.ts` — `grep tb_cash_back` → NONE | **P1** | `tb_cash_back` (6 customers w/ balance) + `tb_cash_back_hs` exist + are seeded at register, but **no pay path reads or debits cashback**. The "use cashback at checkout" loop is unbuilt. Customers earn cashback they can never spend. (Overlaps m2 #3 for forwarder, but it's missing on shop + yuan too.) |
| **D** | **Affiliate shop-wallet has 0 rows on both schemas** | `wallet-shop/load_wallet_hs*.php` (`tb_shop_pay_h` family) | `actions/affiliate-shop-wallet.ts` → rebuilt `tb_shop_transactions` (0) | P2 | `tb_wallet_shop` (legacy, 0) AND `tb_shop_transactions` (rebuilt, 0) are both empty. Either ฝากขาย is genuinely unused, or the affiliate earn-loop never fired. Verify whether ฝากขาย is in-scope before launch. |
| **E** | **Yuan slip + real cost-rate on approve** (owner decision #9) | `payment.php` approve stamps `paythbcost`/`payprofitthb` | `tb-bulk.ts` bulk-approve + `actions-cell` | P1 | Per `_MASTER-FRESH` decision #9 "Yuan approve fidelity ต้องมี" — confirm the live `adminBulkApproveYuanPaymentsTb` + single-row `adminUpdateYuanPayment` stamp a real cost-rate (not just `payrate`) so margin isn't under-reported. (`yuan-payments-tb.ts` manual-create DOES compute `paythbcost`/`payprofitthb` L156-157 ✅; verify the approve paths do too.) |

### 3c. Confirmed FAITHFUL (no gap) — do NOT re-implement

- **Cart → order:** live path `/cart` → `submitCartOrder` (cart.ts) writes real `tb_header_order`+`tb_order`+`tb_promotion`, clears `tb_cart` (faithful `shops.php` L3-194). `/service-order/cart`→`placeServiceOrder` is a **redundant-but-faithful** twin (also pivoted to `tb_*`, L609) — only linked from a how-to doc page → cleanup candidate, not a gap.
- **Shop pay-from-wallet** (`payServiceOrderFromWallet`): debits `tb_wallet`, INSERT `tb_wallet_hs` type='2', flips `tb_header_order` 2→3, idempotent + rollback. ✅
- **Yuan pay-from-wallet** (`createYuanPaymentFromWallet`): debits `tb_wallet` type='6', INSERT `tb_payment` paystatus='1', idempotent + rollback. ✅
- **Customer withdraw** (`submitWithdrawRequest`): debit-HOLD `tb_wallet` + `tb_wallet_hs` type='3' status='1'. ✅
- **Admin shop disbursement** (`shop-disbursement.ts`): INSERT `tb_shop_pay_h`+`tb_shop_pay_sub`, flip `tb_header_order.hshoppay='1'`, eligibility via `tb_wallet_hs` join, full rollback (`#23` shipped). ✅ Reachable at `/admin/shop-disbursement`. *(Note: `/admin/shop-payouts` is a SEPARATE page reading the empty rebuilt `tb_shop_transactions` — the affiliate withdraw list, gap D.)*
- **Admin per-item refund** (`adminRefundShopOrderItem`): refunds `tb_wallet`+`tb_wallet_hs`, marks `tb_order.crewallet='1'`, rollback (P0-16 shipped). ✅ Reachable at `/admin/service-orders/[hNo]`.
- **Admin yuan single-row approve/refund** (`adminUpdateYuanPayment`, `adminMarkYuanPaymentRefunded`): write `tb_payment`+`tb_wallet`. ✅
- **Admin wallet manual adjust + deposit approve** (`wallet-hs.ts`): write `tb_wallet`+`tb_wallet_hs`+`tb_wallet_paydeposit`. ✅
- **Admin add-to-cart-on-behalf** (`adminAddCartUser`, `adminSubmitCartAsOrder`): faithful `cart.php` addCartUser. ✅
- **Shop→forwarder spawn** (`service-orders-spawn.ts`): faithful `shops/update/update4.php`. ✅
- **5-tab admin shop UPDATE** (P0-13) + **commission anti-tamper** (commissions-tb.ts, server-recompute): ✅.

---

## 4. MAX-POTENTIAL UPGRADES (ดึงศักยภาพสูงสุด)

Tagged effort (S/M/L) × value (P0/P1/P2). The 104,591-row `tb_wallet_hs` ledger + 124,345 `tb_order`
line items + 1,460 yuan transfers are a rich, under-leveraged dataset.

### Money-correctness hardening (do first)
1. **`U1` — Repoint customer credit-line to `tb_credit`/`tb_wallet_hs`** (S · **P1**). 24 real customers can't pay credit today. Highest "real customer affected / effort" ratio in this cluster.
2. **`U2` — Wire cashback into checkout** (M · **P1**). Build the "apply ฿X cashback" branch on shop + yuan + forwarder pay (debit `tb_cash_back`, log `tb_cash_back_hs`). Closes gap C — customers earn cashback with no way to spend it = silent retention leak + a marketing lever unused.
3. **`U3` — Restore wallet-partial + slip-shortfall** (M · P1). Match legacy `QRPay.php` across 3 pay surfaces — fewer abandoned payments (customer with ฿900 wallet + ฿1000 bill currently must pay the full ฿1000 by slip).
4. **`U4` — Delete the orphan dead-write twins** (S · P2). `bulk-approve-bar.tsx`+`adminBulkApproveYuanPayments`, `payForwarderFromWallet` invoice button, `/commissions` page, `deposit-form.tsx`, `createDeposit`, the `createYuanPayment` wallet branch, and the 8,939-row zero-balance `wallet` seed. Removes every re-route landmine + reduces audit surface.

### Ledger analytics + reconciliation (the owner's "ดึงศักยภาพ")
5. **`U5` — Wallet auto-reconciliation cron** (M · P1). Nightly job: assert `tb_wallet.wallettotal == SUM(tb_wallet_hs.amount signed by type, status='2')` per customer; alert on drift. With 104k ledger rows + 8,899 wallets, manual reconciliation is impossible — this catches any future dead-write before it loses money. (Pacred already has `actions/admin/reconciliation.ts` — verify it reads `tb_wallet_hs`, not the dead twin.)
6. **`U6` — Slip-OCR + auto-match** (L · P1). 1,460 yuan + thousands of forwarder/deposit slips are verified by hand. Run uploaded `imagesslip` through OCR (Google Vision / Typhoon-OCR Thai) → extract amount + transfer time + bank → auto-suggest match to the pending `tb_wallet_hs`/`tb_payment` row → admin one-click confirms. Huge fulfillment-speed win on the accounting team's #1 bottleneck.
7. **`U7` — `report-shop-group-by-user` + customer-LTV dashboard** (S→M · P2). Port the missing per-customer shop rollup, then extend: spend/order-count/avg-margin/cashback-earned per customer from `tb_header_order`+`tb_order`+`tb_payment`. Feeds sales prioritization + a "top customers" view the owner can act on.
8. **`U8` — Demand intelligence from `tb_order`** (M · P2). 124,345 line items carry `cnameshop`/`cprovider`/`ctitle`/`cprice` — mine top shops, trending products, price-band distribution, seasonal demand. Powers a "what to stock / what to promote" view + could seed the empty `tb_product`/`tb_keyword_product` catalog for a future search feature.
9. **`U9` — Margin-leak monitor** (S · P1). Per-order `(htotalpricechn+hshippingchn)*hrate − hratecost*hcostall` (owner decision #3) — flag orders shipped at <X% margin or ฿0 margin (a known footgun the resolve-rate waterfall guards against). Catch under-priced orders before they ship.
10. **`U10` — Cashback as a retention engine** (M · P2). Once U2 ships, make cashback a real loyalty lever: tiered cashback %, "spend cashback this month or lose it" nudges via the (now-fixed) `tb_notify_wp` broadcast, cashback on referral. The 8,810-row `tb_cash_back` table is currently inert capital.

---

## 5. COUNT (this cluster)

- **NEW finds this sweep:** A (orphan yuan bulk twin · P2), B (group-by-user report · P2), C (cashback-at-checkout unbuilt · **P1**), D (affiliate-shop 0 rows · P2), E (yuan approve cost-rate verify · P1).
- **Carried from m2 (still open):** credit-line dead ×24 customers (P1), wallet+slip shortfall ×3 (P1), forwarder wallet/cashback pre-apply (P1), 4 orphan twins (P1/P2).
- **Money-loss holes:** **ZERO live.** All confirmed dead-writes are orphan branches the live UI does not reach.

**P0: 0 · P1: ~5 · P2: ~5.** The cluster verdict matches `_MASTER-FRESH`: the money loop is closed on
the real `tb_*` ledger; the work left is cleanup + restoring two convenience features (credit-line,
cashback-at-pay) + leveraging the 104k-row ledger for reconciliation/OCR/analytics.
