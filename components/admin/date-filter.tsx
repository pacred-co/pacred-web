"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";

export function AdminDateFilter({
  tab,
  dateFrom,
  dateTo,
}: {
  tab?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(dateFrom ?? "");
  const [to,   setTo]   = useState(dateTo   ?? "");
  const [, startTransition] = useTransition();

  function apply() {
    const params = new URLSearchParams();
    if (tab)  params.set("tab", tab);
    if (from) params.set("date_from", from);
    if (to)   params.set("date_to", to);
    startTransition(() => router.push(`${pathname}?${params}`));
  }

  function clear() {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    setFrom(""); setTo("");
    startTransition(() => router.push(`${pathname}?${params}`));
  }

  const cls =
    "rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted">ตั้งแต่</span>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cls} />
      <span className="text-xs text-muted">ถึง</span>
      <input type="date" value={to}   onChange={(e) => setTo(e.target.value)}   className={cls} />
      <button
        onClick={apply}
        className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
      >
        กรอง
      </button>
      {(from || to) && (
        <button onClick={clear} className="text-xs text-muted hover:text-foreground px-2 py-2">
          ล้าง
        </button>
      )}
    </div>
  );
}
