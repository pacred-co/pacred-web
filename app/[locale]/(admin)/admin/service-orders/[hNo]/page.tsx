import { notFound } from "next/navigation";
import { renderLegacyServiceOrderView } from "./legacy-view";

/**
 * /admin/service-orders/[hNo] — admin ฝากสั่งซื้อ (China-shop) order detail.
 *
 * 2026-06-03 — collapsed to a SINGLE coherent page (owner directive
 * "(B) รื้อทั้งหน้าให้เป็นหน้าเดียวเหมือน legacy เป๊ะ"). The page reads the
 * LIVE legacy `tb_header_order` (the rebuilt `service_orders` table is empty
 * on prod after the D1 pivot — 21,950 real orders live in `tb_header_order`),
 * and `renderLegacyServiceOrderView` renders the faithful single-page layout
 * (header + 5-step bar + customer/price columns + status-aware item editor +
 * note/cancel/delete footer) — mirroring `pcs-admin/.../shops/update.php`.
 *
 * The prior rebuilt-`service_orders` branch + 8 stacked form components were
 * removed: that path was dead on prod (empty table) and produced the
 * read-only KV + stacked-forms shell the rewrite replaces.
 */

export const dynamic = "force-dynamic";

export default async function AdminServiceOrderDetail({ params }: { params: Promise<{ hNo: string }> }) {
  const { hNo } = await params;
  const view = await renderLegacyServiceOrderView(hNo);
  if (!view) notFound();
  return view;
}
