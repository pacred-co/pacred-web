"use server";

/**
 * "Export all filtered" CSV for /admin/tax-invoices (owner directive 2026-06-07).
 *
 * The /admin/tax-invoices list page builds its CsvButton rows INLINE from a
 * paginated `tax_invoices` query (PAGE_SIZE=10 + .range()). This action re-runs
 * that EXACT same filtered query (same tab → date/status mapping + same `or()`
 * ilike over serial_no / buyer_name / buyer_tax_id + same created_at ordering)
 * with NO pagination — a single capped page of up to EXPORT_CAP rows — so the
 * export can never drift from the on-screen table. The ONLY difference vs the
 * page query is `.range(...)` is widened to 0..EXPORT_CAP-1 instead of the
 * 10-row window.
 *
 * The CSV columns + value-mapping below are byte-for-byte the same as the
 * CsvButton `rows`/`cols` on app/[locale]/(admin)/admin/tax-invoices/page.tsx.
 *
 * buyer_name + buyer_tax_id are customer PII (RD Code 86) → every full export
 * is audited via admin_export_log (logAdminExport).
 *
 * RBAC matches the page: requireAdmin(["accounting"]).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";

// Safety cap for the "export all filtered" path. 10,000 comfortably covers the
// whole tax_invoices table in one file while bounding the in-memory build. If a
// filtered slice ever exceeds this, the export flags `truncated`.
const EXPORT_CAP = 10000;

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  issued: "ออกแล้ว",
  cancelled: "ยกเลิก",
};

type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
};

type TaxInvoiceRow = {
  id: string;
  status: "pending" | "issued" | "cancelled";
  serial_no: string | null;
  buyer_name: string;
  buyer_tax_id: string;
  subtotal_thb: number;
  vat_thb: number;
  total_thb: number;
  order_h_no: string | null;
  forwarder_f_no: string | null;
  created_at: string;
  issued_at: string | null;
  profile: Profile | Profile[] | null;
};

function normP(p: Profile | Profile[] | null): Profile | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

function thb(n: number | null | undefined): string {
  if (n == null) return "";
  return Number(n).toFixed(2);
}

/** One CSV row for the tax-invoices export (matches the on-screen columns). */
export type TaxInvoiceExportRow = Record<string, string | number | null | undefined>;

/** Active filters the page passes through (mirrors the page's searchParams). */
export type TaxInvoicesExportFilter = {
  /** Active tab — controls the date/status mapping. */
  tab?: string | null;
  /** Date-only `YYYY-MM-DD` lower bound (ignored when tab="recent"). */
  dateFrom?: string;
  /** Date-only `YYYY-MM-DD` upper bound (ignored when tab="recent"). */
  dateTo?: string;
  /** Free-text search over serial_no / buyer_name / buyer_tax_id. */
  search?: string;
};

function recentSinceIso(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString();
}

/**
 * Export the ENTIRE filtered tax-invoice list (all pages, capped at EXPORT_CAP)
 * as CSV rows for the "⬇ CSV ทั้งหมด" button on /admin/tax-invoices. Reuses the
 * page's exact filtered `tax_invoices` query (tab → date/status mapping + search
 * ilike + ordering), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportTaxInvoicesAll(
  filter: TaxInvoicesExportFilter,
): Promise<{ rows: TaxInvoiceExportRow[]; truncated: boolean }> {
  // RBAC — same role gate as the page (PII: buyer tax IDs · RD Code 86).
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles export tax docs.
  await requireAdmin(["accounting", "freight_export_doc", "freight_import_doc"]);

  const admin = createAdminClient();

  // Normalise the same way the page does.
  const tab = filter.tab ?? "all";
  const dateFrom = filter.dateFrom?.match(/^\d{4}-\d{2}-\d{2}$/) ? filter.dateFrom : null;
  const dateTo = filter.dateTo?.match(/^\d{4}-\d{2}-\d{2}$/) ? filter.dateTo : null;
  const search = (filter.search ?? "").trim();
  const searchClean = search.replace(/[(),]/g, " ").trim();

  // EXACT same filtered query as the page — only the .range() differs (no
  // 10-row window; one capped page instead).
  let q = admin
    .from("tax_invoices")
    .select(
      `id, status, serial_no, buyer_name, buyer_tax_id,
       subtotal_thb, vat_thb, total_thb,
       order_h_no, forwarder_f_no, created_at, issued_at,
       profile:profiles!profile_id ( member_code, first_name, last_name )`,
    );

  // Tab → filter mapping. "recent" overrides date range with last 30d.
  if (tab === "recent") {
    q = q.gte("created_at", recentSinceIso());
  } else {
    if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
    if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
    if (tab === "pending" || tab === "issued" || tab === "cancelled") {
      q = q.eq("status", tab);
    }
  }

  if (searchClean) {
    q = q.or(
      `serial_no.ilike.%${searchClean}%,buyer_name.ilike.%${searchClean}%,buyer_tax_id.ilike.%${searchClean}%`,
    );
  }

  q = q.order("created_at", { ascending: false }).range(0, EXPORT_CAP - 1);

  const { data, error } = await q;
  if (error) {
    console.error(`[exportTaxInvoicesAll] tax_invoices query failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const invoices = ((data ?? []) as unknown as TaxInvoiceRow[]).map((r) => ({
    ...r,
    profile: normP(r.profile),
  }));

  // SAME column keys/labels/value-mapping as the page CsvButton.
  const rows: TaxInvoiceExportRow[] = invoices.map((r) => ({
    serial_no: r.serial_no ?? "",
    doc_ref: r.order_h_no
      ? `ฝากสั่ง · ${r.order_h_no}`
      : r.forwarder_f_no
        ? `ฝากนำเข้า · ${r.forwarder_f_no}`
        : "",
    buyer_name: r.buyer_name,
    buyer_tax_id: r.buyer_tax_id,
    member_code: r.profile?.member_code ?? "",
    customer_name: [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
    issued_date: (r.issued_at ?? r.created_at)?.slice(0, 10) ?? "",
    subtotal_thb: thb(r.subtotal_thb),
    vat_thb: thb(r.vat_thb),
    total_thb: thb(r.total_thb),
    status: STATUS_LABEL[r.status] ?? r.status,
  }));

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "tax-invoices",
    filters: {
      tab,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      search: searchClean,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
