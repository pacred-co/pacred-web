"use client";

/**
 * ใบเสร็จรับเงิน list — table + tick-to-VOID bulk action (task 4c · ภูม 2026-07-01).
 *
 * The receipts list is a Server Component; this client island renders the same
 * PEAK table (thead + rows + footer Σ) PLUS working per-row checkboxes and a
 * sticky bulk bar that soft-VOIDs the ticked receipts via `adminVoidReceipts`.
 *
 * VOID = keep history: it flips rstatus → '2' (ยกเลิก · the existing legacy
 * cancelled state) — it NEVER deletes, NEVER moves money. Voided rows stay
 * visible in the list, badged "ยกเลิก". A confirm dialog + a required reason
 * gate the mutation (§0f confirm-before-mutate).
 *
 * Already-cancelled rows ('2') can't be re-ticked (their checkbox is hidden) so
 * a re-void can't happen. The action is idempotent regardless (race-guarded).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  adminVoidReceipts,
  type ReceiptListRow,
} from "@/actions/admin/accounting-receipts";
import { Explain, GUIDE } from "@/components/ui/tooltip";

const RSTATUS_CFG: Record<string, { label: string; chip: string }> = {
  "1": { label: "ออกแล้ว", chip: "bg-emerald-100 text-emerald-800 border border-emerald-300" },
  "2": { label: "ยกเลิก",  chip: "bg-red-100 text-red-800 border border-red-300" },
  "3": { label: "รอชำระ",  chip: "bg-amber-100 text-amber-800 border border-amber-300" },
  "0": { label: "ร่าง",    chip: "bg-slate-100 text-slate-700 border border-slate-300" },
};

function rstatusCfg(rstatus: string) {
  return RSTATUS_CFG[rstatus] ?? {
    label: rstatus,
    chip: "bg-slate-100 text-slate-700 border border-slate-300",
  };
}

function fmtThb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** A receipt can be voided only when it's currently paid ('1') or pending ('3'). */
function isVoidable(rstatus: string): boolean {
  return rstatus === "1" || rstatus === "3";
}

export function ReceiptsVoidTable({
  rows,
  totals,
}: {
  rows: ReceiptListRow[];
  totals: { totalBeforeWithholding: number; whtAmount: number; ramount: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const voidableIds = useMemo(
    () => rows.filter((r) => isVoidable(r.rstatus)).map((r) => r.id),
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
      const res = await adminVoidReceipts({ receiptIds: ids, reason: reason.trim() });
      if (res.ok) {
        const { voided, skipped } = res.data ?? { voided: 0, skipped: 0 };
        setMsg({
          kind: "ok",
          text: `✓ ยกเลิกใบเสร็จแล้ว ${voided} ใบ${skipped > 0 ? ` · ข้าม ${skipped} ใบ (ยกเลิกไปแล้ว)` : ""}`,
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

      <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto scrollbar-x-visible">
        <table className="min-w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-10">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหมด"
                  className="rounded border-slate-300"
                  checked={allVoidableSelected}
                  onChange={toggleAll}
                  disabled={voidableIds.length === 0}
                  title={voidableIds.length === 0 ? "ไม่มีใบที่ยกเลิกได้ในหน้านี้" : "เลือกทั้งหมด (ที่ยกเลิกได้)"}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">เลขที่เอกสาร</th>
              <th className="px-3 py-2 text-left font-medium">ลูกค้า</th>
              <th className="px-3 py-2 text-left font-medium">วันที่</th>
              <th className="px-3 py-2 text-right font-medium">
                <Explain label="มูลค่ารวม (ก่อน WHT)" def={GUIDE.bill_gross} align="right" />
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <Explain label="WHT หัก" def={GUIDE.wht_1pct_bill} align="right" />
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <Explain label="รับสุทธิ" def={GUIDE.bill_net_payable} align="right" />
              </th>
              <th className="px-3 py-2 text-center font-medium">สถานะ</th>
              <th className="px-3 py-2 text-center font-medium">รายการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-slate-500">
                  ไม่พบใบเสร็จในเงื่อนไขที่เลือก
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const cfg = rstatusCfg(r.rstatus);
                const voidable = isVoidable(r.rstatus);
                const checked = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-slate-100 hover:bg-slate-50/80 ${
                      checked ? "bg-red-50/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      {voidable ? (
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${r.rid}`}
                          className="rounded border-slate-300"
                          checked={checked}
                          onChange={() => toggleOne(r.id)}
                        />
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`${r.rid} ยกเลิกแล้ว`}
                          className="rounded border-slate-300"
                          disabled
                          title="ยกเลิกไปแล้ว"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        href={`/admin/accounting/forwarder-invoice/${r.id}`}
                        className="font-medium text-primary-700 hover:underline"
                      >
                        {r.rid}
                      </Link>
                      {r.refid && r.refid.trim() && (
                        <div className="text-xs text-slate-500 font-mono">{r.refid}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{r.customerLabel}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {r.userid}
                        {r.isCorporate ? " · นิติบุคคล" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">{fmtDate(r.rdate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">฿{fmtThb(r.totalBeforeWithholding)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {r.whtAmount > 0 ? `฿${fmtThb(r.whtAmount)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary-700">
                      ฿{fmtThb(r.ramount)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.chip}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-700">{r.itemCount}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                <td colSpan={4} className="px-3 py-2.5 text-right text-slate-600">
                  ผลรวม {rows.length.toLocaleString()} รายการ ในหน้านี้
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">฿{fmtThb(totals.totalBeforeWithholding)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">฿{fmtThb(totals.whtAmount)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-primary-700">฿{fmtThb(totals.ramount)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Sticky bulk bar — appears when ≥1 receipt is ticked */}
      {selectedCount > 0 && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm font-medium text-slate-700">
            เลือก {selectedCount} ใบ
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
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

      {/* Confirm dialog with a required reason */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">ยกเลิกใบเสร็จ (void)</h3>
            <p className="text-sm text-slate-600">
              จะยกเลิกใบเสร็จที่เลือก <span className="font-semibold">{selectedCount} ใบ</span> ·
              เอกสารจะถูกทำเครื่องหมาย <span className="font-medium text-red-700">ยกเลิก</span> แต่{" "}
              <span className="font-semibold">ยังเก็บประวัติไว้</span> (ไม่ลบ · ไม่ขยับเงิน).
            </p>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">
                เหตุผลที่ยกเลิก <span className="text-red-500">*</span>
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                placeholder="เช่น 'ออกผิดลูกค้า', 'ออกซ้ำ', 'ยอดผิด'"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowDialog(false); setReason(""); }}
                disabled={pending}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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
