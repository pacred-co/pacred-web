"use server";

/**
 * Export-all (CSV) for /admin/forwarder-action — the 9 audit queues
 * (faithful port of legacy pcs-admin/forwarder-action.php).
 *
 * The page has TWO distinct row-list branches, keyed on ?action=:
 *
 *   1. action=NoteShop → reads tb_header_order (hnote<>'' AND hnote NOT NULL),
 *      optionally narrowed by ?q=1..6 (hstatus), ordered by hdate DESC.
 *
 *   2. every other action (Note · notPhoto · notPortage · notContainer ·
 *      NotDateContainerClose · NotShipFree · NotShipFreeError · fCreditError)
 *      reads tb_forwarder with the action-specific condition, optionally
 *      narrowed by ?q (fstatus), ordered by fdate DESC.
 *
 * Both branches are FILTERED lists (no capped "latest-N" snapshot), so both
 * get fetchAll. This action re-runs the page's EXACT filtered query for the
 * active action UNPAGINATED (capped at EXPORT_CAP), with the SAME columns the
 * page renders, then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: the filter conditions below are byte-identical to the page's.
 * RBAC matches the page: super / ops / accounting / warehouse.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import { FREE_SHIPPING_ZIPS } from "@/lib/forwarder/free-shipping-zips";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

/** Active filters the page passes through. */
export type ForwarderActionExportFilter = {
  /** The audit queue (?action=). */
  action: string;
  /** Optional status narrow (?q=) — hstatus for NoteShop, fstatus otherwise. */
  q?: string;
};

type ShopRaw = {
  id: number;
  hdate: string | null;
  hno: string | null;
  userid: string | null;
  htitle: string | null;
  hcount: number | null;
  htotalpricechn: number | string | null;
  hstatus: string | null;
  hnote: string | null;
};

type ForwarderRaw = {
  id: number;
  fdate: string | null;
  fcabinetnumber: string | null;
  ftrackingchn: string | null;
  fstatus: string | null;
  fnote: string | null;
  fwarehousename: string | null;
  ftotalprice: number | string | null;
  fshipby: string | null;
  faddresszipcode: string | null;
};

/**
 * Export the entire filtered audit queue (capped at EXPORT_CAP) as CSV rows for
 * the "⬇ CSV ทั้งหมด" button. Re-runs the page's exact filtered query for the
 * active action, unpaginated. Writes an admin_export_log audit row.
 */
export async function exportForwarderActionAll(
  filter: ForwarderActionExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as the page.
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);

  const { action, q } = filter;
  const admin = createAdminClient();
  const cutoff = "2022-01-15 00:00:00";

  // ── Branch 1: NoteShop → tb_header_order ────────────────────────
  if (action === "NoteShop") {
    let shopQ = admin
      .from("tb_header_order")
      .select("id,hdate,hno,userid,htitle,hcount,htotalpricechn,hstatus,hnote")
      .neq("hnote", "")
      .not("hnote", "is", null)
      .order("hdate", { ascending: false })
      .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

    if (q && /^[1-6]$/.test(q)) {
      shopQ = shopQ.eq("hstatus", q);
    }

    const { data: rowsRaw, error } = await shopQ;
    if (error) {
      console.error("[exportForwarderActionAll tb_header_order] failed", {
        code: error.code,
        message: error.message,
      });
      return { rows: [], truncated: false };
    }

    const all = (rowsRaw ?? []) as unknown as ShopRaw[];
    const truncated = all.length > EXPORT_CAP;
    const shopRows = truncated ? all.slice(0, EXPORT_CAP) : all;

    const rows: CsvRow[] = shopRows.map((r) => ({
      id: r.id,
      hdate: r.hdate ? String(r.hdate).slice(0, 10) : "",
      hno: r.hno ?? "",
      userid: r.userid ?? "",
      htitle: `${r.htitle ?? ""}${r.hcount ? ` (${r.hcount})` : ""}`.trim(),
      htotalpricechn: Number(r.htotalpricechn ?? 0).toFixed(2),
      hstatus: r.hstatus ?? "",
      hnote: r.hnote ?? "",
    }));

    await logAdminExport({
      dataset: "forwarder-action",
      filters: { action, q: q ?? null },
      rowCount: rows.length,
      truncated,
    });

    return { rows, truncated };
  }

  // ── Branch 2: every other action → tb_forwarder ─────────────────
  let fq = admin
    .from("tb_forwarder")
    .select(
      "id,fdate,fcabinetnumber,ftrackingchn,fstatus,fnote,fwarehousename,ftotalprice,fshipby,faddresszipcode",
    )
    .order("fdate", { ascending: false })
    .range(0, EXPORT_CAP);

  if (action === "Note") {
    fq = fq.not("fnote", "is", null).neq("fnote", "");
  } else if (action === "notPhoto") {
    fq = fq.eq("fcover", "").gt("fstatus", "1").gte("fdate", cutoff);
  } else if (action === "notPortage") {
    fq = fq.eq("ftransportprice", 0).gte("fdate", cutoff);
  } else if (action === "notContainer") {
    fq = fq.eq("fcabinetnumber", "").gte("fdate", cutoff);
  } else if (action === "NotDateContainerClose") {
    fq = fq.is("fdatecontainerclose", null).gte("fdate", cutoff);
  } else if (action === "fCreditError") {
    fq = fq.eq("fcredit", "1").lt("fcreditdate", new Date().toISOString());
  } else if (action === "NotShipFree") {
    fq = fq
      .in("faddresszipcode", FREE_SHIPPING_ZIPS)
      .not("fshipby", "in", `(PCS,PCSF)`)
      .gte("fdate", cutoff);
  } else if (action === "NotShipFreeError") {
    fq = fq
      .not("faddresszipcode", "in", `(${FREE_SHIPPING_ZIPS.join(",")})`)
      .eq("fshipby", "PCSF")
      .gte("fdate", cutoff);
  } else {
    // Unknown action — nothing to export.
    return { rows: [], truncated: false };
  }

  if (q) fq = fq.eq("fstatus", q);

  const { data: rowsRaw, error } = await fq;
  if (error) {
    console.error("[exportForwarderActionAll tb_forwarder] failed", {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as ForwarderRaw[];
  const truncated = all.length > EXPORT_CAP;
  const fwdRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  const isShipQueue = action === "NotShipFree" || action === "NotShipFreeError";

  const rows: CsvRow[] = fwdRows.map((r) => {
    const row: CsvRow = {
      id: r.id,
      fdate: r.fdate ? String(r.fdate).slice(0, 10) : "",
      fcabinetnumber: r.fcabinetnumber ?? "",
      ftrackingchn: r.ftrackingchn ?? "",
      fstatus: r.fstatus ?? "",
    };
    if (isShipQueue) {
      row.faddresszipcode = r.faddresszipcode ?? "";
      row.fshipby = r.fshipby ?? "";
    }
    row.fnote = r.fnote ?? "";
    row.ftotalprice = Number(r.ftotalprice ?? 0).toFixed(2);
    return row;
  });

  await logAdminExport({
    dataset: "forwarder-action",
    filters: { action, q: q ?? null },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
