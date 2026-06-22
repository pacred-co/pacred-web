"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpsertCarrier, adminDeactivateCarrier } from "@/actions/admin/carriers";
import { CarrierForm } from "./carrier-form";

type Initial = {
  name_th:               string;
  name_en:               string;
  tracking_url_template: string;
  sort_order:            number;
  note:                  string;
};

/**
 * Per-row action UI for /admin/carriers (U2-3).
 *   - ✏️ Edit → expands inline edit form (full CarrierForm in edit mode)
 *   - 🔄 Re-activate (only when inactive) → flips is_active=true via upsert
 *   - 🚫 Deactivate (only when active) → soft-delete via adminDeactivateCarrier
 *
 * No hard-delete button — admin should never lose audit history.
 */

export function CarrierRowActions({
  id,
  isActive,
  initial,
}: {
  id:       string;
  isActive: boolean;
  initial:  Initial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  function toggleActive() {
    startTransition(async () => {
      if (isActive) {
        // Deactivate
        await adminDeactivateCarrier(id);
      } else {
        // Re-activate via upsert
        await adminUpsertCarrier({
          id,
          name_th:    initial.name_th,
          name_en:    initial.name_en,
          is_active:  true,
          sort_order: initial.sort_order,
        });
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
          className="text-[11px] text-muted hover:underline"
        >
          ← ปิดฟอร์ม
        </button>
        <div className="rounded-lg border border-border bg-surface-alt/40 p-3">
          <CarrierForm mode="edit" id={id} initial={initial} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-lg border border-border bg-white px-2 py-1 text-[11px] hover:bg-surface-alt"
        disabled={pending}
      >
        ✏️ แก้
      </button>
      <button
        type="button"
        onClick={toggleActive}
        disabled={pending}
        className={`rounded-lg border px-2 py-1 text-[11px] ${
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
