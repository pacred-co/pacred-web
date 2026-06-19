/**
 * Sell-rate CBM floor — DB-overridable resolver (เดฟ · #5b ultra-editable floor).
 *
 * Background: `COST_FLOOR` (lib/admin/customer-rate-tables.ts) is the owner-set
 * ราคาขายขั้นต่ำ — the lowest a customer may be sold at. Commit 06d34711 made it
 * a HARD block on the rate-save path. The owner (ภูม) then asked: only `ultra`
 * (Ultra Admin Z) should be able to CHANGE the floor — and do it inline where
 * it's already shown, not on a new page.
 *
 * To let ultra change the floor WITHOUT a deploy (and WITHOUT a migration), the
 * CBM floor matrix is mirrored into a `business_config` json key:
 *
 *   pricing.sell_rate_floor_cbm
 *     = { "1": { "1": <รถ>, "2": <เรือ> }, "2": { "1": <รถ>, "2": <เรือ> } }
 *       └ warehouse '1' กวางโจว · '2' อี้อู   └ transport '1' รถ · '2' เรือ
 *
 * The key is OPTIONAL — `getSellFloorCbm()` falls back to the `COST_FLOOR`
 * constant cell-by-cell when the key is absent / partial / malformed, so NO
 * migration is required: the row is created on the first ultra-save (via the
 * upsert in actions/admin/sell-floor.ts). Each CBM floor value is flat across
 * the 4 product types (owner: "ค่าเดียวทุกประเภทสินค้า"), exactly like the
 * constant — the resolver projects to the same `COST_FLOOR[wh].cbm[t][p]`
 * shape so every consumer (the hard-block in customer-rate.ts + the rate-editor
 * grid / InfoTab) reads it identically.
 *
 * The KG floor is NOT overridable here (owner only spoke to the CBM rate) — it
 * stays on `KG_FLOOR_LEGACY` inside the constant. The projected matrix keeps
 * the constant's `kg` so consumers read KG unchanged.
 *
 * Server-only (reads business_config) — never import from a Client Component.
 * The rate-editor (a client component) receives the resolved CBM floor as a
 * prop from the server page.
 */

import "server-only";

import { getBusinessConfig } from "@/lib/business-config";
import {
  COST_FLOOR,
  type ProductId,
  type RateMatrix,
  type TransportId,
  type WarehouseId,
} from "@/lib/admin/customer-rate-tables";

/** The business_config json key holding the per-warehouse × transport CBM floor. */
export const SELL_FLOOR_CBM_KEY = "pricing.sell_rate_floor_cbm";

/** Sane bounds for a CBM floor value (฿/คิว) — guards the ultra edit. */
export const SELL_FLOOR_MIN = 1000;
export const SELL_FLOOR_MAX = 99999;

/**
 * The stored shape: warehouse → transport → flat ฿/คิว value. Product type is
 * NOT stored (the floor is one value for all 4 products), matching the constant.
 */
export type SellFloorCbmConfig = Record<
  WarehouseId,
  Record<TransportId, number>
>;

/** Read one flat CBM floor cell straight from the constant (the default source). */
function constCbm(wh: WarehouseId, t: TransportId): number {
  // The constant stores the same value for every product type; read product "1".
  return Number(COST_FLOOR[wh].cbm[t]["1"] ?? 0);
}

/** The constant's CBM floor expressed in the stored config shape (the fallback). */
export function defaultSellFloorCbm(): SellFloorCbmConfig {
  return {
    "1": { "1": constCbm("1", "1"), "2": constCbm("1", "2") },
    "2": { "1": constCbm("2", "1"), "2": constCbm("2", "2") },
  };
}

/** True if a value is a usable, in-bounds CBM floor number. */
function validFloor(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= SELL_FLOOR_MIN && v <= SELL_FLOOR_MAX;
}

/**
 * Resolve the live CBM floor config: the `pricing.sell_rate_floor_cbm`
 * business_config key, falling back to the `COST_FLOOR` constant for any
 * cell that is absent / out-of-range / malformed. NEVER throws — a missing or
 * broken key degrades to the constant cell-by-cell, so the floor is always
 * enforceable even before the key is ever seeded.
 */
export async function getSellFloorCbm(): Promise<SellFloorCbmConfig> {
  const stored = await getBusinessConfig<unknown>(SELL_FLOOR_CBM_KEY, null);
  if (!stored || typeof stored !== "object") return defaultSellFloorCbm();

  const out = defaultSellFloorCbm();
  for (const wh of ["1", "2"] as WarehouseId[]) {
    const whCfg = (stored as Record<string, unknown>)[wh];
    if (!whCfg || typeof whCfg !== "object") continue;
    for (const t of ["1", "2"] as TransportId[]) {
      const v = (whCfg as Record<string, unknown>)[t];
      if (validFloor(v)) out[wh][t] = v;
    }
  }
  return out;
}

/**
 * Project the resolved flat CBM floor back into the full `RateMatrix`-shaped
 * `COST_FLOOR` map (CBM populated per warehouse from config, KG kept from the
 * constant). This is what the hard-block + the rate-editor consume so the
 * existing `floor[wh].cbm[t][p]` / `floor[wh].kg[t][p]` access pattern is
 * unchanged — only the CBM SOURCE swaps from constant → resolved.
 */
export function buildResolvedFloor(
  cbm: SellFloorCbmConfig,
): Record<WarehouseId, RateMatrix> {
  const flat = (v: number): Record<ProductId, number | null> => ({
    "1": v, "2": v, "3": v, "4": v,
  });
  const forWarehouse = (wh: WarehouseId): RateMatrix => ({
    // KG floor stays on the constant (owner spoke only to CBM).
    kg: COST_FLOOR[wh].kg,
    cbm: {
      "1": flat(cbm[wh]["1"]),
      "2": flat(cbm[wh]["2"]),
    },
  });
  return { "1": forWarehouse("1"), "2": forWarehouse("2") };
}

/** Convenience: resolve + project to the full `COST_FLOOR`-shaped matrix. */
export async function getResolvedFloor(): Promise<Record<WarehouseId, RateMatrix>> {
  return buildResolvedFloor(await getSellFloorCbm());
}
