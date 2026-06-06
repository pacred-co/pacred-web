"use server";

/**
 * "Export all filtered" CSV for /admin/accounting/wht-certs (owner directive
 * 2026-06-07 — accounting wants the 50-ทวิ reconciliation list in a spreadsheet).
 *
 * The page renders its table from `getWhtCertQueue` (actions/admin/wht-cert.ts),
 * which reads `tb_forwarder_wht_entry` capped at 500 rows + hydrates the invoice
 * serial. This action re-runs the EXACT same filtered query (same `status` tab +
 * same `userid` filter + same ordering) UNPAGINATED (one capped page up to
 * EXPORT_CAP) so the export can never drift from the on-screen table. The CSV
 * columns + value-mapping below are byte-for-byte the same as the CsvButton
 * `rows`/`cols` on the page.
 *
 * userid + WHT amounts are customer/financial data → every full export is
 * audited via admin_export_log (logAdminExport).
 *
 * RBAC matches the page (ADR-0006 §1.4): super | accounting.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";

// Safety cap for the "export all filtered" path. 10,000 comfortably covers the
// whole tb_forwarder_wht_entry table in one file while bounding the in-memory
// build. If a filtered slice ever exceeds this, the export flags `truncated`.
const EXPORT_CAP = 10000;

const STATUS_LABEL: Record<string, string> = {
  pending:  "รอ cert",
  received: "ได้รับแล้ว",
  waived:   "ยกเว้น",
};
const CLASS_LABEL: Record<string, string> = {
  transport: "ค่าขนส่ง (1%)",
  service:   "ค่าบริการ (3%)",
  rental:    "ค่าเช่า (5%)",
  goods:     "สินค้า (0%)",
};

function thb(n: number): string {
  return Number(n).toFixed(2);
}

/** One CSV row for the wht-certs export (matches the on-screen columns). */
export type WhtCertExportRow = Record<string, string | number | null | undefined>;

/** Active filters the page passes through (mirrors the page's searchParams). */
export type WhtCertsExportFilter = {
  /** Status tab; "all" = every status. */
  status?: string | null;
  /** Customer id filter (optional). */
  userid?: string | null;
};

type Raw = {
  id:              number;
  invoice_id:      number | null;
  userid:          string;
  wht_class:       string;
  wht_base_thb:    number | string | null;
  wht_rate_pct:    number | string | null;
  wht_amount_thb:  number | string | null;
  cert_status:     string;
  cert_number:     string | null;
  cert_received_at: string | null;
  created_at:      string;
};

/**
 * Export the ENTIRE filtered 50-ทวิ list (all rows, capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button on /admin/accounting/wht-certs. Reuses the
 * page's exact filtered tb_forwarder_wht_entry query (status + userid + ordering),
 * unpaginated, and hydrates the invoice serial the same way the page does. Writes
 * an admin_export_log audit row.
 */
export async function exportWhtCertsAll(
  filter: WhtCertsExportFilter,
): Promise<{ rows: WhtCertExportRow[]; truncated: boolean }> {
  // RBAC — same roles the page gates on.
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();

  // Normalise the same way the page does: anything not received/waived/all
  // collapses to "pending".
  const raw = filter.status ?? "";
  const status =
    raw === "received" || raw === "waived" || raw === "all" ? raw : "pending";
  const userid = (filter.userid ?? "").trim() || undefined;

  // EXACT same filtered query as getWhtCertQueue — only the .limit() differs
  // (EXPORT_CAP instead of 500) so the export can't drift from the table.
  let query = admin
    .from("tb_forwarder_wht_entry")
    .select(
      "id, invoice_id, userid, wht_class, wht_base_thb, wht_rate_pct, wht_amount_thb, " +
      "cert_status, cert_number, cert_received_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(EXPORT_CAP);

  if (status !== "all") query = query.eq("cert_status", status);
  if (userid) query = query.eq("userid", userid);

  const { data: rowsRaw, error } = await query;
  if (error) {
    console.error("[exportWhtCertsAll] tb_forwarder_wht_entry query failed", {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const entries = ((rowsRaw ?? []) as unknown as Raw[]) ?? [];

  // Hydrate invoice serial — batched IN query (same as the page action).
  const invoiceIds = Array.from(
    new Set(entries.map((r) => r.invoice_id).filter((v): v is number => v != null)),
  );
  const serialByInvoice = new Map<number, string | null>();
  if (invoiceIds.length > 0) {
    type InvRow = { id: number; serial_no: string | null };
    const { data: invRaw, error: invErr } = await admin
      .from("tb_forwarder_tax_invoice")
      .select("id, serial_no")
      .in("id", invoiceIds);
    if (invErr) {
      console.error("[exportWhtCertsAll] invoice hydrate failed", {
        code: invErr.code,
        message: invErr.message,
      });
    }
    for (const i of ((invRaw ?? []) as unknown as InvRow[])) {
      serialByInvoice.set(i.id, i.serial_no);
    }
  }

  // SAME column keys/labels/value-mapping as the page CsvButton.
  const rows: WhtCertExportRow[] = entries.map((r) => {
    const invoiceSerial =
      r.invoice_id != null
        ? (serialByInvoice.get(r.invoice_id) ?? `TI-${r.invoice_id}`)
        : "—";
    return {
      userid:        r.userid,
      invoice:       invoiceSerial,
      wht_class:     CLASS_LABEL[r.wht_class] ?? r.wht_class,
      base_thb:      thb(Number(r.wht_base_thb ?? 0)),
      rate_pct:      Number(r.wht_rate_pct ?? 0).toFixed(2),
      wht_thb:       thb(Number(r.wht_amount_thb ?? 0)),
      cert_status:   STATUS_LABEL[r.cert_status] ?? r.cert_status,
      cert_number:   r.cert_number ?? "",
      created_at:    r.created_at ? r.created_at.slice(0, 10) : "",
    };
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "acc-wht-certs",
    filters: { status, userid: userid ?? "" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
