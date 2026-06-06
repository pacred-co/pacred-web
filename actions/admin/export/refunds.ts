"use server";

/**
 * "Export all filtered" CSV for /admin/refunds (owner directive 2026-06-07).
 *
 * The /admin/refunds list page builds its CsvButton rows INLINE from a
 * paginated `refund_requests` query. This action re-runs that EXACT same
 * filtered query (same status-tab + same `q` ilike over request_no /
 * source_ref / reason + same ordering) with NO pagination — a single capped
 * page of up to EXPORT_CAP rows — so the export can never drift from the
 * on-screen table. The ONLY difference vs the page query is `.range(...)` is
 * widened to 0..EXPORT_CAP-1 instead of the 50-row window.
 *
 * The CSV columns + value-mapping below are byte-for-byte the same as the
 * CsvButton `rows`/`cols` on app/[locale]/(admin)/admin/refunds/page.tsx.
 *
 * customer name + reason are user-typed PII → every full export is audited
 * via admin_export_log (logAdminExport).
 *
 * RBAC matches the page: super / accounting / ops / sales_admin.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";
import {
  REFUND_STATUSES,
  REFUND_SOURCE_LABEL,
  REFUND_STATUS_LABEL,
  type RefundStatus,
  type RefundSource,
} from "@/lib/validators/refund";

// Safety cap for the "export all filtered" path. 10,000 comfortably covers the
// whole refund_requests table in one file while bounding the in-memory build.
// If a filtered slice ever exceeds this, the export flags `truncated` so the
// operator knows to narrow the filter.
const EXPORT_CAP = 10000;

type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

type RefundRow = {
  id: string;
  request_no: string;
  source: RefundSource;
  source_ref: string | null;
  amount_thb: number;
  status: RefundStatus;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  reason: string;
  created_by_admin_id: string | null;
  profile: Profile | Profile[] | null;
};

function normP(p: Profile | Profile[] | null): Profile | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

/** One CSV row for the refunds export (matches the on-screen columns). */
export type RefundExportRow = Record<string, string | number | null | undefined>;

/** Active filters the page passes through (mirrors the page's searchParams). */
export type RefundsExportFilter = {
  /** Status tab; null/"" = all statuses (queue view). */
  status?: string | null;
  /** Free-text search over request_no / source_ref / reason. */
  q?: string;
};

/**
 * Export the ENTIRE filtered refund list (all pages, capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button on /admin/refunds. Reuses the page's
 * exact filtered `refund_requests` query (status + q ilike + ordering),
 * unpaginated. Writes an admin_export_log audit row (PII walk-off trail).
 */
export async function exportRefundsAll(
  filter: RefundsExportFilter,
): Promise<{ rows: RefundExportRow[]; truncated: boolean }> {
  // RBAC — same roles the page gates on.
  await requireAdmin(["super", "accounting", "ops", "sales_admin"]);

  const admin = createAdminClient();

  // Normalise the same way the page does.
  const status = (REFUND_STATUSES as readonly string[]).includes(filter.status ?? "")
    ? (filter.status as RefundStatus)
    : null;
  const q = filter.q?.trim() ?? "";

  // EXACT same filtered query as the page — only the .range() differs (no
  // 50-row window; one capped page instead).
  let query = admin
    .from("refund_requests")
    .select(`
      id, request_no, source, source_ref, amount_thb, status, created_at,
      approved_at, paid_at, rejected_at, reason, created_by_admin_id,
      profile:profiles!profile_id(member_code, first_name, last_name, phone)
    `)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP - 1);
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(`request_no.ilike.%${q}%,source_ref.ilike.%${q}%,reason.ilike.%${q}%`);
  }

  const { data: rowsRaw, error } = await query;
  if (error) {
    console.error(`[exportRefundsAll] refund_requests query failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const refunds = ((rowsRaw ?? []) as unknown as RefundRow[]).map((r) => ({
    ...r,
    profile: normP(r.profile),
  }));

  // SAME column keys/labels/value-mapping as the page CsvButton.
  const rows: RefundExportRow[] = refunds.map((r) => ({
    request_no: r.request_no,
    customer_name: [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
    member_code: r.profile?.member_code ?? "",
    phone: r.profile?.phone ?? "",
    source: REFUND_SOURCE_LABEL[r.source],
    source_ref: r.source_ref ?? "",
    amount_thb: Number(r.amount_thb).toFixed(2),
    reason: r.reason,
    status: REFUND_STATUS_LABEL[r.status],
    created_at: r.created_at ? r.created_at.slice(0, 10) : "",
    approved_at: r.approved_at ? r.approved_at.slice(0, 10) : "",
    paid_at: r.paid_at ? r.paid_at.slice(0, 10) : "",
    rejected_at: r.rejected_at ? r.rejected_at.slice(0, 10) : "",
    created_by_admin_id: r.created_by_admin_id ?? "",
  }));

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "refunds",
    filters: { status: status ?? "all", q },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
