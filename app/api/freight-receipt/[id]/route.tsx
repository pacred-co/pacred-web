/**
 * GET /api/freight-receipt/[id]
 *
 * Streams the freight receipt PDF (V-E7) for a freight invoice.
 * `[id]` is the freight_invoices row id (uuid).
 *
 * Used by:
 *   • Admin "ดาวน์โหลดใบเสร็จ" button on /admin/freight/shipments/[id]
 *   • (V-E7.1) customer download on the freight portal once it ships
 *
 * Auth & visibility:
 *   - Row visibility gated by freight_invoices RLS (migration 0051):
 *       customer → own rows (profile_id = auth.uid())
 *       admin    → all rows when is_admin(['super','ops','accounting'])
 *   - We DO NOT use the admin client for the row lookup — RLS makes the
 *     access decision. SELECT returns null → unauthorised OR not found →
 *     either way a 404.
 *   - Once the row is visible, related data (lines + payments) is fetched
 *     via the admin client — row visibility already proved authorisation.
 *
 * Rendering:
 *   - Always re-rendered on the fly (no stored PDF) — the receipt is a
 *     LIVE document: recording a payment changes paid/outstanding and may
 *     flip the title from invoice → receipt. Mirror the tax-invoice
 *     cancelled-variant approach (re-render keeps storage clean).
 *   - status='draft' → 409 (no invoice_no, financials not frozen).
 *
 * WHT gate:
 *   - getFreightReceiptGate() is the single choke-point for the V-A6.1
 *     WHT-cert gate (today it always allows — freight↔WHT linkage doesn't
 *     exist; see actions/admin/freight-invoice-payments.ts).
 *
 * Cache-Control: private, no-store — the document changes as payments
 * land; never cache.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { FreightReceipt, type FreightReceiptData } from "@/components/pdf/freight-receipt";
import { getFreightReceiptGate } from "@/actions/admin/freight-invoice-payments";
import {
  computeInvoicePaymentStatus,
  freightInvoiceTotalThb,
  roundThb,
  FREIGHT_PAYMENT_METHOD_LABEL,
  type FreightPaymentMethod,
} from "@/lib/validators/freight-payment";

export const runtime = "nodejs";          // @react-pdf/renderer needs node fs (font load)
export const dynamic = "force-dynamic";

type InvoiceRow = {
  id:                          string;
  profile_id:                  string;
  freight_shipment_id:         string;
  status:                      "draft" | "issued" | "cancelled";
  invoice_no:                  string | null;
  issued_at:                   string | null;
  created_at:                  string;
  consignee_name_snapshot:     string | null;
  consignee_address_snapshot:  string | null;
  consignee_tax_id_snapshot:   string | null;
  consignee_branch_snapshot:   string | null;
  commercial_value_thb:        number | null;
  duty_thb:                    number | null;
  vat_thb:                     number | null;
};

type LineRow = {
  position:        number;
  description:     string;
  qty:             number;
  unit:            string;
  amount_usd:      number;
};

type PaymentDbRow = {
  method:     string;
  amount_thb: number;
  paid_at:    string;
  bank_ref:   string | null;
  status:     "recorded" | "voided";
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

  const { data: invoice } = await supabase
    .from("freight_invoices")
    .select(`
      id, profile_id, freight_shipment_id, status, invoice_no, issued_at, created_at,
      consignee_name_snapshot, consignee_address_snapshot,
      consignee_tax_id_snapshot, consignee_branch_snapshot,
      commercial_value_thb, duty_thb, vat_thb
    `)
    .eq("id", id)
    .maybeSingle<InvoiceRow>();

  if (!invoice) {
    return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  }

  // Draft has no invoice_no + no frozen financials — nothing to issue.
  if (invoice.status === "draft") {
    return NextResponse.json({ error: "not_yet_issued" }, { status: 409 });
  }

  // ── 2. WHT gate (defensive; today always allows) ──
  const gate = await getFreightReceiptGate(invoice.id);
  if (gate.blocked) {
    return NextResponse.json({ error: gate.reason }, { status: 409 });
  }

  // ── 3. Related data via admin client (row visibility proved access) ──
  const admin = createAdminClient();

  const { data: linesRaw } = await admin
    .from("freight_invoice_lines")
    .select("position, description, qty, unit, amount_usd")
    .eq("freight_invoice_id", invoice.id)
    .order("position", { ascending: true });

  const { data: paymentsRaw } = await admin
    .from("freight_invoice_payments")
    .select("method, amount_thb, paid_at, bank_ref, status")
    .eq("freight_invoice_id", invoice.id)
    .eq("status", "recorded")
    .order("paid_at", { ascending: true });

  // Exchange rate: the line amounts are stored in USD on freight_invoice_lines
  // (migration 0051). The invoice's commercial_value_thb already reflects
  // USD × frozen rate; we derive a per-THB line amount by scaling each USD
  // line by the same ratio so the THB line table sums to subtotal_thb.
  const linesUsd = (linesRaw ?? []) as LineRow[];
  const totalUsd = roundThb(linesUsd.reduce((s, l) => s + Number(l.amount_usd), 0));
  const subtotalThb = Number(invoice.commercial_value_thb ?? 0);
  const usdToThb = totalUsd > 0 ? subtotalThb / totalUsd : 0;

  const lines = linesUsd.map((l) => ({
    position:    Number(l.position),
    description: String(l.description),
    qty:         Number(l.qty),
    unit:        String(l.unit),
    amount_thb:  roundThb(Number(l.amount_usd) * usdToThb),
  }));

  const payments = ((paymentsRaw ?? []) as PaymentDbRow[]).map((p) => ({
    method:     FREIGHT_PAYMENT_METHOD_LABEL[p.method as FreightPaymentMethod] ?? p.method,
    amount_thb: Number(p.amount_thb),
    paid_at:    p.paid_at,
    bank_ref:   p.bank_ref,
  }));

  const total_thb = freightInvoiceTotalThb({
    commercial_value_thb: invoice.commercial_value_thb,
    duty_thb:             invoice.duty_thb,
    vat_thb:              invoice.vat_thb,
  });
  const paid_thb        = roundThb(payments.reduce((s, p) => s + p.amount_thb, 0));
  const outstanding_thb = roundThb(Math.max(0, total_thb - paid_thb));
  const payment_status  = computeInvoicePaymentStatus(paid_thb, total_thb);

  // ── 4. Render ──
  registerPdfFonts();

  const data: FreightReceiptData = {
    invoice_no:      invoice.invoice_no,
    status:          invoice.status,
    payment_status,
    issued_at:       invoice.issued_at,
    created_at:      invoice.created_at,
    job_no:          null,                                  // filled below
    buyer_name:      invoice.consignee_name_snapshot ?? "—",
    buyer_address:   invoice.consignee_address_snapshot ?? "—",
    buyer_tax_id:    invoice.consignee_tax_id_snapshot,
    buyer_branch:    invoice.consignee_branch_snapshot,
    subtotal_thb:    subtotalThb,
    duty_thb:        Number(invoice.duty_thb ?? 0),
    vat_thb:         Number(invoice.vat_thb ?? 0),
    total_thb,
    paid_thb,
    outstanding_thb,
    lines,
    payments,
  };

  // Shipment job_no for the cross-ref line.
  const { data: shipment } = await admin
    .from("freight_shipments")
    .select("job_no")
    .eq("id", invoice.freight_shipment_id)
    .maybeSingle<{ job_no: string | null }>();
  data.job_no = shipment?.job_no ?? null;

  const filename = `pacred-freight-${invoice.invoice_no ?? id}.pdf`;
  const buffer = await renderToBuffer(<FreightReceipt data={data} />);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
