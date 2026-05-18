"use client";

/**
 * V-E1.1 · CustomerPicker — reusable combobox that resolves a customer to
 * their profile UUID.  Replaces the "paste UUID" raw-text input in:
 *
 *   - /admin/freight/shipments/new  (the original V-E1.1 trigger)
 *   - (future) /admin/tax-invoices/new, refund admin-creation, etc.
 *
 * Behaviour:
 *   - Type ≥ 2 chars → debounced (250ms) call to adminSearchCustomers
 *   - Dropdown shows up to 10 matches: member_code · name · phone
 *   - Click / Enter / arrow keys → onChange(profile.id)
 *   - Once picked, the field shows a "chip" (member_code + name) with an
 *     × to clear; clearing restores the search input
 *
 * Mobile-first: 44px tap targets, full-width input, dropdown caps height +
 * scrolls.
 */

import { useEffect, useRef, useState } from "react";
import { X, Search, Loader2 } from "lucide-react";
import {
  adminSearchCustomers,
  type CustomerPickerRow,
} from "@/actions/admin/search-customers";

interface CustomerPickerProps {
  /** Currently selected profile UUID — `""` when none. */
  value: string;
  /** Called when the user picks a profile or clears the field.  Receives
   *  the profile UUID (or `""` when cleared) and the picked row (or null). */
  onChange: (profileId: string, row: CustomerPickerRow | null) => void;
  /** Optional placeholder for the search input. */
  placeholder?: string;
  /** Optional initial label to show when `value` is pre-filled but no
   *  row was picked in this session (e.g. an admin edit flow).  Display
   *  only — not used for matching. */
  initialLabel?: string;
  /** Mark required for HTML5 validation. */
  required?: boolean;
  /** Disable input + clear button. */
  disabled?: boolean;
}

function formatRow(r: CustomerPickerRow): string {
  const name = r.account_type === "juristic" && r.company_name
    ? r.company_name
    : [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
  return `${r.member_code ?? "—"} · ${name}`;
}

function formatRowDetail(r: CustomerPickerRow): string {
  const bits: string[] = [];
  if (r.phone) bits.push(r.phone);
  if (r.email) bits.push(r.email);
  if (r.status && r.status !== "active") bits.push(r.status);
  return bits.join(" · ");
}

export function CustomerPicker({
  value,
  onChange,
  placeholder = "ค้นหา PR / ชื่อ / เบอร์ / อีเมล / บริษัท",
  initialLabel,
  required,
  disabled,
}: CustomerPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerPickerRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [pickedLabel, setPickedLabel] = useState<string | null>(
    initialLabel ?? null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search — fires 250ms after the last keystroke.  All setState
  // calls are kept inside the async callback so the effect body itself never
  // calls setState synchronously (lint: react-hooks/set-state-in-effect).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let cancelled = false;
    const id = setTimeout(async () => {
      if (cancelled) return;
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await adminSearchCustomers({ q: trimmed, limit: 10 });
      if (cancelled) return;
      if (res.ok) {
        setResults(res.data.rows);
        setHighlightIdx(0);
      } else {
        setResults([]);
      }
      setLoading(false);
    }, 250);
    debounceRef.current = id;
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  // Close on click-outside.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(row: CustomerPickerRow) {
    setPickedLabel(formatRow(row));
    setQuery("");
    setResults([]);
    setOpen(false);
    onChange(row.id, row);
  }

  function clear() {
    setPickedLabel(null);
    setQuery("");
    setResults([]);
    onChange("", null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlightIdx];
      if (r) pick(r);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // When value is set (picked) → render the chip; otherwise the search input.
  if (value && pickedLabel) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 dark:bg-primary-950/30 px-3 py-2 text-sm">
          <span className="font-mono text-xs text-muted">UUID:</span>
          <span className="font-mono text-xs text-muted truncate" title={value}>{value.slice(0, 8)}…</span>
          <span className="w-px h-4 bg-primary-200 mx-1" aria-hidden />
          <span className="font-medium truncate">{pickedLabel}</span>
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg border border-border text-muted hover:bg-surface-alt disabled:opacity-50"
          aria-label="ล้างผู้เลือก"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={required && !value}
          disabled={disabled}
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-white dark:bg-surface pl-9 pr-9 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted animate-spin" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-white dark:bg-surface shadow-lg overflow-hidden">
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted">กำลังค้นหา…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted">
              ไม่พบลูกค้าที่ตรงกับ &quot;{query}&quot;
            </div>
          ) : (
            <ul role="listbox" className="max-h-72 overflow-auto">
              {results.map((r, idx) => {
                const label = formatRow(r);
                const detail = formatRowDetail(r);
                const isHighlighted = idx === highlightIdx;
                return (
                  <li key={r.id} role="option" aria-selected={isHighlighted}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full text-left px-3 py-2.5 min-h-[44px] border-b border-border last:border-b-0 ${
                        isHighlighted ? "bg-primary-50 dark:bg-primary-950/30" : "hover:bg-surface-alt"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{label}</span>
                        {r.account_type === "juristic" && (
                          <span className="text-[10px] text-muted shrink-0">นิติบุคคล</span>
                        )}
                      </div>
                      {detail && (
                        <div className="text-xs text-muted truncate mt-0.5">{detail}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted mt-1">
        พิมพ์อย่างน้อย 2 ตัวอักษร — รองรับ PR001 · ชื่อ · เบอร์ · อีเมล · ชื่อบริษัท
      </p>
    </div>
  );
}
