/**
 * calPriceForwarderSumCompany — the legacy forwarder per-row net total.
 *
 * Faithful port of `function.php` L1384-1392. Sums the forwarder charge
 * components, subtracts the discount, and applies the 1% withholding-tax
 * reduction when the customer is a juristic company (`fUserCompany === "1"`).
 *
 * ⚠️ This is a PURE function and lives in `lib/` (NOT a `"use client"` module)
 * on purpose: it was previously copy-pasted into one client component
 * (`forwarder-row-view.tsx`) AND three server components (`[fNo]/page.tsx`,
 * `_tracking/tracking-page.tsx`, `table/page.tsx`). A server component that
 * imported the copy living in the client module threw "Attempted to call
 * calPriceForwarderSumCompany() from the server but it's on the client"
 * (platform incident, 2026-05-28). A single shared lib export is importable
 * from both runtimes, so that boundary error can never recur — and there is
 * one source of truth for the money math.
 */
export function calPriceForwarderSumCompany(
  fUserCompany: string | null,
  fPriceUpdate: number,
  fTotalPrice: number,
  fTransportPrice: number,
  fShippingService: number,
  fDiscount: number,
  priceCrate: number,
  fTransportPriceChnThb: number,
  priceOther: number,
): number {
  let pricePayAll =
    fPriceUpdate +
    fTotalPrice +
    fTransportPrice +
    fShippingService +
    priceCrate +
    fTransportPriceChnThb +
    priceOther -
    fDiscount;
  // juristic (userCompany='1') → 1% WHT reduction (function.php L1389-1391)
  if (fUserCompany === "1") {
    pricePayAll = pricePayAll - pricePayAll * 0.01;
  }
  return pricePayAll;
}
