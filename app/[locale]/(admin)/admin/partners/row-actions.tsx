"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetPartnerActive, adminDeletePartner } from "@/actions/admin/partners";
import { PartnerForm } from "./partner-form";
import type { PartnerInitial } from "./types";

/**
 * Per-row action UI for /admin/partners.
 *   - ✏️ แก้  → expands the inline edit form (PartnerForm in edit mode)
 *   - 🚫/🔄   → soft toggle is_active (preserves the row + history)
 *   - 🗑 ลบ   → HARD delete (the staff-CRUD audit explicitly wanted it) —
 *               two-step confirm in-line to avoid an accidental mis-click.
 */
export function PartnerRowActions({
  id,
  isActive,
  initial,
}: {
  id:       string;
  isActive: boolean;
  initial:  PartnerInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleActive() {
    setErr(null);
    startTransition(async () => {
      const res = await adminSetPartnerActive(id, !isActive);
      if (!res.ok) setErr(res.error);
      router.refresh();
    });
  }

  function hardDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await adminDeletePartner(id);
      if (!res.ok) {
        setErr(res.error);
        setConfirmDel(false);
        return;
      }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[10px] text-muted hover:underline"
        >
          ← ปิดฟอร์ม
        </button>
        <div className="rounded-lg border border-border bg-surface-alt/40 p-3">
          <PartnerForm mode="edit" id={id} initial={initial} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {err && <div className="text-[10px] text-red-600">{err}</div>}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
          disabled={pending}
        >
          ✏️ แก้
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={pending}
          className={`rounded-lg border px-2 py-1 text-[10px] ${
            isActive
              ? "border-amber-200 text-amber-700 hover:bg-amber-50"
              : "border-green-200 text-green-700 hover:bg-green-50"
          } disabled:opacity-50`}
        >
          {isActive ? "🚫 ปิด" : "🔄 เปิด"}
        </button>
        {confirmDel ? (
          <>
            <button
              type="button"
              onClick={hardDelete}
              disabled={pending}
              className="rounded-lg border border-red-300 bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "กำลังลบ..." : "ยืนยันลบถาวร"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(false)}
              disabled={pending}
              className="rounded-lg border border-border px-2 py-1 text-[10px] hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            disabled={pending}
            className="rounded-lg border border-red-200 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            🗑 ลบ
          </button>
        )}
      </div>
    </div>
  );
}
