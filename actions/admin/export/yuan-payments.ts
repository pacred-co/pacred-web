"use server";

/**
 * /admin/yuan-payments — "export all filtered" CSV action (owner directive 2026-06-07).
 *
 * Mirrors the /admin/leads golden reference (actions/admin/leads.ts → exportLeadsAll).
 * The yuan-payments list query is INLINE in page.tsx, so this helper replicates
 * the page's WHERE/sort filter BYTE-FOR-BYTE — the ONLY difference is no
 * pagination (one capped page of up to EXPORT_CAP instead of the 50-row window).
 * Any drift from the on-screen rows would be a bug; keep this in lock-step with
 * the page's filter block (status tab · q · 60-day default window · sort).
 *
 * Columns + value-mapping are identical to the page's CsvButton (PAYTYPE_LABEL,
 * STATUS_LABEL, toFixed precision) so the full export matches the page export
 * column-for-column.
 *
 * PII: customer name + tel join. Every "export all" writes an admin_export_log
 * audit row (best-effort).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { CsvRow } from "@/components/admin/csv-button";
import { logAdminExport } from "@/actions/admin/export-log";

// Safety cap for the "export all filtered" path. ~1,460 real payments live in
// tb_payment so 10,000 comfortably covers any filter slice in one file while
// bounding the in-memory build. If a slice ever exceeds this the export flags
// `truncated` so the operator knows to narrow the filter.
const EXPORT_CAP = 10000;

// ── Page-identical label maps (kept in lock-step with page.tsx) ──
const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const PAYTYPE_LABEL: Record<string, string> = {
  "1": "Alipay",
  "2": "Wechat",
  "3": "Union",
  "4": "USDT",
};

// Page-identical sort whitelist (page.tsx → YUAN_SORT_FIELDS).
const YUAN_SORT_FIELDS: Record<string, string> = {
  paydate: "paydate",
  userid: "userid",
  paytype: "paytype",
  payyuan: "payyuan",
  paythb: "paythb",
  payprofitthb: "payprofitthb",
  paystatus: "paystatus",
};

// Page-identical 60-day default-window helpers (page.tsx).
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The active filters the export should honour — exactly the page's URL params. */
export type YuanExportFilter = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  all?: string;
  sort?: string;
  dir?: string;
};

type PaymentRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  paytype: string | null;
  paydetail: string | null;
  payyuan: number | null;
  payrate: number | null;
  paythb: number | null;
  payprofitthb: number | null;
  paydateadmin: string | null;
  userid: string | null;
  adminid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

/**
 * Export the ENTIRE filtered yuan-payment list (all pages, capped at EXPORT_CAP)
 * as CSV rows for the "⬇ CSV ทั้งหมด" button. Replicates the page filter exactly
 * (page.tsx) so the export can never drift from the on-screen table. Writes an
 * admin_export_log audit row (PII walk-off trail).
 */
export async function exportYuanPaymentsAll(
  filter: YuanExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same role gate as the page (createAdminClient = RLS-bypass · PII surface).
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  // ── Page-identical date window (resolveDateWindow in page.tsx) ──
  let winFrom: string | null;
  let winTo: string | null;
  if (filter.all === "1") {
    winFrom = null;
    winTo = null;
  } else if (filter.from || filter.to) {
    winFrom = filter.from ?? null;
    winTo = filter.to ?? null;
  } else {
    winFrom = isoDaysAgo(60);
    winTo = todayIsoDate();
  }

  // ── Page-identical sort resolution ──
  const sortKey = filter.sort && YUAN_SORT_FIELDS[filter.sort] ? filter.sort : "paydate";
  const sortDir: "asc" | "desc" = filter.dir === "asc" ? "asc" : "desc";
  const sortColumn = YUAN_SORT_FIELDS[sortKey];

  // Same select + order as the page; only pagination differs — one capped slice
  // instead of the 50-row .range() window.
  let q = admin
    .from("tb_payment")
    .select(
      "id,paydate,paystatus,paytype,paydetail,payyuan,payrate,paythb,payprofitthb,paydateadmin,userid,adminid",
    )
    .order(sortColumn, { ascending: sortDir === "asc" })
    .range(0, EXPORT_CAP - 1);

  if (filter.status && /^[123]$/.test(filter.status)) q = q.eq("paystatus", filter.status);
  if (filter.q) {
    const term = filter.q.trim();
    if (/^\d+$/.test(term)) q = q.eq("id", Number(term));
    else q = q.eq("userid", term.toUpperCase());
  }
  if (winFrom) q = q.gte("paydate", winFrom);
  if (winTo) q = q.lte("paydate", winTo + "T23:59:59");

  const { data: rowsRaw, error } = await q;
  if (error) {
    console.error("[exportYuanPaymentsAll] tb_payment query failed:", error.message);
    return { rows: [], truncated: false };
  }
  const payRows = (rowsRaw ?? []) as unknown as PaymentRow[];

  // 2nd query — merge customer names from tb_users (same pattern as the page).
  const userIds = Array.from(
    new Set(payRows.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error("[exportYuanPaymentsAll] tb_users join failed:", usersErr.message);
    }
    userMap = new Map(
      ((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]),
    );
  }

  // ── Column-identical mapping to the page's CsvButton rows ──
  const rows: CsvRow[] = payRows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const fullName = u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "";
    const row: CsvRow = {
      id: r.id,
      paydate: r.paydate ?? "",
      userid: r.userid ?? "",
      customer: fullName,
      paytype: PAYTYPE_LABEL[r.paytype ?? ""] ?? r.paytype ?? "",
      payyuan: r.payyuan != null ? Number(r.payyuan).toFixed(2) : "",
      payrate: r.payrate != null ? Number(r.payrate).toFixed(4) : "",
      paythb: r.paythb != null ? Number(r.paythb).toFixed(2) : "",
      payprofitthb: r.payprofitthb != null ? Number(r.payprofitthb).toFixed(2) : "",
      status: STATUS_LABEL[r.paystatus ?? ""] ?? r.paystatus ?? "",
      detail: r.paydetail ?? "",
      paydateadmin: r.paydateadmin ?? "",
      adminid: r.adminid ?? "",
    };
    return row;
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "yuan-payments",
    filters: {
      status: filter.status ?? "all",
      q: filter.q ?? "",
      from: winFrom ?? "",
      to: winTo ?? "",
      all: filter.all ?? "",
      sort: sortKey,
      dir: sortDir,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
