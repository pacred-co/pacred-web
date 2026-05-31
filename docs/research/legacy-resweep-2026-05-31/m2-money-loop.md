# Re-sweep M2 — customer money loop · 2026-05-31

**Slice:** cart · shop-order · yuan-payment · wallet (deposit/withdraw/history) ·
affiliate-shop-wallet · forwarder-import · sales commission. Read-only audit,
verified flow-by-flow against the **live code at HEAD `6f570b53`** and the
2026-05-24 legacy extract (`/Users/dev/Desktop/pcs-realshit/.../member/`).

## Honest verdict

**The customer money loop is in MUCH better shape than the 2026-05-30 `_MASTER`
labelled it — most of its P0 dead-writes have shipped fixes and the UI routes to
the faithful action.** Every flow I verified writes the real legacy `tb_*` SOT
(`tb_cart`, `tb_header_order`+`tb_order`, `tb_payment`, `tb_wallet`+`tb_wallet_hs`,
`tb_forwarder`, `tb_user_sales` family) via the action the live UI actually imports,
with proper idempotency guards + partial-failure rollback. The wallet-paid yuan
(P0-2), customer withdraw (P0-7), shop pay-from-wallet (P0-6) and commission E2E
(P0-23) the master flagged as broken are all CLOSED. **No verified silent
double-spend exists in the live click-path.**

What remains is NOT death-gaps — it is **(a) one class of UX divergence repeated
3× (the legacy "wallet covers part, slip pays the shortfall" model is gone — every
Pacred pay-from-wallet path is all-or-nothing), (b) a handful of dead/orphan
rebuilt twins still on disk that a future edit could re-route to (the real risk is
latent, not active), and (c) two genuinely-missing small customer functions
(self-cancel a forwarder draft; cashback-applied-at-pay).** The single most
important caveat: the customer-side INSERT front-controllers (`cart.php`,
`payment.php`, `wallet/withdraw`, forwarder create POST) are **absent from this
extract** — so for those, "faithful" is judged against the admin-side twin +
surviving AJAX handlers + the schema, not the original customer POST. Where a
legacy file is missing I say so.

Counts at the bottom.

---

## Ledger (gaps + risks only — DONE/faithful flows omitted unless load-bearing)

| # | Flow | Legacy file:line | Pacred file | Status | Writes which table | Sev | 1-line fix |
|---|------|------------------|-------------|--------|--------------------|-----|------------|
| 1 | **Yuan pay-from-wallet — dead rebuilt twin still on disk** | `pcs-admin/payment.php` (only `tb_payment` INSERT survives) | `actions/payment.ts::createYuanPayment` L401-422 | 💀 (latent) | rebuilt `wallet_transactions` (status=`pending`, NEVER settled by any live admin path) | P1 | the wallet-paid branch in `createYuanPayment` writes the dead `wallet_transactions`; UI never reaches it (form routes wallet→`createYuanPaymentFromWallet`), but it's a re-route landmine — delete the `if (d.paid_via_wallet){…}` block + retire the file |
| 2 | **Yuan/shop/forwarder pay — no wallet-partial + slip-shortfall** | `payment/QRPay.php` L23-30 · `index/getListPay.php` L128-137 · `index/getListPayForwarder.php` L262-271 (all: `payWallet = total − walletTotal`, show QR+slip for the *difference*) | `service-payment/yuan-payment-form.tsx` L72 · `actions/service-order.ts::payServiceOrderFromWallet` L988 · `actions/forwarder.ts::submitForwarderPayment` | ⚠️ | tb_wallet / tb_wallet_hs (all-or-nothing, no shortfall) | **P1** | legacy lets wallet cover PART and PromptPay slip cover the remainder in one submit; Pacred is binary (full-wallet OR full-slip, and blocks if wallet<total). Add a "wallet + slip-difference" branch (matches QRPay.php). Not money-loss (customer can still pay full slip) but a real workflow gap × 3 surfaces |
| 3 | **Forwarder-import pay does NOT apply existing wallet balance or cashback** | `index/getListPayForwarder.php` L262-352 (`totalPriceAll − walletTotal − totalNiTi`; cashBack via `tb_cash_back` folded into wallet math) | `actions/forwarder.ts::submitForwarderPayment` L1226-1253 (comment: "Wallet stays untouched") | ⚠️ | tb_wallet_hs (type='4' status='1' per row · slip-only) | **P1** | the legacy forwarder bill is paid wallet-first (deduct walletTotal + cashBack, slip only the shortfall); Pacred treats the WHOLE bill as a slip payment + never touches wallet/cashback. Faithful to forwarder.php L335-342 slip-INSERT but drops the wallet/cashback pre-apply from getListPayForwarder.php |
| 4 | **Forwarder "pay from wallet" button on the INVOICE sub-page is dead** | (Pacred-added surface; no legacy equiv) | `service-import/[fNo]/invoice/page.tsx` L451-457 → `pay-from-wallet-button.tsx` → `actions/forwarder.ts::payForwarderFromWallet` L753 | 💀/🔌 | reads rebuilt `forwarders` + debits rebuilt `wallet_transactions` | P2 | the invoice page reads `tb_forwarder` (real order) but the button calls `payForwarderFromWallet` which queries rebuilt `forwarders` by f_no → real orders return `not_found` → **button errors loud, never debits** (NOT a double-spend). Working path (`submitForwarderPayment`) is 1 click away on the list/detail. Repoint the button or remove it |
| 5 | **Customer self-cancel/delete a forwarder draft — INERT button** | `forwarder/deleteForwarder.php` (DELETE `tb_forwarder` WHERE `fStatus='1' AND refOrder='' AND userID=own`) | `service-import/forwarder-row-view.tsx` L527-531 ("ลบรายการ" → jQuery `#delete-forwarder`, **no server action wired**) | ❌ | — (no write happens) | P2 | the "ลบรายการ" button exists in the UI but the only `deleteForwarder` server actions are admin-side (combine-bill / warehouse-history). Add a customer action mirroring deleteForwarder.php (owner+fStatus=1+refOrder='' guard). Low money-risk (only blocks deleting an un-submitted draft) |
| 6 | **`/commissions` page = dead rebuilt twin of `/sales`** | `report-user-sales/getListForwarder.php` + `pcs-admin/report-user-sales.php` (write `tb_user_sales` family) | `commissions/page.tsx` + `actions/commissions.ts::requestCommissionWithdraw` L392-461 | 💀/🔌 | rebuilt `team_leaders`+`sales_commissions`+`sales_payouts` (0013 · empty on prod) | P2 | NOT linked from any sidebar (the live commission lane is `/sales/*` → faithful `commissions-tb.ts` → `tb_user_sales`). `/commissions` is a URL-only orphan whose own page links out to `/sales/report`. Delete the page + retire `commissions.ts` |
| 7 | **Orphan dead deposit form + action still on disk** | `wallet.php` deposit POST (writes `tb_wallet_hs` type='1') — *front-controller absent from extract* | `wallet/deposit/deposit-form.tsx` (orphan) → `actions/wallet.ts::createDeposit` L215-274 | 💀 (orphan) | rebuilt `wallet_transactions` (kind='deposit') | P2 | the active `/wallet/deposit` + `/wallet-credit` render `LegacyDepositForm` → faithful `submitLegacyWalletDeposit` (tb_wallet_hs type='1'). `deposit-form.tsx`+`createDeposit` are imported by NO page (orphan) — delete both |
| 8 | **Affiliate shop-wallet runs on Pacred-native schema, not legacy** | `wallet-shop/load_wallet_hs*.php` (legacy `tb_shop_pay_h` family) | `actions/affiliate-shop-wallet.ts` (whole file) | ⚠️ | rebuilt `tb_wallet_shop` + `tb_shop_transactions` (migration 0104, profile_id UUID) | P2 | DELIBERATE divergence (docblock L8-10 admits legacy `tb_shop_pay_h` "preserved for historical joins" but balance flows through new tables). Internally consistent (debit/credit + pending-lock + bank fields on row); loop closes IF the admin payout console reads `tb_shop_transactions` (admin-lane — out of this slice; verify separately). Not money-loss, but not a faithful port |
| 9 | **Customer credit-line ("ชำระยอดค้างเครดิต") runs entirely on rebuilt schema → non-functional for migrated customers** | legacy credit = `tb_users` credit fields + `tb_wallet_hs.wUserCredit` flag | `actions/credit.ts` (`getMyCredit` + `customerPayCreditFromWallet`) ← `wallet/credit-panel.tsx` (reachable on /wallet) | 💀 | reads rebuilt `v_customer_credit_outstanding` view (empty for migrated) + debits rebuilt `wallet_transactions` | **P1** | the whole credit subsystem reads the rebuilt view (returns 0 outstanding for all 8,898 migrated customers → panel shows ฿0 → customer cannot pay) and would debit the dead `wallet_transactions` not `tb_wallet`. Fails SAFE (no wrong debit because nothing to pay), but the credit feature is dead for real customers. Repoint to the legacy `tb_users` credit + `tb_wallet_hs` model |

---

## Money-correctness holes (verified — any path where customer money could be lost or double-spent)

**None that are live + silent.** Every path I traced either debits the real
`tb_wallet` correctly or fails loud. Specifically:

- **No live double-spend.** The two latent double-spend vectors the 2026-05-30
  master worried about are both NOT reachable in the live click-path:
  - **Yuan wallet-paid (#1):** `createYuanPayment`'s dead-write branch (writes a
    `pending` `wallet_transactions` row, never settling `tb_wallet`) is real, but
    `yuan-payment-form.tsx` L91-92 routes the wallet-paid case to
    `createYuanPaymentFromWallet` (payment-tb.ts) — which **does** debit `tb_wallet`
    synchronously with an idempotency probe (`tb_wallet_hs` WHERE type='6' reforder=id)
    + rollback. The dead branch only fires if a future edit re-points the form. → P1 cleanup, not active P0.
  - **Forwarder wallet-paid (#4):** the dead `payForwarderFromWallet` reads rebuilt
    `forwarders` by f_no; a migrated order has no rebuilt row → `not_found` → the
    button errors, never debits the wrong wallet. → broken button (P2), not a leak.

- **Debit timing is correct on every live path.** Verified DEBIT-on-submit
  (ADR-0018 §D-2 rule 1) actually decrements `tb_wallet.wallettotal`:
  - shop pay-from-wallet (`payServiceOrderFromWallet`) — reads balance, refuses
    overdraw, INSERT `tb_wallet_hs` type='2' status='2', UPDATE `tb_wallet` −total,
    flip `tb_header_order` 2→3 + idempotency probe (reforder+type='2'+status='2') + rollback. ✅
  - yuan pay-from-wallet (`createYuanPaymentFromWallet`) — same shape, type='6'
    status='2', INSERT `tb_payment` paystatus='1' + idempotency + rollback. ✅
  - customer withdraw (`submitWithdrawRequest`) — debit-HOLD: UPDATE `tb_wallet`
    −amount + INSERT `tb_wallet_hs` type='3' **status='1'** (admin confirms payout;
    reject refunds). Correct per the resolved ADR carve-out. + 60s dup-guard + rollback. ✅

- **Ledger SOT is correct.** All live wallet movements hit `tb_wallet` /
  `tb_wallet_hs` (the legacy SOT with the real balances), NOT the rebuilt
  `wallet`/`wallet_transactions` (empty on prod). The rebuilt tables survive only
  in the dead/orphan twins (#1, #4, #7) and the affiliate native schema (#8).

- **Anti-tamper on commission** (`submitSalesWithdrawal`, commissions-tb.ts):
  amount is **recomputed server-side** from live `tb_forwarder.fTotalPrice−fDiscount`
  over re-validated team-owned unpaid rows — client cannot inflate the payout.
  1%/3% WHT/min-1,000 constants match legacy `getListForwarder.php` L160-174 exactly. ✅

**One thing to watch (not a hole, but unverified here):** the slip-paid yuan
(`createYuanPayment`, !wallet branch) and forwarder slip-pay (`submitForwarderPayment`)
write `tb_payment.paystatus='1'` / `tb_wallet_hs.status='1'` and rely on the **admin
verify** step to settle. I did not audit the admin-side settle/approve/refund for
these (admin lane). If the admin yuan-approve / forwarder-verify is itself a
dead-write, the slip-paid loop wouldn't close — flag for the admin-slice sweep.

---

## Newly-found (NOT in the 2026-05-30 `_MASTER`)

These are issues the master gap audit did not call out (it pre-dated the fixes
and the dual-surface drift the fixes introduced):

1. **`createYuanPayment`'s wallet-paid branch is a live dead-write block** (#1).
   The master listed P0-2 as "createYuanPayment writes rebuilt wallet_transactions"
   and the fix added `createYuanPaymentFromWallet` — but **left the dead branch in
   `createYuanPayment`** instead of deleting it. It's a re-route landmine, not just
   a tombstone (the slip-paid path shares the same function).

2. **Forwarder invoice-page "pay from wallet" button → dead `payForwarderFromWallet`**
   (#4). A second forwarder-pay surface (`/service-import/[fNo]/invoice`) wired to
   the rebuilt action while the primary pay path (list + detail) uses the faithful
   `submitForwarderPayment`. Dual-surface drift the master didn't catch.

3. **`/commissions` page is a fully-orphaned rebuilt twin of `/sales`** (#6).
   The master's P0-23 fix shipped `commissions-tb.ts` on `/sales/*` but left
   `/commissions` + `commissions.ts` writing the dead 0013 tables. URL-reachable
   only; no nav links to it.

4. **Orphan `deposit-form.tsx` + `createDeposit`** (#7) — the deposit equivalent
   of the withdraw tombstone, imported by no page (the faithful `LegacyDepositForm`
   won). Pure cleanup.

5. **Wallet-shortfall model dropped across ALL 3 pay surfaces** (#2). The master
   flagged P1-22 (QRPay shortfall) for yuan only; in fact shop-order pay AND
   forwarder pay also lost the legacy "wallet + slip-difference" behavior. It's a
   3-surface pattern, not a single yuan gap.

6. **Customer forwarder self-cancel button is inert** (#5) — UI present, no action.

7. **Customer credit-line subsystem is built entirely on rebuilt schema** (#9) —
   `getMyCredit` reads `v_customer_credit_outstanding` (empty for migrated) +
   `customerPayCreditFromWallet` debits `wallet_transactions`. The "ชำระยอดค้างเครดิต"
   panel is mounted on `/wallet` but shows ฿0 for every real customer → dead feature.

---

## Count

**P0: 0 · P1: 4 · P2: 5**

- P1 = #1 (latent dead-write re-route landmine), #2 (wallet+slip shortfall ×3),
  #3 (forwarder wallet/cashback pre-apply missing), #9 (credit-line subsystem dead
  for migrated customers — fails safe but non-functional).
- P2 = #4 (dead invoice pay button), #5 (inert self-cancel), #6 (`/commissions`
  orphan twin), #7 (orphan deposit form), #8 (affiliate native-schema divergence).

> The headline for the owner: on the customer money loop, **legacy does NOT have a
> lot left that Pacred is missing in a way that loses money.** The core debit/credit/
> withdraw/commission loop is faithful and closes on the real `tb_*` tables. What's
> left is mostly cleanup of dead rebuilt twins + restoring the legacy "pay part from
> wallet, slip the rest" convenience + two small customer self-service buttons.
