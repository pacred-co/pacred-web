"use client";

/**
 * <TagChips> — reusable customer-tag editor (CRM depth · 2026-06-08).
 *
 * Renders a customer's tags as removable chips + an add control (starter-vocab
 * one-click chips + a free-text box). Used on:
 *   - /admin/leads rows (compact)
 *   - /admin/crm customer-360 panel
 *   - /admin/customers/[id]
 *
 * §0f confirm-before-mutate: removing a chip pops a styled confirm dialog
 * (components/ui/confirm) before the delete fires. Adding is non-destructive →
 * no confirm.
 *
 * The action returns the refreshed tag list, so the component holds local state
 * and re-renders optimistically off the server's authoritative response (no
 * router.refresh needed for the chips themselves).
 */

import { useState, useTransition } from "react";
import { Tag as TagIcon, Plus, X, Loader2 } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { addTag, removeTag } from "@/actions/admin/customer-tags";
import { STARTER_TAGS } from "@/actions/admin/customer-tags-types";

export function TagChips({
  userid,
  initialTags = [],
  compact = false,
}: {
  userid: string;
  /** Tag strings already on the customer (newest-first). */
  initialTags?: string[];
  /** Compact mode for dense table rows (smaller, no starter-vocab row). */
  compact?: boolean;
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function applyAdd(raw: string) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      // already present — just clear the draft
      setDraft("");
      return;
    }
    setErr(null);
    setBusyTag(t);
    startTransition(async () => {
      const res = await addTag(userid, t);
      if (res.ok) {
        // server returns the authoritative list (CustomerTag[]) → map to strings
        setTags((res.data ?? []).map((x) => x.tag));
        setDraft("");
      } else {
        setErr(res.error ?? "เพิ่มแท็กไม่สำเร็จ");
      }
      setBusyTag(null);
    });
  }

  function applyRemove(t: string) {
    setErr(null);
    startTransition(async () => {
      // §0f — confirm before the destructive remove.
      const ok = await confirm(`ลบแท็ก “${t}” ออกจากลูกค้ารายนี้?`, {
        title: "ลบแท็ก",
        confirmLabel: "ลบ",
        cancelLabel: "ยกเลิก",
      });
      if (!ok) return;
      setBusyTag(t);
      const res = await removeTag(userid, t);
      if (res.ok) {
        setTags((res.data ?? []).map((x) => x.tag));
      } else {
        setErr(res.error ?? "ลบแท็กไม่สำเร็จ");
      }
      setBusyTag(null);
    });
  }

  const sizeChip = compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[11px]";

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      {/* Current tags */}
      <div className="flex flex-wrap items-center gap-1">
        {tags.length === 0 && !adding ? (
          <span className={`text-muted ${compact ? "text-[11px]" : "text-[11px]"}`}>
            — ยังไม่มีแท็ก —
          </span>
        ) : (
          tags.map((t) => (
            <span
              key={t}
              className={`inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 font-medium text-primary-700 ${sizeChip}`}
            >
              <TagIcon className="w-3 h-3 shrink-0" />
              {t}
              <button
                type="button"
                disabled={pending && busyTag === t}
                onClick={() => applyRemove(t)}
                aria-label={`ลบแท็ก ${t}`}
                className="ml-0.5 inline-flex items-center rounded-full leading-none hover:bg-primary-100 disabled:opacity-50"
              >
                {pending && busyTag === t ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            </span>
          ))
        )}

        {/* Add toggle */}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`inline-flex items-center gap-1 rounded-full border border-dashed border-border text-muted hover:bg-surface-alt ${sizeChip}`}
          >
            <Plus className="w-3 h-3" /> แท็ก
          </button>
        ) : null}
      </div>

      {/* Add control */}
      {adding ? (
        <div className="space-y-1.5 rounded-lg border border-border bg-white dark:bg-surface p-2">
          {/* Starter vocab (skip in compact to keep rows short) */}
          {!compact ? (
            <div className="flex flex-wrap gap-1">
              {STARTER_TAGS.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  onClick={() => applyAdd(s)}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-primary-50 hover:border-primary-200 disabled:opacity-50"
                >
                  + {s}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyAdd(draft);
                }
              }}
              maxLength={40}
              placeholder="พิมพ์แท็กแล้วกด Enter"
              className="min-w-0 flex-1 rounded-md border border-border px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={pending || !draft.trim()}
              onClick={() => applyAdd(draft)}
              className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              เพิ่ม
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setDraft(""); setErr(null); }}
              className="text-[11px] text-muted hover:underline px-1"
            >
              ปิด
            </button>
          </div>
          {err ? <p className="text-[11px] text-red-700">{err}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
