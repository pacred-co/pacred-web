import CartPage from "../page";
import { CartAddFocusEffect } from "./cart-add-focus-effect";

/**
 * `/cart/add` — the legacy "เพิ่มสินค้าในรถเข็น" sidebar entry.
 *
 * A FAITHFUL 1:1 TRANSCRIPTION of the legacy PCS Cargo
 * `member/cart.php` when reached via `/cart/add/`
 * (D1 / ADR-0017 · faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Why this exists ────────────────────────────────────────
 * Legacy Apache rewrite (`member/.htaccess`):
 *
 *   RewriteRule ^cart/(.*)/$ cart.php?page=$1
 *   RewriteRule ^cart/$     cart.php
 *
 * Means `/cart/add/` and `/cart/` are served by the SAME PHP file —
 * `cart.php` just branches on `$_GET["page"]`. The ONLY difference
 * between the two URLs is the L764-777 inline `<script>` block that
 * fires when `?page=add`:
 *
 *   $("#input-search").trigger("focus");
 *   $("#focus-search").addClass("focus-search");
 *   $("#fixed-top-body").addClass("fixed-top-body");
 *
 * — i.e. auto-focus the search input + pin the search bar to the top.
 * That's the entire feature.
 *
 * So this Pacred route renders the EXACT SAME `CartPage` component
 * as `/cart` (by importing + invoking it — Server Components compose
 * cleanly), plus mounts `<CartAddFocusEffect />` which is the React
 * port of the legacy auto-focus `<script>`. No data is re-fetched
 * unnecessarily — the auth + chrome + cart queries that `CartPage`
 * runs are already wrapped in React `cache()` / `unstable_cache`
 * (Sprint-8c), so calling it from two routes does not duplicate I/O.
 *
 * ── Why not just `redirect("/cart")` ──────────────────────
 * Doing so loses the auto-focus-search behaviour the legacy sidebar
 * link promises (`<a href="cart/add/">เพิ่มสินค้าในรถเข็น</a>` —
 * "add product to cart") and changes the URL the user sees, both of
 * which would diverge from the faithful port (ADR-0017 + the "copy
 * 100% first" owner rule).
 *
 * ── Where the actual "add to cart" mutation lives ───────────
 * The legacy `cart.php` L3-109 hosts TWO POST handlers:
 *   - `addCart`     — multi-row form from `search.php` results
 *   - `addCartURL`  — single-product-by-URL form
 * Both INSERT into `tb_cart`. In Pacred those mutations live in
 * `actions/cart.ts` as Server Actions invoked by the `/search` UI
 * (the user types/pastes a URL into the search input that this page
 * auto-focuses → submits to `/search` → clicks "เพิ่มลงรถเข็น" on the
 * product → Server Action INSERTs to `tb_cart`).
 */
export const dynamic = "force-dynamic";

export default async function CartAddPage() {
  return (
    <>
      {/* Mount BEFORE the page so the effect's tick lands after
          SearchBar has hydrated its <input name="url">. Order does
          not strictly matter (useEffect runs post-hydration regardless),
          but keeping it visually-first reflects the legacy script tag
          position relative to cart.php's content. */}
      <CartAddFocusEffect />
      {await CartPage()}
    </>
  );
}
