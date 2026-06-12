"use client";

/**
 * RowLimitSelect — a small "แสดง N" dropdown that drives a URL search param so
 * the server view re-fetches the table with the chosen row count. Each table
 * passes its own `param` (shopN / fwdN / yuanN / payN); changing one preserves
 * the others. scroll:false keeps the page position when the count changes.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ROW_LIMIT_OPTIONS, DEFAULT_ROW_LIMIT } from "./row-limit-options";

export function RowLimitSelect({ param, value }: { param: string; value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = Number(e.target.value);
    const sp = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_ROW_LIMIT) sp.delete(param);
    else sp.set(param, String(next));
    const qs = sp.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted">
      <span className="hidden sm:inline">แสดง</span>
      <select
        value={String(value)}
        onChange={onChange}
        disabled={pending}
        aria-label="จำนวนรายการที่แสดง"
        className="rounded-md border border-border bg-white px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-50 dark:bg-surface"
      >
        {ROW_LIMIT_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
