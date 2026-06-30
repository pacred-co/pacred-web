"use client";

/**
 * DateTime24Field — a 24-hour datetime entry (ภูม 2026-06-30).
 *
 * The native `<input type="datetime-local">` renders its time as 12-hour AM/PM
 * whenever the browser's UI language is en-US, and Chrome does NOT honour the
 * element's `lang` attribute to override that — so staff kept getting confused
 * by AM/PM. This component sidesteps the native time picker entirely:
 *   • date  → native `<input type="date">` (no AM/PM to confuse — order only)
 *   • time  → two plain `<select>` (ชั่วโมง 00–23 · นาที 00–59) = always 24h
 *
 * value / onChange use the SAME string shape the old datetime-local used —
 * "YYYY-MM-DDTHH:mm" — so callers don't change their parse/submit logic.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

const selCls =
  "rounded-lg border border-border bg-white dark:bg-surface px-2 py-2 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50";

export function DateTime24Field({
  value,
  onChange,
  max,
  disabled,
  required,
  className = "",
}: {
  /** "YYYY-MM-DDTHH:mm" (the datetime-local shape) · "" = empty */
  value: string;
  onChange: (next: string) => void;
  /** optional max DATE (YYYY-MM-DD) — clamps the date input only */
  max?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const [datePart = "", timePart = ""] = (value || "").split("T");
  const [hh = "", mm = ""] = timePart.split(":");

  const emit = (d: string, h: string, m: string) => {
    if (!d) {
      onChange("");
      return;
    }
    // default the time to 00:00 once a date is picked so the value is valid
    onChange(`${d}T${h || "00"}:${m || "00"}`);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <input
        type="date"
        value={datePart}
        onChange={(e) => emit(e.target.value, hh, mm)}
        max={max}
        disabled={disabled}
        required={required}
        className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50"
      />
      <div className="flex items-center gap-1">
        <select
          aria-label="ชั่วโมง (24 ชม.)"
          value={hh}
          onChange={(e) => emit(datePart, e.target.value, mm || "00")}
          disabled={disabled || !datePart}
          className={selCls}
        >
          <option value="">ชม.</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <span className="text-muted">:</span>
        <select
          aria-label="นาที"
          value={mm}
          onChange={(e) => emit(datePart, hh || "00", e.target.value)}
          disabled={disabled || !datePart}
          className={selCls}
        >
          <option value="">นาที</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-[11px] text-muted">น. (24 ชม.)</span>
      </div>
    </div>
  );
}
