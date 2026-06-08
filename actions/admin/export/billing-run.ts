"use server";

/**
 * Export-all (CSV) for /admin/billing-run — the ใบวางบิล / billing-run R-2 list
 * (legacy pcs-admin/hs-forwarder-invoice).
 *
 * The page (app/[locale]/(admin)/admin/billing-run/page.tsx) lists every
 * tb_forwarder_invoice header via getInvoiceList({ dateFrom, dateTo, status,
 * userid, limit }) — filtered by the active tab (recent/all/issued/overdue/
 * paid/cancelled), an optional ?from/?to date range, and an optional ?userid.
 * Each row carries its item-count rollup (tb_forwarder_invoice_item) and a
 * computed is_overdue flag. The page caps display at limit:1000; this action
 * backs the "⬇ CSV ทั้งหมด" button — the ENTIRE filtered set (capped at
 * EXPORT_CAP) — then writes an admin_export_log audit row (PII: buyer name +
 * tax-id · MONEY).
 *
 * DRIFT-FREE: this re-runs the EXACT same filtered query the page runs
 * (getInvoiceList with byte-identical filters), only with limit raised to
 * EXPORT_CAP. The CSV columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: super / accounting / ops.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * filters.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { getInvoiceList, type BillingRunListFilters } from "@/actions/admin/billing-run";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

const STATUS_LABEL: Record<"issued" | "paid" | "cancelled", string> = {
  issued: "รอรับชำระ",
  paid: "รับชำระแล้ว",
  cancelled: "ยกเลิก",
};

/** Status label that also surfaces the computed "overdue" state. */
function statusName(status: "issued" | "paid" | "cancelled", isOverdue: boolean): string {
  if (status === "issued" && isOverdue) return "เกินเวลา";
  return STATUS_LABEL[status] ?? status;
}

/** Money formatter mirroring the page's thbFmt (th-TH, 2dp). */
function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Active filters the page passes through (mirrors the page's getInvoiceList call). */
export type BillingRunExportFilter = {
  dateFrom?: string;
  dateTo?: string;
  status?: BillingRunListFilters["status"];
  userid?: string;
};

/**
 * Export the entire filtered billing-run list (the active tab's status filter +
 * resolved date range + optional userid, capped at EXPORT_CAP) as CSV rows for
 * the "⬇ CSV ทั้งหมด" button. Reuses the page's exact getInvoiceList query,
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportBillingRunAll(
  filter: BillingRunExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same RBAC gate as the page.
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles export billing-run.
  await requireAdmin(["super", "accounting", "ops", "freight_export_doc", "freight_import_doc"]);

  // Re-run the page's EXACT filtered query, unpaginated (limit raised to the cap).
  const res = await getInvoiceList({
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    status: filter.status ?? "all",
    userid: filter.userid,
    limit: EXPORT_CAP,
  });
  if (!res.ok) {
    console.error(`[exportBillingRunAll getInvoiceList] failed`, { error: res.error });
    return { rows: [], truncated: false };
  }

  const invoiceRows = res.data?.rows ?? [];
  const totalCount = res.data?.totalCount ?? invoiceRows.length;
  const truncated = totalCount > invoiceRows.length;

  // SAME columns + order as the page's <thead>.
  const rows: CsvRow[] = invoiceRows.map((r) => ({
    doc_no: r.doc_no,
    buyer_name: r.buyer_name || "",
    userid: r.userid || "",
    item_count: r.item_count,
    total_thb: thbFmt(r.total_thb),
    date_issued: (r.date_issued ?? "").slice(0, 10),
    date_due: (r.date_due ?? "").slice(0, 10),
    status: statusName(r.status, r.is_overdue),
  }));

  await logAdminExport({
    dataset: "billing-run",
    filters: {
      dateFrom: filter.dateFrom ?? null,
      dateTo: filter.dateTo ?? null,
      status: filter.status ?? "all",
      userid: filter.userid ?? null,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
