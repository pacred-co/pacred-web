"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";

export function ForwardersSearchBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q,        setQ]        = useState(sp.get("q") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("date_from") ?? "");
  const [dateTo,   setDateTo]   = useState(sp.get("date_to") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (sp.get("status")) params.set("status", sp.get("status")!);
    if (q.trim())        params.set("q", q.trim());
    if (dateFrom)        params.set("date_from", dateFrom);
    if (dateTo)          params.set("date_to", dateTo);
    startTransition(() => router.push(`${pathname}?${params}`));
  }

  function reset() {
    setQ(""); setDateFrom(""); setDateTo("");
    const params = new URLSearchParams();
    if (sp.get("status")) params.set("status", sp.get("status")!);
    startTransition(() => router.push(`${pathname}?${params}`));
  }

  const hasFilter = q || dateFrom || dateTo;

  const inputCls = "rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา F-No, ชื่อ, เบอร์, tracking..."
          className={`${inputCls} pl-8 w-64`}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted">ตั้งแต่</span>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted">ถึง</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
      >
        {pending ? "กำลังค้นหา..." : "ค้นหา"}
      </button>
      {hasFilter && (
        <button type="button" onClick={reset} className="text-xs text-muted hover:text-foreground px-2 py-2">
          ล้าง
        </button>
      )}
    </form>
  );
}
