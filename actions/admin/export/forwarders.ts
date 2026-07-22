"use server";

/**
 * /admin/forwarders — "export ทั้งหมด" (export-all filtered) CSV action.
 *
 * Owner directive 2026-06-07: every admin list page can export the ENTIRE
 * filtered result set (not just the 50-row page), and every full export is
 * audited in admin_export_log (migration 0147 · who / dataset / filters /
 * rowCount / when). This is a sensitive surface — the export carries customer
 * PII (name + phone) + money columns (ราคารวม / ยอดค้างชำระ).
 *
 * DRIFT-FREE: this reuses the page's EXACT filtered query via the shared
 * `fetchForwarderList(... { exportAll: true })`. The only difference vs the
 * on-screen rows is no pagination (one capped page of up to
 * FORWARDER_EXPORT_CAP rows). The column set + value-mapping below mirror the
 * page's CsvButton `rows`/`cols` byte-for-byte.
 *
 * Placement: co-located under actions/admin/export/ per the parallel-edit-race
 * guard — only this file + the forwarders page are touched.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  fetchForwarderList,
  FORWARDER_EXPORT_CAP,
  type SearchParams,
} from "@/app/[locale]/(admin)/admin/forwarders/page";
import { isForwarderPaid } from "@/lib/forwarder/outstanding";

// The filter shape the page passes through (a subset of its SearchParams that
// affects the result set). Kept narrow so the inline closure on the page can
// hand us exactly the active filters.
export type ForwarderExportFilter = {
  status?: string;
  q?: string;
  q_multi?: string;
  create?: string;
  mode?: string;
  date_from?: string;
  date_to?: string;
  service?: string;
  container?: string;
  all?: string;
  purchaser?: string;   // owner ④ — filter by assigned ผู้สั่งซื้อ (tb_admin.adminID)
};

// Mirror the page's resolveDateWindow() exactly so the export's date filter ==
// the page's date filter (the page applies a default 30-day window unless
// ?all=1 or an explicit from/to is present; a keyword search bypasses it).
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function resolveDateWindow(f: ForwarderExportFilter): {
  from: string | null;
  to: string | null;
  isDefault: boolean;
} {
  if (f.all === "1") return { from: null, to: null, isDefault: false };
  if (f.date_from || f.date_to)
    return { from: f.date_from ?? null, to: f.date_to ?? null, isDefault: false };
  return { from: isoDaysAgo(30), to: todayIsoDate(), isDefault: true };
}

// Legacy status labels — same map the page uses for its CSV `status` column.
const STATUS_LABEL: Record<string, string> = {
  "1":   "รอเข้าโกดังจีน",
  "2":   "ถึงโกดังจีนแล้ว",
  "3":   "กำลังส่งมาไทย",
  "4":   "ถึงไทยแล้ว",
  "5":   "รอชำระเงิน",
  "6":   "เตรียมส่ง",
  "6.1": "กำลังจัดส่ง",
  "7":   "ส่งแล้ว",
  "c":   "เครติดสินค้า",
  "p":   "สถานะพิเศษ",
  "99":  "พิเศษ",
};
const MODE_LABEL: Record<string, string> = {
  "1": "🚛 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

/**
 * Export the FULL filtered forwarder list (all pages, capped) as CSV rows.
 * Audited via admin_export_log. The page wires this into CsvButton.fetchAll.
 */
export async function exportForwardersAll(
  filter: ForwarderExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same role gate as the page (super/ops/accounting via requireAdmin(["ops",
  // "accounting"])). super passes the ["ops","accounting"] check too. A
  // `purchaser`-only viewer is NOT in this set → 404 here (they cannot export
  // all · they only get their auto-scoped on-screen list).
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();
  const dateWindow = resolveDateWindow(filter);

  // Reuse the EXACT page query — exportAll skips pagination + cover-URL work.
  // owner ④ — honor a ?purchaser= filter so the export mirrors the on-screen list.
  const { rows: dataRows, forwarderErr } = await fetchForwarderList(
    admin,
    // ForwarderExportFilter is a subset of SearchParams (the result-affecting
    // fields); fetchForwarderList ignores the page-only/label-only extras.
    filter as SearchParams,
    dateWindow,
    { exportAll: true, purchaserScope: filter.purchaser?.trim() || null },
  );

  if (forwarderErr) {
    console.error("[exportForwardersAll] fetch failed:", forwarderErr.message);
    return { rows: [], truncated: false };
  }

  // Map to the SAME CSV column keys/value-mapping the page's CsvButton uses.
  const rows: CsvRow[] = (dataRows ?? []).map((r): CsvRow => ({
    id: r.id,
    f_no_cargo: r.f_no_cargo ?? "",
    status: STATUS_LABEL[r.status] ?? r.status,
    transport: MODE_LABEL[r.transport_type] ?? r.transport_type,
    warehouse_china: r.warehouse_china ?? "",
    partner_warehouse: r.partner_warehouse ?? "",
    cabinet: r.cabinet_number ?? "",
    tracking_chn: r.tracking_chn ?? "",
    tracking_th: r.tracking_th ?? "",
    userid: r.customer?.userid ?? "",
    customer: r.customer?.name ?? "",
    phone: r.customer?.phone ?? "",
    customer_flags: [
      r.customer?.is_juristic ? "นิติฯ" : "",
      r.customer?.is_corporate ? "นิติบุคคล" : "",
      r.customer?.is_svip ? "เรทเฉพาะตัว" : "",
      r.customer?.coid ?? "",
    ].filter(Boolean).join(" / "),
    sales_rep: r.customer?.sale_admin ?? "",
    amount_count: r.amount_count,
    weight_kg: r.weight_kg.toFixed(2),
    volume_cbm: r.volume_cbm.toFixed(4),
    total_price: r.total_price.toFixed(2),
    outstanding_thb: r.outstanding_thb.toFixed(2),
    // ชำระแล้ว label — shared isForwarderPaid (ภูม 2026-07-22): paydeposit='1' OR
    // shipped/done (fstatus 6/7/8) EXCEPT a credit row (นิติ+เครดิต sits at 6 unpaid).
    // Same predicate the screen outstanding uses now → CSV label == screen. LABEL ONLY.
    paydeposit: isForwarderPaid(r.paydeposit, r.status, r.fcredit) ? "ชำระแล้ว" : "",
    fcredit: r.fcredit === "1" ? "เครดิต" : "",
    created_at: r.created_at,
    date_status2: r.date_status2 ?? "",
    date_status3: r.date_status3 ?? "",
    date_status4: r.date_status4 ?? "",
    eta_base: r.eta_base ?? "",
    pallet: r.pallet ?? "",
    admin_id_last: r.admin_id_last ?? "",
    admin_creator: r.admin_creator ?? "",
    note: r.note ?? "",
  }));

  const truncated = rows.length >= FORWARDER_EXPORT_CAP;

  // Audit the full export (best-effort — never blocks the download).
  const { logAdminExport } = await import("@/actions/admin/export-log");
  await logAdminExport({
    dataset: "forwarders",
    filters: {
      status: filter.status ?? null,
      q: filter.q ?? null,
      q_multi: filter.q_multi ?? null,
      create: filter.create ?? null,
      mode: filter.mode ?? null,
      date_from: filter.date_from ?? null,
      date_to: filter.date_to ?? null,
      service: filter.service ?? null,
      container: filter.container ?? null,
      all: filter.all ?? null,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
