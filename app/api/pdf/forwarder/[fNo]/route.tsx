/**
 * GET /api/pdf/forwarder/[fNo]
 *
 * Returns a true PDF (application/pdf) of the forwarder receipt for download.
 * Uses @react-pdf/renderer with Sarabun font for Thai text.
 *
 * Auth: same as the HTML receipt page — user must own this forwarder
 * (or be an admin via RLS). `getForwarderByNo()` handles the access check.
 *
 * Use case:
 *   - Customer clicks "ดาวน์โหลด PDF" on /service-import/[fNo]/receipt
 *   - Or admin links to this URL from /admin/forwarders/[fNo]
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getForwarderByNo } from "@/actions/forwarder";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { ForwarderReceipt } from "@/components/pdf/forwarder-receipt";

export const runtime = "nodejs";    // @react-pdf/renderer needs Node APIs (fs for font)
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fNo: string }> },
) {
  const { fNo } = await params;

  // 1. Fetch + auth (RLS enforces user owns this forwarder, or admin)
  const res = await getForwarderByNo(fNo);
  if (!res.ok || !res.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 2. Register Sarabun font (idempotent)
  registerPdfFonts();

  // 3. Render PDF to Buffer
  const buffer = await renderToBuffer(<ForwarderReceipt data={res.data} />);

  // 4. Return as application/pdf
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="pacred-${fNo}.pdf"`,
      "Cache-Control":       "private, no-store",   // each request re-renders (safer for admin edits)
    },
  });
}
