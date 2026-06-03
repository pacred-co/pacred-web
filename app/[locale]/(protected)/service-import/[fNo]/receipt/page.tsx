import { redirect } from "next/navigation";

/**
 * Legacy forwarder receipt route — now a permanent redirect to the LIVE
 * ใบแจ้งหนี้/ใบเสร็จ at `/service-import/[fNo]/invoice`.
 *
 * WHY (ADR-0027 · 2026-06-02): the old page here read the REBUILT `forwarders`
 * table (via `getForwarderByNo`) which is 0 rows in production → it 404'd for
 * every real (legacy `tb_forwarder`) customer. The working view is the HTML
 * page at `…/invoice` (reads live `tb_forwarder ⋈ tb_receipt`). The customer
 * tax-invoice request panel that used to live here now mounts on `…/invoice`.
 *
 * Kept as a redirect (not hard-deleted) so old bookmarks / notification
 * deep-links from before the repoint still land on the right page.
 */
export default async function ForwarderReceiptRedirect({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  const { fNo } = await params;
  redirect(`/service-import/${fNo}/invoice`);
}
