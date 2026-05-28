"use client";

/**
 * Tiny trigger button + modal wrapper for the cost-edit flow.
 *
 * Wave 16 P0-3 (2026-05-25) — convenience wrapper around
 * `ForwarderCostEditModal` so admin table rows can just drop one element
 * per cost action instead of wiring `useState` for each row.
 *
 * Faithful port of the 3 legacy trigger links in `report-cnt.php` L1878-1880:
 *
 *   <a onclick="editCost(ID)">           <i class="ft-edit"></i>
 *   <a onclick="editCost2(ID, sheetCost)"><i class="ft-edit">2</i>
 *   <a onclick="editCostSheet(ID)">      <i class="ft-edit"></i>S
 *
 * Same icon (lucide `Pencil` ≈ ft-edit) with a discriminator suffix per
 * variant. Tooltip mirrors the legacy `title=""` attribute.
 *
 * Per AGENTS.md §0a: the icon affordance is the same logical click target,
 * but Tailwind + Lucide instead of jQuery + flat-icons. The behaviour is
 * literally identical (open modal · admin types · save · refresh).
 *
 * Caller passes the same forwarder snapshot the legacy passes to the JS
 * function — see ForwarderCostEditTarget. Refresh strategy is via the
 * `onSaved` callback; default behaviour (no callback) is a no-op so the
 * page must call `router.refresh()` explicitly if it wants a re-fetch.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  ForwarderCostEditModal,
  type ForwarderCostEditMode,
  type ForwarderCostEditTarget,
} from "./forwarder-cost-edit-modal";

type Props = {
  mode:      ForwarderCostEditMode;
  forwarder: ForwarderCostEditTarget;
  /**
   * Mode 2 only — sheet cost value used to pre-fill the input. Defaults to
   * `forwarder.fCostTotalPriceSheet` when not provided (the typical case —
   * a row that has the sheet cost in the snapshot just opens the modal with
   * the same value lifted from there).
   */
  sheetCost?: number;
  /**
   * Called after a successful UPDATE. If omitted, the button calls
   * `router.refresh()` to re-fetch the parent server component.
   */
  onSaved?:  () => void;
  /** Optional custom label. Default is the legacy icon-only affordance. */
  label?:    React.ReactNode;
  /** Optional className passed through to the trigger button. */
  className?: string;
};

const MODE_TITLE: Record<ForwarderCostEditMode, string> = {
  editCost:      "แก้ไขราคาต้นทุน PCS",
  editCost2:     "แก้ไขราคาต้นทุน PCS รับค่าจาก S: (ต้นทุนจากใน sheet แสง)",
  editCostSheet: "แก้ไขราคาต้นทุน Sheet",
};

// Suffix character on the icon — matches legacy ft-edit / ft-edit2 / ft-editS
// affordance distinction. Empty string for default mode.
const MODE_SUFFIX: Record<ForwarderCostEditMode, string> = {
  editCost:      "",
  editCost2:     "2",
  editCostSheet: "S",
};

export function ForwarderCostEditButton({
  mode,
  forwarder,
  sheetCost,
  onSaved,
  label,
  className,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // `useTransition` keeps router.refresh non-blocking + lets us hide a
  // double-click while the server re-fetches.
  const [, startTransition] = useTransition();

  function handleSaved() {
    if (onSaved) {
      onSaved();
    } else {
      startTransition(() => router.refresh());
    }
  }

  const triggerCls =
    className ??
    "inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700 text-sm";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={MODE_TITLE[mode]}
        aria-label={MODE_TITLE[mode]}
        className={triggerCls}
      >
        {label ?? (
          <>
            <Pencil className="h-3.5 w-3.5" />
            {MODE_SUFFIX[mode] && (
              <span className="text-[10px] font-bold leading-none">
                {MODE_SUFFIX[mode]}
              </span>
            )}
          </>
        )}
      </button>

      {open && (
        <ForwarderCostEditModal
          mode={mode}
          forwarder={forwarder}
          sheetCost={
            mode === "editCost2"
              ? sheetCost ?? forwarder.fCostTotalPriceSheet
              : undefined
          }
          onClose={() => setOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
