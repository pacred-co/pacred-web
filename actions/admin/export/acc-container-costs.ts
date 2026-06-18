"use server";

/**
 * "Export all filtered" CSV for /admin/accounting/container-costs (owner
 * directive 2026-06-07 — accounting wants the carrier rate-card reconciliation
 * list in a spreadsheet).
 *
 * The container-costs list page builds its CsvButton rows INLINE from a
 * paginated `container_costs` query. This action re-runs that EXACT same
 * filtered query (carrier ilike + transport_mode + active/archived "as of
 * today" window + same ordering) with NO pagination — a single capped page of
 * up to EXPORT_CAP rows — so the export can never drift from the on-screen
 * table. The ONLY difference vs the page query is `.range(...)` is widened to
 * 0..EXPORT_CAP-1 instead of the per-page window.
 *
 * The CSV columns + value-mapping below are byte-for-byte the same as the
 * CsvButton `rows`/`cols` on
 * app/[locale]/(admin)/admin/accounting/container-costs/page.tsx.
 *
 * RBAC matches the page: super / accounting. Every full export is audited via
 * admin_export_log (logAdminExport).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";

// Safety cap for the "export all filtered" path. 10,000 comfortably covers the
// whole container_costs rate-card table in one file while bounding the
// in-memory build. If a filtered slice ever exceeds this, the export flags
// `truncated` so the operator knows to narrow the filter.
const EXPORT_CAP = 10000;

const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ",
  sea: "🚢 เรือ",
  air: "✈️ เครื่องบิน",
};

function thb(n: number | string | null): string {
  if (n == null) return "";
  return Number(n).toFixed(2);
}

type Row = {
  id: string;
  carrier_name: string;
  transport_mode: string;
  origin: string;
  destination: string;
  container_type: string;
  rate_per_cbm_thb: number | string | null;
  rate_per_kg_thb: number | string | null;
  minimum_charge_thb: number | string | null;
  fuel_surcharge_pct: number | string | null;
  effective_from: string;
  effective_to: string | null;
  source: string;
  note: string | null;
  created_at: string;
};

/** One CSV row for the container-costs export (matches the on-screen columns). */
export type ContainerCostExportRow = Record<string, string | number | null | undefined>;

/** Active filters the page passes through (mirrors the page's searchParams). */
export type ContainerCostsExportFilter = {
  carrier?: string;
  /** "all" | "truck" | "sea" | "air" */
  mode?: string;
  /** "all" | "active" | "archived" */
  active?: string;
};

/**
 * Export the ENTIRE filtered container-cost rate-card list (all pages, capped
 * at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button on
 * /admin/accounting/container-costs. Reuses the page's exact filtered
 * `container_costs` query (carrier ilike + mode + active/archived window +
 * ordering), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportContainerCostsAll(
  filter: ContainerCostsExportFilter,
): Promise<{ rows: ContainerCostExportRow[]; truncated: boolean }> {
  // RBAC — same roles the page gates on (reachability).
  const { roles } = await requireAdmin(["super", "accounting"]);
  // Carrier COST rates = money-internal — omit them from the export for non-cost
  // viewers (super included) per owner 2026-06-18.
  const showMoney = canViewCostProfit(roles);

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // EXACT same filtered query as the page — only the .range() differs (one
  // capped page instead of the per-page window).
  let q = admin
    .from("container_costs")
    .select(`
      id, carrier_name, transport_mode, origin, destination, container_type,
      rate_per_cbm_thb, rate_per_kg_thb, minimum_charge_thb, fuel_surcharge_pct,
      effective_from, effective_to, source, note, created_at
    `)
    .order("carrier_name", { ascending: true })
    .order("effective_from", { ascending: false })
    .range(0, EXPORT_CAP - 1);

  if (filter.carrier) q = q.ilike("carrier_name", `%${filter.carrier}%`);
  if (filter.mode && filter.mode !== "all") q = q.eq("transport_mode", filter.mode);
  const activeFilter = filter.active ?? "active";
  if (activeFilter === "active") {
    q = q.or(`effective_to.is.null,effective_to.gte.${today}`);
  } else if (activeFilter === "archived") {
    q = q.not("effective_to", "is", null).lt("effective_to", today);
  }

  const { data: rowsRaw, error } = await q;
  if (error) {
    console.error(`[exportContainerCostsAll] container_costs query failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const list = (rowsRaw ?? []) as Row[];

  // SAME column keys/labels/value-mapping as the page CsvButton.
  const rows: ContainerCostExportRow[] = list.map((r) => {
    const archived = r.effective_to != null && r.effective_to < today;
    return {
      carrier_name: r.carrier_name,
      container_type: r.container_type,
      source: r.source,
      transport_mode: TRANSPORT_LABEL[r.transport_mode] ?? r.transport_mode,
      origin: r.origin,
      destination: r.destination,
      ...(showMoney
        ? {
            rate_per_cbm_thb: thb(r.rate_per_cbm_thb),
            rate_per_kg_thb: thb(r.rate_per_kg_thb),
            minimum_charge_thb: thb(r.minimum_charge_thb),
            fuel_surcharge_pct: r.fuel_surcharge_pct != null ? Number(r.fuel_surcharge_pct).toFixed(2) : "",
          }
        : {}),
      effective_from: r.effective_from ? r.effective_from.slice(0, 10) : "",
      effective_to: r.effective_to ? r.effective_to.slice(0, 10) : "",
      status: archived ? "ปิดแล้ว" : "กำลังใช้",
      note: r.note ?? "",
      created_at: r.created_at ? r.created_at.slice(0, 10) : "",
    };
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "acc-container-costs",
    filters: {
      carrier: filter.carrier ?? "",
      mode: filter.mode ?? "all",
      active: activeFilter,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
