/**
 * Canonical rate-matrix dimension constants. V-D2 (rate/pricing axis).
 *
 * The legacy PCS pricing engine keys every general/VIP/HS rate cell on a
 * three-axis tuple — **source-warehouse × transport-type × product-type** —
 * stored as single-char codes (`sourcewarehouse` / `rgtransporttype` /
 * `rgproductstype` on `tb_rate_*`, mirrored by `fProductsType` on
 * `tb_forwarder`). Those labels were copy-pasted into ~6 admin rate/cost
 * editors (general-rate-matrix · rates/custom-user · rates/custom-hs ·
 * report-cnt cost-update-view · forwarders edit freight-breakdown). This is
 * the ONE canonical home — every editor imports from here.
 *
 * Ground truth = legacy `member/pcs-admin/include/function.php`:
 *   - `nameProductsType()`   L640-650  → 1=ทั่วไป 2=มอก. 3=อย. 4=พิเศษ
 *   - `nameSourceWarehouse()` L669-678 → 1=กวางโจว 2=อี้อู
 *   - `nameTransportType()`  L651-659  → 1=รถ 2=เรือ
 *   - `nameRefPrice()`       L1074-082 → 1=น้ำหนัก 2=ปริมาตร
 *
 * Pacred extensions (kept — they exist live in the Pacred rate UI today,
 * flagged so a future audit knows they are NOT in the legacy switch):
 *   - product-type "5" = ควบคุมพิเศษ  (appears in report-cnt cost editor +
 *     forwarders edit breakdown — a 5th rate band the cost sheet uses)
 *   - transport "3" = อากาศ            (air freight rate lane — legacy
 *     nameTransportType only had รถ/เรือ; Pacred added air)
 *
 * NOTE — distinct from `lib/warehouse/cargo-type.ts`. That module is the
 * *parcel goods-classification* taxonomy (legacy API A/M/X/O/Z + warehouse
 * manifest G/T/F → canonical general/electrical/food_drug/brand/controlled),
 * a per-shipment clearance attribute. THIS module is the *rate-pricing*
 * product type (1-5) the price engine multiplies against. They overlap
 * conceptually (มอก./อย. appear in both) but are stored in different columns
 * and serve different layers — do not merge them.
 */

// ── Source warehouse (sourcewarehouse / fWarehouse) ──────────────────────────
export type RateWarehouseCode = "1" | "2";
export const RATE_WAREHOUSE_CODES: readonly RateWarehouseCode[] = ["1", "2"] as const;
/** Plain label — legacy nameSourceWarehouse(). 1=กวางโจว 2=อี้อู. */
export const RATE_WAREHOUSE_LABEL: Record<RateWarehouseCode, string> = {
  "1": "กวางโจว",
  "2": "อี้อู",
};

// ── Transport type (rgtransporttype / fTransportType) ────────────────────────
export type RateTransportCode = "1" | "2" | "3";
export const RATE_TRANSPORT_CODES: readonly RateTransportCode[] = ["1", "2", "3"] as const;
/** Plain label (no emoji) — legacy nameTransportType() + Pacred air (3). */
export const RATE_TRANSPORT_LABEL: Record<RateTransportCode, string> = {
  "1": "รถ",
  "2": "เรือ",
  "3": "อากาศ", // Pacred extension — not in legacy nameTransportType()
};
/** Emoji-prefixed label used by the rate-matrix UI cards. */
export const RATE_TRANSPORT_LABEL_EMOJI: Record<RateTransportCode, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ อากาศ",
};

// ── Product type (rgproductstype / fProductsType) ────────────────────────────
// Legacy switch (nameProductsType) only defines 1-4. Pacred's cost sheet adds
// "5" = ควบคุมพิเศษ. Two exports: the legacy-faithful 1-4 set and the extended
// 1-5 set, so each editor picks the one matching its column's value domain.
export type RateProductCode = "1" | "2" | "3" | "4";
export type RateProductCodeExt = RateProductCode | "5";

/** Legacy-faithful 1-4 (nameProductsType). Used by general/VIP/HS rate editors. */
export const RATE_PRODUCT_CODES: readonly RateProductCode[] = ["1", "2", "3", "4"] as const;
export const RATE_PRODUCT_LABEL: Record<RateProductCode, string> = {
  "1": "ทั่วไป",
  "2": "มอก.",
  "3": "อย.",
  "4": "พิเศษ",
};

/** Extended 1-5 — adds ควบคุมพิเศษ (cost-sheet 5th band). Used by cost editors. */
export const RATE_PRODUCT_CODES_EXT: readonly RateProductCodeExt[] = ["1", "2", "3", "4", "5"] as const;
export const RATE_PRODUCT_LABEL_EXT: Record<RateProductCodeExt, string> = {
  ...RATE_PRODUCT_LABEL,
  "5": "ควบคุมพิเศษ", // Pacred extension — not in legacy nameProductsType()
};

// ── Reference-price basis (refPrice) ─────────────────────────────────────────
export type RefPriceCode = "1" | "2" | "3";
/** Legacy nameRefPrice() (1/2) + Pacred compare (3). */
export const REF_PRICE_LABEL: Record<RefPriceCode, string> = {
  "1": "น้ำหนัก",
  "2": "ปริมาตร",
  "3": "เปรียบเทียบ", // Pacred extension — not in legacy nameRefPrice()
};
