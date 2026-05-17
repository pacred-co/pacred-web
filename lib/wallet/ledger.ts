/**
 * Wallet ledger — shared balance helpers (W-3 wallet-integrity chain).
 *
 * Per [docs/research/PACRED-MASTER-STRATEGY.md] §2 + [gap-customer.md] H-1.
 *
 * ── Why this module exists ──────────────────────────────────────────
 * `wallet.balance` (table `public.wallet`) is recomputed by the trigger
 * `wallet_recompute_balance()` (migration 0007) as
 *     sum(amount) WHERE status = 'completed'
 * — i.e. it counts ONLY completed rows. A *pending* debit (a withdraw
 * request or a wallet-paid yuan transfer awaiting admin approval) is
 * `status='pending'`, so it does NOT reduce `wallet.balance`.
 *
 * That is the H-1 hole: a customer stacks N pending debits, each one
 * individually ≤ the (unmoved) balance; an admin then approves them all
 * → `wallet.balance` goes negative. Pacred pays out / ships transfers it
 * never funded.
 *
 * ── The one rule (applied at every debit site) ──────────────────────
 * A new debit must be checked against the AVAILABLE balance, not the raw
 * balance:
 *
 *     available = completed balance − Σ |pending debits|
 *
 * A pending debit = a wallet_transactions row with status='pending' AND
 * amount < 0 (negative = a debit; pending deposits are positive and are
 * NOT subtracted — they don't fund anything until approved either, but
 * they also don't *remove* funds, so they're simply ignored).
 *
 * `createWithdraw`, `createYuanPayment` call `getAvailableBalance()` then
 * `assertSufficientAvailable()` before inserting their pending debit.
 *
 * pay-from-wallet paths (`payServiceOrderFromWallet`,
 * `payForwarderFromWallet`, `recordFreightPayment` wallet branch) insert
 * a *completed* debit immediately — they keep their existing raw-balance
 * check, which is correct for an instant debit. The deliberate admin
 * `allow_overdraw` cash path (admin records "customer paid cash" even
 * though wallet < total) is untouched: these helpers are only consulted
 * by the customer self-serve request paths.
 *
 * No DB access here — callers pass the numbers they already fetched, so
 * this stays a pure, unit-testable module (the DB-trigger behaviour is
 * covered by lib/wallet/ledger.test.ts).
 */

/** A wallet_transactions row, reduced to the fields balance math needs. */
export type LedgerRow = {
  amount: number;
  status: "pending" | "completed" | "failed" | "cancelled";
};

/**
 * Σ of pending DEBITS as a positive magnitude.
 *
 * A debit is a negative-amount row. Pending credits (positive amount —
 * e.g. a deposit awaiting approval) are ignored: they neither add nor
 * remove spendable funds. Completed / failed / cancelled rows are ignored
 * — completed ones are already in the balance; failed/cancelled never
 * move money.
 *
 * Returns a non-negative number (the total amount currently "reserved"
 * by not-yet-approved debits).
 */
export function sumPendingDebits(rows: ReadonlyArray<LedgerRow>): number {
  const total = rows.reduce((acc, r) => {
    const amt = Number(r.amount);
    if (r.status === "pending" && Number.isFinite(amt) && amt < 0) {
      return acc + amt; // amt is negative → acc accumulates a negative sum
    }
    return acc;
  }, 0);
  // Return the magnitude (positive). round to 2dp (THB cents).
  return Math.round(Math.abs(total) * 100) / 100;
}

/**
 * Available (spendable) balance.
 *
 *     available = completedBalance − Σ |pending debits|
 *
 * `completedBalance` is `wallet.balance` (the trigger-maintained sum of
 * completed rows). `pendingRows` is the customer's wallet_transactions
 * rows — only the pending debits among them are subtracted.
 *
 * Can return a negative number if pending debits already exceed the
 * balance (e.g. an admin overdraw happened) — callers treat any value
 * below the requested amount as insufficient, so a negative available
 * correctly blocks every further debit.
 */
export function getAvailableBalance(
  completedBalance: number,
  pendingRows: ReadonlyArray<LedgerRow>,
): number {
  const completed = Number(completedBalance) || 0;
  const available = completed - sumPendingDebits(pendingRows);
  return Math.round(available * 100) / 100;
}

/**
 * True when `available` covers `requested`.
 *
 * `requested` is the positive THB magnitude of the debit the customer is
 * trying to commit. A tiny epsilon absorbs float dust so a debit that
 * exactly equals the available balance is not spuriously rejected.
 */
export function hasSufficientAvailable(
  available: number,
  requested: number,
): boolean {
  const EPS = 0.005;
  return Number(available) + EPS >= Number(requested);
}
