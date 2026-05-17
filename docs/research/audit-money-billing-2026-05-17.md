# Money / Billing / Accounting Pre-Launch Audit — 2026-05-17

> Read-only audit. Launch is TOMORROW. Scope: every wallet / order-pay / yuan /
> forwarder / tax-invoice / WHT / freight-billing / sales-commission path.
> Auditor instruction from เดฟ: "เรื่องเงิน...อย่าให้พลาดให้บัค".

---

## 1. Summary + launch verdict

**Verdict: 🟡 LAUNCH-CONDITIONAL.** No bug that *destroys* money silently in the
normal happy path. But there are **2 P0 money-loss bugs** that fire on realistic
input (not exotic races) and **must be fixed before the cargo revenue path takes
real customers**. Several P1s should be fixed in launch week.

Money math (WHT / VAT / freight totals / forwarder price) is **correct** — all
verified below. All `pnpm test:unit` money tests pass (§4).

The dangerous theme: **idempotency / double-charge guards are inconsistent.**
Service-order pay has the F-11 DB guard (migration 0049). Yuan, forwarder, and
freight-payment do NOT have an equivalent — they rely on check-then-act SELECTs
that lose races, AND one of them shares a reference tuple that makes the
idempotency check itself misfire.

**P0 count: 2** — P0-1 (forwarder cost-adjustment poisons the main-payment
idempotency check → main payment silently skipped) · P0-2 (yuan wallet-paid
debit is RLS-blocked → customer's wallet is never debited but the payment
proceeds → Pacred ships the transfer for free).

---

## 2. BUGS

### P0-1 — Forwarder cost-adjustment tx poisons the main-payment idempotency check (money LOSS)

- **Files:**
  - `actions/admin/forwarder-cost-adjustments.ts:158-172` (writes the colliding tx)
  - `actions/admin/forwarders.ts:266-283` (`adminMarkForwarderPaid` idempotency check)
  - `actions/forwarder.ts:529-539` (`payForwarderFromWallet` idempotency check)
- **Severity: P0 — money loss (Pacred under-collects a full forwarder bill).**
- **Root cause:** `adminMarkCostAdjustmentPaid` inserts a `wallet_transactions`
  row with `kind='import_payment'`, `reference_type='forwarder'`,
  `reference_id=f_no`, `status='completed'` (line 164-168). That is the **exact
  same (kind, reference_type, reference_id, status) tuple** used to record the
  *main* forwarder payment. The idempotency check in both `adminMarkForwarderPaid`
  and `payForwarderFromWallet` is:
  ```
  .eq("reference_type","forwarder").eq("reference_id", f_no)
  .eq("kind","import_payment").eq("status","completed")
  ```
  Unlike service-orders there is **no migration-0049-style partial-unique index**
  on this slice, so the collision is allowed — but it means: if a cost
  adjustment is paid on a forwarder *before* the main payment is recorded
  (a real ordering — cost adjustments are a "discovered after the fact" flow,
  but staff can also enter them at any time), the main-payment action finds the
  cost-adjustment tx, concludes `already_paid: true`, **skips the main debit**,
  and just flips the status. Pacred ships the import having collected only the
  small extra fee, not the order total.
- **Repro:**
  1. Forwarder `F123`, `total_price = 8000`, status `pending_payment`.
  2. Admin adds a cost adjustment (`do_fee`, ฿300) → `adminMarkCostAdjustmentPaid`
     → wallet tx `(import_payment, forwarder, F123, completed, -300)`.
  3. Customer/admin pays the forwarder → `payForwarderFromWallet("F123")` or
     `adminMarkForwarderPaid` → idempotency SELECT finds the ฿300 tx →
     returns `{ already_paid: true }`, status → `shipped_china`.
  4. Net result: forwarder marked paid, wallet debited only ฿300, ฿8000 never
     collected. No error surfaced.
- **Recommended fix (pick one):**
  - **Best:** give cost adjustments their own `kind` (e.g. add
    `'cost_adjustment'` to the `wallet_transactions.kind` CHECK, a tiny
    migration) so the slices never overlap. Then the idempotency checks are
    exact again.
  - **Fast (no migration):** make `adminMarkCostAdjustmentPaid` write
    `reference_type='manual'` (already in the CHECK enum) instead of
    `'forwarder'`, and put the f_no in `note` / a new column. The main-payment
    idempotency check then can't see it.
  - Either way, also add a partial-unique index mirroring 0049 for the
    forwarder main-payment slice once `kind` disambiguates it.

### P0-2 — Yuan wallet-paid debit is silently RLS-blocked → customer never charged (money LOSS)

- **File:** `actions/payment.ts:117-127` (`createYuanPayment`, the wallet-debit insert)
- **Severity: P0 — money loss (Pacred executes a Yuan/Alipay transfer the
  customer's wallet was never charged for).**
- **Root cause:** `createYuanPayment` runs on the **user-scoped** Supabase client
  (`createClient()` from `lib/supabase/server.ts`, line 78 — NOT `createAdminClient()`).
  When `paid_via_wallet=true` it inserts into `wallet_transactions` with
  `kind='yuan_payment'` (line 122). But the RLS INSERT policy
  `wallet_tx_insert_self_serve` (migration `0007_wallet.sql:206-213`) only
  permits self-serve inserts where `kind in ('deposit','withdraw')`. A
  `kind='yuan_payment'` insert from the user client is **rejected by RLS**.
  The code does `await supabase.from("wallet_transactions").insert(...)` and
  **never checks the error** — the yuan_payment row is already created, the
  function returns `{ ok: true }`, customer sees "ฝากโอนหยวนสำเร็จ". The wallet
  ledger has **no debit row**. When admin later completes the payment
  (`adminUpdateYuanPayment`, line 62-68) it tries to flip the *pending* wallet tx
  to completed — but there is none — so still no debit. Pacred performs the
  Alipay transfer for free.
- **Repro:**
  1. Customer with wallet balance, `/service-payment`, submits a Yuan transfer
     with "pay via wallet" checked.
  2. `createYuanPayment` inserts `yuan_payments` row OK, then the
     `wallet_transactions` insert is RLS-denied (silently — error ignored).
  3. Customer sees success. Admin processes + completes. Wallet balance
     unchanged the whole time.
- **Recommended fix:** do the wallet-tx insert with `createAdminClient()` (the
  same pattern `payServiceOrderFromWallet` / `payForwarderFromWallet` use for
  the debit) **after** an explicit ownership check, AND check the insert error
  — if it fails, fail the whole action (ideally roll back / cancel the
  yuan_payments row, mirroring `placeServiceOrder`'s rollback). Note the *yuan
  flow also has no double-debit guard* — see P1-3.

### P1-1 — Wallet overdraw under concurrent pay-from-wallet on *different* orders

- **Files:** `actions/service-order.ts:543-604` · `actions/forwarder.ts:541-573`
  · `actions/admin/service-orders.ts:204-241` · `actions/admin/forwarders.ts:288-321`
- **Severity: P1 — money loss (wallet goes negative; Pacred fronts the gap).**
- **Root cause:** The F-11 partial-unique index (migration 0049) prevents paying
  **the same order twice**. It does NOT prevent a customer with balance ฿1000
  from paying **two different ฿1000 orders concurrently**. Both calls read
  balance ฿1000 (step 3), both pass the `balance >= total` check, both INSERT a
  `-1000` completed debit (different `reference_id`s → no 23505), and the
  `wallet_recompute_balance` trigger lands the wallet at **-1000**. Same for
  forwarders, and cross-product (one order + one forwarder). The trigger
  recomputes `sum(amount) where completed` so it faithfully records the
  negative — there is no balance floor.
- **Repro:** Customer balance ฿1000, two payable orders each ฿1000, open two
  tabs, click pay on both within the same second → wallet = -฿1000.
- **Recommended fix:** make the debit atomic with the balance check. Options:
  (a) a Postgres function / `SELECT ... FOR UPDATE` on the wallet row that
  re-checks `balance >= amount` inside the same transaction before inserting;
  (b) a CHECK / trigger that rejects any completed debit that would drive a
  bucket below 0. (b) is the strongest and protects every debit path at once.
  Lower real-world likelihood than P0-1/P0-2 (needs deliberate concurrency),
  hence P1 — but it is a genuine money-loss hole.

### P1-2 — `recordFreightPayment` has no double-submit idempotency guard (over-collection / messy ledger)

- **File:** `actions/admin/freight-invoice-payments.ts:147-226` (`recordFreightPayment`)
- **Severity: P1 — duplicate payment rows; invoice flips to `overpaid`;
  customer reconciliation pain.**
- **Root cause:** Each call loads the invoice, inserts a `freight_invoice_payments`
  row, and recomputes. There is **no idempotency key** (no client-supplied
  nonce, no "same amount+bank_ref already recorded" check) and **no DB unique
  constraint** on `(freight_invoice_id, bank_ref)` or similar. An admin
  double-clicking "record payment", or a form re-POST, inserts the payment
  **twice**. `recomputeInvoicePayment` then sums both → `payment_status` goes to
  `paid`/`overpaid` on a half-paid invoice → the receipt PDF stamps
  "ได้รับเงินแล้ว" incorrectly. The `voidFreightPayment` escape hatch exists, so
  it's recoverable, hence P1 not P0 — but it is exactly the F-11 class of bug
  the team already fixed once for orders and did not carry forward to freight.
- **Repro:** Issue a freight invoice with total ฿117,700. Admin records a
  ฿117,700 bank_transfer payment, double-clicks the button (or the action is
  retried) → two `recorded` rows → `paid_thb = 235,400` → status `overpaid`.
- **Recommended fix:** add a partial-unique index, e.g.
  `unique (freight_invoice_id, bank_ref) where status='recorded' and bank_ref is not null`,
  and/or require a client idempotency token. At minimum, before INSERT, SELECT
  for a `recorded` row with the same `(freight_invoice_id, amount_thb, bank_ref,
  paid_at)` and short-circuit. Also disable the submit button while pending
  (client-side — necessary but not sufficient).

### P1-3 — Yuan wallet-paid flow has no double-debit guard + re-complete cannot re-activate a cancelled debit

- **Files:** `actions/payment.ts:117-127` · `actions/admin/yuan-payments.ts:46-79`
- **Severity: P1 — duplicate wallet debit on retry; OR a completed payment with
  no debit after a refund→re-complete cycle.**
- **Root cause (a):** Even after P0-2 is fixed (insert via admin client), there
  is no `(reference_type='yuan_payment', reference_id, kind='yuan_payment')`
  uniqueness. `createYuanPayment` is the only writer today, but a double-submit
  creates two `yuan_payments` rows each with their own debit — acceptable since
  they are distinct payments — *however* there is no guard that the **same**
  yuan_payment can't get two debits if the action is ever retried mid-flight
  (the yuan row insert succeeds, the wallet insert is retried).
- **Root cause (b):** `adminUpdateYuanPayment` (lines 62-68) only flips a
  `status='pending'` wallet tx to `completed`. If a payment goes
  `pending → completed → refunded` the wallet tx is set to `cancelled`
  (lines 72-78). If the admin then re-completes the yuan payment, the
  re-complete query `.eq("status","pending")` matches **nothing** — the
  `cancelled` tx is never reactivated — so the customer is **not re-debited**
  for a payment now marked completed. The debit/refund pairing is not a
  closed state machine.
- **Recommended fix:** model the yuan↔wallet debit as a proper coupled state
  machine: on re-complete, either un-cancel the existing tx or insert a fresh
  one; guard against >1 active (`pending`+`completed`) debit per yuan_payment.
  Lower priority than P0-2 because it needs an unusual refund→re-complete
  sequence, but it is a real ledger-integrity hole.

### P1-4 — `requestTaxInvoice` can create duplicate pending tax invoices (concurrent request)

- **File:** `actions/tax-invoices.ts:130-144` · migration `0034_tax_invoices.sql`
- **Severity: P1 — duplicate tax-invoice rows; RD Code 86 numbering risk if both
  get issued.**
- **Root cause:** Idempotency is a check-then-act SELECT (`.neq("status",
  "cancelled")` → if none, INSERT). `tax_invoices` has **no partial-unique
  index** for "≤1 non-cancelled invoice per `order_h_no` / `forwarder_f_no`"
  (confirmed — 0034 only has `serial_no unique` + the XOR parent CHECK).
  Two concurrent `requestTaxInvoice` calls for the same order both pass the
  SELECT and both INSERT → two `pending` tax invoices. If an admin later issues
  **both**, the customer gets two serial numbers for one sale — a Revenue
  Department compliance problem. Contrast `withholding_tax_entries`, which DOES
  have the DB guard (`wht_one_per_order_uidx` / `wht_one_per_forwarder_uidx`,
  0044:87-92).
- **Repro:** Double-click "request tax invoice" on a paid receipt page → two
  pending rows for the same `order_h_no`.
- **Recommended fix:** add the partial-unique indexes mirroring 0044, e.g.
  `unique (order_h_no) where order_h_no is not null and status <> 'cancelled'`
  (and the forwarder twin), then catch 23505 in `requestTaxInvoice` and
  re-SELECT idempotently.

### P1-5 — `adminUpdateWalletTransaction` lets `completed → pending/failed` flip an already-settled balance

- **File:** `actions/admin/wallet.ts:26-66` (`adminUpdateWalletTransaction`)
- **Severity: P1 — accounting integrity (a settled deposit can be silently
  un-settled; a completed order-payment debit can be reverted with no audit of
  downstream effect).**
- **Root cause:** `updateSchema` accepts any `status` in
  `['pending','completed','failed','cancelled']` and the action applies it with
  no transition guard — only a `existing.status === d.status` no-op short-cut.
  So an accounting admin (or a buggy UI) can move a tx `completed → pending`,
  and the `wallet_recompute_balance` trigger will **drop the balance**. If that
  tx was an `order_payment` debit for an already-`ordered` service order, the
  order stays `ordered` while the money un-debits — the order/wallet pair
  desyncs. There is no state machine (the freight + WHT actions DO have proper
  `from→to` guards; wallet does not).
- **Recommended fix:** restrict allowed transitions (e.g. only
  `pending → completed|failed|cancelled`, and `completed → cancelled` as the
  one reversal, never `completed → pending`). For an `order_payment` /
  `import_payment` / `yuan_payment` reversal, also require the linked order be
  walked back. At minimum, block `* → pending` from `completed`.

### P2-1 — Freight invoice "total" ignores the invoice line items entirely

- **Files:** `lib/validators/freight-payment.ts:85-95` (`freightInvoiceTotalThb`)
  · `actions/admin/freight-invoices.ts:120-184` (line CRUD)
- **Severity: P2 — design ambiguity; risk of billing the wrong amount.**
- **Root cause:** The amount the freight customer owes is computed as
  `commercial_value_thb + duty_thb + vat_thb` (the ADR-0016 landed-cost block).
  The `freight_invoice_lines` rows — which carry `qty × unit_price_usd =
  amount_usd` and ARE what prints on the Commercial Invoice PDF — are **never
  summed into the payable total**. So the document the customer sees (sum of
  lines, in USD) and the amount the payment ledger settles against (landed cost,
  in THB) are two unrelated numbers. The code comments acknowledge this is
  intentional for V1, and the unit test covers it — but it is a real
  foot-gun: staff editing line items will reasonably expect the invoice total
  to change, and it won't. If the value block is left incomplete the payable
  total can even be ฿0 while the CI shows USD lines (the action does refuse to
  record a payment against a ฿0 total — `freight-invoice-payments.ts:175` — so
  it fails safe, but confusingly).
- **Recommended fix:** before launch, at least make the freight admin UI show
  *both* numbers side by side and label which one is billed. Post-launch,
  decide (ADR) whether the payable total is landed-cost or sum-of-lines and
  make them consistent. Not a launch blocker because freight V-E billing is
  Phase I2 and the ฿0 guard prevents a silent zero-charge.

### P2-2 — `getCurrentYuanRate` falls back to a hardcoded 5.00 with no signal

- **File:** `actions/payment.ts:37-43`
- **Severity: P2 — wrong THB amount charged if env var is missing.**
- **Root cause:** `getCurrentYuanRate` reads `NEXT_PUBLIC_YUAN_RATE`; if unset
  or non-numeric it silently returns `5.0`. The CNY→THB rate is the multiplier
  on every Yuan transfer (`thb_amount = yuan_amount × rate`). If the env var is
  forgotten in Vercel, every customer is billed at a stale 5.00 rate with no
  warning. (Note `placeServiceOrder` and `createForwarder` correctly read the
  rate from the `settings` table, not env — yuan is the odd one out.)
- **Recommended fix:** read the yuan rate from the `settings` table like the
  other two flows, or at minimum log/alert when the env fallback triggers.
  Verify `NEXT_PUBLIC_YUAN_RATE` is set in prod before launch (it is also
  client-exposed via the `NEXT_PUBLIC_` prefix — fine for a rate, just noting).

### P2-3 — `payServiceOrderFromWallet` / `payForwarderFromWallet`: order-update failure after debit leaves money taken but order not advanced

- **Files:** `actions/service-order.ts:606-621` · `actions/forwarder.ts:575-584`
- **Severity: P2 — recoverable inconsistency, already deliberate, audited.**
- **Root cause:** Both actions debit the wallet, then update the order/forwarder
  status in a *second* statement. If the status update fails, the code
  intentionally does **not** roll back the debit (comments say "preserve audit
  trail"), returns an error string, and relies on an admin to reconcile. This
  is a defensible choice (a non-rolled-back debit + visible error beats a lost
  debit), and the F-11 idempotency guard means a retry won't double-charge — so
  it is correctly P2, listed for completeness. Same pattern in
  `adminMarkServiceOrderPaid`, `adminMarkForwarderPaid`,
  `adminMarkCostAdjustmentPaid`. Consider wrapping debit + status-flip in a
  Postgres function for true atomicity post-launch.

### Auth review — money mutations (no bug; documented as verified)

All money-moving admin actions are correctly gated:
- `adminMarkServiceOrderPaid`, `adminMarkForwarderPaid`,
  `adminMarkCostAdjustmentPaid`, `adminUpdateWalletTransaction`,
  `adminBulkApproveDeposits`, `adminUpdateYuanPayment`,
  `adminBulkApproveYuanPayments` → `withAdmin(["super","accounting"])` or
  `["accounting"]` (super inherits — `require-admin.ts:40`). ✅ matches ADR-0005 K-7.
- `issueTaxInvoice` / `cancelTaxInvoice` → `["super","accounting"]`. ✅
- WHT create/receive/waive/cancel → `["super","accounting"]`. ✅
- `adminUpdateSalesPayout` → `["accounting","sales_admin"]`. ✅
- Freight quote *approve* → `["super"]` only; freight invoice/payment mutations →
  `["super","ops","accounting"]`. ✅ (ops can operate the freight panel by design.)
- Customer self-pay actions verify ownership via RLS-scoped SELECT before the
  admin-client debit. ✅
- Customers cannot set amounts: `placeServiceOrder` recomputes `total_thb`
  server-side from cart + `settings`; `createForwarder` recomputes via
  `calcPrice` server-side ("trust nothing from the client" — `forwarder.ts:337`);
  `createYuanPayment` recomputes `thb_amount` server-side. ✅
- One nuance, not a bug: `requestPayout` (`sales.ts`) and tax-invoice/WHT amount
  snapshots all derive from **DB-stored** values, not client input — correct.

---

## 3. Money-math verification (formulas checked)

All formulas below were read and verified against the code; the unit tests in §4
exercise the same helpers and pass.

### 3.1 Withholding tax (`lib/validators/withholding-tax.ts:33-41`)
```
wht_amount_thb   = roundThb(wht_base_thb × wht_rate_pct / 100)
net_expected_thb = roundThb(gross_invoice_thb − wht_amount_thb)
```
✅ Correct per ADR-0015 / RD rules. `roundThb = Math.round(n*100)/100` (2dp).
Rate constrained to `{1,1.5,2,3,5}` in Zod + DB CHECK (0044:39). `wht_base_thb ≤
gross_invoice_thb + 0.01` enforced (validator refine, line 88). `net_expected ≤ 0`
rejected by the action (`wht.ts:100`). Gross invoice total is **never reduced** by
WHT — the receipt always shows gross — correct per RD Code 86.

### 3.2 Receipt issuance WHT gate (`actions/admin/tax-invoices.tsx:85-114`)
✅ `issueTaxInvoice` blocks with `wht_cert_pending` when a
`withholding_tax_entries` row exists for the parent order with
`cert_status='pending'`. Personal customers (no WHT row) → no gate. Correct —
this is the "ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ" staff rule.

### 3.3 Tax-invoice VAT (inclusive 7%) (`actions/tax-invoices.ts:151-153`)
```
total    = round2(sourceOrderTotal)        // price the customer already paid
subtotal = round2(total / 1.07)
vat      = round2(total − subtotal)        // VAT absorbs the ≤0.01 rounding crumb
```
✅ Correct. Computing `vat = total − subtotal` (not `subtotal × 0.07`)
guarantees `subtotal + vat === total` exactly — the unit test verifies this for
107, 100, 1950, 123456.78.

### 3.4 Freight quote totals (`lib/validators/freight-quote.ts:141-151`)
```
subtotal   = roundThb(Σ quantity_i × unit_price_thb_i)
vat_amount = roundThb(subtotal × vat_pct/100)      // vat_pct default 7
total      = roundThb(subtotal + vat_amount)
```
✅ Correct. Line totals also recomputed server-side
(`line_total_thb = round(qty × unit_price, 2)` — `freight-quotes.ts:200,266`),
header recomputed on every line CRUD + on vat_pct change. Sum-of-lines = header
subtotal — consistent.

### 3.5 Freight shipment value block (`lib/validators/freight-shipment.ts:58-100`)
```
commercial_value_thb = roundThb(commercial_value_usd × exchange_rate)
duty_base            = declared_customs_value_thb ?? commercial_value_thb
duty_thb             = roundThb(duty_base × duty_rate_pct/100)
vat_base_thb         = override ?? roundThb(duty_base + duty_thb)   // CIF + duty
vat_thb              = roundThb(vat_base_thb × 0.07)
```
✅ Correct per ADR-0016 + Thai customs convention (VAT base = CIF value + import
duty). `commercial_value_usd`/`exchange_rate` paired (CHECK + Zod refine).
Recomputed on shipment update; frozen onto the invoice at issuance
(`freight-invoices.ts:388-401`).

### 3.6 Freight invoice payable total + settlement (`lib/validators/freight-payment.ts:85-127`)
```
freightInvoiceTotalThb = roundThb(commercial_value_thb + duty_thb + vat_thb)   // nulls→0
paid_thb               = roundThb(Σ amount_thb where status='recorded')
status: paid≤0 → unpaid · paid+ε<total → partial · paid≤total+ε → paid · else overpaid
        (ε = 0.01 — float dust does not trap an invoice at 'partial')
```
✅ Math correct and epsilon-tolerant. ⚠️ but the *total* ignores the line items
(`amount_usd`) — see P2-1. WHT does not reduce this total — correct.

### 3.7 Forwarder price engine (`lib/forwarder/calc-price.ts`)
✅ Verified: rate waterfall (custom_hs → custom_user → vip → general); tiered
general rate by quantity; `auto` basis picks the higher of kg/cbm price; juristic
discount = `round2(transport_subtotal × pct)` only when subtotal ≥ threshold;
`total = round2(transport_subtotal − juristic_discount + service_fee + crate + qc
+ domestic_china + thailand_delivery + other + price_update − discount)`. All 2dp
rounded. 50/50 unit-test assertions pass.

### 3.8 Sales commission (`migration 0013_sales_referral.sql:166`)
```
commission_amount = round(base_amount × commission_pct, 2)
```
✅ Computed in the DB `maybe_create_sales_commission` SECURITY DEFINER fn,
idempotent via `unique (team_leader_id, reference_type, reference_id)`. Payout
`amount_total = Σ commission_amount`; `requestPayout` rolls the payout back if a
concurrent grab claims some commissions (`sales.ts:261-272`) — race-safe. ✅

### 3.9 Wallet balance (`migration 0007_wallet.sql:119-165`)
✅ `wallet_recompute_balance` trigger recomputes each bucket as
`sum(amount) where status='completed'` after every tx insert/update/delete.
Pending/failed/cancelled excluded. 3 buckets independent. **No negative-balance
floor** — see P1-1.

---

## 4. Test results

`pnpm test:unit` — **all pass, 0 failures.** Money-relevant files:

| Test file | Result |
|---|---|
| `lib/forwarder/calc-price.test.ts` | 50 pass / 0 fail |
| `lib/validators/wallet.test.ts` | 36 pass / 0 fail |
| `lib/validators/payment.test.ts` (yuan) | 29 pass / 0 fail |
| `lib/validators/freight-payment.test.ts` | 42 pass / 0 fail |
| `lib/validators/tax-invoice.test.ts` | 33 pass / 0 fail |
| `lib/validators/forwarder.test.ts` | 60 pass / 0 fail |
| `lib/validators/sales.test.ts` | 21 pass / 0 fail |
| `lib/pdf/render.test.tsx` (incl. freight/tax receipt PDFs) | 36 pass / 0 fail |

**Coverage gap:** the unit tests only cover the **pure Zod schemas + math
helpers** (`computeWhtNumbers`, `computeQuoteTotals`, `computeValueBlock`,
`freightInvoiceTotalThb`, `computeInvoicePaymentStatus`, `calcPrice`). They do
**NOT** exercise the server actions, so none of the P0/P1 bugs above (which are
all in action-level idempotency / RLS / concurrency logic) are caught by any
test. The DB-integration tests (`lib/wallet/ledger.test.ts` etc.) are in the
`pnpm test` script and need `.env.local` — they skip gracefully (exit 0) without
Supabase secrets, so they did not run here. `lib/wallet/ledger.test.ts` verifies
the recompute trigger but not the action races.

**Recommendation:** the highest-value missing tests are action-level
double-submit / concurrency tests for the four pay paths — but those need a live
DB, so for launch they are a manual smoke item, not a unit test.

---

## 5. Gateway-readiness gap

### What manual billing exists TODAY (works without any gateway)
- **Wallet top-up:** customer uploads a PromptPay slip → `createDeposit`
  (`wallet.ts:100`) writes a `pending` `wallet_transactions` row → admin
  approves via `adminUpdateWalletTransaction` / `adminBulkApproveDeposits` →
  recompute trigger credits the balance. PromptPay QR generated locally
  (`lib/promptpay.ts`, `promptpay-qr` package) from `PROMPTPAY_ID` env.
- **Pay from wallet:** `payServiceOrderFromWallet` / `payForwarderFromWallet`
  debit the wallet ledger directly (admin-client, ownership-checked, F-11 guard
  for orders).
- **Admin mark-paid (cash / bank-direct):** `adminMarkServiceOrderPaid` /
  `adminMarkForwarderPaid` with `allow_overdraw` for OOB cash.
- **Freight billing:** quote → shipment → `freight_invoices` (draft→issued,
  serial `FI{YYMMDD}-NNNN`) → `freight_invoice_payments` ledger
  (cash/bank_transfer/wallet, manual entry) → receipt.
- **Tax invoice:** `requestTaxInvoice` → `issueTaxInvoice` (serial
  `INV-YYYYMM-NNNN`, PDF, WHT-gated).
- **Withdraw / sales payout:** manual slip-based admin flows.

This is a complete **manual** billing system. The only "integration" code present
is `lib/integrations/momo-jmf/` (a partner sync, not a payment gateway).
**No `payment_intents` table, no webhook routes, no gateway SDK.** (`app/api/`
has cron + china-search + pdf routes only — no `webhooks/`.)

### What is needed to wire the 4 gateways
Per `docs/decisions/d7-payment-gateway-decision-matrix.md` (decision: **Xendit +
K-Biz + K-Shop**, overridden 2026-05-17; wire-up is **T+30d post-launch**, ภูม,
~16-22h — explicitly **out of launch scope**). The matrix's own §5.3 checklist:

1. Migration `0NNN_payment_intents.sql` — `payment_intents` table: `provider`
   enum (`xendit`/`kbiz`/`kshop`/`promptpay`), status state machine
   (`pending → succeeded/failed/refunded`), **idempotency key** column.
2. `lib/payments/xendit/client.ts` — typed wrapper over Xendit Node SDK.
3. `lib/payments/kbiz/client.ts` — K-Biz API wrapper (API surface TBD in the
   T+30d sandbox phase).
4. `lib/payments/kshop/qr.ts` — K-Shop merchant QR (mirror `lib/promptpay.ts`).
5. `actions/payments/initiateCheckout.ts` — create a payment intent, return
   checkout URL / QR.
6. `app/api/webhooks/xendit/route.ts` — webhook receiver **with signature
   verification** (this is where a missing/weak signature check becomes a
   money bug — must be done carefully).
7. `app/api/webhooks/kbiz/route.ts` — K-Biz transfer notification (or manual
   reconcile via statement export if no webhook).
8. Customer `/wallet/deposit` — replace PromptPay-only with a multi-method picker.
9. Admin `/admin/wallet/[id]` — provider + status + reconcile-state panel.
10. Sandbox end-to-end tests + Sentry alert on webhook signature mismatch.

**Gateway-readiness verdict:** the manual path is launch-ready *after* the P0s
above are fixed. Gateway wiring is a clean greenfield add — nothing in the
current code conflicts with it; the `payment_intents` + webhook approach slots
in alongside the existing wallet ledger. Two things to bake in from day one of
that work: a real **idempotency key** on `payment_intents` (the recurring weak
spot this audit found everywhere), and **webhook signature verification** before
any ledger write.

---

## 6. Pre-launch fix priority (for เดฟ)

1. **P0-1** — disambiguate the forwarder cost-adjustment wallet-tx `kind` /
   `reference_type` so it stops poisoning the main-payment idempotency check.
   Tiny migration or a one-line `reference_type` change. **Must fix.**
2. **P0-2** — `createYuanPayment`: insert the wallet debit via the admin client
   + check the error + fail/rollback on failure. **Must fix** (Yuan transfers
   are a live revenue service).
3. **P1-1** — add a negative-balance floor (trigger/CHECK) on `wallet` — one
   guard protects every debit path.
4. **P1-2** — freight-payment double-submit guard (partial-unique on
   `freight_invoice_id, bank_ref`). Lower urgency: freight V-E is Phase I2.
5. **P1-4** — partial-unique on `tax_invoices (order_h_no/forwarder_f_no) where
   status<>'cancelled'` — RD Code 86 numbering safety.
6. **P1-3 / P1-5** — yuan refund→re-complete state machine; wallet-tx transition
   guard. Launch week.
7. **P2-1 / P2-2 / P2-3** — post-launch.

The single scariest item is **P0-1**: it loses a full forwarder invoice with no
error shown, and forwarder (ฝากนำเข้า) is exactly the cargo revenue path the
launch exists to turn on.

— End of audit.
