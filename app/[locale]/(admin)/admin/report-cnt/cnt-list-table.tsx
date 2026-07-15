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

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CntPaymentModal, type SelectedSummary } from "./cnt-payment-modal";
import { Explain } from "@/components/ui/tooltip";
import { fstatusBadge } from "@/lib/admin/forwarder-status";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import type { ContainerCompleteness } from "@/lib/warehouse/container-completeness";
import { fetchContainerBoxBreakdown } from "@/actions/admin/cnt-box-breakdown";
import type { BoxDimGroup } from "@/lib/warehouse/container-box-breakdown";
import type { MomoContainerInfo } from "@/lib/admin/momo-container-resolve";
import { isMomoRoutingPlaceholder } from "@/lib/admin/momo-container-resolve";

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
  /**
   * report-cnt #4 — per-cabinet MOMO shipping info keyed by `fcabinetnumber`.
   * For a "SEA0x" routing-batch placeholder it carries the REAL container code
   * (or the sack number while the container is still open) + etd/eta. Missing
   * entries (= real container codes / non-MOMO cabinets) need no resolution.
   */
  momoInfoByCab?: Record<string, MomoContainerInfo>;
  /**
   * report-cnt search (ภูม 2026-06-23) — each visible cabinet's tracking
   * numbers, so the search box matches by แทรคกิง (not only เลขตู้). Keyed by
   * `fcabinetnumber`. Built server-side (scoped to the visible cabinets).
   */
  tracksByCab?: Record<string, string[]>;
  /**
   * G1 combo-flow (2026-07-08) — per-container packing-list reconcile flag keyed by
   * `fcabinetnumber` (mig 0245). true = อัพ packing แล้ว · missing/false = ยังไม่อัพ.
   * Drives the "📦 packing" badge so staff see which containers are ready to bill.
   */
  packingByCab?: Record<string, boolean>;
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

// Legacy ขนส่ง-column pill colors — faithful to nameTransportType2()
// (report-cnt.php · include/function.php L660-668): ทางรถ = badge-info (blue #1e9ff2) ·
// ทางเรือ = badge-success (green #28d094). ทางอากาศ = Pacred air (legacy has no case →
// badge-warning amber). Keyed by the resolved transport mode ("1"/"2"/"3").
const TRANSPORT_PILL: Record<string, { label: string; cls: string }> = {
  "1": { label: "ทางรถ",    cls: "bg-[#1e9ff2]" },
  "2": { label: "ทางเรือ",  cls: "bg-[#28d094]" },
  "3": { label: "ทางอากาศ", cls: "bg-[#ff9149]" },
};

// ── ETD/ETA cell (report-cnt #4) — แต้ม (iTAM) PRIMARY · MOMO fallback ──
// Owner 2026-06-19/20: "ETD/ETA เอาของ MOMO มาเทียบ แต่ยึดของ iTAM (แต้ม) เป็นหลัก".
// A small source dot distinguishes the two; when the displayed value is แต้ม's but
// MOMO carries a DIFFERENT date, the tooltip surfaces MOMO's value for comparison.
function EtdEtaCell({
  value,
  source,
  momoValue,
  label,
}: {
  value: string | null;
  source: "taem" | "momo" | null;
  momoValue: string | null;
  label: "ETD" | "ETA";
}) {
  if (!value) {
    return (
      <td className="px-2 py-2 text-right text-muted" title={`ยังไม่มีข้อมูล ${label} (รอจากแต้ม หรือ MOMO ปิดตู้)`}>
        —
      </td>
    );
  }
  const v = value.slice(0, 10);
  const m = momoValue?.slice(0, 10) ?? null;
  const isTaem = source === "taem";
  const momoDiffers = isTaem && m != null && m !== v;
  const title = isTaem
    ? momoDiffers
      ? `${label} จากแต้ม (iTAM · ยึดเป็นหลัก) · MOMO เทียบ = ${m}`
      : `${label} จากแต้ม (iTAM · ยึดเป็นหลัก)`
    : `${label} จาก MOMO (แต้มยังไม่ส่ง · ใช้ค่า MOMO ชั่วคราว)`;
  return (
    <td className="px-2 py-2 text-right" title={title}>
      <span className="inline-flex items-center justify-end gap-1">
        <span
          aria-hidden
          className={`inline-block h-1.5 w-1.5 rounded-full ${isTaem ? "bg-emerald-500" : "bg-gray-400"}`}
        />
        <span className={isTaem ? "text-foreground" : "text-muted"}>{v}</span>
        {momoDiffers && <span className="text-[11px] text-amber-600" aria-hidden>≠MOMO</span>}
      </span>
    </td>
  );
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

// T/T (transit time · owner ภูม 2026-06-20: "เอาวันที่ ETD มาลบ ETA จะได้วัน T/T").
// = ETA − ETD in whole days. Both are date-only (yyyy-mm-dd) → clean integer diff.
// null when either date is missing (renders "—") or ETA precedes ETD (bad data).
// NOTE: distinct from the "เดินทาง" column (= วันถึงไทยจริง − วันปิดตู้, the ACTUAL
// transit); T/T is the carrier's ESTIMATED transit from ETD/ETA.
function transitTT(etd: string | null, eta: string | null): number | null {
  if (!etd || !eta) return null;
  const e = new Date(etd.slice(0, 10)).getTime();
  const a = new Date(eta.slice(0, 10)).getTime();
  if (!Number.isFinite(e) || !Number.isFinite(a)) return null;
  const days = Math.round((a - e) / 86_400_000);
  return days >= 0 ? days : null;
}

export function CntListTable({
  rows,
  showMoney,
  isWaiting,
  warehouseLabel,
  transportLabel,
  completenessByCab,
  momoInfoByCab,
  tracksByCab,
  packingByCab,
}: Props) {
  // Checkboxes available on BOTH tabs (waiting + succeed) for money-tier
  // roles, hidden per-row for already-paid containers. Matches legacy
  // report-cnt.php L501-505.
  const canSelect = showMoney;

  // Total column count — drives the expanded box-detail row's colSpan.
  // checkbox(canSelect) + 14 base cols (incl. ETD + ETA + T/T) + 3 money cols
  // (showMoney) + 2 status cols.
  const colCount = (canSelect ? 1 : 0) + 14 + (showMoney ? 3 : 0) + 2;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("fdatecontainerclose");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search,  setSearch]  = useState("");
  // Mount guard for the createPortal'd floating action bar (SSR has no document.body).
  // Same accepted pattern as container-detail-client.tsx's portalled bar.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

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

  // ค้นหา เลขตู้ / แทรคกิง (ภูม 2026-06-23) — instant client-side filter so staff
  // don't scroll the whole list. Matches the raw cabinet, the resolved MOMO real
  // container / sack number, AND any tracking number in the cabinet (tracksByCab).
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((r) => {
      if (r.fcabinetnumber.toLowerCase().includes(q)) return true;
      const momo = momoInfoByCab?.[r.fcabinetnumber];
      if (momo?.realContainer?.toLowerCase().includes(q)) return true;
      if (momo?.sackNo?.toLowerCase().includes(q)) return true;
      const tracks = tracksByCab?.[r.fcabinetnumber];
      return tracks ? tracks.some((t) => t.toLowerCase().includes(q)) : false;
    });
  }, [sortedRows, search, momoInfoByCab, tracksByCab]);

  const selectableRows = useMemo(
    () => (canSelect ? filteredRows.filter((r) => !r.isPaid) : []),
    [canSelect, filteredRows],
  );

  const allSelected =
    selectableRows.length > 0 &&
    selectableRows.every((r) => selected.has(r.fcabinetnumber));

  // Aggregates for the orange summary band (matches legacy L532-538 jQuery
  // .t7..t12 + .t16). avgDay = สูตรเฉลี่ย วันที่รอเข้าโกดัง — averaged across
  // all containers with non-null diffDay.
  // Footer sums iterate `filteredRows` (the EXACT membership the body renders —
  // search-filtered + sorted) — NOT the raw `rows` prop — so the footer total
  // never drifts from the visible body (ภูม search 2026-06-23 · the 2026-06-18
  // defensive decoupling anticipated this client-side filter).
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
    for (const r of filteredRows) {
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
  }, [filteredRows]);

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
      {/* ค้นหา เลขตู้ / แทรคกิง (ภูม 2026-06-23) — instant filter, ไม่ต้องเลื่อนหา */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา เลขตู้ / แทรคกิง…"
            aria-label="ค้นหาเลขตู้หรือแทรคกิง"
            className="w-full rounded-lg border border-border bg-white dark:bg-surface pl-9 pr-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300"
          />
        </div>
        {search && (
          <span className="whitespace-nowrap text-xs text-muted">พบ {filteredRows.length} ตู้</span>
        )}
        <Explain
          className="text-xs text-muted"
          label="เลขตู้ / กระสอบ คืออะไร?"
          def="เลขตู้ (container) = ตู้คอนเทนเนอร์ที่ปิดแล้ว เช่น GZS260601-1 · กระสอบ (sack) = เลขกระสอบที่ใช้ชั่วคราวระหว่างตู้ยังไม่ปิด (เช่น CBX… / SEA0x ของ MOMO) — เมื่อตู้ปิดจะได้เลขตู้จริง"
        />
      </div>

      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        {/* Compact + clearer grid to match legacy #myTable (owner 2026-07-16 "ตารางบวมไป ·
            zebra ของ legacy ชัดกว่า"): tight cell padding (py-1 body / py-1.5 head · legacy
            .table td padding 0.25rem) + a visible #ddd-ish grid. Zebra lives on the rows. */}
        <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-[#dcdfe4] [&>thead>tr>th]:py-1.5 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-[#dcdfe4] [&>tbody>tr>td]:py-1">
          {/* Legacy report-cnt table header — black-on-white, NOT uppercase (owner
              2026-07-16 fidelity pass · matches report-cnt.php #myTable thead). */}
          <thead className="bg-white dark:bg-surface text-[11px] text-foreground/80">
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
              {/* ETD/ETA (report-cnt #4) — sea-departure (ETD) + Thailand-arrival
                  (ETA) per container · แต้ม (iTAM) PRIMARY · MOMO fallback (from
                  momo_container_details · the Container Closed sync · 0120).
                  T/T = ETA − ETD (carrier-estimated transit). Plain headers. */}
              <th className="px-2 py-2 text-right">
                <Explain align="right" label="ETD" def="ETD (Estimated Time of Departure) = วันที่เรือ/รถออกจากจีนโดยประมาณ · ยึดของแต้ม (iTAM) เป็นหลัก · MOMO เอามาเทียบ" />
              </th>
              <th className="px-2 py-2 text-right">
                <Explain align="right" label="ETA" def="ETA (Estimated Time of Arrival) = วันที่ถึงไทยโดยประมาณ · ยึดของแต้ม (iTAM) เป็นหลัก · MOMO เอามาเทียบ" />
              </th>
              <th className="px-2 py-2 text-right">
                <Explain align="right" label="T/T" def="T/T (Transit Time) = ระยะเวลาเดินทางโดยประมาณ (วัน) = ETA − ETD" />
              </th>
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
            {/* Summary band — total container count + avg waiting/transit days + per-column
                aggregates. Owner 2026-07-16 fidelity pass: RESTORE the legacy orange→red
                gradient (report-cnt.php .bg-color · #ee7411→#c24e4e · white text) — supersedes
                the 2026-06-19 white variant (owner now wants it 100% เหมือน legacy). */}
            <tr className="bg-gradient-to-r from-[#ee7411] to-[#c24e4e] text-white text-sm border-y border-white/25 [&>td]:!border-white/30">
              {canSelect && <td className="px-2 py-2"></td>}
              {/* colSpan covers หมายเลขตู้ + โกดัง + วันที่ปิดตู้ + ETD + ETA + T/T + ขนส่ง (7) */}
              <td className="px-2 py-2 text-base font-bold" colSpan={7}>รวม ({search ? `${filteredRows.length}/${rows.length}` : rows.length} ตู้)</td>
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

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-sm text-muted">
                  ไม่พบตู้ / แทรคกิงที่ตรงกับ &quot;{search}&quot;
                </td>
              </tr>
            )}

            {filteredRows.map((r) => {
              // สถานะตู้ — 0243 (2026-07-07): show the REAL container-wide status =
              // MIN(fstatus) across the ตู้'s trackings (the least-advanced one = the
              // container's true overall stage), on BOTH tabs. r.fstatus already
              // carries min_fstatus from get_container_summary. Supersedes the
              // 2026-06-19 hardcode (waiting always "กำลังส่งมาไทย"/3) — the truthful
              // min is now consistent with the container-level bucketing.
              // Display-only · the per-tracking tb_forwarder.fstatus is unchanged.
              const badge = fstatusBadge(r.fstatus);
              const isOn = selected.has(r.fcabinetnumber);
              const selectable = canSelect && !r.isPaid;
              // Per owner (2026-06-19): keep the LIST table WHITE — drop the
              // per-fstatus / isPaid solid row tint. The same status is still
              // legible in the colored สถานะตู้ / สถานะจ่าย pills on each row, so
              // no info is lost. Only the selection highlight remains (it's
              // interaction feedback for the checkbox + floating action bar).
              // Subtle zebra on the un-selected rows (ภูม 2026-06-30 · ไม่ลายตา ·
              // legacy PCS has this). The selection highlight wins when ticked.
              // Zebra CLEARER than before (owner 2026-07-16 "ของเราดูขาวหมด · legacy ชัดกว่า"):
              // a visible light-gray on even rows + a clear hover, like legacy .table-striped.
              const rowTint = isOn
                ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300"
                : "even:bg-[#f1f4f8] hover:bg-[#e6edf6]";
              const isExpanded = expanded.has(r.fcabinetnumber);
              // report-cnt #4 (C) — for a MOMO "SEA0x" placeholder cabinet, the
              // real container / sack number MOMO carries (resolved server-side).
              const momo = momoInfoByCab?.[r.fcabinetnumber];
              const isPlaceholder = isMomoRoutingPlaceholder(r.fcabinetnumber);
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
                        <span className="text-[11px] text-muted" title="ตู้นี้จ่ายแล้ว · เลือกไม่ได้">—</span>
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
                      {/* report-cnt #4 (C): SEA0x placeholders (PR/MO/PCS…-SEA/EK##)
                          are synthetic — MOMO writes them before the container closes.
                          Show the REAL container (GZS…) when MOMO has it; else the sack
                          number (เลขกระสอบ · CBX…) while the container is still open;
                          else keep the placeholder + a "รอจากแต้ม" note. The link still
                          drills into the cabinet detail (keyed by fcabinetnumber). */}
                      {isPlaceholder && momo?.realContainer ? (
                        <span className="flex flex-col leading-tight">
                          <Link
                            href={`/admin/report-cnt/${encodeURIComponent(r.fcabinetnumber)}`}
                            className="font-semibold text-[#1e9ff2] hover:underline"
                            title={`เลขตู้จริง · placeholder MOMO = ${r.fcabinetnumber}`}
                          >
                            {momo.realContainer}
                          </Link>
                          <span className="text-[11px] text-muted">MOMO {r.fcabinetnumber}</span>
                        </span>
                      ) : isPlaceholder && momo?.sackNo ? (
                        <span className="flex flex-col leading-tight">
                          <Link
                            href={`/admin/report-cnt/${encodeURIComponent(r.fcabinetnumber)}`}
                            className="font-semibold text-[#1e9ff2] hover:underline"
                            title={`เลขตู้จริงรอจากแต้ม · ตอนนี้แสดงเลขกระสอบ · placeholder MOMO = ${r.fcabinetnumber}`}
                          >
                            {momo.sackNo}
                          </Link>
                          <span className="text-[11px] text-amber-600">เลขกระสอบ · เลขตู้จริงรอจากแต้ม</span>
                        </span>
                      ) : isPlaceholder ? (
                        // Unresolved MOMO routing placeholder (2026-07-10 · ภูม) — its
                        // parcels have NO real container assigned by MOMO yet (the
                        // resolver only claims a real container from the placeholder's
                        // OWN under-parcels · all NULL while pending). Show the routing
                        // batch id + a clear "รอ MOMO ผูกเลขตู้จริง" note so it never
                        // masquerades as a real container (the "ตู้ซ้ำ" false dupe).
                        // Auto-swaps to the real container row once MOMO closes the tู้.
                        <span className="flex flex-col leading-tight">
                          <Link
                            href={`/admin/report-cnt/${encodeURIComponent(r.fcabinetnumber)}`}
                            className="font-semibold text-[#1e9ff2] hover:underline"
                            title="ตู้นี้ยังไม่ปิด — MOMO ยังไม่ให้เลขตู้จริง · จะเปลี่ยนเป็นเลขตู้จริงให้อัตโนมัติเมื่อ MOMO ปิดตู้/ผูกเลขตู้"
                          >
                            {r.fcabinetnumber}
                          </Link>
                          <span className="text-[11px] text-amber-600">⏳ รอ MOMO ผูกเลขตู้จริง</span>
                        </span>
                      ) : (
                        <Link
                          href={`/admin/report-cnt/${encodeURIComponent(r.fcabinetnumber)}`}
                          className="font-semibold text-[#1e9ff2] hover:underline"
                          title="ดูรายละเอียดตู้นี้"
                        >
                          {r.fcabinetnumber}
                        </Link>
                      )}
                    </div>
                    {/* G1 combo-flow (2026-07-08) — packing-list reconcile status (mig 0245).
                        ✓ = อัพ packing แล้ว (ยอดกล่อง/น้ำหนักยืนยันแล้ว · พร้อมออกบิล) ·
                        ⏳ = ยังไม่อัพ (ลิงก์ไปเครื่องมืออัพ). Keyed on the REAL fcabinetnumber. */}
                    {packingByCab?.[r.fcabinetnumber] ? (
                      <span className="mt-0.5 inline-block rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] px-1.5 py-0.5">
                        📦 packing ✓
                      </span>
                    ) : (
                      <Link
                        href="/admin/api-forwarder-momo/packing-upload"
                        className="mt-0.5 inline-block rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] px-1.5 py-0.5 hover:bg-amber-100"
                        title="ตู้นี้ยังไม่อัพ packing list — คลิกเพื่ออัพ"
                      >
                        ⏳ ยังไม่อัพ packing
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2">{warehouseLabel[r.fwarehousename] ?? r.fwarehousename}</td>
                  <td className="px-2 py-2 text-right">{fmtDate(r.fdatecontainerclose)}</td>
                  {/* ETD/ETA (report-cnt #4 · A) — แต้ม (iTAM) PRIMARY · MOMO fallback.
                      Source dot: green = แต้ม (ยึดเป็นหลัก) · gray = MOMO (มาเทียบ).
                      Tooltip notes MOMO's value when it disagrees with แต้ม. "—" when
                      no source has it yet. */}
                  <EtdEtaCell
                    value={momo?.etd ?? null}
                    source={momo?.etdSource ?? null}
                    momoValue={momo?.momoEtd ?? null}
                    label="ETD"
                  />
                  <EtdEtaCell
                    value={momo?.eta ?? null}
                    source={momo?.etaSource ?? null}
                    momoValue={momo?.momoEta ?? null}
                    label="ETA"
                  />
                  {/* T/T (transit time) = ETA − ETD · owner ภูม 2026-06-20 */}
                  {(() => {
                    const tt = transitTT(momo?.etd ?? null, momo?.eta ?? null);
                    return (
                      <td className="px-2 py-2 text-right" title="ระยะเวลาเดินทางโดยประมาณ (T/T) = ETA − ETD">
                        {tt == null ? "—" : `${tt} วัน`}
                      </td>
                    );
                  })()}
                  {/* ขนส่ง — legacy colored pill (nameTransportType2 · ทางรถ=info/blue ·
                      ทางเรือ=success/green). Owner 2026-07-16 "ใส่สีให้เหมือน legacy". */}
                  <td className="px-2 py-2 text-center">
                    {(() => {
                      const mode = resolveTransportMode(r.fcabinetnumber, r.ftransporttype);
                      const p = TRANSPORT_PILL[mode];
                      return p ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${p.cls}`}>{p.label}</span>
                      ) : (
                        <span>{transportLabel[mode] ?? r.ftransporttype}</span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {r.diffDay == null ? "-" : `${r.diffDay} วัน`}
                  </td>
                  <td className="px-2 py-2 text-right">{fmtDate(r.fdatestatus4)}</td>
                  <td className="px-2 py-2 text-right">{r.trackCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{r.completenessExpected.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(r.volumeSum, 6)}</td>
                  <td className="px-2 py-2 text-right">{fmtNum(r.weightSum, 2)}</td>
                  {/* ยิงครบ — พี่ป๊อป spec (2026-07-06 · TASK #2): the ขาด/ครบ
                      sub-status. Count by BOX (CTNS): scanned/expected (Σ fi2amount /
                      Σ famount).
                        · scanned < expected → 💗 ชมพู "ขาด N กล่อง" (owner: หาย→ขาว
                          เมื่อยิงครบ) — a self-explaining pill (§0g); the reader sees
                          exactly how many boxes are still missing.
                        · scanned ≥ expected → ✅ "ครบ" (ขาว/เขียว) — every box in.
                      scanned/expected + the รายการ breakdown stay in the tooltip. */}
                  <td className="px-2 py-2 text-center">
                    {r.completenessForwardersTotal === 0 ? (
                      <span className="text-[11px] text-muted">-</span>
                    ) : r.completenessScanned >= r.completenessExpected ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 text-[11px] font-semibold"
                        title={`ยิงครบทุกกล่อง — ${r.completenessScanned}/${r.completenessExpected} กล่อง · ${r.completenessForwardersComplete}/${r.completenessForwardersTotal} รายการ`}
                      >
                        ✅ ครบ
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-pink-100 text-pink-700 border border-pink-300 px-2 py-0.5 text-[11px] font-semibold"
                        title={`ยังขาด ${(r.completenessExpected - r.completenessScanned).toLocaleString()} กล่อง — ยิง ${r.completenessScanned}/${r.completenessExpected} กล่อง · ${r.completenessForwardersComplete}/${r.completenessForwardersTotal} รายการ · ${r.completenessPct}%`}
                      >
                        ขาด {(r.completenessExpected - r.completenessScanned).toLocaleString()} กล่อง
                      </span>
                    )}
                  </td>
                  {showMoney && <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtNum(r.costSum, 2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right tabular-nums font-medium text-foreground">{fmtNum(r.priceSum, 2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">{fmtNum(r.profitSum, 2)}</td>}
                  <td className="px-2 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>{badge.label}</span>
                    {/* Next-action hint (self-explaining-row standard §0g · owner
                        2026-06-22) — "ให้พนักงานทำอะไรต่อ" under the สถานะตู้ pill.
                        Reuses the SOT FSTATUS_CFG.next/act via `badge` (same display
                        status as the pill: "3" on the waiting tab · r.fstatus on the
                        arrived tab). 🔔 + rose when an action is due. */}
                    {badge.next ? (
                      <div className={`mt-1 text-[11px] whitespace-nowrap ${badge.act ? "font-semibold text-rose-600" : "text-muted"}`}>
                        {badge.act ? "🔔 " : ""}{badge.next}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {r.isPaid ? (
                      <span className="inline-block rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 px-2 py-0.5 text-[11px] font-medium">จ่ายแล้ว</span>
                    ) : (
                      <span className="inline-block rounded-full bg-red-100 text-red-700 border border-red-300 px-2 py-0.5 text-[11px] font-medium">ยังไม่จ่าย</span>
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
      {/* Floating action bar — PORTALLED to <body> so `position: fixed` anchors to the
          VIEWPORT and stays put on scroll (owner 2026-07-16 "ต้องคาอยู่ที่เดิม ไม่ใช่เลื่อน
          ลงล่างสุดถึงเจอ"). Without the portal a transformed admin-shell ancestor becomes
          the containing block → the bar scrolls to the page bottom. Bottom-LEFT like legacy
          .pcs-fixed-actions (left-20 on lg clears the 64px sidebar rail). */}
      {canSelect && mounted && createPortal(
        <div className="pcs-safe-area-bottom fixed bottom-5 left-4 lg:left-20 flex flex-wrap items-center justify-start gap-2 z-[60] max-w-[calc(100vw-32px)]">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={selected.size === 0}
            className="rounded-full bg-primary-500 hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-2"
            title="บันทึกค่าใช้จ่ายตู้ที่บริษัทจ่ายเอง (ภาษี · ค่ามัดจำ · ค่าขนส่ง partner) — ลงใน tb_cnt"
          >
            💸 ทำรายการจ่ายเงินตู้
            {selected.size > 0 && (
              <span className="inline-flex items-center justify-center bg-white text-primary-600 text-[11px] font-bold rounded-full h-5 min-w-[20px] px-1.5">
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
                  <span className="inline-flex items-center justify-center bg-white text-emerald-600 text-[11px] font-bold rounded-full h-5 min-w-[20px] px-1.5">
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
              {/* ใบกำกับ/ใบขน จากตู้ (task #16 · 2026-07-01) — เลือกสินค้าในตู้ →
                  สร้างใบขน/ใบกำกับ (ร่าง) ผ่าน item-picker เดิม. picker เป็นราย
                  forwarder/ราย ตู้ → รับ 1 ตู้เท่านั้น (เลือก >1 = disabled). */}
              {selected.size === 1 ? (
                <Link
                  href={`/admin/report-cnt/customs-doc?cabinet=${encodeURIComponent(Array.from(selected)[0]!)}`}
                  className="rounded-full bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-1.5"
                  title="เลือกสินค้าในตู้นี้ → จัดลงอินวอยซ์ / แพคกิ้งลิสต์ / ใบขน (ร่าง)"
                >
                  📦 จัดลงอินวอยซ์/แพคกิ้ง/ใบขน
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-full bg-gray-300 text-white px-4 py-2 text-xs font-semibold shadow-lg inline-flex items-center gap-1.5 cursor-not-allowed"
                  title={selected.size === 0 ? "เลือกตู้ก่อน 1 ตู้" : "เลือกได้ครั้งละ 1 ตู้ (เอกสารเป็นรายตู้)"}
                >
                  📦 จัดลงอินวอยซ์/แพคกิ้ง/ใบขน
                </button>
              )}
            </>
          )}
        </div>,
        document.body,
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
  // Count only REAL distinct sizes for the header (the unsized bucket isn't "a size").
  const sizedCount = groups.filter((g) => g.width > 0 || g.length > 0 || g.height > 0).length;
  const dim = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border border-border bg-white dark:bg-surface overflow-x-auto">
      <div className="px-3 py-1.5 text-[11px] font-semibold text-foreground border-b border-border">
        📦 รายละเอียดกล่อง — แยกตามขนาด ({sizedCount} ขนาด{hasUnsized ? " + ไม่ระบุขนาด" : ""})
      </div>
      <table className="w-full text-[11px]">
        <thead className="text-muted bg-surface-alt/40">
          <tr className="border-b border-border">
            {/* ภูม 2026-06-30: รหัสลูกค้า (PR) first — "มองบางทีไม่รู้ว่าของลูกค้าคนไหน".
                One group usually = one customer; several only when different
                customers ship the exact same box size. */}
            <th className="px-3 py-1.5 text-left font-medium">รหัสลูกค้า</th>
            {/* report-cnt #4 (B): show the tracking number(s) instead of a ลำดับ #
                (owner: the sequence is hard to read). One group usually = one
                tracking; a few when parcels share an exact box size. */}
            <th className="px-3 py-1.5 text-left font-medium">แทรคกิ้ง</th>
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
              <tr key={i} className="border-b border-border/40 last:border-0 even:bg-surface-alt/30">
                {/* รหัสลูกค้า (ภูม 2026-06-30) — PR code(s) for this box-size group.
                    Usually one; multiple shown line-separated. */}
                <td className="px-3 py-1.5 font-mono text-[11px] text-foreground">
                  {g.userids.length > 0 ? (
                    <span className="flex flex-col leading-tight" title={g.userids.join(", ")}>
                      {g.userids.map((u) => (
                        <span key={u}>{u}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-foreground">
                  {g.trackings.length > 0 ? (
                    <span className="break-all" title={g.trackings.join(", ")}>
                      {g.trackings.join(", ")}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                {hasDims ? (
                  <>
                    <td className="px-3 py-1.5 text-right tabular-nums">{dim(g.width)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{dim(g.length)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{dim(g.height)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="px-3 py-1.5 text-center text-[11px] text-amber-600" title="ยังไม่มีข้อมูลขนาดรายกล่องจาก MOMO">
                    ไม่ระบุขนาด
                  </td>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(perBox, 6)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{g.boxes.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(g.cbm, 6)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold bg-surface-alt/30">
            {/* colSpan 6 = รหัสลูกค้า + แทรคกิ้ง + กว้าง + ยาว + สูง + CBM/กล่อง */}
            <td className="px-3 py-1.5" colSpan={6}>รวม</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{totalBoxes.toLocaleString()}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(totalCbm, 6)}</td>
          </tr>
        </tfoot>
      </table>
      {hasUnsized && (
        <div className="px-3 py-1 text-[11px] text-muted border-t border-border">
          &quot;ไม่ระบุขนาด&quot; = ยังไม่มีข้อมูลขนาดรายกล่องจาก MOMO (เช่น พัสดุที่บันทึกแต่ CBM รวม) — คิวรวมด้านบนใช้คิดราคาได้ปกติ
        </div>
      )}
    </div>
  );
}
