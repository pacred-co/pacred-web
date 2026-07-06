/**
 * Unit tests for lib/wallet/wallet-hs.ts — the canonical SOT for tb_wallet_hs
 * ROW DIRECTION. Locks the type→credit/debit map so a future edit can never
 * silently flip a wallet transaction's direction (a debit rendering as a credit
 * = money shown as incoming when it is outgoing).
 *
 * Run:  pnpm tsx lib/wallet/wallet-hs.test.ts   (wired into test:unit)
 */

import { isWalletCredit, walletKindOf, WALLET_WITHDRAW_TYPE } from "./wallet-hs";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── direction: money IN (credit) ──────────────────────────────────────────
section("credit (money IN)");
assertEq("type 1 (deposit) = credit", isWalletCredit("1"), true);
assertEq("type 5 (refund) = credit", isWalletCredit("5"), true);

// ── direction: money OUT (debit) ──────────────────────────────────────────
section("debit (money OUT)");
assertEq("type 2 (order_payment) = debit", isWalletCredit("2"), false);
assertEq("type 3 (withdraw) = debit", isWalletCredit("3"), false);
assertEq("type 4 (import_payment) = debit", isWalletCredit("4"), false);
assertEq("type 6 (yuan_payment) = debit", isWalletCredit("6"), false);
assertEq("type 7 (order_top_up) = debit", isWalletCredit("7"), false);

// ── withdraw type constant ────────────────────────────────────────────────
section("withdraw type");
assertEq("WALLET_WITHDRAW_TYPE = '3'", WALLET_WITHDRAW_TYPE, "3");
assertEq("type 3 IS the withdraw type", "3" === WALLET_WITHDRAW_TYPE, true);

// ── unknown / null → credit (legacy default, keeps historical rows non-red) ─
section("unknown/blank type → credit default");
assertEq("unknown type '9' → credit", isWalletCredit("9"), true);
assertEq("null type → credit", isWalletCredit(null), true);
assertEq("undefined type → credit", isWalletCredit(undefined), true);
assertEq("empty string → credit", isWalletCredit(""), true);

// ── kind labels ───────────────────────────────────────────────────────────
section("kind labels");
assertEq("type 1 kind = deposit", walletKindOf("1"), "deposit");
assertEq("type 3 kind = withdraw", walletKindOf("3"), "withdraw");
assertEq("unknown kind = adjustment", walletKindOf("9"), "adjustment");

console.log(`\n${fail === 0 ? "✓ PASS" : "✗ FAIL"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
