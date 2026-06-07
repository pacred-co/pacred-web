"use server";

/**
 * Export-all (CSV) for /admin/csv-imports — the admin CSV bulk-import log
 * (P-19). The page lists every `csv_imports` row (one per uploaded file),
 * ordered by created_at DESC, then DB-paginates 50/page via `.range`.
 *
 * The on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action
 * backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE list (no tab/status/date
 * filter exists on this page) — capped at EXPORT_CAP, then writes an
 * admin_export_log audit row.
 *
 * DRIFT-FREE: re-runs the EXACT same query the page runs
 *   .from("csv_imports")
 *   .select(<same columns + uploader join>)
 *   .order("created_at", { ascending: false })
 * unpaginated (range 0..EXPORT_CAP). The CSV columns mirror the page's
 * CsvButton cols 1:1.
 *
 * RBAC matches the page: csv-imports is a Phase-3 super-only route
 * (lib/admin/phase-access.ts) → requireAdmin(["super"]).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

const EXPORT_CAP = 10000;

// Status labels mirror the page's STATUS_LABEL map 1:1.
const STATUS_LABEL: Record<string, string> = {
  uploaded: "อัปโหลดแล้ว",
  previewed: "พรีวิว",
  importing: "กำลังนำเข้า",
  imported: "นำเข้าเสร็จ",
  failed: "ผิดพลาด",
};

type Uploader =
  | { member_code: string | null; first_name: string | null; last_name: string | null }
  | { member_code: string | null; first_name: string | null; last_name: string | null }[]
  | null;

function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

type RawRow = {
  id: string;
  filename: string;
  target_table: string;
  status: string;
  row_count: number;
  imported_count: number;
  error_message: string | null;
  size_bytes: number | null;
  created_at: string;
  imported_at: string | null;
  uploader: Uploader;
};

/**
 * Export the entire CSV-import log (capped at EXPORT_CAP) as CsvRow[] for the
 * "⬇ CSV ทั้งหมด" button. Reuses the page's exact query, unpaginated. Writes
 * an admin_export_log audit row. No filters — the page has none.
 */
export async function exportCsvImportsAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  await requireAdmin(["super"]);

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("csv_imports")
    .select(`
      id, filename, target_table, status,
      row_count, imported_count, error_message,
      size_bytes, created_at, imported_at,
      uploader:profiles!uploader_id ( member_code, first_name, last_name )
    `)
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportCsvImportsAll csv_imports] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as unknown as RawRow[];
  const truncated = all.length > EXPORT_CAP;
  const sliced = truncated ? all.slice(0, EXPORT_CAP) : all;

  const rows: CsvRow[] = sliced.map((r) => {
    const u = normSingle(r.uploader);
    const uploaderName = u
      ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
      : "";
    return {
      created_at: (r.created_at ?? "").slice(0, 10),
      imported_at: r.imported_at ? r.imported_at.slice(0, 10) : "",
      filename: r.filename ?? "",
      target_table: r.target_table ?? "",
      uploader_code: u?.member_code ?? "",
      uploader_name: uploaderName,
      row_count: r.row_count ?? 0,
      imported_count: r.imported_count ?? 0,
      size_kb:
        r.size_bytes != null ? (r.size_bytes / 1024).toFixed(1) : "",
      status: STATUS_LABEL[r.status] ?? r.status,
      error_message: r.error_message ?? "",
    };
  });

  await logAdminExport({
    dataset: "csv-imports",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
