/**
 * Unit tests for lib/admin/receipt-mao-fee.ts — the PURE เหมาๆ (mao_fee) selector
 * for auto-issued receipts. Override (billing-run mark-paid) mirrors the bill's
 * stored mao_fee_thb; absent → live recompute (direct-slip / wallet path unchanged).
 *
 * Run:  pnpm tsx lib/admin/receipt-mao-fee.test.ts   (wired into test:unit)
 */

import { resolveReceiptMaoFee } from "./receipt-mao-fee";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

section("override wins — receipt mirrors the bill");
{
  assertEq("bill เหมาๆ 100, recomputed 0 → 100 (the bill wins)", resolveReceiptMaoFee(0, 100), 100);
  assertEq("bill เหมาๆ removed (0), recomputed 100 → 0 (the KEY money case)", resolveReceiptMaoFee(100, 0), 0);
  assertEq("bill เหมาๆ 200, recomputed 100 → 200", resolveReceiptMaoFee(100, 200), 200);
}

section("override rounds to 2 satang");
{
  assertEq("100.005 → 100.01", resolveReceiptMaoFee(0, 100.005), 100.01);
  assertEq("99.994 → 99.99", resolveReceiptMaoFee(0, 99.994), 99.99);
}

section("absent → recompute (direct-slip / wallet path unchanged)");
{
  assertEq("no override arg → recomputed 100", resolveReceiptMaoFee(100), 100);
  assertEq("explicit undefined → recomputed 100", resolveReceiptMaoFee(100, undefined), 100);
  assertEq("recomputed 0 stays 0", resolveReceiptMaoFee(0), 0);
}

section("negative override ignored → recompute");
{
  assertEq("override -5 ignored → recomputed 100", resolveReceiptMaoFee(100, -5), 100);
  assertEq("override -0.01 ignored → recomputed 50", resolveReceiptMaoFee(50, -0.01), 50);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} receipt-mao-fee: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
