"use server";

/**
 * "Export all filtered" CSV for /admin/accounting/receipts (owner directive
 * 2026-06-07 — accounting wants the reconciliation lists in a spreadsheet).
 *
 * The /admin/accounting/receipts list page builds its CsvButton rows INLINE
 * from a server-paginated (10/page) `tb_receipt` query via
 * `actions/admin/accounting-receipts.ts:getReceiptList`. This action re-runs
 * that EXACT same filtered query (same tab→rstatus filter + same date window +
 * same `rid/userid/recompname` ilike search + same ordering) with NO
 * pagination — one capped page of up to EXPORT_CAP rows — so the export can
 * never drift from the on-screen table. The ONLY difference vs the page query
 * is `.range(...)` is widened to 0..EXPORT_CAP-1 instead of the 10-row window.
 *
 * The CSV columns + value-mapping below are the same as the CsvButton
 * `rows`/`cols` on app/[locale]/(admin)/admin/accounting/receipts/page.tsx.
 *
 * recompname (company name) + customer name are PII → every full export is
 * audited via admin_export_log (logAdminExport).
 *
 * RBAC matches the page + getReceiptList: super / accounting.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { ReceiptTab } from "@/actions/admin/accounting-receipts";

// Safety cap for the "export all filtered" path. 10,000 comfortably covers a
// month-window receipt slice in one file while bounding the in-memory build.
// If a filtered slice ever exceeds this, the export flags `truncated`.
const EXPORT_CAP = 10000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Tab → rstatus filter value (or null for any) — mirrors accounting-receipts.ts.
const TAB_TO_RSTATUS: Record<ReceiptTab, string | null> = {
  recent: null,
  all: null,
  draft: "0",
  pending: "3",
  issued: "1",
  cancelled: "2",
};

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

function customerLabel(
  recompname: string | null,
  u: { userName: string | null; userLastName: string | null } | undefined,
  userid: string,
): string {
  const rec = (recompname ?? "").trim();
  if (rec) return rec;
  if (!u) return userid;
  const name = [u.userName, u.userLastName].filter(Boolean).join(" ").trim();
  return name || userid;
}

/** One CSV row for the receipts export (matches the on-screen columns). */
export type ReceiptExportRow = Record<string, string | number | null | undefined>;

/** Active filters the page passes through (mirrors the page's searchParams). */
export type ReceiptsExportFilter = {
  tab?: ReceiptTab;
  dateFrom?: string; // 'YYYY-MM-DD'
  dateTo?: string; // 'YYYY-MM-DD'
  search?: string; // ilike on rid, userid, recompname
};

/**
 * Export the ENTIRE filtered receipt list (all pages, capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button on /admin/accounting/receipts.
 * Reuses the page's exact filtered `tb_receipt` query (tab + date + search +
 * ordering), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportReceiptsAll(
  filter: ReceiptsExportFilter,
): Promise<{ rows: ReceiptExportRow[]; truncated: boolean }> {
  // RBAC — same roles the page + getReceiptList gate on.
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();

  const tab: ReceiptTab = filter.tab ?? "recent";
  const search = (filter.search ?? "").trim();
  const range = defaultDateRange();
  const dateFrom = filter.dateFrom && DATE_RE.test(filter.dateFrom) ? filter.dateFrom : range.from;
  const dateTo = filter.dateTo && DATE_RE.test(filter.dateTo) ? filter.dateTo : range.to;
  const dateToInclusive = `${dateTo}T23:59:59`;

  // EXACT same filtered query as getReceiptList — only the .range() differs
  // (no 10-row window; one capped page instead).
  let q = admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, rdatecreate, rstatus, userid, ramount, " +
        "totalbeforewithholding, recompname, corporatetype",
    );

  if (tab === "recent") {
    q = q.order("rdatecreate", { ascending: false, nullsFirst: false });
  } else {
    const rstatusFilter = TAB_TO_RSTATUS[tab];
    if (rstatusFilter) q = q.eq("rstatus", rstatusFilter);
    q = q
      .gte("rdate", dateFrom)
      .lte("rdate", dateToInclusive)
      .order("rdate", { ascending: false, nullsFirst: false });
  }

  if (search) {
    const term = search.replace(/[\\%_,]/g, (m) => "\\" + m);
    q = q.or(`rid.ilike.%${term}%,userid.ilike.%${term}%,recompname.ilike.%${term}%`);
  }

  q = q.range(0, EXPORT_CAP - 1);

  type RawReceipt = {
    id: number;
    rid: string;
    refid: string | null;
    rdate: string | null;
    rdatecreate: string | null;
    rstatus: string;
    userid: string;
    ramount: number | string | null;
    totalbeforewithholding: number | string | null;
    recompname: string | null;
    corporatetype: string | null;
  };

  const { data: receiptRows, error: rcErr } = await q;
  if (rcErr) {
    console.error(`[exportReceiptsAll] tb_receipt query failed`, {
      code: rcErr.code,
      message: rcErr.message,
    });
    return { rows: [], truncated: false };
  }
  const receipts = (receiptRows ?? []) as unknown as RawReceipt[];

  // IN-batch users join (same hydration as getReceiptList).
  const uniqUserIds = Array.from(new Set(receipts.map((r) => r.userid).filter(Boolean)));
  const userMap = new Map<string, { userName: string | null; userLastName: string | null }>();
  if (uniqUserIds.length > 0) {
    const { data: userRows, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", uniqUserIds);
    if (uErr) {
      console.error(`[exportReceiptsAll] tb_users IN-batch failed`, {
        code: uErr.code,
        message: uErr.message,
      });
    }
    for (const u of (userRows ?? []) as Array<{
      userID: string;
      userName: string | null;
      userLastName: string | null;
    }>) {
      userMap.set(u.userID, { userName: u.userName, userLastName: u.userLastName });
    }
  }

  // Per-row item counts via tb_receipt_item IN-batch (same as getReceiptList).
  const ridList = receipts.map((r) => r.rid).filter(Boolean);
  const itemCountByRid = new Map<string, number>();
  if (ridList.length > 0) {
    const { data: items, error: itErr } = await admin
      .from("tb_receipt_item")
      .select("rid")
      .in("rid", ridList);
    if (itErr) {
      console.error(`[exportReceiptsAll] tb_receipt_item count failed`, {
        code: itErr.code,
        message: itErr.message,
      });
    }
    for (const it of (items ?? []) as Array<{ rid: string }>) {
      itemCountByRid.set(it.rid, (itemCountByRid.get(it.rid) ?? 0) + 1);
    }
  }

  // SAME column keys/value-mapping as the page CsvButton.
  const rows: ReceiptExportRow[] = receipts.map((r) => {
    const tb = toNumber(r.totalbeforewithholding);
    const amt = toNumber(r.ramount);
    return {
      rid: r.rid,
      refid: r.refid ?? "",
      customer: customerLabel(r.recompname, userMap.get(r.userid), r.userid),
      userid: r.userid,
      corporate: r.corporatetype === "1" ? "นิติบุคคล" : "ทั่วไป",
      rdate: r.rdate ? r.rdate.slice(0, 10) : "",
      total_before_wht: tb.toFixed(2),
      wht: (tb - amt).toFixed(2),
      ramount: amt.toFixed(2),
      status:
        r.rstatus === "1"
          ? "ออกแล้ว"
          : r.rstatus === "2"
            ? "ยกเลิก"
            : r.rstatus === "3"
              ? "รอชำระ"
              : r.rstatus === "0"
                ? "ร่าง"
                : r.rstatus,
      item_count: itemCountByRid.get(r.rid) ?? 0,
    };
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "acc-receipts",
    filters: { tab, dateFrom, dateTo, search },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
