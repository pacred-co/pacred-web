/**
 * Unit tests for the pending-aware wallet available-balance helpers.
 *
 * Locks the gap-customer.md §H-1 fix: "available balance" = completed
 * rows + open pending DEBITS — pending credits (a deposit awaiting
 * approval) do NOT count. The DB-side mirror of this rule is migration
 * 0064's wallet_available_balance(); its integration coverage lives in
 * lib/wallet/overdraw-guard.test.ts.
 *
 * Pattern matches lib/validators/wallet.test.ts (pass/fail counts, no vitest).
 */

import { sumAvailableBalance, isWalletOverdrawError } from "./balance";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────
section("sumAvailableBalance — completed rows");
// ────────────────────────────────────────────────────────────

assertEq("empty ledger = 0", sumAvailableBalance([]), 0);
assertEq("one completed credit",
  sumAvailableBalance([{ amount: 1000, status: "completed" }]), 1000);
assertEq("completed credit + completed debit",
  sumAvailableBalance([
    { amount: 1000, status: "completed" },
    { amount: -300, status: "completed" },
  ]), 700);

// ────────────────────────────────────────────────────────────
section("sumAvailableBalance — pending debits count, pending credits do not");
// ────────────────────────────────────────────────────────────

assertEq("pending DEBIT reduces available (the §H-1 fix)",
  sumAvailableBalance([
    { amount: 1000, status: "completed" },
    { amount: -200, status: "pending" },
  ]), 800);
assertEq("pending CREDIT (deposit awaiting approval) does NOT count",
  sumAvailableBalance([
    { amount: 1000, status: "completed" },
    { amount: 500, status: "pending" },
  ]), 1000);
assertEq("stacked pending debits all subtract",
  sumAvailableBalance([
    { amount: 1000, status: "completed" },
    { amount: -400, status: "pending" },
    { amount: -400, status: "pending" },
    { amount: -400, status: "pending" },
  ]), -200);
assertEq("failed / cancelled rows are ignored",
  sumAvailableBalance([
    { amount: 1000, status: "completed" },
    { amount: -100, status: "failed" },
    { amount: -50, status: "cancelled" },
    { amount: -200, status: "pending" },
  ]), 800);
assertEq("pending debit with no completed rows = negative available",
  sumAvailableBalance([{ amount: -100, status: "pending" }]), -100);

// ────────────────────────────────────────────────────────────
section("sumAvailableBalance — numeric robustness");
// ────────────────────────────────────────────────────────────

assertEq("float drift rounded to 2dp",
  sumAvailableBalance([
    { amount: 0.1, status: "completed" },
    { amount: 0.2, status: "completed" },
  ]), 0.3);
assertEq("string amounts (PostgREST numeric) parsed",
  sumAvailableBalance([
    { amount: "1000.50", status: "completed" },
    { amount: "-0.50", status: "completed" },
  ]), 1000);
assertEq("non-numeric amount skipped, not NaN-poisoned",
  sumAvailableBalance([
    { amount: 500, status: "completed" },
    { amount: "not-a-number", status: "completed" },
  ]), 500);

// ────────────────────────────────────────────────────────────
section("isWalletOverdrawError — recognises the 0064 trigger rejection");
// ────────────────────────────────────────────────────────────

assertEq("matches the trigger exception message",
  isWalletOverdrawError({ message: "wallet overdraw blocked: available 0.00, requested debit -100" }), true);
assertEq("case-insensitive",
  isWalletOverdrawError({ message: "WALLET OVERDRAW BLOCKED" }), true);
assertEq("unrelated DB error → false",
  isWalletOverdrawError({ message: "duplicate key value violates unique constraint" }), false);
assertEq("error with no message → false",
  isWalletOverdrawError({ code: "23505" }), false);
assertEq("non-string message → false",
  isWalletOverdrawError({ message: 123 }), false);
assertEq("null → false", isWalletOverdrawError(null), false);
assertEq("undefined → false", isWalletOverdrawError(undefined), false);
assertEq("plain string → false", isWalletOverdrawError("overdraw"), false);

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
