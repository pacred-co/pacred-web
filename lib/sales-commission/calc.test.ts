/**
 * Unit tests for lib/sales-commission/calc.ts — the legacy customer-commission
 * math (1% commission − 3% WHT, ≥1,000 net withdrawal gate). Pure, no IO.
 * Mirrors getListForwarder.php L166-174 (ADR-0020).
 *
 * Run:  pnpm tsx lib/sales-commission/calc.test.ts   (wired into pnpm test:unit)
 */

import {
  computeCommission, sumGross, SALES_WHT_RATE, SALES_MIN_WITHDRAWAL_THB,
} from "./calc";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── constants (legacy hardcodes) ──
section("constants");
assertEq("WHT rate = 3%", SALES_WHT_RATE, 0.03);
assertEq("min withdrawal = 1,000", SALES_MIN_WITHDRAWAL_THB, 1000);

// ── computeCommission — gross×percen → −3% WHT → net → ≥1000 gate ──
section("computeCommission");
assertEq("gross 100,000 @ 1% → comm 1000 / wht 30 / net 970 / NOT eligible (<1000)",
  computeCommission(100000, 0.01), { gross: 100000, commission: 1000, wht: 30, net: 970, eligible: false });
assertEq("gross 200,000 @ 1% → comm 2000 / wht 60 / net 1940 / eligible",
  computeCommission(200000, 0.01), { gross: 200000, commission: 2000, wht: 60, net: 1940, eligible: true });
assertEq("gross 103,093 @ 1% → net exactly 1000 → eligible (boundary)",
  computeCommission(103093, 0.01), { gross: 103093, commission: 1030.93, wht: 30.93, net: 1000, eligible: true });
assertEq("gross 0 → all zero / not eligible",
  computeCommission(0, 0.01), { gross: 0, commission: 0, wht: 0, net: 0, eligible: false });
assertEq("NaN gross coerced to 0 (no crash)",
  computeCommission(NaN, 0.01), { gross: 0, commission: 0, wht: 0, net: 0, eligible: false });
assertEq("rounds each money figure to 2dp",
  computeCommission(12345.67, 0.01), { gross: 12345.67, commission: 123.46, wht: 3.7, net: 119.76, eligible: false });

// ── sumGross — Σ(ftotalprice − fdiscount), with string/null coercion ──
section("sumGross");
assertEq("number + string + null rows", sumGross([
  { ftotalprice: 1000, fdiscount: 100 },
  { ftotalprice: "500", fdiscount: "50" },
  { ftotalprice: null, fdiscount: null },
]), 1350);
assertEq("empty rows = 0", sumGross([]), 0);
assertEq("discount-only row subtracts", sumGross([{ ftotalprice: 0, fdiscount: 25 }]), -25);

console.log(`\n${fail === 0 ? "✅" : "❌"} sales-commission/calc: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
