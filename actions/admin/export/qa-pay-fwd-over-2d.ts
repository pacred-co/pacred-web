"use server";

/**
 * Export-all (CSV) for /admin/qa/pay-fwd-over-2d — the QA SLA-breach queue:
 * tb_forwarder rows parked on fstatus='5' (รอชำระเงิน — bill sent, still no
 * payment) for more than 48 hours. Ops uses this flagged list for follow-up;
 * exporting it lets ops assign / track each overdue container.
 *
 * The page (app/[locale]/(admin)/admin/qa/pay-fwd-over-2d/page.tsx) lists
 * tb_forwarder rows where:
 *   .eq("fstatus", "5").lt("fdate", cutoff)   // cutoff = NOW() − 2 days
 *   .order("fdate", { ascending: true })
 * paginated 50/page, then merges tb_users for the customer name/phone.
 *
 * DRIFT-FREE: this re-runs that EXACT filter UNPAGINATED (capped at
 * EXPORT_CAP) + the SAME tb_users name/phone merge, maps the SAME columns the
 * page's <CsvButton> uses, and writes an admin_export_log audit row
 * (PII: customer name + phone — owner directive 2026-06-07).
 *
 * RBAC matches the page: super / ops / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure (no captured filters —
 * the SLA window is computed fresh server-side here so the export is always
 * "current overdue", matching what the page just rendered).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

type FRow = {
  id: number;
  fdate: string | null;
  fidorco: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  fstatus: string | null;
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

/** Days between an ISO date and now (floored). Mirrors the page's daysSince. */
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Legacy `number_format($n, 2)` — "1,234.56" thousand-grouped. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Export the entire SLA-breach queue (fstatus='5' AND fdate < NOW()−2d,
 * UNPAGINATED, capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด"
 * button. Reuses the page's exact filter + tb_users merge. Writes an
 * admin_export_log audit row.
 */
export async function exportQaPayFwdOver2dAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page (super implicit).
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  // SAME SLA window the page computes (NOW() − 2 days).
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  // ── Pass 1: the breached forwarder rows (UNPAGINATED, capped) ────
  const { data: rowsRaw, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fidorco,fcabinetnumber,ftrackingchn,ftrackingth,fstatus,fweight,fvolume,ftotalprice,fnote,userid",
    )
    .eq("fstatus", "5")
    .lt("fdate", cutoff)
    .order("fdate", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaPayFwdOver2dAll tb_forwarder] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as FRow[];
  const truncated = all.length > EXPORT_CAP;
  const fwdRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for customer name + phone (SAME merge as page) ──
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
      console.error(`[exportQaPayFwdOver2dAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      userMap.set(u.userID, u);
    }
  }

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
      : (r.userid ?? "");
    const tracking = [
      r.ftrackingchn ? `จ: ${r.ftrackingchn}` : "",
      r.ftrackingth ? `ท: ${r.ftrackingth}` : "",
    ]
      .filter(Boolean)
      .join(" / ");
    const row: CsvRow = {
      fno: r.fidorco ?? `#${r.id}`,
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      fdate: r.fdate ? r.fdate.slice(0, 10) : "",
      age_days: daysSince(r.fdate),
      cabinet: r.fcabinetnumber ?? "",
      tracking,
      weight: r.fweight ? Number(r.fweight).toFixed(2) : "",
      volume: r.fvolume ? Number(r.fvolume).toFixed(3) : "",
      total: numberFormat2(r.ftotalprice),
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-pay-fwd-over-2d",
    filters: { fstatus: "5", cutoff, slaDays: 2 },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
