"use server";

/**
 * Export-all (CSV) for /admin/hr/attendance — the HR annual-holidays calendar
 * (D1 faithful port of time-attendance-system.php · migrated legacy tas_holiday).
 *
 * The page (app/[locale]/(admin)/admin/hr/attendance/page.tsx) loads EVERY
 * tas_holiday row ordered by holidaydate ASC (no DB-level pagination, no filters
 * beyond the order-by) and groups them by Gregorian year purely for display.
 * The on-screen "⬇ CSV" downloads the displayed rows; this action backs the
 * "⬇ CSV ทั้งหมด" button — the ENTIRE list (capped at EXPORT_CAP) — then writes
 * an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the EXACT same query the page runs
 *   .select("id, holidayname, holidaydate, adminidcreate, date, note")
 *   .order("holidaydate", { ascending: true })
 * unpaginated. The CSV columns mirror the page's CsvButton cols 1:1 (which mirror
 * the on-screen <thead>). The page already loads the full list, so the only
 * difference here is the EXPORT_CAP guard + the audit log.
 *
 * RBAC matches the page: bare requireAdmin() (any admin role).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path.
const EXPORT_CAP = 10000;

type HolidayRaw = {
  id: number;
  holidayname: string | null;
  holidaydate: string | null;
  adminidcreate: string | null;
  date: string | null;
  note: string | null;
};

/** Buddhist-year string from a date (mirrors the page's thYear display intent). */
function thYear(d: string | null): string {
  if (!d) return "—";
  const y = new Date(d).getFullYear();
  return String(y + 543);
}

/**
 * Export the entire HR holidays calendar (capped at EXPORT_CAP) as CSV rows for
 * the "⬇ CSV ทั้งหมด" button. Reuses the page's exact query, unpaginated.
 * Writes an admin_export_log audit row.
 */
export async function exportHrAttendanceAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  await requireAdmin();

  const admin = createAdminClient();

  // SAME query as the page; capped (fetch one extra to detect truncation).
  const { data, error } = await admin
    .from("tas_holiday")
    .select("id, holidayname, holidaydate, adminidcreate, date, note")
    .order("holidaydate", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportHrAttendanceAll tas_holiday] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as unknown as HolidayRaw[];
  const truncated = all.length > EXPORT_CAP;
  const holidays = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = holidays.map((h) => ({
    holidayname: h.holidayname ?? "",
    holidaydate: h.holidaydate ? h.holidaydate.slice(0, 10) : "",
    holidayyear: thYear(h.holidaydate),
    note: h.note ?? "",
    adminidcreate: h.adminidcreate ?? "",
  }));

  await logAdminExport({
    dataset: "hr-attendance",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
