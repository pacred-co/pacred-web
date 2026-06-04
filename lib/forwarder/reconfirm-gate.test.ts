/**
 * Unit tests for lib/forwarder/reconfirm-gate.ts — the >10%-over-preview
 * re-confirm gate (BUSINESS_FLOW.md L85-87). Pure, no IO/time.
 *
 * Run:  pnpm tsx lib/forwarder/reconfirm-gate.test.ts   (wired into pnpm test:unit)
 */

import {
  evaluateReconfirmGate, RECONFIRM_THRESHOLD_DEFAULT_PCT,
} from "./reconfirm-gate";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const G = (preview: number, existing: number, newAdj: number, threshold = 10) =>
  evaluateReconfirmGate({ preview_total_thb: preview, existing_cumulative_thb: existing, new_adjustment_thb: newAdj, threshold_pct: threshold });

section("default constant");
assertEq("default threshold = 10%", RECONFIRM_THRESHOLD_DEFAULT_PCT, 10);

section("under / over / boundary");
assertEq("5% over → NOT triggered", G(10000, 0, 500).triggered, false);
assertEq("15% over → triggered", G(10000, 0, 1500).triggered, true);
assertEq("exactly 10% over → NOT triggered (strictly greater)", G(10000, 0, 1000).triggered, false);
assertEq("12% over → triggered", G(10000, 0, 1200).triggered, true);

section("cumulative is included");
assertTrue("existing 500 + new 600 on 10k = 11% → triggered", G(10000, 500, 600).triggered);
assertEq("delta + actual reflect existing+new", { a: G(10000, 500, 600).actual_total_thb, d: G(10000, 500, 600).delta_thb, p: G(10000, 500, 600).delta_pct }, { a: 11100, d: 1100, p: 11 });

section("degenerate guards");
assertEq("preview <= 0 → never triggers", G(0, 0, 5000).triggered, false);
assertEq("new adjustment <= 0 → never triggers", G(10000, 0, 0).triggered, false);
assertEq("negative adjustment → never triggers", G(10000, 0, -500).triggered, false);

section("invalid threshold defaults to 10");
assertEq("threshold 0 → treated as 10 (15% still triggers)", G(10000, 0, 1500, 0).triggered, true);
assertEq("threshold echoed back as the effective 10", G(10000, 0, 1500, 0).threshold_pct, 10);
assertEq("custom threshold 20 → 15% does NOT trigger", G(10000, 0, 1500, 20).triggered, false);

section("rounding");
assertEq("delta_pct rounds to 1dp", G(3000, 0, 100).delta_pct, 3.3); // 100/3000*100 = 3.333 → 3.3
assertEq("actual_total rounds to 2dp", G(10000.005, 0, 0.001).actual_total_thb, 10000.01);

console.log(`\n${fail === 0 ? "✅" : "❌"} forwarder/reconfirm-gate: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
