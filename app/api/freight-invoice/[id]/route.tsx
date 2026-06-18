/**
 * GET /api/freight-invoice/[id]
 *
 * Streams the Commercial Invoice PDF for a freight invoice.
 *
 * V-E1.1 — PDF generator (Commercial Invoice view). Companion route for
 * Packing List at `/api/freight-invoice/[id]/packing-list`.
 *
 * Auth & visibility:
 *   - Row visibility gated by freight_invoices RLS:
 *       customer  → own rows (profile_id = auth.uid())
 *       admin     → all rows when is_admin(['super','ops','accounting',
 *                  'freight_export_doc','freight_import_doc',
 *                  'freight_clearance_both'])  (migration 0148, 2026-06-08)
 *   - SELECT via user-scoped client; if null → 404 (unauth or missing).
 *
 * Status handling:
 *   - status='draft'      → renders DRAFT watermark-style header
 *     (no invoice_no, no issuance date). Customer never sees drafts
 *     because the RLS read-policy doesn't filter status — but the
 *     parent freight_shipments only links it once issued. Drafts are
 *     mostly an admin preview.
 *   - status='issued'     → render with frozen snapshot fields
 *   - status='cancelled'  → re-render with CANCELLED watermark
 *
 * Cache-Control: private, no-store — admin actions may flip status.
 *
 * Pattern mirrors `/api/tax-invoice/[id]/route.tsx`.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { FreightCommercialInvoice, type FreightCommercialInvoiceData } from "@/components/pdf/freight-commercial-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceRow = {
  id:                          string;
  invoice_no:                  string | null;
  status:                      "draft" | "issued" | "cancelled";
  issued_at:                   string | null;
  created_at:                  string;
  freight_shipment_id:         string;

  shipper_name_snapshot:       string | null;
  shipper_address_snapshot:    string | null;
  consignee_name_snapshot:     string | null;
  consignee_address_snapshot:  string | null;
  consignee_tax_id_snapshot:   string | null;
  consignee_branch_snapshot:   string | null;

  transport_mode_snapshot:     string | null;
  container_code_snapshot:     string | null;
  bl_no_snapshot:              string | null;
  vessel_voyage_snapshot:      string | null;
  port_loading_snapshot:       string | null;
  port_discharge_snapshot:     string | null;
  incoterm_snapshot:           string | null;
  payment_term_snapshot:       string | null;
  origin_country_snapshot:     string | null;

  commercial_value_usd:        number | null;
  exchange_rate:               number | null;
  rate_date:                   string | null;
  commercial_value_thb:        number | null;
  declared_customs_value_thb:  number | null;
  declared_value_basis:        string | null;
  hs_code:                     string | null;
  duty_rate_pct:               number | null;
  duty_thb:                    number | null;
  vat_base_thb:                number | null;
  vat_thb:                     number | null;
  vat_plan_label:              string | null;
  form_e_applied:              boolean;

  notes:                       string | null;
};

type ShipmentRow = {
  job_no:                      string | null;
  // Live-fallback fields used only when invoice is DRAFT (snapshots are
  // null until issuance — show shipment-level values for preview).
  transport_mode:              string;
  container_code:              string | null;
  bl_no:                       string | null;
  vessel_voyage:               string | null;
  port_loading:                string | null;
  port_discharge:              string | null;
  incoterm:                    string | null;
  payment_term:                string | null;
  origin_country:              string;
  commercial_value_usd:        number | null;
  exchange_rate:               number | null;
  rate_date:                   string | null;
  commercial_value_thb:        number | null;
  declared_customs_value_thb:  number | null;
  declared_value_basis:        string | null;
  hs_code:                     string | null;
  duty_rate_pct:               number | null;
  duty_thb:                    number | null;
  vat_base_thb:                number | null;
  vat_thb:                     number | null;
  vat_plan_label:              string | null;
  form_e_applied:              boolean;
};

type LineRow = {
  position:        number;
  marks:           string | null;
  description:     string;
  qty:             number;
  unit:            string;
  unit_price_usd:  number;
  amount_usd:      number;
  hs_code:         string | null;
};

type PartyRow = {
  role:    string;
  name:    string;
  address: string;
  tax_id:  string | null;
  branch:  string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth + RLS-scoped read.
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { data: invoice, error: invoiceErr } = await supabase
    .from("freight_invoices")
    .select(`
      id, invoice_no, status, issued_at, created_at, freight_shipment_id,
      shipper_name_snapshot, shipper_address_snapshot,
      consignee_name_snapshot, consignee_address_snapshot,
      consignee_tax_id_snapshot, consignee_branch_snapshot,
      transport_mode_snapshot, container_code_snapshot, bl_no_snapshot,
      vessel_voyage_snapshot, port_loading_snapshot, port_discharge_snapshot,
      incoterm_snapshot, payment_term_snapshot, origin_country_snapshot,
      commercial_value_usd, exchange_rate, rate_date, commercial_value_thb,
      declared_customs_value_thb, declared_value_basis, hs_code,
      duty_rate_pct, duty_thb, vat_base_thb, vat_thb, vat_plan_label,
      form_e_applied, notes
    `)
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (invoiceErr) {
    console.error(`[freight_invoices list] failed`, { code: invoiceErr.code, message: invoiceErr.message });
  }

  if (!invoice) {
    return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  }

  // Dual-audience money gate (owner 2026-06-18). The DECLARED customs value /
  // duty / VAT-base are MONEY-internal (มูลค่าสำแดง). A CUSTOMER sees their OWN
  // invoice (RLS-scoped above) incl. its declared value; only ADMIN viewers who
  // lack cost/profit access (super, freight_*_doc) get the declared block masked.
  // The COMMERCIAL value (the amount the customer pays) is NOT masked.
  // getAdminRoles() returns null for non-admins → customers never masked.
  const viewerRoles = await getAdminRoles();
  const adminMustHideMoney = viewerRoles != null && !canViewCostProfit(viewerRoles);

  // For drafts, supplement from parent shipment + parties (no snapshots yet).
  const admin = createAdminClient();
  const { data: shipment, error: shipmentErr } = await admin
    .from("freight_shipments")
    .select(`
      job_no, transport_mode, container_code, bl_no, vessel_voyage,
      port_loading, port_discharge, incoterm, payment_term, origin_country,
      commercial_value_usd, exchange_rate, rate_date, commercial_value_thb,
      declared_customs_value_thb, declared_value_basis, hs_code,
      duty_rate_pct, duty_thb, vat_base_thb, vat_thb, vat_plan_label,
      form_e_applied
    `)
    .eq("id", invoice.freight_shipment_id)
    .maybeSingle<ShipmentRow>();
  if (shipmentErr) {
    console.error(`[freight_shipments list] failed`, { code: shipmentErr.code, message: shipmentErr.message });
  }
  if (!shipment) {
    return NextResponse.json({ error: "shipment_missing" }, { status: 500 });
  }

  const { data: parties, error: partiesErr } = await admin
    .from("freight_parties")
    .select("role, name, address, tax_id, branch")
    .eq("freight_shipment_id", invoice.freight_shipment_id);
  if (partiesErr) {
    console.error(`[freight_parties list] failed`, { code: partiesErr.code, message: partiesErr.message });
  }
  const partyList = (parties ?? []) as unknown as PartyRow[];
  const liveShipper   = partyList.find((p) => p.role === "shipper");
  const liveConsignee = partyList.find((p) => p.role === "consignee");

  const { data: linesRaw, error: linesRawErr } = await admin
    .from("freight_invoice_lines")
    .select("position, marks, description, qty, unit, unit_price_usd, amount_usd, hs_code")
    .eq("freight_invoice_id", invoice.id)
    .order("position", { ascending: true });
  if (linesRawErr) {
    console.error(`[freight_invoice_lines list] failed`, { code: linesRawErr.code, message: linesRawErr.message });
  }
  const lines = (linesRaw ?? []) as unknown as LineRow[];

  registerPdfFonts();

  // Pick snapshot vs live fallback per status.
  const isIssued = invoice.status === "issued" || invoice.status === "cancelled";
  const pdfData: FreightCommercialInvoiceData = {
    invoice_no: invoice.invoice_no,
    status:     invoice.status,
    issued_at:  invoice.issued_at,
    created_at: invoice.created_at,
    job_no:     shipment.job_no,

    shipper_name:    isIssued ? (invoice.shipper_name_snapshot    ?? "—") : (liveShipper?.name    ?? "—"),
    shipper_address: isIssued ? (invoice.shipper_address_snapshot ?? "—") : (liveShipper?.address ?? "—"),
    consignee_name:    isIssued ? (invoice.consignee_name_snapshot    ?? "—") : (liveConsignee?.name    ?? "—"),
    consignee_address: isIssued ? (invoice.consignee_address_snapshot ?? "—") : (liveConsignee?.address ?? "—"),
    consignee_tax_id:  isIssued ? invoice.consignee_tax_id_snapshot  : (liveConsignee?.tax_id  ?? null),
    consignee_branch:  isIssued ? invoice.consignee_branch_snapshot  : (liveConsignee?.branch  ?? null),

    transport_mode:  isIssued ? (invoice.transport_mode_snapshot  ?? shipment.transport_mode) : shipment.transport_mode,
    container_code:  isIssued ? invoice.container_code_snapshot  : shipment.container_code,
    bl_no:           isIssued ? invoice.bl_no_snapshot           : shipment.bl_no,
    vessel_voyage:   isIssued ? invoice.vessel_voyage_snapshot   : shipment.vessel_voyage,
    port_loading:    isIssued ? invoice.port_loading_snapshot    : shipment.port_loading,
    port_discharge:  isIssued ? invoice.port_discharge_snapshot  : shipment.port_discharge,
    incoterm:        isIssued ? invoice.incoterm_snapshot        : shipment.incoterm,
    payment_term:    isIssued ? invoice.payment_term_snapshot    : shipment.payment_term,
    origin_country:  isIssued ? (invoice.origin_country_snapshot ?? shipment.origin_country) : shipment.origin_country,

    lines: lines.map((l) => ({
      position:       Number(l.position),
      marks:          l.marks,
      description:    l.description,
      qty:            Number(l.qty),
      unit:           l.unit,
      unit_price_usd: Number(l.unit_price_usd),
      amount_usd:     Number(l.amount_usd),
      hs_code:        l.hs_code,
    })),

    // Value block — snapshot if issued, live shipment fallback if draft.
    commercial_value_usd: Number(isIssued ? (invoice.commercial_value_usd ?? 0) : (shipment.commercial_value_usd ?? 0)),
    exchange_rate:        Number(isIssued ? (invoice.exchange_rate        ?? 0) : (shipment.exchange_rate        ?? 0)),
    rate_date:            isIssued ? invoice.rate_date : shipment.rate_date,
    commercial_value_thb: Number(isIssued ? (invoice.commercial_value_thb ?? 0) : (shipment.commercial_value_thb ?? 0)),
    // DECLARED customs value / duty / VAT-base = MONEY-internal → nulled for
    // non-cost admin viewers (the PDF omits each block when null). HS code +
    // form-E flag are operational (kept).
    declared_customs_value_thb: adminMustHideMoney ? null : (isIssued ? invoice.declared_customs_value_thb : shipment.declared_customs_value_thb),
    declared_value_basis:       adminMustHideMoney ? null : (isIssued ? invoice.declared_value_basis       : shipment.declared_value_basis),
    hs_code:                    isIssued ? invoice.hs_code                    : shipment.hs_code,
    duty_rate_pct:              adminMustHideMoney ? null : (isIssued ? invoice.duty_rate_pct              : shipment.duty_rate_pct),
    duty_thb:                   adminMustHideMoney ? null : (isIssued ? invoice.duty_thb                   : shipment.duty_thb),
    vat_base_thb:               adminMustHideMoney ? null : (isIssued ? invoice.vat_base_thb               : shipment.vat_base_thb),
    vat_thb:                    adminMustHideMoney ? null : (isIssued ? invoice.vat_thb                    : shipment.vat_thb),
    vat_plan_label:             adminMustHideMoney ? null : (isIssued ? invoice.vat_plan_label             : shipment.vat_plan_label),
    form_e_applied:             isIssued ? invoice.form_e_applied             : shipment.form_e_applied,

    notes: invoice.notes,
  };

  const filename = `pacred-CI-${invoice.invoice_no ?? id}.pdf`;
  const buffer = await renderToBuffer(<FreightCommercialInvoice data={pdfData} />);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
