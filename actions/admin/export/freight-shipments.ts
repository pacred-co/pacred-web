"use server";

/**
 * Export-all (CSV) for /admin/freight/shipments — the V-E1 freight shipments
 * list (app/[locale]/(admin)/admin/freight/shipments/page.tsx).
 *
 * The page lists freight_shipments ordered by created_at DESC, filtered by an
 * optional status chip + an optional search `q` (job_no / container_code /
 * carrier_container_no / bl_no, ILIKE OR), joined to profiles for the customer
 * name. The page paginates 50/page; the on-screen "⬇ CSV หน้านี้" downloads only
 * the visible page. This action backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE
 * filtered set (capped at EXPORT_CAP) — then writes an admin_export_log audit row
 * (PII: customer name + member_code · owner directive 2026-06-07).
 *
 * DRIFT-FREE: re-runs the EXACT same filter the page runs
 *   .order("created_at",{ascending:false})
 *   [+ .eq("status", status) when set]
 *   [+ .or(job_no/container_code/carrier_container_no/bl_no ILIKE) when q set]
 * plus the same profiles join. The CSV columns mirror the page's <thead>/CsvButton
 * cols 1:1. The only difference vs the page query is the EXPORT_CAP guard
 * (.range(0, EXPORT_CAP)) replacing the per-page .range(from, to) + the audit log.
 *
 * RBAC matches the page: super / ops / sales_admin / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing { status, q }.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  FREIGHT_SHIPMENT_STATUSES,
  FREIGHT_SHIPMENT_STATUS_LABEL,
  FREIGHT_TRANSPORT_MODE_LABEL,
  type FreightShipmentStatus,
  type FreightTransportMode,
} from "@/lib/validators/freight-shipment";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type ShipmentRaw = {
  id: string;
  job_no: string | null;
  status: FreightShipmentStatus;
  transport_mode: FreightTransportMode;
  container_code: string | null;
  carrier_container_no: string | null;
  bl_no: string | null;
  commercial_value_thb: number | null;
  created_at: string;
  profile: Profile | Profile[] | null;
};

/** Active filters the page passes through (status chip + search). */
export type FreightShipmentsExportFilter = {
  /** Status chip (null = ทั้งหมด). */
  status: FreightShipmentStatus | null;
  /** Search term (job_no / container / B/L). */
  q: string;
};

/**
 * Export the entire filtered freight-shipments list (capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered
 * query (status + search + the profiles join), unpaginated. Writes an
 * admin_export_log audit row.
 */
export async function exportFreightShipmentsAll(
  filter: FreightShipmentsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same RBAC as the page.
  await requireAdmin(["super", "ops", "sales_admin", "accounting"]);

  // Normalise filters the same way the page does (defensive).
  const status = (FREIGHT_SHIPMENT_STATUSES as readonly string[]).includes(filter.status ?? "")
    ? (filter.status as FreightShipmentStatus)
    : null;
  const q = filter.q?.trim() ?? "";

  const admin = createAdminClient();

  // SAME query the page builds — minus the per-page .range, plus the EXPORT_CAP.
  let query = admin
    .from("freight_shipments")
    .select(`
      id, job_no, status, transport_mode, container_code, carrier_container_no,
      bl_no, commercial_value_thb, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
    `)
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `job_no.ilike.%${q}%,container_code.ilike.%${q}%,carrier_container_no.ilike.%${q}%,bl_no.ilike.%${q}%`,
    );
  }

  const { data: rowsRaw, error } = await query;
  if (error) {
    console.error(`[exportFreightShipmentsAll freight_shipments] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as ShipmentRaw[];
  const truncated = all.length > EXPORT_CAP;
  const shipments = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = shipments.map((s) => {
    const profile = Array.isArray(s.profile) ? s.profile[0] ?? null : s.profile;
    const customer =
      profile?.company_name ??
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ??
      "";
    // Combine the container / B/L lines the page stacks into one cell.
    const containerBl = [
      s.container_code,
      s.carrier_container_no,
      s.bl_no ? `B/L: ${s.bl_no}` : null,
    ]
      .filter(Boolean)
      .join(" / ");

    const row: CsvRow = {
      job_no: s.job_no ?? "",
      member_code: profile?.member_code ?? "",
      customer: customer || "",
      transport_mode: FREIGHT_TRANSPORT_MODE_LABEL[s.transport_mode] ?? s.transport_mode,
      container_bl: containerBl || "",
      commercial_value_thb: thb(s.commercial_value_thb),
      status: FREIGHT_SHIPMENT_STATUS_LABEL[s.status] ?? s.status,
      created_at: (s.created_at ?? "").slice(0, 10),
    };
    return row;
  });

  await logAdminExport({
    dataset: "freight-shipments",
    filters: { status: status ?? "all", q: q || undefined },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
