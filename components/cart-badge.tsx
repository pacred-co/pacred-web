"use client";

import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * NavBar cart badge — fetches current user's cart_items count on mount
 * and listens for realtime INSERT/DELETE to keep the badge in sync.
 * Click → /cart (the faithful cart · D1 cart unification — the second
 * UI at /service-order/cart now redirect()s here).
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

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    // Local-session read helper — uses getSession() (no refresh attempt) so
    // a stale cookie jar doesn't fire the SDK's "Invalid Refresh Token"
    // AuthApiError into the dev console. Authoritative auth still happens
    // server-side; this client lookup is only for the visible badge count.
    async function currentUserId(): Promise<string | null> {
      try {
        const { data } = await supabase.auth.getSession();
        return data.session?.user?.id ?? null;
      } catch {
        return null;
      }
    }

    async function refresh() {
      const userId = await currentUserId();
      if (!userId) {
        if (mounted) setCount(0);
        return;
      }
      const { count: n } = await supabase
        .from("cart_items")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId);
      if (mounted) setCount(n ?? 0);
    }

    refresh();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    currentUserId().then((userId) => {
      if (!userId || !mounted) return;
      channel = supabase
        .channel(`cart-badge-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "cart_items", filter: `profile_id=eq.${userId}` },
          () => refresh(),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "cart_items", filter: `profile_id=eq.${userId}` },
          () => refresh(),
        )
        .subscribe();
    });

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Link
      href="/cart"
      prefetch={prefetch}
      aria-label="Cart"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-white/15 transition-colors"
    >
      <ShoppingCart className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white text-primary-700 text-[10px] font-bold px-1">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
