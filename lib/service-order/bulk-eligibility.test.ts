/**
 * Unit tests for the customer-side bulk-action pure helpers
 * (lib/service-order/bulk-eligibility.ts).
 *
 * The same helpers run in the client island (UI gating) and (conceptually) on
 * the server (per-row re-verify inside cancelServiceOrder + payServiceOrderFromWallet).
 * Pure → one tested place, no client/server drift.
 *
 * Run:  tsx lib/service-order/bulk-eligibility.test.ts   (wired into pnpm test:unit)
 */

import {
  canCoverBulkPay,
  getCancelableHNos,
  getPayableHNos,
  summariseLoopResults,
  sumPayableTotals,
  type OrderForBulk,
} from "./bulk-eligibility";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }
export {};

const ROWS: OrderForBulk[] = [
  { hno: "P1", hstatus: "1", totalThb: 100 },   // cancelable, NOT payable
  { hno: "P2", hstatus: "2", totalThb: 200 },   // cancelable + payable
  { hno: "P3", hstatus: "2", totalThb: 350.5 }, // cancelable + payable
  { hno: "P4", hstatus: "3", totalThb: 500 },   // neither (ordered)
  { hno: "P5", hstatus: "4", totalThb: 600 },   // neither
  { hno: "P6", hstatus: "5", totalThb: 700 },   // neither (succeeded)
  { hno: "P7", hstatus: "6", totalThb: 800 },   // neither (already cancelled)
  { hno: "P8", hstatus: null, totalThb: 0 },    // neither (malformed)
];

section("=== getCancelableHNos — hstatus 1 or 2 only ===");
assertEq(
  "filters to 1/2",
  getCancelableHNos(ROWS),
  ["P1", "P2", "P3"],
);
assertEq(
  "empty input → empty",
  getCancelableHNos([]),
  [],
);
assertEq(
  "rejects whitespace-padded statuses gracefully",
  getCancelableHNos([{ hno: "X", hstatus: " 2 ", totalThb: 0 }]),
  ["X"],
);
assertEq(
  "rejects hstatus='3'",
  getCancelableHNos([{ hno: "X", hstatus: "3", totalThb: 0 }]),
  [],
);

section("=== getPayableHNos — hstatus '2' only ===");
assertEq(
  "filters to 2",
  getPayableHNos(ROWS),
  ["P2", "P3"],
);
assertEq(
  "hstatus 1 (รอดำเนินการ) NOT payable yet",
  getPayableHNos([{ hno: "X", hstatus: "1", totalThb: 0 }]),
  [],
);
assertEq(
  "hstatus 6 (cancelled) NOT payable",
  getPayableHNos([{ hno: "X", hstatus: "6", totalThb: 0 }]),
  [],
);

section("=== sumPayableTotals — only sums hstatus='2' rows in the selection ===");
assertEq(
  "P2+P3 selected → 550.5",
  sumPayableTotals({ rows: ROWS, selectedHnos: ["P2", "P3"] }),
  550.5,
);
assertEq(
  "P1+P2 selected → only P2 counted (200, P1 is hstatus=1)",
  sumPayableTotals({ rows: ROWS, selectedHnos: ["P1", "P2"] }),
  200,
);
assertEq(
  "only P4 (hstatus=3) selected → 0",
  sumPayableTotals({ rows: ROWS, selectedHnos: ["P4"] }),
  0,
);
assertEq(
  "nothing selected → 0",
  sumPayableTotals({ rows: ROWS, selectedHnos: [] }),
  0,
);
assertEq(
  "non-existent hno in selection ignored",
  sumPayableTotals({ rows: ROWS, selectedHnos: ["P2", "P999"] }),
  200,
);
assertEq(
  "non-finite total → 0 contribution",
  sumPayableTotals({
    rows: [{ hno: "P2", hstatus: "2", totalThb: NaN }],
    selectedHnos: ["P2"],
  }),
  0,
);

section("=== canCoverBulkPay — wallet balance vs total required ===");
assertEq(
  "balance 1000 vs need 500 → ok",
  canCoverBulkPay({ walletBalance: 1000, totalRequired: 500 }),
  { ok: true },
);
assertEq(
  "balance 500 vs need 500 → ok (exact)",
  canCoverBulkPay({ walletBalance: 500, totalRequired: 500 }),
  { ok: true },
);
assertEq(
  "balance 100 vs need 500 → 400 shortfall",
  canCoverBulkPay({ walletBalance: 100, totalRequired: 500 }),
  { ok: false, shortfall: 400 },
);
assertEq(
  "balance 0 vs need 0 → ok",
  canCoverBulkPay({ walletBalance: 0, totalRequired: 0 }),
  { ok: true },
);
assertEq(
  "balance NaN treated as 0",
  canCoverBulkPay({ walletBalance: NaN, totalRequired: 100 }),
  { ok: false, shortfall: 100 },
);
assertEq(
  "need NaN treated as 0",
  canCoverBulkPay({ walletBalance: 50, totalRequired: NaN }),
  { ok: true },
);

section("=== summariseLoopResults — all ok / all fail / mixed ===");
assertEq(
  "all ok",
  summariseLoopResults([
    { ok: true, hno: "P1" },
    { ok: true, hno: "P2" },
  ]),
  { total: 2, ok: 2, failed: 0, firstError: null, firstFailedHno: null },
);
assertEq(
  "all fail · first error surfaces",
  summariseLoopResults([
    { ok: false, hno: "P1", error: "not_found" },
    { ok: false, hno: "P2", error: "balance_too_low" },
  ]),
  { total: 2, ok: 0, failed: 2, firstError: "not_found", firstFailedHno: "P1" },
);
assertEq(
  "mixed · first failure is from middle of list",
  summariseLoopResults([
    { ok: true, hno: "P1" },
    { ok: false, hno: "P2", error: "balance_too_low" },
    { ok: true, hno: "P3" },
  ]),
  { total: 3, ok: 2, failed: 1, firstError: "balance_too_low", firstFailedHno: "P2" },
);
assertEq(
  "empty input → total 0",
  summariseLoopResults([]),
  { total: 0, ok: 0, failed: 0, firstError: null, firstFailedHno: null },
);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
