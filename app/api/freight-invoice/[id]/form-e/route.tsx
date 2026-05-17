/**
 * GET /api/freight-invoice/[id]/form-e
 *
 * Streams the Form E (ASEAN-China FTA Certificate of Origin) PDF for a
 * freight invoice.
 *
 * V-E3 — third companion to:
 *   - `/api/freight-invoice/[id]`               (Commercial Invoice)
 *   - `/api/freight-invoice/[id]/packing-list`  (Packing List)
 *
 * Same data source (freight_invoices + parties + lines), different view —
 * the 12-box ASEAN-China FTA Certificate of Origin per
 * `docs/port-specs/freight-document-suite.md` §V-E3.
 *
 * Pacred renders this as a DRAFT for the customer to lodge with the
 * issuing authority (boxes 4 + 12 stay blank). The component header
 * banner makes that explicit.
 *
 * Auth + visibility + cache headers all mirror the CI route.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { FreightFormE, type FreightFormEData } from "@/components/pdf/freight-form-e";

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
  transport_mode_snapshot:     string | null;
  bl_no_snapshot:              string | null;
  vessel_voyage_snapshot:      string | null;
  port_loading_snapshot:       string | null;
  port_discharge_snapshot:     string | null;
  origin_country_snapshot:     string | null;
};

type ShipmentRow = {
  job_no:          string | null;
  transport_mode:  string;
  bl_no:           string | null;
  vessel_voyage:   string | null;
  port_loading:    string | null;
  port_discharge:  string | null;
  origin_country:  string;
};

type LineRow = {
  position:        number;
  marks:           string | null;
  description:     string;
  qty:             number;
  unit:            string;
  cartons:         number | null;
  gross_weight_kg: number | null;
  hs_code:         string | null;
};

type PartyRow = {
  role:    string;
  name:    string;
  address: string;
  tax_id:  string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Auth + RLS-scoped read.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const { data: invoice } = await supabase
    .from("freight_invoices")
    .select(`
      id, invoice_no, status, issued_at, created_at, freight_shipment_id,
      shipper_name_snapshot, shipper_address_snapshot,
      consignee_name_snapshot, consignee_address_snapshot,
      consignee_tax_id_snapshot,
      transport_mode_snapshot, bl_no_snapshot, vessel_voyage_snapshot,
      port_loading_snapshot, port_discharge_snapshot,
      origin_country_snapshot
    `)
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (!invoice) {
    return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  }

  // Live fallback for drafts (snapshots null until issuance).
  const admin = createAdminClient();
  const { data: shipment } = await admin
    .from("freight_shipments")
    .select("job_no, transport_mode, bl_no, vessel_voyage, port_loading, port_discharge, origin_country")
    .eq("id", invoice.freight_shipment_id)
    .maybeSingle<ShipmentRow>();
  if (!shipment) {
    return NextResponse.json({ error: "shipment_missing" }, { status: 500 });
  }

  const { data: parties } = await admin
    .from("freight_parties")
    .select("role, name, address, tax_id")
    .eq("freight_shipment_id", invoice.freight_shipment_id);
  const partyList = (parties ?? []) as PartyRow[];
  const liveShipper   = partyList.find((p) => p.role === "shipper");
  const liveConsignee = partyList.find((p) => p.role === "consignee");

  const { data: linesRaw } = await admin
    .from("freight_invoice_lines")
    .select("position, marks, description, qty, unit, cartons, gross_weight_kg, hs_code")
    .eq("freight_invoice_id", invoice.id)
    .order("position", { ascending: true });
  const lines = (linesRaw ?? []) as LineRow[];

  registerPdfFonts();

  const isIssued = invoice.status === "issued" || invoice.status === "cancelled";
  const pdfData: FreightFormEData = {
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

    transport_mode:  isIssued ? (invoice.transport_mode_snapshot  ?? shipment.transport_mode) : shipment.transport_mode,
    vessel_voyage:   isIssued ? invoice.vessel_voyage_snapshot   : shipment.vessel_voyage,
    bl_no:           isIssued ? invoice.bl_no_snapshot           : shipment.bl_no,
    port_loading:    isIssued ? invoice.port_loading_snapshot    : shipment.port_loading,
    port_discharge:  isIssued ? invoice.port_discharge_snapshot  : shipment.port_discharge,
    origin_country:  isIssued ? (invoice.origin_country_snapshot ?? shipment.origin_country) : shipment.origin_country,

    lines: lines.map((l) => ({
      position:         Number(l.position),
      marks:            l.marks,
      description:      l.description,
      qty:              Number(l.qty),
      unit:             l.unit,
      cartons:          l.cartons,
      gross_weight_kg:  l.gross_weight_kg != null ? Number(l.gross_weight_kg) : null,
      hs_code:          l.hs_code,
      // Default to "WO" (Wholly Obtained) per spec — line-level
      // origin_criterion field is not in schema yet (Form-E-specific
      // additions deferred per V-E3 spec note). Safe default for the
      // China→Thailand cargo path the system actually handles.
      origin_criterion: "WO",
    })),
  };

  const filename = `pacred-FormE-${invoice.invoice_no ?? id}.pdf`;
  const buffer = await renderToBuffer(<FreightFormE data={pdfData} />);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
