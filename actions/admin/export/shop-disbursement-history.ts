"use server";

/**
 * Export-all (CSV) for /admin/shop-disbursement/history — the disbursement
 * batch history ("ประวัติจ่ายเงินค่าสินค้า", legacy
 * pcs-admin/report-shops-profit-pay-history.php LIST mode).
 *
 * The page (app/[locale]/(admin)/admin/shop-disbursement/history/page.tsx)
 * loads the FULL list of disbursement batches via getShopDisbursementHistory()
 * — every tb_shop_pay_h row, no filter, ordered by date DESC — and renders all
 * of them in one table (no DB-level pagination, no tabs, no date/search filter).
 *
 * This action backs the "⬇ CSV ทั้งหมด" button: it re-runs the EXACT same
 * unfiltered query (capped at EXPORT_CAP) and writes an admin_export_log audit
 * row (MONEY: batch amounts — owner directive 2026-06-07).
 *
 * DRIFT-FREE: identical to the page's query —
 *   .select("id, date, amount, adminidcreate, status, imagesslip, title")
 *   .order("date", { ascending: false })
 * The CSV columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: super / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path.
const EXPORT_CAP = 10000;

// Status-label decoder — mirrors the page's <StatusPill> (history.php L72-78).
const STATUS_LABEL: Record<string, string> = {
  "2": "จ่ายแล้ว",
  "1": "รอดำเนินการ",
};
function statusName(s: string | null): string {
  return STATUS_LABEL[s ?? ""] ?? "ไม่สำเร็จ";
}

/** Legacy `number_format($n, 2)` — "1,234.56" thousand-grouped (matches page fmt2). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type BatchRaw = {
  id: number;
  date: string | null;
  amount: number | string;
  adminidcreate: string | null;
  status: string | null;
  imagesslip: string | null;
  title: string | null;
};

/**
 * Export the entire disbursement-batch history (capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact unfiltered query,
 * then writes an admin_export_log audit row.
 */
export async function exportShopDisbursementHistoryAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page (getShopDisbursementHistory → withAdmin(["accounting","super"])).
  await requireAdmin(["accounting", "super"]);

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tb_shop_pay_h")
    .select("id, date, amount, adminidcreate, status, imagesslip, title")
    .order("date", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error("[exportShopDisbursementHistoryAll] tb_shop_pay_h failed", {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as unknown as BatchRaw[];
  const truncated = all.length > EXPORT_CAP;
  const batches = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME row mapping + column keys as the page's CsvButton (mirrors <thead>).
  const rows: CsvRow[] = batches.map((b) => ({
    date: b.date ? b.date.replace("T", " ").slice(0, 19) : "",
    title: b.title ?? "",
    adminidcreate: b.adminidcreate ?? "",
    amount: numberFormat2(b.amount),
    status: statusName(b.status),
  }));

  await logAdminExport({
    dataset: "shop-disbursement-history",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
