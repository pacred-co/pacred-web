"use server";

/**
 * Export-all (CSV) for /admin/qa/pay-shop-over-1d — the QA SLA-breach queue of
 * shop orders parked on รอชำระเงิน (hstatus='2') for more than 24 hours.
 *
 * The page (app/[locale]/(admin)/admin/qa/pay-shop-over-1d/page.tsx) lists every
 * tb_header_order row with hstatus='2' AND hdate < NOW()-1d, joined to tb_users
 * for the customer name/tel, ordered by hdate ASC, then DB-paginated 50/page.
 * The on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action
 * backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered breach set (capped
 * at EXPORT_CAP) — then writes an admin_export_log audit row (PII: customer name
 * + phone).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("hstatus","2")
 *   .lt("hdate", cutoff)            // cutoff = NOW()-24h, computed here (same as page)
 *   .order("hdate",{ascending:true})
 * plus the same tb_users name join. The CSV columns mirror the page's CsvButton
 * cols 1:1. The page DB-paginates this query (.range(from,to)); the ONLY
 * difference here is .range(0,EXPORT_CAP) + the audit log.
 *
 * RBAC matches the page: ops / accounting (super implicit in requireAdmin).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

type HRow = {
  id: number;
  hno: string | null;
  hdate: string | null;
  htitle: string | null;
  hcount: number | null;
  htotalpricechn: number | null;
  htotalpriceuser: number | null;
  hrate: number | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

/** Floor of (now − iso) in days; 0 when iso is null/invalid (mirrors page daysSince). */
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** "1,234.56" thousand-grouped, 2dp — mirrors the page's toLocaleString display. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Export the entire filtered SLA-breach queue (capped at EXPORT_CAP) as CSV rows
 * for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * (hstatus='2' + hdate < NOW()-24h + the tb_users name join), unpaginated.
 * Writes an admin_export_log audit row.
 *
 * No external filters: the breach window is computed from the wall clock the
 * same way the page does (NOW()-24h), so the page + export stay byte-identical.
 */
export async function exportQaPayShopOver1dAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Matches the page-level gate (super implicit in requireAdmin).
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  // SLA cutoff: 24h ago, ISO string — identical to the page.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── Pass 1: pull the breached header-order rows ─────────────────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,htitle,hcount,htotalpricechn,htotalpriceuser,hrate,userid",
    )
    .eq("hstatus", "2")
    .lt("hdate", cutoff)
    .order("hdate", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaPayShopOver1dAll tb_header_order] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as HRow[];
  const truncated = all.length > EXPORT_CAP;
  const headerRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer-name/tel display ──────────
  // SAME 2-query merge the page does.
  const userIds = Array.from(
    new Set(headerRows.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportQaPayShopOver1dAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      userMap.set(u.userID, u);
    }
  }

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = headerRows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = u
      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || (r.userid ?? "")
      : (r.userid ?? "");
    const row: CsvRow = {
      hno: r.hno ?? "",
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      hdate: r.hdate ? r.hdate.slice(0, 10) : "",
      age_days: daysSince(r.hdate),
      htitle: r.htitle ?? "",
      hcount: r.hcount ?? 0,
      total_cny: numberFormat2(r.htotalpricechn),
      total_thb: numberFormat2(r.htotalpriceuser),
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-pay-shop-over-1d",
    filters: { hstatus: "2", cutoff, slaDays: 1 },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
