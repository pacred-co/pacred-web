/**
 * GET /api/customs-declaration/[id]
 *
 * Streams the ใบขนสินค้า (Thai customs declaration) PDF for an internal
 * Pacred customs declaration record.
 *
 * V-E11 — internal-only V2 view. NOT the official Customs Trader Portal
 * form; this is Pacred's working draft that admin staff print + use as
 * input when the broker keys the entry into NetBay.
 *
 * Auth & visibility:
 *   - Customer reads OWN, only when status ∈ {submitted, accepted, released}
 *     (per migration 0057 RLS policy customs_declarations_customer_read).
 *   - Admin (super + accounting) — full read.
 *   - SELECT via user-scoped client; if null → 404 (unauth or missing).
 *
 * Status handling:
 *   - draft     → admin preview (customer never reaches it due to RLS)
 *   - submitted / accepted / released → renders the declaration with
 *     submitted_at as the entry date and the broker's customs_control_no
 *     if filled.
 *   - cancelled → renders with CANCELLED watermark.
 *
 * Cache-Control: private, no-store — admin actions may flip status.
 *
 * Pattern mirrors /api/freight-invoice/[id]/route.tsx.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import {
  CustomsDeclarationPdf,
  type CustomsDeclarationPdfData,
} from "@/components/pdf/customs-declaration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeclarationRow = {
  id:                         string;
  declaration_no:             string | null;
  status:                     "draft" | "submitted" | "accepted" | "released" | "cancelled";
  declaration_type:           "import" | "export" | "transit";
  declared_at:                string | null;
  submitted_at:               string | null;
  accepted_at:                string | null;
  released_at:                string | null;
  customs_office:             string | null;
  customs_control_no:         string | null;
  broker_name:                string | null;
  broker_license_no:          string | null;
  ship_or_truck_arrival_date: string | null;
  port_of_entry:              string | null;
  paid_through_promptpay:     boolean;
  notes:                      string | null;
  freight_shipment_id:        string;
  total_declared_value_thb:   number | null;
  total_duty_thb:             number | null;
  total_vat_thb:              number | null;
  total_other_taxes_thb:      number | null;
};

type ShipmentRow = {
  job_no:               string | null;
  transport_mode:       string | null;
  container_code:       string | null;
  carrier_container_no: string | null;
  bl_no:                string | null;
  vessel_voyage:        string | null;
  port_loading:         string | null;
  port_discharge:       string | null;
  origin_country:       string;
};

type PartyRow = {
  role:    string;
  name:    string;
  address: string;
  tax_id:  string | null;
  branch:  string | null;
};

type LineRow = {
  position:           number;
  hs_code:            string | null;
  description:        string;
  country_of_origin:  string;
  qty:                number;
  unit:               string;
  gross_weight_kg:    number | null;
  net_weight_kg:      number | null;
  declared_value_thb: number;
  duty_rate_pct:      number;
  duty_thb:           number;
  vat_thb:            number;
  fta_applied:        boolean;
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

  const { data: declaration, error: declarationErr } = await supabase
    .from("customs_declarations")
    .select(`
      id, declaration_no, status, declaration_type,
      declared_at, submitted_at, accepted_at, released_at,
      customs_office, customs_control_no, broker_name, broker_license_no,
      ship_or_truck_arrival_date, port_of_entry, paid_through_promptpay,
      notes, freight_shipment_id,
      total_declared_value_thb, total_duty_thb, total_vat_thb, total_other_taxes_thb
    `)
    .eq("id", id)
    .maybeSingle<DeclarationRow>();
  if (declarationErr) {
    console.error(`[customs_declarations list] failed`, { code: declarationErr.code, message: declarationErr.message });
  }

  if (!declaration) {
    return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  }

  // Pull shipment + parties + lines via admin client (we've already
  // proven the caller is entitled to the declaration row).
  const admin = createAdminClient();
  const { data: shipment, error: shipmentErr } = await admin
    .from("freight_shipments")
    .select(`
      job_no, transport_mode, container_code, carrier_container_no,
      bl_no, vessel_voyage, port_loading, port_discharge, origin_country
    `)
    .eq("id", declaration.freight_shipment_id)
    .maybeSingle<ShipmentRow>();
  if (shipmentErr) {
    console.error(`[freight_shipments list] failed`, { code: shipmentErr.code, message: shipmentErr.message });
  }

  const { data: partiesRaw, error: partiesRawErr } = await admin
    .from("freight_parties")
    .select("role, name, address, tax_id, branch")
    .eq("freight_shipment_id", declaration.freight_shipment_id);
  if (partiesRawErr) {
    console.error(`[freight_parties list] failed`, { code: partiesRawErr.code, message: partiesRawErr.message });
  }
  const partyList = (partiesRaw ?? []) as PartyRow[];
  const shipper   = partyList.find((p) => p.role === "shipper");
  const consignee = partyList.find((p) => p.role === "consignee");

  const { data: linesRaw, error: linesRawErr } = await admin
    .from("customs_declaration_lines")
    .select(`
      position, hs_code, description, country_of_origin, qty, unit,
      gross_weight_kg, net_weight_kg, declared_value_thb,
      duty_rate_pct, duty_thb, vat_thb, fta_applied
    `)
    .eq("declaration_id", declaration.id)
    .order("position", { ascending: true });
  if (linesRawErr) {
    console.error(`[customs_declaration_lines list] failed`, { code: linesRawErr.code, message: linesRawErr.message });
  }
  const lines = (linesRaw ?? []) as LineRow[];

  registerPdfFonts();

  const pdfData: CustomsDeclarationPdfData = {
    declaration_no:             declaration.declaration_no,
    status:                     declaration.status,
    declaration_type:           declaration.declaration_type,
    declared_at:                declaration.declared_at,
    submitted_at:               declaration.submitted_at,
    accepted_at:                declaration.accepted_at,
    released_at:                declaration.released_at,
    customs_office:             declaration.customs_office,
    customs_control_no:         declaration.customs_control_no,
    broker_name:                declaration.broker_name,
    broker_license_no:          declaration.broker_license_no,
    ship_or_truck_arrival_date: declaration.ship_or_truck_arrival_date,
    port_of_entry:              declaration.port_of_entry,
    paid_through_promptpay:     declaration.paid_through_promptpay,
    notes:                      declaration.notes,

    job_no:               shipment?.job_no ?? null,
    transport_mode:       shipment?.transport_mode ?? null,
    container_code:       shipment?.container_code ?? null,
    carrier_container_no: shipment?.carrier_container_no ?? null,
    bl_no:                shipment?.bl_no ?? null,
    vessel_voyage:        shipment?.vessel_voyage ?? null,
    port_loading:         shipment?.port_loading ?? null,
    port_discharge:       shipment?.port_discharge ?? null,
    origin_country:       shipment?.origin_country ?? "CN",

    consignee_name:    consignee?.name    ?? null,
    consignee_address: consignee?.address ?? null,
    consignee_tax_id:  consignee?.tax_id  ?? null,
    consignee_branch:  consignee?.branch  ?? null,

    shipper_name:      shipper?.name      ?? null,
    shipper_address:   shipper?.address   ?? null,

    lines: lines.map((l) => ({
      position:           Number(l.position),
      hs_code:            l.hs_code,
      description:        l.description,
      country_of_origin:  l.country_of_origin,
      qty:                Number(l.qty),
      unit:               l.unit,
      gross_weight_kg:    l.gross_weight_kg != null ? Number(l.gross_weight_kg) : null,
      net_weight_kg:      l.net_weight_kg   != null ? Number(l.net_weight_kg)   : null,
      declared_value_thb: Number(l.declared_value_thb),
      duty_rate_pct:      Number(l.duty_rate_pct),
      duty_thb:           Number(l.duty_thb),
      vat_thb:            Number(l.vat_thb),
      fta_applied:        Boolean(l.fta_applied),
    })),

    total_declared_value_thb: Number(declaration.total_declared_value_thb ?? 0),
    total_duty_thb:           Number(declaration.total_duty_thb ?? 0),
    total_vat_thb:            Number(declaration.total_vat_thb ?? 0),
    total_other_taxes_thb:    Number(declaration.total_other_taxes_thb ?? 0),
  };

  const filename = `pacred-customs-declaration-${declaration.declaration_no ?? id}.pdf`;
  const buffer = await renderToBuffer(<CustomsDeclarationPdf data={pdfData} />);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
}
