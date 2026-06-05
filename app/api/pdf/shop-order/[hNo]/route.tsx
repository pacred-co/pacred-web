/**
 * GET /api/pdf/shop-order/[hNo]
 *
 * Returns a true PDF (application/pdf) of the shop-order receipt or invoice
 * for download. Uses @react-pdf/renderer with Sarabun font for Thai text.
 *
 * Legacy parallel: `member/printShop.php` (mPDF). Two modes are auto-detected
 * from order status:
 *   - status='completed' → "ใบเสร็จรับเงิน" (paid receipt)
 *   - status in 2..4    → "ใบแจ้งหนี้"      (invoice)
 *   - status=pending or cancelled → 404 (PHP refused these)
 *
 * Auth: getServiceOrderForReceipt() runs under RLS so user must own this
 * order (or be an admin, via the admin-override policy on service_orders).
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getServiceOrderForReceipt } from "@/actions/service-order";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { prefetchAllItemImages } from "@/lib/pdf/prefetch-image";
import { ShopOrderReceipt } from "@/components/pdf/shop-order-receipt";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hNo: string }> },
) {
  const { hNo } = await params;

  const res = await getServiceOrderForReceipt(hNo);
  if (!res.ok || !res.data) {
    const status = res.ok ? 404 : (res.error === "not_signed_in" ? 401 : 404);
    return NextResponse.json({ error: res.ok ? "no_data" : res.error }, { status });
  }

  registerPdfFonts();

  // 2026-06-05 (ภูม flag) — pre-fetch product images server-side. alicdn
  // auto-serves WebP based on User-Agent; @react-pdf only decodes JPG/PNG/GIF.
  // Pre-fetching with empty UA → JPG response → embed as data URI in PDF.
  const enrichedItems = await prefetchAllItemImages(res.data.items);
  const enrichedData = { ...res.data, items: enrichedItems };

  const buffer = await renderToBuffer(<ShopOrderReceipt data={enrichedData} />);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="pacred-${hNo}.pdf"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
