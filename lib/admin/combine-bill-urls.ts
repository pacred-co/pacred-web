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

/**
 * Detail/edit route for ONE combine-bill (`tb_bill.billid`).
 *
 * The legacy `forwarder-bill.php` list (L209-210) only exposed a
 * whole-bill delete + a print link per row — there was no per-bill
 * detail page. (Its `?page=detail` mode is the driver-run screen built
 * on `tb_forwarder_driver`, NOT `tb_bill`; that mode is ported separately
 * at `/admin/drivers/[id]`.) This Pacred detail page is re-sweep A2 #9 —
 * the editable per-bill view: see the bill's forwarder line items, add
 * or remove individual forwarders, and delete the whole bill, all from
 * one reachable surface (AGENTS.md §0d).
 */
export function buildCombineBillDetailHref(billId: number): string {
  return `/admin/forwarders/combine-bill/${encodeURIComponent(billId)}`;
}
