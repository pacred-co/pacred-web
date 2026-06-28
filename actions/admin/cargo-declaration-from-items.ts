"use server";

/**
 * Cargo item-picker → ใบขนสินค้า/ใบกำกับ draft (owner 2026-06-28 #1 + #3).
 *
 * "เลือกสินค้า ในฝากนำเข้า ลงใน ใบขน/ใบกำกับ" — the customer's ฝากนำเข้า items
 * (tb_forwarder_item) seed a customs-declaration DRAFT. Cargo had no seed path
 * (adminCreateDeclaration only seeds from freight_invoice_lines). This creates a
 * customs_declarations row keyed by cargo_forwarder_id (GAP-6 column · NO
 * freight_shipment_id) + seeds lines from the SELECTED items (hs_code +
 * declared_value_thb + qty + weight pre-filled), with duty/VAT via the shared
 * computeLineTaxes.
 *
 * SAFE: produces a DRAFT (status='draft' · editable · NOT a legal issuance — the
 * Docs role reviews/edits/issues via the existing guarded customs-declaration
 * flow). VAT model is the existing one (รับเอกสาร cargo = ใบขน Non-VAT · owner #3).
 */

import "server-only";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeLineTaxes, roundThb } from "@/lib/validators/customs-declaration";

const ROLES = ["super", "accounting", "freight_export_doc", "freight_import_doc"] as const;

export async function adminCreateCargoDeclarationFromItems(input: {
  forwarderId: number;
  itemIds: number[];
  declarationType?: "import" | "export";
}): Promise<AdminActionResult<{ id: string; lineCount: number }>> {
  const forwarderId = Number(input?.forwarderId);
  const itemIds = Array.isArray(input?.itemIds) ? input.itemIds.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
  const declarationType = input?.declarationType === "export" ? "export" : "import";
  if (!Number.isFinite(forwarderId) || forwarderId <= 0) return { ok: false, error: "invalid_forwarder" };
  if (itemIds.length === 0) return { ok: false, error: "เลือกสินค้าอย่างน้อย 1 รายการ" };

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // 1. Forwarder must exist.
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fcabinetnumber, userid")
      .eq("id", forwarderId)
      .maybeSingle<{ id: number; fcabinetnumber: string | null; userid: string | null }>();
    if (fwdErr) { console.error("[cargo-decl forwarder] failed", { code: fwdErr.code, message: fwdErr.message }); return { ok: false, error: `db_error:${fwdErr.code}` }; }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    // 2. Refuse a duplicate non-cancelled declaration for this cargo forwarder.
    const { data: dup, error: dupErr } = await admin
      .from("customs_declarations")
      .select("id, status")
      .eq("cargo_forwarder_id", forwarderId)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    if (dupErr) { console.error("[cargo-decl dup] failed", { code: dupErr.code, message: dupErr.message }); return { ok: false, error: `db_error:${dupErr.code}` }; }
    if (dup) return { ok: false, error: `มีใบขนของรายการนี้อยู่แล้ว (${dup.status}) — เปิดที่ /admin/accounting/customs-declarations` };

    // 3. Pull the SELECTED items (must belong to this forwarder).
    const { data: items, error: itemsErr } = await admin
      .from("tb_forwarder_item")
      .select("id, hs_code, productname, productqty, productweightall, declared_value_thb")
      .eq("fid", forwarderId)
      .in("id", itemIds);
    if (itemsErr) { console.error("[cargo-decl items] failed", { code: itemsErr.code, message: itemsErr.message }); return { ok: false, error: `db_error:${itemsErr.code}` }; }
    const list = (items ?? []) as Array<{ id: number; hs_code: string | null; productname: string | null; productqty: number | null; productweightall: number | string | null; declared_value_thb: number | string | null }>;
    if (list.length === 0) return { ok: false, error: "ไม่พบสินค้าที่เลือก" };

    // duty rate per hs_code (best-effort).
    const codes = Array.from(new Set(list.map((l) => l.hs_code).filter((c): c is string => !!c)));
    const dutyByCode = new Map<string, number>();
    if (codes.length) {
      const { data: rates, error: ratesErr } = await admin.from("hs_codes").select("code, default_duty_pct").in("code", codes);
      if (ratesErr) console.error("[cargo-decl hs duty] failed (defaults to 0)", { code: ratesErr.code, message: ratesErr.message });
      for (const r of (rates ?? []) as Array<{ code: string; default_duty_pct: number | null }>) dutyByCode.set(r.code, Number(r.default_duty_pct ?? 0));
    }

    // 4. Build seed lines + header totals.
    let totDeclared = 0, totDuty = 0, totVat = 0;
    const seed = list.map((l, idx) => {
      const declared = roundThb(Number(l.declared_value_thb ?? 0));
      const dutyRate = l.hs_code ? (dutyByCode.get(l.hs_code) ?? 0) : 0;
      const taxes = computeLineTaxes({ declared_value_thb: declared, duty_rate_pct: dutyRate });
      totDeclared += declared; totDuty += taxes.duty_thb; totVat += taxes.vat_thb;
      return {
        position: idx + 1,
        hs_code: l.hs_code,
        description: l.productname ?? "",
        country_of_origin: "CN",
        qty: Number(l.productqty ?? 0),
        unit: "ชิ้น",
        gross_weight_kg: Number(l.productweightall ?? 0) || null,
        net_weight_kg: null,
        declared_value_thb: declared,
        duty_rate_pct: dutyRate,
        duty_thb: taxes.duty_thb,
        vat_thb: taxes.vat_thb,
        fta_applied: false,
      };
    });

    // 5. Insert the draft header (cargo-keyed · no freight_shipment_id).
    const { data: hdr, error: hdrErr } = await admin
      .from("customs_declarations")
      .insert({
        cargo_forwarder_id: forwarderId,
        cargo_cabinet_no: fwd.fcabinetnumber ?? null,
        declaration_type: declarationType,
        status: "draft",
        declared_at: new Date().toISOString(),
        total_declared_value_thb: roundThb(totDeclared),
        total_duty_thb: roundThb(totDuty),
        total_vat_thb: roundThb(totVat),
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (hdrErr || !hdr) { console.error("[cargo-decl header insert] failed", { message: hdrErr?.message }); return { ok: false, error: `insert_failed:${hdrErr?.message ?? "no_row"}` }; }

    const { error: lineErr } = await admin
      .from("customs_declaration_lines")
      .insert(seed.map((s) => ({ ...s, declaration_id: hdr.id })));
    if (lineErr) { console.error("[cargo-decl lines insert] failed", { message: lineErr.message }); return { ok: false, error: `lines_failed:${lineErr.message}` }; }

    await logAdminAction(adminId, "customs_declaration.create_from_cargo_items", "customs_declaration", hdr.id, {
      forwarder_id: forwarderId, item_count: seed.length, declaration_type: declarationType,
    });

    return { ok: true, data: { id: hdr.id, lineCount: seed.length } };
  });
}
