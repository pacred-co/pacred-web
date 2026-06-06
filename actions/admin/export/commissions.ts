"use server";

/**
 * Export-all (CSV) for /admin/commissions — the sales-rep commission PAYOUT queue.
 *
 * The page (app/[locale]/(admin)/admin/commissions/page.tsx) lists
 * tb_user_sales_admin_pay rows (the withdrawal-request header · status '2' รอจ่าย
 * · '3' จ่ายแล้ว), newest-first, then client-slices 50/page. The on-screen
 * "⬇ CSV หน้านี้" downloads only the visible page; this action backs the 2nd
 * "⬇ CSV ทั้งหมด" button — the ENTIRE filtered queue (capped at EXPORT_CAP) —
 * then writes an admin_export_log audit row (MONEY · owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .select(id,date,useridmain,amount,imagesslip,status,admincreate,dateslip)
 *   .order("date",{ascending:false})  [+ optional .eq("status",status)]
 * — the ONLY differences vs the page query are: no in-memory 50-row slice and
 * the page's .limit(200) becomes .range(0, EXPORT_CAP) (so a full export isn't
 * silently capped at 200). The CSV columns mirror the page's CsvButton cols 1:1.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing `status`.
 *
 * RBAC matches the page: super | accounting.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors leads/withdrawals EXPORT_CAP).
const EXPORT_CAP = 10000;

// Same status labels the page uses for the human-readable "สถานะ" column.
const STATUS_LABEL: Record<string, string> = {
  "2": "รอจ่าย",
  "3": "จ่ายแล้ว",
};

type PayoutRow = {
  id: number;
  date: string | null;
  useridmain: string | null;
  amount: number | string | null;
  imagesslip: string | null;
  status: string | null;
  admincreate: string | null;
  dateslip: string | null;
};

/**
 * Export the entire filtered commission-payout queue as CSV rows.
 * `status` is the page's resolved status filter ('2' | '3' | null/"" = all).
 */
export async function exportCommissionsAll(
  status: string | null,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Money page → super | accounting — same gate as the page.
  await requireAdmin(["super", "accounting"]);

  // Defensively normalise the status (mirror the page: only '2'/'3' filter, else all).
  const statusFilter = status === "2" || status === "3" ? status : null;

  const admin = createAdminClient();

  // SAME filter as the page, minus the in-memory slice; .limit(200) widened to a
  // capped full page (fetch one extra to detect truncation honestly).
  let q = admin
    .from("tb_user_sales_admin_pay")
    .select("id, date, useridmain, amount, imagesslip, status, admincreate, dateslip")
    .order("date", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (statusFilter) q = q.eq("status", statusFilter);

  const { data: rowsRaw, error } = await q;
  if (error) {
    console.error(`[exportCommissionsAll tb_user_sales_admin_pay] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as PayoutRow[];
  const truncated = all.length > EXPORT_CAP;
  const payouts = truncated ? all.slice(0, EXPORT_CAP) : all;

  // Same row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = payouts.map((p) => ({
    id: p.id,
    useridmain: p.useridmain ?? "",
    admincreate: p.admincreate ?? "",
    amount: Number(p.amount ?? 0).toFixed(2),
    status: STATUS_LABEL[p.status ?? ""] ?? p.status ?? "",
    requested_at: p.date ? p.date.slice(0, 10) : "",
    paid_at: p.dateslip ? p.dateslip.slice(0, 10) : "",
  }));

  await logAdminExport({
    dataset: "commissions",
    filters: { status: statusFilter ?? "all" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
