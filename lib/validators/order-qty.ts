/**
 * ORDER QUANTITY — the ONE ceiling, for everyone.
 *
 * 🔴 owner 2026-07-17: "ปลดเพดานไปเป็นไม่จำกัดเลยครับ เพราะเราจะมีลูกค้าเจ้าใหญ่เข้ามา
 * หรือเจ้ากลาง แต่สั่งจำนวนเยอะ เป็นล้านชิ้น จะทำยังไงหละครับ อย่าให้เกิดขึ้นอีกนะครับ
 * และกับทุกคนครับ ทั้งลูกค้า และ พนักงาน"
 *
 * WHAT WAS THERE (all invented, none of them a real limit):
 *   customer search page   maxQty={999}                       ← hardcoded at the call site
 *   customer multi-pick    Math.min(99999, …)
 *   admin   multi-pick     Math.min(99999, …) · max={Math.max(stock, 9999)}
 *   admin   single-pick    max={9999} · Math.min(9999, …)
 * Prod proof of the damage: across the WHOLE tb_cart the largest quantity any customer
 * ever self-served is **150**, and not one row ever exceeded 999 — while admin-keyed
 * tb_order rows reach 10,000. 1688 is a WHOLESALE site; the wall quietly amputated the
 * main channel, and (worse) it reported itself as "ยังไม่ใส่ราคา CNY" so nobody could tell.
 *
 * WHAT IS REAL: `tb_cart.camount` / `tb_order.camount` are `integer` (int32), so the only
 * true ceiling is int32. MAX_ORDER_QTY sits just under it, leaving headroom for a `+1`
 * stepper and any intermediate arithmetic to stay inside int32. A million pieces — or a
 * billion — passes. Money totals are numeric(14,2) (mig 0196) and are guarded separately
 * by MONEY_COL_MAX in actions/cart.ts.
 *
 * STOCK IS INFORMATION, NOT A LIMIT: a 1688 listing's stock number is what the seller
 * happens to have staged today; a factory restocks on demand. Capping the customer at it
 * would block exactly the big orders this change is for. Show it, never enforce it.
 *
 * THE RULE FOR EVERY SURFACE: the input's `max`, the clamp while typing, and the submit
 * validation must all come from HERE. A number the submit would reject must be impossible
 * to type — that mismatch is what produced the invisible wall in the first place.
 */

/** The only real quantity ceiling: int32 (the DB column) with stepper headroom. */
export const MAX_ORDER_QTY = 2_000_000_000;

/** The smallest orderable quantity (a listing's own minimum may be higher). */
export const MIN_ORDER_QTY = 1;

/**
 * Clamp a typed/parsed quantity into the orderable range.
 *
 * @param n    the raw value (may be NaN / negative / fractional / absurd)
 * @param min  the listing's minimum order qty (起订量), default 1
 * @param allowZero true in multi-pick grids, where 0 means "not picked"
 */
export function clampOrderQty(n: unknown, min = MIN_ORDER_QTY, allowZero = false): number {
  const raw = Math.floor(Number(n));
  if (!Number.isFinite(raw)) return allowZero ? 0 : Math.max(MIN_ORDER_QTY, min);
  const floor = allowZero ? 0 : Math.max(MIN_ORDER_QTY, min);
  if (raw < floor) return floor;
  if (raw > MAX_ORDER_QTY) return MAX_ORDER_QTY;
  return raw;
}

/** True when a quantity is orderable (0 allowed only in a multi-pick grid). */
export function isOrderQtyValid(n: number, min = MIN_ORDER_QTY, allowZero = false): boolean {
  if (!Number.isInteger(n)) return false;
  if (allowZero && n === 0) return true;
  return n >= Math.max(MIN_ORDER_QTY, min) && n <= MAX_ORDER_QTY;
}
