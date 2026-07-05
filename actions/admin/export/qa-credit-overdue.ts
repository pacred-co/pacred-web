"use server";

/**
 * Export-all (CSV) for /admin/qa/credit-overdue — the QA SLA-breach queue of
 * credit-line forwarder orders past their pay-back deadline (legacy
 * forwarder-action.php fCreditError).
 *
 * The page (app/[locale]/(admin)/admin/qa/credit-overdue/page.tsx) lists every
 * tb_forwarder row with fcredit='1' AND fcreditdate < NOW(), ordered by
 * fcreditdate ASC, then merges tb_users for the customer name + tel. It limits
 * the fetch to 200 rows and client-slices that set 50/page for display. The
 * on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action backs
 * the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered breach set (capped at
 * EXPORT_CAP) — then writes an admin_export_log audit row (PII: customer name +
 * tel · MONEY exposure — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("fcredit","1").lt("fcreditdate", NOW)
 *   .order("fcreditdate",{ascending:true})
 * plus the same tb_users name/tel merge. The CSV columns mirror the page's
 * <thead> 1:1. The page caps its fetch at 200 (client-slices for display); this
 * action lifts that to EXPORT_CAP so "export all" really is all breach rows.
 *
 * RBAC matches the page: ops / accounting (super implicit).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
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

const STATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
  "99": "พิเศษ",
};

type FRow = {
  id: number;
  fdate: string | null;
  fidorco: string | null;
  fcabinetnumber: string | null;
  fstatus: string | null;
  fcredit: string | null;
  fcreditdate: string | null;
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

function nowIso(): string {
  return new Date(Date.now()).toISOString();
}
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Export the entire SLA-breached credit-line list (fcredit='1' AND
 * fcreditdate < NOW(), capped at EXPORT_CAP) as CSV rows for the
 * "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query (unpaginated)
 * + the same tb_users name/tel merge. Writes an admin_export_log audit row.
 */
export async function exportQaCreditOverdueAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page (super implicit).
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();
  const now = nowIso();

  // ── Pass 1: pull the breached forwarder rows (SAME filter as the page) ──
  // Capped; fetch one extra to detect truncation.
  const { data: rowsRaw, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fidorco,fcabinetnumber,fstatus,fcredit,fcreditdate,ftotalprice,fnote,userid",
    )
    .eq("fcredit", "1")
    .lt("fcreditdate", now)
    .order("fcreditdate", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaCreditOverdueAll tb_forwarder] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as FRow[];
  const truncated = all.length > EXPORT_CAP;
  const fwdRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer name + tel (SAME merge as the page) ──
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
      console.error(`[exportQaCreditOverdueAll tb_users] failed`, {
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
    const lateDays = daysSince(r.fcreditdate);
    return {
      fidorco: r.fidorco ?? `#${r.id}`,
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      fdate: r.fdate ? r.fdate.slice(0, 10) : "",
      fcreditdate: r.fcreditdate ? r.fcreditdate.slice(0, 10) : "",
      lateDays: lateDays,
      fcabinetnumber: r.fcabinetnumber || "",
      status: STATUS_LABEL[r.fstatus ?? ""] ?? r.fstatus ?? "",
      ftotalprice: Number(r.ftotalprice ?? 0).toFixed(2),
    };
  });

  await logAdminExport({
    dataset: "qa-credit-overdue",
    filters: { fcredit: "1", fcreditdate_lt: now },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
