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
 * The KG floor is now ALSO overridable (owner 2026-07-03: "ต่ำสุด รถ 17 เรือ 7")
 * — the exact same pattern in a twin key:
 *
 *   pricing.sell_rate_floor_kg
 *     = { "1": <รถ>, "2": <เรือ> }   (per-transport flat, shared BOTH warehouses)
 *
 * The owner gave ONE value per transport (not per warehouse), so the KG stored
 * shape is flat by transport and applied to both warehouses. `getSellFloorKg()`
 * falls back to the `KG_FLOOR_DEFAULT` constant (รถ 17 · เรือ 7) cell-by-cell, so
 * NO migration is needed — the row is created on the first ultra-save.
 *
 * Server-only (reads business_config) — never import from a Client Component.
 * The rate-editor (a client component) receives the resolved CBM + KG floors as
 * props from the server page.
 */

import "server-only";

import { getBusinessConfig } from "@/lib/business-config";
import {
  COST_FLOOR,
  KG_FLOOR_DEFAULT,
  type ProductId,
  type RateMatrix,
  type TransportId,
  type WarehouseId,
} from "@/lib/admin/customer-rate-tables";

/** The business_config json key holding the per-warehouse × transport CBM floor. */
export const SELL_FLOOR_CBM_KEY = "pricing.sell_rate_floor_cbm";

/** The business_config json key holding the per-transport (flat) KG floor. */
export const SELL_FLOOR_KG_KEY = "pricing.sell_rate_floor_kg";

/** Sane bounds for a CBM floor value (฿/คิว) — guards the ultra edit. */
export const SELL_FLOOR_MIN = 1000;
export const SELL_FLOOR_MAX = 99999;

/** Sane bounds for a KG floor value (฿/กก.) — guards the ultra edit. */
export const SELL_FLOOR_KG_MIN = 1;
export const SELL_FLOOR_KG_MAX = 999;

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

// ── KG floor twin (per-transport flat, shared both warehouses) ─────────────

/**
 * The stored KG shape: transport → flat ฿/กก. value. Product type is NOT
 * stored (one value for all 4 products), and warehouse is NOT stored either
 * (owner gave one value per transport, shared both warehouses).
 */
export type SellFloorKgConfig = Record<TransportId, number>;

/** Read one flat KG floor cell straight from the constant (the default source). */
function constKg(t: TransportId): number {
  // The constant stores the same value for every product type; read product "1".
  return Number(KG_FLOOR_DEFAULT[t]["1"] ?? 0);
}

/** The constant's KG floor expressed in the stored config shape (the fallback). */
export function defaultSellFloorKg(): SellFloorKgConfig {
  return { "1": constKg("1"), "2": constKg("2") };
}

/** True if a value is a usable, in-bounds KG floor number. */
function validKgFloor(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= SELL_FLOOR_KG_MIN && v <= SELL_FLOOR_KG_MAX;
}

/**
 * Resolve the live KG floor config: the `pricing.sell_rate_floor_kg`
 * business_config key, falling back to the `KG_FLOOR_DEFAULT` constant for any
 * cell that is absent / out-of-range / malformed. NEVER throws.
 */
export async function getSellFloorKg(): Promise<SellFloorKgConfig> {
  const stored = await getBusinessConfig<unknown>(SELL_FLOOR_KG_KEY, null);
  if (!stored || typeof stored !== "object") return defaultSellFloorKg();

  const out = defaultSellFloorKg();
  for (const t of ["1", "2"] as TransportId[]) {
    const v = (stored as Record<string, unknown>)[t];
    if (validKgFloor(v)) out[t] = v;
  }
  return out;
}

/**
 * Project the resolved flat CBM + KG floors back into the full `RateMatrix`-
 * shaped `COST_FLOOR` map (CBM per warehouse from config; KG flat by transport,
 * shared both warehouses, from config). This is what the hard-block + the
 * rate-editor consume so the existing `floor[wh].cbm[t][p]` / `floor[wh].kg[t][p]`
 * access pattern is unchanged — only the SOURCE swaps from constant → resolved.
 */
export function buildResolvedFloor(
  cbm: SellFloorCbmConfig,
  kg: SellFloorKgConfig,
): Record<WarehouseId, RateMatrix> {
  const flat = (v: number): Record<ProductId, number | null> => ({
    "1": v, "2": v, "3": v, "4": v,
  });
  // KG is flat by transport, applied to both warehouses (owner: one value/mode).
  const kgMatrix: RateMatrix["kg"] = { "1": flat(kg["1"]), "2": flat(kg["2"]) };
  const forWarehouse = (wh: WarehouseId): RateMatrix => ({
    kg: kgMatrix,
    cbm: {
      "1": flat(cbm[wh]["1"]),
      "2": flat(cbm[wh]["2"]),
    },
  });
  return { "1": forWarehouse("1"), "2": forWarehouse("2") };
}

/** Convenience: resolve BOTH cbm + kg + project to the full `COST_FLOOR`-shaped matrix. */
export async function getResolvedFloor(): Promise<Record<WarehouseId, RateMatrix>> {
  const [cbm, kg] = await Promise.all([getSellFloorCbm(), getSellFloorKg()]);
  return buildResolvedFloor(cbm, kg);
}
