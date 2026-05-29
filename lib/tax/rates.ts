/**
 * Tax-rate loader from `business_config` (server-only).
 *
 * Rates change by law (e-Withholding 3%↔1%, VAT 7%↔10%) — keep them out of
 * code. `business_config` is a key/value jsonb store; we read 4 keys:
 *   tax.wht.transport_pct   (default 1)
 *   tax.wht.service_pct     (default 3)
 *   tax.wht.rental_pct      (default 5)
 *   tax.wht.goods_pct       (default 0 — goods not withheld; still in VAT base)
 *   tax.vat.pct             (default 7)
 *
 * Cached per request (Next 16 React `cache`) — one DB hit per render.
 * Falls back to DEFAULT_TAX_RATES on missing rows / read failure so the
 * tax engine never breaks if the seed migration hasn't run.
 */
import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TAX_RATES, type TaxRates } from "./wht";

const KEYS = [
  "tax.wht.transport_pct",
  "tax.wht.service_pct",
  "tax.wht.rental_pct",
  "tax.wht.goods_pct",
  "tax.vat.pct",
] as const;

function toPct(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Resolve the current tax rates (server-only · per-request cached).
 * Use this in actions/server-components; pass the result to
 * `computeForwarderTax` / `calcForwarderNetPayable`.
 */
export const getTaxRates = cache(async (): Promise<TaxRates> => {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("business_config")
      .select("key, value")
      .in("key", [...KEYS]);
    if (error) {
      console.warn("[tax/rates] business_config read failed — using defaults", error.message);
      return DEFAULT_TAX_RATES;
    }
    const m = new Map<string, unknown>();
    for (const r of (data ?? []) as { key: string; value: unknown }[]) m.set(r.key, r.value);
    return {
      transportPct: toPct(m.get("tax.wht.transport_pct"), DEFAULT_TAX_RATES.transportPct),
      servicePct:   toPct(m.get("tax.wht.service_pct"),   DEFAULT_TAX_RATES.servicePct),
      rentalPct:    toPct(m.get("tax.wht.rental_pct"),    DEFAULT_TAX_RATES.rentalPct),
      goodsPct:     toPct(m.get("tax.wht.goods_pct"),     DEFAULT_TAX_RATES.goodsPct),
      vatPct:       toPct(m.get("tax.vat.pct"),           DEFAULT_TAX_RATES.vatPct),
    };
  } catch (e) {
    console.warn("[tax/rates] threw — using defaults", e instanceof Error ? e.message : e);
    return DEFAULT_TAX_RATES;
  }
});
