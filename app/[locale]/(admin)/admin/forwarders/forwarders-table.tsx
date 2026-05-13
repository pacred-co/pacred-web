"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { adminBulkUpdateForwarderStatus } from "@/actions/admin/forwarders";

type Row = {
  id: string;
  f_no: string;
  status: string;
  source_warehouse: string;
  transport_type: string;
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  created_at: string;
  profile: { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
};

const STATUS_BADGE: Record<string, string> = {
  pending_payment:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  shipped_china:    "bg-blue-50 text-blue-700 border-blue-200",
  in_transit:       "bg-indigo-50 text-indigo-700 border-indigo-200",
  arrived_thailand: "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery: "bg-orange-50 text-orange-700 border-orange-200",
  delivered:        "bg-green-50 text-green-700 border-green-200",
  cancelled:        "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  pending_payment: "รอชำระ", shipped_china: "ออกจีน", in_transit: "กลางทาง",
  arrived_thailand: "ถึงไทย", out_for_delivery: "ส่ง", delivered: "สำเร็จ", cancelled: "ยกเลิก",
};
const STATUSES = [
  "pending_payment","shipped_china","in_transit","arrived_thailand",
  "out_for_delivery","delivered","cancelled",
] as const;

export function ForwardersTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.f_no)));
  }

  function toggle(fNo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(fNo) ? next.delete(fNo) : next.add(fNo);
      return next;
    });
  }

  function bulkUpdate() {
    if (!bulkStatus || selected.size === 0) return;
    setMsg(null); setErr(null);
    startTransition(async () => {
      const res = await adminBulkUpdateForwarderStatus({
        f_nos:  Array.from(selected),
        status: bulkStatus as typeof STATUSES[number],
      });
      if (res.ok) {
        setMsg(`อัพเดท ${res.updated ?? selected.size} รายการแล้ว`);
        setSelected(new Set());
        setBulkStatus("");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 flex-wrap">
          <span className="text-sm font-medium text-primary-700">เลือก {selected.size} รายการ</span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
          >
            <option value="">เปลี่ยนสถานะเป็น...</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button
            onClick={bulkUpdate}
            disabled={!bulkStatus || pending}
            className="rounded-lg bg-primary-500 text-white px-4 py-1.5 text-sm font-medium hover:bg-primary-600 disabled:opacity-40"
          >
            {pending ? "กำลังอัพเดท..." : "ยืนยัน"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted hover:text-foreground"
          >
            ยกเลิกเลือก
          </button>
          {msg && <span className="text-xs text-green-700">{msg}</span>}
          {err && <span className="text-xs text-red-700">{err}</span>}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการที่ตรงกัน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="rounded border-border" />
                  </th>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก/ปริมาตร</th>
                  <th className="px-4 py-3 text-right">ราคา</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border hover:bg-surface-alt/30 ${selected.has(r.f_no) ? "bg-primary-50/50" : ""}`}
                  >
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(r.f_no)} onChange={() => toggle(r.f_no)}
                        className="rounded border-border" />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">
                        {r.f_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{r.profile?.member_code ?? "—"}</div>
                      <div>{r.profile?.first_name} {r.profile?.last_name}</div>
                      <div className="text-muted">{r.profile?.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.source_warehouse} / {r.transport_type}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      {Number(r.weight_kg).toFixed(2)} kg
                      <br />
                      <span className="text-muted">{Number(r.volume_cbm).toFixed(3)} cbm</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      ฿{Number(r.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.tracking_th  && <div>TH: {r.tracking_th}</div>}
                      {r.tracking_chn && <div>CN: {r.tracking_chn}</div>}
                      {!r.tracking_th && !r.tracking_chn && <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status] ?? ""}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("th-TH")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
