"use client";

import { useCallback, useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { getCartCount } from "@/actions/cart-count";
import { CART_CHANGED_EVENT } from "@/lib/cart-changed-event";

/**
 * NavBar cart badge — the live count of the customer's cart. Click → /cart.
 *
 * 🔴 Counts `tb_cart` (owner 2026-08-03 "เอาตัวเลขในตระกร้าขึ้นมาด้วยดิ"). It used
 * to count the REBUILT `cart_items` table, which the D1 cart unification left
 * behind: prod holds 0 rows there vs 334 in tb_cart, so the badge was silently
 * 0 for every customer since the unification — a §0e dead-read. The count runs
 * SERVER-side (actions/cart-count) because tb_cart is service-role-only: a
 * browser query returns 0 however full the cart is.
 *
 * Refresh triggers, in place of realtime — `tb_cart` is a migrated legacy table
 * and is not guaranteed to be in the realtime publication, so a subscription
 * would look wired and never fire:
 *   • mount
 *   • route change  — add-then-navigate (…/cart)
 *   • CART_CHANGED  — add-and-stay (the review page's หยิบใส่รถเข็น)
 *   • window focus  — a tab that added items elsewhere
 *
 * `prefetch` opt-out: when this badge is rendered on a non-protected page
 * (e.g. an authed user landing on /register / / / etc.), Next.js's default
 * viewport-prefetch on the `<Link href="/cart">` fetches the
 * (protected) layout's RSC payload and React 19 hoists the protected CSS
 * bundle as `<link rel="preload">` tags onto the current page — leading to
 * the "preloaded but not used" console warning flood. The NavBar passes
 * `prefetch={false}` in that case; on protected pages it's left
 * undefined (Next.js default viewport prefetch) so back-office nav stays
 * snappy. See docs/learnings/nextjs-16-quirks.md.
 */
export function CartBadge({ prefetch }: { prefetch?: false }) {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      return await getCartCount();
    } catch {
      return 0; // never let a transient failure blank a real count into an error
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = () => {
      refresh().then((n) => {
        if (mounted) setCount(n);
      });
    };

    run();
    window.addEventListener(CART_CHANGED_EVENT, run);
    window.addEventListener("focus", run);
    return () => {
      mounted = false;
      window.removeEventListener(CART_CHANGED_EVENT, run);
      window.removeEventListener("focus", run);
    };
    // pathname: re-count after an add-then-navigate (…→ /cart).
  }, [refresh, pathname]);

  return (
    <Link
      href="/cart"
      prefetch={prefetch}
      aria-label="Cart"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-white/15 transition-colors"
    >
      <ShoppingCart className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white text-primary-700 text-[11px] font-bold px-1">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
