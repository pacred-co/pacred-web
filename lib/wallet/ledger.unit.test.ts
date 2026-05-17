/**
 * W-3 — wallet ledger balance-helper unit tests.
 *
 * Covers lib/wallet/ledger.ts — the pending-aware available-balance math
 * that closes gap-customer H-1 (stacked pending debits overdraw the
 * wallet). Pure functions, no DB / network — runs in <50ms.
 *
 * The DB-trigger side (wallet_recompute_balance) is covered separately by
 * lib/wallet/ledger.test.ts (an integration test that hits Supabase).
 *
 * Run with:  tsx lib/wallet/ledger.unit.test.ts
 * Or via:    pnpm test:unit  (chained)
 */

import {
  sumPendingDebits,
  getAvailableBalance,
  hasSufficientAvailable,
  type LedgerRow,
} from "./ledger";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}
function eq(label: string, actual: unknown, expected: unknown): void {
  assert(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}

console.log("wallet ledger balance helpers (W-3)");

// ────────────────────────────────────────────────────────────
// (a) sumPendingDebits — only pending + negative rows count
// ────────────────────────────────────────────────────────────
console.log("  (a) sumPendingDebits");
{
  eq("empty ledger → 0", sumPendingDebits([]), 0);

  // One pending debit of 500 → magnitude 500.
  eq("single pending debit",
    sumPendingDebits([{ amount: -500, status: "pending" }]), 500);

  // Two pending debits → summed magnitude.
  eq("two pending debits sum",
    sumPendingDebits([
      { amount: -500, status: "pending" },
      { amount: -250, status: "pending" },
    ]), 750);

  // A pending CREDIT (positive — e.g. a deposit awaiting approval) is
  // ignored: it does not remove spendable funds.
  eq("pending credit ignored",
    sumPendingDebits([
      { amount: 1000, status: "pending" },
      { amount: -300, status: "pending" },
    ]), 300);

  // completed / failed / cancelled debits do NOT count — completed ones
  // are already in wallet.balance; failed/cancelled never moved money.
  const mixed: LedgerRow[] = [
    { amount: -500,  status: "pending"   },
    { amount: -9999, status: "completed" },
    { amount: -8888, status: "failed"    },
    { amount: -7777, status: "cancelled" },
  ];
  eq("only pending debit counts in a mixed ledger", sumPendingDebits(mixed), 500);

  // Rounds to 2dp (THB cents).
  eq("rounds to 2dp",
    sumPendingDebits([
      { amount: -100.001, status: "pending" },
      { amount: -0.004,   status: "pending" },
    ]), 100.01);
}

// ────────────────────────────────────────────────────────────
// (b) getAvailableBalance — completed minus pending debits
// ────────────────────────────────────────────────────────────
console.log("  (b) getAvailableBalance");
{
  // No pending → available == completed balance.
  eq("no pending debits → full balance", getAvailableBalance(1000, []), 1000);

  // 1000 balance, 600 pending debit → 400 available.
  eq("balance minus one pending debit",
    getAvailableBalance(1000, [{ amount: -600, status: "pending" }]), 400);

  // The H-1 exploit: 1000 balance, two pending withdraws of 800 each.
  // Each was individually ≤ 1000 when submitted, but cumulatively they
  // overdraw — the available balance is now NEGATIVE, so any further
  // debit is correctly blocked.
  eq("stacked pending debits drive available negative",
    getAvailableBalance(1000, [
      { amount: -800, status: "pending" },
      { amount: -800, status: "pending" },
    ]), -600);

  // Completed debits already reflected in the balance are not
  // double-counted.
  eq("completed debits not double-counted",
    getAvailableBalance(500, [{ amount: -3000, status: "completed" }]), 500);
}

// ────────────────────────────────────────────────────────────
// (c) hasSufficientAvailable — covers requested, with epsilon
// ────────────────────────────────────────────────────────────
console.log("  (c) hasSufficientAvailable");
{
  assert("available > requested → ok",      hasSufficientAvailable(1000, 400));
  assert("available == requested → ok",     hasSufficientAvailable(500, 500));
  assert("available < requested → not ok",  !hasSufficientAvailable(300, 500));
  assert("negative available → never ok",   !hasSufficientAvailable(-100, 1));
  // float dust must not spuriously reject an exact-match debit.
  assert("epsilon absorbs float dust",      hasSufficientAvailable(499.999, 500));
  assert("a real shortfall is still rejected", !hasSufficientAvailable(499.5, 500));
}

// ────────────────────────────────────────────────────────────
// (d) end-to-end — the H-1 stacked-withdraw scenario
// ────────────────────────────────────────────────────────────
console.log("  (d) H-1 scenario — stacked withdraws cannot overdraw");
{
  const balance = 1000;
  const ledger: LedgerRow[] = [];

  // First withdraw of 800 — balance check sees 1000 available → allowed.
  const avail1 = getAvailableBalance(balance, ledger);
  assert("withdraw #1 of 800 allowed (1000 available)",
    hasSufficientAvailable(avail1, 800));
  ledger.push({ amount: -800, status: "pending" }); // request recorded

  // Second withdraw of 800 — WITHOUT the pending-aware check this would
  // also pass (raw balance still 1000). WITH it, available is now 200 →
  // the second request is correctly rejected.
  const avail2 = getAvailableBalance(balance, ledger);
  eq("available after one pending withdraw", avail2, 200);
  assert("withdraw #2 of 800 rejected (only 200 available)",
    !hasSufficientAvailable(avail2, 800));

  // A second withdraw of 200 (within the remaining available) is allowed.
  assert("withdraw #2 of 200 allowed (200 available)",
    hasSufficientAvailable(avail2, 200));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
