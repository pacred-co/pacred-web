"use server";

/**
 * Export-all (CSV) for /admin/sales-payouts — the pending sales-commission
 * payout queue (owner directive 2026-06-07 · accounting reconciliation).
 *
 * The page (app/[locale]/(admin)/admin/sales-payouts/page.tsx) lists the
 * FAITHFUL `tb_user_sales_admin_pay` rows at status='2' (รอจ่ายเงิน), ordered
 * by date desc — the SAME query as `getPendingSalesPayoutsTb()`. The page is
 * NOT paginated (it loads the full pending queue), but the on-screen CsvButton
 * can only see the rendered rows; this action backs the 2nd "⬇ CSV ทั้งหมด"
 * button so the export is AUDITED (admin_export_log) and capped — and re-runs
 * the EXACT same filtered query unpaginated so it can never drift.
 *
 * DRIFT-FREE: same filter as the page/queue action
 *   .eq("status","2").order("date",{ascending:false})
 * — the ONLY difference is the explicit EXPORT_CAP .range() so a runaway queue
 * can't blow memory (it flags `truncated` honestly). The CSV columns mirror the
 * page's CsvButton cols 1:1.
 *
 * PII/MONEY: rows expose the sales-agent team code + payout amount — every full
 * export writes one admin_export_log row (logAdminExport).
 *
 * RBAC matches the page EXACTLY: requireAdmin(["accounting","sales_admin"])
 * (super implicit). createAdminClient() = RLS-bypass (tb_* is service-role only).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors the other exporters).
const EXPORT_CAP = 10000;

type PayoutRow = {
  id: number;
  date: string | null;
  useridmain: string | null;
  amount: number | string | null;
  imagesslip: string | null;
  status: string | null;
  admincreate: string | null;
};

/**
 * Export the entire pending sales-payout queue (status='2') as CSV rows for the
 * "⬇ CSV ทั้งหมด" button on /admin/sales-payouts. Re-runs the page's exact
 * filtered `tb_user_sales_admin_pay` query, unpaginated (capped). Writes an
 * admin_export_log audit row.
 */
export async function exportSalesPayoutsAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // RBAC — same roles the page gates on (reachability).
  const { roles } = await requireAdmin(["accounting", "sales_admin"]);
  // Payout amount = money-internal — omit from the export for non-cost viewers
  // (super + sales_admin included) per owner 2026-06-18.
  const showMoney = canViewCostProfit(roles);

  const admin = createAdminClient();

  // SAME filter as getPendingSalesPayoutsTb() — only the explicit .range() cap
  // differs (fetch one extra to detect truncation honestly).
  const { data: rowsRaw, error } = await admin
    .from("tb_user_sales_admin_pay")
    .select("id, date, useridmain, amount, imagesslip, status, admincreate")
    .eq("status", "2")
    .order("date", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportSalesPayoutsAll tb_user_sales_admin_pay] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as PayoutRow[];
  const truncated = all.length > EXPORT_CAP;
  const queue = truncated ? all.slice(0, EXPORT_CAP) : all;

  // Same row mapping + column keys as the page's CsvButton (cols below).
  const rows: CsvRow[] = queue.map((r) => ({
    date: r.date ? new Date(r.date).toLocaleString("th-TH") : "",
    userIDMain: r.useridmain ?? "",
    adminCreate: r.admincreate ?? "",
    ...(showMoney ? { amount: Number(r.amount ?? 0).toFixed(2) } : {}),
    status: "รอดำเนินการ",
  }));

  await logAdminExport({
    dataset: "sales-payouts",
    filters: { status: "2" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
