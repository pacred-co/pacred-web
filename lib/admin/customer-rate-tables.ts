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
 *     ⚠ NOTE: the existing /admin/rates/{vip,custom-user,custom-hs} forms
 *       label these BACKWARDS (1=อี้อู). Legacy + this file are correct:
 *       1=กวางโจว. (tracked: fix the other forms separately.)
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
 * Cost floor / ราคาขั้นต่ำ — the minimum sell rate; a customer rate can't be
 * set below this. Display-only in legacy (dev-set), but we surface + soft-
 * enforce it (the modal promises "ราคาที่ไม่สามารถปรับได้ถูกกว่านี้แล้ว").
 * Values from the current prod page (admin-supplied 2026-05-30). Same floor
 * for both warehouses in the legacy build.
 */
export const COST_FLOOR: RateMatrix = {
  kg: {
    "1": { "1": 20, "2": 25, "3": 25, "4": 50 }, // ทางรถ
    "2": { "1": 15, "2": 20, "3": 20, "4": 40 }, // ทางเรือ
  },
  cbm: {
    "1": { "1": 5300, "2": 5500, "3": 5500, "4": 8000 },
    "2": { "1": 3300, "2": 3500, "3": 3500, "4": 7000 },
  },
};

/** The 8 (transport × product) cells, in legacy display order. */
export const RATE_CELLS: { t: TransportId; p: ProductId }[] = TRANSPORTS.flatMap(
  (t) => PRODUCTS.map((p) => ({ t: t.id, p: p.id })),
);
