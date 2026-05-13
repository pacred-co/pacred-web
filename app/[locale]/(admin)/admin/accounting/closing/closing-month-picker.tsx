"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const MIN_YEAR = 2021;

export function ClosingMonthPicker({
  year,
  month,
  tab,
}: {
  year:  number;
  month: number;
  tab:   string;
}) {
  const router = useRouter();
  const [y, setY] = useState(year);
  const [m, setM] = useState(month);
  const [, startTransition] = useTransition();

  const now       = new Date();
  const maxYear   = now.getFullYear();
  const years     = Array.from({ length: maxYear - MIN_YEAR + 1 }, (_, i) => maxYear - i);

  function apply() {
    const params = new URLSearchParams({ year: String(y), month: String(m), tab });
    startTransition(() => router.push(`/admin/accounting/closing?${params}`));
  }

  function shift(delta: number) {
    let newY = y;
    let newM = m + delta;
    if (newM < 1)   { newM = 12; newY = Math.max(MIN_YEAR, y - 1); }
    if (newM > 12)  { newM = 1;  newY = Math.min(maxYear, y + 1); }
    setY(newY);
    setM(newM);
    const params = new URLSearchParams({ year: String(newY), month: String(newM), tab });
    startTransition(() => router.push(`/admin/accounting/closing?${params}`));
  }

  const cls =
    "rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">รอบเดือน</span>

        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm hover:bg-surface-alt"
          aria-label="เดือนก่อนหน้า"
        >
          ←
        </button>

        <select value={y} onChange={(e) => setY(Number(e.target.value))} className={cls}>
          {years.map((yr) => (
            <option key={yr} value={yr}>{yr}</option>
          ))}
        </select>

        <select value={m} onChange={(e) => setM(Number(e.target.value))} className={cls}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
            <option key={mm} value={mm}>
              {mm.toString().padStart(2, "0")} — {new Date(2000, mm - 1).toLocaleDateString("th-TH", { month: "long" })}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm hover:bg-surface-alt"
          aria-label="เดือนถัดไป"
        >
          →
        </button>

        <button
          type="button"
          onClick={apply}
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
        >
          ดูข้อมูล
        </button>
      </div>
    </div>
  );
}
