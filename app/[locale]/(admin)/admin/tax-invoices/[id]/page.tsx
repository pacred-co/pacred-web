/**
 * /admin/tax-invoices/[id] — redirect to /admin/accounting/etax.
 *
 * ── 2026-06-09 — consolidated onto the live tb_* store (see ../page.tsx) ──
 *   This detail screen read a single World-A `tax_invoices` row (+ its
 *   tax_invoice_lines / withholding_tax_entries children) by id. That `id` is a
 *   `tax_invoices.id` from the now-retired World-A list — it has no equivalent in
 *   the live tb_forwarder_tax_invoice / tb_shop_tax_invoice stores (separate
 *   bigserial sequences), so the screen + its PDF link could only ever resolve a
 *   dead-twin row. Its management buttons (issue/cancel/credit-note/wht) mutated
 *   only that dead twin and never touched a real issued invoice.
 *
 *   With the World-A list retired, nothing links here anymore; this stub
 *   redirects any bookmarked deep-link to the live e-Tax hub, which lists the
 *   real issued invoices (both forwarder + shop/yuan lanes) and streams their
 *   PDFs via /api/tax-invoice/[id]?store=… .
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminTaxInvoiceDetailRedirect() {
  redirect("/admin/accounting/etax");
}
