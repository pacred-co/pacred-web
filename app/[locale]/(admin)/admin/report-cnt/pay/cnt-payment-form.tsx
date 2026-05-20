"use client";

/**
 * <CntPaymentForm>
 *
 * Client-side form for /admin/report-cnt/pay. Multi-select unpaid
 * containers + the 4 payment-metadata fields + a PDF upload. Submits
 * via the Server Action `adminCreateCntPayment` (built by Agent 4 ·
 * actions/admin/cnt-payment.ts).
 *
 * Wave 2D-min: plain client form, no DataTables, no SweetAlert. The
 * legacy bulk-action flow (jQuery DT checkboxes + count badge + AJAX
 * confirm modal) is faithful-to-result, not faithful-to-UX. Wave 3
 * polish can layer the DataTables + sweetalert in.
 */

import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminCreateCntPayment } from "@/actions/admin/cnt-payment";

type UnpaidContainer = {
  fcabinetnumber: string;
  warehouseLabel: string;
  transportLabel: string;
  trackCount: number;
  weightSum: number;
  volumeSum: number;
  costSum: number;
  priceSum: number;
  closeDate: string;
};

export function CntPaymentForm({ unpaidContainers }: { unpaidContainers: UnpaidContainer[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelected(new Set(unpaidContainers.map((c) => c.fcabinetnumber)));
    else setSelected(new Set());
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("กรุณาเลือกตู้อย่างน้อย 1 ตู้");
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      cabinetNumbers: Array.from(selected),
      cntAmount:      Number(fd.get("cntAmount") ?? 0),
      nameBlank:      String(fd.get("nameBlank") ?? "").trim(),
      noBlank:        String(fd.get("noBlank") ?? "").trim(),
      nameAccount:    String(fd.get("nameAccount") ?? "").trim(),
    };
    const file = (fd.get("cntFile") as File | null) ?? null;

    startTransition(async () => {
      const result = await adminCreateCntPayment(input, file && file.size > 0 ? file : null);
      if (!result.ok) {
        setError(result.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      router.push("/admin/cnt-hs?recent=1");
      router.refresh();
    });
  };

  const totalSelectedAmount = unpaidContainers
    .filter((c) => selected.has(c.fcabinetnumber))
    .reduce((sum, c) => sum + c.costSum, 0);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: container list */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-3 py-2 bg-surface-alt/50 text-xs font-medium border-b border-border flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                onChange={toggleAll}
                checked={selected.size > 0 && selected.size === unpaidContainers.length}
              />
              <span>เลือกตู้ ({selected.size}/{unpaidContainers.length})</span>
            </label>
            <span className="text-muted">รวมต้นทุนที่เลือก: <b>{totalSelectedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-alt/80 text-[10px] uppercase text-muted">
                <tr>
                  <th className="px-2 py-2"></th>
                  <th className="px-2 py-2 text-left">หมายเลขตู้</th>
                  <th className="px-2 py-2 text-left">โกดัง</th>
                  <th className="px-2 py-2 text-center">ขนส่ง</th>
                  <th className="px-2 py-2 text-right">tracking</th>
                  <th className="px-2 py-2 text-right">ต้นทุน</th>
                  <th className="px-2 py-2 text-left">ปิดตู้</th>
                </tr>
              </thead>
              <tbody>
                {unpaidContainers.map((c) => {
                  const isOn = selected.has(c.fcabinetnumber);
                  return (
                    <tr
                      key={c.fcabinetnumber}
                      className={`border-t border-border cursor-pointer hover:bg-surface-alt/30 ${isOn ? "bg-green-50/40" : ""}`}
                      onClick={() => toggle(c.fcabinetnumber)}
                    >
                      <td className="px-2 py-2"><input type="checkbox" checked={isOn} onChange={() => toggle(c.fcabinetnumber)} onClick={(e) => e.stopPropagation()} /></td>
                      <td className="px-2 py-2 font-mono">{c.fcabinetnumber}</td>
                      <td className="px-2 py-2">{c.warehouseLabel}</td>
                      <td className="px-2 py-2 text-center">{c.transportLabel}</td>
                      <td className="px-2 py-2 text-right">{c.trackCount}</td>
                      <td className="px-2 py-2 text-right">{c.costSum.toFixed(2)}</td>
                      <td className="px-2 py-2">{c.closeDate}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: form */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-medium">ข้อมูลการโอนเงิน</h2>
          <label className="block">
            <span className="text-xs text-muted">ชื่อธนาคารปลายทาง</span>
            <input name="nameBlank" required className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-muted">เลขที่บัญชี</span>
            <input name="noBlank" required className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-muted">ชื่อบัญชี</span>
            <input name="nameAccount" required className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-muted">ยอดเงินที่จ่าย (บาท)</span>
            <input name="cntAmount" type="number" step="0.01" min="0" required className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs text-muted">ไฟล์สลิป (PDF · ไม่เกิน 10MB)</span>
            <input name="cntFile" type="file" accept="application/pdf" className="mt-1 w-full text-sm" />
          </label>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={pending || selected.size === 0}
            className="w-full rounded-md bg-green-600 text-white px-3 py-2 text-sm font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {pending ? "กำลังบันทึก..." : `บันทึกรายการจ่ายเงินตู้ (${selected.size} ตู้)`}
          </button>
        </div>
      </div>
    </form>
  );
}
