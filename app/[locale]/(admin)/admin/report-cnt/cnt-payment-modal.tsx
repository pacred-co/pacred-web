"use client";

/**
 * <CntPaymentModal> — Wave 17 P0-fix (2026-05-25 ค่ำ)
 *
 * In-page modal for the "ทำรายการจ่ายเงินตู้" workflow. Replaces the
 * old `/admin/report-cnt/pay` separate page so admin can tick containers
 * on the list itself and open the form right there (matches legacy AJAX
 * modal in `pcs-admin/include/pages/report-cnt/getListCNTPay.php`).
 *
 * **Wording correction:** Legacy uses BOTH "เบิก" (cnt-hs.php title) AND
 * "จ่าย" (report-cnt.php button) — they're the same financial event from
 * 2 perspectives. We use "เบิก" because:
 *   - It correctly conveys "filing a request that needs approval"
 *     (cntStatus=1 → manager approves → cntStatus=2)
 *   - Legacy cnt-hs.php (the ledger) uses "รายการจ่ายเงินตู้"
 *   - The old Pacred wording "บันทึกรายการจ่ายเงินตู้" implied
 *     "fait accompli" which is wrong — we're SUBMITTING, not RECORDING.
 */

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminCreateCntPayment } from "@/actions/admin/cnt-payment";
import { StyledFileInput } from "@/components/ui/styled-file-input";

export type SelectedSummary = {
  fcabinetnumber: string;
  warehouseLabel: string;
  costSum: number;
  trackCount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Snapshot of the selected containers — drives the in-modal summary */
  selected: SelectedSummary[];
};

export function CntPaymentModal({ open, onClose, selected }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [successFlash, setSuccessFlash] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Lock body scroll while modal is open + restore on close
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  const totalSelectedAmount = selected.reduce((s, c) => s + c.costSum, 0);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessFlash(null);
    if (selected.length === 0) {
      setError("กรุณาเลือกตู้อย่างน้อย 1 ตู้");
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      cabinetNumbers: selected.map((s) => s.fcabinetnumber),
      cntAmount:      Number(fd.get("cntAmount") ?? 0),
      nameBlank:      String(fd.get("nameBlank") ?? "").trim(),
      noBlank:        String(fd.get("noBlank") ?? "").trim(),
      nameAccount:    String(fd.get("nameAccount") ?? "").trim(),
    };
    const file = (fd.get("cntFile") as File | null) ?? null;

    startTransition(async () => {
      const result = await adminCreateCntPayment(input, file && file.size > 0 ? file : null);
      if (!result.ok) {
        setError(result.error ?? "ส่งคำขอไม่สำเร็จ");
        return;
      }
      setSuccessFlash(
        `ส่งคำขอจ่ายเงินตู้แล้ว ${selected.length} ตู้ · รอผู้จัดการอนุมัติ`,
      );
      // Brief delay so user reads the toast before redirect
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 1500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cnt-payment-modal-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="ปิด"
        onClick={() => { if (!pending) onClose(); }}
        className="absolute inset-0 bg-black/50 cursor-default"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-3xl rounded-2xl bg-white dark:bg-surface shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 id="cnt-payment-modal-title" className="text-lg font-semibold text-foreground">
              💸 ทำรายการจ่ายเงินตู้
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {selected.length} ตู้ที่เลือก · ยอดต้นทุนรวม{" "}
              <b className="text-foreground">
                ฿{totalSelectedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </b>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-muted hover:text-foreground text-2xl leading-none disabled:opacity-30"
            aria-label="ปิด"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Left: selected container list (read-only summary) */}
            <div className="p-4">
              <h3 className="text-sm font-medium mb-2">ตู้ที่จะเบิกเงิน</h3>
              {selected.length === 0 ? (
                <div className="text-xs text-muted text-center py-8">
                  ยังไม่ได้เลือกตู้ — ติ๊กในรายการก่อนกดปุ่ม
                </div>
              ) : (
                <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-alt/80 text-[10px] uppercase text-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left">หมายเลขตู้</th>
                        <th className="px-2 py-1.5 text-left">โกดัง</th>
                        <th className="px-2 py-1.5 text-right">รายการ</th>
                        <th className="px-2 py-1.5 text-right">ต้นทุน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.map((c) => (
                        <tr key={c.fcabinetnumber} className="border-t border-border">
                          <td className="px-2 py-1.5 font-mono">{c.fcabinetnumber}</td>
                          <td className="px-2 py-1.5">{c.warehouseLabel}</td>
                          <td className="px-2 py-1.5 text-right">{c.trackCount}</td>
                          <td className="px-2 py-1.5 text-right">{c.costSum.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right: form */}
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-medium">ข้อมูลการโอนเงิน</h3>
              <label className="block">
                <span className="text-xs text-muted">ชื่อธนาคารปลายทาง</span>
                <input
                  name="nameBlank" required disabled={pending}
                  className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm disabled:bg-surface-alt/50"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted">เลขที่บัญชี</span>
                <input
                  name="noBlank" required disabled={pending}
                  className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm disabled:bg-surface-alt/50"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted">ชื่อบัญชี</span>
                <input
                  name="nameAccount" required disabled={pending}
                  className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm disabled:bg-surface-alt/50"
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted">ยอดเงินที่ขอเบิก (บาท)</span>
                <input
                  name="cntAmount" type="number" step="0.01" min="0" required disabled={pending}
                  defaultValue={totalSelectedAmount.toFixed(2)}
                  className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm disabled:bg-surface-alt/50"
                />
              </label>
              <div className="block">
                <span className="text-xs text-muted">ไฟล์สลิป — ไม่บังคับ</span>
                <div className="mt-1">
                  <StyledFileInput
                    name="cntFile"
                    accept="application/pdf"
                    disabled={pending}
                    label="แนบสลิปการโอน (คลิกเพื่อเลือกไฟล์ PDF)"
                    hint="PDF · ไม่เกิน 10MB · ไม่บังคับ"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Status messages */}
          {error && (
            <div className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
          {successFlash && (
            <div className="mx-4 mb-3 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-700">
              ✅ {successFlash}
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border bg-surface-alt/30 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted">
              ส่งแล้วระบบจะสร้างคำขอ <span className="font-mono">cntStatus=1</span> รออนุมัติที่{" "}
              <span className="text-foreground">/admin/cnt-hs?q=1</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={pending || selected.length === 0}
                className="rounded-md bg-primary-500 text-white px-4 py-1.5 text-xs font-semibold hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {pending
                  ? "กำลังส่งคำขอ..."
                  : `ทำรายการจ่ายเงินตู้ (${selected.length} ตู้)`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
