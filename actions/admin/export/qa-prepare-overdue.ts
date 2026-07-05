"use server";

/**
 * Export-all (CSV) for /admin/qa/prepare-overdue — the QA SLA-breach queue
 * "เตรียมส่งเกินกำหนด" (Wave 10 Group B).
 *
 * The page (app/[locale]/(admin)/admin/qa/prepare-overdue/page.tsx) lists every
 * tb_forwarder row with fstatus='4' (ถึงไทยแล้ว) AND fdatestatus4 older than the
 * 3-day prep SLA cutoff (NOW() − 3 วัน), ordered by fdatestatus4 ASC, joined to
 * tb_users for the customer name + phone. The page DB-paginates 50/page; this
 * action backs the "⬇ CSV ทั้งหมด" button — the ENTIRE filtered result set
 * (capped at EXPORT_CAP) — then writes an admin_export_log audit row (PII:
 * customer name + phone — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("fstatus","4")
 *   .lt("fdatestatus4", cutoffIsoDaysAgo(3))
 *   .order("fdatestatus4",{ascending:true})
 * plus the same tb_users name/phone join. The CSV columns mirror the page's
 * CsvButton cols 1:1. The ONLY difference here is the EXPORT_CAP guard + audit.
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

// Safety cap for the "export all filtered" path (mirrors the shared convention).
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

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
};

/**
 * Export the entire filtered prepare-overdue SLA queue (capped at EXPORT_CAP)
 * as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered
 * query (fstatus='4' + fdatestatus4 < NOW()−3d + the tb_users join),
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportQaPrepareOverdueAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same RBAC as the page.
  await requireAdmin(["ops", "accounting", "super"]);

  const admin = createAdminClient();

  // SAME 3-day prep SLA cutoff the page computes.
  const cutoff = cutoffIsoDaysAgo(3);

  // ── Pass 1: pull the SLA-breach forwarder rows ──────────────────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fdatestatus4,fstatus,fcabinetnumber,ftrackingchn,ftrackingth," +
        "fwarehousechina,ftransporttype,fweight,fvolume,ftotalprice,fnote,userid",
    )
    .eq("fstatus", "4")
    .lt("fdatestatus4", cutoff)
    .order("fdatestatus4", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaPrepareOverdueAll tb_forwarder] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as FwdRow[];
  const truncated = all.length > EXPORT_CAP;
  const fwdRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer name + phone ──────────────
  // SAME join the page does (tb_users ON userID = forwarder.userid).
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
      console.error(`[exportQaPrepareOverdueAll tb_users] failed`, {
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
    const daysWaiting = r.fdatestatus4
      ? Math.floor(
          (now - new Date(r.fdatestatus4).getTime()) / (24 * 60 * 60 * 1000),
        )
      : 0;
    const row: CsvRow = {
      id: r.id,
      arrived: r.fdatestatus4 ? String(r.fdatestatus4).slice(0, 10) : "",
      days_waiting: daysWaiting,
      userid: r.userid ?? "",
      customer: customerName,
      phone: u?.userTel ?? "",
      tracking_th: r.ftrackingth ?? "",
      cabinet: r.fcabinetnumber ?? "",
      warehouse:
        WAREHOUSE_LABEL[r.fwarehousechina ?? ""] ?? r.fwarehousechina ?? "",
      transport: TRANSPORT_LABEL[r.ftransporttype ?? ""] ?? "",
      weight: r.fweight != null ? `${Number(r.fweight).toFixed(1)} kg` : "",
      volume: r.fvolume != null ? `${Number(r.fvolume).toFixed(3)} cbm` : "",
      price: Number(r.ftotalprice ?? 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      note: r.fnote ?? "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-prepare-overdue",
    filters: { fstatus: "4", slaDays: 3, cutoff },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
