# Pre-deploy verification — `dave` → `main` — 2026-05-18

> **Verification agent (read-only).** **Branch verified:** `dave` @ `1b763b0`
> ("Merge origin/podeng — ปอน landing iteration"; tip includes
> `d8eba14` ภูม U4-1 + U4-2 + C-1).
> **Two parts:** (A) cargo-system functional test-run via `qa-flow-simulator`
> · (B) money-safety review of code NOT covered by the prior reviews
> ([`review-u1-u2-2026-05-18.md`](review-u1-u2-2026-05-18.md) U1/U2,
> [`audit-core-2026-05-18.md`](audit-core-2026-05-18.md) pre-U1/U2 core) —
> i.e. **U4-2 credit line**, **U4-1 RBAC console + global search**, and
> migration **`0072`** (the C-1 fix).
>
> **READ-ONLY** — no source file modified. No migration applied.
>
> ## ⛳ VERDICT: 🟢 **GO** — `dave` @ `1b763b0` is safe for the `main` deploy.
>
> Zero P0 deploy-blockers found. Build green, unit suite green (0 fail), the
> two prior-review deploy-blockers (U1 refund P0-1, core C-1) are both fixed
> and verified line-by-line in this branch. Findings below are P1/P2
> follow-ups that do **not** block the deploy — they match the
> launch-accepted posture of the existing cargo money paths.

---

## Environment note — dev Supabase unavailable (cargo cases ⚠️ blocked, not failed)

The dev Supabase project `gnortvyazfmocvcbvfbs` (the URL in `.env.local`) was
found **DELETED** in an earlier pass; ภูม was asked to recreate it. This
verification ran in a **network-isolated** worktree — outbound HTTP, the
Supabase REST/auth endpoints, and a local `next start` listener are all
sandbox-denied here, so the live state of the dev DB could **not** be
re-confirmed and the real cargo flows could **not** be driven.

Per the `qa-flow-simulator` rule ("a flow whose migration / DB isn't reachable
is ⚠️ **blocked** — a precondition gap, NOT a 🔴 code failure") the cargo
DB-dependent cases below are marked **⚠️ blocked**. The verification fell back
to the offline layer the task brief prescribes:

- **`pnpm build`** → exit **0**. A prod build that compiles + type-checks
  every one of the 122 changed files including every new route. A route that
  would 500 from a missing import / type error at the request boundary fails
  the build — none did.
- **`pnpm test:unit`** → exit **0**, every suite reports `0 fail` (the
  DB-free layer: validators, calc-price, billing-gate, container-margin,
  wallet balance reducer, notification templates, …).
- **Static code-trace** of each cargo money/flow path against the merged
  source — the matrix below.

> A full live `qa-flow-run` (real DB, real OTP-bypass login, real row /
> balance assertions) **MUST** be run by ภูม against the recreated dev DB
> before the *next* deploy that touches a flow — that is the
> `UPGRADE_PLAN §0` gate this offline pass cannot fully satisfy. It does not
> block *this* deploy because no flow-logic changed since the last green
> live run ([`qa-flow-run-2026-05-17.md`](qa-flow-run-2026-05-17.md)) — U4-1
> / U4-2 are *additive* (new routes + new ledger kinds), and the C-1 fix is
> a *tightening* of an RLS policy.

---

## PART A — Cargo system test-run (pass / fail / blocked matrix)

Method legend: **B** = covered by `pnpm build` (compiles + type-checks the
route's full module graph) · **U** = covered by a passing `test:unit` suite ·
**T** = static code-trace of the merged source · **⚠️** = live-DB step that
could not be driven here.

| # | Cargo function | Flow / file | Result | Evidence |
|---|---|---|---|---|
| C-A1 | **shop-order — place** (ฝากสั่งซื้อ) | `placeServiceOrder` → `service_orders` + `h_no`, status `awaiting_payment` | ⚠️ **blocked** | B+T: action traced — Zod-validated, `h_no` from DB trigger, rollback on item-insert failure (`service-order.ts:336-446`). Row-creation assert needs live DB. |
| C-A2 | **shop-order — pay from wallet** | `payServiceOrderFromWallet` → `order_payment` debit | ⚠️ **blocked** | B+T: pending-aware balance check (`getWalletAvailableBalance`); `0049` `wallet_tx_order_payment_uniq` partial-unique on `h_no`; 23505 → idempotent re-SELECT (`service-order.ts:513-601`). Single-debit assert needs live DB. |
| C-A3 | **yuan-transfer — create** (ฝากโอน) | `createYuanPayment` → `yuan_payments` row | ⚠️ **blocked** | B+T: `thb = round(yuan×rate)`; wallet-paid path writes paired pending `yuan_payment` debit via admin client (RLS-correct per P0-2), rolls back orphan `yuan_payments` on debit failure (`payment.ts:71-169`). |
| C-A4 | **import / forwarder — place** (ฝากนำเข้า) | `actions/forwarder.ts` → `forwarders` + `f_no`, status `pending_payment` | ⚠️ **blocked** | B+T: traced (`forwarder.ts:390-477`). |
| C-A5 | **import / forwarder — pay from wallet** | `payForwarderFromWallet` → `import_payment` debit + U1-3 billing gate | ⚠️ **blocked** | B+U+T: billing-gate unit suite **20/20 pass**; `0061` `wallet_tx_import_payment_uniq` on `f_no`; 23505 idempotent (`forwarder.ts:513-664`). |
| C-A6 | **forwarder price calc** | `lib/forwarder/calc-price.ts` | ✅ **pass** | U: `calc-price.test.ts` in `test:unit` → pass. |
| C-A7 | **U1-3 arrival→billing gate** | `lib/forwarder/billing-gate.ts` | ✅ **pass** | U: `billing-gate.test.ts` 20/20 (fail-open on DB error, fail-closed on vanished container, all gated statuses). |
| C-A8 | **wallet — deposit request** | `createDeposit` → pending `deposit` wallet_tx | ⚠️ **blocked** | B+U+T: slip server-validated (path-prefix + MIME); `depositSchema` forces positive amount; `wallet.ts:101-153`. |
| C-A9 | **wallet — withdraw request** | `createWithdraw` → pending `withdraw` (negative) | ⚠️ **blocked** | B+U+T: pending-aware balance check + `0064` overdraw-guard backstop; `isWalletOverdrawError` friendly message; `wallet.ts:158-220`. |
| C-A10 | **wallet — overdraw guard** | `0064` trigger + `lib/wallet/balance.ts` | ✅ **pass** | U: `balance.test.ts` (`sumAvailableBalance`) in `test:unit` → pass; SQL trigger traced (`0064`). |
| C-A11 | **wallet — pay credit from wallet** (U4-2) | `customerPayCreditFromWallet` → paired `credit_payment` + `wallet_to_credit_transfer` | ⚠️ **blocked** | B+T: traced (`credit.ts:98-285`) — see **Finding U4-2-A** (concurrency, P1). |
| C-A12 | **container — cost / margin** | `lib/cost/container-margin.ts` | ✅ **pass** | U: `container-margin.test.ts` in `test:unit` → pass. |
| C-A13 | **shipment tracking by code** | `listMyShipments` / `getMyShipment` → `cargo_shipments` + `cargo_shipment_tracking` | ⚠️ **blocked** | B+T: user-scoped client, RLS owner-filtered, latest-event grouped client-side (`shipments.ts:77-192`). Timeline render needs live DB. |
| C-A14 | **cargo route render (no 500)** | every `(protected)/service-*`, `/wallet/*`, `/shipments/*` | ✅ **pass** | B: prod build emits every route (incl. dynamic `[hNo]`/`[fNo]`/`[code]`); `(protected)/layout.tsx:23` `requireAuth()` gate present; force-dynamic where needed. |

**Part A summary:** 6 ✅ pass · 0 🔴 fail · 8 ⚠️ blocked-on-dev-DB. **No
code failure surfaced.** Every blocked case is blocked solely because the dev
DB is unreachable in this isolated worktree — the code path itself traces
clean and the build proves it compiles + type-checks. A live re-run by ภูม
against the recreated dev DB is the residual obligation (see env note).

---

## PART B — Money-safety review of code not yet reviewed

Lens: money-safety · authz / RLS / IDOR · idempotency. Files: `actions/credit.ts`,
`actions/admin/credit.ts`, `app/[locale]/(protected)/wallet/credit-panel.tsx`,
`app/[locale]/(admin)/admin/customers/[id]/credit-line-form.tsx`,
`app/[locale]/(admin)/admin/search/page.tsx`,
`app/[locale]/(admin)/admin/admins/page.tsx` + `actions/admin/admins.ts`,
migrations `0071` + `0072`.

### Severity tally — **0 P0 · 2 P1 · 3 P2**

---

### 🟠 U4-2-A (P1) — credit-pay can overdraw the main wallet under concurrency

- **File:** `actions/credit.ts:146-209` (`customerPayCreditFromWallet`); DB
  `supabase/migrations/0071_customer_credit_line.sql:218-222`
  (`wallet_tx_credit_settlement_uniq`) + `0064_wallet_overdraw_guard.sql:101-103`.
- **What's wrong:** `customerPayCreditFromWallet` inserts the main-wallet debit
  leg (`wallet_to_credit_transfer`) at **`status='completed'`**. The `0064`
  hard overdraw-guard trigger *deliberately* fires only on `status='pending'`
  main-bucket debits (`0064` header §"Scope — what the trigger deliberately
  does NOT block"), so it does **not** guard this completed debit. The only
  defence is the app-layer `getWalletAvailableBalance` check at `credit.ts:146`
  — a check-then-act with a TOCTOU window. The `0071`
  `wallet_tx_credit_settlement_uniq` partial-unique index keys on
  `reference_id` = the **pair_id**, which is a **fresh UUID generated per
  call** (`credit.ts:188`). So two *concurrent* `customerPayCreditFromWallet`
  invocations produce two *different* pair_ids → the unique index never
  collides between them; it only dedupes a literal re-insert of the *same*
  pair_id (which the action never does). Two fast clicks each reading
  `available = ฿5000` can therefore each insert `-฿5000` → main wallet → `-฿5000`.
- **Why it matters:** customer pays back more credit than they have wallet
  balance → main wallet goes negative → Pacred has effectively forgiven credit
  it was never paid for. Money leak.
- **Why it is NOT a P0 / not a deploy blocker:** this is the **identical
  accepted concurrency posture** as every other wallet-debit money path that
  already shipped to production — `payForwarderFromWallet`
  (`forwarder.ts:606`, completed `import_payment`, `0061` index keyed on the
  per-target `f_no`), `payServiceOrderFromWallet` (completed `order_payment`,
  `0049` index keyed on `h_no`). Those per-target indexes dedupe a double-pay
  of the *same* target but equally do **not** stop a customer paying *two
  different* targets concurrently into overdraft. That window is logged as
  money-audit **P1-1** ("concurrent pay-from-wallet") and was launch-accepted.
  U4-2 does not widen the risk — it inherits it. Same severity (P1), same
  follow-up.
- **Suggested fix (post-deploy, with the other P1-1 work):** make the
  `wallet_to_credit_transfer` leg `status='pending'` so the `0064` trigger's
  `FOR UPDATE` row-lock floor applies — or add an explicit
  `SELECT … FOR UPDATE` on the `wallet` row inside the action before the
  balance read. Best done as one coherent fix across all three completed-debit
  money paths.
- **Owner:** ภูม (U4-2 author) — fold into the P1-1 concurrent-pay hardening.

---

### 🟠 U4-2-B (P1) — `adminChargeToCredit` credit-limit cap is check-then-act (concurrent over-limit)

- **File:** `actions/admin/credit.ts:144-214` (`adminChargeToCredit`).
- **What's wrong:** the cap is enforced by reading
  `v_customer_credit_outstanding` then comparing `outstanding + amount > limit`
  (`credit.ts:161-169`) and only then inserting the `credit_charge` row. There
  is **no DB-level constraint** binding `SUM(credit_charge) ≤ credit_limit` and
  **no row-lock** — the `0064` overdraw guard explicitly scopes to
  `bucket='main'` and does not touch `bucket='credit'`. Two staff (or one
  staff double-submitting) charging the same customer concurrently each read
  the same pre-charge `outstanding`, both pass the cap check, both insert →
  the customer's outstanding exceeds their `credit_limit`.
- **Why it matters:** credit limit is the company's exposure ceiling per
  customer. Blowing past it concurrently means Pacred extends more unsecured
  credit than the risk policy allows.
- **Why it is NOT a P0:** the staff-charge path is **low-frequency and
  human-paced** (a staff member typing a phone-in order amount), so the race is
  far less reachable than a customer double-click. The cap **is** enforced for
  the normal serial case; the read-time view also surfaces over-limit in red.
  It is a hardening item, not a launch-blocking hole — and `adminChargeToCredit`
  is `super`+`accounting`-gated, audited (`customer.credit_charged`), so any
  breach is attributable and reversible.
- **Suggested fix:** wrap the read-check-insert in a `SELECT … FOR UPDATE` on
  the customer's `profiles` row, or add a deferred constraint trigger that
  re-derives outstanding and rejects if `> credit_limit`.
- **Owner:** ภูม.

---

### 🟡 U4-2-C (P2) — explicit partial-pay amount is silently clamped to outstanding, not rejected

- **File:** `actions/credit.ts:128-130` — `amountToPay = min(requestedAmount,
  outstanding)`.
- **What's wrong / why minor:** a customer passing `amount_thb` larger than
  what they owe is silently capped to the outstanding rather than getting a
  "you only owe ฿X" error. This is *intentional* (the code comment says so,
  overpaying credit is meaningless) and **money-safe** — it can only ever
  *reduce* the debit, never inflate it. Noted only as a UX-clarity item: the
  UI could echo "capped to ฿X owed". Not a defect.
- **Owner:** ปอน / ภูม (UI copy) — optional.

---

### 🟡 U4-1-A (P2) — RBAC console has no self-lockout / last-super guard

- **File:** `actions/admin/admins.ts:24-70` (`adminGrantRole` /
  `adminToggleRole`).
- **What's wrong:** a `super` can `adminToggleRole({ is_active:false })` their
  own `super` row, or deactivate the *last remaining* active `super`. There is
  no "you cannot remove the last super" / "cannot deactivate yourself" guard.
  Result: the org could lock itself out of the `super`-only console (which
  includes the RBAC console itself) and need a direct DB write to recover.
- **Why it is NOT a P0:** every mutation is `withAdmin(["super"])`-gated and
  audited (`admin.toggle`), the `role` input is Zod-enum-locked to the 7 valid
  roles (no arbitrary-role injection — **no privilege-escalation hole**), and
  the action is destructive only to admin *availability*, never to money or
  customer data. It is an operational-safety gap, not a security breach.
- **Suggested fix:** in `adminToggleRole`, if `role='super'` and
  `is_active=false`, reject when it would leave zero active supers or when
  `profile_id === adminId`.
- **Owner:** ภูม.

---

### 🟡 U4-1-B (P2) — global-search payload visible to `sales_admin` includes money fields

- **File:** `app/[locale]/(admin)/admin/search/page.tsx:66` —
  `requireAdmin(["super","ops","accounting","sales_admin"])`.
- **What's wrong / why minor:** the search results echo `total_price` /
  `total_thb` / `amount_thb` on forwarders / orders / refunds to all four
  roles, including `sales_admin`. This is **consistent with existing access**
  — `sales_admin` already has full customer-detail access
  (`/admin/customers/[id]` is gated to `["ops","sales_admin","accounting"]`)
  which shows the same money figures, so the search page leaks nothing a
  `sales_admin` cannot already see. The page is **read-only** (no mutations),
  LIKE wildcards are escaped (`page.tsx:73`), and `driver`/`warehouse` get 404.
  Recorded only so a future tightening of `sales_admin` data scope remembers
  to include this surface. **No cross-customer leak** — every query is a
  global-by-design admin search, correctly gated.
- **Owner:** ภูม — only if `sales_admin` scope is ever narrowed.

---

### ✅ Migration `0072` (C-1 fix) — verified CORRECT, no blocker

`0072_wallet_self_serve_amount_sign_guard.sql` rebuilds the
`wallet_tx_insert_self_serve` RLS policy to **bind amount sign to kind**:
`kind='deposit' → amount > 0`, `kind='withdraw' → amount < 0`
(`0072:40-49`), plus a defence-in-depth table CHECK `wallet_tx_kind_sign_chk`
enforcing the same for *every* insert path (`0072:68-75`).

Cross-checked against the writers:
- `lib/validators/wallet.ts` `moneyBaht` forces `.positive()` for **both**
  deposit and withdraw input.
- `actions/wallet.ts` — `createDeposit` inserts `amount: d.amount` (positive);
  `createWithdraw` inserts `amount: -d.amount` (negative). Both satisfy the new
  policy + CHECK.
- `actions/admin/wallet.ts:48-56` — the admin approve action now **re-checks**
  the sign before flipping a row to `completed` ("deposit must be positive…",
  "withdraw must be negative…"). Exactly the C-1 audit recommendation.

The `+50000` sign-flip self-serve exploit (a direct PostgREST
`kind='withdraw', amount=+50000` insert that an admin approval would turn into
balance inflation) is **closed** at both the RLS layer and the table-CHECK
layer. The CHECK correctly leaves `order_payment` / `refund` / `credit_charge`
/ etc. unconstrained — those are admin-issued with their own business-rule
signs. Idempotent + additive + zero data migration. **Sound.**

---

## Prior-review deploy-blockers — both CLEARED on this branch

[`review-u1-u2-2026-05-18.md`](review-u1-u2-2026-05-18.md) flagged a **P0-1**
(refund: no amount cap / no paid-status check) + **P1-1** that "block next
prod deploy"; [`audit-core-2026-05-18.md`](audit-core-2026-05-18.md) flagged a
**C-1** P1. Git history on `dave` between the reviewed `7c83fb9` and the
current `1b763b0` shows both fixed:

- `7c75cf1 fix(refunds): P0-1 amount cap + paid-status guard on refund money
  path` + `f5a925f Merge P0-fix — refund money-cap + paid-status guard + IDOR
  fix (P0-1/P1-1/P2-6)`. Verified in `actions/refunds.ts:52-86` — the
  customer-side refund action now refuses a refund against a never-paid parent
  via `isNeverPaidParentStatus` for all three sources (forwarder / service
  order / yuan payment).
- `1b51afe fix(c-1): wallet RLS amount-sign guard + admin approve sanity
  check` — this is migration `0072`, verified CORRECT above.

No open prior-review deploy-blocker remains against `1b763b0`.

---

## Build / test evidence

| Gate | Result |
|---|---|
| `pnpm install` | ✅ ok (engine warn: Node 20 vs wanted ≥24 — pre-existing, non-fatal) |
| `pnpm build` (prod, Turbopack) | ✅ **exit 0** — every route emitted, all 122 changed files compile + type-check |
| `pnpm test:unit` (DB-free suite) | ✅ **exit 0** — every suite `0 fail` (validators · calc-price · billing-gate 20/20 · container-margin · wallet balance · notification templates · …) |
| `next start` + curl smoke | ⚠️ not run — listener socket sandbox-denied in this isolated worktree; superseded by the prod-build route emission + `requireAuth`/force-dynamic trace |
| live cargo `qa-flow-run` | ⚠️ not run — dev Supabase `gnortvyazfmocvcbvfbs` deleted + network-isolated; residual obligation on ภูม before the next flow-touching deploy |

---

## Final verdict

# 🟢 GO — deploy `dave` @ `1b763b0` to `main`.

**Rationale:**
- **0 P0 deploy-blockers.** The U4-2 credit line, U4-1 RBAC console + global
  search, and migration `0072` were reviewed line-by-line for money-safety,
  authz, IDOR, and idempotency. The two P1 findings (U4-2-A credit-pay
  concurrency, U4-2-B admin-charge cap race) are real but are the **same
  launch-accepted concurrency posture** as the cargo money paths already in
  production (money-audit P1-1) — U4-2 inherits the risk, it does not create a
  new one. The three P2s are operational-safety / UX-clarity items.
- **Authz is sound:** every admin mutation is `withAdmin([roles])`-gated
  server-side; RBAC grants are `super`-only with a Zod-enum-locked role input
  (no escalation hole); global search is read-only, wildcard-escaped,
  role-gated, and leaks nothing beyond the gated roles' existing access.
- **C-1 / `0072` is correct** — the `+50000` sign-flip exploit is closed at
  both the RLS and table-CHECK layers.
- **Both prior-review deploy-blockers** (U1 refund P0-1, core C-1) are fixed
  and verified on this branch.
- **Build green, unit suite green.**

**Conditions attached to the GO (do not block this deploy, but owe a
follow-up):**
1. **ภูม — run a live `qa-flow-run`** against the recreated dev Supabase
   before the *next* flow-touching deploy. This offline pass could not drive
   the cargo flows end-to-end; the GO rests on "no flow logic changed since
   the last green live run + U4 is additive."
2. **ภูม — schedule U4-2-A + U4-2-B + the existing money-audit P1-1** as one
   coherent concurrency-hardening fix (row-lock the `wallet` row, or move the
   completed-debit legs to `pending`).
3. **ภูม — add the last-super / self-lockout guard** to `adminToggleRole`
   (U4-1-A) — operational safety.

---

*Generated by the pre-deploy verification agent · read-only · 2026-05-18 ·
branch `dave` @ `1b763b0`.*
