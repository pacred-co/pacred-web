/**
 * Unit tests for lib/payment/wallet-math.ts — the wallet-paid yuan-payment
 * money math (computePayThb / canDebit / computeNewBalance). Pure, no IO.
 *
 * Run:  pnpm tsx lib/payment/wallet-math.test.ts   (wired into pnpm test:unit)
 */

import { computePayThb, canDebit, computeNewBalance } from "./wallet-math";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── computePayThb — round(yuan × rate, 2dp) ──
section("computePayThb");
assertEq("2120 ¥ × 5.01 = 10621.20 (the legacy-verified example)", computePayThb(2120, 5.01), 10621.2);
assertEq("100 ¥ × 4.97 = 497", computePayThb(100, 4.97), 497);
assertEq("rounds to 2dp (1 × 0.005 → 0.01, banker-agnostic up)", computePayThb(1, 0.005), 0.01);
assertEq("rounds 33.333 × 1 → 33.33", computePayThb(33.333, 1), 33.33);
assertEq("zero yuan = 0", computePayThb(0, 5.01), 0);

// ── canDebit — payTHB > 0 AND walletTotal >= payTHB ──
section("canDebit");
assertEq("sufficient balance → true", canDebit(1000, 497), true);
assertEq("exact balance (boundary) → true", canDebit(497, 497), true);
assertEq("insufficient balance → false", canDebit(400, 497), false);
assertEq("zero payTHB → false (nothing to pay)", canDebit(1000, 0), false);
assertEq("negative payTHB → false", canDebit(1000, -5), false);
assertEq("zero wallet, zero pay → false", canDebit(0, 0), false);

// ── computeNewBalance — round(walletTotal − payTHB, 2dp) ──
section("computeNewBalance");
assertEq("1000 − 497 = 503", computeNewBalance(1000, 497), 503);
assertEq("exact spend → 0", computeNewBalance(497, 497), 0);
assertEq("rounds 2dp (1000.005 − 0 → 1000.01)", computeNewBalance(1000.005, 0), 1000.01);
assertEq("10621.20 spend off 20000 → 9378.80", computeNewBalance(20000, 10621.2), 9378.8);

console.log(`\n${fail === 0 ? "✅" : "❌"} wallet-math: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
