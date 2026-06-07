"use server";

/**
 * Export-all (CSV) for /admin/wht — the WHT (ใบ 50 ทวิ) chase queue.
 *
 * The page (app/[locale]/(admin)/admin/wht/page.tsx) lists withholding_tax_entries
 * rows filtered by the single `status` chip (pending / received / waived / all),
 * joined to profiles for the customer name, ordered by created_at (ASC when
 * chasing pending so oldest-first surfaces; DESC otherwise). It paginates 50/page.
 * The on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action backs
 * the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered status — then writes an
 * admin_export_log audit row (PII: customer name · MONEY).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("cert_status", status)   // omitted when status === "all"
 *   .order("created_at", { ascending: status === "pending" })
 * plus the same profiles name join. The CSV columns mirror the page's CsvButton
 * cols 1:1. Capped at EXPORT_CAP, unpaginated.
 *
 * RBAC matches the page: super / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * `status` filter.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

const STATUS_LABEL: Record<string, string> = {
  pending: "รอใบ 50 ทวิ",
  received: "ได้รับใบแล้ว",
  waived: "ไม่ขอใบ",
};

/** thb() — mirrors the page's number formatter (th-TH, 2 fraction digits). */
function thb(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Days since `iso` — used for the "อายุ" (aged days) chase signal (mirrors page). */
function ageDays(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - Date.parse(iso);
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

type EntryRaw = {
  id: string;
  cert_status: "pending" | "received" | "waived";
  cert_number: string | null;
  gross_invoice_thb: number;
  wht_base_thb: number;
  wht_rate_pct: number;
  wht_amount_thb: number;
  net_expected_thb: number;
  cert_received_at: string | null;
  waived_reason: string | null;
  order_h_no: string | null;
  forwarder_f_no: string | null;
  tax_invoice_id: string | null;
  created_at: string;
  profile_id: string;
  profile:
    | {
        member_code: string | null;
        first_name: string | null;
        last_name: string | null;
        company_name: string | null;
      }
    | Array<{
        member_code: string | null;
        first_name: string | null;
        last_name: string | null;
        company_name: string | null;
      }>
    | null;
};

export type WhtExportStatus = "pending" | "received" | "waived" | "all";

/** Active filter the page passes through (the resolved status chip). */
export type WhtExportFilter = {
  status: WhtExportStatus;
};

/**
 * Export the entire filtered WHT chase queue (the resolved `status`, capped at
 * EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact
 * filtered query (cert_status + ordering + the profiles name join), unpaginated.
 * Writes an admin_export_log audit row.
 */
export async function exportWhtAll(
  filter: WhtExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // RBAC matches the page: super + accounting.
  await requireAdmin(["super", "accounting"]);

  const status = filter.status;
  const admin = createAdminClient();

  const baseQuery = admin
    .from("withholding_tax_entries")
    .select(
      `id, cert_status, cert_number, gross_invoice_thb, wht_base_thb, wht_rate_pct,
       wht_amount_thb, net_expected_thb, cert_received_at, waived_reason,
       order_h_no, forwarder_f_no, tax_invoice_id, created_at, profile_id,
       profile:profiles!withholding_tax_entries_profile_id_fkey(member_code, first_name, last_name, company_name)`,
    )
    .order("created_at", { ascending: status === "pending" })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  const { data: rawRows, error } =
    status === "all" ? await baseQuery : await baseQuery.eq("cert_status", status);

  if (error) {
    console.error(`[exportWhtAll withholding_tax_entries] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rawRows ?? []) as unknown as EntryRaw[];
  const truncated = all.length > EXPORT_CAP;
  const entries = truncated ? all.slice(0, EXPORT_CAP) : all;

  const rows: CsvRow[] = entries.map((r) => {
    const prof = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    const customerLabel =
      prof?.company_name?.trim() ||
      [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() ||
      "—";
    const jobCode = r.order_h_no || r.forwarder_f_no || "—";
    const aged = r.cert_status === "pending" ? `${ageDays(r.created_at)}d` : "—";
    const row: CsvRow = {
      customer: customerLabel,
      member_code: prof?.member_code ?? "",
      job: jobCode,
      gross: thb(r.gross_invoice_thb),
      wht_rate: `${Number(r.wht_rate_pct).toFixed(2)}%`,
      wht_amount: thb(r.wht_amount_thb),
      net_expected: thb(r.net_expected_thb),
      status: STATUS_LABEL[r.cert_status] ?? r.cert_status,
      cert_number: r.cert_status === "received" ? r.cert_number ?? "" : "",
      age: aged,
    };
    return row;
  });

  await logAdminExport({
    dataset: "wht",
    filters: { status },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
