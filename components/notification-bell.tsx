"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * NavBar notification bell — fetches unread count on mount and listens
 * for realtime new-row INSERTs to bump the badge. Click → /notifications.
 *
 * `prefetch` opt-out: same rationale as CartBadge — the `<Link
 * href="/notifications">` viewport-prefetch pulls in the (protected) layout
 * RSC payload + its 25+ stylesheet bundle, which React 19 hoists as preload
 * links onto whatever page NavBar is rendering on. The NavBar passes
 * `prefetch={false}` when rendering outside the protected route group.
 */
export function NotificationBell({ prefetch }: { prefetch?: false }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function refresh() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (mounted) setCount(0);
        return;
      }
      const [totalRes, readRes] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", user.id),
        supabase.from("notification_reads").select("notification_id", { count: "exact", head: true }).eq("profile_id", user.id),
      ]);
      if (!mounted) return;
      setCount(Math.max(0, (totalRes.count ?? 0) - (readRes.count ?? 0)));
    }

    refresh();

    // Realtime listener for new notifications addressed to this user
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !mounted) return;
      channel = supabase
        .channel(`notif-bell-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `profile_id=eq.${user.id}` },
          () => refresh(),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notification_reads", filter: `profile_id=eq.${user.id}` },
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
      href="/notifications"
      prefetch={prefetch}
      aria-label="Notifications"
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-white/15 transition-colors"
    >
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-white text-primary-700 text-[10px] font-bold px-1">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
