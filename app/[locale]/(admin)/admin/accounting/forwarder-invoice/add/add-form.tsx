"use client";

/**
 * AddInvoiceForm — client component for the
 * `/admin/accounting/forwarder-invoice/add` page.
 *
 * Agent F3 · E2E LOOP FIX batch (2026-05-29).
 *
 * Workflow (matches legacy `add.php` semantics, Pacred design):
 *   1. Admin sees a table of all fstatus=5 forwarder rows not yet invoiced
 *   2. Selects ONE row (radio) — legacy supports many-per-customer but our
 *      receipt schema is 1-fid-per-rid, so we surface 1-at-a-time creation
 *   3. Picks due date · adds optional notes/discount
 *   4. Confirms → calls server action adminIssueForwarderInvoice
 *   5. On success → redirect to /admin/accounting/forwarder-invoice/[id]
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { adminIssueForwarderInvoice } from "@/actions/admin/forwarder-invoice";

export type CandidateRow = {
  id: number;
  userid: string;
  customer: string;
  fdate: string | null;
  tracking: string | null;
  cabinetNumber: string | null;
  amount: number;
  weight: number;
  volume: number;
  totalPrice: number;
  transportPrice: number;
  shippingService: number;
  discount: number;
  outstanding: number;
};

function fmtBaht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function AddInvoiceForm({
  candidates,
  dueDateDefault,
}: {
  candidates: CandidateRow[];
  dueDateDefault: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState(dueDateDefault);
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => candidates.find((c) => c.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  // Computed totals shown in "สรุปข้อมูล" panel
  const summary = useMemo(() => {
    if (!selected) {
      return { total: 0, deliveryChn: 0, deliveryTh: 0, other: 0, discount: 0, grandTotal: 0 };
    }
    const discountOverride = parseFloat(discount);
    const effectiveDiscount = Number.isFinite(discountOverride)
      ? discountOverride
      : selected.discount;
    return {
      total:        selected.totalPrice,
      deliveryChn:  selected.transportPrice,
      deliveryTh:   selected.shippingService,
      other:        0,
      discount:     effectiveDiscount,
      grandTotal:   Number.isFinite(discountOverride)
        ? selected.outstanding - (effectiveDiscount - selected.discount)
        : selected.outstanding,
    };
  }, [selected, discount]);

  const canSubmit = selected !== null && dueDate.length === 10 && !isPending;

  function handleConfirm() {
    if (!canSubmit || !selected) return;
    setError(null);
    setConfirmOpen(false);

    const discountOverride = parseFloat(discount);

    startTransition(async () => {
      const result = await adminIssueForwarderInvoice({
        forwarderId: selected.id,
        dueDate,
        discount: Number.isFinite(discountOverride) ? discountOverride : undefined,
        notes:    notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Success — push to the detail page
      router.push(`/admin/accounting/forwarder-invoice/${result.data!.receiptId}`);
    });
  }

  return (
    <>
      {/* Candidates table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto scrollbar-x-visible mb-4">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-center font-medium w-10">เลือก</th>
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">รหัสสมาชิก / ลูกค้า</th>
              <th className="px-3 py-2 text-left font-medium">วันที่</th>
              <th className="px-3 py-2 text-left font-medium">Tracking</th>
              <th className="px-3 py-2 text-right font-medium">กล่อง</th>
              <th className="px-3 py-2 text-right font-medium">น้ำหนัก (kg)</th>
              <th className="px-3 py-2 text-right font-medium">ปริมาตร (CBM)</th>
              <th className="px-3 py-2 text-right font-medium">ยอดค้างชำระ (฿)</th>
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-slate-500">
                  ไม่พบรายการฝากนำเข้าที่พร้อมออกใบแจ้งหนี้
                </td>
              </tr>
            ) : (
              candidates.map((c) => {
                const isSelected = c.id === selectedId;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`border-t border-slate-100 cursor-pointer ${
                      isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="radio"
                        name="forwarder-row"
                        checked={isSelected}
                        onChange={() => setSelectedId(c.id)}
                        className="size-4 accent-indigo-600"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-700">#{c.id}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{c.customer}</div>
                      <div className="text-xs text-slate-500">{c.userid}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(c.fdate)}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.tracking ?? "-"}
                      {c.cabinetNumber ? (
                        <div className="text-slate-400">ตู้: {c.cabinetNumber}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.amount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.weight.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.volume.toFixed(5)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      ฿{fmtBaht(c.outstanding)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Form panel — visible when a row is selected */}
      {selected && (
        <div className="rounded-lg border border-indigo-200 bg-white p-5 shadow-sm">
          <div className="grid md:grid-cols-3 gap-5">
            {/* Customer + dates */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                ข้อมูลใบแจ้งหนี้
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600">ลูกค้า</label>
                  <div className="mt-1 px-3 py-2 rounded border border-slate-200 bg-slate-50 text-sm">
                    {selected.customer}
                    <span className="text-slate-400 text-xs ml-2">({selected.userid})</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">รายการ ID</label>
                  <div className="mt-1 px-3 py-2 rounded border border-slate-200 bg-slate-50 text-sm">
                    #{selected.id} {selected.tracking ? `· ${selected.tracking}` : ""}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">
                    วันที่ครบกำหนดชำระ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded border border-slate-300 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">
                    ส่วนลด (override · ปล่อยว่าง = ใช้ค่าเดิม)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder={selected.discount.toFixed(2)}
                    className="mt-1 w-full px-3 py-2 rounded border border-slate-300 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-600">
                    หมายเหตุสำหรับลูกค้า (พิมพ์บนใบแจ้งหนี้)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="mt-1 w-full px-3 py-2 rounded border border-slate-300 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">สรุปข้อมูล</h3>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Total</dt>
                  <dd className="tabular-nums">฿{fmtBaht(summary.total)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Delivery CHN</dt>
                  <dd className="tabular-nums">฿{fmtBaht(summary.deliveryChn)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Delivery TH</dt>
                  <dd className="tabular-nums">฿{fmtBaht(summary.deliveryTh)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">ส่วนลด</dt>
                  <dd className="tabular-nums text-red-600">-฿{fmtBaht(summary.discount)}</dd>
                </div>
                <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between text-base font-semibold">
                  <dt className="text-slate-900">ยอดสุทธิ</dt>
                  <dd className="tabular-nums text-indigo-700">฿{fmtBaht(summary.grandTotal)}</dd>
                </div>
              </dl>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              ผิดพลาด: {error}
            </div>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="px-4 py-2 rounded border border-slate-300 text-sm hover:bg-slate-50"
              disabled={isPending}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit}
              className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "กำลังสร้าง..." : "สร้างใบแจ้งหนี้"}
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              ยืนยันการสร้างใบแจ้งหนี้
            </h3>
            <p className="text-sm text-slate-700 mb-4">
              คุณกำลังจะสร้างใบแจ้งหนี้ให้ลูกค้า <span className="font-semibold">{selected.customer}</span>
              {" "}({selected.userid}) สำหรับรายการ #{selected.id}
              {" "}ยอด <span className="font-semibold text-indigo-700">฿{fmtBaht(summary.grandTotal)}</span>
              {" "}ครบกำหนด {dueDate}
            </p>
            <p className="text-xs text-slate-500 mb-4">
              ระบบจะส่งแจ้งเตือนไปยังลูกค้าทาง LINE / อีเมล / SMS โดยอัตโนมัติ
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded border border-slate-300 text-sm hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                ยืนยันสร้าง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
