/**
 * Re-sweep A2 #24 — รายงานค้นหาสินค้า (search demand)
 *
 * Faithful port of legacy `pcs-admin/report-search.php`. Shows what
 * customers search for (keyword demand) — aggregated from `tb_search_history`
 * (the LIVE search-query log written by actions/search.ts · migration 0102).
 * Repointed 2026-06-01 Wave-A from the EMPTY legacy `tb_history_key` (0 rows ·
 * report was blank forever) — see actions/admin/reports-monitoring.ts. Useful for:
 *   - Spotting high-demand products to stock / promote.
 *   - Catching API-error spikes (result_count=0 filter) on the China search.
 *
 * Legacy SQL: SELECT *, COUNT(ID) FROM tb_history_key GROUP BY keyWord
 *   → now reads tb_search_history GROUP BY query (aggregated in JS).
 *
 * Data layer: actions/admin/reports-monitoring.ts → getSearchDemandReport.
 * Filters (mirror the legacy form): date range + apierror status dropdown.
 *
 * Role gate: legacy report-search.php had NO explicit $departmentKey gate
 * (any logged-in admin reached it via the menubar). We narrow to the same
 * roles the sibling monitoring reports use (super / accounting / ops) since
 * the rows expose raw customer search behaviour.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { ReportShell } from "@/components/admin/reports/report-shell";
import {
  getSearchDemandReport,
  SEARCH_APIERROR_LABEL,
} from "@/actions/admin/reports-monitoring";
import {
  resolveDateRange, intTh, dateTimeTh, type ReportData,
} from "@/lib/admin/reports/types";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "1",   label: SEARCH_APIERROR_LABEL["1"] }, // API มีปัญหา
  { value: "2",   label: SEARCH_APIERROR_LABEL["2"] }, // API ไม่มีปัญหา
];

export default async function SearchDemandReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>;
}) {
  await requireAdmin(["super", "accounting", "ops"]);

  const sp     = await searchParams;
  const range  = resolveDateRange(sp);
  const status = sp.status === "1" || sp.status === "2" ? sp.status : "all";
  const res    = await getSearchDemandReport(range, status);

  const rows = res.ok ? res.data : [];

  // Summary aggregates.
  const totalKeywords = rows.length;
  const totalSearches = rows.reduce((s, r) => s + r.count, 0);
  const topKeyword    = rows[0]?.keyword ?? "—";
  const topCount      = rows[0]?.count ?? 0;

  const data: ReportData = {
    columns: [
      { key: "last_searched", label: "วันที่ค้นหาล่าสุด", format: (v) => dateTimeTh(v as string) },
      { key: "keyword",       label: "คำที่ค้นหา" },
      { key: "count",         label: "จำนวนครั้ง", align: "right", format: (v) => intTh(v as number) },
    ],
    rows: rows.map((r) => ({
      id:            r.id,
      last_searched: r.last_searched,
      keyword:       r.keyword,
      count:         r.count,
    })),
    totals: {
      keyword: "รวม " + intTh(totalKeywords) + " คำ",
      count:   intTh(totalSearches),
    },
  };

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "ทั้งหมด";

  return (
    <ReportShell
      title="รายงานค้นหาสินค้า"
      subtitle="คำค้นหาสินค้าของลูกค้า (จัดอันดับตามจำนวนครั้ง) — ดูดีมานด์สินค้า + ตรวจ API ค้นหาจีน"
      range={range}
      pathname="/admin/reports/search-demand"
      extraQuery={{ status: status !== "all" ? status : undefined }}
      summary={[
        { label: "คำค้นที่ไม่ซ้ำ",  value: intTh(totalKeywords) },
        { label: "การค้นหาทั้งหมด", value: intTh(totalSearches) },
        { label: `ค้นมากสุด (${intTh(topCount)} ครั้ง)`, value: topKeyword },
        { label: "สถานะ API",      value: statusLabel },
      ]}
      data={data}
      csvSlug="search-demand"
      emptyLabel="ไม่มีการค้นหาในช่วงเวลานี้"
      extraControls={
        <form method="GET" action="/admin/reports/search-demand" className="flex items-end gap-2 flex-wrap">
          {/* Preserve the active date range when the status dropdown submits. */}
          <input type="hidden" name="from" value={range.from} />
          <input type="hidden" name="to"   value={range.to} />
          <div>
            <label htmlFor="status" className="block text-[10px] uppercase tracking-wide text-muted mb-1">สถานะ API</label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt">
            กรองสถานะ
          </button>
        </form>
      }
      sourceNote={
        res.ok
          ? "Source: tb_search_history GROUP BY keyword (repointed from empty tb_history_key · 2026-06-01) — port of report-search.php"
          : `❌ โหลดข้อมูลล้มเหลว: ${res.error}`
      }
    />
  );
}
