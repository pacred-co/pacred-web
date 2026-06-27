"use client";

/**
 * <RejectReasonPicker> — click-select slip/withdraw rejection reason
 * (owner 2026-06-27 · "ห้ามพิมพ์ · กดเลือก").
 *
 * Renders the preset reasons (lib/admin/slip-reject-reasons.ts) as tap chips
 * (radio semantics — one reason) + a single "อื่นๆ (ระบุ)" chip that reveals a
 * short text input (the only typing path). Calls `onChange` with the RESOLVED
 * reason string (the picked preset, or the custom text when "อื่นๆ" is active).
 *
 * Used by both slip-verify reject surfaces:
 *   • /admin/wallet/[id] edit-form <ApproveRejectForm>
 *   • /admin/wallet slip-review-modal
 * so the rejection-reason vocabulary stays one canonical set.
 */

import { useState } from "react";
import { REJECT_REASON_OTHER, type SlipRejectKind, rejectReasonsFor } from "@/lib/admin/slip-reject-reasons";

export function RejectReasonPicker({
  kind,
  onChange,
  disabled = false,
}: {
  kind: SlipRejectKind;
  /** Fires with the resolved reason ("" until a valid choice exists). */
  onChange: (reason: string) => void;
  disabled?: boolean;
}) {
  const reasons = rejectReasonsFor(kind);
  const [picked, setPicked] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  const isOther = picked === REJECT_REASON_OTHER;

  function choose(r: string) {
    setPicked(r);
    if (r === REJECT_REASON_OTHER) {
      onChange(custom.trim()); // may be "" until they type — caller validates
    } else {
      onChange(r);
    }
  }

  function onCustom(v: string) {
    setCustom(v);
    onChange(v.trim());
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            disabled={disabled}
            onClick={() => choose(r)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ${
              picked === r
                ? "border-red-600 bg-red-600 text-white"
                : "border-red-200 bg-white text-red-800 hover:bg-red-100"
            }`}
          >
            {r}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => choose(REJECT_REASON_OTHER)}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ${
            isOther
              ? "border-red-600 bg-red-600 text-white"
              : "border-red-200 bg-white text-red-800 hover:bg-red-100"
          }`}
        >
          {REJECT_REASON_OTHER}
        </button>
      </div>
      {isOther && (
        <input
          type="text"
          maxLength={200}
          value={custom}
          onChange={(e) => onCustom(e.target.value)}
          disabled={disabled}
          placeholder="ระบุเหตุผล (เฉพาะกรณีไม่มีในตัวเลือก)"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
          autoFocus
        />
      )}
    </div>
  );
}
