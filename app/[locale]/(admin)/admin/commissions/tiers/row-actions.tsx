"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpsertCommissionTier } from "@/actions/admin/commissions";
import { TierForm, type TierInitial } from "./tier-form";

/**
 * V-E8 — per-row actions for /admin/commissions/tiers.
 *   - ✏️ Edit  → expands inline edit form (TierForm in edit mode)
 *   - 🚫 Deactivate (when active) → flips is_active=false via upsert
 *   - 🔄 Re-activate (when inactive) → flips is_active=true via upsert
 *
 * No hard delete — historical accruals reference tier_id ON DELETE RESTRICT.
 */
export function TierRowActions({
  id,
  isActive,
  initial,
}: {
  id:       string;
  isActive: boolean;
  initial:  TierInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  function toggleActive() {
    startTransition(async () => {
      await adminUpsertCommissionTier({
        id,
        role_kind:      initial.role_kind,
        service_kind:   initial.service_kind,
        tier_name:      initial.tier_name,
        rate_pct:       initial.rate_pct,
        flat_thb:       initial.flat_thb,
        min_base_thb:   initial.min_base_thb,
        effective_from: initial.effective_from,
        effective_to:   initial.effective_to,
        is_active:      !isActive,
        notes:          initial.notes || undefined,
      });
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
          <TierForm mode="edit" id={id} initial={initial} />
        </div>
      </div>
    );
  }

  return (
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
            ? "border-red-200 text-red-600 hover:bg-red-50"
            : "border-green-200 text-green-700 hover:bg-green-50"
        } disabled:opacity-50`}
      >
        {isActive ? "🚫 ปิด" : "🔄 เปิด"}
      </button>
    </div>
  );
}
