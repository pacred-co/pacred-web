/**
 * Pure shop-order (ฝากสั่งซื้อ) payable-amount formula.
 *
 * THE FORMULA — faithful to legacy shops.php's per-order total:
 *
 *   payableThb = (htotalpricechn + hshippingchn) × hrate + hshippingservice
 *
 *   - htotalpricechn   = goods subtotal in ¥
 *   - hshippingchn     = China-side shipping in ¥
 *   - hrate            = ¥→฿ exchange rate snapshot for the order
 *   - hshippingservice = Thai-side service/shipping fee already in ฿
 *
 * i.e. the ¥ goods+china-shipping are FX-converted, then the ฿ service fee
 * is added on top (NOT FX-converted — it is already baht).
 *
 * This single function is the source of truth for that math, used by:
 *   - the bulk-pay totals map fed to <BulkPayBar>
 *   - the per-card "ราคาที่ต้องชำระ" display on the orders list
 * (both in app/[locale]/(protected)/service-order/page.tsx — the formula
 * was duplicated there; this dedups it so the displayed price and the
 * bulk-pay total can never drift apart).
 *
 * NOTE — these numbers are DISPLAY-ONLY. payServiceOrderFromWallet
 * re-verifies ownership/balance/idempotency + recomputes the charge
 * server-side per row, so this is never the money boundary.
 */

/** The order fields needed to compute its baht total (PG numerics arrive as string|null). */
export type ShopOrderTotalParts = {
  htotalpricechn: number | string | null;
  hshippingchn: number | string | null;
  hrate: number | string | null;
  hshippingservice: number | string | null;
};

/** Coerce a PG numeric (number / string / null / undefined / NaN) to a finite number, default 0. */
function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Baht amount a customer must pay for one ฝากสั่งซื้อ order.
 *
 * Behavior-preserving extract of the formula duplicated in service-order
 * page.tsx (totalsMap L300-307 + OrderCard.pricePayNum L492-495). Returns a
 * raw float (the callers format with `numberFormat2`); NOT pre-rounded so the
 * extract is byte-identical to the inline arithmetic it replaces.
 */
export function computeShopOrderPayableThb(parts: ShopOrderTotalParts): number {
  return (num(parts.htotalpricechn) + num(parts.hshippingchn)) * num(parts.hrate) + num(parts.hshippingservice);
}

/**
 * Whether an order is payable-from-wallet (and thus selectable in the bulk-pay
 * bar). Legacy shops.php: only hStatus='2' ("รอชำระเงิน") orders can be paid.
 * Extract of the inline `r.hstatus === "2"` filter (page.tsx L308).
 */
export function isShopOrderPayable(hstatus: string | null | undefined): boolean {
  return hstatus === "2";
}
