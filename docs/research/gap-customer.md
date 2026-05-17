# 🔎 Pacred — Customer-side Gap Hunt ("เจาะให้หมดเปลือก")

> Produced 2026-05-17 by a deep walk of Pacred's customer-facing source
> (`app/[locale]/(public|protected)/`, customer `actions/*.ts`, `components/`)
> compared against (a) the PCS legacy member portal at
> `/Users/dev/Desktop/pcscargo/member/` and (b) the chat-research pain points
> in [`docs/research/`](_index.md).
>
> **Scope filter:** this lists ONLY customer functions/holes that are **not
> already planned**. Anything in [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)
> (R-1..R-M5), [`PORT_PLAN.md`](../PORT_PLAN.md) Part V (V-A..V-H), or
> [`STRATEGY.md`](../STRATEGY.md) is excluded by design — go read those for the
> known roadmap. New items here are flagged **NEW**.

---

## 1. Summary

Pacred's customer spine is solid: ฝากสั่ง / ฝากนำเข้า / ฝากโอน, wallet
deposit+withdraw+pay-from-wallet, shipment tracking timeline, notifications,
tax-invoice request, addresses, sales-rep card. The legacy 9-tile member
dashboard is fully covered and then some.

The **un-planned** customer gaps cluster in three places the roadmap skipped:

1. **The wallet's two "ghost" buckets.** `cashback_balance` and `credit_balance`
   exist in the schema (migration 0007), are rendered on `/wallet/history`
   ("วงเงินเครดิตจาก Pacred"), and have ledger `kind`s defined
   (`cashback_earn`/`cashback_redeem`) — but **zero code earns, grants, or
   spends either.** The legacy system had a real **customer credit line**
   (`tb_users.userCreditValue`, the `เครดิตสินค้า` tab, `forwarder/?q=c` batch
   credit-settlement). Pacred shows the customer a "credit wallet" it cannot
   use. This is the single largest customer-facing dead surface.

2. **No post-delivery / problem-resolution loop.** A customer can place and pay
   an order but has **no way to**: confirm goods received, report a missing/
   damaged item ("ตกหล่น"), open a claim, or request a refund. Every one of
   these is a chat ticket today — exactly the leak the research flags as
   surfacing "days later via a customer complaint."

3. **Several existing flows have real holes** — most seriously an
   **un-aggregated pending-debit overdraw** on withdraw + yuan-payment (a
   customer can stack pending requests past their balance), and tax invoices
   not being requestable for ฝากโอน (Yuan transfer).

None of these is a 2026-05-18 launch blocker, but #1 and #2 are visible to
every customer from day one and #3 #3.1 is a money-loss path.

---

## 2. Unbuilt + unplanned customer functions (ranked)

Effort: **S** ≤3d · **M** 1–2wk · **L** 2–4wk.

### G-C1 🥇 — Customer credit line (เครดิตสินค้า / "pay later") — NEW
- **What:** The legacy portal gave qualifying customers a **credit limit**
  (`tb_users.userCreditValue`). Imports/orders could be placed on credit
  (`tb_forwarder.fCredit=1`), shown in a dedicated **`เครดิตสินค้า` tab**, and
  settled later as a batch via `forwarder/?q=c`. Pacred has the *destination*
  (`wallet.credit_balance`, a `credit` bucket in the ledger, the `/wallet`
  "เครดิต — วงเงินเครดิตจาก Pacred" card) but **no credit-limit field on the
  profile, no "place on credit" path, no credit-outstanding view, no
  settlement flow.** Build: `profiles.credit_limit` + a credit-charge kind +
  an outstanding-credit screen + a "pay my credit" action.
- **Why it matters:** legacy evidence is explicit — `wallet-credit.php`:
  `วงเงินเครดิตที่ใช้งานได้`, `ยอดเครดิตค้างชำระ`; `forwarder.php` L583-587
  renders the `เครดิตสินค้า` nav with a pending-count badge. Credit was a
  retention lever for repeat importers (place now, the goods are already
  moving, settle on arrival). Pacred currently *shows* a credit wallet it
  cannot fund or spend → customer confusion + a missing competitive feature.
- **Severity:** High (dead UI + lost feature). **Effort:** L.
  **Depends on:** an admin credit-limit grant screen (admin domain); ties to
  R-7 AP/cost ledger only loosely. Needs a small ADR (credit eligibility +
  limit rules + overdue handling).

### G-C2 🥇 — Missing/damaged-goods claim + issue reporting ("ตกหล่น") — NEW
- **What:** A customer-initiated **issue/claim record** attached to a
  forwarder/service-order/shipment: type (missing item / damaged / wrong item
  / shortfall), description, photo upload, desired resolution. Status
  lifecycle (open → investigating → resolved/rejected) visible to the
  customer. Today the customer's only channel is LINE.
- **Why it matters:** [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md)
  `OT-2` + `DI-7`: shrinkage "is invisible until a customer complains … days
  later, manually, resolved 100% in chat." The roadmap's **R-9** builds the
  *warehouse-side* `expected_qty/received_qty` + discrepancy record — but
  **R-9 is staff-facing**; there is no **customer-facing** "report a problem"
  entry point or claim-status view. They are complementary, not duplicates.
- **Severity:** High. **Effort:** M.
  **Depends on:** loosely on R-9 (a customer claim should be able to link a
  warehouse discrepancy row); can ship standalone first.

### G-C3 🥈 — "Confirm goods received" / delivery acknowledgement — NEW
- **What:** When a forwarder/order reaches `delivered`, give the customer a
  **"ยืนยันรับสินค้าครบถ้วน"** button (and a "แจ้งปัญหา" alternative → G-C2).
  Records who/when the customer confirmed; closes the loop cleanly.
- **Why it matters:** right now `delivered` is a terminal status the customer
  can only *read*. There is no acknowledgement, so disputes have no "customer
  said it was fine on <date>" anchor, and Pacred can't distinguish "delivered
  and happy" from "delivered and a box is missing." Pairs naturally with the
  claim window in G-C2 (e.g. claim allowed for N days after delivery).
- **Severity:** Medium. **Effort:** S. **Depends on:** G-C2 (shares the
  "report a problem" branch).

### G-C4 🥈 — Tax invoice for ฝากโอน (Yuan transfer) — NEW
- **What:** `requestTaxInvoice` (`actions/tax-invoices.ts`) accepts
  `order_type` of only `service_order` | `forwarder`. A customer who used
  **ฝากโอนชำระ (yuan_payments)** and paid a service fee **cannot request a tax
  invoice** for it. Add `yuan_payment` as a third source type.
- **Why it matters:** ฝากโอน is one of the three core cargo services and
  juristic customers expect a ใบกำกับภาษี for every fee they pay. This is a
  silent functional hole — the service-payment screens never even offer the
  option.
- **Severity:** Medium (juristic-customer trust). **Effort:** S.
  **Depends on:** confirming the VAT treatment of the yuan-transfer service
  fee with ก๊อต (ADR-0006 scope).

### G-C5 — Saved China-warehouse-address copy helpers & per-shipment guidance — NEW (minor)
- **What:** `/service-import/warehouse-addresses` renders the China warehouse
  address with the member code, but the legacy `china-address.php` was a
  customer touchpoint specifically so the buyer could hand the address to a
  Chinese shop. Pacred's page is good; the gap is small: there is no
  per-order "your forwarding instruction for this shipment" recap, and the
  copy-field affordance is static text. Low priority.
- **Why it matters:** the #1 new-customer confusion in cargo is "what address
  do I give the Taobao seller?" — worth a tiny polish, not a project.
- **Severity:** Low. **Effort:** S. **Depends on:** none.

### G-C6 — Self-service order edit before payment — NEW (minor)
- **What:** Once a `service_order` is placed it is immutable to the customer
  except cancel. The legacy `cart.php`/`forwarder.php` let a customer adjust
  qty/address before payment. Pacred forces cancel-and-recreate. A scoped
  "edit shipping address / note while still `awaiting_payment`" action would
  remove a class of cancel-rebuild churn.
- **Why it matters:** lower-severity UX trap; mostly an annoyance, but it
  generates avoidable cancel noise and re-quote work.
- **Severity:** Low. **Effort:** M (V-C2 covers staff-side bill-header edit;
  this is the *customer-side* pre-payment edit and is not planned).
  **Depends on:** none.

> **Deliberately NOT listed** (already planned — do not re-raise): public
> shipment tracking page / status enum / notifications (R-1), MOMO sync &
> Pay-Later gating (R-2), CRM/lead inbox (R-3), quote calculator (R-5), the
> warehouse-side discrepancy record (R-9), monitoring creds (R-M*),
> post-lock refund **for carrier-change over-collection** (V-C1). G-C2 is the
> *customer-facing* claim entry point, distinct from V-C1's narrow
> shipping-refund and R-9's staff scanning.

---

## 3. Holes / bugs in existing customer code

### H-1 🔴 — Stacked pending debits can overdraw the wallet (withdraw + yuan)
- **Where:** `actions/wallet.ts` `createWithdraw` (L157-210) and
  `actions/payment.ts` `createYuanPayment` (L83-144).
- **The hole:** both insert the debit row with `status: "pending"`. The wallet
  balance trigger (`migration 0007` `wallet_recompute_balance`) only sums
  rows `where status = 'completed'` — so **a pending debit does not reduce the
  balance.** The balance check (`wallet.ts` L178, `payment.ts` L90) reads the
  *current* balance. Therefore a customer can submit **N withdraw requests
  and/or N wallet-paid yuan transfers, each individually ≤ balance**, none of
  which is reflected until an admin approves them. When the admin then
  approves them all, the main balance goes **negative** — Pacred pays out / 
  ships transfers it was never funded for.
- **Why it matters:** this is a real money-loss path and is **distinct from
  the money-audit P0/P1 list** — P0-2 is about the yuan debit being
  *RLS-blocked* (a different bug, on a different line); P1-1 is about
  *concurrent pay-from-wallet* (which writes `completed` immediately). The
  *aggregate-pending* overdraw on the admin-gated withdraw path is not
  covered. Migration `0061` added only a tax-invoice dup guard.
- **Fix direction:** sum *pending + completed* debits in the balance check, or
  reserve funds (move to a held bucket / `completed` reservation row) at
  request time, or cap to one open withdraw at a time. Severity **P1** —
  exploitable the moment withdraw + yuan both go live.

### H-2 🟠 — `payServiceOrderFromWallet` post-debit failure leaves money/state split
- **Where:** `actions/service-order.ts` L606-621.
- **The hole:** after the wallet debit succeeds, if the `service_orders`
  status update fails, the code intentionally **does not roll back the wallet
  tx** (to preserve the audit trail) and returns an error string. The customer
  has been **debited** but the order still shows `awaiting_payment`. The same
  pattern is in `payForwarderFromWallet`. There is no automatic
  reconciliation and no customer-visible "payment received, finalising"
  state — the customer sees an error and an unchanged order, and may pay
  again (the idempotency guard catches the *second debit*, but the customer
  experience is "I paid and nothing happened").
- **Why it matters:** rare, but when it fires the customer is out money with
  no signal. Needs either a transactional RPC (debit + status flip atomic) or
  a visible "payment pending settlement" status + a reconciliation job.
- **Severity:** Medium (low frequency, high per-incident pain). Related to
  V-A3 (payment↔order reconciliation) but that task is admin-report-shaped;
  the *atomicity* fix here is not planned.

### H-3 🟠 — Customer cannot cancel a pending deposit/withdraw
- **Where:** `actions/wallet.ts` L213-219 (comment block) — the cancel action
  is **not implemented**. RLS only allows `pending → pending` updates, so a
  customer who attached the wrong slip or wrong bank account must contact an
  admin. The sidebar/wallet UI offers no cancel button.
- **Why it matters:** a dead-end. A wrong-slip deposit sits `pending` forever
  unless staff intervene; a mistaken withdraw can't be retracted by the
  customer. Small but a daily-friction self-service gap (the legacy portal let
  users delete their own pending wallet rows).
- **Severity:** Medium. **Fix:** an admin-client-backed `cancelWalletTx` with
  an ownership + `status='pending'` guard (the ADR-0014
  client-after-ownership-verify pattern already used by
  `payServiceOrderFromWallet`).

### H-4 🟡 — `placeServiceOrder` rollback only marks the header `cancelled`
- **Where:** `actions/service-order.ts` L441-446. If `service_order_items`
  insert fails after the header insert, the code sets the header to
  `cancelled` (RLS blocks `DELETE`). Result: a **stray `cancelled` order with
  zero items** appears in the customer's `/service-order` list and dashboard
  "recent orders." Cosmetic, but it pollutes the customer's history and the
  count badges.
- **Why it matters:** low severity, but it is a visible artefact of a failure
  path. A `status='draft'`/hidden state, or a transactional RPC for
  header+items, would avoid it.
- **Severity:** Low.

### H-5 🟡 — `how-to-use` is a placeholder; tracking has no public (logged-out) lookup
- **Where:** `app/[locale]/(public)/how-to-use/page.tsx` renders `<StubPage>`.
  Separately, `/shipments` is **auth-gated only** — there is no public
  "track by code" page for a logged-out user or a recipient who is not the
  account holder.
- **Why it matters:** `how-to-use` is linked as customer education but ships
  empty. The public-tracking piece *is* part of planned **R-1** (so not a new
  gap) — flagged here only so the two are not conflated: R-1 must include the
  logged-out lookup, and `how-to-use` content is an unowned stub.
- **Severity:** Low (content + a reminder, not a new build).

### H-6 🟡 — Withdraw/deposit notifications fire, but no failure-path UX for slip rejection
- **Where:** deposit slip validation (`wallet.ts` L115-123) returns
  `slip_invalid:*` codes on bad upload; admin can reject a deposit, but there
  is **no customer-facing "your deposit was rejected, reason X, re-upload"
  loop** — a rejected deposit just sits/disappears from the customer's point
  of view. (`createWithdraw` similarly has no rejection-with-reason surface.)
- **Why it matters:** the customer tops up, the slip is unreadable, and they
  get no actionable feedback — a top-of-funnel money-in friction.
- **Severity:** Low–Medium. Pairs with H-3 (both are wallet-tx lifecycle
  visibility gaps).

---

## 4. Chain notes — how these connect to other domains

- **G-C1 (credit line) → admin + revenue.** A credit line needs an **admin
  grant/limit screen** and an **overdue/aging view** (admin domain) and a
  **credit-receivable** that the AP/cost + accounting work (R-7 / R-4) should
  see as a distinct receivable class. If R-7's ledger is designed without
  knowing customer credit exists, credit-outstanding will be invisible to
  margin reporting. Flag to whoever scopes R-7's ADR.

- **G-C2 (customer claim) ↔ R-9 (warehouse discrepancy).** These must share a
  record or FK: a customer "missing item" claim and a warehouse
  `expected≠received` discrepancy are two views of the same event. Build the
  customer claim so it can **attach/merge** with an R-9 discrepancy row;
  otherwise staff reconcile two systems by hand — re-creating the exact leak
  R-9 set out to kill.

- **G-C3 (confirm received) → R-1 status board + integration.** Delivery
  acknowledgement is a natural terminal event on the R-1 container/shipment
  timeline and a clean signal for the MOMO Pay-Later "released" gate (R-2):
  customer-confirmed = the cleanest proof the loop is closed.

- **H-1 (overdraw) → money/billing domain.** Same family as money-audit
  P1-1's negative-balance floor. The fix should be **one** balance-integrity
  rule (pending+completed aware, with a hard non-negative floor) applied
  across pay-from-wallet, withdraw, and yuan-payment — not three patches.
  Best owned alongside the P0/P1 money-bug pass so the wallet gets one
  coherent guard.

- **H-2 / H-3 / H-6 → admin reconciliation.** All three are wallet-tx
  lifecycle visibility gaps. They connect to V-A3 (payment↔order
  reconciliation) and the admin wallet screens: if the customer side gets a
  "pending settlement" + "rejected, reason" surface, the admin side needs the
  matching reject-with-reason + reconcile actions. Scope them as one
  wallet-lifecycle slice across customer + admin.

- **G-C4 (yuan tax invoice) → tax/compliance.** Extends ADR-0006; whoever owns
  the tax-invoice flow should confirm the yuan-transfer **service fee** (not
  the transferred principal) is the VATable base before this is built.

---

### Cross-references
- Roadmap this deliberately does NOT duplicate → [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) R-1..R-M5
- Cargo backlog → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V (V-A..V-H)
- Money bugs (P0/P1) this extends → [`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md)
- Legacy shrinkage/claim evidence → [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) `OT-2`, `DI-7`
- Legacy credit-line evidence → `pcscargo/member/wallet-credit.php`, `forwarder.php` L583-587
- Wallet schema (the ghost buckets) → `supabase/migrations/0007_wallet.sql`

**End — `gap-customer.md`.** 6 unplanned functions (G-C1..G-C6) + 6 holes
(H-1..H-6). Top priority: G-C1 credit line (largest dead surface), G-C2 claim
loop; scariest hole: H-1 stacked-pending-debit overdraw.
