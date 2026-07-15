"use client";

/**
 * DateTime24Field — an always-EXPANDED 24-hour date+time picker
 * (ปอน 2026-07-15, owner-directed: "กางออกมาเลย จะได้กดง่ายๆ").
 *
 * Replaces the old native `<input type="date">` + two `<select>` (which hid the
 * days/times behind a dropdown, and rendered AM/PM on en-US Chrome). Now:
 *   • date → an inline month calendar grid (click a day · ‹ › to change month)
 *   • time → two up/down spinners (ชม. 00–23 · นาที 00–59) = always 24h, one tap
 * Everything is visible at once so ops can match the slip's transfer time at a
 * glance. value / onChange keep the SAME "YYYY-MM-DDTHH:mm" shape as before, so
 * callers don't change their parse/submit logic.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** local YYYY-MM-DD for a Date */
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DateTime24Field({
  value,
  onChange,
  max,
  disabled,
  className = "",
}: {
  /** "YYYY-MM-DDTHH:mm" (the datetime-local shape) · "" = empty */
  value: string;
  onChange: (next: string) => void;
  /** optional max DATE (YYYY-MM-DD) — days after it are disabled */
  max?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [datePart = "", timePart = ""] = (value || "").split("T");
  const [hh = "", mm = ""] = timePart.split(":");

  // Which month the calendar shows — defaults to the selected date, else today.
  // Remounts (panel re-open) re-init this, which is what we want.
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = datePart ? new Date(`${datePart}T00:00:00`) : new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const emit = (d: string, h: string, m: string) => {
    // pick a time first (before a date) → fill today so the value stays valid
    const date = d || (h || m ? ymd(new Date()) : "");
    if (!date) {
      onChange("");
      return;
    }
    onChange(`${date}T${h || "00"}:${m || "00"}`);
  };

  // ── 6×7 calendar grid, leading/trailing months filled (like the mockup) ──
  const firstWeekday = new Date(view.y, view.m, 1).getDay(); // 0 = Sun
  const gridStart = new Date(view.y, view.m, 1 - firstWeekday);
  const cells = Array.from({ length: 42 }, (_, i) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );

  const stepMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // ── time spinners (wrap-around) ──
  const curHour = hh === "" ? 0 : Number(hh);
  const curMin = mm === "" ? 0 : Number(mm);
  const bumpHour = (d: number) => emit(datePart, pad((curHour + d + 24) % 24), pad(curMin));
  const bumpMin = (d: number) => emit(datePart, pad(curHour), pad((curMin + d + 60) % 60));

  return (
    <div className={`flex flex-wrap items-start gap-4 ${className}`}>
      {/* ── calendar (grows to fill the pane width · ปอน 2026-07-15) ── */}
      <div className="min-w-[15rem] flex-1 select-none rounded-xl border border-border bg-white p-3 dark:bg-surface">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            disabled={disabled}
            aria-label="เดือนก่อนหน้า"
            className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground">
            {MONTHS[view.m]} {view.y}
          </span>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            disabled={disabled}
            aria-label="เดือนถัดไป"
            className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-center text-xs font-medium text-muted">
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            const iso = ymd(d);
            const inMonth = d.getMonth() === view.m;
            const selected = iso === datePart;
            const isDisabled = disabled || (max ? iso > max : false);
            return (
              <button
                key={i}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!inMonth) setView({ y: d.getFullYear(), m: d.getMonth() });
                  emit(iso, hh, mm);
                }}
                className={[
                  "h-10 w-full rounded-lg text-sm tabular-nums transition-colors",
                  selected
                    ? "bg-primary-500 font-bold text-white"
                    : inMonth
                      ? "text-foreground hover:bg-surface-alt"
                      : "text-muted/50 hover:bg-surface-alt",
                  "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
                ].join(" ")}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── time spinner (24h) ── */}
      <div className="flex items-center gap-2 pt-1">
        <TimeSpin unit="ชั่วโมง" value={pad(curHour)} onUp={() => bumpHour(1)} onDown={() => bumpHour(-1)} disabled={disabled} />
        <span className="text-3xl font-bold text-muted">:</span>
        <TimeSpin unit="นาที" value={pad(curMin)} onUp={() => bumpMin(1)} onDown={() => bumpMin(-1)} disabled={disabled} />
        <span className="ml-1 self-center text-[11px] leading-tight text-muted">น.<br />(24 ชม.)</span>
      </div>
    </div>
  );
}

// ── one hour/minute spinner column: ▲ / value / ▼ ──
function TimeSpin({
  unit,
  value,
  onUp,
  onDown,
  disabled,
}: {
  unit: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onUp}
        disabled={disabled}
        aria-label={`เพิ่ม${unit}`}
        className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-primary-600 disabled:opacity-50"
      >
        <ChevronUp className="h-6 w-6" />
      </button>
      <span
        aria-label={unit}
        className="w-16 rounded-lg border border-border bg-white py-2.5 text-center text-3xl font-bold tabular-nums text-foreground dark:bg-surface"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onDown}
        disabled={disabled}
        aria-label={`ลด${unit}`}
        className="rounded-lg p-1 text-muted hover:bg-surface-alt hover:text-primary-600 disabled:opacity-50"
      >
        <ChevronDown className="h-6 w-6" />
      </button>
    </div>
  );
}
