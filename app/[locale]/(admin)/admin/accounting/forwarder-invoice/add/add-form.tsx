"use client";

/**
 * AddInvoiceForm — client component for the
 * `/admin/accounting/forwarder-invoice/add` page (MANUAL OVERRIDE).
 *
 * Wave 29 P0 #206+#208 (2026-05-30) — pivoted from Wave 28 F3's single-row
 * radio to a multi-row checkbox batch select. Matches legacy
 * `pcs-admin/include/pages/hs-forwarder-invoice/add.php` which uses the
 * jquery-datatables-checkboxes plugin for multi-select per customer.
 *
 * Workflow (legacy semantics · Pacred design):
 *   1. Server loads ALL fstatus=5 forwarder rows for the searched customer
 *      (or all, if no userid filter) that are NOT yet on a tb_receipt
 *   2. Admin filters by userid (a single customer's basket) — UI groups by
 *      customer, but submit requires all-from-one-customer
 *   3. Admin ticks ≥ 1 rows (multi-select), sets issue+due date + notes
 *   4. Submit → adminIssueForwarderInvoice({ fids, issueDate, dueDate, notes })
 *      → ONE tb_receipt + N × tb_receipt_item
 *   5. Redirect to /admin/accounting/forwarder-invoice/[receiptId]
 *
 * Manual override banner: explains this is for the case where the auto-
 * receipt hook (lib/admin/auto-issue-receipt.ts) failed or accounting
 * needs to consolidate fids manually.
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
  issueDateDefault,
  dueDateDefault,
}: {
  candidates: CandidateRow[];
  issueDateDefault: string;
  dueDateDefault: string;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [issueDate, setIssueDate] = useState(issueDateDefault);
  const [dueDate, setDueDate] = useState(dueDateDefault);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Picked rows + the userid they share. If multiple userids → error inline.
  const selected = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  );

  const uniqueUserIds = useMemo(
    () => Array.from(new Set(selected.map((s) => s.userid))),
    [selected],
  );
  const mixedCustomer = uniqueUserIds.length > 1;
  const sharedUserid = uniqueUserIds.length === 1 ? uniqueUserIds[0]! : "";
  const sharedCustomer = uniqueUserIds.length === 1 ? selected[0]!.customer : "";

  // Totals (pre-WHT) — server re-computes for the actual receipt, but the
  // UI summary shows the admin what they're about to commit.
  const summary = useMemo(() => {
    const total = selected.reduce((s, r) => s + r.outstanding, 0);
    return {
      rows:        selected.length,
      grandTotal:  Math.round(total * 100) / 100,
    };
  }, [selected]);

  const canSubmit =
    selected.length > 0 &&
    !mixedCustomer &&
    issueDate.length === 10 &&
    dueDate.length === 10 &&
    !isPending;

  function toggleRow(id: number, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllForUser(userid: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of candidates) {
        if (c.userid === userid) {
          if (checked) next.add(c.id);
          else next.delete(c.id);
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setNotes("");
    setError(null);
  }

  function handleConfirm() {
    if (!canSubmit || selected.length === 0) return;
    setError(null);
    setConfirmOpen(false);

    startTransition(async () => {
      const result = await adminIssueForwarderInvoice({
        fids:      selected.map((s) => s.id),
        issueDate,
        dueDate,
        notes:     notes.trim() || undefined,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Success — push to the detail page
      router.push(`/admin/accounting/forwarder-invoice/${result.data!.receiptId}`);
    });
  }

  // Group candidates by userid so admin can see per-customer baskets.
  const groupedByUser = useMemo(() => {
    const m = new Map<string, CandidateRow[]>();
    for (const c of candidates) {
      const arr = m.get(c.userid) ?? [];
      arr.push(c);
      m.set(c.userid, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [candidates]);

  return (
    <>
      {/* Manual override banner */}
      <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 mb-4 text-sm text-amber-900">
        <div className="font-semibold flex items-center gap-2">
          <span>🛠</span>
          <span>Manual override — ใช้เมื่อ auto-receipt fail หรือต้องการรวมหลายออเดอร์</span>
        </div>
        <div className="text-xs mt-1 text-amber-700">
          ปกติใบเสร็จจะถูกสร้างอัตโนมัติเมื่อ admin อนุมัติสลิป (status flip 1→2 บน tb_wallet_hs).
          หน้านี้สำหรับเคสที่ระบบ auto-create ทำงานไม่สำเร็จ หรือต้องการรวมหลายรายการเป็นใบเดียว.
        </div>
      </div>

      {/* Candidates table — multi-row checkbox grouped by customer */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto scrollbar-x-visible mb-4">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-center font-medium w-10">เลือก</th>
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">วันที่</th>
              <th className="px-3 py-2 text-left font-medium">Tracking</th>
              <th className="px-3 py-2 text-right font-medium">กล่อง</th>
              <th className="px-3 py-2 text-right font-medium">น้ำหนัก (kg)</th>
              <th className="px-3 py-2 text-right font-medium">ปริมาตร (CBM)</th>
              <th className="px-3 py-2 text-right font-medium">ยอดค้างชำระ (฿)</th>
            </tr>
          </thead>
          <tbody>
            {groupedByUser.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-slate-500">
                  ไม่พบรายการฝากนำเข้าที่พร้อมออกใบเสร็จ
                </td>
              </tr>
            ) : (
              groupedByUser.map(([userid, rows]) => {
                const allSelected = rows.every((r) => selectedIds.has(r.id));
                const someSelected = rows.some((r) => selectedIds.has(r.id));
                const customerName = rows[0]!.customer;
                return (
                  <Section
                    key={userid}
                    userid={userid}
                    customerName={customerName}
                    rows={rows}
                    selectedIds={selectedIds}
                    allSelected={allSelected}
                    someSelected={someSelected}
                    onToggleRow={toggleRow}
                    onToggleAllForUser={(checked) => toggleAllForUser(userid, checked)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {mixedCustomer && (
        <div className="mt-3 mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          ผิดพลาด: ใบเสร็จเดียวต้องมาจากลูกค้ารายเดียวกันเท่านั้น — คุณเลือกข้ามรหัสสมาชิก ({uniqueUserIds.join(", ")})
        </div>
      )}

      {/* Form panel — visible when ≥ 1 row selected from a single customer */}
      {selected.length > 0 && !mixedCustomer && (
        <div className="rounded-lg border border-indigo-200 bg-white p-5 shadow-sm">
          <div className="grid md:grid-cols-3 gap-5">
            {/* Customer + dates + notes */}
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                ข้อมูลใบเสร็จรับเงิน (Manual Override)
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-600">ลูกค้า</label>
                  <div className="mt-1 px-3 py-2 rounded border border-slate-200 bg-slate-50 text-sm">
                    {sharedCustomer}
                    <span className="text-slate-400 text-xs ml-2">({sharedUserid})</span>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-600">รายการที่เลือก</label>
                  <div className="mt-1 px-3 py-2 rounded border border-slate-200 bg-slate-50 text-sm">
                    {selected.length} รายการ:{" "}
                    {selected.slice(0, 5).map((s) => `#${s.id}`).join(", ")}
                    {selected.length > 5 ? ` และอีก ${selected.length - 5} รายการ` : ""}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">
                    วันที่ออกเอกสาร <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded border border-slate-300 text-sm"
                    required
                  />
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
                <div className="col-span-2">
                  <label className="text-xs text-slate-600">
                    หมายเหตุสำหรับลูกค้า (พิมพ์บนใบเสร็จ)
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
                  <dt className="text-slate-600">รายการที่เลือก</dt>
                  <dd className="tabular-nums">{summary.rows} รายการ</dd>
                </div>
                <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between text-base font-semibold">
                  <dt className="text-slate-900">ยอดค้างชำระรวม</dt>
                  <dd className="tabular-nums text-indigo-700">฿{fmtBaht(summary.grandTotal)}</dd>
                </div>
                <div className="text-xs text-slate-500 pt-2">
                  ยอดสุทธิจะคำนวณตามนิติบุคคล/บุคคล (หัก ณ ที่จ่าย 1% เฉพาะนิติฯ ≥ ฿1,000)
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
              onClick={clearSelection}
              className="px-4 py-2 rounded border border-slate-300 text-sm hover:bg-slate-50"
              disabled={isPending}
            >
              ยกเลิก (เคลียร์ที่เลือก)
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit}
              className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "กำลังสร้าง..." : `สร้างใบเสร็จ (${selected.length} รายการ)`}
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmOpen && selected.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">
              ยืนยันการสร้างใบเสร็จ (Manual Override)
            </h3>
            <p className="text-sm text-slate-700 mb-2">
              คุณกำลังจะสร้าง <span className="font-semibold">1 ใบเสร็จ</span>{" "}
              ที่ครอบ <span className="font-semibold">{selected.length} รายการ</span>
            </p>
            <p className="text-sm text-slate-700 mb-2">
              ลูกค้า: <span className="font-semibold">{sharedCustomer}</span>{" "}
              ({sharedUserid})
            </p>
            <p className="text-sm text-slate-700 mb-2">
              ยอดค้างชำระรวม: <span className="font-semibold text-indigo-700">฿{fmtBaht(summary.grandTotal)}</span>
            </p>
            <p className="text-sm text-slate-700 mb-4">
              วันที่ออก: {issueDate} · ครบกำหนด: {dueDate}
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

// ────────────────────────────────────────────────────────────
// Section — one customer's basket of fstatus=5 rows
// ────────────────────────────────────────────────────────────

function Section({
  userid,
  customerName,
  rows,
  selectedIds,
  allSelected,
  someSelected,
  onToggleRow,
  onToggleAllForUser,
}: {
  userid: string;
  customerName: string;
  rows: CandidateRow[];
  selectedIds: Set<number>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleRow: (id: number, checked: boolean) => void;
  onToggleAllForUser: (checked: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-slate-50 border-t border-slate-200">
        <td className="px-3 py-2 text-center">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected;
            }}
            onChange={(e) => onToggleAllForUser(e.target.checked)}
            className="size-4 accent-indigo-600"
            aria-label={`เลือกทุกรายการของ ${userid}`}
          />
        </td>
        <td colSpan={7} className="px-3 py-2 text-sm font-medium text-slate-700">
          <span className="font-semibold text-slate-900">{customerName}</span>
          <span className="text-xs text-slate-500 ml-2">{userid}</span>
          <span className="text-xs text-slate-500 ml-2">({rows.length} รายการ)</span>
        </td>
      </tr>
      {rows.map((c) => {
        const isSelected = selectedIds.has(c.id);
        return (
          <tr
            key={c.id}
            onClick={() => onToggleRow(c.id, !isSelected)}
            className={`border-t border-slate-100 cursor-pointer ${
              isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
            }`}
          >
            <td className="px-3 py-2 text-center">
              <input
                type="checkbox"
                name="forwarder-row"
                checked={isSelected}
                onChange={(e) => onToggleRow(c.id, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="size-4 accent-indigo-600"
              />
            </td>
            <td className="px-3 py-2 text-slate-700">#{c.id}</td>
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
      })}
    </>
  );
}
