"use server";

/**
 * Export-all (CSV) for /admin/qa/ownerless-goods — สินค้าไม่มีเจ้าของ
 * (Wave 10 Group B · SLA-breach queue · QA exception alert).
 *
 * The page (app/[locale]/(admin)/admin/qa/ownerless-goods/page.tsx) lists every
 * tb_forwarder row with fstatus='4' (ถึงไทยแล้ว) where userid IS NULL or userid = ''
 * — physical goods sitting in the Thailand warehouse with no customer attached.
 * It runs TWO queries (one .eq("userid","") + one .is("userid", null)), merges
 * them, sorts by fdate ASC, then client-slices to 200 for display + 50/page.
 *
 * This action backs the "⬇ CSV ทั้งหมด" button — the ENTIRE flagged set so ops
 * can assign/track follow-up — then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the EXACT same two filtered queries the page runs
 *   .eq("fstatus","4").eq("userid","")   AND
 *   .eq("fstatus","4").is("userid", null)
 *   .order("fdate",{ascending:true})
 * unpaginated (capped at EXPORT_CAP each, merged + sorted ASC). The CSV columns
 * mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: ops / accounting / super.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { nowMs } from "@/lib/datetime-helpers";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "Yiwu",
  "2": "Guangzhou",
};

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "รถ",
  "2": "เรือ",
  "3": "แอร์",
};

const FWD_SELECT =
  "id,fdate,fdatestatus4,fstatus,fcabinetnumber,ftrackingchn,ftrackingth," +
  "fwarehousechina,ftransporttype,fweight,fvolume,ftotalprice,fnote,userid";

type FwdRow = {
  id: number;
  fdate: string | null;
  fdatestatus4: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
  fweight: number | null;
  fvolume: number | null;
  ftotalprice: number | null;
  fnote: string | null;
  userid: string | null;
};

/**
 * Export the entire ownerless-goods set (fstatus='4' AND (userid IS NULL or ''),
 * capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Re-runs the
 * page's exact two filtered queries, unpaginated. Writes an admin_export_log row.
 */
export async function exportQaOwnerlessGoodsAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  await requireAdmin(["ops", "accounting", "super"]);

  const admin = createAdminClient();

  // SAME two queries as the page (empty-string userid + null userid),
  // unpaginated (capped). Fetch one extra to detect truncation.
  const [emptyRes, nullRes] = await Promise.all([
    admin
      .from("tb_forwarder")
      .select(FWD_SELECT)
      .eq("fstatus", "4")
      .eq("userid", "")
      .order("fdate", { ascending: true })
      .range(0, EXPORT_CAP),
    admin
      .from("tb_forwarder")
      .select(FWD_SELECT)
      .eq("fstatus", "4")
      .is("userid", null)
      .order("fdate", { ascending: true })
      .range(0, EXPORT_CAP),
  ]);

  if (emptyRes.error) {
    console.error(`[exportQaOwnerlessGoodsAll empty] failed`, {
      code: emptyRes.error.code,
      message: emptyRes.error.message,
    });
  }
  if (nullRes.error) {
    console.error(`[exportQaOwnerlessGoodsAll null] failed`, {
      code: nullRes.error.code,
      message: nullRes.error.message,
    });
  }
  if (emptyRes.error && nullRes.error) {
    return { rows: [], truncated: false };
  }

  // SAME merge + sort (fdate ASC) as the page.
  const merged = [
    ...((emptyRes.data ?? []) as unknown as FwdRow[]),
    ...((nullRes.data ?? []) as unknown as FwdRow[]),
  ].sort((a, b) => {
    const ad = a.fdate ? new Date(a.fdate).getTime() : 0;
    const bd = b.fdate ? new Date(b.fdate).getTime() : 0;
    return ad - bd;
  });

  const truncated = merged.length > EXPORT_CAP;
  const fwdRows = truncated ? merged.slice(0, EXPORT_CAP) : merged;

  const now = nowMs();

  // SAME column derivation + labels as the page's <thead> / <tbody>.
  const rows: CsvRow[] = fwdRows.map((r) => {
    const arrivedAt = r.fdatestatus4;
    const daysSinceArrival = arrivedAt
      ? Math.floor((now - new Date(arrivedAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    return {
      id: r.id,
      fdate: r.fdate ? String(r.fdate).slice(0, 10) : "",
      fdatestatus4: arrivedAt ? String(arrivedAt).slice(0, 10) : "",
      days_since_arrival: daysSinceArrival !== null ? `${daysSinceArrival}` : "",
      ftrackingchn: r.ftrackingchn || "",
      ftrackingth: r.ftrackingth || "",
      fcabinetnumber: r.fcabinetnumber || "",
      warehouse: WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "",
      transport: TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "",
      fweight: r.fweight ? Number(r.fweight).toFixed(1) : "",
      fvolume: r.fvolume ? Number(r.fvolume).toFixed(3) : "",
      fnote: r.fnote || "",
    };
  });

  await logAdminExport({
    dataset: "qa-ownerless-goods",
    filters: { fstatus: "4", userid: "NULL_OR_EMPTY" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
