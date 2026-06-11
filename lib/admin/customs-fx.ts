/**
 * customs-fx — the monthly Customs Department FX rates (เรทนำเข้าประจำเดือนของ
 * กรมศุลกากร) used to compute the ใบขน declared value (mig 0179). Stored in
 * business_config under `customs.fx_rates` (USD/CNY/… → THB) + a `pending` flag.
 *
 * declared_value_thb = declared_amount_ccy × the chosen currency's rate.
 * The cost editor reads this for the per-currency default rate; staff can
 * override the rate per job. Server-only.
 */
import "server-only";
import { getBusinessConfig } from "@/lib/business-config";

export type CustomsFxRates = {
  /** THB per 1 unit of the currency. Extra currencies allowed. */
  [currency: string]: number | boolean | undefined;
  /** true until the accountant fills the real monthly rates. */
  pending?: boolean;
};

const DEFAULT_FX: CustomsFxRates = { USD: 36.5, CNY: 5.1, pending: true };

/** Read the customs FX rates (falls back to the seeded defaults on miss). */
export async function getCustomsFxRates(): Promise<CustomsFxRates> {
  const raw = await getBusinessConfig<CustomsFxRates>("customs.fx_rates", DEFAULT_FX);
  return raw && typeof raw === "object" ? raw : DEFAULT_FX;
}

/**
 * The numeric-only rate map the cost editor consumes (drops `pending` + any
 * non-positive entries) — a clean Record<string, number> safe for the client.
 */
export function fxRateMap(rates: CustomsFxRates): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rates)) {
    if (k === "pending") continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}
