"use server";

/**
 * Export-all (CSV) for /admin/partners — the external partner directory
 * (CLAUDE.md §PM-6 #3 · migration 0136 public.partners).
 *
 * The page (app/[locale]/(admin)/admin/partners/page.tsx) loads the ENTIRE
 * partners table (no filter) ordered by is_active DESC, sort ASC, name ASC,
 * then client-slices 50/page for display. The on-screen "⬇ CSV หน้านี้" button
 * downloads only the visible page; this action backs the 2nd "⬇ CSV ทั้งหมด"
 * button — the entire directory (capped at EXPORT_CAP) — and writes an
 * admin_export_log audit row (contains partner contact PII).
 *
 * DRIFT-FREE: re-runs the EXACT same query + column set + ordering the page
 * runs, unpaginated. The CSV columns mirror the page's CsvButton cols 1:1.
 *
 * RBAC matches the page: super only.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { PARTNER_TYPE_LABELS_TH } from "@/app/[locale]/(admin)/admin/partners/types";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path.
const EXPORT_CAP = 10000;

type Row = {
  code: string;
  name: string;
  name_en: string | null;
  partner_type: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  note: string | null;
  is_active: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
};

/**
 * Export the entire partner directory (capped at EXPORT_CAP) as CSV rows for
 * the "⬇ CSV ทั้งหมด" button. Reuses the page's exact query + ordering,
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportPartnersAll(): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["super"]);

  const admin = createAdminClient();

  // SAME query + ordering as the page; capped (fetch one extra to detect truncation).
  const { data, error } = await admin
    .from("partners")
    .select(
      "code, name, name_en, partner_type, contact_name, contact_phone, contact_email, note, is_active, sort, created_at, updated_at",
    )
    .order("is_active", { ascending: false })
    .order("sort", { ascending: true })
    .order("name", { ascending: true })
    .range(0, EXPORT_CAP) // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
    .returns<Row[]>();
  if (error) {
    console.error(`[exportPartnersAll] failed`, { code: error.code, message: error.message });
    return { rows: [], truncated: false };
  }

  const all = data ?? [];
  const truncated = all.length > EXPORT_CAP;
  const sliced = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME column keys as the page's CsvButton.
  const rows: CsvRow[] = sliced.map((r) => ({
    sort: r.sort,
    code: r.code,
    name: r.name,
    name_en: r.name_en ?? "",
    partner_type: PARTNER_TYPE_LABELS_TH[r.partner_type] ?? r.partner_type,
    contact_name: r.contact_name ?? "",
    contact_phone: r.contact_phone ?? "",
    contact_email: r.contact_email ?? "",
    note: r.note ?? "",
    status: r.is_active ? "active" : "inactive",
    created_at: (r.created_at ?? "").slice(0, 10),
    updated_at: (r.updated_at ?? "").slice(0, 10),
  }));

  await logAdminExport({
    dataset: "partners",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
