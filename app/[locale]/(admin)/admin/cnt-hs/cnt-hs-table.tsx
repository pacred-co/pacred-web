"use client";

/**
 * <CntHsTable> — client wrapper for the cnt-hs LIST table.
 *
 * Wave 24 ROW-COLOR-RESTORE (2026-05-28 ดึก · Agent P3):
 *   ภูม + พี่ป๊อป flagged that the Wave 23 P1-11.a rewrite of
 *   /admin/cnt-hs (commit cd21c4f0) DROPPED three legacy affordances:
 *
 *     1. **Row tint per cntStatus** — staff scan the ledger in <1s by
 *        reading row BG color. Legacy `cnt-hs.css` `.bg-color` painted
 *        unpaid rows orange-red, `.paid` painted paid green. The rewrite
 *        used a uniform `hover:bg-surface-alt/30` (all rows identical) —
 *        unusable at-a-glance. AGENTS.md §0a: chip-color + row-tint are
 *        LOGIC not chrome. Restored via `CNTHS_ROW_TINT` canonical lib.
 *
 *     2. **Sortable column headers** — every legacy `<th>` was a DataTables
 *        sortable header. Restored client-side sort state with
 *        `ArrowUpDown` indicator.
 *
 *     3. **Orange summary band** — legacy showed total ฿ + N รายการ under
 *        the header. Pattern matches `/admin/report-cnt/cnt-list-table.tsx`
 *        L188-198 (gradient-orange-to-red row).
 *
 * Status chip palette also corrected — was `-100` tints (border + text
 * over washed BG), now solid `-400/500` from `CNTSTATUS_CFG` canonical
 * lib so the chip reads at-a-glance.
 */

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowUpDown } from "lucide-react";
import { CNTHS_ROW_TINT, CNTSTATUS_CFG } from "@/lib/admin/forwarder-status";
import { CabinetListCell } from "./cabinet-list-cell";

// ─────────────────────────────────────────────────────────────────────
// Row shape — JSON-serializable subset passed from server page.tsx
// ─────────────────────────────────────────────────────────────────────

export type CntHsRow = {
  ID: number;
  cntName: string;
  cntStatus: string;
  cntAmount: number;
  cntImagesSlip: string;
  cntFile: string;
  date: string | null;
  adminIDCreate: string;
  nameBlank: string;
  noBlank: string;
  nameAccount: string;
  cabinets: string[]; // pre-resolved (fan-out OR cntName CSV) from server
};

type SortKey =
  | "ID"
  | "date"
  | "cabinetCount"
  | "cntAmount"
  | "nameBlank"
  | "adminIDCreate"
  | "cntStatus";

type SortDir = "asc" | "desc";

// ─────────────────────────────────────────────────────────────────────
// SortableTh — module-level component (Next 16 react-hooks/static-components
// rule rejects components created INSIDE the render body of another component
// because their identity changes every render, breaking memoisation + tree
// stability). Extracted here so the parent passes (activeKey · onSort) as
// props instead of closing over them.
// ─────────────────────────────────────────────────────────────────────

type SortableThProps = {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  onSort: (key: SortKey) => void;
  align?: "left" | "right" | "center";
  className?: string;
};

function SortableTh({
  label,
  sortKey,
  activeKey,
  onSort,
  align = "left",
  className = "",
}: SortableThProps) {
  const active = activeKey === sortKey;
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-4 py-3 ${alignCls} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-primary-700 font-semibold" : ""
        }`}
        aria-label={`เรียงตาม ${label}`}
      >
        {label}
        <ArrowUpDown
          className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`}
          aria-hidden
        />
      </button>
    </th>
  );
}

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56" thousand-grouped. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a YYYY-MM-DD / ISO date into Thai short date. Returns "—" on failure. */
function formatDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

export function CntHsTable({ rows }: { rows: CntHsRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Sort + summary derivation
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case "ID":
          av = a.ID;
          bv = b.ID;
          break;
        case "date":
          av = a.date ? new Date(a.date).getTime() : 0;
          bv = b.date ? new Date(b.date).getTime() : 0;
          break;
        case "cabinetCount":
          av = a.cabinets.length;
          bv = b.cabinets.length;
          break;
        case "cntAmount":
          av = Number(a.cntAmount ?? 0);
          bv = Number(b.cntAmount ?? 0);
          break;
        case "nameBlank":
          av = (a.nameBlank ?? "").toLowerCase();
          bv = (b.nameBlank ?? "").toLowerCase();
          break;
        case "adminIDCreate":
          av = (a.adminIDCreate ?? "").toLowerCase();
          bv = (b.adminIDCreate ?? "").toLowerCase();
          break;
        case "cntStatus":
          av = a.cntStatus ?? "";
          bv = b.cntStatus ?? "";
          break;
        default:
          av = 0;
          bv = 0;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    let amountSum = 0;
    let cabinetSum = 0;
    for (const r of rows) {
      amountSum += Number(r.cntAmount ?? 0);
      cabinetSum += r.cabinets.length;
    }
    return { amountSum, cabinetSum };
  }, [rows]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <>
      <p className="px-4 pt-3 text-[11px] text-muted">
        <span className="opacity-70">เลื่อนซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด · กดหัวคอลัมน์เพื่อเรียงข้อมูล</span>
        <span className="ml-1">⇆</span>
      </p>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-orange-400/50 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-orange-500 text-left text-xs uppercase tracking-wide text-white">
            <tr>
              <SortableTh label="ID"           sortKey="ID"            activeKey={sortKey} onSort={handleSort} />
              <SortableTh label="วันที่"        sortKey="date"          activeKey={sortKey} onSort={handleSort} />
              <SortableTh label="หมายเลขตู้"   sortKey="cabinetCount"  activeKey={sortKey} onSort={handleSort} />
              <SortableTh label="จำนวนเงิน"    sortKey="cntAmount"     activeKey={sortKey} onSort={handleSort} align="right" />
              <SortableTh label="ธนาคาร"      sortKey="nameBlank"     activeKey={sortKey} onSort={handleSort} />
              <th className="px-4 py-3 text-center">สลิป</th>
              <th className="px-4 py-3 text-center">หลักฐาน</th>
              <SortableTh label="ผู้ทำรายการ"   sortKey="adminIDCreate" activeKey={sortKey} onSort={handleSort} />
              <SortableTh label="สถานะ"        sortKey="cntStatus"     activeKey={sortKey} onSort={handleSort} align="center" />
              <th className="px-4 py-3 text-right">ตัวเลือก</th>
            </tr>
            {/* Orange summary band — legacy "bg-color" tone + pattern from
                report-cnt/cnt-list-table.tsx L188-198. */}
            <tr className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium">
              <td className="px-4 py-2" colSpan={3}>
                รวม ({rows.length.toLocaleString()} รายการ · {totals.cabinetSum.toLocaleString()} ตู้)
              </td>
              <td className="px-4 py-2 text-right font-mono">฿{numberFormat2(totals.amountSum)}</td>
              <td className="px-4 py-2" colSpan={6}></td>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const isPaid = row.cntStatus === "2";
              const isRejected = row.cntStatus === "3";
              const chip = isPaid
                ? CNTSTATUS_CFG.paid
                : isRejected
                  ? { label: "ปฏิเสธ", chip: "bg-red-500 text-red-50 border border-red-700" }
                  : CNTSTATUS_CFG.unpaid;
              const tint = CNTHS_ROW_TINT[row.cntStatus] ?? "";
              return (
                <tr
                  key={row.ID}
                  className={`border-t border-border ${tint} hover:bg-surface-alt/30`}
                >
                  {/* 1 — ID */}
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/admin/cnt-hs/${row.ID}`}
                      className="text-primary-700 hover:underline"
                    >
                      #{row.ID}
                    </Link>
                  </td>
                  {/* 2 — วันที่ */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {formatDate(row.date)}
                  </td>
                  {/* 3 — หมายเลขตู้ */}
                  <td className="px-4 py-3 text-xs max-w-[280px] align-top">
                    <CabinetListCell cntId={row.ID} cabinets={row.cabinets} />
                  </td>
                  {/* 4 — จำนวนเงิน */}
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    ฿{numberFormat2(row.cntAmount)}
                  </td>
                  {/* 5 — ธนาคาร / ข้อมูลเพิ่มเติม */}
                  <td className="px-4 py-3 text-xs max-w-[220px]">
                    <div className="space-y-0.5">
                      <div>
                        <span className="opacity-70">ธนาคาร:</span>{" "}
                        <span className="font-medium">{row.nameBlank || "—"}</span>
                      </div>
                      <div>
                        <span className="opacity-70">เลขที่:</span>{" "}
                        <span className="font-mono">{row.noBlank || "—"}</span>
                      </div>
                      <div className="truncate" title={row.nameAccount || ""}>
                        <span className="opacity-70">ชื่อ:</span>{" "}
                        <span>{row.nameAccount || "—"}</span>
                      </div>
                    </div>
                  </td>
                  {/* 6 — สลิป */}
                  <td className="px-4 py-3 text-center text-xs">
                    {row.cntImagesSlip ? (
                      <Link
                        href={`/admin/cnt-hs/${row.ID}`}
                        className="text-primary-700 hover:underline"
                      >
                        ดูสลิป
                      </Link>
                    ) : (
                      <span className="opacity-50">—</span>
                    )}
                  </td>
                  {/* 7 — หลักฐาน */}
                  <td className="px-4 py-3 text-center text-xs">
                    {row.cntFile ? (
                      <Link
                        href={`/admin/cnt-hs/${row.ID}`}
                        className="text-primary-700 hover:underline"
                      >
                        ดูไฟล์
                      </Link>
                    ) : (
                      <Link
                        href={`/admin/cnt-hs/${row.ID}`}
                        className="text-amber-700 hover:underline"
                      >
                        เพิ่มไฟล์
                      </Link>
                    )}
                  </td>
                  {/* 8 — ผู้ทำรายการ */}
                  <td className="px-4 py-3 text-xs font-mono">
                    {row.adminIDCreate || "—"}
                  </td>
                  {/* 9 — สถานะ */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.chip}`}
                    >
                      {chip.label}
                    </span>
                  </td>
                  {/* 10 — ตัวเลือก */}
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/cnt-hs/${row.ID}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-200"
                    >
                      อัปเดต / ดูรายละเอียด
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
