"use server";

/**
 * Export-all (CSV) for /admin/accounting/quote-compare — the Sales forward-looking
 * pricing comparison tool (9 partner carriers for ONE quote spec).
 *
 * The page (app/[locale]/(admin)/admin/accounting/quote-compare/page.tsx) takes a
 * quote spec via GET params (warehouse · transport · productType · basis · weight ·
 * volume · optional customer userid) and renders getQuoteComparison(input).carriers
 * as a 7-column table (Carrier · Cost rate · ต้นทุน Pacred · ขายลูกค้า · กำไร · % ·
 * สถานะ), sorted active-first then by margin desc.
 *
 * The on-screen "⬇ CSV หน้านี้" downloads the already-loaded 9 rows. This action
 * backs the "⬇ CSV ทั้งหมด" button — it re-runs getQuoteComparison with the EXACT
 * SAME input the page used, so the export is drift-free by construction (the page
 * loads the full carrier list in-memory; there is no DB-level pagination here).
 * Then it writes an admin_export_log audit row (the quote spec = the filter).
 *
 * DRIFT-FREE: same getQuoteComparison(input) the page calls + the same active-first
 * / margin-desc sort the <tbody> applies + the same column keys/labels as the page's
 * CsvButton cols. The CAP guard is N/A (always 9 carriers) but EXPORT_CAP is kept
 * for shape-parity with the proven pattern.
 *
 * RBAC matches the page: super / accounting / sales_admin (ADR-0006 §1.4).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { getQuoteComparison, type QuoteInput, type QuoteCarrierLine } from "@/actions/admin/quote-comparison";
import type { CsvRow } from "@/components/admin/csv-button";

// Shape-parity safety cap (the carrier list is always 9 rows, so never hit).
const EXPORT_CAP = 10000;

/** Legacy `number_format($n, 2)` — "1,234.56" thousand-grouped (matches the page). */
function thb(n: number): string {
  if (Number.isNaN(n)) return "0.00";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Same status-bucket Thai labels the page renders (BUCKET_LABEL on the page).
const BUCKET_LABEL: Record<QuoteCarrierLine["bucket"], string> = {
  "negative": "ขาดทุน",
  "low":      "ต่ำ (0-5k)",
  "mid":      "กลาง (5-10k)",
  "good":     "ดี (10-15k)",
  "over_cap": "เกิน cap",
};

/**
 * Export the full per-carrier comparison for the given quote spec as CSV rows.
 * Re-runs the page's exact getQuoteComparison(input), applies the same table sort,
 * maps to the same column keys, and writes an admin_export_log audit row.
 */
export async function exportAccQuoteCompareAll(
  input: QuoteInput,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as the page.
  await requireAdmin(["super", "accounting", "sales_admin"]);

  const report = await getQuoteComparison(input);

  // Same active-first / margin-desc ordering the page's <tbody> applies.
  const sorted = [...report.carriers].sort((a, b) => {
    if (a.hasRate !== b.hasRate) return a.hasRate ? -1 : 1;
    return b.margin - a.margin;
  });

  const all = sorted;
  const truncated = all.length > EXPORT_CAP;
  const carriers = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME columns the page table shows; "ขายลูกค้า" is the report-level sale subtotal.
  const rows: CsvRow[] = carriers.map((c) => ({
    carrier:      c.carrierLabel + (c.hasRate ? "" : " (no rate)"),
    cost_rate:    c.costRate > 0 ? thb(c.costRate) : "—",
    cost_subtotal: c.hasRate ? thb(c.costSubtotal) : "—",
    sale_subtotal: thb(report.saleSubtotal),
    margin:       c.hasRate ? thb(c.margin) : "—",
    margin_pct:   c.hasRate ? `${c.marginPct.toFixed(1)}%` : "—",
    status:       c.hasRate ? BUCKET_LABEL[c.bucket] : "—",
  }));

  await logAdminExport({
    dataset: "acc-quote-compare",
    filters: {
      warehouse:      input.warehouse,
      transport:      input.transport,
      productType:    input.productType,
      basis:          input.basis,
      weightKg:       input.weightKg,
      volumeCbm:      input.volumeCbm,
      customerUserid: input.customerUserid ?? null,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
