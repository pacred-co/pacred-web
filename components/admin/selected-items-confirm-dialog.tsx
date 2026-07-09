"use client";

/**
 * <SelectedItemsConfirmDialog> — reusable itemized selection-confirm popup.
 *
 * The legacy-faithful "รายการที่เลือก N/N รายการ" confirm modal: it lists the
 * exact rows a bulk action is about to touch (เลขที่ออเดอร์ · เลขแทรคกิ้ง ·
 * รหัสลูกค้า · สถานะสินค้า · optional จำนวนเงิน) with an optional TOTAL footer,
 * a ยกเลิก button, and a primary confirm button. It is a confirm-before-mutate
 * step ONLY (§0f) — it renders WHAT is about to happen; the actual mutation
 * (add-to-check / bill) fires from the caller's `onConfirm` and is unchanged.
 *
 * Shared by:
 *   1. report-cnt add-to-check ("เพิ่มไปยังรายการตรวจสอบแล้ว" · no amount)
 *   2. forwarder-check bulk-bill ("เรียกเก็บเงินลูกค้ารายการนำเข้า …" · +amount+total)
 *
 * One component = one source of truth (no drift between the two surfaces).
 * Native `<dialog>` chrome mirrors `components/ui/pacred-dialog.tsx`
 * (no backdrop/ESC close — owner directive 2026-07-05).
 */

import { useEffect, useRef, type ReactNode } from "react";

export type SelectedItemRow = {
  orderNo: string;
  tracking: string;
  customerCode: string;
  status: string;
  /** จำนวนเงิน (THB) — only rendered when `showAmount` is set. */
  amount?: number;
};

function money(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function SelectedItemsConfirmDialog({
  open,
  title,
  rows,
  showAmount = false,
  total,
  note,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  open: boolean;
  title: string;
  rows: SelectedItemRow[];
  /** Show the จำนวนเงิน column (+ enables the TOTAL footer when `total` is set). */
  showAmount?: boolean;
  /** Σ of the selected rows' amounts — rendered as a footer row when `showAmount`. */
  total?: number;
  /** Optional notice above the table (e.g. status-change / SMS-channel warning). */
  note?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Drive the native <dialog> from the controlled `open` prop.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Owner directive 2026-07-05: no backdrop-click close, no ESC close —
      // resolve via the explicit ยกเลิก / primary buttons only.
      onCancel={(e) => e.preventDefault()}
      className="animate-fade-in m-auto rounded-lg p-0 border border-gray-200 shadow-xl backdrop:bg-black/40 max-h-[90vh] w-[min(720px,95vw)]"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <button
          type="button"
          aria-label="ปิด"
          onClick={onCancel}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1={18} y1={6} x2={6} y2={18} />
            <line x1={6} y1={6} x2={18} y2={18} />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto max-h-[calc(90vh-7rem)] px-5 py-4 text-left">
        {note && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {note}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-600">
                <th className="border-b border-gray-200 px-2 py-1.5 font-medium">เลขที่ออเดอร์</th>
                <th className="border-b border-gray-200 px-2 py-1.5 font-medium">เลขแทรคกิ้ง</th>
                <th className="border-b border-gray-200 px-2 py-1.5 font-medium">รหัสลูกค้า</th>
                <th className="border-b border-gray-200 px-2 py-1.5 font-medium">สถานะสินค้า</th>
                {showAmount && (
                  <th className="border-b border-gray-200 px-2 py-1.5 text-right font-medium">จำนวนเงิน</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.orderNo}-${r.tracking}-${i}`} className="odd:bg-white even:bg-gray-50/60">
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-900">{r.orderNo}</td>
                  <td className="border-b border-gray-100 px-2 py-1.5 font-mono text-gray-700">{r.tracking}</td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-700">{r.customerCode}</td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-700">{r.status}</td>
                  {showAmount && (
                    <td className="border-b border-gray-100 px-2 py-1.5 text-right font-mono text-gray-900">
                      {r.amount != null ? money(r.amount) : "-"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {showAmount && total != null && (
              <tfoot>
                <tr className="bg-gray-100 font-semibold text-gray-900">
                  <td className="px-2 py-1.5" colSpan={4}>รวมทั้งหมด</td>
                  <td className="px-2 py-1.5 text-right font-mono text-red-700">฿{money(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? "กำลังดำเนินการ…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
