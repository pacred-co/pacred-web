/**
 * GAP 1 (audit 2026-06-11 · cargo-cost-declared-workflow) — the auto-fill
 * seeds for the per-line COST + DECLARED editor.
 *
 * The 3-number model captures SELLING / COST / DECLARED separately, but the
 * per-line cost editor used to render EMPTY (it inits only from the null
 * migration-0158 columns). These pure helpers compute the *suggested* cost
 * basis from the order data the page already shows, so Pricing sees a
 * pre-filled "ออโต้ — แก้ได้" value instead of a blank box.
 *
 * ⚠️ These are DISPLAY-ONLY suggestions. Nothing persists until staff hits
 * Save in the editor (which sends the current draft — auto value or override).
 * They never touch the selling price / money path.
 *
 * Faithful to the audit's formulas:
 *   SHOP   line: autoCostUnit = cprice (¥ unit) · autoCostRate = hratecostdefault
 *                autoDeclared = roundUp2(cprice × rate × qty)
 *   IMPORT line: autoCostRate = hratecostdefault · autoCostUnit = none (no per-unit
 *                source — tb_forwarder_item has qty + CBM only)
 *                autoDeclared = round2(fcosttotalprice × qtyShare)
 */

/** Coerce anything to a finite non-negative number (0 on junk/negative). */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round to 2 decimals (nearest). */
export function round2(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Round UP to 2 decimals. DECLARED value (มูลค่าสำแดง / ใบขน) is conservative —
 * a seed that rounds up never under-states the customs base.
 */
export function roundUp2(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n * 100) / 100;
}

/**
 * SHOP (ฝากสั่งซื้อ · tb_order) declared-THB seed.
 * = ¥ unit price × cost yuan-rate × quantity, rounded up.
 * Returns 0 when any input is missing (caller treats 0 as "no auto").
 */
export function shopAutoDeclaredThb(
  cpriceCny: unknown,
  costRate: unknown,
  qty: unknown,
): number {
  return roundUp2(num(cpriceCny) * num(costRate) * num(qty));
}

/**
 * IMPORT (ฝากนำเข้า · tb_forwarder_item) declared-THB seed.
 * Prorates the forwarder header cost total by this line's quantity share.
 * = fcosttotalprice × (lineQty / Σqty), rounded to 2.
 * Returns 0 when Σqty ≤ 0 or the header total is missing.
 */
export function importAutoDeclaredThb(
  fCostTotal: unknown,
  lineQty: unknown,
  totalQty: unknown,
): number {
  const total = num(totalQty);
  if (total <= 0) return 0;
  const share = num(lineQty) / total;
  return round2(num(fCostTotal) * share);
}

/** Normalise an auto value: 0 → null so the editor treats "no seed" uniformly. */
export function autoOrNull(n: number): number | null {
  return Number.isFinite(n) && n > 0 ? n : null;
}
