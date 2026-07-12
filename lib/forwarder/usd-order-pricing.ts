/**
 * usd-order-pricing — the pure conversions for a ฝากสั่งซื้อ (shop order)
 * that was OPENED in a foreign currency (USD/…). The ¥-equivalent `cprice`
 * stays the single source of truth pricing runs on; these helpers let the
 * admin edit the order in its REAL currency ($ price/piece + บาท/USD rate)
 * without corrupting the ¥ (owner P22353).
 *
 * The supplier ¥/foreign ratio is FIXED from the ORIGINAL rows and NEVER
 * changes when the operator edits the customer rate:
 *
 *   yuanPerUnit = Σ original ¥  ÷  Σ original foreign amount      (hRate cancels)
 *
 * A per-line foreign price → its ¥-equivalent:   ¥ = round2(foreign × yuanPerUnit)
 * The effective ¥→฿ rate the calc + header use:  effRate = bahtPerUnit ÷ yuanPerUnit
 * so the ฿ total is exactly:
 *   ฿ = ¥ × effRate = (foreign × yuanPerUnit) × (bahtPerUnit ÷ yuanPerUnit) = foreign × bahtPerUnit.
 *
 * At the DEFAULT rate (bahtPerUnit = the original (Σ¥ × hRate) ÷ Σforeign),
 * effRate collapses back to hRate exactly → so a ¥ order (or an untouched USD
 * order) keeps byte-identical money. Pure + client-safe (NO server-only): the
 * client uses it for the live editor, and the server re-derives on submit.
 */

/** Round to 2 decimals (money) — nudged for float safety. */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The FIXED ¥-per-1-foreign-unit ratio, from the ORIGINAL rows.
 *   yuanPerUnit = Σ original ¥  ÷  Σ original foreign amount
 * Returns null when it cannot be derived (non-positive / non-finite inputs) —
 * the caller then treats the order as a plain ¥ order.
 */
export function deriveYuanPerUnit(
  originalYuanSubtotal: number,
  foreignSubtotal: number,
): number | null {
  if (!Number.isFinite(originalYuanSubtotal) || !Number.isFinite(foreignSubtotal)) return null;
  if (originalYuanSubtotal <= 0 || foreignSubtotal <= 0) return null;
  return originalYuanSubtotal / foreignSubtotal;
}

/**
 * A foreign price/piece → its ¥-equivalent (the value stored as `cprice`,
 * the source of truth pricing runs on). round2 to match the stored ¥ column.
 */
export function foreignToYuan(foreign: number, yuanPerUnit: number): number {
  if (!Number.isFinite(foreign) || !Number.isFinite(yuanPerUnit) || yuanPerUnit <= 0) return 0;
  if (foreign < 0) return 0;
  return round2(foreign * yuanPerUnit);
}

/**
 * A ¥ price → the foreign price/piece (the DEFAULT shown in the $ input, when
 * no original per-line amount is available). round2 for a clean display value.
 */
export function yuanToForeign(yuan: number, yuanPerUnit: number): number {
  if (!Number.isFinite(yuan) || !Number.isFinite(yuanPerUnit) || yuanPerUnit <= 0) return 0;
  if (yuan < 0) return 0;
  return round2(yuan / yuanPerUnit);
}

/**
 * The effective ¥→฿ rate to feed the net-total calc + write to the header,
 * given the operator-set บาท/foreign-unit rate. NOT rounded — the ¥→฿ header
 * rate legitimately carries >2dp precision (it is derived, not typed).
 *   effRate = bahtPerUnit ÷ yuanPerUnit
 * so ฿ total = ¥ × effRate = foreign × bahtPerUnit exactly.
 */
export function effRateFromForeignRate(bahtPerUnit: number, yuanPerUnit: number): number {
  if (!Number.isFinite(bahtPerUnit) || !Number.isFinite(yuanPerUnit) || yuanPerUnit <= 0) return 0;
  return bahtPerUnit / yuanPerUnit;
}
