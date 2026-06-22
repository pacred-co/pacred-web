"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { markAllRead, markRead } from "@/actions/notifications";
import type { NotificationRow } from "@/lib/notifications/types";

const SEVERITY_DOT: Record<NotificationRow["severity"], string> = {
  info:    "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  error:   "bg-red-500",
};

const CAT_ICON: Record<NotificationRow["category"], string> = {
  order:         "🛒",
  payment:       "💸",
  forwarder:     "📦",
  yuan_payment:  "💱",
  wallet:        "👛",
  sales:         "💰",
  system:        "🔔",
  promo:         "🎁",
  sales_digest:  "📊",
  observability: "⚠️",
  booking:       "📅",
  work_chat:     "💬",
};

export function NotificationsList({ initial }: { initial: NotificationRow[] }) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [list, setList] = useState(initial);

  function onClickItem(n: NotificationRow) {
    if (!n.read_at) {
      startTransition(async () => {
        await markRead(n.id);
        setList((prev) => prev.map((m) => (m.id === n.id ? { ...m, read_at: new Date().toISOString() } : m)));
      });
    }
    if (n.link_href) {
      router.push(n.link_href);
    }
  }

  function onMarkAll() {
    startTransition(async () => {
      await markAllRead();
      const now = new Date().toISOString();
      setList((prev) => prev.map((m) => (m.read_at ? m : { ...m, read_at: now })));
    });
  }

  const unreadCount = list.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t("unreadCount", { count: unreadCount })}</p>
        <Button type="button" variant="outline" size="sm" onClick={onMarkAll} disabled={pending || unreadCount === 0}>
          {t("markAllRead")}
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-2">
          <div className="text-2xl" aria-hidden>🔔</div>
          <p className="text-sm font-medium text-foreground">{t("empty")}</p>
          <p className="text-xs text-muted max-w-md mx-auto">
            {t("emptyHint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li
              key={n.id}
              onClick={() => onClickItem(n)}
              className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm cursor-pointer hover:bg-surface-alt/30 transition-colors ${
                !n.read_at ? "border-primary-300" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{CAT_ICON[n.category]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-sm">
                      {!n.read_at && <span className={`inline-block w-2 h-2 rounded-full mr-2 ${SEVERITY_DOT[n.severity]}`} />}
                      {n.title}
                    </h3>
                    <span className="text-[11px] text-muted whitespace-nowrap">
                      {new Date(n.created_at).toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  <p className="text-sm text-muted mt-0.5">{n.body}</p>
                  {n.link_href && (
                    <p className="text-xs text-primary-500 mt-1">→ {t("viewDetails")}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
