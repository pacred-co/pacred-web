"use server";

/**
 * Export-all (CSV) for /admin/qa/chn-shop-over-2d — the QA SLA-breach queue of
 * ฝากสั่ง orders parked on hstatus='3' (สั่งสินค้าแล้ว — Pacred placed the China
 * order, waiting for the shop to ship into the Guangzhou warehouse) for more
 * than 48 hours.
 *
 * The page (app/[locale]/(admin)/admin/qa/chn-shop-over-2d/page.tsx) lists
 * tb_header_order rows with:
 *   .eq("hstatus","3")
 *   .or(`and(hdate3.is.null,hdate.lt.${cutoff}),hdate3.lt.${cutoff}`)
 *   .order("hdate3", { ascending: true, nullsFirst: true })
 * then merges tb_users for the customer name/tel, and paginates 50/page for
 * display. The on-screen "⬇ CSV หน้านี้" downloads only the visible page;
 * this action backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered
 * breach set (capped at EXPORT_CAP) — then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: re-runs the EXACT same filter the page runs (hstatus='3' +
 * the same .or() 2-branch cutoff + the same hdate3 ASC order + the tb_users
 * name join), unpaginated. The cutoff is recomputed here the same way the
 * page does (NOW − 2 days). CSV columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: ops / accounting (super implicit).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure (no filters — the
 * breach set is fully derived server-side).
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
  hdate3: string | null;
  htitle: string | null;
  hcount: number | null;
  hstatus: string | null;
  htotalpricechn: number | null;
  hnote: string | null;
  htransporttype: string | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Export the entire filtered SLA-breach queue (capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * (hstatus='3' + the 2-branch cutoff .or() + hdate3 ASC + the tb_users join),
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportQaChnShopOver2dAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  // SAME cutoff the page computes: NOW − 2 days.
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  // ── Pass 1: pull the breach header rows (SAME filter, unpaginated) ──
  const { data: rowsRaw, error } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,hdate3,htitle,hcount,hstatus,htotalpricechn,hnote,htransporttype,userid",
    )
    .eq("hstatus", "3")
    .or(`and(hdate3.is.null,hdate.lt.${cutoff}),hdate3.lt.${cutoff}`)
    .order("hdate3", { ascending: true, nullsFirst: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaChnShopOver2dAll tb_header_order] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as HRow[];
  const truncated = all.length > EXPORT_CAP;
  const headerRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer-name display (SAME join) ──────
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
      console.error(`[exportQaChnShopOver2dAll tb_users] failed`, {
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
      : r.userid ?? "";
    const effectiveStart = r.hdate3 ?? r.hdate;
    const row: CsvRow = {
      hno: r.hno ?? "",
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      order_date: effectiveStart ? effectiveStart.slice(0, 10) : "",
      wait_days: daysSince(effectiveStart),
      title: r.htitle ?? "",
      count: r.hcount ?? "",
      transport: r.htransporttype ?? "",
      total_chn: Number(r.htotalpricechn ?? 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
      }),
      note: r.hnote ?? "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-chn-shop-over-2d",
    filters: { hstatus: "3", cutoffDays: 2 },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
