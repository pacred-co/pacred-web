/**
 * DB-free cost math for the admin-maintained China-side freight rate
 * (migration 0145 · `tb_freight_rate`). Extracted out of `rate-lookup.ts` so
 * the FX-conversion + unit-selection + degrade-to-null logic can be unit-tested
 * without a Supabase client. Behaviour is byte-for-byte the same as the inline
 * body that used to live in `lookupChinaFreightCostThb`.
 *
 * The "no usable rate → null" path is load-bearing: when this returns null the
 * compose action omits `chinaFreightCostThb`, so the engine keeps `profit`
 * GROSS and `chinaCostPending` stays true (never presents a fabricated net
 * margin). See lib/freight/rate-engine.ts.
 */

/** The three rate columns this helper reads — strings tolerated (PG numeric). */
export type FreightRateRow = {
  cost_usd: number | string;
  unit: string;
  fx_thb_per_usd: number | string;
};

/** Quantity drivers for the shipment (only one matters, per the rate's unit). */
export type FreightCostQty = { cbm?: number; kgm?: number; containers?: number };

/** Default FX when the row's fx is missing / non-numeric / 0 (฿/USD). */
export const DEFAULT_FX_THB_PER_USD = 35;

/**
 * Convert a `tb_freight_rate` row to the TOTAL China-side freight cost in ฿ for
 * the given quantity. Returns `null` when the rate can't yield a usable cost:
 *   - non-finite or ≤0 cost_usd
 *   - the unit's quantity driver resolves to ≤0 (cbm/kg with no volume)
 */
export function computeChinaFreightCostThb(
  row: FreightRateRow,
  qty: FreightCostQty,
): number | null {
  const costUsd = Number(row.cost_usd);
  const fx = Number(row.fx_thb_per_usd) || DEFAULT_FX_THB_PER_USD;
  if (!Number.isFinite(costUsd) || costUsd <= 0) return null;

  let units = 1;
  if (row.unit === "container") units = Math.max(1, qty.containers ?? 1);
  else if (row.unit === "cbm") units = Math.max(0, qty.cbm ?? 0);
  else if (row.unit === "kg") units = Math.max(0, qty.kgm ?? 0);
  if (units <= 0) return null;

  return Math.round(costUsd * fx * units * 100) / 100;
}
