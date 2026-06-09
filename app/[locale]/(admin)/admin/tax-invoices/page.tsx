/**
 * /admin/tax-invoices — redirect to /admin/accounting/etax.
 *
 * ── 2026-06-09 — consolidated onto the live tb_* store ──
 *   This page USED to read the World-A `tax_invoices` table (migration 0034) —
 *   the rebuilt/profiles-based store that is 0-row on prod and has NO live
 *   producer: every real ใบกำกับภาษี is issued into the tb_*-native stores
 *   (tb_forwarder_tax_invoice · tb_shop_tax_invoice, keyed on serial_no) by the
 *   customer request flow + the post-payment auto-receipt hook. So this list
 *   (and its `[id]` detail) showed a permanently-empty dead twin while the real
 *   issued invoices lived elsewhere — an ADR-0027 amber banner already redirected
 *   staff to /admin/accounting/etax, the live tb_* e-Tax hub (reads BOTH lanes:
 *   getEtaxBundle = forwarder, getShopEtaxBundle = shop/yuan).
 *
 *   Rather than rebuild this surface as a second two-store-union view (it would
 *   duplicate /admin/accounting/etax · §12 no-duplication), the World-A read is
 *   retired: this route now redirects to the live hub. Every inbound link from
 *   the other accounting pages + bookmarks lands on real data. The etax gate was
 *   widened to keep the Doc roles (freight_export_doc/freight_import_doc) reach
 *   (§0d) that the 2026-06-05 ops-workflow audit granted them here.
 *
 *   Trade-off accepted (owner call 2026-06-09): the World-A management buttons
 *   (issue/cancel/credit-note/wht on the [id] page) operated ONLY on the dead
 *   `tax_invoices` twin (issueTaxInvoice is UPDATE-only; the only INSERT is the
 *   credit-note clone) — they never managed a real invoice, so retiring them
 *   loses no live capability. The real issuance path is the tb_* one.
 *
 *   STILL on the dead twin (separate follow-ups, intentionally NOT in this diff):
 *     - /admin/accounting/documents (issued count + Σ) + /admin/search (also
 *       queries a non-existent `invoice_no` column) — display-only stale reads.
 *     - actions/admin/accounting-periods.ts buildCloseSnapshots — reads the dead
 *       twin and FREEZES a wrong 0-count/0-sum into an IMMUTABLE period_close_event
 *       snapshot. That is an accountant decision (+ a backfill call for already
 *       closed periods) — flagged for the owner, deliberately untouched here.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminTaxInvoicesRedirect() {
  redirect("/admin/accounting/etax");
}
