"use client";

/**
 * <CntListTable> — Wave 17 P0-fix (2026-05-25 ค่ำ)
 *
 * Client wrapper for the report-cnt list table. Owns:
 *   - Row checkbox state (multi-select unpaid containers)
 *   - Floating action button "💸 ทำรายการเบิกเงินค่าตู้"
 *   - Inline `<CntPaymentModal>` (instead of navigating to /pay)
 *
 * Faithful to legacy `report-cnt.php` L502-505 + L660-680 (the AJAX modal
 * pattern via `getListCNTPay.php`) — match the legacy click→modal flow
 * exactly so admin doesn't navigate twice to file a withdrawal request.
 *
 * Checkbox visibility rules (legacy `report-cnt.php` L1898 region):
 *   - ONLY on "เข้าโกดังไทยแล้ว" tab (page=succeed)
 *   - ONLY for unpaid containers (g.isPaid === false)
 *   - HIDDEN entirely for non-money-tier roles (warehouse)
 */

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { CntPaymentModal, type SelectedSummary } from "./cnt-payment-modal";

// ─────────────────────────────────────────────────────────────────────
// Row shape (mirrors `Grouped` in page.tsx — kept independent so
// page.tsx can pass JSON-serializable rows from server → client)
// ─────────────────────────────────────────────────────────────────────

export type CntListRow = {
  fcabinetnumber: string;
  fwarehousename: string;
  fdatecontainerclose: string | null;
  fdatestatus4: string | null;
  ftransporttype: string;
  fstatus: string;
  trackCount: number;
  volumeSum: number;
  weightSum: number;
  costSum: number;
  priceSum: number;
  isPaid: boolean;
};

type Props = {
  rows: CntListRow[];
  showMoney: boolean;
  isWaiting: boolean;
  warehouseLabel: Record<string, string>;
  transportLabel: Record<string, string>;
  statusBadge: Record<string, { label: string; cls: string }>;
};

function fmtDate(d: string | null) {
  return d ? d.slice(0, 10) : "-";
}

function diffDateNow(closeDate: string | null): string {
  if (!closeDate) return "-";
  const d = new Date(closeDate).getTime();
  const days = Math.floor((Date.now() - d) / 86_400_000);
  return `${days} วัน`;
}

function diffDateCNT(closeDate: string | null, arrivedDate: string | null): string {
  if (!closeDate || !arrivedDate) return "-";
  const c = new Date(closeDate).getTime();
  const a = new Date(arrivedDate).getTime();
  const days = Math.floor((a - c) / 86_400_000);
  return `${days} วัน`;
}

export function CntListTable({
  rows,
  showMoney,
  isWaiting,
  warehouseLabel,
  transportLabel,
  statusBadge,
}: Props) {
  // Checkboxes only available on succeed tab + only for unpaid + only to money tier.
  // (Warehouse role doesn't see this whole client component because parent
  // page conditionally renders the floating button; we still hide checkboxes
  // defensively here.)
  const canSelect = showMoney && !isWaiting;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);

  const selectableRows = useMemo(
    () => (canSelect ? rows.filter((r) => !r.isPaid) : []),
    [canSelect, rows],
  );

  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.fcabinetnumber));

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        trackCount: acc.trackCount + r.trackCount,
        volumeSum:  acc.volumeSum  + r.volumeSum,
        weightSum:  acc.weightSum  + r.weightSum,
        costSum:    acc.costSum    + r.costSum,
        priceSum:   acc.priceSum   + r.priceSum,
        profitSum:  acc.profitSum  + (r.priceSum - r.costSum),
      }),
      { trackCount: 0, volumeSum: 0, weightSum: 0, costSum: 0, priceSum: 0, profitSum: 0 },
    );
  }, [rows]);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableRows.map((r) => r.fcabinetnumber)));
    }
  }

  const selectedSummaries: SelectedSummary[] = useMemo(
    () =>
      selectableRows
        .filter((r) => selected.has(r.fcabinetnumber))
        .map((r) => ({
          fcabinetnumber: r.fcabinetnumber,
          warehouseLabel: warehouseLabel[r.fwarehousename] ?? r.fwarehousename,
          costSum: r.costSum,
          trackCount: r.trackCount,
        })),
    [selectableRows, selected, warehouseLabel],
  );

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              {canSelect && (
                <th className="px-2 py-2 text-center w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableRows.length === 0}
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
              )}
              <th className="px-2 py-2 text-left">หมายเลขตู้</th>
              <th className="px-2 py-2 text-left">โกดัง</th>
              <th className="px-2 py-2 text-left">วันที่ปิดตู้</th>
              <th className="px-2 py-2 text-center">ขนส่ง</th>
              <th className="px-2 py-2 text-right">{isWaiting ? "รอเข้าโกดัง" : "เดินทาง"}</th>
              <th className="px-2 py-2 text-right">{isWaiting ? "วันที่รอเข้าโกดัง" : "วันที่เดินทาง"}</th>
              <th className="px-2 py-2 text-right">จำนวนแทรคกิ้ง</th>
              <th className="px-2 py-2 text-right">ปริมาตร</th>
              <th className="px-2 py-2 text-right">น้ำหนัก</th>
              {showMoney && <th className="px-2 py-2 text-right">ต้นทุนตู้</th>}
              {showMoney && <th className="px-2 py-2 text-right">ราคาขาย</th>}
              {showMoney && <th className="px-2 py-2 text-right">กำไร</th>}
              <th className="px-2 py-2 text-center">สถานะตู้</th>
              <th className="px-2 py-2 text-center">สถานะจ่ายค่าตู้</th>
            </tr>
          </thead>
          <tbody>
            {/* Totals row */}
            <tr className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium">
              {canSelect && <td className="px-2 py-2"></td>}
              <td className="px-2 py-2" colSpan={6}>รวม ({rows.length} ตู้)</td>
              <td className="px-2 py-2 text-right">{totals.trackCount.toLocaleString()}</td>
              <td className="px-2 py-2 text-right">{totals.volumeSum.toFixed(2)}</td>
              <td className="px-2 py-2 text-right">{totals.weightSum.toFixed(2)}</td>
              {showMoney && <td className="px-2 py-2 text-right">{totals.costSum.toFixed(2)}</td>}
              {showMoney && <td className="px-2 py-2 text-right">{totals.priceSum.toFixed(2)}</td>}
              {showMoney && <td className="px-2 py-2 text-right">{totals.profitSum.toFixed(2)}</td>}
              <td className="px-2 py-2" colSpan={2}></td>
            </tr>

            {rows.map((r) => {
              const badge = statusBadge[r.fstatus] ?? { label: r.fstatus, cls: "bg-gray-100" };
              const isOn = selected.has(r.fcabinetnumber);
              const selectable = canSelect && !r.isPaid;
              return (
                <tr
                  key={r.fcabinetnumber}
                  className={`border-t border-border ${r.isPaid ? "bg-green-50/30" : ""} ${isOn ? "bg-yellow-50" : ""}`}
                >
                  {canSelect && (
                    <td className="px-2 py-2 text-center">
                      {selectable ? (
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggle(r.fcabinetnumber)}
                          aria-label={`เลือกตู้ ${r.fcabinetnumber}`}
                        />
                      ) : (
                        <span className="text-[9px] text-muted" title="ตู้นี้จ่ายแล้ว · เลือกไม่ได้">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-2 font-mono">
                    <Link
                      href={`/admin/report-cnt/${encodeURIComponent(r.fcabinetnumber)}`}
                      className="text-primary-600 hover:underline"
                      title="ดูรายละเอียดตู้นี้"
                    >
                      {r.fcabinetnumber}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{warehouseLabel[r.fwarehousename] ?? r.fwarehousename}</td>
                  <td className="px-2 py-2 text-right">{fmtDate(r.fdatecontainerclose)}</td>
                  <td className="px-2 py-2 text-center">{transportLabel[r.ftransporttype] ?? r.ftransporttype}</td>
                  <td className="px-2 py-2 text-right">
                    {isWaiting ? diffDateNow(r.fdatecontainerclose) : diffDateCNT(r.fdatecontainerclose, r.fdatestatus4)}
                  </td>
                  <td className="px-2 py-2 text-right">{fmtDate(r.fdatestatus4)}</td>
                  <td className="px-2 py-2 text-right">{r.trackCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{r.volumeSum.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right">{r.weightSum.toFixed(2)}</td>
                  {showMoney && <td className="px-2 py-2 text-right">{r.costSum.toFixed(2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{r.priceSum.toFixed(2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{(r.priceSum - r.costSum).toFixed(2)}</td>}
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.isPaid ? (
                      <span className="inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px]">จ่ายแล้ว</span>
                    ) : (
                      <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px]">ยังไม่จ่าย</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating action bar — only on succeed tab + only for money tier */}
      {canSelect && (
        <div className="pcs-safe-area-bottom fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={selected.size === 0}
            className="rounded-full bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-2"
          >
            💸 ทำรายการเบิกเงินค่าตู้
            {selected.size > 0 && (
              <span className="inline-flex items-center justify-center bg-white text-primary-600 text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1.5">
                {selected.size}
              </span>
            )}
          </button>
          <Link
            href="/admin/cnt-hs"
            className="rounded-full bg-white hover:bg-surface-alt border border-border text-foreground px-4 py-2 text-xs font-medium shadow-lg"
          >
            📜 ประวัติรายการเบิกเงินค่าตู้
          </Link>
        </div>
      )}

      <CntPaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selected={selectedSummaries}
      />
    </>
  );
}
