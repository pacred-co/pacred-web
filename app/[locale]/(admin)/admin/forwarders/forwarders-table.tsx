"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Glossary, GLOSSARY_DEFS } from "@/components/ui/tooltip";
import { adminBulkUpdateForwarderTbStatus } from "@/actions/admin/forwarders";

/**
 * Forwarders table — renders tb_forwarder rows (faithful port, Wave 3 P0 #1).
 *
 * Wave 5 (2026-05-21) — bulk-status-update bar RESTORED. The new
 * `adminBulkUpdateForwarderTbStatus` Server Action mutates `tb_forwarder`
 * (matches the read path) instead of the rebuilt `forwarders` table the
 * deferred V3-era helper still targets. The bar appears only when ≥1 row
 * is selected (legacy-style fixed-bottom strip). Customer notifications
 * are TODO until the `tb_users.userid → profiles.id` bridge lands.
 */

export type Row = {
  id: number;
  f_no: string;
  status: string;
  warehouse_china: string;
  partner_warehouse: string;
  transport_type: string;
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  cabinet_number: string | null;
  created_at: string;
  fcredit: string;
  note: string | null;
  detail: string | null;
  customer: { userid: string; name: string; phone: string } | null;
};

const STATUS_BADGE: Record<string, string> = {
  "1":  "bg-yellow-50 text-yellow-700 border-yellow-200",
  "2":  "bg-blue-50 text-blue-700 border-blue-200",
  "3":  "bg-pink-50 text-pink-700 border-pink-200",
  "4":  "bg-purple-50 text-purple-700 border-purple-200",
  "5":  "bg-red-50 text-red-700 border-red-200",
  "6":  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "7":  "bg-green-50 text-green-700 border-green-200",
  "99": "bg-orange-50 text-orange-700 border-orange-200",
};

// Bulk-update target options. The dropdown intentionally excludes "6.1"
// (= fstatus='6' with a driver-item join) — that's not a real fstatus
// value the legacy app can SET; it's a derived display slice. '99' is
// the legacy "พิเศษ" lane (Special Hold).
type BulkStatusValue = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99";
const BULK_STATUS_OPTIONS: ReadonlyArray<{ v: BulkStatusValue; l: string }> = [
  { v: "1",  l: "1 · รอเข้าโกดังจีน" },
  { v: "2",  l: "2 · ถึงโกดังจีนแล้ว" },
  { v: "3",  l: "3 · กำลังส่งมาไทย" },
  { v: "4",  l: "4 · ถึงไทยแล้ว" },
  { v: "5",  l: "5 · รอชำระเงิน" },
  { v: "6",  l: "6 · เตรียมส่ง" },
  { v: "7",  l: "7 · ส่งแล้ว" },
  { v: "99", l: "99 · สถานะพิเศษ" },
];

export function ForwardersTable({
  rows,
  statusLabel,
  modeLabel,
  warehouseLabel,
}: {
  rows: Row[];
  statusLabel: Record<string, string>;
  modeLabel: Record<string, string>;
  warehouseLabel: Record<string, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<BulkStatusValue>("2");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelected(new Set(rows.map((r) => r.id)));
    else setSelected(new Set());
  };

  const clearSelection = () => {
    setSelected(new Set());
    setError(null);
    setSuccess(null);
  };

  const onBulkSubmit = () => {
    setError(null);
    setSuccess(null);
    if (selected.size === 0) return;
    const statusLabelTxt = BULK_STATUS_OPTIONS.find((o) => o.v === bulkStatus)?.l ?? bulkStatus;
    if (!window.confirm(`อัพเดต ${selected.size} รายการ เป็นสถานะ "${statusLabelTxt}" ?`)) return;

    const fids = Array.from(selected);
    startTransition(async () => {
      const result = await adminBulkUpdateForwarderTbStatus({ fids, fstatus: bulkStatus });
      if (!result.ok) {
        setError(result.error ?? "อัพเดตไม่สำเร็จ");
        return;
      }
      setSuccess(`อัพเดตสำเร็จ ${result.data?.updated ?? fids.length} รายการ`);
      setSelected(new Set());
      router.refresh();
    });
  };

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && selected.size < rows.length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีรายการที่ตรงกัน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={toggleAll}
                      aria-label="เลือกทั้งหมด"
                    />
                  </th>
                  <th className="px-4 py-3">
                    <Glossary term="เลขที่ (F-no)" definition={GLOSSARY_DEFS.f_no} />
                  </th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">โกดัง / ขนส่ง</th>
                  <th className="px-4 py-3">ตู้</th>
                  <th className="px-4 py-3 text-right">
                    น้ำหนัก / <Glossary term="ปริมาตร (CBM)" definition={GLOSSARY_DEFS.cbm} />
                  </th>
                  <th className="px-4 py-3 text-right">ราคา</th>
                  <th className="px-4 py-3">Tracking</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // Show "เครติด" badge on top of fstatus badge for credit orders
                  const statusKey = r.fcredit === "1" ? "c" : r.status;
                  const badgeCls = STATUS_BADGE[r.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  const label = r.fcredit === "1"
                    ? `เครติด · ${statusLabel[r.status] ?? r.status}`
                    : statusLabel[statusKey] ?? statusKey;
                  const isOn = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border hover:bg-surface-alt/30 ${isOn ? "bg-primary-50/40" : ""}`}
                    >
                      <td className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleRow(r.id)}
                          aria-label={`เลือก ${r.f_no}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">
                          {r.f_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{r.customer?.userid ?? "—"}</div>
                        <div>{r.customer?.name || "—"}</div>
                        <div className="text-muted">{r.customer?.phone}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>
                          {warehouseLabel[r.partner_warehouse] ?? r.partner_warehouse}
                          {" / "}
                          {modeLabel[r.transport_type] ?? r.transport_type}
                        </div>
                        <div className="text-muted">โกดังจีน: {r.warehouse_china}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.cabinet_number || <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {r.weight_kg.toFixed(2)} kg
                        <br />
                        <span className="text-muted">{r.volume_cbm.toFixed(3)} cbm</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">
                        ฿{r.total_price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.tracking_th  && r.tracking_th  !== "-" && <div>TH: {r.tracking_th}</div>}
                        {r.tracking_chn && r.tracking_chn !== "-" && <div>CN: {r.tracking_chn}</div>}
                        {(!r.tracking_th || r.tracking_th === "-") && (!r.tracking_chn || r.tracking_chn === "-") && <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeCls}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline status banners (visible above the fixed bar) */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Fixed-bottom bulk action bar — shows only when ≥1 row selected */}
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="บาร์เปลี่ยนสถานะกลุ่ม"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white dark:bg-surface shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
            <span className="text-sm font-medium">
              เลือกแล้ว <b className="text-primary-600">{selected.size}</b> รายการ
            </span>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">เปลี่ยนสถานะเป็น</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as BulkStatusValue)}
                disabled={pending}
                className="rounded-md border border-border bg-white px-2 py-1.5 text-sm"
              >
                {BULK_STATUS_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>{o.l}</option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                disabled={pending}
                className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={onBulkSubmit}
                disabled={pending}
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {pending ? "กำลังอัพเดต..." : `อัพเดตสถานะ ${selected.size} รายการ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
