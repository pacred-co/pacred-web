/**
 * Unit tests for the PUBLIC, CUSTOMER-SAFE freight estimate
 * (lib/freight/public-estimate.ts — the DB-free core of
 * actions/freight-quote.ts::getPublicFreightEstimate).
 *
 * The HEADLINE assertion is the customer-safety invariant: the returned object
 * (and every line inside it) exposes ONLY the customer-facing keys and NEVER
 * leaks any internal — cost / unitCost / subtotalCost / chinaFreightCostThb /
 * profit / marginCapThb / marginExceedsCap / commission / chinaCostPending.
 *
 * Plus the input→engine-spec mapping (transport+loadType → mode; air kgm =
 * max(actual, CBM×167); incoterm passthrough) and the graceful degrade paths.
 *
 * Run:  tsx lib/freight/public-estimate.test.ts   (wired into pnpm test:unit)
 */

import {
  buildPublicFreightEstimate,
  toEngineMode,
  FCL_APPROX_CBM,
  type PublicFreightEstimateResult,
} from "./public-estimate";
import { composeFreightQuote } from "./rate-engine";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

console.log("=== getPublicFreightEstimate (buildPublicFreightEstimate) — input mapping + CUSTOMER-SAFE stripping ===");

// The complete set of keys the result is allowed to expose. Anything else = leak.
const ALLOWED_RESULT_KEYS = [
  "precise", "reason", "lines", "subtotalThb", "vatPct", "vatThb", "totalThb",
].sort();
// Keys that, if they ever appear anywhere in the result tree, are a real leak.
const FORBIDDEN_KEYS = [
  "cost", "unitCost", "subtotalCost", "chinaFreightCostThb",
  "profit", "marginCapThb", "marginExceedsCap", "commission",
  "chinaCostPending", "unitSell",
];

function collectKeys(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) { for (const v of value) collectKeys(v, into); return; }
  if (value && typeof value === "object") {
    for (const k of Object.keys(value)) { into.add(k); collectKeys((value as Record<string, unknown>)[k], into); }
  }
}

// ── (a) THE customer-safety invariant — only safe keys, no internal leak ──
section("(a) ⚠️ CUSTOMER-SAFE — result exposes ONLY safe keys, leaks NO internal");
const priced: PublicFreightEstimateResult = buildPublicFreightEstimate({
  service: "import", transport: "sea", loadType: "LCL", incoterm: "CIF", cbm: 5,
});
assertTrue("a priced result is precise", priced.precise === true);
assertEq("top-level result keys are EXACTLY the customer-safe set",
  Object.keys(priced).sort(), ALLOWED_RESULT_KEYS);

const allKeys = new Set<string>();
collectKeys(priced, allKeys);
for (const forbidden of FORBIDDEN_KEYS) {
  assertTrue(`result tree NEVER contains internal key "${forbidden}"`, !allKeys.has(forbidden));
}
// every line is { label, amountThb } and NOTHING else (no labelTh/scope/qty/sell)
assertTrue("every line has exactly {label, amountThb}",
  priced.lines.every((l) => JSON.stringify(Object.keys(l).sort()) === JSON.stringify(["amountThb", "label"])));
assertTrue("lines are non-empty for a priced CIF LCL", priced.lines.length > 0);

// Cross-check: the engine result this is derived from DOES carry the internals
// we just proved are stripped — so the stripping is doing real work.
const engine = composeFreightQuote({ mode: "sea_lcl", incoterm: "CIF", deliveryTruck: "4W", tier: "regular", cbm: 5 });
assertTrue("engine result (pre-strip) DOES expose profit", "profit" in engine);
assertTrue("engine result (pre-strip) DOES expose commission", "commission" in engine);

// ── (b) numbers match the engine's customer-facing figures (no markup/drift) ──
section("(b) figures equal the engine's sell/VAT/total");
assertEq("subtotalThb === engine.subtotalSell", priced.subtotalThb, engine.subtotalSell);
assertEq("vatPct === engine.vatPct (7)", priced.vatPct, engine.vatPct);
assertEq("vatThb === engine.vat", priced.vatThb, engine.vat);
assertEq("totalThb === engine.total (sell + vat)", priced.totalThb, engine.total);
assertEq("CIF LCL subtotal is the real sheet total 13,511", priced.subtotalThb, 13511);

// ── (c) toEngineMode mapping ──────────────────────────────────────────────
section("(c) transport + loadType → engine mode");
assertEq("air → 'air'", toEngineMode("air", undefined), "air");
assertEq("sea + FCL → 'sea_fcl'", toEngineMode("sea", "FCL"), "sea_fcl");
assertEq("sea + LCL → 'sea_lcl'", toEngineMode("sea", "LCL"), "sea_lcl");
assertEq("sea + no loadType → defaults to LCL ('sea_lcl')", toEngineMode("sea", undefined), "sea_lcl");
assertEq("truck → 'truck' (priced as not-precise downstream)", toEngineMode("truck", undefined), "truck");
assertEq("no transport → null", toEngineMode(undefined, undefined), null);

// ── (d) air chargeable kg = max(actual, CBM×167) drives the price ─────────
section("(d) air kgm = max(actual, CBM×167)");
// CBM 1 → volumetric 167 kg; actual 50 kg → chargeable = 167 (volumetric wins)
const airVolWins = buildPublicFreightEstimate({ service: "import", transport: "air", incoterm: "CIF", cbm: 1, weightKg: 50 });
const airViaKgm = buildPublicFreightEstimate({ service: "import", transport: "air", incoterm: "CIF", weightKg: 167 });
assertTrue("air (CBM×167 volumetric) prices", airVolWins.precise === true);
assertEq("air CBM=1 (vol 167) === air actual 167kg (same chargeable)",
  airVolWins.totalThb, airViaKgm.totalThb);
// actual weight wins when larger than volumetric
const airActualWins = buildPublicFreightEstimate({ service: "import", transport: "air", incoterm: "CIF", cbm: 1, weightKg: 500 });
const airViaKgm500 = buildPublicFreightEstimate({ service: "import", transport: "air", incoterm: "CIF", weightKg: 500 });
assertEq("air actual 500kg (> vol 167) uses actual", airActualWins.totalThb, airViaKgm500.totalThb);

// ── (e) incoterm passthrough (default CIF) ────────────────────────────────
section("(e) incoterm passthrough / default");
const cifDefault = buildPublicFreightEstimate({ service: "import", transport: "sea", loadType: "LCL", cbm: 5 });
assertEq("no incoterm → defaults to CIF (=== explicit CIF total)", cifDefault.totalThb, priced.totalThb);
const exw = buildPublicFreightEstimate({ service: "import", transport: "sea", loadType: "LCL", incoterm: "EXW", cbm: 5 });
assertTrue("EXW (adds China freight/origin) totals MORE than CIF", exw.totalThb > priced.totalThb);
// EXW still leaks nothing even though the engine flags chinaCostPending internally
const exwKeys = new Set<string>(); collectKeys(exw, exwKeys);
assertTrue("EXW result still hides chinaCostPending", !exwKeys.has("chinaCostPending"));
assertTrue("EXW result still hides commission", !exwKeys.has("commission"));

// ── (f) graceful degrade — precise:false, empty lines, zero totals, a reason ──
section("(f) degrade gracefully (precise:false + a Thai reason)");
function assertDegraded(label: string, r: PublicFreightEstimateResult) {
  assertTrue(`${label} → precise:false`, r.precise === false);
  assertTrue(`${label} → has a non-null reason`, typeof r.reason === "string" && r.reason.length > 0);
  assertEq(`${label} → empty lines`, r.lines, []);
  assertEq(`${label} → zero totals`, [r.subtotalThb, r.vatThb, r.totalThb], [0, 0, 0]);
}
assertDegraded("non-import service (export)", buildPublicFreightEstimate({ service: "export", transport: "sea", loadType: "LCL", cbm: 5 }));
assertDegraded("standalone customs", buildPublicFreightEstimate({ service: "customs" }));
assertDegraded("import but no transport", buildPublicFreightEstimate({ service: "import" }));
assertDegraded("truck mode (per-route negotiation)", buildPublicFreightEstimate({ service: "import", transport: "truck" }));
assertDegraded("sea LCL with no CBM", buildPublicFreightEstimate({ service: "import", transport: "sea", loadType: "LCL" }));
assertDegraded("air with no weight and no CBM", buildPublicFreightEstimate({ service: "import", transport: "air" }));
// degrade path still keeps vatPct=7 (the wizard shows it) but never leaks
const degraded = buildPublicFreightEstimate({ service: "export" });
assertEq("degraded keeps vatPct 7", degraded.vatPct, 7);
assertEq("degraded result keys are still EXACTLY the safe set", Object.keys(degraded).sort(), ALLOWED_RESULT_KEYS);

// ── (g) FCL approx-CBM table sane ─────────────────────────────────────────
section("(g) FCL approx CBM table");
assertEq("FCL_APPROX_CBM keys cover the 4 container sizes",
  Object.keys(FCL_APPROX_CBM).sort(), ["20GP", "40GP", "40HC", "45HC"]);
assertTrue("FCL sea_fcl CIF prices (per-container lines)",
  buildPublicFreightEstimate({ service: "import", transport: "sea", loadType: "FCL", incoterm: "CIF", containerSize: "20GP", containerQty: 1 }).precise === true);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
