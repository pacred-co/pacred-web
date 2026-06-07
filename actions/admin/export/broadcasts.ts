"use server";

/**
 * Export-all (CSV) for /admin/broadcasts — the Pop-up ประกาศ list (legacy
 * pcs-admin/popup.php · include/pages/popup/all.php · repointed to tb_notify).
 *
 * The page (app/[locale]/(admin)/admin/broadcasts/page.tsx) loads every tb_notify
 * row (id, title, content, datestart, dateexp, url, adminid), ordered by id DESC,
 * capped at 500, then client-slices 50/page for display. There are NO tab / status
 * / date / search filters — it's a single full list. The on-screen "⬇ CSV หน้านี้"
 * downloads only the visible page; this action backs the 2nd "⬇ CSV ทั้งหมด" button
 * — the ENTIRE list (capped at EXPORT_CAP) — then writes an admin_export_log audit
 * row.
 *
 * DRIFT-FREE: this re-runs the EXACT same query the page runs
 *   .from("tb_notify").select("id, title, content, datestart, dateexp, url, adminid")
 *   .order("id", { ascending: false })
 * The only difference is the EXPORT_CAP guard (page caps at 500; export caps at
 * 10000) + the audit log. The CSV columns mirror the page's <thead> 1:1
 * (รหัส · ชื่อเรื่องประกาศ · วันที่เริ่มแสดงผล · วันที่สิ้นสุด · สถานะ · ผู้ทำรายการ),
 * with the same JS-derived "สถานะ" (กำลังแสดง / หมดอายุ / รอแสดง) over datestart..dateexp.
 *
 * RBAC matches the page: super / sales_admin.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { nowMs } from "@/lib/datetime-helpers";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path.
const EXPORT_CAP = 10000;

type NotifyRow = {
  id: number;
  title: string;
  content: string | null;
  datestart: string | null;
  dateexp: string | null;
  url: string | null;
  adminid: string | null;
};

/** Mirror the page's th-TH short date+time render (fmt()). */
function fmt(dt: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

/** Mirror the page's JS-derived status chip over datestart..dateexp. */
function statusLabel(r: NotifyRow, now: number): string {
  const start = r.datestart ? new Date(r.datestart).getTime() : -Infinity;
  const end = r.dateexp ? new Date(r.dateexp).getTime() : Infinity;
  const active = start <= now && now <= end;
  const expired = now > end;
  return active ? "กำลังแสดง" : expired ? "หมดอายุ" : "รอแสดง";
}

/**
 * Export the entire Pop-up ประกาศ list (capped at EXPORT_CAP) as CSV rows for the
 * "⬇ CSV ทั้งหมด" button. Reuses the page's exact query, unpaginated. Writes an
 * admin_export_log audit row.
 */
export async function exportBroadcastsAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page.
  await requireAdmin(["super", "sales_admin"]);

  const admin = createAdminClient();

  // SAME query as the page (unpaginated · capped at EXPORT_CAP; fetch one extra
  // to detect truncation).
  const { data: raw, error } = await admin
    .from("tb_notify")
    .select("id, title, content, datestart, dateexp, url, adminid")
    .order("id", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportBroadcastsAll tb_notify] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (raw ?? []) as unknown as NotifyRow[];
  const truncated = all.length > EXPORT_CAP;
  const notifyRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  const now = nowMs();

  // SAME columns + keys as the page's CsvButton cols (mirrors the <thead> 1:1).
  const rows: CsvRow[] = notifyRows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    datestart: fmt(r.datestart),
    dateexp: fmt(r.dateexp),
    status: statusLabel(r, now),
    adminid: r.adminid ?? "—",
  }));

  await logAdminExport({
    dataset: "broadcasts",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
