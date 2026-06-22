"use client";

/**
 * Phase C QoL #1 — fuzzy rep search combobox.
 *
 * Replaces the legacy UUID-paste flow in /admin/customers/[id]/transfer-rep
 * (and the long pre-fetched dropdown). Admin types name / member_code /
 * phone fragment → debounced 300ms → searchAdminsByQuery returns top 10 →
 * keyboard arrows + enter picks, click picks, Esc closes. No external
 * library — plain <input> + <ul> dropdown.
 *
 * Selected hit's `profile_id` is mirrored into a hidden input + reported
 * via onChange so the parent form posts the resolved UUID — staff never
 * sees or types the UUID. A special "__unassign__" entry is offered when
 * the user clears the search box (handled by the parent's special-case
 * already; this component just emits "" when empty + the parent decides).
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchAdminsByQuery, type AdminSearchHit } from "@/actions/admin/admins";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  /** Profile ID of the currently-selected rep ("" = none). */
  value:        string;
  /** Notify parent when selection changes. "" = cleared. */
  onChange:     (profileId: string, display: string | null) => void;
  /** Profile IDs to hide from results (e.g. current rep to prevent self-transfer). */
  excludeIds?:  string[];
  /** Pre-rendered label shown when value is non-empty (e.g. "Pop · PR001 · 0812345678"). */
  selectedLabel?: string | null;
  /** When true, disables the input + clears focus styles. */
  disabled?:    boolean;
  /** Placeholder shown when input is empty. */
  placeholder?: string;
};

export function RepCombobox({
  value,
  onChange,
  excludeIds,
  selectedLabel,
  disabled,
  placeholder = "พิมพ์ชื่อ / member_code / เบอร์ เพื่อค้น…",
}: Props) {
  const listId = useId();
  const [query,   setQuery]   = useState("");
  const [hits,    setHits]    = useState<AdminSearchHit[]>([]);
  const [open,    setOpen]    = useState(false);
  const [active,  setActive]  = useState<number>(-1);
  const [err,     setErr]     = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter excluded ids out of the rendered list (current rep + already-picked).
  const exclude = new Set(excludeIds ?? []);
  const visibleHits = hits.filter((h) => !exclude.has(h.profile_id));

  // Debounce query → 300ms idle → fetch. Empty/whitespace clears results.
  // React 19 forbids synchronous setState inside an effect body; the actual
  // clear runs inside the setTimeout callback (or in onClear when the user
  // empties the input) — the effect itself only manages the timer.
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
        const res = await searchAdminsByQuery({ q: trimmed, limit: 10 });
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

  function pick(hit: AdminSearchHit) {
    onChange(hit.profile_id, hit.display);
    setQuery("");
    setHits([]);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  }

  function clear() {
    onChange("", null);
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
      if (visibleHits.length === 0) return;
      setActive((i) => (i + 1) % visibleHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (visibleHits.length === 0) return;
      setActive((i) => (i <= 0 ? visibleHits.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && visibleHits[active]) {
        e.preventDefault();
        pick(visibleHits[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  // When parent gives us a pre-selected rep (currentRepDisplay coming in
  // with a non-empty value), show it as a chip above the search input
  // instead of stuffing it in the input box. Cleaner UX + the search box
  // stays empty so admins can type freely.
  const showSelectedChip = value !== "" && value !== "__unassign__" && selectedLabel != null;

  return (
    <div className="relative space-y-2">
      {showSelectedChip && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs">
          <span>
            <span className="text-primary-700/70">เลือกแล้ว: </span>
            <span className="font-medium text-primary-800">{selectedLabel}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            className="rounded text-[11px] text-primary-700 hover:underline"
          >
            ล้าง / เลือกใหม่
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
        onBlur={() => {
          // Defer so click on dropdown lands first.
          setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKey}
        className={inputCls}
        placeholder={showSelectedChip ? "เปลี่ยนเป็นเซลล์อื่น — พิมพ์ค้น…" : placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      {pending && (
        <div className="absolute right-3 top-[34px] text-[11px] text-muted">
          กำลังค้น…
        </div>
      )}

      {open && (visibleHits.length > 0 || err || (query.trim().length > 0 && !pending)) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-white dark:bg-surface shadow-lg text-sm"
        >
          {err && (
            <li className="px-3 py-2 text-xs text-red-700">เกิดข้อผิดพลาด: {err}</li>
          )}
          {!err && visibleHits.length === 0 && query.trim().length > 0 && !pending && (
            <li className="px-3 py-2 text-xs text-muted italic">
              ไม่พบเซลล์ที่ตรงกับ &quot;{query}&quot; — ลองคำอื่น
            </li>
          )}
          {visibleHits.map((h, idx) => (
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
                <span className="font-medium">{h.name}</span>
                <span className="font-mono text-[11px] text-muted">{h.member_code ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                <span>{h.phone ?? "—"}</span>
                <span className="rounded-full bg-surface-alt px-1.5 py-0.5 text-[11px] uppercase tracking-wide">
                  {h.role}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted">
        พิมพ์อย่างน้อย 1 ตัวอักษร (ค้นจาก ชื่อ / member_code / เบอร์ / ชื่อบริษัท) — ใช้ลูกศร ↑↓ + Enter ก็ได้
      </p>
    </div>
  );
}
