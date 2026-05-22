"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { adminBulkUpdateForwarderTbStatus } from "@/actions/admin/forwarders";

/**
 * Forwarders table — Wave 11 fidelity port to legacy `forwarder.php`
 * L508-707 (the 12-column list layout).
 *
 * Wave 11 changes vs Wave 5:
 *   - Column shape mirrors legacy 1:1: ID · วันที่สร้าง · รหัสลูกค้า ·
 *     รายละเอียด · ยอดค้างชำระ · เลขพัสดุ(จีน) · เลขพัสดุ(ไทย) ·
 *     เข้าโกดัง · ออกโกดัง · ถึงไทย · สถานะ · อัปเดต · ตัวเลือก
 *   - "ออเดอร์ #<id>" link instead of "f_no" (was wrongly showing
 *     Cargo API tracking `fidorco`)
 *   - "ฝากนำเข้าจาก: users" / "จาก: admin_X" badge under product detail
 *   - 3 stage-date columns (fdatestatus2/3/4) for warehouse pipeline visibility
 *   - Inline ดู / อัปเดต button cluster in the ตัวเลือก column
 *
 * Wave 5 carry-over (still works · same Server Action):
 *   - Checkbox column + indeterminate header check
 *   - Fixed-bottom bulk-update bar with 8-status dropdown
 *   - window.confirm dialog before mutation
 */

export type Row = {
  id: number;
  order_no: string;             // "ออเดอร์ #<id>"
  f_no_cargo: string | null;    // fidorco (Cargo API tracking · separate from order id)
  status: string;
  warehouse_china: string;
  partner_warehouse: string;
  transport_type: string;
  amount_count: number;
  weight_kg: number;
  volume_cbm: number;
  total_price: number;
  tracking_chn: string | null;
  tracking_th: string | null;
  cabinet_number: string | null;
  created_at: string;
  date_status2: string | null;
  date_status3: string | null;
  date_status4: string | null;
  date_admin_status: string | null;
  admin_id_last: string | null;
  admin_creator: string | null;
  ref_order: string | null;
  fcredit: string;
  paydeposit: string | null;
  note: string | null;
  detail: string | null;
  cover: string | null;
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

function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (withTime) {
    return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  const d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d} วัน`;
  const h = Math.floor(diff / 3_600_000);
  if (h > 0) return `${h} ชม`;
  const m = Math.floor(diff / 60_000);
  if (m > 0) return `${m} นาที`;
  return "เมื่อกี้";
}

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
            <table className="w-full text-[11px]">
              <thead className="bg-surface-alt/50 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-3 w-8">
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
                  <th className="px-2 py-3">ID</th>
                  <th className="px-2 py-3">วันที่สร้าง</th>
                  <th className="px-2 py-3">รหัสลูกค้า</th>
                  <th className="px-2 py-3">รายละเอียด</th>
                  <th className="px-2 py-3 text-right">ยอดค้างชำระ</th>
                  <th className="px-2 py-3">เลขพัสดุ (จีน)</th>
                  <th className="px-2 py-3">เลขพัสดุ (ไทย)</th>
                  <th className="px-2 py-3">เข้าโกดัง</th>
                  <th className="px-2 py-3">ออกโกดัง</th>
                  <th className="px-2 py-3">ถึงไทย</th>
                  <th className="px-2 py-3">สถานะ</th>
                  <th className="px-2 py-3">อัปเดต</th>
                  <th className="px-2 py-3">ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const statusKey = r.status;
                  const badgeCls = STATUS_BADGE[r.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  const sLabel = r.fcredit === "1"
                    ? `เครติด · ${statusLabel[r.status] ?? r.status}`
                    : statusLabel[statusKey] ?? statusKey;
                  const isOn = selected.has(r.id);
                  const isSystem = r.ref_order && r.ref_order !== "";
                  const isAdminInitiated = r.admin_creator && r.admin_creator !== "" && !isSystem;
                  const sourceLabel = isSystem
                    ? "ฝากนำเข้า : ระบบ"
                    : isAdminInitiated
                      ? `ฝากนำเข้า : ${r.admin_creator}`
                      : "ฝากนำเข้าจาก : users";
                  const sourceBadgeCls = isSystem
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : isAdminInitiated
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-gray-50 text-gray-600 border-gray-200";

                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border hover:bg-surface-alt/30 ${isOn ? "bg-primary-50/40" : ""}`}
                    >
                      <td className="px-2 py-2.5 w-8">
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleRow(r.id)}
                          aria-label={`เลือก ออเดอร์ #${r.id}`}
                        />
                      </td>
                      <td className="px-2 py-2.5 font-mono whitespace-nowrap">{r.id}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {r.created_at ? new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-mono font-semibold">{r.customer?.userid ?? "—"}</div>
                        <div className="truncate max-w-[140px]" title={r.customer?.name ?? ""}>
                          {r.customer?.name || "—"}
                        </div>
                        <div className="text-muted text-[10px]">{r.customer?.phone}</div>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex gap-2 items-start">
                          {/* Product thumbnail · legacy forwarder.php shows the
                              fcover image inline in the รายละเอียด column for
                              fast "is this the right box" recognition. Empty
                              cover renders a neutral placeholder so the row
                              height stays consistent. */}
                          {r.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.cover.startsWith("http") ? r.cover : `/legacy/uploads/${r.cover}`}
                              alt={`ออเดอร์ ${r.id}`}
                              className="h-12 w-12 rounded border border-border object-cover bg-surface-alt shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              aria-hidden
                              className="h-12 w-12 rounded border border-dashed border-border/60 bg-surface-alt/40 shrink-0 flex items-center justify-center text-[10px] text-muted"
                              title="ไม่มีรูปสินค้า"
                            >
                              ไม่มี
                              <br />
                              รูป
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/admin/forwarders/${r.id}`}
                              className="font-semibold text-primary-600 hover:underline"
                            >
                              ออเดอร์ #{r.id}
                            </Link>
                            {r.detail && (
                              <div className="text-muted truncate max-w-[200px] mt-0.5" title={r.detail}>
                                {r.detail}
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${sourceBadgeCls}`}>
                                {sourceLabel}
                              </span>
                              {r.f_no_cargo && (
                                <span className="text-[9px] text-muted font-mono" title="Cargo API tracking (fidorco)">
                                  {r.f_no_cargo}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        <div className="font-mono font-semibold">
                          ฿{r.total_price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-muted text-[10px]">{r.amount_count} กล่อง</div>
                      </td>
                      <td className="px-2 py-2.5">
                        {r.tracking_chn && r.tracking_chn !== "-" ? (
                          <>
                            <div className="font-mono text-[10px]">{r.tracking_chn}</div>
                            <div className="mt-0.5">
                              <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 text-[9px]">
                                {modeLabel[r.transport_type] ?? r.transport_type}
                              </span>
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[10px]">
                        {r.tracking_th && r.tracking_th !== "-" ? r.tracking_th : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {fmtDate(r.date_status2)}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {fmtDate(r.date_status3)}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-muted">
                        {fmtDate(r.date_status4)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium whitespace-nowrap ${badgeCls}`}>
                          {sLabel}
                        </span>
                        {r.cabinet_number && (
                          <div className="mt-0.5 text-[9px] text-muted font-mono">ตู้ {r.cabinet_number}</div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap">
                        {r.date_admin_status ? (
                          <>
                            <div className="text-muted text-[10px]">
                              {fmtDate(r.date_admin_status, true)}
                            </div>
                            <div className="text-[9px] text-amber-700">
                              ผ่านมา {relativeAgo(r.date_admin_status)}
                            </div>
                            {r.admin_id_last && (
                              <div className="text-[9px] text-muted font-mono">{r.admin_id_last}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/admin/forwarders/${r.id}`}
                            className="rounded border border-green-500 bg-green-50 text-green-700 text-[10px] px-2 py-1 hover:bg-green-100 text-center whitespace-nowrap"
                          >
                            ดูข้อมูล
                          </Link>
                          <Link
                            href={`/admin/forwarders/${r.id}`}
                            className="rounded border border-orange-500 bg-orange-50 text-orange-700 text-[10px] px-2 py-1 hover:bg-orange-100 text-center whitespace-nowrap"
                          >
                            อัปเดต
                          </Link>
                        </div>
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
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white dark:bg-surface shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pcs-safe-area-bottom"
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
