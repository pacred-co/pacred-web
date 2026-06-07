"use server";

/**
 * Export-all (CSV) for /admin/carriers — the carrier (ขนส่ง) directory
 * (SPX/J&T/Flash/EMS/Lalamove ฯลฯ · U2-3).
 *
 * The page (app/[locale]/(admin)/admin/carriers/page.tsx) loads the ENTIRE
 * `carriers` table (no filter, no DB-level pagination — it client-slices 50/page
 * for display) ordered by is_active DESC, sort_order ASC, name_th ASC. The
 * on-screen "⬇ CSV หน้านี้" downloads only the visible 50-row page; this action
 * backs the "⬇ CSV ทั้งหมด" button — every carrier row — then writes an
 * admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the page's EXACT query (same columns, same triple
 * ORDER BY), unpaginated. The only difference vs the page is the EXPORT_CAP
 * guard + the audit log. The CSV columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page intent (super OR ops — carriers = operational config).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path (mirrors the other export actions).
const EXPORT_CAP = 10000;

type Row = {
  id:                    string;
  code:                  string;
  name_th:               string;
  name_en:               string;
  tracking_url_template: string | null;
  is_active:             boolean;
  sort_order:            number;
  note:                  string | null;
  created_at:            string;
  updated_at:            string;
};

/**
 * Export the entire carrier directory (capped at EXPORT_CAP) as CSV rows for
 * the "⬇ CSV ทั้งหมด" button. Reuses the page's exact query (all columns, the
 * same triple ORDER BY), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportCarriersAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Carriers = operational config (page comment: "super OR ops").
  await requireAdmin(["super", "ops"]);

  const admin = createAdminClient();

  // SAME query as the page; capped (fetch one extra to detect truncation).
  const { data, error } = await admin
    .from("carriers")
    .select("id, code, name_th, name_en, tracking_url_template, is_active, sort_order, note, created_at, updated_at")
    .order("is_active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name_th",    { ascending: true })
    .range(0, EXPORT_CAP) // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
    .returns<Row[]>();
  if (error) {
    console.error(`[exportCarriersAll] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = data ?? [];
  const truncated = all.length > EXPORT_CAP;
  const carrierRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME column keys as the page's CsvButton (mirrors <thead> 1:1).
  const rows: CsvRow[] = carrierRows.map((r) => ({
    sort_order:            r.sort_order,
    code:                  r.code,
    name_th:               r.name_th,
    name_en:               r.name_en,
    tracking_url_template: r.tracking_url_template ?? "",
    status:                r.is_active ? "active" : "inactive",
    note:                  r.note ?? "",
    created_at:            (r.created_at ?? "").slice(0, 10),
    updated_at:            (r.updated_at ?? "").slice(0, 10),
  }));

  await logAdminExport({
    dataset: "carriers",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
