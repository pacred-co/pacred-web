import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

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
    .order("pol", { ascending: true })          // '' (default route) sorts first
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle<{ cost_usd: number | string; unit: string; fx_thb_per_usd: number | string }>();
  if (error) {
    console.error(`[lookupChinaFreightCostThb] failed`, { code: error.code, message: error.message, mode });
    return null;
  }
  if (!data) return null;

  const costUsd = Number(data.cost_usd);
  const fx = Number(data.fx_thb_per_usd) || 35;
  if (!Number.isFinite(costUsd) || costUsd <= 0) return null;

  let units = 1;
  if (data.unit === "container") units = Math.max(1, qty.containers ?? 1);
  else if (data.unit === "cbm")  units = Math.max(0, qty.cbm ?? 0);
  else if (data.unit === "kg")   units = Math.max(0, qty.kgm ?? 0);
  if (units <= 0) return null;

  return Math.round(costUsd * fx * units * 100) / 100;
}
