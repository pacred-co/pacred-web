# ADR-0018 — Wallet Source-of-Truth = legacy `tb_wallet` + `tb_wallet_hs`

**Status:** Accepted 2026-05-30 (เดฟ + ก๊อต — pending ก๊อต co-sign in writing; เดฟ owns the implementation contract)
**Supersedes (on the wallet domain only):** the rebuilt-era `wallet` / `wallet_transactions` model implied by migrations `0007` (`wallet_recompute_balance` trigger) + `0064` (`wallet_available_balance()` function).
**Closes audit gate:** [`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md) §1 #1 risk + §6 เดฟ Task 1 + ก๊อต Task 1.
**Implementation (2026-05-30 · เดฟ):** D-1/D-2 shipped — Settle-1 `8d4b9c2f` (P0-2) + Settle-2 `cb9f4220` (P0-9), both verified faithful vs legacy via workflow. D-3 balance-read repoint shipped (`46379832`). **D-4 qa-flow gate (`tests/qa-flows/wallet-delta.ts`) RAN GREEN on prod 2026-05-30 — 8/8, real `tb_wallet.wallettotal` +Δ / −Δ / no-Δ on approve / debit / reject.** All on `dave-pacred`, behind the production gate (NOT yet on main). **Pending:** ก๊อต's written co-sign + a CI re-run of the gate before the money-loop batch merges to main.

## Context

The 2026-05-30 master gap audit (17 agents · 14 lanes · 2 critics) found **the wallet/money loop never closes across four lanes at once.** All four share one unmade decision:

| Lane | The money-leak | Reads | Writes |
|---|---|---|---|
| cust-04 P0-2 (yuan wallet-paid) | balance never drops after successful transfer — double-spend | `tb_wallet` for display, `wallet_transactions` for spend-check | pending `wallet_transactions` row that no approve path ever settles |
| cust-05 P0-7 (customer withdraw) | migrated customers see ฿0 withdrawable; request invisible to admin | rebuilt `wallet.balance` (always 0 on prod) | rebuilt `wallet_transactions` |
| cust-02 P0-6 (pay-from-wallet on shop order) | 0-row-fails for every migrated order | rebuilt `service_orders` (empty) | rebuilt `wallet_transactions` |
| adm-15 / MS-1 (admin approves top-up slip) | cash inflow never reaches the customer | `tb_wallet_hs` so the pending list looks real | rebuilt `wallet_transactions` by UUID |

The 8,898 migrated customers' real balances live in **`tb_wallet.wallettotal`** (legacy), with the per-row ledger in **`tb_wallet_hs`** (legacy). The rebuilt `wallet` / `wallet_transactions` tables are **empty on production**. Every "silent dead-write" pattern called out by the audit (§5 #1) traces back to this one ambiguity.

Helper-level evidence (verified against the live code on `dave-pacred`):

- `lib/wallet/balance.ts` — the canonical `sumAvailableBalance()` + `getWalletAvailableBalance()` helpers **read `wallet_transactions`** (rebuilt). The doc-comment even calls out that the `0007` trigger sums only `status='completed'`, and the `0064` SQL `wallet_available_balance()` is its DB mirror. All correct for the rebuilt model — none of it reads `tb_wallet_hs` where the real ledger is.
- `actions/admin/wallet-hs.ts` — **the existing faithful writer** for `tb_wallet`+`tb_wallet_hs`. Documents the legacy status/type matrix verbatim (status `1`=pending / `2`=approved / `3`=rejected; type `1`=deposit / `2`=ฝากสั่งซื้อชำระจาก wallet / `3`=ถอน / `4`=สั่งจ่ายค่าคอม / `5`=คืน / `6`=ฝากโอนชำระจาก wallet / `7`=manual-withdraw; `typenew` 1=deposit / 2=refund / 3..7=various pay). Already lifted the `resolveLegacyAdminId()` helper (third caller — runbook satisfied).
- `actions/admin/wallet.ts` (live but **DEAD on tb_***) + `actions/admin/wallet-trans.ts` (also rebuilt) are the twins to retire.
- Tier-A1 (commit `913248a6`) already debits `tb_wallet`+`tb_wallet_hs` correctly for the yuan adminCreateManual path — confirms the legacy contract works in our codebase today.

**The decision is therefore "ratify the half that already works."** No table is being introduced; the choice is which half retires.

## Decision

### D-1 — Canonical wallet SOT: **`tb_wallet` + `tb_wallet_hs`** (legacy)

For every wallet read, balance check, debit, credit, refund, and admin approval/rejection in Pacred:

- **Balance** = `tb_wallet.wallettotal` (the running stored balance, per-user; `numeric(10,2)`).
- **Ledger** = `tb_wallet_hs` (one row per movement). Status/type matrix per the wallet-hs.ts docblock above; the schema reference is `supabase/migrations/0081_pcs_legacy_schema.sql` L6135 (`tb_wallet`) + L6159 (`tb_wallet_hs`) + L6338 (`tb_wallet_paydeposit`).
- **Slip linkage** = `tb_wallet_paydeposit` (one row PER `(tb_wallet_hs.id, refOrder)` link — used by the legacy "one slip → N pending orders" cascade settle).

The rebuilt `wallet`, `wallet_transactions`, `wallet_recompute_balance` trigger (0007), and `wallet_available_balance()` function (0064) are **frozen** — no new writes, no new readers. They retire when the last reader is migrated (a follow-up sprint, NOT a launch blocker).

### D-2 — The settle contract (legacy faithful, one row per state transition)

This is the contract every wallet writer (customer or admin) MUST implement. It is the legacy `payment.php` + `wallet.php` behaviour, restated for our codebase.

**Money never moves in two places at once.** A row in `tb_wallet_hs` represents the *promise* of a balance change; the change to `tb_wallet.wallettotal` happens iff that row is `status='2'` (approved). No more "pending-row gets summed by a trigger" — the trigger is part of the rebuilt model we're retiring.

The three transitions:

1. **Customer DEBIT on submit (synchronous, fail-closed).** Examples: pay-from-wallet on shop order (cust-02 P0-6), wallet-paid yuan transfer (cust-04 P0-2), customer withdraw request (cust-05 P0-7).
   - Pre-check: `tb_wallet.wallettotal >= debit`. If not → `{ ok:false, reason:'insufficient_balance' }` (no rows touched).
   - INSERT `tb_wallet_hs` row: `status='2'` (approved — customer-initiated debits are auto-approved at submit, mirrors legacy `payment.php`), the matching `type` per the matrix (yuan-from-wallet=`6`, shop-from-wallet=`2`, withdraw=`3`), positive `amount` (direction encoded by `type`), `refOrder` = the parent record (`tb_header_order.hno` / `tb_payment.id` / withdraw row id), `userID` = customer's `tb_users.userID`, `adminID` = `null` (no admin yet), `adminIDcrate` = customer's userID.
   - UPDATE `tb_wallet.wallettotal -= debit` (read-modify-write; INSERT-if-no-row mirrors `wallet-hs.ts` upsert).
   - On any rollback after the insert succeeds → DELETE the inserted `tb_wallet_hs` row (the Tier-A1 recovery pattern: Supabase REST has no real tx; the action owns the rollback). Document each call-site's rollback path.

2. **Customer CREDIT on submit (deposit slip uploaded).**
   - INSERT `tb_wallet_hs` with `status='1'` (pending — awaits admin slip review), `type='1'` (deposit), positive `amount`, no `tb_wallet` update yet.
   - Admin approval transitions it (rule 3).

3. **Admin APPROVE / REJECT (the slip-review + manual-entry path).**
   - **Approve a customer CREDIT (status `1→2`):** UPDATE the existing `tb_wallet_hs` row to `status='2'`, stamp `adminID` + `adminIDupdate`; then UPDATE `tb_wallet.wallettotal += amount`. If `tb_wallet_paydeposit` links exist for this row, cascade: for each linked `(hs_id, refOrder)` flip the matching `tb_header_order.hStatus` / `tb_forwarder.fStatus` per the legacy `wallet.php` deposit cascade.
   - **Reject a customer CREDIT (status `1→3`):** UPDATE `tb_wallet_hs.status='3'` + stamp admin; **no `tb_wallet` change** (the money was never credited).
   - **Approve a customer DEBIT (withdraw, status `1→2`):** UPDATE `tb_wallet_hs.status='2'` + stamp admin; **no `tb_wallet` change** (the debit happened at submit per rule 1). This is "approve to pay out" — the bank-transfer is the side-effect, the balance was already debited.
   - **Reject a customer DEBIT (withdraw refund, status `1→3`):** UPDATE `tb_wallet_hs.status='3'` + stamp admin; INSERT a *new* `tb_wallet_hs` row with `type='5'` (คืน), positive `amount`, `refOrder` = the rejected row's id; UPDATE `tb_wallet.wallettotal += amount` (give the money back). This is the "ของจริงตอนปฏิเสธ" path — it cost us a P0 in audit because Pacred currently just flips status with no refund.
   - **Admin manual deposit / withdraw / adjustment:** the existing `wallet-hs.ts` path — insert with `status='2'` directly (admin IS the verifier), update `tb_wallet` accordingly.

**Idempotency (every approve/reject path).** Before mutating, SELECT for the target row's current status. If already terminal (`2` or `3`) → `{ ok:true, alreadyDone:true }`. This is what `actions/admin/yuan-payments.ts` adminUpdateYuanPayment (Tier-A5) already does on `tb_wallet_hs WHERE type='5' AND refOrder=id` for refund.

**Type-enum drift (audit P1-25).** Pacred's `wallet-hs.ts` documents withdraw as `type='7'`; legacy `wallet.php` uses `type='3'` for withdraw. **The settle contract uses LEGACY values** — `3` = ถอน. `wallet-hs.ts` must be patched to match (one-line, in the same PR as the withdraw approve/refund engine).

**Paydeposit cascade (cust-05 P1-27).** A single approved deposit slip can link to N orders via `tb_wallet_paydeposit (hs_id, refOrder)`. Approve = also iterate the links and flip each `tb_header_order.hStatus='3'` (paid) / `tb_forwarder.fStatus='6'` (เตรียมส่ง) per legacy `wallet.php` cascade. Reject = DELETE the link rows, leave the parent orders in their prior state.

### D-3 — Helper-level repoint (concrete file moves)

The settle contract above translates to **one repoint** + **two retires** + **one patch**:

1. **REPOINT** `lib/wallet/balance.ts`:
   - Replace the `from("wallet_transactions").select("amount,status").eq("profile_id",…)` read with: SELECT `tb_wallet.wallettotal` for the user (display balance) + SELECT `tb_wallet_hs WHERE userID=? AND status='1' AND <amount-direction predicate>` for the "open pending debit" overhang. The `sumAvailableBalance()` reducer stays the same shape; only the source rows change.
   - Update the `WalletBucket` type: legacy has no `cashback` / `credit` bucket dimension on `tb_wallet` — the "cash-back" wallet lives in a separate table `tb_cash_back` (cust-01 P1-16); the "credit" is the customer-credit-line, a separate concern. So `WalletBucket` collapses to a single `"main"` for tb_wallet; cashback + credit are *different actions* against *different tables*, not buckets on the same table. The helper signature changes (a callsite audit + update follows).
   - DB-level `wallet_available_balance()` (migration 0064) becomes obsolete — flag for retire when the last reader is migrated.

2. **RETIRE** `actions/admin/wallet.ts` (rebuilt) + `actions/admin/wallet-trans.ts` (rebuilt): keep them on disk for one sprint as a tombstone; every NEW import lands on `wallet-hs.ts`. The MS-1 / P0-9 fix (admin top-up approval, audit § §3) is literally: repoint the import in `(admin)/admin/wallet/[id]/edit-form.tsx` + `slip-review-modal.tsx` + `actions-cell.tsx` + `bulk-approve-bar.tsx` from `wallet.ts` → `wallet-hs.ts` (whose code already implements rule 3).

3. **PATCH** `actions/admin/wallet-hs.ts` withdraw type-enum: `'7'` → `'3'` (legacy faithful). One line.

4. **NEW** (per the settle contract, customer side): `actions/wallet-tb.ts` (mirrors the `*-tb.ts` naming convention Tier-A established) — `submitWithdrawRequest()` per rule 1 (customer DEBIT-on-submit, status='2', type='3'); also the home of any new customer-side wallet mutations the audit's cust-04/05/02 closures need.

### D-4 — Production gate (ก๊อต)

**No money-loop fix lands on `main` until** `qa-flow-simulator` runs E2E and asserts a real `tb_wallet.wallettotal` delta against a seeded fixture. The route-200 smoke cannot catch a dead-write (the audit's #1 lesson). Add a `tests/qa-flows/wallet-delta.ts` template (deposit → approve → assert +Δ; withdraw → approve → assert no Δ; reject → assert refund Δ).

## Consequences

**Closes (gates these P0s for fix, in `_MASTER.md` ranking):**
- P0-2 yuan wallet-paid never settles (now: rule 1 debit at submit)
- P0-6 pay-from-wallet on shop order 0-row-fails (now: read+write `tb_*`)
- P0-7 customer withdraw writes rebuilt (now: rule 1 submit + rule 3 admin approve/refund)
- P0-8 `/wallet/history` contradicts `/wallet` (now: both read `tb_wallet_hs`)
- P0-9 / MS-1 admin top-up approval credits nothing (now: rule 3 approve + `tb_wallet_paydeposit` cascade)
- P1-14 two-wallet-ledger split
- P1-25 withdraw type-enum mismatch (patch in D-3 #3)
- P1-26 withdraw approve/reject + refund engine missing
- P1-27 `tb_wallet_paydeposit` batch-settle missing
- P1-29 customer address stack (already deleted) — independent but proves the orphan-twin pattern

**Defers (not in scope for this ADR):**
- The cash-back wallet (`tb_cash_back`) — separate action, separate ADR if architecture warrants.
- The customer credit-line (`tb_wallet_credit` / overdraw allowance) — already on `tb_*` per the cust-05 doc; no SOT ambiguity, no ADR needed.
- The affiliate shop wallet (`tb_wallet_shop`) — ก๊อต Task 3 confirms whether it was ever live in prod; severity re-rank after.

**Does NOT close (different lanes):**
- The cart+order unification (P0-3/4/5) — that's a `tb_header_order` decision, independent of wallet.
- The detail-page UUID-vs-legacy dual-mode (P1-3 / P0-14) — independent.

**Sequencing rule.** The money-loop fixes (P0-2/6/7/9 + P1-25/26/27) ship as **ONE reviewed batch** behind the ก๊อต gate. A half-state on the money loop is worse than the current dead-state (e.g. submit debits `tb_wallet` but admin approve doesn't credit → real money lost). Sprint 1 in `_MASTER.md` §7 already serializes this correctly.

**Reachability (AGENTS.md §0d).** Every fix ships its UI button in the same change. Specifically: admin withdraw approve queue (P1-26) gets a sidebar entry; customer withdraw page renders the legacy submit button; admin top-up approval modal gets re-wired in the slip-review surface.

**Retire window.** When the last `wallet_transactions` reader migrates, drop the table + `0007` trigger + `0064` function in one migration. Target: end of Sprint 3 (per `_MASTER.md` §7).

## References

- Audit master: [`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md) §1 risk + §3 P0-1..9 + §6 work-split
- Lane docs: [`cust-04-yuan.md`](../research/legacy-gap-2026-05-30/cust-04-yuan.md) + [`cust-05-wallet.md`](../research/legacy-gap-2026-05-30/cust-05-wallet.md) + adm-11 + adm-15 critic notes
- Legacy spec: `pcsc/public_html/member/payment.php` (yuan debit) + `pcsc/public_html/member/wallet.php` (deposit/withdraw cascades)
- Schema: `supabase/migrations/0081_pcs_legacy_schema.sql` L6135 / L6159 / L6338
- Tier-A precedent (legacy contract proven in code): commits `913248a6` (A1 yuan create + debit), `38cac4fd` (A5 yuan update + idempotent refund), `cd9bf5cf` (A2 mark-paid + idempotency).
- Faithful writer pattern: `actions/admin/wallet-hs.ts` (lift this docblock when porting new writers).
- ADR-0017 (D1 faithful port): this ADR is its wallet-domain crystallisation.
