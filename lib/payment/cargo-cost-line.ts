/**
 * S1 — CARGO tax-doc cost-line completeness (audit fix, money-accuracy).
 *
 * A ฝากสั่งซื้อ (shop) order line carries a ¥ unit cost (`cost_unit_cny`) and a
 * cost-side ¥→THB rate (`cost_rate_cny`). To land the line cost in THB we need
 * BOTH: `cost × qty × rate`. If Pricing entered a ¥ cost but left the rate blank
 * (or 0), the line is INCOMPLETE → it must contribute 0, NOT silently use rate=1
 * (which would land a ¥ figure as THB, ~4.9× understated → wrong PEAK cost,
 * inflated profit, wrong margin).
 *
 * This is the single source of truth for that per-line formula, consumed by both
 * the CARGO tax-doc workspace (actions/admin/cargo-taxdoc-workspace.ts) and the
 * PEAK export rollup (actions/admin/peak-export.ts). Pure (no IO) → unit-testable.
 *
 * Values may arrive as PG-numeric strings ("12.50"), numbers, null, or undefined.
 */

/** Coerce a PG numeric / string / nullish value to a finite number (0 on junk). */
function toNum(v: number | string | null | undefined): number {
  return v == null ? 0 : Number(v) || 0;
}

export type CargoCostLineInput = {
  /** ¥ unit cost (cost_unit_cny). */
  costCny: number | string | null | undefined;
  /** cost-side ¥→THB rate (cost_rate_cny). Blank/0 → line is incomplete → 0. */
  rateCny: number | string | null | undefined;
  /** order quantity (orderqty). <= 0 → treated as 1 (preserve legacy behaviour). */
  qty: number | string | null | undefined;
};

/**
 * THB cost of a single cargo order line.
 *   cost > 0 AND rate > 0 → cost × (qty>0 ? qty : 1) × rate
 *   otherwise (incomplete: no cost, or no/blank rate) → 0  (NEVER ×1 on rate)
 */
export function cargoLineCostThb({ costCny, rateCny, qty }: CargoCostLineInput): number {
  const cost = toNum(costCny);
  const rate = toNum(rateCny);
  const q = Math.max(0, toNum(qty));
  if (cost > 0 && rate > 0) {
    return cost * (q > 0 ? q : 1) * rate;
  }
  return 0;
}
