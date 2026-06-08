/**
 * GET /api/freight-invoice/[id]/do-letter
 *
 * Streams the D/O Exchange Letter PDF for a freight invoice.
 *
 * V-E4 — companion to `/api/freight-invoice/[id]` (Commercial Invoice)
 * and `/api/freight-invoice/[id]/packing-list` (Packing List). Same data
 * source (freight_invoices + freight_shipments + freight_invoice_lines),
 * different view: a Thai business letter from the consignee to the
 * shipping-line agent (e.g. CULINES) requesting telex release.
 *
 * Auth + RLS + cache-headers all mirror the CI route (incl. migration 0148
 * broadening RLS to admit freight_*_doc roles for SELECT).
 *
 * Data note: `place_delivery` and `carrier_container_no` are NOT snapshotted
 * on freight_invoices — they're physical logistics facts that live on the
 * parent shipment. We always read them live from the shipment row (same
 * pattern as freight-packing-list draft fallback).
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { FreightDoLetter, type FreightDoLetterData } from "@/components/pdf/freight-do-letter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvoiceRow = {
  id:                          string;
  invoice_no:                  string | null;
  status:                      "draft" | "issued" | "cancelled";
  issued_at:                   string | null;
  created_at:                  string;
  freight_shipment_id:         string;
  consignee_name_snapshot:     string | null;
  consignee_address_snapshot:  string | null;
  consignee_tax_id_snapshot:   string | null;
  bl_no_snapshot:              string | null;
  vessel_voyage_snapshot:      string | null;
  port_loading_snapshot:       string | null;
  port_discharge_snapshot:     string | null;
  container_code_snapshot:     string | null;
};

type ShipmentRow = {
  job_no:                string | null;
  // Live-fallback for draft + always-live for fields not snapshotted.
  bl_no:                 string | null;
  vessel_voyage:         string | null;
  port_loading:          string | null;
  port_discharge:        string | null;
  place_delivery:        string | null;
  container_code:        string | null;
  carrier_container_no:  string | null;
};

type LineRow = {
  cartons:         number | null;
  gross_weight_kg: number | null;
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

  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const { data: invoice, error: invoiceErr } = await supabase
    .from("freight_invoices")
    .select(`
      id, invoice_no, status, issued_at, created_at, freight_shipment_id,
      consignee_name_snapshot, consignee_address_snapshot, consignee_tax_id_snapshot,
      bl_no_snapshot, vessel_voyage_snapshot,
      port_loading_snapshot, port_discharge_snapshot,
      container_code_snapshot
    `)
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (invoiceErr) {
    console.error(`[freight_invoices list] failed`, { code: invoiceErr.code, message: invoiceErr.message });
  }
  if (!invoice) {
    return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: shipment, error: shipmentErr } = await admin
    .from("freight_shipments")
    .select("job_no, bl_no, vessel_voyage, port_loading, port_discharge, place_delivery, container_code, carrier_container_no")
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
    .select("role, name, address, tax_id")
    .eq("freight_shipment_id", invoice.freight_shipment_id);
  if (partiesErr) {
    console.error(`[freight_parties list] failed`, { code: partiesErr.code, message: partiesErr.message });
  }
  const partyList = (parties ?? []) as unknown as PartyRow[];
  const liveConsignee = partyList.find((p) => p.role === "consignee");

  const { data: linesRaw, error: linesRawErr } = await admin
    .from("freight_invoice_lines")
    .select("cartons, gross_weight_kg")
    .eq("freight_invoice_id", invoice.id);
  if (linesRawErr) {
    console.error(`[freight_invoice_lines list] failed`, { code: linesRawErr.code, message: linesRawErr.message });
  }
  const lines = (linesRaw ?? []) as unknown as LineRow[];

  const totalCartons   = lines.reduce((s, l) => s + (Number(l.cartons) || 0), 0);
  const totalWeightKg  = lines.reduce((s, l) => s + (Number(l.gross_weight_kg) || 0), 0);

  registerPdfFonts();

  const isIssued = invoice.status === "issued" || invoice.status === "cancelled";

  const pdfData: FreightDoLetterData = {
    invoice_no: invoice.invoice_no,
    status:     invoice.status,
    issued_at:  invoice.issued_at,
    created_at: invoice.created_at,
    job_no:     shipment.job_no,

    consignee_name:    isIssued ? (invoice.consignee_name_snapshot    ?? "—") : (liveConsignee?.name    ?? "—"),
    consignee_address: isIssued ? (invoice.consignee_address_snapshot ?? "—") : (liveConsignee?.address ?? "—"),
    consignee_tax_id:  isIssued ? invoice.consignee_tax_id_snapshot   : (liveConsignee?.tax_id ?? null),

    bl_no:           isIssued ? (invoice.bl_no_snapshot          ?? shipment.bl_no)          : shipment.bl_no,
    vessel_voyage:   isIssued ? (invoice.vessel_voyage_snapshot  ?? shipment.vessel_voyage)  : shipment.vessel_voyage,
    port_loading:    isIssued ? (invoice.port_loading_snapshot   ?? shipment.port_loading)   : shipment.port_loading,
    port_discharge:  isIssued ? (invoice.port_discharge_snapshot ?? shipment.port_discharge) : shipment.port_discharge,
    container_code:  isIssued ? (invoice.container_code_snapshot ?? shipment.container_code) : shipment.container_code,

    // Never snapshotted on freight_invoices — always live from shipment.
    place_delivery:       shipment.place_delivery,
    carrier_container_no: shipment.carrier_container_no,

    total_cartons:   totalCartons,
    total_weight_kg: totalWeightKg,
  };

  const filename = `pacred-DO-${invoice.invoice_no ?? id}.pdf`;
  const buffer = await renderToBuffer(<FreightDoLetter data={pdfData} />);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
