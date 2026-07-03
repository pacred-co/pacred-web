/**
 * Per-customer shipping-rate constants + types (เดฟ 2026-05-30).
 *
 * Faithful port of the legacy PCS customer-profile "ตั้งค่าเรทขนส่ง" modal
 * (gear icon → #rate-settings). Source verified directly from
 *   <legacy>/member/pcs-admin/users.php  (customRate POST handler, ~L333-593)
 *   <legacy>/member/pcs-admin/include/pages/users/profile.php (#rate-settings)
 *
 * The per-customer override writes the LIVE tables `tb_rate_custom_kg` +
 * `tb_rate_custom_cbm` (keyed userid + sourcewarehouse + rtransporttype +
 * rproductstype) — these are exactly what the legacy forwarder price engine
 * (`calPriceForwarder()` in include/function.php) reads as the SVIP tier:
 *   per-order manual ▸ per-user (tb_rate_custom_*) ▸ VIP-group (tb_rate_vip_*) ▸ general.
 *
 * Encodings (legacy, do not "fix"):
 *   sourceWarehouse  '1' = กวางโจว (Guangzhou) · '2' = อี้อู (Yiwu)
 *     (FIXED 2026-06-05: /admin/rates/custom-user + custom-hs forms had these
 *       labelled BACKWARDS (1=อี้อู) → admin edited the wrong warehouse's rate.
 *       Both now match legacy + this file: 1=กวางโจว, 2=อี้อู.)
 *   rTransportType   '1' = ทางรถ (truck/EK) · '2' = ทางเรือ (sea/SEA)
 *       per-user override supports ONLY truck + sea (no air — matches legacy).
 *   rProductsType    '1' ทั่วไป · '2' มอก. · '3' อย./น้ำยา · '4' พิเศษ
 */

export type WarehouseId = "1" | "2";
export type TransportId = "1" | "2";
export type ProductId = "1" | "2" | "3" | "4";

export const WAREHOUSES: { id: WarehouseId; label: string; short: string }[] = [
  { id: "1", label: "โกดังกวางโจว", short: "กวางโจว" },
  { id: "2", label: "โกดังอี้อู", short: "อี้อู" },
];

export const TRANSPORTS: { id: TransportId; label: string; short: string }[] = [
  { id: "1", label: "ขนส่งทางรถ", short: "รถ" },
  { id: "2", label: "ขนส่งทางเรือ", short: "เรือ" },
];

export const PRODUCTS: { id: ProductId; label: string }[] = [
  { id: "1", label: "ทั่วไป" },
  { id: "2", label: "มอก." },
  { id: "3", label: "อย./น้ำยา" },
  { id: "4", label: "พิเศษ" },
];

/** A full rate matrix: [transport][product] → value, for both KG and CBM. */
export type RateMatrix = {
  kg: Record<TransportId, Record<ProductId, number | null>>;
  cbm: Record<TransportId, Record<ProductId, number | null>>;
};

/** A customer's full per-warehouse rate state (reader output). */
export type CustomerRateMatrix = {
  isSvip: boolean;
  byWarehouse: Record<WarehouseId, RateMatrix>;
  lastAdmin: Record<WarehouseId, string | null>;
};

/** Build an empty matrix (all null). */
export function emptyMatrix(): RateMatrix {
  const blank = (): Record<TransportId, Record<ProductId, number | null>> => ({
    "1": { "1": null, "2": null, "3": null, "4": null },
    "2": { "1": null, "2": null, "3": null, "4": null },
  });
  return { kg: blank(), cbm: blank() };
}

/**
 * Default starting rates — pre-fill the form when a customer has NO custom
 * row yet. Verbatim from legacy users.php L339-374 (the `if($sourceWarehouse==1)`
 * block). Index: [transport '1'รถ|'2'เรือ][product '1'-'4'].
 */
export const DEFAULT_START: Record<WarehouseId, RateMatrix> = {
  // กวางโจว
  "1": {
    kg: {
      "1": { "1": 40, "2": 50, "3": 60, "4": 140 }, // ทางรถ
      "2": { "1": 30, "2": 45, "3": 50, "4": 130 }, // ทางเรือ
    },
    cbm: {
      "1": { "1": 7500, "2": 8000, "3": 8800, "4": 14000 },
      "2": { "1": 5000, "2": 6300, "3": 6800, "4": 13000 },
    },
  },
  // อี้อู
  "2": {
    kg: {
      "1": { "1": 45, "2": 55, "3": 65, "4": 145 },
      "2": { "1": 40, "2": 50, "3": 60, "4": 140 },
    },
    cbm: {
      "1": { "1": 8000, "2": 8500, "3": 9500, "4": 14500 },
      "2": { "1": 5500, "2": 6500, "3": 7000, "4": 14500 },
    },
  },
};

/**
 * Sell floor / ราคาขายขั้นต่ำ — the LOWEST a customer may be sold at; a sell
 * rate (per-customer or manual override) can't be set below this. Now HARD-
 * enforced on the save paths (ภูม 2026-06-19: "เผื่อพนักงานตั้งผิดจะได้กดไม่ได้ ·
 * จะ VIP แค่ไหนก็ห้ามขายต่ำกว่าราคาที่ภูมิบอกไว้เลย").
 *
 * ── CBM floor (฿/คิว) — owner-set, PER WAREHOUSE × mode, same for every
 *    product type (ภูม 2026-06-19, confirmed "ค่าเดียวทุกประเภทสินค้า") ─────────
 *      กวางโจว (1):  รถ 4,900 · เรือ 2,900
 *      อี้อู   (2):  รถ 5,500 · เรือ 2,900
 *    (MOMO ต้นทุนจริง = 2,500/คิว · floor เรือ 2,900 = ต้นทุน + margin ขั้นต่ำ.)
 *    These REPLACE the older per-product cost figures (5300/3300… were stale).
 *
 * ── KG floor (฿/กก.) — owner-set FLAT value per transport, same for every
 *    product type + BOTH warehouses (owner 2026-07-03: "ต่ำสุด รถ 17 เรือ 7"),
 *    matching how the CBM floor is "ค่าเดียวทุกประเภทสินค้า":
 *      รถ (transport '1') = 17 · เรือ (transport '2') = 7
 *    (was the old per-product legacy table รถ {20,25,25,50}/เรือ {15,20,20,40}.)
 *    A 0 = "ไม่คิดตามหน่วยนี้" → never below floor.
 *
 * ── Both floors are now DB-OVERRIDABLE by ultra (Ultra Admin Z) WITHOUT a
 *    deploy — the constants below are only the DEFAULT / fallback. The live
 *    resolver + upsert live in lib/admin/sell-floor-config.ts (CBM key
 *    `pricing.sell_rate_floor_cbm`, KG key `pricing.sell_rate_floor_kg`) +
 *    actions/admin/sell-floor.ts (adminUpdateSellFloorCbm/Kg). NO migration —
 *    the config row is created on the first ultra-save. `KG_FLOOR_DEFAULT` /
 *    `COST_FLOOR[wh].kg` are the fallback source the resolver reads cell-by-cell
 *    when the key is absent/partial.
 */
/** Build a floor row: one flat value for all 4 product types. */
const floorFlat = (v: number): Record<ProductId, number | null> => ({
  "1": v, "2": v, "3": v, "4": v,
});
const cbmFlat = floorFlat;
/**
 * KG sell-floor DEFAULT — flat per transport, shared BOTH warehouses (owner:
 * รถ 17 · เรือ 7). Now the DB-overridable default (see `SELL_FLOOR_KG_KEY`).
 */
export const KG_FLOOR_DEFAULT: RateMatrix["kg"] = {
  "1": floorFlat(17), // ทางรถ
  "2": floorFlat(7), // ทางเรือ
};
export const COST_FLOOR: Record<WarehouseId, RateMatrix> = {
  // กวางโจว — KG รถ 17/เรือ 7 · CBM รถ 4,900/เรือ 2,900
  "1": {
    kg: KG_FLOOR_DEFAULT,
    cbm: { "1": cbmFlat(4900), "2": cbmFlat(2900) },
  },
  // อี้อู — KG รถ 17/เรือ 7 · CBM รถ 5,500/เรือ 2,900
  "2": {
    kg: KG_FLOOR_DEFAULT,
    cbm: { "1": cbmFlat(5500), "2": cbmFlat(2900) },
  },
};

/** The 8 (transport × product) cells, in legacy display order. */
export const RATE_CELLS: { t: TransportId; p: ProductId }[] = TRANSPORTS.flatMap(
  (t) => PRODUCTS.map((p) => ({ t: t.id, p: p.id })),
);
