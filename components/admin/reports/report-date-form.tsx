"use client";

/**
 * Gap #8 — Report date-range form. Wraps the existing date-filter pattern
 * but adds support for extra preserved query params (e.g. report-specific
 * filter chips). URL-shareable via ?from=YYYY-MM-DD&to=YYYY-MM-DD.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DateRange } from "@/lib/admin/reports/types";

export function ReportDateForm({
  pathname,
  range,
  extraQuery,
}: {
  pathname:    string;
  range:       DateRange;
  extraQuery?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(range.from);
  const [to,   setTo]   = useState(range.to);
  const [, startTransition] = useTransition();

  function apply() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to)   params.set("to", to);
    for (const [k, v] of Object.entries(extraQuery ?? {})) {
      if (v) params.set(k, v);
    }
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
    </div>
  );
}
