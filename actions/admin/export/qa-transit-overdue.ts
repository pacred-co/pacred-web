"use server";

/**
 * Export-all (CSV) for /admin/qa/transit-overdue — the QA SLA-breach queue
 * "กำลังมาไทยเกินกำหนด" (Wave 10 Group B).
 *
 * The page (app/[locale]/(admin)/admin/qa/transit-overdue/page.tsx) lists
 * tb_forwarder rows with fstatus='3' (กำลังส่งมาไทย) whose transit-start
 * (fdatestatus3, falling back to fdate for legacy rows) is older than the
 * 7-day SLA cutoff, ordered by fdate ASC, joined to tb_users for the
 * customer name/phone. PostgREST can't express the "fdatestatus3 < cutoff OR
 * (fdatestatus3 IS NULL AND fdate < cutoff)" condition cleanly in one query,
 * so the page fetches all fstatus='3' rows and filters post-fetch, then
 * client-slices 50/page for display.
 *
 * This action backs the "⬇ CSV ทั้งหมด" button — the ENTIRE SLA-breaching set
 * (not just the visible page) — then writes an admin_export_log audit row so
 * ops can assign/track follow-up on the exported list.
 *
 * DRIFT-FREE: re-runs the EXACT same query + post-fetch SLA filter the page
 * runs (fstatus='3' · order fdate ASC · cutoff = NOW − 7 วัน · transitStart =
 * fdatestatus3 ?? fdate) plus the same tb_users name join. The CSV columns
 * mirror the page's CsvButton cols 1:1.
 *
 * RBAC matches the page: ops / accounting / super.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { cutoffIsoDaysAgo, nowMs } from "@/lib/datetime-helpers";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

// SAME cutoff window as the page (7-day SLA heuristic).
const SLA_DAYS = 7;

// SAME decode tables as the page.
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
  fdatestatus3: string | null;
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

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
};

/**
 * Export the entire SLA-breaching transit-overdue queue (capped at
 * EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's
 * exact query + post-fetch SLA filter + the tb_users name join, unpaginated.
 * Writes an admin_export_log audit row.
 */
export async function exportQaTransitOverdueAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // SAME gate as the page.
  await requireAdmin(["ops", "accounting", "super"]);

  const admin = createAdminClient();
  const cutoff = cutoffIsoDaysAgo(SLA_DAYS);

  // ── Pass 1: pull all fstatus='3' rows (SAME query the page runs, but
  // unpaginated/capped instead of the page's .limit(500)). ──────────
  const { data: rowsRaw, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fdatestatus3,fstatus,fcabinetnumber,ftrackingchn,ftrackingth," +
        "fwarehousechina,ftransporttype,fweight,fvolume,ftotalprice,fnote,userid",
    )
    .eq("fstatus", "3")
    .order("fdate", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaTransitOverdueAll tb_forwarder] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as FwdRow[];

  // SAME post-fetch SLA filter as the page: transitStart < cutoff.
  const cutoffMs = new Date(cutoff).getTime();
  const breaching = all.filter((r) => {
    const transitStart = r.fdatestatus3 ?? r.fdate;
    if (!transitStart) return false;
    return new Date(transitStart).getTime() < cutoffMs;
  });

  const truncated = breaching.length > EXPORT_CAP;
  const fwdRows = truncated ? breaching.slice(0, EXPORT_CAP) : breaching;

  // ── Pass 2: tb_users for the customer name/phone (SAME join). ─────
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
      console.error(`[exportQaTransitOverdueAll tb_users] failed`, {
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
    const transitStart = r.fdatestatus3 ?? r.fdate;
    const daysInTransit = transitStart
      ? Math.floor((now - new Date(transitStart).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const row: CsvRow = {
      id: r.id,
      transit_start: transitStart ? String(transitStart).slice(0, 10) : "",
      days_in_transit: daysInTransit,
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      warehouse: WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "",
      transport: TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "",
      tracking: r.ftrackingth || r.ftrackingchn || "",
      cabinet: r.fcabinetnumber ?? "",
      weight: r.fweight ? `${Number(r.fweight).toFixed(1)} kg` : "",
      volume: r.fvolume ? `${Number(r.fvolume).toFixed(3)} cbm` : "",
      note: r.fnote ?? "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-transit-overdue",
    filters: { fstatus: "3", slaDays: SLA_DAYS, cutoff },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
