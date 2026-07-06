"use client";

/**
 * ใบวางบิล list — table + tick-to-VOID bulk action (task 4c · ภูม 2026-07-01).
 *
 * The billing-run list is a Server Component; this client island renders the
 * same table PLUS working per-row checkboxes and a sticky bulk bar that
 * soft-VOIDs the ticked ใบวางบิล via `voidBillingRunInvoices`.
 *
 * VOID = keep history: it flips status → 'cancelled' (badge "ยกเลิกแล้ว") and
 * stamps the existing cancelled_* columns. It works EVEN on a รับชำระแล้ว/paid
 * bill (owner: "even when status = รับชำระแล้ว, staff must be able to void"),
 * NEVER deletes, and NEVER moves money / re-opens forwarder rows / voids the
 * linked receipt. A confirm dialog + a required reason gate it (§0f).
 *
 * Already-cancelled bills can't be re-ticked (checkbox hidden). The action is
 * idempotent regardless (race-guarded).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { voidBillingRunInvoices } from "@/actions/admin/billing-run";
import { Explain, GUIDE } from "@/components/ui/tooltip";

export type BillingVoidRow = {
  id: number;
  doc_no: string;
  buyer_name: string | null;
  userid: string | null;
  item_count: number;
  total_thb: number;
  wht_amount: number;
  net_payable: number;
  date_issued: string | null;
  date_due: string | null;
  status: "issued" | "paid" | "cancelled";
  is_overdue: boolean;
};

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(status: "issued" | "paid" | "cancelled", isOverdue: boolean) {
  if (status === "paid") {
    return <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">รับชำระแล้ว</span>;
  }
  if (status === "cancelled") {
    return <span className="rounded-full bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-0.5 text-xs whitespace-nowrap">ยกเลิกแล้ว</span>;
  }
  if (isOverdue) {
    return <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">เกินเวลา</span>;
  }
  return <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">รอรับชำระ</span>;
}

/** A bill can be voided when it's NOT already cancelled (covers issued AND paid). */
function isVoidable(status: string): boolean {
  return status !== "cancelled";
}

export function BillingVoidTable({ rows }: { rows: BillingVoidRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const voidableIds = useMemo(
    () => rows.filter((r) => isVoidable(r.status)).map((r) => r.id),
    [rows],
  );
  const allVoidableSelected =
    voidableIds.length > 0 && voidableIds.every((id) => selected.has(id));

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(() => (allVoidableSelected ? new Set() : new Set(voidableIds)));
  }

  function submitVoid() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (reason.trim().length < 3) {
      setMsg({ kind: "err", text: "กรุณาระบุเหตุผลที่ยกเลิก (อย่างน้อย 3 ตัวอักษร)" });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const res = await voidBillingRunInvoices({ invoiceIds: ids, reason: reason.trim() });
      if (res.ok) {
        const { voided, skipped } = res.data ?? { voided: 0, skipped: 0 };
        setMsg({
          kind: "ok",
          text: `✓ ยกเลิกใบวางบิลแล้ว ${voided} ใบ${skipped > 0 ? ` · ข้าม ${skipped} ใบ (ยกเลิกไปแล้ว)` : ""}`,
        });
        setSelected(new Set());
        setReason("");
        setShowDialog(false);
        router.refresh();
      } else {
        setMsg({ kind: "err", text: res.error });
      }
    });
  }

  const selectedCount = selected.size;
  const hasVoidable = voidableIds.length > 0;

  return (
    <>
      {msg && (
        <div
          className={`rounded-lg p-2.5 text-sm border ${
            msg.kind === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-surface-alt/60 text-xs font-medium text-muted">
            <tr>
              <th className="px-3 py-2 text-left w-10">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหมด"
                  className="rounded border-border"
                  checked={allVoidableSelected}
                  onChange={toggleAll}
                  disabled={!hasVoidable}
                  title={hasVoidable ? "เลือกทั้งหมด (ที่ยกเลิกได้)" : "ไม่มีใบที่ยกเลิกได้ในมุมมองนี้"}
                />
              </th>
              <th className="px-3 py-2 text-left">เลขที่เอกสาร</th>
              <th className="px-3 py-2 text-left">ลูกค้า</th>
              <th className="px-3 py-2 text-right">จำนวนรายการ</th>
              <th className="px-3 py-2 text-right">
                <Explain label="ยอดรวม (฿)" def={GUIDE.bill_gross} align="right" />
              </th>
              <th className="px-3 py-2 text-center">วันที่ออก</th>
              <th className="px-3 py-2 text-center">ครบกำหนด</th>
              <th className="px-3 py-2 text-center">สถานะ</th>
              <th className="px-3 py-2 text-right">ดู</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-muted text-sm">
                  ไม่มีใบวางบิลในมุมมองนี้
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const voidable = isVoidable(r.status);
                const checked = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-border hover:bg-surface-alt/30 ${checked ? "bg-red-50/40" : ""}`}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <input
                        type="checkbox"
                        aria-label={`เลือก ${r.doc_no}`}
                        className="rounded border-border"
                        checked={voidable ? checked : false}
                        onChange={() => voidable && toggleOne(r.id)}
                        disabled={!voidable}
                        title={voidable ? undefined : "ยกเลิกไปแล้ว"}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/billing-run/${r.id}`} className="font-mono text-primary-600 hover:underline">
                        {r.doc_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.buyer_name || "—"}</div>
                      <div className="text-xs text-muted">{r.userid}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{r.item_count}</td>
                    <td className="px-3 py-2.5 text-right font-medium">
                      {thbFmt(r.total_thb)}
                      {r.wht_amount > 0 && (
                        <div className="text-xs font-normal text-emerald-700">
                          <Explain label={`สุทธิ ฿${thbFmt(r.net_payable)}`} def={GUIDE.bill_net_payable} align="right" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">{r.date_issued}</td>
                    <td className="px-3 py-2.5 text-center text-xs">{r.date_due}</td>
                    <td className="px-3 py-2.5 text-center">{statusBadge(r.status, r.is_overdue)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/admin/billing-run/${r.id}`} className="text-xs text-primary-600 hover:underline">
                        ดู →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Sticky bulk bar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-3 z-20 mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm font-medium text-foreground">เลือก {selectedCount} ใบ</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-muted hover:bg-surface-alt"
            >
              ล้างการเลือก
            </button>
            <button
              type="button"
              onClick={() => { setShowDialog(true); setMsg(null); }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              🗑 ยกเลิก (void · เก็บประวัติ)
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog with required reason */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-foreground">ยกเลิกใบวางบิล (void)</h3>
            <p className="text-sm text-muted">
              จะยกเลิกใบวางบิลที่เลือก <span className="font-semibold">{selectedCount} ใบ</span> ·
              เอกสารจะถูกทำเครื่องหมาย <span className="font-medium text-red-700">ยกเลิก</span> แต่{" "}
              <span className="font-semibold">ยังเก็บประวัติไว้</span> (ไม่ลบ · ไม่ขยับเงิน · ไม่แตะใบเสร็จ).
              รวมถึงใบที่ <span className="font-semibold">รับชำระแล้ว</span> ก็ยกเลิกได้.
            </p>
            <label className="block">
              <span className="block text-xs font-medium text-muted mb-1">
                เหตุผลที่ยกเลิก <span className="text-red-500">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                placeholder="เช่น 'ออกผิด', 'ออกซ้ำ', 'ยอดผิด', 'ต้องรวมกับใบอื่น'"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowDialog(false); setReason(""); }}
                disabled={pending}
                className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm text-muted hover:bg-surface-alt disabled:opacity-50"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={submitVoid}
                disabled={pending || reason.trim().length < 3}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? "กำลังยกเลิก…" : `ยืนยันยกเลิก ${selectedCount} ใบ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
