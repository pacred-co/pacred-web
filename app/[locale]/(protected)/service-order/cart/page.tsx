import { redirect } from "next/navigation";

/**
 * `/service-order/cart` — D1 cart unification (§0d / split-brain fix).
 *
 * There used to be TWO customer cart UIs reading the same `tb_cart`:
 *   - `/cart`              — the faithful, Pacred-branded cart (ปอน 2026-05-26).
 *                            Its checkout calls `submitCartOrder` directly and
 *                            carries the ship-by eligibility + maomao + tax-doc
 *                            selector. This is the canonical one (sidebar +
 *                            footer + left-menu all link here).
 *   - `/service-order/cart` — a second shell (CartManager → placeServiceOrder,
 *                            which itself just DELEGATES to submitCartOrder). It
 *                            held no capability `/cart` lacks → pure duplication.
 *
 * The header cart badge + the search-bar cart CTA were pointing at this second
 * UI while the sidebar/footer pointed at `/cart` — a split-brain. All cart
 * entry points are now unified on `/cart`; this route redirects there so any
 * old bookmark / deep-link still lands on the live cart.
 *
 * `tb_cart` reads are untouched — they live in the faithful `/cart` page +
 * `actions/cart.ts` (listCart / submitCartOrder).
 */
export default async function ServiceOrderCartPage() {
  redirect("/cart");
}
