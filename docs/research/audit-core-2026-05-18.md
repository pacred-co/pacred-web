# Core launch-code audit — 2026-05-18

> **Read-only rigorous audit** of the CORE launch code — everything that
> shipped to `main` BEFORE the U1/U2 batches. Lens: money-safety · security
> (RLS / authz / IDOR) · correctness. Same rigor that found the U1/U2 P0 in
> [`review-u1-u2-2026-05-18.md`](review-u1-u2-2026-05-18.md), now applied to
> the launch core.
>
> **Scope (CORE only — U1/U2 explicitly NOT re-reviewed):** auth (register /
> login / OTP / reset / phone-change), wallet money (deposit / withdraw /
> ledger / pay-from-wallet / 0064 overdraw guard), order + forwarder payment,
> the existing freight invoice/payment stack (0050-0057), tax-invoice + WHT,
> the W-1 security work (0062 RLS role-pins · `requireAdmin` page gates ·
> `lib/auth/owned-write.ts`), yuan-transfer money path.
>
> Traced against branch `dave` HEAD `003ce6d`. `pnpm test:unit` — all pass.
>
> **Companion audits cross-referenced:**
> [`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md) ·
> [`prelaunch-verification-2026-05-17.md`](prelaunch-verification-2026-05-17.md) ·
> [`gap-schema-security.md`](gap-schema-security.md) ·
> [`review-u1-u2-2026-05-18.md`](review-u1-u2-2026-05-18.md).

---

## 1. Verdict

**🟢 GO-confidence on the core launch code — HIGH, with one P1 to fix in
launch week.** Every prior-audit P0 (forwarder cost-adjustment idempotency
poisoning · yuan wallet-debit RLS block · freight free-shipment · W-1
driver/warehouse RLS escalation) is **confirmed fixed and verified
line-by-line** below (§4). The money math is correct. The W-1 RLS keystone
(`0062`) genuinely re-pins every money/PII/order policy — re-verified against
`0015` + every post-0033 money migration.

**One NEW P1** was found: the `wallet_tx_insert_self_serve` RLS policy
(migration `0007`) lets an authenticated customer INSERT a self-serve
`wallet_transactions` row with **no amount-sign constraint** — a direct
PostgREST `kind='withdraw', amount=+50000` (a *credit* mislabelled as a
withdraw) sits as `pending` and, if an admin approves it, **inflates the
customer's balance with money that never entered Pacred**. Exploitable but
needs an admin approval click — hence P1, not P0. Detail in §3 (C-1).

The rest are P2s — the known-and-accepted concurrent-overdraw P1-1 (re-confirmed
unchanged), a wallet-tx transition-guard gap the money audit already named as
P1-5, and minor items.

| Severity | Count |
|---|---|
| **P0** | **0** |
| **P1** | **1** (C-1) |
| **P2** | **4** (C-2 · C-3 · C-4 · C-5) |

---

## 2. Findings table

| ID | Severity | Area | File | One-line |
|---|---|---|---|---|
| C-1 | **P1** | Wallet RLS / money integrity | `supabase/migrations/0007_wallet.sql:206-213` | `wallet_tx_insert_self_serve` has no amount-sign check → direct PostgREST `kind='withdraw'`/`'deposit'` self-insert can be admin-approved into free balance |
| C-2 | P2 | Wallet money integrity | `actions/admin/wallet.ts:26-66` | `adminUpdateWalletTransaction` still has no status-transition guard (= money-audit P1-5, unfixed) — `completed→pending` un-settles a balance |
| C-3 | P2 | Wallet concurrency | `actions/service-order.ts:560-609` · `actions/forwarder.ts:599-637` | Concurrent pay-from-wallet on two DIFFERENT orders still overdraws (= money-audit P1-1 / gap S-5, accepted post-launch) |
| C-4 | P2 | Tax compliance | `actions/tax-invoices.ts:160-168` | `requestTaxInvoice` snapshots customer-typed `buyer_tax_id` with no check against verified `corporate.tax_id` (= gap G-7) |
| C-5 | P2 | OTP / SMS abuse | `actions/otp.ts:51-93` | `requestOtp` has no IP/global cap — distinct-phone scripting drains the paid SMS balance (= gap S-6) |

Everything else traced **clean** — see §3 closing note + §5.

---

## 3. Per-finding detail

### C-1 — `wallet_tx_insert_self_serve` permits a sign-flipped self-serve debit/credit (P1, money integrity)

- **File:** `supabase/migrations/0007_wallet.sql:206-213` (the RLS INSERT policy).
- **Severity: P1** — money can be created on the ledger; needs an admin
  approval click to land, so not P0, but it is a genuine balance-inflation hole
  and the admin sees a plausible-looking row.
- **What's wrong.** The self-serve INSERT policy is:
  ```sql
  create policy "wallet_tx_insert_self_serve" on public.wallet_transactions
    for insert with check (
      auth.uid() = profile_id
      and status = 'pending'
      and kind in ('deposit','withdraw')
      and bucket = 'main'
    );
  ```
  It constrains `profile_id`, `status`, `kind`, `bucket` — but **never the sign
  of `amount`**. The application actions are disciplined (`createDeposit`
  inserts `+amount`; `createWithdraw` inserts `-d.amount`, `lib/validators/
  wallet.ts` forces a positive input). But RLS is the *only* gate on a write
  that bypasses the action — an authenticated customer can hit PostgREST
  directly with their own anon-key JWT.
- **The exploit.**
  1. Customer POSTs to PostgREST:
     `INSERT wallet_transactions (profile_id=self, bucket='main', amount=+50000, kind='withdraw', status='pending')`.
     The `with check` passes (kind `withdraw` ∈ set, status `pending`, bucket
     `main`, profile is self). The `0064` overdraw trigger does **not** fire:
     `new.amount < 0` is false → `v_new_contrib = 0` → no block (the guard only
     blocks *negative* pending debits).
  2. The row now sits as a `pending` "withdraw" of **+50000**. `wallet.balance`
     (the `0007` recompute trigger sums only `completed`) is unmoved so far;
     `getWalletAvailableBalance` counts a pending row only when `amount < 0`, so
     spendable balance is unmoved too. No immediate damage.
  3. An accounting admin processes the withdraw queue and approves it via
     `adminUpdateWalletTransaction` / `adminBulkApproveDeposits`-style flip
     `pending → completed`. The recompute trigger now sums `+50000` →
     **`wallet.balance` jumps +50000** — money that never entered Pacred. A
     "withdraw" is supposed to *debit*; a positive-amount one *credits*.
  - A parallel variant: a direct `kind='deposit', status='pending'` insert with
    **no slip** also passes RLS (`createDeposit`'s slip validation is
    app-layer); `adminBulkApproveDeposits` filters only `kind='deposit'` +
    `status='pending'` → it bulk-approves a slip-less self-inserted deposit →
    free balance.
- **Why it matters.** It is the same *class* as the prior-audit RLS-vs-action
  findings (P0-2, S-2): the action layer is careful, RLS is loose, so the
  durable safety lives only in convention. The blast radius here is direct
  balance inflation. The mitigating factor (admin must approve) keeps it P1 —
  but the admin has nothing in the UI telling them a "withdraw request" carries
  a positive amount, and `adminUpdateWalletTransaction` applies the flip with no
  sign sanity-check.
- **Suggested fix.** Tighten the policy `with check` to bind the sign to the
  kind — e.g. `and ((kind = 'deposit' and amount > 0) or (kind = 'withdraw'
  and amount < 0))`. A small idempotent migration. As defence-in-depth, also
  add a sign assertion in `adminUpdateWalletTransaction` before a
  `* → completed` flip (reject a `completed` `withdraw` with `amount >= 0`, a
  `completed` `deposit` with `amount <= 0`).
- **Owner: เดฟ-safe-to-fix.** It is a policy-predicate tightening + an action
  guard, no domain modelling. (A `CHECK` on `wallet_transactions` keyed on
  `kind`+sign would be even stronger and is also เดฟ-safe.)

### C-2 — `adminUpdateWalletTransaction` has no status-transition guard (P2)

- **File:** `actions/admin/wallet.ts:26-66`.
- **This is money-audit P1-5, and it is still unfixed.** `updateSchema` accepts
  any `status ∈ {pending,completed,failed,cancelled}`; the action applies it
  with only an `existing.status === d.status` no-op short-cut (line 39) — **no
  `from→to` allow-list**. So an accounting admin (or a buggy UI) can move a tx
  `completed → pending`, and `wallet_recompute_balance` will **drop the
  balance**. If that tx was an `order_payment` debit for an order already at
  `ordered`, the order stays `ordered` while the money un-debits — order/wallet
  desync.
- **Why P2 not P1:** it needs an admin to do a non-sensical backward flip;
  contrast the yuan path (`actions/admin/yuan-payments.ts:34-46`) and the
  forwarder/freight paths, which DO have proper transition guards — wallet is
  the odd one out. The `0062` G-6 DB-trigger audits the flip, so it is at least
  attributable.
- **Suggested fix.** Add a per-from-status allow-list mirroring
  `YUAN_STATUS_TRANSITIONS`: permit `pending → completed|failed|cancelled` and
  `completed → cancelled` (the one legitimate reversal); forbid `* → pending`
  from `completed`. For an `order_payment`/`import_payment` reversal, also walk
  the linked order back (or block it and require the order action).
- **Owner: เดฟ-safe-to-fix** (pure allow-list, same shape as the yuan guard
  already in the tree).

### C-3 — concurrent pay-from-wallet on two different orders overdraws (P2, accepted)

- **Files:** `actions/service-order.ts:545-558,560-609` ·
  `actions/forwarder.ts:584-637` · `actions/admin/service-orders.ts:206-241` ·
  `actions/admin/forwarders.ts:324-356`.
- **This is money-audit P1-1 / gap-schema-security S-5 — re-confirmed unchanged
  and correctly remains a known accepted P1.** `payServiceOrderFromWallet` /
  `payForwarderFromWallet` each do read-`getWalletAvailableBalance`-then-insert
  a `status='completed'` debit. The `0049`/`0061` partial-unique indexes stop
  paying the *same* order twice; they do **not** stop a customer with ฿1000
  paying **two different ฿1000 orders** (or one order + one forwarder)
  concurrently — both reads see ฿1000, both pass, both INSERT distinct
  `reference_id`s (no 23505), `wallet.balance` lands at -฿1000.
- **Verified the `0064` trigger deliberately does not cover this:** the migration
  header and `wallet_assert_no_overdraw()` body both early-return on
  `new.status <> 'pending'` — `completed` debits are out of scope by design.
  There is **no `CHECK (balance >= 0)`** on `public.wallet` (confirmed —
  `0007_wallet.sql:45-49`, `balance numeric(12,2) not null default 0`).
- **Why P2 here:** it needs deliberate concurrency (two tabs, same second), the
  loss is bounded by the order totals, and it is reconcilable from the ledger.
  Both prior audits rated it P1 and explicitly deferred it post-launch — this
  audit agrees, no re-escalation.
- **Suggested fix (post-launch).** Make the balance-check + debit atomic: a
  Postgres function doing `SELECT ... FOR UPDATE` on the `wallet` row, re-check
  `available >= amount`, then insert — or extend the `0064` trigger to also
  guard `completed` main-bucket debits behind the same `FOR UPDATE` floor.
- **Owner: ภูม-domain** (DB-function design touching the wallet spine — pairs
  with the R-7 ledger work).

### C-4 — `requestTaxInvoice` trusts customer-typed `buyer_tax_id` (P2, RD compliance)

- **File:** `actions/tax-invoices.ts:43-118,160-168`.
- **This is gap-schema-security G-7 (the `tax_id` half).** `requestTaxInvoice`
  writes `buyer_name` / `buyer_address` / `buyer_tax_id` straight from the form
  into the `tax_invoices` row (the immutable RD Code-86 snapshot). It verifies
  the customer **owns the source order**, and recomputes the *amount*
  server-side — both good — but it never checks the typed `buyer_tax_id`
  against the customer's own verified `corporate.tax_id`. `corporate` carries a
  `status='verified'` flag; **nothing requires it** before issuance. A juristic
  customer can request a Code-86 invoice under an arbitrary 13-digit tax ID.
- **Why P2:** issuance is admin-gated (`issueTaxInvoice`, super/accounting) — a
  human reviews before the serial is burned — so it is a process risk, not an
  automatic one. But the admin UI does not surface "typed ID ≠ verified ID", so
  the check is easy to miss.
- **Suggested fix.** Default `buyer_tax_id` from `corporate.tax_id` and either
  reject a mismatch or flag it loudly on the admin issue screen; consider
  requiring `corporate.status='verified'` before `issueTaxInvoice` proceeds.
- **Owner: ภูม-domain** (tax-invoice flow + corporate-verification policy —
  ADR-0006 territory).

### C-5 — `requestOtp` has no IP / global cap (P2, SMS-cost abuse)

- **File:** `actions/otp.ts:51-93`.
- **This is gap-schema-security S-6.** `requestOtp` rate-limits **3/hour/phone**
  off the `otp_codes` table. The IP-keyed `checkRateLimit` lives on the *outer*
  actions (`registerPersonal`, `requestPasswordResetByPhone`, etc.) — but
  `requestOtp` is itself an exported server action, and `requestPhoneChangeOtp`
  reaches it after only a password check. An attacker scripting thousands of
  distinct phone numbers burns the paid ThaiBulkSMS balance (each request = one
  real SMS) and can starve genuine signups — the adversarial twin of the legacy
  "OTP credit ran dry → 14h dead signups" incident.
- **Note:** `OTP_BYPASS=true` short-circuits `requestOtp`/`verifyOtp` to a
  no-op/`true` — must be verified OFF in prod (env checklist item; no runtime
  guard exists).
- **Suggested fix.** Add an IP-keyed `checkRateLimit` *inside* `requestOtp`
  (e.g. 10/h/IP) + a global daily ceiling with a Sentry/LINE alert on the SMS
  balance.
- **Owner: เดฟ-safe-to-fix** (one `checkRateLimit` call + a counter; the
  `rate-limit.ts` infra already exists — there is even an `otpVerify` bucket to
  copy).

### Closing note — items checked and found clean

- **Money math** — yuan `thb_amount = round2(yuan × rate)`, order
  `total_thb = round2(subtotal_cny × yuan_rate + service_fee)`, tax-invoice
  inclusive-VAT (`vat = total − subtotal`), forwarder `calcPrice`, WHT
  (`computeWhtNumbers`), freight value block — all recomputed **server-side**
  from the `settings` table / rate tables, never trusting client input. The
  money audit §3 verified the formulas; unchanged here.
- **`assertOwnedProfileId`** is in use at all three admin-client customer-write
  debit sites (`payServiceOrderFromWallet:574`, `payForwarderFromWallet:608`,
  `createYuanPayment:138`) — the S-2 ownership check is structural, not
  convention.
- **Auth** — `signIn` (login 10/h IP), `registerPersonal`/`registerJuristicStep1`
  (signup 5/h IP + hCaptcha), `confirmPasswordResetByPhone` + `confirmPhoneChange`
  (both `otpVerify` 10/h IP — the S-3 fix), `verifyOtp` (5-attempt/row cap +
  TTL + dual-pepper) — all gated correctly.
- **Idempotency** — `requestTaxInvoice` (0061 partial-unique + 23505 catch),
  `payForwarderFromWallet` / `adminMarkForwarderPaid` (0061
  `wallet_tx_import_payment_uniq`), `payServiceOrderFromWallet` /
  `adminMarkServiceOrderPaid` (0049), `recordFreightPayment` (0061
  `freight_payment_bank_ref_uniq`), `issueTaxInvoice` /
  `adminIssueFreightInvoice` / `adminCancelFreightInvoice` (optimistic
  `.eq("status", …)` guards) — all present.
- **Freight wallet bridge** (`0063` + `debitWalletForFreightPayment`) — a
  `method='wallet'` freight payment writes a real `completed` debit and
  auto-voids the payment row if the debit fails; `voidFreightPayment` reverses
  it. The G-3 free-shipment leak is closed.
- One **minor correctness nit** (not listed as a finding — no money impact):
  `adminIssueFreightInvoice` (`freight-invoices.ts:421-425`) uses an optimistic
  `.eq("status","draft")` but does not check the affected-row count — a
  concurrent double-issue lets the loser proceed to `logAdminAction` + return
  `{ok:true}` with a reserved-but-unwritten `invoice_no` (a wasted serial). RD
  Code 86 tolerates documented gaps; recoverable; flag for a post-launch tidy.

---

## 4. Prior-audit P0s — fixed?

Every P0 raised by the three prior audits, re-verified line-by-line on `dave`
HEAD `003ce6d`:

| Prior P0 | Source | Status | Evidence |
|---|---|---|---|
| **P0-1** — forwarder cost-adjustment `wallet_tx` poisons the main-payment idempotency check (kind/ref tuple collision) → main forwarder debit silently skipped | money-billing | ✅ **FIXED** | `0061` adds `'cost_adjustment'` to the `wallet_transactions.kind` CHECK; `adminMarkCostAdjustmentPaid` writes `kind='cost_adjustment'`; the idempotency SELECTs in `payForwarderFromWallet` (`forwarder.ts:537`) + `adminMarkForwarderPaid` (`forwarders.ts:306`) filter `.eq("kind","import_payment")` → a cost-adjustment row can no longer match. `0061` also adds `wallet_tx_import_payment_uniq` as the DB backstop. |
| **P0-2** — yuan wallet-paid debit RLS-blocked → customer never charged, transfer shipped free | money-billing | ✅ **FIXED** | `createYuanPayment` (`payment.ts:132-154`) inserts the debit via `createAdminClient()`, wraps the payload in `assertOwnedProfileId(user.id, …)`, **checks `walletErr`**, and on failure **deletes the orphan `yuan_payments` row** + returns an error. The silent-RLS-reject path is gone. |
| **S-1 / W-1** — `warehouse`/`driver` admin roles get full wallet/order/PII RLS write via bare `is_admin()` on every `0015` write policy | gap-schema-security | ✅ **FIXED** | `0062` re-pins **every** money/PII/order/pricing `*_admin_all` policy to an explicit role array (`array['super','accounting','ops']` etc.). Cross-checked all 25 bare-`is_admin()` policies in `0015` + `0016` `containers` + `0030` `container_hs_lines` — all role-pinned. Verified the post-0033 money migrations (`0034` tax-invoices, `0038` cost-adj, `0044` WHT, `0048-0052` freight quotes/shipments/invoices/payments, `0054` commissions, `0056` accounting-periods, `0057` customs, `0058` refunds) **already** ship role-pinned policies. `0033` cargo_* policies are correctly pinned (`super/ops/warehouse`, +`driver` only on the scan-tracking table). |
| **S-2** — `createAdminClient` ownership pattern IDOR-fragile (latent) | gap-schema-security | ✅ **MITIGATED** | `lib/auth/owned-write.ts` (`assertOwnedProfileId` / `assertOwnsRecord`, `server-only`) is the un-skippable structural check; confirmed **in use** at the 3 customer-write debit sites. The pattern is now type-enforced — a future edit dropping the check fails to compile or visibly loses a line. |
| **G-3** — freight `method='wallet'` payment does not debit the wallet → free shipment | gap-schema-security | ✅ **FIXED** | `0063` adds `'freight_invoice'` to `wallet_transactions.reference_type` + `wallet_tx_freight_payment_uniq`; `recordFreightPayment` → `debitWalletForFreightPayment` writes a real `completed` debit and **auto-voids** the freight payment row if the debit fails. |
| **H-1 / 0064** — aggregate-pending overdraw (stacked pending withdraw / wallet-yuan each pass, overdraw on bulk approval) | prelaunch-verification | ✅ **FIXED** | `0064` adds `wallet_available_balance()` + the `wallet_assert_no_overdraw()` BEFORE-trigger with a `FOR UPDATE` lock — the hard non-negative floor for customer-side pending main-bucket debits. `lib/wallet/balance.ts` mirrors the rule for the friendly fast-path check. |
| **F-1** — `0053` missing from the migration README apply-list | prelaunch-verification | runbook — out of audit scope (and `0053` shipped pre-U1) | Noted; this audit covers code, not the runbook index. |
| **F-2** — `/admin` dashboard had no role gate (driver/warehouse see revenue) | prelaunch-verification | ✅ **FIXED** | `app/[locale]/(admin)/admin/page.tsx:19` now calls `requireAdmin(["ops","accounting","sales_admin"])` (super implicit). The H-2 hole the prelaunch audit left open is closed. |
| **F-3** — `getFreightReceiptGate()` was a hardcoded `{blocked:false}` no-op | prelaunch-verification | ✅ **FIXED** | `getFreightReceiptGate` (`freight-invoice-payments.ts:615-642`) now queries `withholding_tax_entries` by `freight_invoice_id` for a `cert_status='pending'` row and returns `{blocked:true,reason:'wht_cert_pending'}`; stale comments replaced with the U2-3 wire-up note. |

**Pre-existing accepted P1 (not a regression):** money-audit **P1-1** /
gap **S-5** — concurrent pay-from-wallet on two different orders. Re-confirmed
unchanged → this audit's **C-3**, correctly post-launch.

**Conclusion: all prior P0s are confirmed fixed.** The fixes are real,
landed on `dave`, and verified at the line level — not just claimed.

---

## 5. Scope-coverage note

Traced and found clean (no finding raised): `signIn` / `signOutAction` /
`registerPersonal` / `registerJuristicStep1` / `saveJuristicStep2` /
`uploadJuristicDoc` / `completeJuristicRegistration` / password-reset (phone +
email) / `changePassword` / `requestPhoneChangeOtp` / `confirmPhoneChange` /
`requestOtp` / `verifyOtp` · `getWallet` / `listWalletTransactions` /
`createDeposit` / `createWithdraw` · `placeServiceOrder` /
`payServiceOrderFromWallet` / `cancelServiceOrder` · `createForwarder` /
`payForwarderFromWallet` · `createYuanPayment` / `adminUpdateYuanPayment` /
`adminBulkApproveYuanPayments` · `adminMarkServiceOrderPaid` /
`adminMarkForwarderPaid` / `adminUpdateServiceOrder` / `adminUpdateForwarder` ·
`recordFreightPayment` / `voidFreightPayment` / `adminIssueFreightInvoice` /
`adminCancelFreightInvoice` / `getFreightReceiptGate` · `requestTaxInvoice` /
`issueTaxInvoice` / `cancelTaxInvoice` · `createWhtEntry` /
`markWhtCertReceived` / `waiveWhtCert` / `cancelWhtEntry` / `uploadWhtCert` /
`customerUploadWhtCert` · `lib/auth/require-admin.ts` / `lib/auth/owned-write.ts`
/ `lib/wallet/balance.ts` / `lib/rate-limit.ts` / `lib/hcaptcha.ts` /
`lib/forwarder/billing-gate.ts` / `proxy.ts` · migrations `0007` / `0015` /
`0033` / `0034` / `0038` / `0044` / `0048-0052` / `0054` / `0056-0058` / `0049`
/ `0061` / `0062` / `0063` / `0064`.

One observation worth a note for ภูม (not a finding — likely intentional per
ADR-0015 Q2 V1.1 self-serve): `customerUploadWhtCert` lets a juristic customer
self-flip their own WHT row `cert_status` `pending → received` by uploading
*any* PDF/JPG — which then un-blocks `issueTaxInvoice` / `adminIssueFreightInvoice`.
A customer can therefore bypass the "ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ" gate
with a junk file. If the gate is meant to guarantee a *valid* 50-ทวิ before the
receipt, an admin review step between customer-upload and `received` would
close it; if self-serve trust is the accepted V1.1 design, no change needed.
Confirm against ADR-0015 Q2.

---

**End — `audit-core-2026-05-18.md`.** Verdict: 🟢 core launch code is sound —
all prior P0s confirmed fixed, money math correct, W-1 RLS keystone verified.
One NEW P1 (C-1 — `wallet_tx_insert_self_serve` sign-flip) to fix in launch
week; four P2s for post-launch. Traced against `dave` HEAD `003ce6d`.
