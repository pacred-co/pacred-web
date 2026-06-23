"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getImportedLeadCallReport, type ImportedLeadReportRow } from "@/actions/admin/imported-leads";
import { IMPORTED_LEAD_CALL_STATUSES } from "@/lib/validators/imported-lead";
import type { AssignRep } from "./lead-assign-bar";

/**
 * "ประวัติการมอบหมายโทรเซลล์" — per-rep call/close summary over a date range
 * (default วันนี้-วันนี้ · resets with the range), filterable by เซลล์ + สถานะ.
 * Rendered inside the ultra assign tab (ปอน 2026-06-23). Backed by
 * getImportedLeadCallReport (SENIOR-only). "ติดต่อ" = distinct customers (1 ลูกค้า=1).
 */

const STATUS_LABEL: Record<string, string> = {
  closed: "ปิดได้",
  callback: "รอติดต่อกลับ",
  no_answer: "โทรไม่ติด",
  not_interested: "ไม่สนใจ",
  other_rep: "ลูกค้าเซลล์อื่น",
  called: "โทรแล้ว (รอผล)",
};
const STATUS_COLS = ["closed", "callback", "no_answer", "not_interested", "other_rep", "called"] as const;

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Total = { contacted: number; closed: number; byStatus: Record<string, number> };

export function LeadCallReport({ reps }: { reps: AssignRep[] }) {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [rep, setRep] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<ImportedLeadReportRow[]>([]);
  const [total, setTotal] = useState<Total | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await getImportedLeadCallReport({ from, to, rep, status });
    if (res.ok && res.data) {
      setRows(res.data.rows);
      setTotal(res.data.total);
    } else {
      setRows([]);
      setTotal(null);
      setErr(res.ok ? null : res.error ?? "error");
    }
    setLoading(false);
  }, [from, to, rep, status]);

  // Defer so the fetch's setState isn't synchronous in the effect.
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const setToday = () => {
    const t = todayStr();
    setFrom(t);
    setTo(t);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-alt/40 p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">เซลล์
          <select value={rep} onChange={(e) => setRep(e.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:bg-surface">
            <option value="">ทุกเซลล์</option>
            {reps.map((r) => <option key={r.legacyId} value={r.legacyId}>{r.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">ตั้งแต่
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:bg-surface" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">ถึง
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:bg-surface" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">สถานะ
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm dark:bg-surface">
            <option value="">ทุกสถานะ</option>
            {IMPORTED_LEAD_CALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <button type="button" onClick={setToday} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-alt">วันนี้</button>
        {loading ? <span className="inline-flex items-center gap-1 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังโหลด…</span> : null}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <p className="text-xs text-muted">ติดต่อรวม (ราย)</p>
          <p className="mt-1 text-2xl font-bold">{total ? total.contacted.toLocaleString("th-TH") : "—"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <p className="text-xs text-muted">ปิดการขายได้</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{total ? total.closed.toLocaleString("th-TH") : "—"}</p>
        </div>
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <p className="text-xs text-muted">อัตราปิด</p>
          <p className="mt-1 text-2xl font-bold">{total && total.contacted > 0 ? `${Math.round((total.closed / total.contacted) * 100)}%` : "—"}</p>
        </div>
      </div>

      {err ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">โหลดรายงานไม่สำเร็จ: {err}</div> : null}

      {/* Per-rep breakdown */}
      <div className="overflow-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">เซลล์</th>
              <th className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">ติดต่อ (ราย)</th>
              {STATUS_COLS.map((s) => <th key={s} className="px-3 py-2.5 font-semibold text-right whitespace-nowrap">{STATUS_LABEL[s]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={2 + STATUS_COLS.length} className="px-3 py-10 text-center text-sm text-muted">{loading ? "กำลังโหลด…" : "ไม่มีข้อมูลในช่วงวันที่/ตัวกรองที่เลือก"}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.legacyId || "(none)"} className="border-t border-border hover:bg-surface-alt/40">
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.name}</td>
                <td className="px-3 py-2.5 text-right font-semibold">{r.contacted.toLocaleString("th-TH")}</td>
                {STATUS_COLS.map((s) => (
                  <td key={s} className={`px-3 py-2.5 text-right ${s === "closed" && (r.byStatus[s] ?? 0) > 0 ? "font-semibold text-green-700" : "text-muted"}`}>{(r.byStatus[s] ?? 0).toLocaleString("th-TH")}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {total && rows.length > 0 ? (
            <tfoot className="border-t-2 border-border bg-surface-alt/60 font-semibold">
              <tr>
                <td className="px-3 py-2.5">รวมทั้งหมด</td>
                <td className="px-3 py-2.5 text-right">{total.contacted.toLocaleString("th-TH")}</td>
                {STATUS_COLS.map((s) => <td key={s} className="px-3 py-2.5 text-right">{(total.byStatus[s] ?? 0).toLocaleString("th-TH")}</td>)}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="text-[11px] text-muted">* &quot;ติดต่อ&quot; = จำนวนลูกค้า (1 ราย = 1 ไม่ว่าโทรกี่ครั้ง) ที่โทรล่าสุดอยู่ในช่วงวันที่ที่เลือก · เปลี่ยนช่วงวันที่เพื่อดูย้อนหลัง</p>
    </div>
  );
}
