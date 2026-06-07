"use server";

/**
 * Export-all (CSV) for /admin/accounting/periods — the monthly accounting-period
 * closing rollup (V-E9 · legacy freight-monthly-closing).
 *
 * The page (app/[locale]/(admin)/admin/accounting/periods/page.tsx) renders a
 * fixed 24-month window (lastNYyyymm(24), most-recent-first). For each yyyymm it
 * shows: status (or "ยังไม่เปิดงวด"), the latest per-(period,table) close-event
 * snapshot for tax_invoices / freight_invoices / freight_invoice_payments,
 * closed-at date, and closed-by admin name. The page loads the WHOLE window in
 * one shot (no DB-level pagination), so this export re-runs the EXACT same two
 * queries + the same in-app bucketing, then maps the same 24 window rows.
 *
 * DRIFT-FREE: re-runs the page's exact filtered queries —
 *   accounting_periods  .gte(period_yyyymm, oldest).lte(period_yyyymm, newest)
 *                        .order(period_yyyymm desc)  + the profiles!closed_by_admin_id join
 *   period_close_event  .gte/.lte same window  .order(closed_at desc)  (latest per (period,table) wins)
 * over the same lastNYyyymm(24) window the page derives. The CSV columns mirror
 * the page's <thead> 1:1. Writes an admin_export_log audit row.
 *
 * RBAC matches the page: super / accounting / ops (ops read-only).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import {
  ACCOUNTING_PERIOD_STATUS_LABEL,
  type AccountingPeriodStatus,
  lastNYyyymm,
  currentYyyymm,
} from "@/lib/validators/accounting-period";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap (mirrors the standard export pattern). The 24-month window is far
// under this, but we keep the cap + truncation flag for consistency.
const EXPORT_CAP = 10000;

type PeriodRow = {
  period_yyyymm: string;
  status: AccountingPeriodStatus;
  opened_at: string;
  closing_marked_at: string | null;
  closed_at: string | null;
  closing_notes: string | null;
  closed_by_profile:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
};

type EventRow = {
  period_yyyymm: string;
  table_name: string;
  row_count: number;
  sum_thb: number | null;
};

/** Thai BE month-year display — mirrors the page's formatYyyymm. */
function formatYyyymm(yyyymm: string): string {
  const year = yyyymm.slice(0, 4);
  const month = yyyymm.slice(4, 6);
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  const m = Number.parseInt(month, 10);
  const monthName = monthNames[m - 1] ?? month;
  const beYear = Number.parseInt(year, 10) + 543;
  return `${monthName} ${beYear}`;
}

/** Mirrors the page's profileName. */
function profileName(p: PeriodRow["closed_by_profile"]): string {
  if (!p) return "—";
  const single = Array.isArray(p) ? p[0] : p;
  if (!single) return "—";
  return `${single.first_name ?? ""} ${single.last_name ?? ""}`.trim() || "—";
}

/** Mirrors the page's thb() money formatter. */
function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

/** Active filters (the page derives its own fixed 24-month window — no inputs). */
export type AccPeriodsExportFilter = {
  /** Window size in months (the page hardcodes 24). */
  months?: number;
};

/**
 * Export the full accounting-period rollup window (default last 24 months) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Re-runs the page's exact two queries
 * + in-app bucketing, maps the same window rows, and writes an admin_export_log
 * audit row.
 */
export async function exportAccPeriodsAll(
  filter: AccPeriodsExportFilter = {},
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // RBAC mirrors the page: super / accounting / ops.
  await requireAdmin(["super", "accounting", "ops"]);

  const months = filter.months ?? 24;
  const admin = createAdminClient();

  const window = lastNYyyymm(months);
  const oldest = window[window.length - 1];
  const newest = window[0];

  // ── Pass 1: accounting_periods rows (SAME query as the page) ─────
  const { data: periodsRaw, error: periodsRawErr } = await admin
    .from("accounting_periods")
    .select(`
      period_yyyymm, status, opened_at, closing_marked_at, closed_at, closing_notes,
      closed_by_profile:profiles!closed_by_admin_id ( first_name, last_name )
    `)
    .gte("period_yyyymm", oldest)
    .lte("period_yyyymm", newest)
    .order("period_yyyymm", { ascending: false });
  if (periodsRawErr) {
    console.error(`[exportAccPeriodsAll accounting_periods] failed`, {
      code: periodsRawErr.code,
      message: periodsRawErr.message,
    });
  }
  const periods = (periodsRaw ?? []) as unknown as PeriodRow[];
  const periodMap = new Map<string, PeriodRow>(periods.map((p) => [p.period_yyyymm, p]));

  // ── Pass 2: period_close_event snapshots (SAME query + bucketing) ──
  const { data: eventsRaw, error: eventsRawErr } = await admin
    .from("period_close_event")
    .select("period_yyyymm, table_name, row_count, sum_thb, closed_at")
    .gte("period_yyyymm", oldest)
    .lte("period_yyyymm", newest)
    .order("closed_at", { ascending: false });
  if (eventsRawErr) {
    console.error(`[exportAccPeriodsAll period_close_event] failed`, {
      code: eventsRawErr.code,
      message: eventsRawErr.message,
    });
  }
  type EventRowWithTs = EventRow & { closed_at: string };
  const events = (eventsRaw ?? []) as EventRowWithTs[];
  const eventMap = new Map<string, Map<string, EventRow>>();
  for (const e of events) {
    if (!eventMap.has(e.period_yyyymm)) eventMap.set(e.period_yyyymm, new Map());
    const inner = eventMap.get(e.period_yyyymm);
    // Latest per (period, table) wins (events ordered closed_at desc).
    if (inner && !inner.has(e.table_name)) {
      inner.set(e.table_name, e);
    }
  }

  const now = currentYyyymm();

  // SAME row mapping the page renders — one CSV row per window month.
  const rows: CsvRow[] = window.map((yyyymm) => {
    const p = periodMap.get(yyyymm);
    const ev = eventMap.get(yyyymm);
    const taxRow = ev?.get("tax_invoices");
    const freightRow = ev?.get("freight_invoices");
    const payRow = ev?.get("freight_invoice_payments");

    const row: CsvRow = {
      period_label: formatYyyymm(yyyymm) + (yyyymm === now ? " (เดือนปัจจุบัน)" : ""),
      period_yyyymm: yyyymm,
      status: p ? ACCOUNTING_PERIOD_STATUS_LABEL[p.status] : "ยังไม่เปิดงวด",
      tax_count: taxRow ? `${taxRow.row_count} ใบ` : "—",
      tax_sum: taxRow ? thb(taxRow.sum_thb) : "—",
      freight_count: freightRow ? `${freightRow.row_count} ใบ` : "—",
      freight_sum: freightRow ? thb(freightRow.sum_thb) : "—",
      pay_count: payRow ? `${payRow.row_count} ครั้ง` : "—",
      pay_sum: payRow ? thb(payRow.sum_thb) : "—",
      closed_at: p?.closed_at ? p.closed_at.slice(0, 10) : "—",
      closed_by: p?.closed_at ? profileName(p.closed_by_profile) : "—",
    };
    return row;
  });

  const truncated = rows.length > EXPORT_CAP;

  await logAdminExport({
    dataset: "acc-periods",
    filters: { months, oldest, newest },
    rowCount: rows.length,
    truncated,
  });

  return { rows: truncated ? rows.slice(0, EXPORT_CAP) : rows, truncated };
}
