/**
 * URL builders for the combine-bill print route.
 *
 * Lives in `lib/` (NOT `actions/`) because Server Action files marked
 * `"use server"` may only export ASYNC functions. This is a pure sync
 * URL builder — extract here to keep `actions/admin/combine-bill.ts`
 * Server-Action-pure.
 *
 * Faithful behaviour preserved: same legacy `id[]=…&id[]=…` query-string
 * shape that legacy `printBill.php` consumes, same target route slug.
 * The future `/admin/forwarders/combine-bill/print` page (powered by
 * `@react-pdf/renderer`) can read this query string verbatim.
 */
export function buildCombineBillPrintHref(forwarderIds: number[]): string {
  const qs = forwarderIds.map((id) => `id[]=${encodeURIComponent(id)}`).join("&");
  return `/admin/forwarders/combine-bill/print${qs ? `?${qs}` : ""}`;
}
