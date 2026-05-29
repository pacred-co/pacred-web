/**
 * Unit tests for the pending-aware wallet available-balance helpers.
 *
 * ADR-0018 §D-3 #1 repoint (2026-05-30): `sumAvailableBalance` now reduces
 * the LEGACY model — `available = tb_wallet.wallettotal − Σ open-pending
 * DEBITS` from `tb_wallet_hs` (status='1', debit type). Locks the same
 * gap-customer.md §H-1 invariant ("pending debits reduce spendable; pending
 * credits do not") against the new source rows. Debit direction is encoded
 * by `tb_wallet_hs.type` (2/3/4/6/7), NOT the sign of `amount` (always
 * stored positive).
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
section("sumAvailableBalance — settled balance, no pending");
// ────────────────────────────────────────────────────────────

assertEq("zero balance, empty ledger = 0", sumAvailableBalance(0, []), 0);
assertEq("settled balance, empty pending = balance",
  sumAvailableBalance(1000, []), 1000);
assertEq("approved (status='2') pending rows are NOT an overhang",
  // status='2' rows are already reflected in wallettotal — they must not
  // be double-subtracted. Only status='1' rows reduce spendable.
  sumAvailableBalance(700, [
    { amount: 300, status: "2", type: "3" },  // approved withdraw — already in wallettotal
  ]), 700);

// ────────────────────────────────────────────────────────────
section("sumAvailableBalance — open pending debits reduce; pending credits do not");
// ────────────────────────────────────────────────────────────

assertEq("pending DEBIT (yuan-from-wallet type=6) reduces available (the §H-1 fix)",
  sumAvailableBalance(1000, [
    { amount: 200, status: "1", type: "6" },
  ]), 800);
assertEq("pending CREDIT (deposit type=1 awaiting approval) does NOT count",
  sumAvailableBalance(1000, [
    { amount: 500, status: "1", type: "1" },
  ]), 1000);
assertEq("pending refund (type=5) does NOT count as a debit",
  sumAvailableBalance(1000, [
    { amount: 500, status: "1", type: "5" },
  ]), 1000);
assertEq("stacked pending debits all subtract (withdraw=3, shop=2, fwd=4)",
  sumAvailableBalance(1000, [
    { amount: 400, status: "1", type: "3" },
    { amount: 400, status: "1", type: "2" },
    { amount: 400, status: "1", type: "4" },
  ]), -200);
assertEq("approved + rejected rows ignored; only open pending debit counts",
  sumAvailableBalance(1000, [
    { amount: 100, status: "2", type: "3" },  // approved (already in balance)
    { amount: 50,  status: "3", type: "3" },  // rejected
    { amount: 200, status: "1", type: "6" },  // open pending debit
  ]), 800);
assertEq("type=7 (topup-and-pay pending) counts as a pending debit overhang",
  sumAvailableBalance(1000, [
    { amount: 300, status: "1", type: "7" },
  ]), 700);
assertEq("pending debit larger than balance = negative available",
  sumAvailableBalance(0, [{ amount: 100, status: "1", type: "3" }]), -100);
assertEq("null type / unknown type pending row does NOT subtract",
  sumAvailableBalance(1000, [
    { amount: 100, status: "1", type: null },
    { amount: 100, status: "1", type: "9" },
  ]), 1000);

// ────────────────────────────────────────────────────────────
section("sumAvailableBalance — numeric robustness");
// ────────────────────────────────────────────────────────────

assertEq("float drift rounded to 2dp",
  sumAvailableBalance(0.1, [
    { amount: 0.2, status: "1", type: "1" },  // pending credit, ignored
  ]), 0.1);
assertEq("string amounts (PostgREST numeric) parsed",
  sumAvailableBalance("1000.50", [
    { amount: "0.50", status: "1", type: "3" },  // pending withdraw debit
  ]), 1000);
assertEq("non-numeric settled balance treated as 0",
  sumAvailableBalance("not-a-number", []), 0);
assertEq("non-numeric pending amount skipped, not NaN-poisoned",
  sumAvailableBalance(500, [
    { amount: "not-a-number", status: "1", type: "3" },
  ]), 500);
assertEq("debit amount stored positive is subtracted (direction by type)",
  sumAvailableBalance(1000, [
    { amount: 250, status: "1", type: "2" },  // positive amount, type=2 debit
  ]), 750);

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
