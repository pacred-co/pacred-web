/**
 * Unit tests for the cargo cost/declared AUTO-FILL seeds (GAP 1 · audit
 * 2026-06-11). These compute the *suggested* per-line cost basis from the
 * order data; nothing here writes to the DB.
 *
 * Run with:  tsx lib/forwarder/cargo-cost-autofill.test.ts
 *            (or `pnpm test:unit` for the whole suite)
 * Exits non-zero on any failure — matches the repo's tsx harness.
 */

import {
  round2,
  roundUp2,
  shopAutoDeclaredThb,
  importAutoDeclaredThb,
  autoOrNull,
} from "./cargo-cost-autofill";

let pass = 0;
let fail = 0;

function assertClose(label: string, actual: number, expected: number, eps = 1e-9) {
  if (Math.abs(actual - expected) <= eps) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

function assertEq<T>(label: string, actual: T, expected: T) {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${String(expected)}\n    actual:   ${String(actual)}`);
  }
}

// ── round2 / roundUp2 ───────────────────────────────────────────────────────
assertClose("round2 nearest below boundary", round2(1.2345), 1.23);
assertClose("round2 nearest above boundary", round2(1.2356), 1.24);
assertClose("round2 of non-finite → 0", round2(NaN), 0);
assertClose("round2 of negative → 0", round2(-5), 0);
assertClose("roundUp2 always ceils to satang", roundUp2(1.231), 1.24);
assertClose("roundUp2 of exact value is unchanged", roundUp2(1.5), 1.5);
assertClose("roundUp2 of 0 → 0", roundUp2(0), 0);
assertClose("roundUp2 of non-finite → 0", roundUp2(Infinity), 0);

// ── shopAutoDeclaredThb — ¥unit × rate × qty, rounded UP ─────────────────────
// 10¥ × 5.0 × 3 = 150.00
assertClose("shop: clean product", shopAutoDeclaredThb(10, 5.0, 3), 150);
// 10.33¥ × 5.12 × 2 = 105.7792 → ceil to 105.78
assertClose("shop: rounds UP to satang", shopAutoDeclaredThb(10.33, 5.12, 2), 105.78);
// numeric-string DB values coerce
assertClose("shop: string inputs coerce", shopAutoDeclaredThb("10", "5", "3"), 150);
// any missing factor → 0 (caller treats 0 as "no auto")
assertEq("shop: zero qty → 0", shopAutoDeclaredThb(10, 5, 0), 0);
assertEq("shop: null price → 0", shopAutoDeclaredThb(null, 5, 3), 0);
assertEq("shop: garbage rate → 0", shopAutoDeclaredThb(10, "abc", 3), 0);
assertEq("shop: negative → 0", shopAutoDeclaredThb(-10, 5, 3), 0);

// ── importAutoDeclaredThb — header cost prorated by qty share ────────────────
// 1000 × (2/10) = 200.00
assertClose("import: prorate by qty share", importAutoDeclaredThb(1000, 2, 10), 200);
// 1000 × (1/3) = 333.333… → round2 333.33
assertClose("import: round2 the share", importAutoDeclaredThb(1000, 1, 3), 333.33);
// single-line order: whole cost on the one line
assertClose("import: one line gets full cost", importAutoDeclaredThb(1500, 5, 5), 1500);
// Σqty 0 → 0 (no divide-by-zero)
assertEq("import: zero total qty → 0", importAutoDeclaredThb(1000, 2, 0), 0);
assertEq("import: null total qty → 0", importAutoDeclaredThb(1000, 2, null), 0);
assertEq("import: null header cost → 0", importAutoDeclaredThb(null, 2, 10), 0);
// string DB inputs coerce
assertClose("import: string inputs coerce", importAutoDeclaredThb("1000", "2", "10"), 200);

// ── autoOrNull — normaliser the editor consumes ─────────────────────────────
assertEq("autoOrNull positive → number", autoOrNull(150), 150);
assertEq("autoOrNull 0 → null", autoOrNull(0), null);
assertEq("autoOrNull NaN → null", autoOrNull(NaN), null);
assertEq("autoOrNull negative → null", autoOrNull(-5), null);

// Sanity: a line's prorated shares sum back to the header total (no leak)
// when the split is exact.
{
  const headerCost = 1000;
  const qtys = [2, 3, 5]; // Σ = 10 → clean .20/.30/.50 shares
  const total = qtys.reduce((a, b) => a + b, 0);
  const sum = qtys
    .map((q) => importAutoDeclaredThb(headerCost, q, total))
    .reduce((a, b) => a + b, 0);
  assertClose("import: prorated shares sum to header total (exact split)", sum, headerCost);
}

// Documented brittleness (not a bug): an inexact split leaves a satang of
// rounding drift — each line is round2'd independently, so 100 / 3 → 33.33×3
// = 99.99 (฿0.01 short). The auto-DECLARED value is a per-line editable SEED,
// not a balanced ledger, so this is acceptable; staff adjusts. Pinned here so a
// future "make shares sum exactly" change is a conscious decision, not a surprise.
{
  const headerCost = 100;
  const qtys = [1, 1, 1]; // Σ = 3 → 33.333… each
  const total = qtys.reduce((a, b) => a + b, 0);
  const shares = qtys.map((q) => importAutoDeclaredThb(headerCost, q, total));
  assertClose("import: each 1/3 share is round2(33.33)", shares[0], 33.33);
  const sum = shares.reduce((a, b) => a + b, 0);
  assertClose("import: inexact split drifts ฿0.01 short (documented)", sum, 99.99);
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
