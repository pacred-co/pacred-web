/**
 * "the cart changed" ping — browser-only, no network.
 *
 * The navbar badge lives in `<NavBar>`, which survives client-side navigation,
 * so it has no way to learn that a DIFFERENT component just added a row to
 * tb_cart. Before this the badge only refreshed on mount, and the flows that
 * add-and-stay (the review page's หยิบใส่รถเข็น) left a stale number on screen.
 *
 * Deliberately NOT Supabase realtime: `tb_cart` is the migrated legacy table
 * and is not guaranteed to be in the realtime publication, so a subscription
 * would silently never fire — the exact kind of "looks wired, does nothing"
 * the badge is already recovering from.
 */
export const CART_CHANGED_EVENT = "pacred:cart-changed";

/** Call right after a successful add/remove so the navbar badge catches up. */
export function notifyCartChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}
