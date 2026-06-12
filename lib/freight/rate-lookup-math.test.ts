/**
 * Unit tests for the China-side freight cost math (lib/freight/rate-lookup-math.ts).
 *
 * This is the DB-free core extracted from `lookupChinaFreightCostThb` — it FX-
 * converts a `tb_freight_rate` row + multiplies by the right unit driver, and
 * DEGRADES TO NULL when the rate can't yield a usable cost. The null path is
 * load-bearing: it's what keeps the engine's `chinaCostPending` true (the quote
 * stays GROSS / "กำไรขั้นต้น", never a fabricated net margin).
 *
 * Run:  tsx lib/freight/rate-lookup-math.test.ts   (wired into pnpm test:unit)
 */

import {
  computeChinaFreightCostThb,
  selectBestFreightRate,
  DEFAULT_FX_THB_PER_USD,
  type FreightRateRow,
  type FreightRateRouteRow,
} from "./rate-lookup-math";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

const row = (over: Partial<FreightRateRow>): FreightRateRow => ({
  cost_usd: 100, unit: "container", fx_thb_per_usd: 35, ...over,
});

console.log("=== computeChinaFreightCostThb — China freight cost FX-conversion + unit selection + degrade-to-null ===");

// ── (a) cost math: cost_usd × fx × units ──────────────────────────────────
section("(a) cost = cost_usd × fx × units");
assertEq("container · cost 100 × fx 35 × 1 ctnr = 3500",
  computeChinaFreightCostThb(row({ unit: "container" }), { containers: 1 }), 3500);
assertEq("container · 2 containers doubles the cost = 7000",
  computeChinaFreightCostThb(row({ unit: "container" }), { containers: 2 }), 7000);
assertEq("cbm · cost 80 × fx 35 × 5 cbm = 14000",
  computeChinaFreightCostThb(row({ unit: "cbm", cost_usd: 80 }), { cbm: 5 }), 14000);
assertEq("kg · cost 3 × fx 35 × 120 kg = 12600",
  computeChinaFreightCostThb(row({ unit: "kg", cost_usd: 3 }), { kgm: 120 }), 12600);

// ── (b) FX handling: string columns coerced, 0/missing → default 35 ────────
section("(b) FX coercion + default");
assertEq("string cost_usd '100' + string fx '36' → 3600 (PG numeric strings)",
  computeChinaFreightCostThb(row({ cost_usd: "100", fx_thb_per_usd: "36" }), { containers: 1 }), 3600);
assertEq("fx 0 → falls back to DEFAULT_FX (35) → 100×35 = 3500",
  computeChinaFreightCostThb(row({ fx_thb_per_usd: 0 }), { containers: 1 }), 3500);
assertEq("fx non-numeric → DEFAULT_FX → 3500",
  computeChinaFreightCostThb(row({ fx_thb_per_usd: "abc" }), { containers: 1 }), 3500);
assertEq("DEFAULT_FX_THB_PER_USD is 35", DEFAULT_FX_THB_PER_USD, 35);

// ── (c) rounding to 2 dp ───────────────────────────────────────────────────
section("(c) round to 2dp");
assertEq("cbm · cost 12.345 × fx 35 × 1.5 → 648.11 (rounded)",
  computeChinaFreightCostThb(row({ unit: "cbm", cost_usd: 12.345 }), { cbm: 1.5 }),
  Math.round(12.345 * 35 * 1.5 * 100) / 100);

// ── (d) container unit floors at 1 even when no qty given ──────────────────
section("(d) container floors at 1");
assertEq("container · missing containers → treated as 1 → 3500",
  computeChinaFreightCostThb(row({ unit: "container" }), {}), 3500);
assertEq("container · containers 0 → still floored to 1 → 3500",
  computeChinaFreightCostThb(row({ unit: "container" }), { containers: 0 }), 3500);

// ── (e) DEGRADE-TO-NULL — the chinaCostPending-preserving paths ────────────
section("(e) degrade to null (keeps engine chinaCostPending)");
assertEq("cost_usd 0 → null",
  computeChinaFreightCostThb(row({ cost_usd: 0 }), { containers: 1 }), null);
assertEq("cost_usd negative → null",
  computeChinaFreightCostThb(row({ cost_usd: -10 }), { containers: 1 }), null);
assertEq("cost_usd non-numeric → null",
  computeChinaFreightCostThb(row({ cost_usd: "" }), { containers: 1 }), null);
assertEq("cbm rate but no cbm volume → units 0 → null",
  computeChinaFreightCostThb(row({ unit: "cbm" }), { cbm: 0 }), null);
assertEq("cbm rate + undefined cbm → null",
  computeChinaFreightCostThb(row({ unit: "cbm" }), {}), null);
assertEq("kg rate but no kgm → null",
  computeChinaFreightCostThb(row({ unit: "kg" }), {}), null);
assertEq("unknown unit → units stays 1 → still prices (3500)",
  computeChinaFreightCostThb(row({ unit: "weird" }), {}), 3500);

// ── (f) ROUTE PRECEDENCE — selectBestFreightRate (G1) ─────────────────────
// The DB hands rows already filtered to (mode, active=true) and ordered
// effective_from desc; this helper picks the most-specific lane match with the
// fallback (pol,pod) → (pol,'') → ('',pod) → ('','') and newest-wins ties.
section("(f) route precedence — selectBestFreightRate");

// Helper to mint a route-carrying rate row (id-ish via note for readability).
const rRow = (over: Partial<FreightRateRouteRow>): FreightRateRouteRow => ({
  cost_usd: 100, unit: "container", fx_thb_per_usd: 35,
  pol: "", pod: "", effective_from: "2026-01-01", ...over,
});

// exact (pol,pod) beats pol-only beats wildcard, regardless of array order.
const candidates = [
  rRow({ cost_usd: 10, pol: "", pod: "" }),                  // wildcard
  rRow({ cost_usd: 20, pol: "CNSHA", pod: "" }),             // pol-only
  rRow({ cost_usd: 30, pol: "CNSHA", pod: "THBKK" }),        // exact
  rRow({ cost_usd: 40, pol: "CNNGB", pod: "THBKK" }),        // different pol (ineligible for CNSHA)
];
assertEq("exact (CNSHA,THBKK) lane → the 30-USD exact row",
  selectBestFreightRate(candidates, { pol: "CNSHA", pod: "THBKK" })?.cost_usd, 30);
assertEq("pol matches but pod has no exact → falls back to pol-only (20)",
  selectBestFreightRate(candidates, { pol: "CNSHA", pod: "THLCH" })?.cost_usd, 20);
assertEq("pol with no specific rate at all → wildcard ('','') = 10",
  selectBestFreightRate(candidates, { pol: "CNXMN", pod: "THBKK" })?.cost_usd, 10);
assertEq("no route given → wildcard wins (only eligible '' rows score 0) = 10",
  selectBestFreightRate(candidates)?.cost_usd, 10);
assertEq("route given but only pod set, pod-specific exists → ('',THBKK) preferred over wildcard",
  selectBestFreightRate(
    [rRow({ cost_usd: 10, pol: "", pod: "" }), rRow({ cost_usd: 25, pol: "", pod: "THBKK" })],
    { pod: "THBKK" },
  )?.cost_usd, 25);

// a row naming a DIFFERENT pol/pod than requested is INELIGIBLE (never returned).
assertEq("only a foreign-lane row exists → no eligible match → null",
  selectBestFreightRate([rRow({ cost_usd: 99, pol: "CNNGB", pod: "THLCH" })], { pol: "CNSHA", pod: "THBKK" }),
  null);
assertEq("empty candidate list → null",
  selectBestFreightRate([], { pol: "CNSHA", pod: "THBKK" }), null);

// within the SAME specificity tier, the newest effective_from wins (deterministic).
assertEq("two wildcard rows → newest effective_from (2026-06) wins → 77",
  selectBestFreightRate([
    rRow({ cost_usd: 55, pol: "", pod: "", effective_from: "2026-01-01" }),
    rRow({ cost_usd: 77, pol: "", pod: "", effective_from: "2026-06-01" }),
  ], { pol: "CNSHA" })?.cost_usd, 77);
assertEq("two EXACT same-lane rows, different dates → newest (88) wins",
  selectBestFreightRate([
    rRow({ cost_usd: 66, pol: "CNSHA", pod: "THBKK", effective_from: "2025-12-01" }),
    rRow({ cost_usd: 88, pol: "CNSHA", pod: "THBKK", effective_from: "2026-05-01" }),
  ], { pol: "CNSHA", pod: "THBKK" })?.cost_usd, 88);

// blank/whitespace route is treated as "no route" (trimmed) → wildcard default.
assertEq("whitespace pol is trimmed to '' → behaves as no-route → wildcard 10",
  selectBestFreightRate(candidates, { pol: "   ", pod: "" })?.cost_usd, 10);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
