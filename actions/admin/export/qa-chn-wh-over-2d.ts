"use server";

/**
 * Export-all (CSV) for /admin/qa/chn-wh-over-2d — the QA SLA-breach queue
 * "รอเข้าโกดังจีนเกิน 2 วัน" (Wave 10 Group B · legacy menu-QAAndQC.php).
 *
 * The page (app/[locale]/(admin)/admin/qa/chn-wh-over-2d/page.tsx) lists every
 * tb_forwarder row with fstatus='1' (รอเข้าโกดังจีน) whose fdate is older than
 * NOW() − 2 days (the SLA breach), ordered by fdate ASC, paginated 50/page, then
 * merges tb_users for the customer name + phone. The on-screen "⬇ CSV หน้านี้"
 * downloads only the visible page; this action backs the "⬇ CSV ทั้งหมด" button —
 * the ENTIRE filtered breach list (capped at EXPORT_CAP) — and writes an
 * admin_export_log audit row (PII: customer name + phone).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("fstatus", "1")
 *   .lt("fdate", cutoffIsoDaysAgo(2))
 *   .order("fdate", { ascending: true })
 * plus the same tb_users name/phone join. The CSV columns mirror the page's
 * <thead> 1:1. The ONLY difference vs the page is the EXPORT_CAP guard +
 * the audit log (the page is DB-paginated; here we go unpaginated).
 *
 * RBAC matches the page: ops / accounting / super.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { nowMs, cutoffIsoDaysAgo } from "@/lib/datetime-helpers";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

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

type FwdRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fidorco: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
  fweight: number | null;
  fvolume: number | null;
  fnote: string | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
};

/**
 * Export the entire filtered SLA-breach list (fstatus='1' AND fdate < NOW()−2d,
 * capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the
 * page's exact filtered query unpaginated + the same tb_users join. Writes an
 * admin_export_log audit row.
 */
export async function exportQaChnWhOver2dAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // RBAC matches the page.
  await requireAdmin(["ops", "accounting", "super"]);

  const admin = createAdminClient();

  // SAME SLA cutoff as the page — 2 days ago.
  const cutoff = cutoffIsoDaysAgo(2);

  // ── Pass 1: the forwarder breach rows (SAME filter; unpaginated, capped) ──
  const { data: rowsRaw, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fstatus,fcabinetnumber,ftrackingchn,ftrackingth,fidorco," +
        "fwarehousechina,ftransporttype,fweight,fvolume,fnote,userid",
    )
    .eq("fstatus", "1")
    .lt("fdate", cutoff)
    .order("fdate", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaChnWhOver2dAll tb_forwarder] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as FwdRow[];
  const truncated = all.length > EXPORT_CAP;
  const fwdRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for customer name + phone (SAME join the page does) ──
  const userIds = Array.from(
    new Set(fwdRows.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportQaChnWhOver2dAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      userMap.set(u.userID, u);
    }
  }

  const now = nowMs();

  // นิติบุคคล → company name (not the contact person). One batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = fwdRows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = u
      ? resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpRowFromName(r.userid ? corpNames.get(r.userid) : undefined),
        }).name || (r.userid ?? "")
      : r.userid ?? "";
    const daysWaiting = r.fdate
      ? Math.floor((now - new Date(r.fdate).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const row: CsvRow = {
      id: r.id,
      fdate: r.fdate ? String(r.fdate).slice(0, 10) : "",
      days_waiting: daysWaiting,
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      warehouse:
        WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "",
      transport: TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "",
      tracking_chn: r.ftrackingchn ?? "",
      cabinet: r.fcabinetnumber ?? "",
      weight: r.fweight ? `${Number(r.fweight).toFixed(1)} kg` : "",
      volume: r.fvolume ? `${Number(r.fvolume).toFixed(3)} cbm` : "",
      note: r.fnote ?? "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-chn-wh-over-2d",
    filters: { fstatus: "1", slaDays: 2, cutoff },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
