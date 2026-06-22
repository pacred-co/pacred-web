"use client";

/**
 * Cabinet-list table cell — preview chips + "ดูทั้งหมด" modal.
 *
 * Wave 23 P1 #E (2026-05-27 ภูม flag · live walkthrough):
 *   /admin/cnt-hs row "หมายเลขตู้" column used to render the legacy
 *   `cntname` field RAW (CSV like "GZS0517732,GZE0515893,..." with 40+
 *   codes for big batches). The CSV text wrapped and BLEEDED into the
 *   next row, breaking the table layout. The prior fix (Wave 23 P1 #9 ·
 *   cnt-hs DETAIL page) used a 3-visible + `<details>` toggle — but it
 *   only fixed the DETAIL page. The LIST page kept the raw cntname AND
 *   added chips below, so the bleed continued.
 *
 *   This cell drops the raw cntname display entirely and shows:
 *     - First 3 cabinet codes as chips
 *     - "และอีก N ตู้" badge that opens a PacredDialog
 *     - Dialog shows ALL cabinets in a grid + a "คัดลอกทั้งหมด" button
 *       (handy when ops want to paste the list into LINE / email)
 *
 *   Total row height is bounded regardless of cabinet count.
 */

import { useRef, useState } from "react";
import { PacredDialog } from "@/components/ui/pacred-dialog";

const VISIBLE = 3;

const CHIP_CLS =
  "inline-block rounded border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[11px] font-mono text-primary-700";

export function CabinetListCell({
  cntId,
  cabinets,
}: {
  cntId: number;
  cabinets: string[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  if (cabinets.length === 0) {
    return <span className="text-muted text-[11px]">—</span>;
  }

  const visible = cabinets.slice(0, VISIBLE);
  const hiddenCount = Math.max(0, cabinets.length - VISIBLE);

  function openDialog() {
    setCopied(false);
    dialogRef.current?.showModal();
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(cabinets.join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked (insecure context · permissions etc.) — soft-fail
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-1 items-center">
        {visible.map((c, i) => (
          <span key={`${cntId}-cab-${i}`} className={CHIP_CLS}>
            {c}
          </span>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={openDialog}
            className="inline-block rounded border border-border bg-surface-alt px-1.5 py-0.5 text-[11px] font-mono text-muted hover:bg-surface-alt/70 hover:border-primary-300 hover:text-primary-700 cursor-pointer transition"
            title={`คลิกเพื่อดูทั้งหมด ${cabinets.length} ตู้`}
          >
            … +{hiddenCount} ตู้
          </button>
        )}
      </div>

      <PacredDialog
        dialogRef={dialogRef}
        title={`หมายเลขตู้ทั้งหมด — ${cabinets.length} ตู้ (cnt #${cntId})`}
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">
            รายการตู้คอนเทนเนอร์ทั้งหมดที่ผูกกับใบเบิกเงิน
            <code className="mx-1 rounded bg-surface-alt px-1 font-mono">cnt #{cntId}</code>
            (แสดงเรียงตามลำดับใน <code className="font-mono">tb_cnt_item</code>)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-surface-alt/40 p-3">
            {cabinets.map((c, i) => (
              <span
                key={`dlg-${cntId}-${i}`}
                className={`${CHIP_CLS} text-center break-all`}
                title={c}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
        {/* Inline footer (DialogFooter is for form submit · this is just
            view + copy · no submit needed) */}
        <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={copyAll}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt"
          >
            {copied ? "✓ คัดลอกแล้ว" : "📋 คัดลอกทั้งหมด"}
          </button>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700"
          >
            ปิด
          </button>
        </div>
      </PacredDialog>
    </>
  );
}
