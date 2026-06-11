/**
 * Unit tests for the ใบวางบิล WHT shape-adapter (computeBillWht).
 *
 * Locks the หัก ณ ที่จ่าย 1% money math the billing-run pages render, and that
 * it reconciles to the satang (wht_amount + net_payable === total). The RULE
 * itself (juristic && ≥1000 → 1%) is owned + tested by lib/tax/wht.test.ts via
 * legacyReceiptAmount — this file asserts the wrapper reshapes it correctly so
 * the bill and the ใบเสร็จ never diverge.
 *
 * Run with:  tsx lib/billing/wht.test.ts
 */

import { computeBillWht } from "./wht";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  }
}

console.log("computeBillWht — ใบวางบิล WHT 1%");

// Personal buyer → never withheld, regardless of amount.
assertEq("personal ฿5,000 → no WHT", computeBillWht(false, 5000), {
  wht_rate: 0, wht_amount: 0, net_payable: 5000,
});
assertEq("personal ฿50,000 → no WHT", computeBillWht(false, 50000), {
  wht_rate: 0, wht_amount: 0, net_payable: 50000,
});

// Juristic buyer → 1% when total ≥ 1,000.
assertEq("juristic ฿5,000 → 1% = ฿50, net ฿4,950", computeBillWht(true, 5000), {
  wht_rate: 0.01, wht_amount: 50, net_payable: 4950,
});
assertEq("juristic ฿1,000 (threshold) → ฿10, net ฿990", computeBillWht(true, 1000), {
  wht_rate: 0.01, wht_amount: 10, net_payable: 990,
});

// Juristic but BELOW the ฿1,000 threshold → no WHT (legacy gate).
assertEq("juristic ฿999.99 (below threshold) → no WHT", computeBillWht(true, 999.99), {
  wht_rate: 0, wht_amount: 0, net_payable: 999.99,
});
assertEq("juristic ฿500 → no WHT", computeBillWht(true, 500), {
  wht_rate: 0, wht_amount: 0, net_payable: 500,
});

// Satang rounding — a messy total must still reconcile.
assertEq("juristic ฿12,345.67 → ฿123.46, net ฿12,222.21", computeBillWht(true, 12345.67), {
  wht_rate: 0.01, wht_amount: 123.46, net_payable: 12222.21,
});

// Reconciliation invariant: wht_amount + net_payable === total (to the satang),
// for both juristic (withheld) and personal (pass-through) across a range.
for (const total of [1000, 1234.56, 5000, 9999.99, 88888.88, 250000]) {
  for (const juristic of [true, false]) {
    const r = computeBillWht(juristic, total);
    const sum = Math.round((r.wht_amount + r.net_payable) * 100) / 100;
    assertEq(`reconcile ${juristic ? "juristic" : "personal"} ฿${total}: wht+net=total`, sum, total);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
