/**
 * Import-duty (อากรขาเข้า) + VAT-inclusive total — the xlsx SELL-block roll-up.
 * ============================================================================
 * Workstream D-G2 (cargo-acct-epic 2026-06-11). The owner's manual cost/profit
 * worksheet (`ลงข้อมูลฝากจ่าย_ต้นทุนกำไร`, decoded in
 * docs/research/cargo-acct-epic-2026-06-11/D-accounting.md §4) rolls the SELL side:
 *
 *     ราคาขายสุทธิ (sellNet, = sell − discount)
 *   + อากรขาเข้า (importDutyThb)
 *   ─────────────────────────────
 *   = รวมราคาก่อน Vat (preVatTotal)
 *   + VAT 7%          (vatAmount = preVatTotal × rate)
 *   ─────────────────────────────
 *   = ราคารวม Vat     (vatInclusiveTotal)
 *
 * The app never computed อากรขาเข้า or the VAT-inclusive total → the owner had
 * to do it in Excel. This module ports that roll-up MECHANICALLY:
 *  - the duty BAHT is authoritative + staff-entered (the duty base is
 *    HS-code/policy-sensitive per ADR-0016, so it is NEVER auto-guessed here);
 *  - the duty % is informational — `dutyThbFromPct` is offered only as a
 *    convenience to seed the baht from a base the caller supplies, NOT as a
 *    policy decision baked into the engine;
 *  - the VAT rate is a parameter (default 7) — this module bakes in NO VAT
 *    policy; whether issuance applies VAT on this gross-up vs the profit margin
 *    is the G1 owner/accountant sign-off, decided upstream, not here.
 *
 * Pure + dependency-free → unit-testable in isolation. Money is rounded to 2
 * decimals (satang) at each published figure, matching the legacy `round_up`/
 * `number_format(...,2)` cadence used across the cargo money reports.
 */

/** Round to 2 decimal places (satang), half-away-from-zero — matches the
 *  legacy money rounding used in the accounting reports. */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  // +EPSILON nudges values that land *infinitesimally* below a rounding boundary
  // from float representation (e.g. a product that is mathematically x.xx5 but
  // stored as x.xx4999…). It is a mitigation, not a decimal library — exact
  // half-way ties at this scale stay platform-dependent. Good enough for the
  // satang cadence the legacy reports use; high-stakes issuance math should add
  // its own checks.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Coerce a possibly-string/null numeric DB value to a finite number ≥ 0. */
export function nonNegNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface ImportDutyVatInput {
  /** ราคาขายสุทธิ — the sell amount after discount (the base the roll-up sits on). */
  sellNet: number;
  /** อากรขาเข้า (บาท) — authoritative, staff-entered. Defaults to 0. */
  importDutyThb?: number;
  /** VAT rate %, default 7. A parameter — this module bakes in no VAT policy. */
  vatRatePct?: number;
}

export interface ImportDutyVatResult {
  /** ราคาขายสุทธิ (echoed, normalised ≥0). */
  sellNet: number;
  /** อากรขาเข้า (บาท) used (normalised ≥0). */
  importDutyThb: number;
  /** รวมราคาก่อน Vat = sellNet + importDutyThb. */
  preVatTotal: number;
  /** VAT amount = preVatTotal × rate. */
  vatAmount: number;
  /** ราคารวม Vat (VAT-inclusive total) = preVatTotal + vatAmount. */
  vatInclusiveTotal: number;
  /** the VAT rate % actually applied. */
  vatRatePct: number;
}

/**
 * The SELL-block roll-up: sellNet (+อากร) → pre-VAT → VAT-inclusive total.
 * Every published figure is rounded to satang.
 */
export function computeImportDutyVat(input: ImportDutyVatInput): ImportDutyVatResult {
  const sellNet = nonNegNum(input.sellNet);
  const importDutyThb = nonNegNum(input.importDutyThb);
  const vatRatePct = Number.isFinite(input.vatRatePct as number) && (input.vatRatePct as number) >= 0
    ? (input.vatRatePct as number)
    : 7;

  const preVatTotal = round2(sellNet + importDutyThb);
  const vatAmount = round2(preVatTotal * (vatRatePct / 100));
  const vatInclusiveTotal = round2(preVatTotal + vatAmount);

  return { sellNet, importDutyThb, preVatTotal, vatAmount, vatInclusiveTotal, vatRatePct };
}

/**
 * Convenience: derive the อากรขาเข้า baht from a % of a base the CALLER supplies.
 * This is NOT a policy decision — the caller decides the base (e.g. มูลค่าสำแดง,
 * declared value) and the staff confirms/overrides the resulting baht. Offered so
 * the editor can pre-fill the baht when a staffer types a %, mirroring the xlsx
 * `อากรขาเข้า(%) → อากรขาเข้า(บาท)` columns. Returns satang-rounded baht.
 */
export function dutyThbFromPct(base: number, pct: number): number {
  const b = nonNegNum(base);
  const p = Number.isFinite(pct) && pct > 0 ? pct : 0;
  return round2(b * (p / 100));
}
