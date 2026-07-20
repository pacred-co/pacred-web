"use client";

/**
 * Editable cells for the คลังคอนเทนต์ spreadsheet view (owner 2026-07-20:
 * "คลังคอนเทนต์ = หน้า excel แก้ไขได้รายละเอียด · เนื้อหาตรงนี้จะวิ่งไปตรงปฏิทินได้").
 *
 * Every cell writes through `updateContent(id, patch)` — the SAME store the
 * calendar/kanban read — so editing วันลง here literally moves the card in
 * ปฏิทิน. There is no separate grid state to fall out of sync.
 *
 * Editing model (spreadsheet habits, not a form):
 *   • click a cell → it becomes an input, already focused
 *   • Enter / blur = commit · Escape = cancel and put the old value back
 *   • a commit that didn't change anything writes nothing (no updatedAt churn)
 * Dropdowns commit immediately (a <select> has no "cancel").
 */

import { useEffect, useRef, useState } from "react";
import type { SettingItem } from "@/lib/marketing-planner/types";
import { cx } from "./ui";

const CELL_BTN =
  "w-full rounded px-1.5 py-1 text-left transition hover:bg-primary-50 hover:ring-1 hover:ring-primary-200 dark:hover:bg-primary-900/20";
const INPUT =
  "w-full rounded border border-primary-400 bg-white px-1.5 py-1 text-[12px] outline-none ring-2 ring-primary-200 dark:bg-surface";

/** Click-to-edit text (title · free text). Commits on Enter/blur, cancels on Esc. */
export function EditableText({
  value,
  onCommit,
  placeholder = "—",
  className,
  title,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  // The draft is seeded when edit STARTS (not synced by an effect), so a value
  // changed elsewhere is picked up on the next click without a render cascade.
  const startEdit = () => { setDraft(value); setEditing(true); };

  if (!editing) {
    return (
      <button type="button" onClick={startEdit} className={cx(CELL_BTN, className)} title={title ?? "คลิกเพื่อแก้ไข"}>
        {value ? <span className="block truncate">{value}</span> : <span className="text-muted/50">{placeholder}</span>}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className={INPUT}
      aria-label={title ?? "แก้ไข"}
    />
  );
}

/** Click-to-edit date/time. type="date" gives the native picker (วันลง → ปฏิทิน). */
export function EditableDate({
  value,
  onCommit,
  type = "date",
  render,
  title,
}: {
  value: string;
  onCommit: (v: string) => void;
  type?: "date" | "time";
  render?: (v: string) => string;
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    const shown = value ? (render ? render(value) : value) : "";
    return (
      <button type="button" onClick={() => setEditing(true)} className={CELL_BTN} title={title ?? "คลิกเพื่อแก้ไข"}>
        {shown ? shown : <span className="text-muted/50">—</span>}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); }}
      className={INPUT}
      aria-label={title ?? "แก้ไขวันที่"}
    />
  );
}

/** Setting dropdown (สถานะ · ประเภท · เป้าหมาย · ผู้รับผิดชอบ) — commits on change.
 *  Shows the setting's own colour so สถานะ reads at a glance (owner: "เห็นสถานะชัด"). */
export function EditableSelect({
  value,
  options,
  onCommit,
  colorOf,
  title,
}: {
  value?: string;
  options: SettingItem[];
  onCommit: (v: string | undefined) => void;
  colorOf?: (id?: string) => string | undefined;
  title?: string;
}) {
  const color = colorOf?.(value);
  return (
    <div className="flex items-center gap-1.5">
      {color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} /> : null}
      <select
        value={value ?? ""}
        onChange={(e) => onCommit(e.target.value || undefined)}
        className="w-full cursor-pointer rounded border border-transparent bg-transparent px-1 py-1 text-[12px] transition hover:border-border hover:bg-white focus:border-primary-400 focus:outline-none dark:hover:bg-surface"
        aria-label={title ?? "เลือก"}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </div>
  );
}
