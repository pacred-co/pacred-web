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

import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CntPaymentModal, type SelectedSummary } from "./cnt-payment-modal";
import { fstatusBadge } from "@/lib/admin/forwarder-status";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import type { ContainerCompleteness } from "@/lib/warehouse/container-completeness";
import { fetchContainerBoxBreakdown } from "@/actions/admin/cnt-box-breakdown";
import type { BoxDimGroup } from "@/lib/warehouse/container-box-breakdown";

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
  | "completenessExpected" // CTNS — total cartons in the container (Σ famount)
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

// Number with thousand separators (ลูกน้ำ) + fixed decimals — owner 2026-06-19
// ("ใส่ลูกน้ำ ตัวเลขอ่านยาก"). e.g. fmtNum(999838.15, 2) → "999,838.15".
function fmtNum(n: number, digits: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
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
  if (!Number.isFinite(c) || !Number.isFinite(a)) return null;
  const days = Math.floor((a - c) / 86_400_000);
  // Guard data artifacts: a container whose close date == arrival date in the DB
  // (e.g. GZS260519-1, a few legacy rows) has no recorded transit time → "0 วัน"
  // is misleading for a cross-border sea/road/air shipment. Treat <= 0 as "no
  // valid transit data" (renders "-") so it doesn't drag the เฉลี่ย average down.
  if (days <= 0) return null;
  return days;
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

  // Total column count — drives the expanded box-detail row's colSpan.
  // checkbox(canSelect) + 11 base cols + 3 money cols(showMoney) + 2 status cols.
  const colCount = (canSelect ? 1 : 0) + 11 + (showMoney ? 3 : 0) + 2;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("fdatecontainerclose");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Expandable box-dimension detail (owner ask 2026-06-19 · ปอน) ──
  // Click a container's chevron → drop down its box detail (กว้าง/ยาว/สูง/CBM/
  // จำนวนกล่อง) grouped by size. Lazy: the breakdown is fetched once on first
  // expand (NOT eagerly for every container · most rows are never opened), then
  // cached in state. Independent of the row Link (which still navigates to detail).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [breakdownCache, setBreakdownCache] = useState<Record<string, BoxDimGroup[]>>({});
  const [breakdownLoading, setBreakdownLoading] = useState<Set<string>>(new Set());
  const [breakdownError, setBreakdownError] = useState<Record<string, string>>({});

  function toggleExpand(cab: string) {
    const willExpand = !expanded.has(cab);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cab)) next.delete(cab);
      else next.add(cab);
      return next;
    });
    // Fetch once, on first expand only.
    if (willExpand && !(cab in breakdownCache) && !breakdownLoading.has(cab)) {
      setBreakdownLoading((prev) => new Set(prev).add(cab));
      void fetchContainerBoxBreakdown(cab)
        .then((res) => {
          if (res.ok) {
            setBreakdownCache((prev) => ({ ...prev, [cab]: res.data ?? [] }));
          } else {
            setBreakdownError((prev) => ({ ...prev, [cab]: res.error }));
          }
        })
        .catch(() => {
          setBreakdownError((prev) => ({ ...prev, [cab]: "โหลดรายละเอียดกล่องไม่สำเร็จ" }));
        })
        .finally(() => {
          setBreakdownLoading((prev) => {
            const next = new Set(prev);
            next.delete(cab);
            return next;
          });
        });
    }
  }

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
          // จำนวนแทรคกิ้ง = countable forwarder rows (forwardersTotal already
          // drops the MOMO หัวบิล placeholder · audit 2026-06-18). Was the RPC
          // row_count which over-counts a split-MOMO cabinet by +1 (the หัวบิล),
          // making จำนวนแทรคกิ้ง disagree with ยิงครบ in the same row. The
          // money/volume Σ are unaffected (the หัวบิล carries 0). Falls back to
          // the RPC count when there's no completeness data.
          trackCount: (c?.forwardersTotal ?? 0) > 0 ? c!.forwardersTotal : r.trackCount,
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
  // Footer sums iterate `rowsWithDiff` (same membership the body renders, with
  // diffDay already computed) — NOT the raw `rows` prop — so the footer can
  // never drift from the visible body if a client-side filter is ever added
  // (audit 2026-06-18 defensive decoupling; sort doesn't change membership).
  const totals = useMemo(() => {
    let trackCount = 0;
    let ctnsSum = 0;
    let volumeSum = 0;
    let weightSum = 0;
    let costSum = 0;
    let priceSum = 0;
    let profitSum = 0;
    let dayTotal = 0;
    let dayCount = 0;
    for (const r of rowsWithDiff) {
      trackCount += r.trackCount;
      ctnsSum    += r.completenessExpected; // CTNS — total cartons (Σ famount)
      volumeSum  += r.volumeSum;
      weightSum  += r.weightSum;
      costSum    += r.costSum;
      priceSum   += r.priceSum;
      profitSum  += r.profitSum;
      if (r.diffDay != null) {
        dayTotal += r.diffDay;
        dayCount += 1;
      }
    }
    const avgDay = dayCount > 0 ? Math.round(dayTotal / dayCount) : 0;
    return { trackCount, ctnsSum, volumeSum, weightSum, costSum, priceSum, profitSum, avgDay };
  }, [rowsWithDiff]);

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
              <SortableTH sortKeyValue="trackCount"          align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>จำนวนชิปเมนต์</SortableTH>
              <SortableTH sortKeyValue="completenessExpected" align="right" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>จำนวนกล่อง (CTNS)</SortableTH>
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
            {/* Summary band — total container count + avg waiting/transit days
                + per-column aggregates. Per owner (2026-06-19): kept WHITE (was
                an orange→red gradient) — separated from data rows by bold text +
                a heavier top/bottom border instead of a loud fill. */}
            <tr className="bg-white dark:bg-surface text-foreground font-bold border-y-2 border-border">
              {canSelect && <td className="px-2 py-2"></td>}
              <td className="px-2 py-2 font-semibold" colSpan={4}>รวม ({rows.length} ตู้)</td>
              <td className="px-2 py-2 text-right">เฉลี่ย: {totals.avgDay.toLocaleString()} วัน</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right">{totals.trackCount.toLocaleString()}</td>
              <td className="px-2 py-2 text-right">{totals.ctnsSum.toLocaleString()}</td>
              <td className="px-2 py-2 text-right">{fmtNum(totals.volumeSum, 6)}</td>
              <td className="px-2 py-2 text-right">{fmtNum(totals.weightSum, 2)}</td>
              <td className="px-2 py-2"></td>
              {showMoney && <td className="px-2 py-2 text-right">{fmtNum(totals.costSum, 2)}</td>}
              {showMoney && <td className="px-2 py-2 text-right">{fmtNum(totals.priceSum, 2)}</td>}
              {showMoney && <td className="px-2 py-2 text-right">{fmtNum(totals.profitSum, 2)}</td>}
              <td className="px-2 py-2" colSpan={2}></td>
            </tr>

            {sortedRows.map((r) => {
              // สถานะตู้ — owner 2026-06-19 (ปอน): "มีเลขตู้ = กำลังส่งมาไทย ทั้งหมด".
              // Every row on the รอเข้าโกดังไทย tab has a cabinet number (the page
              // groups by + filters fcabinetnumber), so the container is loaded +
              // in transit → its CONTAINER status is "กำลังส่งมาไทย" (3). The old
              // MIN(fstatus) left a ตู้ reading "รอเข้าโกดังจีน/ถึงโกดังจีนแล้ว" when
              // one stale tracking sat at 1/2 — contradictory for a closed container.
              // Display-only · the per-tracking tb_forwarder.fstatus is unchanged.
              // The เข้าโกดังไทยแล้ว tab (arrived) keeps its real status.
              const badge = fstatusBadge(isWaiting ? "3" : r.fstatus);
              const isOn = selected.has(r.fcabinetnumber);
              const selectable = canSelect && !r.isPaid;
              // Per owner (2026-06-19): keep the LIST table WHITE — drop the
              // per-fstatus / isPaid solid row tint. The same status is still
              // legible in the colored สถานะตู้ / สถานะจ่าย pills on each row, so
              // no info is lost. Only the selection highlight remains (it's
              // interaction feedback for the checkbox + floating action bar).
              const rowTint = isOn
                ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300"
                : "hover:bg-surface-alt/40";
              const isExpanded = expanded.has(r.fcabinetnumber);
              return (
                <Fragment key={r.fcabinetnumber}>
                <tr
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
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.fcabinetnumber)}
                        className="shrink-0 text-muted hover:text-primary-600 transition-colors"
                        aria-label={isExpanded ? "ซ่อนรายละเอียดกล่อง" : "ดูรายละเอียดกล่อง"}
                        aria-expanded={isExpanded}
                        title="รายละเอียดกล่อง — กว้าง × ยาว × สูง · CBM · จำนวน (แยกตามขนาด)"
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <Link
                        href={`/admin/report-cnt/${encodeURIComponent(r.fcabinetnumber)}`}
                        className="text-primary-600 hover:underline"
                        title="ดูรายละเอียดตู้นี้"
                      >
                        {r.fcabinetnumber}
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 py-2">{warehouseLabel[r.fwarehousename] ?? r.fwarehousename}</td>
                  <td className="px-2 py-2 text-right">{fmtDate(r.fdatecontainerclose)}</td>
                  <td className="px-2 py-2 text-center">{transportLabel[resolveTransportMode(r.fcabinetnumber, r.ftransporttype)] ?? r.ftransporttype}</td>
                  <td className="px-2 py-2 text-right">
                    {r.diffDay == null ? "-" : `${r.diffDay} วัน`}
                  </td>
                  <td className="px-2 py-2 text-right">{fmtDate(r.fdatestatus4)}</td>
                  <td className="px-2 py-2 text-right">{r.trackCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{r.completenessExpected.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(r.volumeSum, 6)}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(r.weightSum, 2)}</td>
                  {/* ยิงครบ — per owner (2026-06-19): count by BOX (CTNS) not by
                      record. Shows scanned/expected boxes (Σ fi2amount / Σ famount);
                      green when every box is in. The รายการ (shipment) breakdown
                      stays in the tooltip for reference. */}
                  <td className="px-2 py-2 text-center">
                    {r.completenessForwardersTotal === 0 ? (
                      <span className="text-[10px] text-muted">-</span>
                    ) : r.completenessScanned >= r.completenessExpected ? (
                      <span
                        className="inline-block rounded-full bg-emerald-500 text-emerald-50 border border-emerald-700 px-2 py-0.5 text-[10px] font-medium"
                        title={`ยิงครบทุกกล่อง — ${r.completenessScanned}/${r.completenessExpected} กล่อง · ${r.completenessForwardersComplete}/${r.completenessForwardersTotal} รายการ`}
                      >
                        {r.completenessScanned}/{r.completenessExpected}
                      </span>
                    ) : (
                      <span
                        className="inline-block rounded-full bg-red-500 text-red-50 border border-red-700 px-2 py-0.5 text-[10px] font-medium"
                        title={`ของยังขาด ${r.completenessExpected - r.completenessScanned} กล่อง — ยิง ${r.completenessScanned}/${r.completenessExpected} กล่อง · ${r.completenessForwardersComplete}/${r.completenessForwardersTotal} รายการ · ${r.completenessPct}%`}
                      >
                        {r.completenessScanned}/{r.completenessExpected}
                      </span>
                    )}
                  </td>
                  {showMoney && <td className="px-2 py-2 text-right">{fmtNum(r.costSum, 2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{fmtNum(r.priceSum, 2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{fmtNum(r.profitSum, 2)}</td>}
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
                {isExpanded && (
                  <tr className="bg-surface-alt/30">
                    <td colSpan={colCount} className="px-3 pb-3 pt-1">
                      <BoxBreakdownPanel
                        loading={breakdownLoading.has(r.fcabinetnumber)}
                        error={breakdownError[r.fcabinetnumber]}
                        groups={breakdownCache[r.fcabinetnumber]}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
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
              {/* ภูม flag 2026-06-10: pass the ticked container(s) so /add pre-fills
                  the customer + their billable forwarders (was a bare nav → blank
                  form). Single-customer container → form opens ready to confirm. */}
              <Link
                href={
                  selected.size > 0
                    ? `/admin/billing-run/add?cabinet=${encodeURIComponent(Array.from(selected).join(","))}`
                    : "/admin/billing-run/add"
                }
                className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-1.5"
                title={
                  selected.size > 0
                    ? `สร้างใบวางบิลจากตู้ที่เลือก (${selected.size}) — เลือกลูกค้า + รายการให้อัตโนมัติ`
                    : "สร้างใบวางบิล (R-2 · formal invoice) — เก็บเงินลูกค้าเป็นรายตู้/รายลูกค้า"
                }
              >
                📄 ทำใบวางบิล
                {selected.size > 0 && (
                  <span className="inline-flex items-center justify-center bg-white text-emerald-600 text-[10px] font-bold rounded-full h-5 min-w-[20px] px-1.5">
                    {selected.size}
                  </span>
                )}
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

// ── Box-dimension breakdown panel (expanded row · owner ask 2026-06-19 · ปอน) ──
// Renders the lazy-loaded per-size breakdown: one row per distinct box dimension
// (กว้าง × ยาว × สูง) with Σ กล่อง + Σ CBM — like the import page (หน้านำเข้า). A
// container with 9 boxes = 6 of size A + 3 of size B shows 2 rows.
function BoxBreakdownPanel({
  loading,
  error,
  groups,
}: {
  loading: boolean;
  error?: string;
  groups?: BoxDimGroup[];
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังโหลดรายละเอียดกล่อง…
      </div>
    );
  }
  if (error) {
    return <div className="py-2 text-xs text-red-600">⚠️ {error}</div>;
  }
  if (!groups) return null;
  if (groups.length === 0) {
    return <div className="py-2 text-xs text-muted">— ไม่มีข้อมูลขนาดกล่องในตู้นี้</div>;
  }

  const totalBoxes = groups.reduce((s, g) => s + g.boxes, 0);
  const totalCbm = groups.reduce((s, g) => s + g.cbm, 0);
  const hasUnsized = groups.some((g) => g.width === 0 && g.length === 0 && g.height === 0);
  const dim = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border border-border bg-white dark:bg-surface overflow-x-auto">
      <div className="px-3 py-1.5 text-[11px] font-semibold text-foreground border-b border-border">
        📦 รายละเอียดกล่อง — แยกตามขนาด ({groups.length} ขนาด)
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-muted bg-surface-alt/40">
          <tr className="border-b border-border">
            <th className="px-3 py-1.5 text-left font-medium">#</th>
            <th className="px-3 py-1.5 text-right font-medium">กว้าง (ซม.)</th>
            <th className="px-3 py-1.5 text-right font-medium">ยาว (ซม.)</th>
            <th className="px-3 py-1.5 text-right font-medium">สูง (ซม.)</th>
            <th className="px-3 py-1.5 text-right font-medium">CBM/กล่อง</th>
            <th className="px-3 py-1.5 text-right font-medium">จำนวนกล่อง</th>
            <th className="px-3 py-1.5 text-right font-medium">CBM รวม</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => {
            const hasDims = g.width > 0 || g.length > 0 || g.height > 0;
            const perBox = g.boxes > 0 ? g.cbm / g.boxes : 0;
            return (
              <tr key={i} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-1.5 text-muted">{i + 1}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{hasDims ? dim(g.width) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{hasDims ? dim(g.length) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{hasDims ? dim(g.height) : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(perBox, 6)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{g.boxes.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(g.cbm, 6)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold bg-surface-alt/30">
            <td className="px-3 py-1.5" colSpan={5}>รวม</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{totalBoxes.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(totalCbm, 6)}</td>
          </tr>
        </tfoot>
      </table>
      {hasUnsized && (
        <div className="px-3 py-1 text-[10px] text-muted border-t border-border">
          &quot;—&quot; = กล่องที่ไม่ได้ระบุขนาด (เช่น พัสดุ MOMO ที่บันทึกแต่ CBM รวม)
        </div>
      )}
    </div>
  );
}
