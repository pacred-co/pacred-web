"use server";

/**
 * Export-all (CSV) for /admin/cnt-hs — รายการจ่ายเงินตู้ (container-payment ledger).
 *
 * cnt-hs was the ONE admin list still missing the "⬇ CSV ทั้งหมด" export the other
 * ~72 surfaces have (audit 2026-07-08 · legacy cnt-hs.php has DataTables copy/csv/
 * excel on both list + detail). This backs the export-all button.
 *
 * DRIFT-FREE (AGENTS rule A): re-runs the page's EXACT tb_cnt query — same
 * status filter (?q=1/2 → cntStatus) + same free-text search (ID/nameBlank/noBlank)
 * + same order — MINUS the .range() pagination, capped at EXPORT_CAP.
 *
 * COLUMN-IDENTICAL (AGENTS rule B): keys mirror the on-screen ledger columns.
 *
 * RBAC: same gate as the page (super · ops · accounting). Writes admin_export_log
 * (PII: bank account + MONEY: cntAmount · owner directive 2026-06-07).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import type { CsvRow } from "@/components/admin/csv-button";

const EXPORT_CAP = 10000;

const CNT_STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "สำเร็จแล้ว",
  "3": "ปฏิเสธ",
};

export type CntHsExportFilter = {
  status: string; // 'all' | '1' | '2'
  search: string;
};

type CntRow = {
  ID: number;
  cntName: string;
  cntStatus: string;
  cntAmount: number | string | null;
  date: string | null;
  adminIDCreate: string | null;
  nameBlank: string | null;
  noBlank: string | null;
  nameAccount: string | null;
};

/**
 * Export the entire filtered ledger as CSV rows. Mirrors the page's tb_cnt query
 * (status + search) unpaginated + capped, and writes an admin_export_log row.
 */
export async function exportCntHsAll(
  filter: CntHsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["super", "ops", "accounting"]);
  const admin = createAdminClient();

  const status = filter.status === "1" || filter.status === "2" ? filter.status : "";
  const search = (filter.search ?? "").trim();

  let q = admin
    .from("tb_cnt")
    .select(
      "ID, cntName, cntStatus, cntAmount, date, adminIDCreate, nameBlank, noBlank, nameAccount",
    )
    .order("date", { ascending: false, nullsFirst: false })
    .limit(EXPORT_CAP + 1); // +1 to detect truncation

  if (status) q = q.eq("cntStatus", status);
  if (search) {
    const safe = search.replace(/[(),]/g, " ");
    const pattern = `%${safe}%`;
    q = q.or(`"ID"::text.ilike.${pattern},"nameBlank".ilike.${pattern},"noBlank".ilike.${pattern}`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[exportCntHsAll tb_cnt] failed", { code: error.code, message: error.message });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as unknown as CntRow[];
  const truncated = all.length > EXPORT_CAP;
  const sliced = truncated ? all.slice(0, EXPORT_CAP) : all;

  const rows: CsvRow[] = sliced.map((r) => ({
    "เลขที่": r.ID,
    "วันที่": r.date ? formatThaiDateTime(r.date) : "",
    "หมายเลขตู้": r.cntName ?? "",
    "จำนวนเงิน": Number(r.cntAmount ?? 0).toFixed(2),
    "ธนาคาร": r.nameBlank ?? "",
    "เลขที่บัญชี": r.noBlank ?? "",
    "ชื่อบัญชี": r.nameAccount ?? "",
    "ผู้ทำรายการ": r.adminIDCreate ?? "",
    "สถานะ": CNT_STATUS_LABEL[r.cntStatus] ?? r.cntStatus,
  }));

  await logAdminExport({
    dataset: "cnt-hs",
    filters: { status: filter.status, search },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
