"use server";

/**
 * Export-all (CSV) for /admin/system/pcs-sync — the PCS↔Pacred sync run history
 * (table pcs_sync_logs).
 *
 * The page (app/[locale]/(admin)/admin/system/pcs-sync/page.tsx) lists the
 * pcs_sync_logs rows (one per cron run) — id, ran_at, since/until window,
 * rows seen/upserted/skipped/failed, duration_ms, error — ordered by ran_at
 * DESC, capped at the 50 most-recent runs for the on-screen table. The
 * on-screen "⬇ CSV หน้านี้" downloads only those visible 50; this action backs
 * the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE run-history table (capped at
 * EXPORT_CAP) — then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the EXACT same query the page runs
 *   .select("id, ran_at, since, until, rows_seen, rows_upserted,
 *            rows_skipped_newer, rows_failed, duration_ms, error")
 *   .order("ran_at", { ascending: false })
 * with the page's .limit(50) removed (unpaginated, capped at EXPORT_CAP). The
 * CSV columns mirror the page's run-history <thead> 1:1.
 *
 * RBAC matches the page: super / accounting.
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

type LogRaw = {
  id: number;
  ran_at: string;
  since: string | null;
  until: string | null;
  rows_seen: number;
  rows_upserted: number;
  rows_skipped_newer: number;
  rows_failed: number;
  duration_ms: number | null;
  error: string | null;
};

/** Slice an ISO timestamp to "YYYY-MM-DD HH:MM:SS" (drops the TZ/millis tail). */
function fmtTs(iso: string | null): string {
  if (!iso) return "";
  // "2026-06-07T12:34:56.789Z" → "2026-06-07 12:34:56"
  return iso.replace("T", " ").slice(0, 19);
}

/**
 * Export the entire PCS-sync run-history table (capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact query
 * (same columns, same ran_at-DESC order), unpaginated. Writes an
 * admin_export_log audit row.
 */
export async function exportPcsSyncAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page.
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();

  // SAME select + order as the page; .limit(50) replaced by the EXPORT_CAP range
  // (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("pcs_sync_logs")
    .select(
      "id, ran_at, since, until, rows_seen, rows_upserted, rows_skipped_newer, rows_failed, duration_ms, error",
    )
    .order("ran_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportPcsSyncAll pcs_sync_logs] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as LogRaw[];
  const truncated = all.length > EXPORT_CAP;
  const logs = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME column keys/order as the page's run-history <thead>.
  const rows: CsvRow[] = logs.map((l) => ({
    ran_at: fmtTs(l.ran_at),
    since: fmtTs(l.since),
    until: fmtTs(l.until),
    rows_seen: l.rows_seen,
    rows_upserted: l.rows_upserted,
    rows_skipped_newer: l.rows_skipped_newer,
    rows_failed: l.rows_failed,
    duration_ms: l.duration_ms ?? "",
    error: l.error ?? "",
  }));

  await logAdminExport({
    dataset: "pcs-sync",
    filters: { scope: "run-history" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
