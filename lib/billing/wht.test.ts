/**
 * Unit tests for the ใบวางบิล WHT shape-adapter (computeBillWht).
 *
 * Locks the หัก ณ ที่จ่าย 1% money math the billing-run pages render, and that
 * it reconciles to the satang (wht_amount + net_payable === total). The RULE
 * itself (owner 2026-07-22: juristic → 1% on any positive amount, no minimum) is
 * owned + tested by lib/tax/wht.test.ts via legacyReceiptAmount — this file
 * asserts the wrapper reshapes it correctly (incl. the forward-only paid-date
 * freeze) so the bill and the ใบเสร็จ never diverge.
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

// Juristic buyer → 1% on ANY positive amount (owner 2026-07-22: no minimum).
assertEq("juristic ฿5,000 → 1% = ฿50, net ฿4,950", computeBillWht(true, 5000), {
  wht_rate: 0.01, wht_amount: 50, net_payable: 4950,
});
assertEq("juristic ฿1,000 → ฿10, net ฿990", computeBillWht(true, 1000), {
  wht_rate: 0.01, wht_amount: 10, net_payable: 990,
});

// NEW RULE — juristic UNDER ฿1,000 now withholds too (was exempt before).
assertEq("juristic ฿999.99 → ฿10, net ฿989.99", computeBillWht(true, 999.99), {
  wht_rate: 0.01, wht_amount: 10, net_payable: 989.99,
});
assertEq("juristic ฿500 → ฿5, net ฿495", computeBillWht(true, 500), {
  wht_rate: 0.01, wht_amount: 5, net_payable: 495,
});
assertEq("juristic ฿100 → ฿1, net ฿99", computeBillWht(true, 100), {
  wht_rate: 0.01, wht_amount: 1, net_payable: 99,
});

// FORWARD-ONLY FREEZE — a bill paid BEFORE 2026-07-22 keeps the old ≥ ฿1,000 gate
// so its displayed net = what was actually collected (small juristic = no WHT).
assertEq("juristic ฿500 paid 2026-07-14 (before change) → frozen, no WHT", computeBillWht(true, 500, {
  paidAt: "2026-07-14T07:52:00.000Z",
}), { wht_rate: 0, wht_amount: 0, net_payable: 500 });
// A bill paid ON/AFTER the change (or unpaid) uses the new no-minimum rule.
assertEq("juristic ฿500 paid 2026-08-01 (after change) → 1% withheld", computeBillWht(true, 500, {
  paidAt: "2026-08-01T00:00:00.000Z",
}), { wht_rate: 0.01, wht_amount: 5, net_payable: 495 });
assertEq("juristic ฿500 unpaid (paidAt null) → new rule 1%", computeBillWht(true, 500, {
  paidAt: null,
}), { wht_rate: 0.01, wht_amount: 5, net_payable: 495 });
// A bill ≥ ฿1,000 paid before the change is unaffected (WHT applied either way).
assertEq("juristic ฿5,000 paid before change → still 1% (≥ old min)", computeBillWht(true, 5000, {
  paidAt: "2026-07-14T07:52:00.000Z",
}), { wht_rate: 0.01, wht_amount: 50, net_payable: 4950 });

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
