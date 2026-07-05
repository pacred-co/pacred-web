"use server";

/**
 * Export-all (CSV) for /admin/qa/order-cancellations — the QA queue of cancelled
 * orders that still need follow-up (refund · note · stale silent-abandonment).
 *
 * The page (app/[locale]/(admin)/admin/qa/order-cancellations/page.tsx) pulls
 * tb_header_order rows with hstatus='6' (cancelled) inside the last-90-day window
 * (gt hdateupdate, ordered hdateupdate DESC, limit 500), then filters IN-MEMORY
 * to the "needs follow-up" set:
 *   hshoppay='1'  OR  hnote<>''  OR  hdateupdate < NOW()-1d
 * then client-slices that full set 50/page for display. The on-screen
 * "⬇ CSV หน้านี้" downloads only the visible page; this action backs the 2nd
 * "⬇ CSV ทั้งหมด" button — the ENTIRE filtered set (capped at EXPORT_CAP) — then
 * writes an admin_export_log audit row (PII: customer name/phone — owner directive
 * 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same DB filter the page runs
 *   .eq("hstatus","6").gt("hdateupdate", ninetyDayCutoff)
 *   .order("hdateupdate",{ascending:false})
 * AND the SAME in-memory "needs follow-up" predicate, AND the SAME tb_users name
 * merge. The CSV columns mirror the page's <thead> 1:1. The only differences are
 * the EXPORT_CAP guard + the audit log (the page caps the DB pull at 500; this
 * action raises that to EXPORT_CAP for the full export).
 *
 * RBAC matches the page: ops / accounting.
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

type HRow = {
  id: number;
  hno: string | null;
  hdate: string | null;
  hdateupdate: string | null;
  htitle: string | null;
  hcount: number | null;
  hstatus: string | null;
  hshoppay: string | null;
  hnote: string | null;
  htotalpricechn: number | null;
  htotalpriceuser: number | null;
  hrate: number | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
};

/** Floor of (now − iso) in days; 0 when iso is null/invalid. */
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Legacy `number_format($n, 2)` — "1,234.56" thousand-grouped (matches page). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Export the entire filtered cancellation-followup queue (cancelled orders needing
 * follow-up, capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button.
 * Reuses the page's exact filtered query + in-memory predicate + tb_users merge,
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportQaOrderCancellationsAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page.
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  const now = Date.now();
  const oneDayCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const ninetyDayCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

  // ── Pass 1: cancelled orders within the same 90-day window ──────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,hdateupdate,htitle,hcount,hstatus,hshoppay,hnote," +
        "htotalpricechn,htotalpriceuser,hrate,userid",
    )
    .eq("hstatus", "6")
    .gt("hdateupdate", ninetyDayCutoff)
    .order("hdateupdate", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaOrderCancellationsAll tb_header_order] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  // SAME in-memory "needs follow-up" predicate as the page.
  const allCancelled = (rowsRaw ?? []) as unknown as HRow[];
  const needsFollowup = allCancelled.filter((r) => {
    const hasPayment = r.hshoppay === "1";
    const hasNote = r.hnote != null && r.hnote.trim() !== "";
    const isStale = r.hdateupdate != null && r.hdateupdate < oneDayCutoff;
    return hasPayment || hasNote || isStale;
  });

  const truncated = needsFollowup.length > EXPORT_CAP;
  const followupRows = truncated ? needsFollowup.slice(0, EXPORT_CAP) : needsFollowup;

  // ── Pass 2: tb_users for the customer-name display ──────────────
  // SAME merge the page does.
  const userIds = Array.from(
    new Set(followupRows.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportQaOrderCancellationsAll tb_users] failed`, {
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
  const rows: CsvRow[] = followupRows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = u
      ? resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpRowFromName(r.userid ? corpNames.get(r.userid) : undefined),
        }).name || (r.userid ?? "")
      : (r.userid ?? "");
    const ageDays = daysSince(r.hdateupdate);
    const hasPayment = r.hshoppay === "1";
    const hasNote = r.hnote != null && r.hnote.trim() !== "";
    const row: CsvRow = {
      hno: r.hno ?? "",
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      hdate: r.hdate ? r.hdate.slice(0, 10) : "",
      hdateupdate: r.hdateupdate ? r.hdateupdate.slice(0, 10) : "",
      age_days: ageDays,
      title: r.htitle ?? "",
      count: r.hcount ?? "",
      total_chn: numberFormat2(r.htotalpricechn),
      total_thb: numberFormat2(r.htotalpriceuser),
      rate: r.hrate != null ? Number(r.hrate).toFixed(2) : "",
      money_status: hasPayment ? "จ่ายแล้ว · รอคืน" : "ยังไม่จ่าย",
      note: hasNote ? (r.hnote ?? "") : "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-order-cancellations",
    filters: { hstatus: "6", window: "90d", followup: "payment|note|stale-1d" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
