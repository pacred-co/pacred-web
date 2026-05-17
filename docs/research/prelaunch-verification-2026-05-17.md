# Pre-launch verification audit — 2026-05-17

> **Read-only code-level verification** for the **2026-05-18 production launch**.
> Method: traced each launch-critical path in the *actual code on branch `dave`*
> (HEAD `087c6c8`) and confirmed the logic produces the correct RESULT — not
> just "no 500". This is the end-to-end functional pass that `pnpm verify` +
> `pnpm build` + the HTTP smoke do **not** cover.
>
> **Companion docs** (known gaps — NOT re-listed here):
> [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md) · the 5
> `gap-*.md` drills · [`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md).
> This doc **verifies the W-1 / W-3 / S-3 / S-4 / 0064 / 0053 fixes actually
> landed correctly** and flags anything NEW.

---

## §0 — LAUNCH VERDICT

**🟢 GO for 2026-05-18 — no launch-critical flow is broken.** Every path in
scope (auth, wallet money, admin security, order/forwarder, tax-invoice/WHT)
was traced in code and produces the correct result. The W-1 security keystone,
the W-3 wallet-integrity guard, the S-3 OTP rate-limits, the S-4 edge gate, and
migrations `0062`/`0063`/`0064`/`0053` **all landed correctly** — verified
line-by-line below.

**Three findings, none a blocker:**

| # | Finding | Severity | Why not a blocker |
|---|---|---|---|
| F-1 | `0053_freight_invoice_wht.sql` is **missing from the `supabase/migrations/README.md` apply-list** (the numbered table jumps 0052→0060). The file exists on `dave` and is correct; only the runbook index skips it. | **`[fix-before-launch]`** | Doc/runbook only — fix is a 1-row README edit. But if an operator applies migrations off the README, the freight-WHT issuance gate (`freight-invoices.ts:317`) 500s on a missing `freight_invoice_id` column. Fix the README before the migration run. |
| F-2 | `/admin` dashboard (`app/[locale]/(admin)/admin/page.tsx`) uses `createAdminClient()` (RLS-bypass) with **no `requireAdmin([roles])`** — a `driver`/`warehouse` admin reaches the company revenue overview. = `gap-admin H-2`, an explicitly-named W-1 Fix-B sub-item that was **not** completed. | `[post-launch]` | Aggregates only (no per-customer PII); exploitable only once a `driver`/`warehouse` account exists — and none does at launch. The 11 *finance* pages WERE gated. Close before `R-8`/`R-9` ship. |
| F-3 | `getFreightReceiptGate()` (`freight-invoice-payments.ts:603`) is still a hardcoded `{ blocked:false }` no-op, and its in-code comments are stale ("freight↔WHT linkage doesn't exist" — it does, via 0053). | `[post-launch]` | The **real** freight-WHT gate moved upstream to *invoice issuance* (`adminIssueFreightInvoice`, properly wired to 0053) and a draft invoice can't produce a receipt — so the receipt-route no-op is currently redundant defence-in-depth, not an open hole. Narrow edge: a WHT row created against an *already-issued* freight invoice. Freight billing is admin-only Phase I2 at launch. |

Everything else traced **`[clean]`**.

> **One pre-existing, accepted P1** (not a regression, not re-rated here):
> money-audit **P1-1** — concurrent pay-from-wallet on *two different* orders
> can still drive the wallet negative. `0064`'s trigger deliberately guards
> only *pending* debits; pay-from-wallet writes *completed* debits and relies
> on the check-then-act app-layer `getWalletAvailableBalance`. The `0064`
> header states this exclusion explicitly. Remains a known post-launch P1.

---

## §1 — Auth (2-step OTP register · login · password reset · S-3 rate-limits)

**Files traced:** `actions/auth.ts`, `actions/otp.ts`, `actions/security.ts`,
`lib/rate-limit.ts`, `lib/auth/require-admin.ts`, `proxy.ts`.

### Confirmed correct

- **2-step OTP register** (`registerPersonal` / `registerJuristicStep1`,
  `auth.ts:116,185`) — `signup` IP rate-limit (5/h) → hCaptcha → `verifyOtp` →
  `admin.auth.admin.createUser` → `profiles` insert. Juristic step 1 sets
  `status='incomplete'`, steps 2-3 complete it. Correct.
- **Login** (`signIn`, `auth.ts:41`) — `login` IP rate-limit (10/h);
  resolves email / phone / `member_code`; admin-flag lookup via `admins`
  table. Phone+OTP register and password login both correct.
- **Password reset — phone** (`requestPasswordResetByPhone` /
  `confirmPasswordResetByPhone`, `auth.ts:377,413`) — request step is
  rate-limited + hCaptcha + silent-ok for unknown phone (enumeration defence).
- **S-3 — `confirmPasswordResetByPhone` rate-limit: ✅ LANDED.**
  `auth.ts:426-428` calls `checkRateLimit("otpVerify", ip)` *before*
  `verifyOtp`. The `otpVerify` bucket (`rate-limit.ts:47`) is 10/h/IP — the
  missing IP ceiling on the 6-digit reset-OTP brute-force is now closed.
- **S-3 — `confirmPhoneChange` rate-limit: ✅ LANDED.** `security.ts:149-152`
  has the identical `checkRateLimit("otpVerify", ip)` guard. Both OTP-confirm
  sites that set credentials are now IP-gated.
- **`registerPersonal` / `registerJuristicStep1`** use the `signup` bucket +
  hCaptcha (not `otpVerify`) — correct: `gap-schema-security S-3` itself
  notes the register path is already protected; no gap.
- **`verifyOtp`** (`otp.ts:95`) — 5-attempts-per-row cap, TTL gate, dual-pepper
  accept-window, burns the row on the 5th miss. Correct.

### Flagged

None. The S-4 edge gate is verified in §3.

---

## §2 — Money / wallet (deposit · withdraw · pay-from-wallet · 0063 · 0064)

**Files traced:** `actions/wallet.ts`, `actions/payment.ts`,
`actions/service-order.ts`, `actions/forwarder.ts`,
`actions/admin/freight-invoice-payments.ts`, `actions/admin/yuan-payments.ts`,
`actions/admin/forwarder-cost-adjustments.ts`, `lib/wallet/balance.ts`,
migrations `0007`/`0049`/`0061`/`0063`/`0064`.

### `lib/wallet/balance.ts` — the pending-aware spend helper — `[clean]`

`sumAvailableBalance` = `completed` rows **plus open pending DEBITS** (pending
credits excluded). `getWalletAvailableBalance` returns `null` on a read error
and **every caller fails closed** on `null`. This is the exact app-layer mirror
of the SQL `wallet_available_balance()` (0064). Correct.

### `0064` overdraw-guard trigger — `[clean]`

Traced `wallet_assert_no_overdraw()` against every wallet write shape:

- **Deposit** (`kind='deposit'`, `+amount`, `pending`, `main`) — `amount<0` is
  false → `v_new_contrib=0` → `0 >= 0` → `return new`. **Pending credit never
  blocked.** ✓
- **Withdraw** (`-amount`, `pending`, `main`) — guarded; `FOR UPDATE` lock on
  the wallet row makes the floor hard under concurrency. ✓
- **Pay-from-wallet / `allow_overdraw`** (`completed`) — early-returns on
  `status<>'pending'` → not blocked (intentional — see §0 note on P1-1). ✓
- **Amount-edit on an open pending withdraw** — `tg_op='UPDATE'` backs out the
  OLD contribution before projecting. ✓
- **`kind='adjustment'`** — admin escape hatch, excluded. ✓
- The `wallet_available_balance()` fn is `SECURITY DEFINER` with `EXECUTE`
  revoked from `anon`/`authenticated` — a caller cannot RPC another profile's
  balance. ✓ Integration test `lib/wallet/overdraw-guard.test.ts` covers
  sections A-E. ✓

### `createWithdraw` / `createYuanPayment` — H-1 fix — `[clean]`

- `createWithdraw` (`wallet.ts:158`) — checks `getWalletAvailableBalance`
  (pending-aware) before the insert; catches `isWalletOverdrawError` on the
  insert and returns the friendly Thai message. The 0064 trigger is the hard
  backstop; this is the fast path. ✓
- `createYuanPayment` (`payment.ts:71`) — **P0-2 fix verified:** the wallet
  debit is inserted via `createAdminClient()` (RLS `wallet_tx_insert_self_serve`
  forbids `kind='yuan_payment'` from the user client), wrapped in
  `assertOwnedProfileId(user.id, …)`, the insert error **is checked**, and a
  failure **rolls back the orphan `yuan_payments` row** (`payment.ts:148-153`).
  Pending-aware balance checked first. ✓

### `payServiceOrderFromWallet` / `payForwarderFromWallet` — `[clean]`

Both (`service-order.ts:513`, `forwarder.ts:512`): RLS-scoped ownership fetch →
check-then-act idempotency SELECT → pending-aware balance check → admin-client
debit wrapped in `assertOwnedProfileId` → **23505 catch** re-SELECTs the
canonical row (the 0049 / 0061 partial-unique guards). Order-update-after-debit
failure surfaces an error without rolling back the debit (deliberate, audited =
money-audit P2-3). ✓

### `0063` freight wallet bridge — G-3 fix — `[clean]`

- Migration `0063` adds `'freight_invoice'` to the `wallet_transactions
  .reference_type` CHECK + a partial-unique `wallet_tx_freight_payment_uniq`
  keyed on the *payment-row* id. ✓
- `recordFreightPayment` (`freight-invoice-payments.ts:228`) — on
  `method='wallet'` it inserts a **real `completed` debit** via
  `debitWalletForFreightPayment` (`:169`): pending-aware balance check,
  `reference_type='freight_invoice'`, `reference_id` = the payment-row id, 23505
  treated as idempotent. **If the debit fails, the freight payment row is
  auto-voided** (`:329-340`) so the invoice never flips to `paid` without the
  money — the free-shipment leak is closed. ✓
- `voidFreightPayment` (`:432`) reverses a wallet-method payment by flipping the
  paired debit to `cancelled` (`:469-486`); a failed reversal surfaces an error
  so an admin reconciles rather than silently leaving the customer charged. ✓

### `adminUpdateYuanPayment` — W-3 transition guard — `[clean]`

`yuan-payments.ts:34` — explicit `YUAN_STATUS_TRANSITIONS` allow-list.
**`refunded→completed` and `failed→completed` are forbidden** — the old
"re-stamp completed without re-debit" money hole (revenue-flow H-1) is closed.
The refund branch (`:127-133`) now cancels wallet tx in **both** `pending` AND
`completed` status (revenue-flow H-2) — a refund of a completed wallet-paid
transfer now actually credits the customer back. ✓

### P0-1 forwarder cost-adjustment — `[clean]`

`adminMarkCostAdjustmentPaid` (`forwarder-cost-adjustments.ts:170`) writes
`kind:'cost_adjustment'` (the value 0061 added to the CHECK). The
`payForwarderFromWallet` / `adminMarkForwarderPaid` idempotency SELECTs filter
`kind='import_payment'` → they no longer match a cost-adjustment row → the main
forwarder payment is never wrongly skipped. ✓

### Flagged

None for the wallet money paths. (P1-1 — see §0 note — is a pre-existing
accepted P1, not a regression.)

---

## §3 — Admin security (0062 role-pin · page gates · `lib/auth/owned-write.ts`)

**Files traced:** `0062_rls_role_pin_money_pii.sql`, `0015_admin_rbac.sql`,
`0016`/`0030`/`0033`/`0034`/`0038`/`0044`/`0051`/`0052`, the 11 admin pages,
`(admin)/layout.tsx`, `lib/auth/owned-write.ts`, `proxy.ts`.

### `0062` RLS keystone — Fix A — `[clean]`

Cross-checked **every** bare-`is_admin()` admin-write policy in `0015` (25
policies: profiles, corporate, addresses, wallet, wallet_transactions,
yuan_payments, forwarders + items/images/status_log, cart_items, service_orders
+ items, promotions, customer_groups, settings, the 4 `rate_*` tables,
team_leaders, sales_commissions, sales_payouts, notifications, admin_audit_log)
— **all 25 are re-pinned by `0062`** to explicit role arrays. Plus `0016`
`containers_admin_all` and `0030` `container_hs_lines_admin_all`. The
driver/warehouse → direct-PostgREST money-write hole (S-1) is **closed**.

- Money tables → `['super','accounting','ops']`; orders →
  `['super','ops','accounting']`; PII →
  `['super','ops','accounting','sales_admin']`; sales money →
  `['super','accounting','sales_admin']`; pricing →
  `['super','ops','accounting']`. Sound role mapping.
- Tables left deliberately bare (`admin_contact_extras`, `dashboard_banners`,
  `hs_codes`, HR tables, `contact_messages`, `forwarder_driver`, `csv_imports`)
  are documented in 0062's NOTE block — none carries customer money/PII.
  Acceptable.
- **Verified the later migrations already role-pin** (0062's header claim):
  `0034` tax_invoices `['super','accounting']`, `0044` WHT
  `['super','accounting']`, `0051` freight_invoices / `0052`
  freight_invoice_payments / `0038` cost-adjustments `['super','ops','accounting']`.
  Nothing missed. ✓

### `0062` G-6 backstop — DB money-audit trigger — `[clean]`

`audit_wallet_transaction()` — `AFTER INSERT/UPDATE` on `wallet_transactions`,
`SECURITY DEFINER`, logs every mutation to `admin_audit_log` regardless of code
path (catches the direct-PostgREST write `logAdminAction` structurally cannot).
Resolves a non-null FK-valid `admin_id` (actor uid, else the row's own
`profile_id`), captures a before-image on UPDATE. Correct.

### `lib/auth/owned-write.ts` — S-2 un-skippable ownership — `[clean]`

`assertOwnedProfileId` / `assertOwnsRecord` throw `OwnershipError` on a
`profile_id` mismatch. `server-only`. Confirmed **in use** at the three
admin-client customer-write debit sites: `payServiceOrderFromWallet:574`,
`payForwarderFromWallet:566`, `createYuanPayment:138`. The ownership check now
sits in the value flow — a future edit cannot silently drop it. ✓

### 11 finance page gates — Fix B — `[clean]` (with F-2 caveat)

| Page | `requireAdmin([...])` | Verdict |
|---|---|---|
| `/admin/wallet` | `["accounting"]` | ✓ |
| `/admin/wallet/deposit` | now a `redirect("/admin/wallet")` | ✓ safe |
| `/admin/accounting` | `["accounting"]` | ✓ |
| `/admin/accounting/closing` | `["accounting"]` | ✓ |
| `/admin/yuan-payments` | `["accounting"]` | ✓ |
| `/admin/tax-invoices` | `["accounting"]` | ✓ |
| `/admin/sales-payouts` | `["accounting","sales_admin"]` | ✓ |
| `/admin/withdrawals` | now `redirect("/admin/wallet?…")` | ✓ safe |
| `/admin/payment` | now `redirect("/admin/yuan-payments")` | ✓ safe |
| `/admin/customers` | `["ops","sales_admin","accounting"]` | ✓ (also closes `gap-admin H-7`) |
| `/admin/forwarders` | `["ops","accounting"]` | ✓ |

All 11 sensitive pages from `gap-admin H-1` are gated (3 are now safe
redirects). `requireAdmin` (`require-admin.ts:39-42`) correctly OR-includes
`super`. ✓

### `proxy.ts` S-4 edge gate — `[clean]`

`isAdminPath()` strips an optional locale segment and matches `/admin` +
`/admin/*`; an unauthenticated request to any admin route is redirected to
`/login` at the edge **before** the layout, carrying refreshed cookies. The
layout `requireAdmin()` stays the authoritative role gate. `getUser()` uses the
same cookie plumbing as the layout → no new false-logout path. The latent
"forgot the layout guard" hole now has an edge backstop. ✓

### Flagged — F-2

**`/admin` (`app/[locale]/(admin)/admin/page.tsx:12-40`) has no
`requireAdmin([roles])`** and uses `createAdminClient()` to read company-wide
revenue/wallet/customer aggregates. `(admin)/layout.tsx:9` is bare
`requireAdmin()` — proves "some admin", not a role. A `driver`/`warehouse`
admin navigating to `/admin` sees the revenue overview. This is `gap-admin H-2`
and an explicitly-named W-1 Fix-B sub-item ("*Also decide + document `/admin`
itself*", MASTER-STRATEGY §1.4) that was **not** completed. **`[post-launch]`**
— aggregates only, no per-customer PII, and no `driver`/`warehouse` account
exists at launch — but it must be gated (or documented as intentionally
all-admin) **before `R-8`/`R-9` create those roles**.

---

## §4 — Order / forwarder flow

**Files traced:** `actions/service-order.ts`, `actions/forwarder.ts`,
`actions/admin/service-orders.ts`, `actions/admin/forwarders.ts`.

### Confirmed correct

- **`placeServiceOrder`** (`service-order.ts:336`) — recomputes `total_thb`
  **server-side** from the `settings` table (`yuan_rate`, `service_fee`),
  never trusts client input; status starts `awaiting_payment`. ✓
- **`createForwarder`** (`forwarder.ts:319`) — recomputes `total_price`
  server-side via `calcPrice` from `settings` + rate tables ("trust nothing
  from the client"). Money-math verified clean in `audit-money-billing` §3.7
  (50/50 unit tests pass). ✓
- **`adminMarkServiceOrderPaid` / `adminMarkForwarderPaid`** — `["super",
  "accounting"]`-gated, pending-aware balance check, `allow_overdraw` cash
  escape hatch, 23505 idempotency catch. ✓
- **Forwarder import flow** — `pending_payment → shipped_china` on
  pay-from-wallet; admin status transitions guarded by `isStatusRollback`
  (rollback requires a reason). ✓

### Flagged

None launch-critical. Known post-launch items (not re-listed — see
`gap-revenue-flow`): orphan `cancelled` header on item-insert failure (H-4),
`forwarder_cost_adjustments` double-submit (H-7), container→order status
propagation (Stage 4), order auto-close (Stage 9). All post-launch by design.

---

## §5 — Tax invoice / WHT (issuance gates · 0053 freight-WHT gate)

**Files traced:** `actions/admin/tax-invoices.tsx`,
`actions/admin/freight-invoices.ts`, `actions/admin/wht.ts`,
`actions/admin/freight-invoice-payments.ts`,
`app/api/freight-receipt/[id]/route.tsx`, `0053_freight_invoice_wht.sql`.

### Confirmed correct

- **Cargo tax-invoice WHT gate** (`tax-invoices.tsx:86-113`) —
  `issueTaxInvoice` blocks with `wht_cert_pending` when a
  `withholding_tax_entries` row for the parent order/forwarder has
  `cert_status='pending'`. Personal customers (no WHT row) → no gate. Matches
  ADR-0015. ✓ (Money-math verified in `audit-money-billing` §3.1-3.3.)
- **`0053` migration** — adds `freight_invoice_id` to
  `withholding_tax_entries`, relaxes the parent CHECK from 2-way to **3-way
  XOR** (order_h_no | forwarder_f_no | freight_invoice_id, exactly-one), adds
  `wht_one_per_freight_invoice_uidx` + a lookup index. Idempotent, correct. ✓
- **`createWhtEntry`** (`wht.ts:43`) — fully supports `order_type=
  'freight_invoice'`: resolves `profile_id` from `freight_invoices`
  (`:76-85`), 3-way-XOR insert (`:118-120`), per-parent idempotency. ✓
- **Freight-WHT gate at invoice issuance — ✅ WIRED.**
  `adminIssueFreightInvoice` (`freight-invoices.ts:317-328`) queries
  `withholding_tax_entries` by `freight_invoice_id` and **blocks
  `draft→issued` with `wht_cert_pending`** while `cert_status='pending'`. This
  IS the real ADR-0015 freight gate and it correctly uses the 0053 column —
  *the migration is wired into live code.* ✓

### Flagged — F-3

**`getFreightReceiptGate()` (`freight-invoice-payments.ts:603-616`) is still a
hardcoded `{ blocked:false }` no-op** and its comments are stale (claim
"freight↔WHT linkage doesn't exist" — 0053 added it). It is called by
`app/api/freight-receipt/[id]/route.tsx:122`.

**Severity: `[post-launch]`, not a hole today.** The effective ADR-0015 gate
moved *upstream* to issuance (verified above): a freight invoice cannot become
`issued` while WHT is pending, and the receipt route returns `409` for a
`draft` invoice — so a receipt cannot be pulled while WHT pends. The receipt
no-op is therefore currently *redundant* defence-in-depth. The one open edge: a
WHT row created against an *already-issued* freight invoice — the receipt route
would not re-check. Freight billing is admin-only Phase I2 at launch, so this
edge is not customer-reachable on 2026-05-18. Post-launch: wire the same
`freight_invoice_id` + `cert_status='pending'` query into `getFreightReceiptGate`
and refresh the stale comments.

---

## §6 — Cross-reference + the one runbook fix

- **F-1 (do before the migration run):** add `0053_freight_invoice_wht.sql` to
  the numbered apply-table in
  [`supabase/migrations/README.md`](../../supabase/migrations/README.md) — it
  currently jumps row 52 (`0052`) → row 53 (`0060`). The file is correct and
  on `dave`; only the index skips it.
- **F-2 (before `R-8`/`R-9`):** gate `app/[locale]/(admin)/admin/page.tsx`
  with `requireAdmin([...])` or document it as intentionally all-admin
  (`gap-admin H-2`).
- **F-3 (post-launch):** wire `getFreightReceiptGate` to the 0053 column;
  refresh its stale comments.

**Verified-correct fixes** (this audit's main result): W-1 keystone
(`0062` — all 25 bare-`is_admin()` policies re-pinned + G-6 trigger + 11 page
gates + `owned-write.ts` in use) · W-3 wallet-integrity (`0063` freight bridge,
`0064` overdraw guard, yuan transition guard) · S-3 (`otpVerify` on both
OTP-confirm sites) · S-4 (`proxy.ts` edge gate) · P0-1/P0-2/P1-2/P1-4 (`0061`)
· `0053` freight-WHT *issuance* gate. **All landed correctly.**

---

**End — `prelaunch-verification-2026-05-17.md`.** Verdict: 🟢 GO. No
launch-critical flow is broken. One runbook edit (F-1) before the migration
run; two post-launch role/gate items (F-2, F-3). Traced against branch `dave`
HEAD `087c6c8`.
