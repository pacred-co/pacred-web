import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeChinaFreightCostThb, type FreightRateRow } from "./rate-lookup-math";

export { computeChinaFreightCostThb, type FreightRateRow };

/**
 * Look up the admin-maintained China-side freight cost (migration 0145 ·
 * `tb_freight_rate`) for a transport mode, FX-convert it, and return the TOTAL
 * cost in ฿ for the shipment's quantity. The compose action passes the result
 * into `composeFreightQuote({ chinaFreightCostThb })` → the quote's profit
 * becomes a real NET margin (not gross "กำไรขั้นต้น").
 *
 * Keyed by mode + the DEFAULT route (pol=''/pod='' sort first) for the MVP —
 * a per-route×carrier match can be added later (the table already has the
 * columns). Returns `null` when no active rate exists → the engine keeps the
 * gross "chinaCostPending" behaviour (graceful · the feature is opt-in per rate).
 *
 * The DB-free cost math + unit selection + degrade-to-null logic lives in
 * `computeChinaFreightCostThb` (./rate-lookup-math) so it can be unit-tested
 * without a Supabase client.
 */
export async function lookupChinaFreightCostThb(
  // accepts any freight mode string ("sea_fcl"/"sea_lcl"/"air"/"truck"); the
  // tb_freight_rate CHECK only allows sea/air, so "truck" simply finds no row → null.
  mode: string,
  qty: { cbm?: number; kgm?: number; containers?: number },
): Promise<number | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_freight_rate")
    .select("cost_usd, unit, fx_thb_per_usd")
    .eq("transport_mode", mode)
    .eq("active", true)
    // effective_from FIRST → the most-recently-effective rate for this mode wins
    // (deterministic). pol is NOT a matcher here — the engine doesn't pass the
    // shipment route yet, so route/carrier columns are informational until
    // per-route matching ships (the CRUD route fields carry that hint). The old
    // `pol ASC` primary made the '' default row always beat a newer specific row.
    .order("effective_from", { ascending: false })
    .order("pol", { ascending: true })
    .limit(1)
    .maybeSingle<FreightRateRow>();
  if (error) {
    console.error(`[lookupChinaFreightCostThb] failed`, { code: error.code, message: error.message, mode });
    return null;
  }
  if (!data) return null;

  return computeChinaFreightCostThb(data, qty);
}
