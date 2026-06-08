/**
 * /admin/accounting/forwarder-invoice — REDIRECT to /admin/accounting/receipts
 *
 * 2026-05-31 sitting-H-fix: the old Wave 29 list (3-status chips · F3 batch
 * 2026-05-29) is superseded by the new PEAK 7-tab list at
 * `/admin/accounting/receipts`. Owner directive 2026-05-30 (after PEAK DOM
 * paste): "เอาหน้าของใหม่ที่แกสร้าง ไปแทนของเก่าได้เลย".
 *
 * The OTHER routes under this path stay:
 *   - `/admin/accounting/forwarder-invoice/[id]` — Wave 29 mPDF print page
 *     (the row link from the new list points here for canonical receipt detail
 *     + print). Untouched.
 *   - `/admin/accounting/forwarder-invoice/add` — Wave 29 manual-issue form.
 *     Untouched.
 *
 * Why redirect instead of delete? Many existing breadcrumbs, audit log
 * entries, and external bookmarks point at this list URL. A redirect keeps
 * those alive while consolidating the canonical landing at /receipts.
 *
 * Per AGENTS.md §0a — design latitude allows reorganization · §0d reachability
 * preserved because the new list is wired into the same menubar leaves.
 */

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function ForwarderInvoiceListRedirect({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; date_from?: string; date_to?: string }>;
}) {
  // Keep the auth gate so direct visits hit the same accounting permission
  // surface (avoids a "redirect to login" loop when an unauth user lands here).
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles access the
  // receipts redirect target (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);

  const sp = await searchParams;

  // Translate old query params to the new list page's contract:
  //   old `status=pending|paid|cancelled` → new `tab=pending|issued|cancelled`
  //   old `q` → new `q`
  //   old `date_from`/`date_to` → same
  // The new list defaults to "recent" tab when no `tab` is given, which is fine
  // for visitors who hit /forwarder-invoice with no params.
  const tabMap: Record<string, string> = {
    pending:   "pending",
    paid:      "issued",    // legacy "paid" maps to PEAK "ออกแล้ว/issued"
    cancelled: "cancelled",
  };
  const params = new URLSearchParams();
  if (sp.status && tabMap[sp.status]) params.set("tab", tabMap[sp.status]);
  if (sp.q)                            params.set("q", sp.q);
  if (sp.date_from)                    params.set("date_from", sp.date_from);
  if (sp.date_to)                      params.set("date_to", sp.date_to);

  const target = params.toString()
    ? `/admin/accounting/receipts?${params.toString()}`
    : "/admin/accounting/receipts";

  redirect(target);
}
