"use server";

/**
 * Export-all (CSV) for /admin/system-reports (owner 2026-07-31 "ทำให้ออกรายงาน
 * เป็น csv ได้"). Re-runs the SAME filtered report the page shows, but
 * un-paginated (all rows), maps them through the shared column mapper
 * (lib/admin/system-report-csv.ts — drift-free with the on-screen table), caps
 * the result, and writes an admin_export_log audit row.
 *
 * RBAC matches the page exactly (canViewSystemReports = ultra ∪ HR-department).
 * The page wires this via an inline "use server" closure capturing the resolved
 * filters, passed to <CsvButton fetchAll>.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { getStafferPositionInfo } from "@/lib/admin/positions";
import { canViewSystemReports } from "@/lib/admin/reports-access";
import { logAdminExport } from "@/actions/admin/export-log";
import {
  getSalesCommissionReport,
  type CommissionPosition,
} from "@/lib/admin/sales-commission-report";
import { commissionRowToCsv } from "@/lib/admin/system-report-csv";
import type { CsvRow } from "@/components/admin/csv-button";

// Hard cap so a huge unfiltered range can't OOM the action / browser. The
// button surfaces `truncated` → staff narrow the filter for a complete file.
const EXPORT_CAP = 50_000;

/** ค่าคอมมิชชั่น เซลล์/Cs — every filtered row (across all pages). */
export async function exportCommissionCsv(filters: {
  position: CommissionPosition;
  repId: string;
  dateFrom: string;
  dateTo: string;
  sort?: string;
  dir?: string;
}): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as page.tsx (ultra ∪ HR). Fail closed → empty file.
  const { user, roles } = await requireAdmin();
  const posInfo = await getStafferPositionInfo(user.id);
  if (!canViewSystemReports(roles, posInfo.department)) return { rows: [], truncated: false };

  const report = await getSalesCommissionReport({ ...filters, all: true });
  const truncated = report.rows.length > EXPORT_CAP;
  const rows = report.rows.slice(0, EXPORT_CAP).map(commissionRowToCsv);

  await logAdminExport({
    dataset: "system-report-commission",
    filters: {
      position: filters.position,
      rep: filters.repId || "all",
      from: filters.dateFrom,
      to: filters.dateTo,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
