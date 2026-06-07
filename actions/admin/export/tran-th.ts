"use server";

/**
 * Export-all (CSV) for /admin/forwarders/tran-th — the TH-transport batch list
 * (legacy `tb_forwarder_tran_th_h` headers + `_sub` line items).
 *
 * The page (app/[locale]/(admin)/admin/forwarders/tran-th/page.tsx) lists every
 * tb_forwarder_tran_th_h batch ordered by date DESC, optionally filtered by a
 * created-date range (date_from / date_to) and the creating admin (rep →
 * adminidcreate). For each header it counts the included forwarders from
 * tb_forwarder_tran_th_sub. The page loads up to 300 via getTranThList; the
 * on-screen "⬇ CSV หน้านี้" downloads only those visible rows. This action backs
 * the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered range (capped at
 * EXPORT_CAP) — then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page's getTranThList runs
 *   .from("tb_forwarder_tran_th_h").select("id, date, adminidcreate")
 *   .order("date",{ascending:false})
 *   [.gte("date", date_from T00:00:00)] [.lte("date", date_to T23:59:59)]
 *   [.eq("adminidcreate", adminID)]
 * plus the same tb_forwarder_tran_th_sub per-header item count. The CSV columns
 * mirror the page's <thead> 1:1 (#, วันที่สร้าง, ผู้สร้าง, #forwarder ในชุด).
 * The only difference is the page's .limit(300) is replaced with .range(0,
 * EXPORT_CAP) (unpaginated) + the audit log.
 *
 * RBAC matches the page: super / accounting / warehouse / freight_sales.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * { dateFrom, dateTo, adminID } filters.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

/** Long-form Thai date (mirrors the page's fmtDateLong). */
function fmtDateLong(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "2-digit" });
}

/** Active filters the page passes through (the resolved batch filters). */
export type TranThExportFilter = {
  dateFrom?: string;
  dateTo?: string;
  adminID?: string;
};

type HRow = { id: number; date: string | null; adminidcreate: string };
type SubCountRow = { ftthhid: number };

/**
 * Export the entire filtered TH-transport batch list (capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered
 * header query (date range + adminidcreate) unpaginated, plus the same
 * per-header forwarder count. Writes an admin_export_log audit row.
 */
export async function exportTranThAll(
  filter: TranThExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same roles as the page (ADR-0006 §1.4).
  await requireAdmin(["super", "accounting", "warehouse", "freight_sales"]);

  const { dateFrom, dateTo, adminID } = filter;
  const admin = createAdminClient();

  // ── Pass 1: pull the batch headers (SAME filter as the page) ────
  let q = admin
    .from("tb_forwarder_tran_th_h")
    .select("id, date, adminidcreate")
    .order("date", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  if (dateFrom) q = q.gte("date", `${dateFrom}T00:00:00`);
  if (dateTo)   q = q.lte("date", `${dateTo}T23:59:59`);
  if (adminID)  q = q.eq("adminidcreate", adminID);

  const { data: headRaw, error: headErr } = await q;
  if (headErr) {
    console.error("[exportTranThAll tb_forwarder_tran_th_h] failed", {
      code: headErr.code,
      message: headErr.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (headRaw ?? []) as unknown as HRow[];
  const truncated = all.length > EXPORT_CAP;
  const headers = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: per-header forwarder counts (SAME as the page) ──────
  const ids = headers.map((h) => h.id);
  const itemsPerHeader = new Map<number, number>();
  if (ids.length > 0) {
    const { data: subRaw, error: subErr } = await admin
      .from("tb_forwarder_tran_th_sub")
      .select("ftthhid")
      .in("ftthhid", ids);
    if (subErr) {
      console.error("[exportTranThAll tb_forwarder_tran_th_sub] failed", {
        code: subErr.code,
        message: subErr.message,
      });
    }
    for (const r of (subRaw ?? []) as unknown as SubCountRow[]) {
      itemsPerHeader.set(r.ftthhid, (itemsPerHeader.get(r.ftthhid) ?? 0) + 1);
    }
  }

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = headers.map((h) => ({
    id: h.id,
    date: fmtDateLong(h.date),
    adminidcreate: h.adminidcreate ?? "",
    itemCount: itemsPerHeader.get(h.id) ?? 0,
  }));

  await logAdminExport({
    dataset: "tran-th",
    filters: { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null, adminID: adminID ?? null },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
