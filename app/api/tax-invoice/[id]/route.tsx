/**
 * GET /api/tax-invoice/[id]
 *
 * Streams the issued tax-invoice PDF for download. Used by:
 *   • Customer download button on /service-(order|import)/.../receipt
 *   • Admin "ดู PDF" link on /admin/tax-invoices/[id]
 *
 * Auth & visibility:
 *   - Row visibility is gated by tax_invoices RLS:
 *       customer → own rows (profile_id = auth.uid())
 *       admin    → all rows when is_admin(['super','accounting'])
 *   - We DO NOT use the admin client for the row lookup — RLS does the
 *     access decision. If the SELECT returns null, caller is unauthorised
 *     OR the row doesn't exist. Either way → 404.
 *   - Once row is visible, we bypass storage RLS by using the admin client
 *     for the actual file download (the row visibility already proved
 *     authorisation).
 *
 * Status handling:
 *   - status='issued' + pdf_storage_path set → stream file from Storage
 *   - status='cancelled'                     → re-render PDF on the fly
 *                                              with CANCELLED watermark
 *                                              (we don't cache cancelled
 *                                              variants — re-rendering each
 *                                              time keeps storage clean)
 *   - status='pending'                       → 404 (not ready yet)
 *
 * Cache-Control: private, no-store — never cache (admin edits + cancellation
 * could change the response).
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { TaxInvoice, type TaxInvoiceData } from "@/components/pdf/tax-invoice";

export const runtime = "nodejs";          // @react-pdf/renderer needs node fs (font load)
export const dynamic = "force-dynamic";

type HeaderRow = {
  id:                 string;
  profile_id:         string;
  status:             "pending" | "issued" | "cancelled";
  serial_no:          string | null;
  pdf_storage_path:   string | null;
  issued_at:          string | null;
  created_at:         string;
  buyer_name:         string;
  buyer_address:      string;
  buyer_tax_id:       string;
  buyer_branch:       string;
  subtotal_thb:       number;
  vat_thb:            number;
  total_thb:          number;
  vat_mode:           "inclusive" | "exclusive";
  payment_method:     string;
  order_h_no:         string | null;
  forwarder_f_no:     string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // ── 1. Auth + row visibility (RLS scopes) ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { data: header } = await supabase
    .from("tax_invoices")
    .select("id, profile_id, status, serial_no, pdf_storage_path, issued_at, created_at, buyer_name, buyer_address, buyer_tax_id, buyer_branch, subtotal_thb, vat_thb, total_thb, vat_mode, payment_method, order_h_no, forwarder_f_no")
    .eq("id", id)
    .maybeSingle<HeaderRow>();

  if (!header) {
    return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  }

  if (header.status === "pending") {
    return NextResponse.json({ error: "not_yet_issued" }, { status: 409 });
  }

  registerPdfFonts();
  const filename = `pacred-${header.serial_no ?? id}.pdf`;
  const admin = createAdminClient();

  // ── 2A. Issued — stream original PDF from storage ──
  if (header.status === "issued") {
    if (!header.pdf_storage_path) {
      // Defensive: issued + no PDF means something failed at issuance.
      // Render on the fly as a fallback rather than 500.
      return await renderAndReturn(header, filename);
    }
    const { data: blob, error: dlErr } = await admin.storage
      .from("tax-invoices")
      .download(header.pdf_storage_path);
    if (dlErr || !blob) {
      // Storage object missing — render on the fly
      return await renderAndReturn(header, filename);
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control":       "private, no-store",
      },
    });
  }

  // ── 2B. Cancelled — re-render with watermark ──
  return await renderAndReturn(header, filename);

  // ── helpers ──
  async function renderAndReturn(h: HeaderRow, name: string): Promise<NextResponse> {
    // We need lines too — fetch via admin client (RLS already proved access at parent)
    const { data: lines } = await admin
      .from("tax_invoice_lines")
      .select("position, description, qty, unit_price_thb, amount_thb, vat_thb")
      .eq("tax_invoice_id", h.id)
      .order("position", { ascending: true });

    // Optional WHT breakdown (per ADR-0015) — only render the block when the
    // cert is settled (received | waived); pending entries shouldn't reach here
    // anyway because the gate blocked issuance.
    const whtQuery = admin
      .from("withholding_tax_entries")
      .select("cert_status, wht_base_thb, wht_rate_pct, wht_amount_thb, net_expected_thb, cert_number")
      .eq("tax_invoice_id", h.id)
      .limit(1);
    const { data: whtRow } = await whtQuery.maybeSingle<{
      cert_status:      "pending" | "received" | "waived";
      wht_base_thb:     number;
      wht_rate_pct:     number;
      wht_amount_thb:   number;
      net_expected_thb: number;
      cert_number:      string | null;
    }>();

    const data: TaxInvoiceData = {
      serial_no:     h.serial_no,
      status:        h.status,
      issued_at:     h.issued_at,
      created_at:    h.created_at,
      buyer_name:    h.buyer_name,
      buyer_address: h.buyer_address,
      buyer_tax_id:  h.buyer_tax_id,
      buyer_branch:  h.buyer_branch,
      subtotal_thb:  Number(h.subtotal_thb),
      vat_thb:       Number(h.vat_thb),
      total_thb:     Number(h.total_thb),
      vat_mode:      h.vat_mode,
      payment_method: h.payment_method,
      lines: (lines ?? []).map((l) => ({
        position:       Number(l.position),
        description:    String(l.description),
        qty:            Number(l.qty),
        unit_price_thb: Number(l.unit_price_thb),
        amount_thb:     Number(l.amount_thb),
        vat_thb:        Number(l.vat_thb),
      })),
      order_h_no:     h.order_h_no,
      forwarder_f_no: h.forwarder_f_no,
      wht: whtRow && whtRow.cert_status !== "pending"
        ? {
            base_thb:    Number(whtRow.wht_base_thb),
            rate_pct:    Number(whtRow.wht_rate_pct),
            amount_thb:  Number(whtRow.wht_amount_thb),
            net_thb:     Number(whtRow.net_expected_thb),
            cert_status: whtRow.cert_status,
            cert_number: whtRow.cert_number,
          }
        : null,
    };
    const buffer = await renderToBuffer(<TaxInvoice data={data} />);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control":       "private, no-store",
      },
    });
  }
}
