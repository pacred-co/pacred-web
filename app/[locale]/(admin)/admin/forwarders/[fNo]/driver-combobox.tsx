"use client";

/**
 * Phase C QoL #2 — fuzzy driver search combobox.
 *
 * Replaces the raw member_code textbox in DriverAssignForm. Same UX as
 * the rep combobox: type → debounced 300ms → top 10 driver hits → arrow
 * keys + enter / mouse pick. Selected hit emits its member_code (the
 * existing adminAssignDriverToForwarder API expects member_code, not
 * profile_id), and the dropdown label is "{member_code} · {name} · {phone}".
 *
 * No external library — plain <input> + <ul>.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchDriversByQuery, type DriverSearchHit } from "@/actions/admin/forwarder-drivers";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  /** member_code of the currently-selected driver ("" = none). */
  value:        string;
  /**
   * Notify parent with (member_code, displayLabel, profileId) on pick / clear.
   * `profileId` is the picked driver's `profiles.id` (UUID) — callers that
   * drive a profile_id-keyed action (e.g. bulkAssignDriver) use it; the
   * member_code-keyed caller (driver-assign-form) ignores it. On clear all
   * three are emitted empty/null.
   */
  onChange:     (memberCode: string, display: string | null, profileId: string | null) => void;
  /** Disable the input (e.g. during submit). */
  disabled?:    boolean;
  /** Placeholder. */
  placeholder?: string;
};

export function DriverCombobox({
  value,
  onChange,
  disabled,
  placeholder = "พิมพ์ member_code / ชื่อ / เบอร์ เพื่อค้นคนขับ…",
}: Props) {
  const listId = useId();
  const [query,   setQuery]   = useState("");
  const [hits,    setHits]    = useState<DriverSearchHit[]>([]);
  const [open,    setOpen]    = useState(false);
  const [active,  setActive]  = useState<number>(-1);
  const [err,     setErr]     = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce → fetch. setState lives inside setTimeout, not in the effect
  // body, per React 19 set-state-in-effect rule.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    debounceRef.current = setTimeout(() => {
      if (trimmed.length === 0) {
        setHits([]);
        setErr(null);
        setActive(-1);
        return;
      }
      startTransition(async () => {
        const res = await searchDriversByQuery({ q: trimmed, limit: 10 });
        if (res.ok && res.data) {
          setHits(res.data.hits);
          setActive(res.data.hits.length > 0 ? 0 : -1);
          setErr(null);
        } else {
          setHits([]);
          setActive(-1);
          setErr(res.ok ? null : res.error);
        }
      });
    }, trimmed.length === 0 ? 0 : 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function pick(hit: DriverSearchHit) {
    onChange(hit.member_code ?? "", hit.display, hit.profile_id);
    setQuery("");
    setHits([]);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  }

  function clear() {
    onChange("", null, null);
    setQuery("");
    setHits([]);
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hits.length === 0) return;
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hits.length === 0) return;
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && hits[active]) {
        e.preventDefault();
        pick(hits[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const hasPick = value !== "";

  return (
    <div className="relative space-y-1.5">
      {hasPick && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs">
          <span className="font-medium text-primary-800">📦 {value}</span>
          <button
            type="button"
            onClick={clear}
            className="text-[11px] text-primary-700 hover:underline"
          >
            ล้าง
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { if (hits.length > 0) setOpen(true); }}
        onBlur={() => { setTimeout(() => setOpen(false), 120); }}
        onKeyDown={onKey}
        className={inputCls}
        placeholder={hasPick ? "เปลี่ยนคนขับ — พิมพ์ค้น…" : placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      {pending && (
        <div className="absolute right-3 top-[8px] text-[11px] text-muted">
          ค้น…
        </div>
      )}

      {open && (hits.length > 0 || err || (query.trim().length > 0 && !pending)) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-white dark:bg-surface shadow-lg text-sm"
        >
          {err && (
            <li className="px-3 py-2 text-xs text-red-700">เกิดข้อผิดพลาด: {err}</li>
          )}
          {!err && hits.length === 0 && query.trim().length > 0 && !pending && (
            <li className="px-3 py-2 text-xs text-muted italic">
              ไม่พบคนขับที่ตรงกับ &quot;{query}&quot; (ต้องมี role driver + active)
            </li>
          )}
          {hits.map((h, idx) => (
            <li
              key={h.profile_id}
              id={`${listId}-${idx}`}
              role="option"
              aria-selected={idx === active}
              onMouseDown={(e) => { e.preventDefault(); pick(h); }}
              onMouseEnter={() => setActive(idx)}
              className={`cursor-pointer px-3 py-2 ${
                idx === active ? "bg-primary-50" : ""
              } hover:bg-primary-50/70`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs">{h.member_code ?? "—"}</span>
                <span className="text-[11px] text-muted">{h.phone ?? "—"}</span>
              </div>
              <div className="text-xs">{h.name}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
