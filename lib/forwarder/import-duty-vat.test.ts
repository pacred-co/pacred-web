/**
 * Unit tests for the import-duty (อากรขาเข้า) + VAT-inclusive roll-up —
 * the xlsx SELL-block port (D-G2 · cargo-acct-epic 2026-06-11).
 *
 *   ราคาขายสุทธิ (+อากร) → รวมราคาก่อน Vat → +VAT 7% → ราคารวม Vat
 *
 * Run with:  tsx lib/forwarder/import-duty-vat.test.ts
 *            (or `pnpm test:unit` for the whole suite)
 * Exits non-zero on any failure — matches the repo's tsx harness.
 */

import {
  computeImportDutyVat,
  dutyThbFromPct,
  nonNegNum,
  round2,
} from "./import-duty-vat";

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

// ── round2 ────────────────────────────────────────────────────────────────
assertClose("round2 truncates below .005 boundary", round2(1.2345), 1.23);
assertClose("round2 rounds up above .005 boundary", round2(1.2356), 1.24);
assertClose("round2 of a clean VAT product", round2(56301.05 * 0.07), 3941.07);
assertClose("round2 of non-finite → 0", round2(NaN), 0);

// ── nonNegNum (DB-value coercion) ──────────────────────────────────────────
assertClose("nonNegNum numeric string", nonNegNum("12.5"), 12.5);
assertClose("nonNegNum negative → 0", nonNegNum(-5), 0);
assertClose("nonNegNum garbage → 0", nonNegNum("abc"), 0);
assertClose("nonNegNum null → 0", nonNegNum(null), 0);
assertClose("nonNegNum plain number", nonNegNum(1050.25), 1050.25);

// ── computeImportDutyVat — the SELL-block roll-up ──────────────────────────
// 1) round ฿1,000, no duty, default VAT 7%
{
  const r = computeImportDutyVat({ sellNet: 1000 });
  assertClose("base: preVat = sellNet", r.preVatTotal, 1000);
  assertClose("base: VAT 7% = 70", r.vatAmount, 70);
  assertClose("base: VAT-incl = 1070", r.vatInclusiveTotal, 1070);
  assertClose("base: importDuty defaults 0", r.importDutyThb, 0);
  assertClose("base: vatRatePct echoes 7", r.vatRatePct, 7);
}

// 2) with อากรขาเข้า ฿50 → folds into pre-VAT
{
  const r = computeImportDutyVat({ sellNet: 1000, importDutyThb: 50 });
  assertClose("duty: preVat = sellNet + duty", r.preVatTotal, 1050);
  assertClose("duty: VAT 7% of 1050 = 73.50", r.vatAmount, 73.5);
  assertClose("duty: VAT-incl = 1123.50", r.vatInclusiveTotal, 1123.5);
  assertClose("duty: importDuty echoed", r.importDutyThb, 50);
}

// 3) the xlsx R9 sell figure (฿56,301.05, no duty) — satang-exact
{
  const r = computeImportDutyVat({ sellNet: 56301.05 });
  assertClose("xlsx R9: preVat", r.preVatTotal, 56301.05);
  assertClose("xlsx R9: VAT", r.vatAmount, 3941.07);
  assertClose("xlsx R9: VAT-incl", r.vatInclusiveTotal, 60242.12);
}

// 4) VAT rate is a parameter — 0% = no VAT layer (issuance policy decided upstream)
{
  const r = computeImportDutyVat({ sellNet: 100, importDutyThb: 20, vatRatePct: 0 });
  assertClose("vat0: preVat still sums", r.preVatTotal, 120);
  assertClose("vat0: VAT = 0", r.vatAmount, 0);
  assertClose("vat0: VAT-incl = pre-VAT", r.vatInclusiveTotal, 120);
}

// 5) negative/garbage inputs are normalised (never a NaN money figure)
{
  const r = computeImportDutyVat({ sellNet: -999, importDutyThb: -5 });
  assertClose("neg: sellNet floored to 0", r.sellNet, 0);
  assertClose("neg: preVat = 0", r.preVatTotal, 0);
  assertClose("neg: VAT-incl = 0", r.vatInclusiveTotal, 0);
}

// ── dutyThbFromPct (convenience seeder, not a policy) ──────────────────────
assertClose("dutyFromPct: 5% of 1000 = 50", dutyThbFromPct(1000, 5), 50);
assertClose("dutyFromPct: 0% = 0", dutyThbFromPct(1000, 0), 0);
assertClose("dutyFromPct: 2.5% of 56301.05 satang-rounded", dutyThbFromPct(56301.05, 2.5), 1407.53);
assertClose("dutyFromPct: negative base → 0", dutyThbFromPct(-10, 5), 0);

// ── summary ────────────────────────────────────────────────────────────────
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
