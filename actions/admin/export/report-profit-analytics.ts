"use server";

/**
 * Export-all (CSV) for /admin/reports/profit-analytics — the forwarder
 * PROFIT / MARGIN analytics report (Wave C BI · tb_forwarder).
 *
 * The page (app/[locale]/(admin)/admin/reports/profit-analytics/page.tsx) renders
 * THREE grouped breakdown tables — by carrier (fshipby), by China warehouse
 * (fwarehousename), and by transport mode (ftransporttype) — each sharing the
 * exact same column shape (group · ออเดอร์ · ยอดขาย · ต้นทุน · กำไร · มาร์จิ้น).
 * It loads its full data in one call to getForwarderProfitAnalytics(range) (a
 * capped 20k-row JS aggregation — no DB pagination), so this export re-runs that
 * SAME action with the SAME resolved date range and flattens all three
 * breakdowns into one CSV (a leading "กลุ่ม" column tags which table each row
 * came from), then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: identical filters (same getForwarderProfitAnalytics(range) call,
 * which queries tb_forwarder with .gte/.lte("fdate") + .neq("fstatus","99")
 * capped at 20000). The CSV columns mirror the page's <thead> 1:1 (plus the
 * group tag). Money cells use the same thb()/decTh() formatters the page uses.
 *
 * RBAC matches the page: super / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * date range.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { getForwarderProfitAnalytics } from "@/actions/admin/reports-profit";
import type { ProfitGroupRow } from "@/actions/admin/reports-profit-types";
import { type DateRange, thb, intTh, decTh } from "@/lib/admin/reports/types";
import type { CsvRow } from "@/components/admin/csv-button";

/** Map one aggregated breakdown row → a flat CSV row tagged with its group. */
function toCsvRow(groupLabel: string, r: ProfitGroupRow): CsvRow {
  return {
    group: groupLabel,
    label: r.label,
    count: intTh(r.count),
    revenue: thb(r.revenue),
    cost: thb(r.cost),
    profit: thb(r.profit),
    margin_pct: `${decTh(r.margin_pct, 1)}%`,
  };
}

/**
 * Export the full profit/margin analytics (all three breakdowns) for the
 * resolved date range as CSV rows for the "⬇ CSV ทั้งหมด" button. Re-runs the
 * page's exact getForwarderProfitAnalytics(range) aggregation, then flattens
 * carrier + warehouse + mode breakdowns into one list. Writes an
 * admin_export_log audit row.
 *
 * Note: getForwarderProfitAnalytics already caps the underlying tb_forwarder
 * pull at 20000 rows; the aggregated breakdowns themselves are tiny (a handful
 * of buckets each), so there is no separate row cap to apply here. We surface
 * the cap via `truncated` when the source pull hit its limit so staff know to
 * narrow the date range.
 */
export async function exportProfitAnalyticsAll(
  range: DateRange,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as the page.
  await requireAdmin(["super", "accounting"]);

  const res = await getForwarderProfitAnalytics(range);
  if (!res.ok) {
    console.error(`[exportProfitAnalyticsAll] analytics failed`, { error: res.error });
    return { rows: [], truncated: false };
  }

  const { summary, byCarrier, byWarehouse, byMode } = res.data;

  const rows: CsvRow[] = [
    ...byCarrier.map((r) => toCsvRow("ขนส่ง (carrier)", r)),
    ...byWarehouse.map((r) => toCsvRow("โกดังจีน (warehouse)", r)),
    ...byMode.map((r) => toCsvRow("รูปแบบขนส่ง (mode)", r)),
  ];

  // The source pull is capped at 20000 rows; flag it so staff narrow the range
  // when the sample is saturated (matches the page's footnote).
  const truncated = summary.order_count >= 20_000;

  await logAdminExport({
    dataset: "report-profit-analytics",
    filters: { from: range.from, to: range.to, excludeStatus: "99" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
