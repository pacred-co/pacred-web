import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeChinaFreightCostThb,
  selectBestFreightRate,
  type FreightRateRow,
  type FreightRateRouteRow,
  type FreightRoute,
} from "./rate-lookup-math";

export { computeChinaFreightCostThb, selectBestFreightRate, type FreightRateRow, type FreightRoute };

/**
 * Look up the admin-maintained China-side freight cost (migration 0145 ·
 * `tb_freight_rate`) for a transport mode, FX-convert it, and return the TOTAL
 * cost in ฿ for the shipment's quantity. The compose action passes the result
 * into `composeFreightQuote({ chinaFreightCostThb })` → the quote's profit
 * becomes a real NET margin (not gross "กำไรขั้นต้น").
 *
 * G1 — ROUTE-AWARE. When `route.pol`/`route.pod` are supplied the lookup prefers
 * the most-specific active row for the shipment's lane, falling back gracefully:
 *
 *   (mode, pol, pod)   →   (mode, pol, '')   →   (mode, '', '')   [newest active]
 *
 * (the 0145 table already carries the `pol`/`pod` columns + a matching index).
 * When `route` is omitted the behaviour is unchanged from the MVP — the newest
 * active rate for the mode wins (mode-default), so existing callers are safe.
 *
 * Returns `null` when no active rate exists → the engine keeps the gross
 * "chinaCostPending" behaviour (graceful · the feature is opt-in per rate).
 *
 * The DB-free cost math + the route-precedence selection both live in
 * `./rate-lookup-math` (`computeChinaFreightCostThb` + `selectBestFreightRate`)
 * so they can be unit-tested without a Supabase client.
 */
export async function lookupChinaFreightCostThb(
  // accepts any freight mode string ("sea_fcl"/"sea_lcl"/"air"/"truck"); the
  // tb_freight_rate CHECK only allows sea/air, so "truck" simply finds no row → null.
  mode: string,
  qty: { cbm?: number; kgm?: number; containers?: number },
  route?: FreightRoute,
): Promise<number | null> {
  const admin = createAdminClient();
  const hasRoute = Boolean(route?.pol?.trim() || route?.pod?.trim());

  // Pull the candidate active rates for this mode, deterministically ordered
  // (newest effective_from first, then pol/pod asc as a stable secondary key).
  // Without a route we only need the single newest row (mode-default, unchanged);
  // with a route we fetch a small bounded set and pick the best lane match in JS.
  let query = admin
    .from("tb_freight_rate")
    .select("cost_usd, unit, fx_thb_per_usd, pol, pod, effective_from")
    .eq("transport_mode", mode)
    .eq("active", true)
    .order("effective_from", { ascending: false })
    .order("pol", { ascending: true })
    .order("pod", { ascending: true });
  query = hasRoute ? query.limit(200) : query.limit(1);

  const { data, error } = await query.returns<FreightRateRouteRow[]>();
  if (error) {
    console.error(`[lookupChinaFreightCostThb] failed`, { code: error.code, message: error.message, mode });
    return null;
  }
  if (!data || data.length === 0) return null;

  // selectBestFreightRate honours the precedence above; with no route every '' row
  // ties at score 0 → the newest (already first) active row for the mode wins.
  const best = selectBestFreightRate(data, route);
  if (!best) return null;

  return computeChinaFreightCostThb(best, qty);
}
