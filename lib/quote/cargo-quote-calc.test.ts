import { calcFreight, calcQuoteTotals, round2, type FreightCalcInput } from "./cargo-quote-calc";
import { DEFAULT_COMPARISON } from "./cargo-promo-packages";
import { COMPARISON_DEFAULT, COMPARISON_MAX, clampComparison } from "../forwarder/resolve-rate";

let pass = 0;
let fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`✗ ${msg}`);
  }
}
function approx(actual: number, expected: number, msg: string) {
  ok(Math.abs(actual - expected) < 0.005, `${msg} (expected ${expected}, got ${actual})`);
}

const base: FreightCalcInput = {
  cbm: 0,
  kg: 0,
  comparison: 250,
  ratePerCbm: 4900,
  ratePerKg: 17,
  yiwuTruckSurchargePerCbm: 400,
  isYiwuTruck: false,
  minCharge: 25,
};

// 1. Light/bulky goods (density ≤ ค่าเทียบ) → bill by CBM.
{
  const r = calcFreight({ ...base, cbm: 10, kg: 1000 }); // density 100
  ok(r.basis === "cbm", "light goods bill by CBM");
  approx(r.chargeableQty, 10, "cbm chargeable qty");
  approx(r.freightTotal, 49000, "cbm freight total");
  approx(r.density ?? -1, 100, "density");
}

// 2. Dense/heavy goods (density > ค่าเทียบ) → bill by KG.
{
  const r = calcFreight({ ...base, cbm: 2, kg: 600 }); // density 300 > 250
  ok(r.basis === "kg", "heavy goods bill by KG");
  approx(r.chargeableQty, 600, "kg chargeable qty");
  approx(r.freightTotal, 10200, "kg freight total (600 × 17)");
}

// 3. Exactly at the ค่าเทียบ threshold → still CBM (strictly greater bills KG).
{
  const r = calcFreight({ ...base, cbm: 4, kg: 1000 }); // density exactly 250
  ok(r.basis === "cbm", "density == comparison → CBM");
}

// 4. Yiwu truck surcharge (per CBM, on top of the CBM/KG base).
{
  const r = calcFreight({ ...base, cbm: 5, kg: 500, isYiwuTruck: true }); // density 100 → cbm base 24500
  approx(r.surcharge, 2000, "yiwu surcharge 5 × 400");
  approx(r.freightTotal, 26500, "freight incl yiwu surcharge");
}

// 5. Per-shipment minimum charge.
{
  const r = calcFreight({ ...base, cbm: 0.001, kg: 0.1, ratePerCbm: 100 }); // 0.1 baht raw
  ok(r.belowMin, "below-min flagged");
  approx(r.freightTotal, 25, "min charge applied");
}

// 6. Empty input → 0, no NaN, density null.
{
  const r = calcFreight({ ...base });
  approx(r.freightTotal, 0, "empty freight total 0");
  ok(r.density === null, "empty density null");
}

// 7. Peak totals: VAT 7% on taxable lines + WHT 1% on pre-VAT base.
{
  const t = calcQuoteTotals(
    [
      { label: "ค่าขนส่ง", amount: 49000, vat: true },
      { label: "พิธีการ", amount: 2500, vat: true },
      { label: "ค่าธรรมเนียมกรมศุล", amount: 200, vat: false },
    ],
    0.01,
  );
  approx(t.subtotalVat, 51500, "subtotal VAT");
  approx(t.subtotalNoVat, 200, "subtotal no-VAT");
  approx(t.vatAmount, 3605, "VAT 7%");
  approx(t.grandTotal, 55305, "grand total");
  approx(t.whtAmount, 517, "WHT 1% on pre-VAT base 51700");
  approx(t.netPayable, 54788, "net payable");
}

// 8. Zero-price lines are ignored in totals.
{
  const t = calcQuoteTotals([{ label: "x", amount: 0, vat: true }]);
  approx(t.grandTotal, 0, "all-zero grand total 0");
}

// 9. round2 sanity (avoid exact .x5 half-cases — they are float-representation
// dependent and not meaningful for money totals).
{
  approx(round2(10200.014), 10200.01, "round2 toward nearest (down)");
  approx(round2(10200.026), 10200.03, "round2 toward nearest (up)");
  ok(round2(2.5) === 2.5, "round2 passthrough");
}

// 10. WHT base excludes pass-through (whtApplicable:false) lines.
{
  const t = calcQuoteTotals(
    [
      { label: "ค่าบริการ", amount: 10000, vat: true, whtApplicable: true },
      { label: "ค่าผ่านรัฐ", amount: 200, vat: false, whtApplicable: false },
    ],
    0.01,
  );
  approx(t.whtAmount, 100, "WHT excludes pass-through (1% of 10000, not 10200)");
  approx(t.subtotalNoVat, 200, "pass-through still in no-VAT subtotal");
}

// ── ITEM C (owner 2026-07-06) — ค่าเทียบ default 250 everywhere ─────────────
// The quote-tool / rate-editor display default must be 250 (not 150/350) and
// match the auto-calc default the resolver uses. Cap stays 350.
ok(DEFAULT_COMPARISON === 250, "DEFAULT_COMPARISON = 250 (quote-tool/rate-editor display default)");
ok(DEFAULT_COMPARISON === COMPARISON_DEFAULT, "DEFAULT_COMPARISON matches resolver COMPARISON_DEFAULT (250)");
ok(COMPARISON_MAX === 350, "COMPARISON_MAX (cap) stays 350");
// A stored userComparisonValue of 0 → the resolver clamps up to 250 (so display
// + auto-calc both show 250 with zero data backfill).
ok(clampComparison(0) === 250, "clampComparison(0) → 250 (stored-0 customer defaults to 250)");
ok(clampComparison(300) === 300, "clampComparison(300) → 300 (in-range unchanged)");
ok(clampComparison(500) === 350, "clampComparison(500) → 350 (capped at max)");

console.log(`cargo-quote-calc: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
