"use client";

/**
 * HsCodePicker (#3) — auto-search typeahead over the คลัง HS dictionary so staff
 * PICK an HS code (code + duty + รหัสสถิติ) instead of free-typing one (typos
 * misroute duty + the ใบขน). Drop-in replacement for the bare HS `<input>` in the
 * HS-triage queue + the cost editor.
 *
 * Behaviour:
 *   - free-typing is still allowed (the field IS the value · supports codes not yet
 *     in the dictionary) — this is a SUGGEST layer, not a hard select.
 *   - type ≥ 2 chars → debounced (300ms) searchHsCodes → dropdown of matches
 *     (code · description · อากร% · สถิติ).
 *   - click / Enter / arrow keys → fill the code; onPick also surfaces the row's
 *     default_stat_code so the caller can pre-fill รหัสสถิติ.
 *
 * Reference-only: reads hs_codes, writes nothing (the caller's save does the write).
 * Mobile-first: 44px tap rows · full-width input · dropdown caps height + scrolls.
 */

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { searchHsCodes, type HsSearchRow } from "@/actions/admin/hs-codes";

interface HsCodePickerProps {
  /** Current HS code text (controlled). */
  value: string;
  /** Called as the user types or picks — the raw code string. */
  onChange: (code: string) => void;
  /** Called when a dictionary row is PICKED (click/Enter) — lets the caller
   *  pre-fill รหัสสถิติ from default_stat_code, show the duty, etc. */
  onPick?: (row: HsSearchRow) => void;
  placeholder?: string;
  /** Extra classes for the text input (sizing). */
  inputClassName?: string;
  maxLength?: number;
  disabled?: boolean;
  "aria-label"?: string;
}

export function HsCodePicker({
  value,
  onChange,
  onPick,
  placeholder = "พิมพ์ HS หรือชื่อสินค้า…",
  inputClassName = "",
  maxLength = 40,
  disabled,
  "aria-label": ariaLabel,
}: HsCodePickerProps) {
  const [results, setResults] = useState<HsSearchRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Track whether the latest text change came from typing (search) vs a pick
  // (don't immediately re-open the dropdown after a pick).
  const skipNextSearch = useRef(false);

  // Debounced search on the value.
  useEffect(() => {
    const q = value.trim();
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    let cancelled = false;
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      searchHsCodes(q, 12)
        .then((res) => {
          if (cancelled) return;
          const rows = res.ok && res.data ? res.data : [];
          setResults(rows);
          setOpen(rows.length > 0);
          setActive(-1);
        })
        .catch(() => {
          if (!cancelled) { setResults([]); setOpen(false); }
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(row: HsSearchRow) {
    skipNextSearch.current = true;
    onChange(row.code);
    onPick?.(row);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          aria-label={ariaLabel}
          autoComplete="off"
          className={inputClassName}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </span>
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full min-w-[18rem] overflow-y-auto rounded-lg border border-border bg-white dark:bg-surface shadow-lg">
          {results.map((r, i) => (
            <li key={r.code}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left ${
                  i === active ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-surface-alt/60"
                }`}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold tabular-nums text-primary-700">{r.code}</span>
                  {/* 0258 — an unconfirmed duty is a placeholder/bot guess: its 0
                      means "ไม่ทราบ", NOT "ยกเว้น". Say so at the moment of
                      picking, because this code's duty gets snapshotted onto a
                      ใบขน line downstream. */}
                  {!r.duty_confirmed && (
                    <span className="rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[11px] font-semibold text-amber-800">
                      ยังไม่ยืนยันอากร
                    </span>
                  )}
                  {r.decl_count > 0 && (
                    <span className="rounded border border-sky-300 bg-sky-50 px-1 py-0.5 text-[11px] text-sky-700">
                      ใช้จริง {r.decl_count} ใบขน
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-foreground line-clamp-1">{r.description}</span>
                {r.matched_product && (
                  <span className="text-[11px] text-muted line-clamp-1">ตรงกับสินค้า “{r.matched_product}”</span>
                )}
                <span className="text-[11px] text-muted">
                  อากร {r.default_duty_pct}% · Form-E {r.form_e_duty_pct}% · สถิติ {r.default_stat_code ?? "000"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
