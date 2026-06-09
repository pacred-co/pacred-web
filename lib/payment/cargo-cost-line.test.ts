/**
 * S1 — CARGO tax-doc cost-line completeness (lib/payment/cargo-cost-line.cargoLineCostThb).
 *
 * Locks the money-accuracy rule that backs both the CARGO tax-doc workspace
 * (actions/admin/cargo-taxdoc-workspace.ts) and the PEAK export rollup
 * (actions/admin/peak-export.ts): a ¥ cost with a BLANK/0 cost-rate is an
 * INCOMPLETE line → it contributes 0, NEVER a silent rate=1 (which would land a
 * ¥ figure as THB, ~4.9× understated → wrong PEAK cost + inflated profit).
 *
 * Run:  pnpm tsx lib/payment/cargo-cost-line.test.ts   (wired into pnpm test)
 */

import { cargoLineCostThb } from "./cargo-cost-line";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── (a) complete line: cost>0 & rate>0 → cost × qty × rate ──
section("(a) complete line — cost × qty × rate");
assertEq("¥12.50 × 3 qty × 4.90 rate = 183.75", cargoLineCostThb({ costCny: 12.5, rateCny: 4.9, qty: 3 }), 183.75);
assertEq("¥100 × 1 qty × 5.00 rate = 500", cargoLineCostThb({ costCny: 100, rateCny: 5, qty: 1 }), 500);

// ── (b) THE bug being locked: blank/0 rate → 0, NEVER ×1 ──
section("(b) incomplete rate → 0, never silent rate=1");
assertEq("cost>0, rate=0 → 0 (not cost×qty×1)", cargoLineCostThb({ costCny: 100, rateCny: 0, qty: 2 }), 0);
assertEq("cost>0, rate=null → 0", cargoLineCostThb({ costCny: 100, rateCny: null, qty: 2 }), 0);
assertEq("cost>0, rate=undefined → 0", cargoLineCostThb({ costCny: 100, rateCny: undefined, qty: 2 }), 0);
assertEq("cost>0, rate='' (blank string) → 0", cargoLineCostThb({ costCny: 100, rateCny: "", qty: 2 }), 0);
assertEq("cost>0, rate negative → 0", cargoLineCostThb({ costCny: 100, rateCny: -1, qty: 2 }), 0);

// ── (c) no cost → 0 ──
section("(c) no cost → 0");
assertEq("cost=0 → 0 even with a good rate", cargoLineCostThb({ costCny: 0, rateCny: 4.9, qty: 5 }), 0);
assertEq("cost=null → 0", cargoLineCostThb({ costCny: null, rateCny: 4.9, qty: 5 }), 0);
assertEq("cost negative → 0", cargoLineCostThb({ costCny: -10, rateCny: 4.9, qty: 5 }), 0);

// ── (d) qty<=0 treated as 1 (preserve legacy behaviour) ──
section("(d) qty<=0 → treated as 1");
assertEq("qty=0 → ×1: 10 × 1 × 5 = 50", cargoLineCostThb({ costCny: 10, rateCny: 5, qty: 0 }), 50);
assertEq("qty=null → ×1: 10 × 1 × 5 = 50", cargoLineCostThb({ costCny: 10, rateCny: 5, qty: null }), 50);
assertEq("qty negative → ×1: 10 × 1 × 5 = 50", cargoLineCostThb({ costCny: 10, rateCny: 5, qty: -3 }), 50);
assertEq("qty=2 → ×2: 10 × 2 × 5 = 100", cargoLineCostThb({ costCny: 10, rateCny: 5, qty: 2 }), 100);

// ── (e) PG-string coercion — Supabase numeric columns arrive as strings ──
section("(e) PG-string coercion");
assertEq("all strings: '12.50' × '3' × '4.90' = 183.75", cargoLineCostThb({ costCny: "12.50", rateCny: "4.90", qty: "3" }), 183.75);
assertEq("string cost, blank string rate → 0", cargoLineCostThb({ costCny: "100", rateCny: "", qty: "2" }), 0);
assertEq("string qty '0' → ×1: '10' × 1 × '5' = 50", cargoLineCostThb({ costCny: "10", rateCny: "5", qty: "0" }), 50);
assertEq("junk cost 'abc' → 0", cargoLineCostThb({ costCny: "abc", rateCny: "5", qty: "2" }), 0);
assertEq("junk rate 'x' → 0", cargoLineCostThb({ costCny: "10", rateCny: "x", qty: "2" }), 0);

console.log(`\n${fail === 0 ? "✅" : "❌"} S1 cargo-cost-line: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
