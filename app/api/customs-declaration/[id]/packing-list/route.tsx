/**
 * GET /api/customs-declaration/[id]/packing-list — cargo Packing List PDF
 * (owner 2026-06-28 #1 · "ขึ้น...แพคกิ้งลิส").
 *
 * Renders a standard PACKING LIST for a cargo customs-declaration (the consolidated
 * ฝากนำเข้า · keyed by cargo_forwarder_id). Auth = RLS-scoped declaration read (the
 * caller must be entitled to the row), then admin-client resolves the consignee
 * (tb_forwarder → tb_users/tb_corporate) + the lines. Freight declarations use the
 * dedicated /api/freight-invoice/[id]/packing-list route instead.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDeclarationByConfirmToken } from "@/lib/customs/confirm-token-access";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { CargoPackingListPdf, type CargoPackingListData } from "@/components/pdf/cargo-packing-list";

export const dynamic = "force-dynamic";

type PlDecl = { id: string; declaration_no: string | null; status: CargoPackingListData["status"]; declared_at: string | null; cargo_forwarder_id: number | null; cargo_cabinet_no: string | null; freight_shipment_id: string | null; issue_in_customer_name: boolean | null };
const PL_DECL_COLS = "id, declaration_no, status, declared_at, cargo_forwarder_id, cargo_cabinet_no, freight_shipment_id, issue_in_customer_name";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = createAdminClient();

  // ใบขนพ่วง (#17) — token-scoped PUBLIC access (logged-out customer via LINE link).
  const token = new URL(req.url).searchParams.get("token");
  const tokenGrant = await resolveDeclarationByConfirmToken(admin, id, token);

  let decl: PlDecl | null = null;
  if (tokenGrant) {
    const { data, error } = await admin
      .from("customs_declarations")
      .select(PL_DECL_COLS)
      .eq("id", tokenGrant.id)
      .maybeSingle<PlDecl>();
    if (error) console.error(`[packing-list token read] failed`, { code: error.code, message: error.message });
    decl = data ?? null;
  } else {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error(`[packing-list auth] failed`, { code: authErr.code, message: authErr.message });
    if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

    // RLS-scoped read — proves the caller is entitled to this declaration.
    const { data, error: declErr } = await supabase
      .from("customs_declarations")
      .select(PL_DECL_COLS)
      .eq("id", id)
      .maybeSingle<PlDecl>();
    if (declErr) console.error(`[packing-list declaration] failed`, { code: declErr.code, message: declErr.message });
    decl = data ?? null;
  }

  if (!decl) return NextResponse.json({ error: "not_found_or_unauthorised" }, { status: 404 });
  if (decl.freight_shipment_id) {
    return NextResponse.json({ error: "use_freight_packing_list", hint: `/api/freight-invoice/.../packing-list` }, { status: 400 });
  }
  let jobNo: string | null = null;
  let transportMode: string | null = null;
  let consigneeName: string | null = null;
  let consigneeAddress: string | null = null;

  if (decl.cargo_forwarder_id) {
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fidorco, ftransporttype, fcabinetnumber, userid")
      .eq("id", decl.cargo_forwarder_id)
      .maybeSingle<{ id: number; fidorco: string | null; ftransporttype: string | null; fcabinetnumber: string | null; userid: string | null }>();
    if (fwdErr) console.error(`[packing-list tb_forwarder] failed`, { code: fwdErr.code, message: fwdErr.message });
    if (fwd) {
      jobNo = fwd.fidorco?.trim() || String(fwd.id);
      transportMode = fwd.ftransporttype === "2" ? "ทางเรือ" : fwd.ftransporttype === "3" ? "ทางอากาศ" : "ทางรถ";
      if (fwd.userid) {
        const [{ data: u, error: uErr }, { data: corp, error: corpErr }] = await Promise.all([
          admin.from("tb_users").select("userName, userLastName").eq("userID", fwd.userid).maybeSingle<{ userName: string | null; userLastName: string | null }>(),
          admin.from("tb_corporate").select("corporatename, corporateaddress").eq("userid", fwd.userid).maybeSingle<{ corporatename: string | null; corporateaddress: string | null }>(),
        ]);
        if (uErr) console.error(`[packing-list tb_users] failed`, { code: uErr.code, message: uErr.message });
        if (corpErr) console.error(`[packing-list tb_corporate] failed`, { code: corpErr.code, message: corpErr.message });
        consigneeName = corp?.corporatename?.trim() || `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || fwd.userid;
        consigneeAddress = corp?.corporateaddress?.trim() || "";
      }
    }
  }

  const { data: linesRaw, error: linesErr } = await admin
    .from("customs_declaration_lines")
    .select("position, description, hs_code, qty, unit, gross_weight_kg")
    .eq("declaration_id", decl.id)
    .order("position", { ascending: true });
  if (linesErr) console.error(`[packing-list lines] failed`, { code: linesErr.code, message: linesErr.message });

  registerPdfFonts();

  const data: CargoPackingListData = {
    declaration_no: decl.declaration_no,
    status:         decl.status,
    declared_at:    decl.declared_at,
    job_no:         jobNo,
    cabinet_no:     decl.cargo_cabinet_no,
    transport_mode: transportMode,
    origin_country: "CN",
    consignee_name: consigneeName,
    consignee_address: consigneeAddress,
    shipper_name:   null,
    shipper_address: null,
    lines: ((linesRaw ?? []) as Array<{ position: number; description: string; hs_code: string | null; qty: number; unit: string; gross_weight_kg: number | string | null }>).map((l) => ({
      position:        Number(l.position),
      description:     l.description,
      hs_code:         l.hs_code,
      qty:             Number(l.qty),
      unit:            l.unit,
      gross_weight_kg: l.gross_weight_kg != null ? Number(l.gross_weight_kg) : null,
    })),
  };

  const buffer = await renderToBuffer(<CargoPackingListPdf data={data} />);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="packing-list-${decl.declaration_no ?? decl.id.slice(0, 8)}.pdf"`,
    },
  });
}
