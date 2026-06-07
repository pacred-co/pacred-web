"use server";

/**
 * Export-all (CSV) for /admin/freight/quotes — the freight quote list
 * (V-E6 · app/[locale]/(admin)/admin/freight/quotes/page.tsx).
 *
 * The page lists freight_quotes rows ordered by created_at DESC with two active
 * filters: ?status=draft|... (exact match) and ?q=... (free-text .or() ilike over
 * quote_no / buyer_name_snapshot / buyer_tax_id_snapshot). It paginates 50/page
 * server-side via .range(). The on-screen "⬇ CSV หน้านี้" downloads only the
 * visible page; this action backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE
 * filtered result set (capped at EXPORT_CAP) — then writes an admin_export_log
 * audit row (PII: buyer name/tax id · MONEY total — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs —
 *   .order("created_at",{ascending:false})
 *   if status → .eq("status", status)
 *   if q      → .or("quote_no.ilike.%q%,buyer_name_snapshot.ilike.%q%,buyer_tax_id_snapshot.ilike.%q%")
 * minus the page's .range() window (replaced with the EXPORT_CAP window). The CSV
 * columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: super / ops / sales_admin / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing { status, q }.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABEL,
  TRANSPORT_MODE_LABEL,
  type QuoteStatus,
  type TransportMode,
} from "@/lib/validators/freight-quote";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

/** Mirrors the page's thb() formatter (฿ + th-TH grouped, 2dp). */
function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type QuoteRaw = {
  id: string;
  quote_no: string;
  status: QuoteStatus;
  buyer_name_snapshot: string;
  buyer_tax_id_snapshot: string | null;
  transport_mode: TransportMode;
  total: number;
  valid_until: string | null;
  created_at: string;
};

/** Active filters the page passes through (status chip + free-text search). */
export type FreightQuotesExportFilter = {
  /** Status chip filter, or null = "ทั้งหมด". */
  status: QuoteStatus | null;
  /** Free-text search (quote_no / buyer name / tax id), or "" = none. */
  q: string;
};

/**
 * Export the entire filtered freight-quotes list (capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * (status + free-text .or()), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportFreightQuotesAll(
  filter: FreightQuotesExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);

  // Re-validate the status the same way the page does (guard junk input).
  const status =
    filter.status && (QUOTE_STATUSES as readonly string[]).includes(filter.status)
      ? filter.status
      : null;
  const q = filter.q?.trim() ?? "";

  const admin = createAdminClient();

  // SAME query as the page, unpaginated (capped; fetch one extra to detect truncation).
  let query = admin
    .from("freight_quotes")
    .select(
      "id, quote_no, status, buyer_name_snapshot, buyer_tax_id_snapshot, transport_mode, total, valid_until, created_at",
    )
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `quote_no.ilike.%${q}%,buyer_name_snapshot.ilike.%${q}%,buyer_tax_id_snapshot.ilike.%${q}%`,
    );
  }

  const { data: rowsRaw, error } = await query;
  if (error) {
    console.error(`[exportFreightQuotesAll freight_quotes] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as QuoteRaw[];
  const truncated = all.length > EXPORT_CAP;
  const quotes = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME row mapping + column keys as the page's CsvButton (thead 1:1).
  const rows: CsvRow[] = quotes.map((qrow) => ({
    quote_no: qrow.quote_no,
    customer: qrow.buyer_name_snapshot ?? "",
    tax_id: qrow.buyer_tax_id_snapshot ?? "",
    transport_mode: TRANSPORT_MODE_LABEL[qrow.transport_mode] ?? qrow.transport_mode,
    total: thb(Number(qrow.total)),
    status: QUOTE_STATUS_LABEL[qrow.status] ?? qrow.status,
    created_at: qrow.created_at ? qrow.created_at.slice(0, 10) : "",
    valid_until: qrow.valid_until ? qrow.valid_until.slice(0, 10) : "",
  }));

  await logAdminExport({
    dataset: "freight-quotes",
    filters: { status: status ?? "all", q: q || undefined },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
