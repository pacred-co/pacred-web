"use client";

/**
 * <CntListTable> — Wave 17 P0-fix + ROW-COLOR-RESTORE (2026-05-28 P1)
 *
 * Client wrapper for the report-cnt list table. Owns:
 *   - Row checkbox state (multi-select unpaid containers)
 *   - Sortable column headers (lucide-react ArrowUpDown / ArrowUp / ArrowDown)
 *   - Row tint per fstatus (canonical FSTATUS_CFG · solid Tailwind weights)
 *   - Status chip (canonical fstatusBadge · matches legacy labels + palette)
 *   - Orange summary band (avg วันที่รอเข้าโกดัง + sum trackCount/CBM/KG/cost/price/profit)
 *   - Floating action button "💸 ทำรายการจ่ายเงินตู้"
 *   - Inline `<CntPaymentModal>` (instead of navigating to /pay)
 *
 * 2026-05-28 ROW-COLOR-RESTORE (Agent P1): the previous build used a local
 * STATUS_BADGE map with WRONG labels + opacity tints invisible at-a-glance.
 * พี่ป๊อป + ภูม opened the page + flagged it — staff cannot scan workflow
 * state. Restored canonical lib usage + solid row tint + sortable headers
 * + completed summary band (the legacy เฉลี่ย: N วัน + per-column sums).
 *
 * Faithful to legacy `report-cnt.php` L407-423 (totals row with .bg-color
 * orange→red gradient) + L501-505 (modal trigger) + L532-538 (jQuery DOM
 * updates filling t7..t12 sums and t16 avg).
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CntPaymentModal, type SelectedSummary } from "./cnt-payment-modal";
import { fstatusBadge, listRowTint } from "@/lib/admin/forwarder-status";
import type { ContainerCompleteness } from "@/lib/warehouse/container-completeness";

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
  /**
   * Phase 3 (ops-workflow audit §30) — per-container completeness from
   * tb_forwarder (famount expected) vs tb_forwarder_import2 (fi2amount
   * scanned). Map keyed by `fcabinetnumber`; missing entries treated as
   * 0/0 (vacuously complete). Drives the "ยิงครบ" column.
   */
  completenessByCab?: Record<string, ContainerCompleteness>;
};

// ─────────────────────────────────────────────────────────────────────
// Sortable header config
// ─────────────────────────────────────────────────────────────────────

type SortKey =
  | "fcabinetnumber"
  | "fwarehousename"
  | "fdatecontainerclose"
  | "ftransporttype"
  | "diffDay"          // = waitDays (waiting tab) or transitDays (succeed tab)
  | "fdatestatus4"
  | "trackCount"
  | "volumeSum"
  | "weightSum"
  | "costSum"
  | "priceSum"
  | "profitSum"
  | "fstatus"
  | "isPaid"
  | "completenessPct"; // Phase 3 — ยิงครบ ratio

type SortDir = "asc" | "desc";

// ─────────────────────────────────────────────────────────────────────
// SortIcon + SortableTH — module-level components (Next 16 react-hooks/
// static-components rule rejects components created inside render bodies
// because their identity changes every render, breaking memoisation +
// tree stability). Extracted from inline definitions; parent passes
// activeKey/sortDir/onSort as props.
// ─────────────────────────────────────────────────────────────────────

function SortIcon({
  k,
  activeKey,
  sortDir,
}: {
  k: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
}) {
  if (k !== activeKey) {
    return <ArrowUpDown className="inline h-3 w-3 ml-0.5 opacity-60" />;
  }
  return sortDir === "asc"
    ? <ArrowUp className="inline h-3 w-3 ml-0.5" />
    : <ArrowDown className="inline h-3 w-3 ml-0.5" />;
}

function SortableTH({
  sortKeyValue,
  align,
  children,
  activeKey,
  sortDir,
  onSort,
}: {
  sortKeyValue: SortKey;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
  activeKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const justify =
    align === "right" ? "justify-end" :
    align === "center" ? "justify-center" :
    "justify-start";
  const text =
    align === "right" ? "text-right" :
    align === "center" ? "text-center" :
    "text-left";
  return (
    <th className={`px-2 py-2 ${text}`}>
      <button
        type="button"
        onClick={() => onSort(sortKeyValue)}
        className={`inline-flex items-center w-full ${justify} cursor-pointer hover:text-foreground transition-colors`}
        aria-label={`เรียงตาม ${typeof children === "string" ? children : ""}`}
      >
        {children}
        <SortIcon k={sortKeyValue} activeKey={activeKey} sortDir={sortDir} />
      </button>
    </th>
  );
}

function fmtDate(d: string | null) {
  return d ? d.slice(0, 10) : "-";
}

function diffDateNow(closeDate: string | null): number | null {
  if (!closeDate) return null;
  const d = new Date(closeDate).getTime();
  return Math.floor((Date.now() - d) / 86_400_000);
}

function diffDateCNT(closeDate: string | null, arrivedDate: string | null): number | null {
  if (!closeDate || !arrivedDate) return null;
  const c = new Date(closeDate).getTime();
  const a = new Date(arrivedDate).getTime();
  return Math.floor((a - c) / 86_400_000);
}

export function CntListTable({
  rows,
  showMoney,
  isWaiting,
  warehouseLabel,
  transportLabel,
  completenessByCab,
}: Props) {
  // Checkboxes available on BOTH tabs (waiting + succeed) for money-tier
  // roles, hidden per-row for already-paid containers. Matches legacy
  // report-cnt.php L501-505.
  const canSelect = showMoney;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("fdatecontainerclose");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Annotate rows with computed diff-days (so sort + summary stay in sync)
  // + per-container completeness (Phase 3 — ยิงครบ column).
  const rowsWithDiff = useMemo(
    () =>
      rows.map((r) => {
        const diffDay = isWaiting
          ? diffDateNow(r.fdatecontainerclose)
          : diffDateCNT(r.fdatecontainerclose, r.fdatestatus4);
        const c = completenessByCab?.[r.fcabinetnumber];
        return {
          ...r,
          diffDay,
          profitSum: r.priceSum - r.costSum,
          completenessExpected: c?.expected ?? 0,
          completenessScanned: c?.scanned ?? 0,
          completenessForwardersTotal: c?.forwardersTotal ?? 0,
          completenessForwardersComplete: c?.forwardersComplete ?? 0,
          completenessPct: c?.pct ?? 100,
          completenessIsComplete: c?.isComplete ?? true,
        };
      }),
    [rows, isWaiting, completenessByCab],
  );

  // Sort rows by current sortKey/sortDir
  const sortedRows = useMemo(() => {
    const out = [...rowsWithDiff];
    const dir = sortDir === "asc" ? 1 : -1;
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // null/undefined → sort to bottom regardless of dir
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      if (typeof av === "boolean" && typeof bv === "boolean") {
        return (Number(av) - Number(bv)) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
    return out;
  }, [rowsWithDiff, sortKey, sortDir]);

  const selectableRows = useMemo(
    () => (canSelect ? sortedRows.filter((r) => !r.isPaid) : []),
    [canSelect, sortedRows],
  );

  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.fcabinetnumber));

  // Aggregates for the orange summary band (matches legacy L532-538 jQuery
  // .t7..t12 + .t16). avgDay = สูตรเฉลี่ย วันที่รอเข้าโกดัง — averaged across
  // all containers with non-null diffDay.
  const totals = useMemo(() => {
    let trackCount = 0;
    let volumeSum = 0;
    let weightSum = 0;
    let costSum = 0;
    let priceSum = 0;
    let profitSum = 0;
    let dayTotal = 0;
    let dayCount = 0;
    for (const r of rows) {
      trackCount += r.trackCount;
      volumeSum  += r.volumeSum;
      weightSum  += r.weightSum;
      costSum    += r.costSum;
      priceSum   += r.priceSum;
      profitSum  += r.priceSum - r.costSum;
      const d = isWaiting
        ? diffDateNow(r.fdatecontainerclose)
        : diffDateCNT(r.fdatecontainerclose, r.fdatestatus4);
      if (d != null) {
        dayTotal += d;
        dayCount += 1;
      }
    }
    const avgDay = dayCount > 0 ? Math.round(dayTotal / dayCount) : 0;
    return { trackCount, volumeSum, weightSum, costSum, priceSum, profitSum, avgDay };
  }, [rows, isWaiting]);

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

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
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
              <SortableTH sortKeyValue="fcabinetnumber"      align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>หมายเลขตู้</SortableTH>
              <SortableTH sortKeyValue="fwarehousename"      align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>โกดัง</SortableTH>
              <SortableTH sortKeyValue="fdatecontainerclose" align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>วันที่ปิดตู้</SortableTH>
              <SortableTH sortKeyValue="ftransporttype"      align="center" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ขนส่ง</SortableTH>
              <SortableTH sortKeyValue="diffDay"             align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>{isWaiting ? "รอเข้าโกดัง" : "เดินทาง"}</SortableTH>
              <SortableTH sortKeyValue="fdatestatus4"        align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>{isWaiting ? "วันที่รอเข้าโกดัง" : "วันที่เดินทาง"}</SortableTH>
              <SortableTH sortKeyValue="trackCount"          align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>จำนวนแทรคกิ้ง</SortableTH>
              <SortableTH sortKeyValue="volumeSum"           align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ปริมาตร</SortableTH>
              <SortableTH sortKeyValue="weightSum"           align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>น้ำหนัก</SortableTH>
              <SortableTH sortKeyValue="completenessPct"     align="center" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ยิงครบ</SortableTH>
              {showMoney && <SortableTH sortKeyValue="costSum"   align="right" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ต้นทุนตู้</SortableTH>}
              {showMoney && <SortableTH sortKeyValue="priceSum"  align="right" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ราคาขาย</SortableTH>}
              {showMoney && <SortableTH sortKeyValue="profitSum" align="right" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>กำไร</SortableTH>}
              <SortableTH sortKeyValue="fstatus"             align="center" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>สถานะตู้</SortableTH>
              <SortableTH sortKeyValue="isPaid"              align="center" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>สถานะจ่ายค่าตู้</SortableTH>
            </tr>
          </thead>
          <tbody>
            {/* Orange→red gradient summary band — faithful to legacy .bg-color
                row (L407-423 + L532-538 jQuery fills). Shows total container
                count + avg waiting/transit days + per-column aggregates. */}
            <tr className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium">
              {canSelect && <td className="px-2 py-2"></td>}
              <td className="px-2 py-2 font-semibold" colSpan={4}>รวม ({rows.length} ตู้)</td>
              <td className="px-2 py-2 text-right">เฉลี่ย: {totals.avgDay.toLocaleString()} วัน</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right">{totals.trackCount.toLocaleString()}</td>
              <td className="px-2 py-2 text-right">{totals.volumeSum.toFixed(2)}</td>
              <td className="px-2 py-2 text-right">{totals.weightSum.toFixed(2)}</td>
              <td className="px-2 py-2"></td>
              {showMoney && <td className="px-2 py-2 text-right">{totals.costSum.toFixed(2)}</td>}
              {showMoney && <td className="px-2 py-2 text-right">{totals.priceSum.toFixed(2)}</td>}
              {showMoney && <td className="px-2 py-2 text-right">{totals.profitSum.toFixed(2)}</td>}
              <td className="px-2 py-2" colSpan={2}></td>
            </tr>

            {sortedRows.map((r) => {
              const badge = fstatusBadge(r.fstatus);
              const isOn = selected.has(r.fcabinetnumber);
              const selectable = canSelect && !r.isPaid;
              // SOLID row tint per fstatus (canonical listRowTint · isPaid =
              // emerald-100 wins · fstatus → yellow/cyan/pink/amber/red/blue/
              // emerald-100). Replaces the prior bg-green-50/30 opacity tint
              // that was invisible at-a-glance for staff.
              const rowTint = listRowTint(r.fstatus, r.isPaid, isOn);
              return (
                <tr
                  key={r.fcabinetnumber}
                  className={`border-t border-border ${rowTint}`}
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
                    {r.diffDay == null ? "-" : `${r.diffDay} วัน`}
                  </td>
                  <td className="px-2 py-2 text-right">{fmtDate(r.fdatestatus4)}</td>
                  <td className="px-2 py-2 text-right">{r.trackCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{r.volumeSum.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right">{r.weightSum.toFixed(2)}</td>
                  <td className="px-2 py-2 text-center">
                    {r.completenessForwardersTotal === 0 ? (
                      <span className="text-[10px] text-muted">-</span>
                    ) : r.completenessIsComplete ? (
                      <span
                        className="inline-block rounded-full bg-emerald-500 text-emerald-50 border border-emerald-700 px-2 py-0.5 text-[10px] font-medium"
                        title={`ครบทุกรายการ — ${r.completenessForwardersComplete}/${r.completenessForwardersTotal} รายการ · ยิง ${r.completenessScanned}/${r.completenessExpected} กล่อง`}
                      >
                        {r.completenessForwardersComplete}/{r.completenessForwardersTotal}
                      </span>
                    ) : (
                      <span
                        className="inline-block rounded-full bg-red-500 text-red-50 border border-red-700 px-2 py-0.5 text-[10px] font-medium"
                        title={`ของยังขาด ${r.completenessForwardersTotal - r.completenessForwardersComplete} รายการ — ยิง ${r.completenessForwardersComplete}/${r.completenessForwardersTotal} รายการ · ${r.completenessScanned}/${r.completenessExpected} กล่อง · ${r.completenessPct}%`}
                      >
                        {r.completenessForwardersComplete}/{r.completenessForwardersTotal}
                      </span>
                    )}
                  </td>
                  {showMoney && <td className="px-2 py-2 text-right">{r.costSum.toFixed(2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{r.priceSum.toFixed(2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{r.profitSum.toFixed(2)}</td>}
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.chip}`}>{badge.label}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.isPaid ? (
                      <span className="inline-block rounded-full bg-emerald-500 text-emerald-50 border border-emerald-700 px-2 py-0.5 text-[10px] font-medium">จ่ายแล้ว</span>
                    ) : (
                      <span className="inline-block rounded-full bg-red-500 text-red-50 border border-red-700 px-2 py-0.5 text-[10px] font-medium">ยังไม่จ่าย</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating action bar — only for money tier (both tabs)
          2026-06-03 ภูม flag (พี่ป๊อป ask): PCS legacy expected accounting to
          วางบิลลูกค้า directly from this page (เข้าโกดังไทยแล้ว = ตู้พร้อม
          เก็บเงินลูกค้าได้). Added 3 customer-billing entry buttons that
          PCS legacy didn't have inline — Pacred has the destination flows
          ready but they weren't linked from here:
            📄 ทำใบวางบิล → /admin/billing-run/add (R-2 formal invoice)
            📞 แจ้งชำระเงินลูกค้า → /admin/forwarder-check?page=succeed (bulk SMS/LINE)
            🧾 รวมบิลพิมพ์ → /admin/forwarders/combine-bill/add
          These show only on the "เข้าโกดังไทยแล้ว" tab (isWaiting=false). */}
      {canSelect && (
        <div className="pcs-safe-area-bottom fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-2 z-50 max-w-[calc(100vw-32px)]">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={selected.size === 0}
            className="rounded-full bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-2"
            title="บันทึกค่าใช้จ่ายตู้ที่บริษัทจ่ายเอง (ภาษี · ค่ามัดจำ · ค่าขนส่ง partner) — ลงใน tb_cnt"
          >
            💸 ทำรายการจ่ายเงินตู้
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
            📜 ประวัติจ่ายเงินตู้
          </Link>

          {/* Customer-billing entries (Pacred · only on เข้าโกดังไทยแล้ว tab) */}
          {!isWaiting && (
            <>
              <span className="mx-1 hidden sm:inline-block w-px h-6 bg-border" aria-hidden />
              <Link
                href="/admin/billing-run/add"
                className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-1.5"
                title="สร้างใบวางบิล (R-2 · formal invoice) — เก็บเงินลูกค้าเป็นรายตู้/รายลูกค้า"
              >
                📄 ทำใบวางบิล
              </Link>
              <Link
                href="/admin/forwarder-check?page=succeed"
                className="rounded-full bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-1.5"
                title="แจ้งลูกค้าให้ชำระเงิน (bulk SMS+LINE · callPriceUser)"
              >
                📞 แจ้งชำระเงินลูกค้า
              </Link>
              <Link
                href="/admin/forwarders/combine-bill/add"
                className="rounded-full bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-1.5"
                title="รวมหลาย forwarder ของลูกค้าคนเดียวเป็นบิลเดียวพิมพ์"
              >
                🧾 รวมบิลพิมพ์
              </Link>
            </>
          )}
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
