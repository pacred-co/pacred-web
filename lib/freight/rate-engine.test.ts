/**
 * Unit tests for the freight rate engine (lib/freight/rate-engine.ts).
 *
 * The headline assertions reproduce the REAL AXELRA "แบบฟรอมออกราคา IMPORT"
 * sheet totals exactly — proof the model is faithful to the rate cards:
 *   IM CIF AIR     · SALE 4W รวมราคา = 10,211 · 6W = 13,301
 *   IM CIF SEA LCL · SALE 4W รวมราคา = 13,511 · 6W = 14,801
 *
 * Run:  pnpm tsx lib/freight/rate-engine.test.ts   (wired into pnpm test)
 */

import { composeFreightQuote } from "./rate-engine";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── (a) reproduces the real sheet totals (CIF = Thai customs + transport) ──
section("(a) real AXELRA IMPORT sheet totals");
const cifAir4 = composeFreightQuote({ mode: "air", incoterm: "CIF", deliveryTruck: "4W" });
assertEq("CIF AIR · 4W รวมราคา = 10,211", cifAir4.subtotalSell, 10211);
const cifAir6 = composeFreightQuote({ mode: "air", incoterm: "CIF", deliveryTruck: "6W" });
assertEq("CIF AIR · 6W รวมราคา = 13,301", cifAir6.subtotalSell, 13301);
const cifLcl4 = composeFreightQuote({ mode: "sea_lcl", incoterm: "CIF", deliveryTruck: "4W" });
assertEq("CIF SEA LCL · 4W รวมราคา = 13,511", cifLcl4.subtotalSell, 13511);
const cifLcl6 = composeFreightQuote({ mode: "sea_lcl", incoterm: "CIF", deliveryTruck: "6W" });
assertEq("CIF SEA LCL · 6W รวมราคา = 14,801", cifLcl6.subtotalSell, 14801);

// ── (b) VAT 7% + total ──
section("(b) VAT + total");
assertEq("CIF LCL 4W VAT 7% = 945.77", cifLcl4.vat, round2(13511 * 0.07));
assertEq("CIF LCL 4W total = sell + vat", cifLcl4.total, round2(13511 + 13511 * 0.07));
assertEq("vatPct = 7", cifLcl4.vatPct, 7);

// ── (c) incoterm scope — CIF has NO freight/origin lines ──
section("(c) incoterm scope");
assertTrue("CIF has no freight-scope line", !cifLcl4.lines.some((l) => l.scope === "freight"));
assertTrue("CIF has no origin-scope line", !cifLcl4.lines.some((l) => l.scope === "origin"));
assertTrue("CIF includes the customs-clearance line", cifLcl4.lines.some((l) => l.key === "customs_clearance" && l.sell === 3500));
assertTrue("CIF includes Thai transport", cifLcl4.lines.some((l) => l.key === "transport_lcl"));

// ── (d) EXW SEA LCL adds China freight + origin docs (per-CBM) ──
section("(d) EXW adds freight + origin (per-CBM)");
const exwLcl = composeFreightQuote({ mode: "sea_lcl", incoterm: "EXW", deliveryTruck: "4W", tier: "regular", cbm: 5 });
// 13,511 (thai CIF set) + 1,800×5 ocean + 2,000 B/L + 3,000 DOC + 2,000 FORM-E = 29,511
assertEq("EXW LCL cbm=5 subtotalSell = 29,511", exwLcl.subtotalSell, 29511);
assertTrue("EXW has an ocean-freight line (per CBM)", exwLcl.lines.some((l) => l.key === "ocean_freight_lcl" && l.qty === 5 && l.sell === 9000));
assertTrue("EXW has the FORM-E / origin doc lines", exwLcl.lines.some((l) => l.scope === "origin"));

// ── (e) sell tiers (ปลีก/ขาประจำ/ส่ง) — wholesale cheaper than retail ──
section("(e) 3-tier sell");
const retail = composeFreightQuote({ mode: "sea_lcl", incoterm: "EXW", cbm: 10, tier: "retail" });
const wholesale = composeFreightQuote({ mode: "sea_lcl", incoterm: "EXW", cbm: 10, tier: "wholesale" });
assertTrue("retail freight > wholesale freight", retail.subtotalSell > wholesale.subtotalSell);
assertEq("retail ocean = 2,200×10", retail.lines.find((l) => l.key === "ocean_freight_lcl")?.sell, 22000);
assertEq("wholesale ocean = 1,600×10", wholesale.lines.find((l) => l.key === "ocean_freight_lcl")?.sell, 16000);

// ── (f) CEO §4 margin guard — ≤15k/ตู้ ──
section("(f) margin guard ≤15k/container");
assertEq("CIF LCL margin cap = 15,000 (1 container default)", cifLcl4.marginCapThb, 15000);
assertTrue("CIF LCL profit under cap → no flag", !cifLcl4.marginExceedsCap);
assertTrue("EXW high-CBM profit over cap → flagged", composeFreightQuote({ mode: "sea_lcl", incoterm: "EXW", cbm: 10, tier: "retail" }).marginExceedsCap);

// ── (g) commission split 1%/5%/5% − 3% WHT ──
section("(g) commission");
// CIF LCL: customsSell = 13,511 − 5,000 transport = 8,511 → 5% = 425.55
assertEq("CIF LCL customs commission = 5% of 8,511", cifLcl4.commission.customs, round2(8511 * 0.05));
assertEq("CIF LCL no freight commission", cifLcl4.commission.freight, 0);
assertEq("net = gross − 3% WHT", cifLcl4.commission.net, round2(cifLcl4.commission.gross * 0.97));

// ── (h) chinaCostPending — honesty flag (cost side not modelled yet) ──
section("(h) chinaCostPending flag");
// CIF/FOB = Thai-only scope → those costs ARE modelled → not pending.
assertEq("CIF LCL chinaCostPending = false", cifLcl4.chinaCostPending, false);
assertTrue("EXW LCL chinaCostPending = true (origin+freight cost 0)", exwLcl.chinaCostPending);
// air freight carries a representative cost > 0, and CFR has no origin lines →
// for an air CFR the flag stays false.
assertEq("CFR AIR chinaCostPending = false (air freight cost modelled)",
  composeFreightQuote({ mode: "air", incoterm: "CFR", kgm: 100 }).chinaCostPending, false);

// ── (i) chinaFreightCostThb — fold the real China cost → TRUE NET margin (0145) ──
section("(i) chinaFreightCostThb → true net margin");
const exwLclNet = composeFreightQuote({ mode: "sea_lcl", incoterm: "EXW", deliveryTruck: "4W", tier: "regular", cbm: 5, chinaFreightCostThb: 3000 });
assertEq("omitted → chinaFreightCostThb defaults 0", exwLcl.chinaFreightCostThb, 0);
assertEq("provided → chinaCostPending flips false", exwLclNet.chinaCostPending, false);
assertEq("chinaFreightCostThb echoed in result", exwLclNet.chinaFreightCostThb, 3000);
assertEq("subtotalCost = local + 3000 China cost", exwLclNet.subtotalCost, exwLcl.subtotalCost + 3000);
assertEq("profit = gross − 3000 China cost (NET)", exwLclNet.profit, exwLcl.profit - 3000);

console.log(`\n${fail === 0 ? "✅" : "❌"} freight rate-engine: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
