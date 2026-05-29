/**
 * Pure helper — compute the wallet-debit total for a tb_header_order row.
 *
 * Lives here (NOT in `actions/admin/service-orders-tb.ts`) because the
 * test harness uses plain `tsx` — importing the action file pulls in
 * `lib/supabase/admin.ts` which `import "server-only"` (Next.js's
 * runtime-only marker · explodes outside `next start`). Keeping the pure
 * function in its own file lets the test exercise it directly.
 *
 * Source of truth (legacy):
 *   `pcs-admin/pay-users.php` L158 — pricePay =
 *     ((hTotalPriceCHN + hShippingCHN) * hRate) + hShippingService
 *   `pcs-admin/shops.php`     L1124-1125 — same formula, computed at
 *     status-2 (update2) + stored into `htotalpriceuser`
 *   `pcs-admin/include/pages/shops/repayItem.php` L107-126 — UPDATEs
 *     `htotalpriceuser` when items are refunded
 *
 * We prefer the stored `htotalpriceuser` so refund adjustments propagate
 * + no recompute drift if hrate changed since the quote was issued. The
 * recompute is a defensive fallback for in-flight orders where update2
 * hasn't finalised yet.
 */

export type ShopOrderDebitInput = {
  htotalpriceuser: number | string | null | undefined;
  htotalpricechn?: number | string | null | undefined;
  hshippingchn?: number | string | null | undefined;
  hshippingservice?: number | string | null | undefined;
  hrate?: number | string | null | undefined;
};

/**
 * Returns the THB debit amount rounded to 2 decimal places, or NaN if
 * neither the stored total nor the recompute produces a positive number.
 *
 * Callers MUST treat NaN as "refuse the debit" — silently substituting 0
 * would let admin advance the order with zero cash collected.
 */
export function computeShopOrderDebitTotal(row: ShopOrderDebitInput): number {
  const stored = Number(row.htotalpriceuser);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.round(stored * 100) / 100;
  }
  // Fallback — recompute. Used when htotalpriceuser is null/0 (in-flight
  // order that update2 never finalised — rare on prod, but defensive).
  const chn = Number(row.htotalpricechn);
  const ship = Number(row.hshippingchn);
  const svc = Number(row.hshippingservice);
  const rate = Number(row.hrate);
  if (
    !Number.isFinite(chn) ||
    !Number.isFinite(ship) ||
    !Number.isFinite(svc) ||
    !Number.isFinite(rate)
  ) {
    return NaN;
  }
  const computed = (chn + ship) * rate + svc;
  if (!Number.isFinite(computed) || computed <= 0) return NaN;
  return Math.round(computed * 100) / 100;
}
