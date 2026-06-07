"use server";

/**
 * Export-all (CSV) for /admin/bookings — the Sales + Pricing desk view of
 * customer-submitted bookings (BK-1 · docs/research/booking-flow-system-2026-05-18.md).
 *
 * The page (app/[locale]/(admin)/admin/bookings/page.tsx) lists `bookings` rows
 * ordered by created_at DESC, DB-paginated (range), with an optional
 * `.eq("status", <BookingStatus>)` filter (default 'submitted'; 'all' lifts it).
 * The on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action backs
 * the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered status set (capped at
 * EXPORT_CAP) — then writes an admin_export_log audit row (PII: contact name +
 * phone — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .order("created_at", { ascending: false })
 *   + (status ? .eq("status", status) : <no filter>)
 * unpaginated (capped). The CSV columns mirror the page's CsvButton cols 1:1
 * (same Thai labels as the <thead>, same value formatting).
 *
 * RBAC matches the page: super / ops / sales_admin / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * { status } filter.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { getServiceConfig } from "@/lib/booking/service-config";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/validators/booking";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

// Status TH labels — mirror messages "booking.status" (the page renders these).
const STATUS_LABEL_TH: Record<BookingStatus, string> = {
  draft:     "ฉบับร่าง",
  submitted: "ส่งคำขอแล้ว",
  contacted: "ติดต่อแล้ว",
  quoted:    "เสนอราคาแล้ว",
  won:       "ปิดการขาย",
  lost:      "เสียโอกาส",
  cancelled: "ยกเลิก",
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Date slice → YYYY-MM-DD (drift-free; CSV stays sortable). */
function ymd(d: string | null): string {
  return d ? String(d).slice(0, 10) : "";
}

type BookingRaw = {
  id:             string;
  booking_no:     string | null;
  status:         BookingStatus;
  service_slug:   string;
  route_slug:     string | null;
  transport_mode: string | null;
  estimate_total: number | string | null;
  contact_name:   string | null;
  contact_phone:  string | null;
  source_channel: string | null;
  submitted_at:   string | null;
  created_at:     string;
};

/** Active filter the page passes through (the resolved status, or null = all). */
export type BookingsExportFilter = {
  /** Resolved status filter, or null when the 'all' chip lifts the filter. */
  status: BookingStatus | null;
};

/**
 * Export the entire filtered bookings list (the resolved status filter,
 * capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the
 * page's exact filtered query (order created_at DESC + optional status eq),
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportBookingsAll(
  filter: BookingsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);

  const { status } = filter;
  const admin = createAdminClient();

  // SAME query as the page, unpaginated (fetch one extra to detect truncation).
  let query = admin
    .from("bookings")
    .select(`
      id, booking_no, status, service_slug, route_slug, transport_mode,
      estimate_total, contact_name, contact_phone, source_channel,
      submitted_at, created_at
    `)
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (status && (BOOKING_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status);
  }

  const { data: rowsRaw, error } = await query;
  if (error) {
    console.error(`[exportBookingsAll bookings] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as BookingRaw[];
  const truncated = all.length > EXPORT_CAP;
  const bookingRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = bookingRows.map((b) => {
    const svc = getServiceConfig(b.service_slug);
    const svcLabel = svc ? svc.titleTh : b.service_slug;
    const serviceText = [svcLabel, b.route_slug ? `/${b.route_slug}` : null, b.transport_mode]
      .filter(Boolean)
      .join(" ");
    const row: CsvRow = {
      booking_no: b.booking_no ?? `(draft) ${b.id.slice(0, 8)}`,
      status:     STATUS_LABEL_TH[b.status] ?? b.status,
      service:    serviceText,
      estimate:   thb(Number(b.estimate_total ?? 0)),
      contact:    b.contact_name || "",
      phone:      b.contact_phone || "",
      source:     b.source_channel || "",
      submitted:  ymd(b.submitted_at),
      created:    ymd(b.created_at),
    };
    return row;
  });

  await logAdminExport({
    dataset: "bookings",
    filters: { status: status ?? "all" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
