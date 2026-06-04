/**
 * Min-sell floor CONFIG loader — Lane C (global-trade-group-2026-06-04.md §5).
 *
 * Reads the per-route min-sell floor table from `business_config`
 * (key `pricing.min_sell_floor`, JSON · seeded by migration 0139). Falls back
 * to DEFAULT_MIN_SELL_FLOORS (กว่างโจว 2,900 / อี้อู 4,900 / เรือ +300) on any
 * miss so the guardrail works even before the migration is applied.
 *
 * Config home (ADR-0024): `business_config` is the canonical home for
 * Pacred-native NON-pricing-engine config. The min-sell floor is a Pacred sales
 * POLICY (not a rate the legacy pricing engine reads) → it belongs here, NOT in
 * tb_settings. The admin edits it via /admin/settings/business-config (the JSON
 * value_type renders a textarea editor — no new editor page needed).
 *
 * Server-only — never import from a Client Component.
 */

import "server-only";

import { getBusinessConfig } from "@/lib/business-config";
import {
  DEFAULT_MIN_SELL_FLOORS,
  type MinSellFloors,
  type MinSellTransport,
  type MinSellWarehouse,
} from "./min-sell";

/** The business_config key for the min-sell floor table. */
export const MIN_SELL_CONFIG_KEY = "pricing.min_sell_floor";

const toNum = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Normalise a raw jsonb value into a complete MinSellFloors, filling any
 * missing field from the defaults. Defensive: the admin edits raw JSON in the
 * business-config textarea, so a partial / mistyped object must not crash the
 * pricing path — we coerce + fall back per-field.
 */
function normalise(raw: unknown): MinSellFloors {
  const d = DEFAULT_MIN_SELL_FLOORS;
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const baseRaw = (r.base ?? {}) as Record<string, unknown>;
  const surRaw = (r.surcharge ?? {}) as Record<string, unknown>;

  const base: Record<MinSellWarehouse, number> = {
    "1": baseRaw["1"] != null ? toNum(baseRaw["1"]) : d.base["1"],
    "2": baseRaw["2"] != null ? toNum(baseRaw["2"]) : d.base["2"],
  };
  const surcharge: Record<MinSellTransport, number> = {
    "1": surRaw["1"] != null ? toNum(surRaw["1"]) : d.surcharge["1"],
    "2": surRaw["2"] != null ? toNum(surRaw["2"]) : d.surcharge["2"],
    "3": surRaw["3"] != null ? toNum(surRaw["3"]) : d.surcharge["3"],
  };
  return {
    base,
    surcharge,
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    block: typeof r.block === "boolean" ? r.block : d.block,
  };
}

/**
 * Load the min-sell floor config (60s-cached via getBusinessConfig). Always
 * returns a complete, coerced MinSellFloors — never throws.
 */
export async function getMinSellFloors(): Promise<MinSellFloors> {
  const raw = await getBusinessConfig<unknown>(MIN_SELL_CONFIG_KEY, DEFAULT_MIN_SELL_FLOORS);
  return normalise(raw);
}
