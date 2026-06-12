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

/**
 * A rate row carrying its route + recency, for route-aware precedence selection.
 * `pol`/`pod` = '' means "any" (the migration-0145 default). `effective_from` is
 * the recency tie-breaker (newest wins within a specificity tier).
 */
export type FreightRateRouteRow = FreightRateRow & {
  pol: string;
  pod: string;
  effective_from: string;
};

/** The shipment route to match against (China port → Thai port). Both optional. */
export type FreightRoute = { pol?: string; pod?: string };

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

/**
 * Pick the single most-specific active rate row for a shipment route from a
 * candidate list (all already filtered to the same mode + active=true by the DB).
 * DB-free so the route-precedence logic is unit-testable without Supabase.
 *
 * A row is ELIGIBLE only if it doesn't contradict the requested route: its `pol`
 * must be '' (any) or equal the requested pol, and likewise for `pod`. Among the
 * eligible rows the winner is the most-specific:
 *
 *   (pol, pod) exact   →   (pol, '')   →   ('', pod)   →   ('', '')   [newest active]
 *
 * pol-specificity outranks pod-specificity (matches the 0145 index order
 * `transport_mode, pol, pod`). Ties within a tier break by `effective_from` desc
 * (newest wins) — preserving the deterministic ordering of the mode-default path.
 *
 * When `route` is undefined/empty this still works: every row is eligible and the
 * '' rows tie at score 0, so the newest active rate for the mode wins — identical
 * to the legacy mode-default behaviour.
 */
export function selectBestFreightRate<T extends FreightRateRouteRow>(
  rows: readonly T[],
  route?: FreightRoute,
): T | null {
  const wantPol = route?.pol?.trim() ?? "";
  const wantPod = route?.pod?.trim() ?? "";

  let best: T | null = null;
  let bestScore = -1;
  for (const r of rows) {
    const rowPol = r.pol ?? "";
    const rowPod = r.pod ?? "";
    // A specific row that names a DIFFERENT pol/pod than requested is ineligible.
    if (rowPol !== "" && rowPol !== wantPol) continue;
    if (rowPod !== "" && rowPod !== wantPod) continue;

    // Specificity score: pol match weighted above pod (the 0145 index order).
    const score = (rowPol !== "" ? 2 : 0) + (rowPod !== "" ? 1 : 0);
    if (
      score > bestScore ||
      // same specificity → newest effective_from wins (deterministic recency)
      (score === bestScore && best != null &&
        String(r.effective_from) > String(best.effective_from))
    ) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}
