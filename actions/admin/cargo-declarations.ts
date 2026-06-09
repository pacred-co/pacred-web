"use server";

// ════════════════════════════════════════════════════════════════════
// CARGO customs declaration (ใบขนรวม) — P3 of the tax-invoice platform
// (docs/research/tax-invoice-platform-build-plan-2026-06-09.md).
//
// A CARGO import (ฝากสั่งซื้อ / ฝากนำเข้า) is a Freight-LCL job where Pacred
// issues ONE consolidated customs declaration (ใบขนรวม) under the shipping
// company name. This file reuses the SAME `customs_declarations` model the
// freight side uses (mig 0057) — bridged to cargo by mig 0162's
// `cargo_forwarder_id` + `cargo_cabinet_no` columns (one customs schema for
// freight + cargo). It clones the create/line-edit logic from
// `actions/admin/customs-declarations.ts` (freight) but:
//   - keys on cargo_forwarder_id (tb_forwarder.id) instead of freight_shipment_id
//   - seeds lines from tb_forwarder_item (mig 0158 per-line declared/HS), where
//     each line's declared value DEFAULTS from the captured COST (Pricing's
//     declared_value_thb · falls back to cost_unit_thb × qty) — Docs edits DOWN.
//
// ⚠️ P3 SCOPE = CAPTURE/SURFACE ONLY. NO issuance, NO money, NO comms, NO
// status flips. These actions never touch wallet/payment/quote/order-status.
// The declared value (มูลค่าสำแดง) is a SENSITIVE, audited manual field — it
// defaults from cost but is engineered DOWN by Docs (ADR-0016); it must NEVER
// be auto-set from the selling price. Every edit is logAdminAction'd.
//
// RBAC: super + accounting + freight_import_doc (Docs) + pricing. Docs owns the
// declared value; pricing/accounting/super can review + adjust.
// ════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { computeLineTaxes, roundThb } from "@/lib/validators/customs-declaration";

// Docs + cost roles own the cargo ใบขน. (super wildcards via is_admin / requireAdmin.)
const ROLES = ["super", "accounting", "freight_import_doc", "pricing"] as const;

type LineRow = {
  id:                 string;
  declared_value_thb: number;
  duty_thb:           number;
  vat_thb:            number;
};

/** Recompute header totals from line rows + persist. Best-effort (mirrors the
 *  freight `recomputeHeaderTotals`). */
async function recomputeHeaderTotals(
  admin: ReturnType<typeof createAdminClient>,
  declarationId: string,
): Promise<void> {
  const { data: rows, error: rowsErr } = await admin
    .from("customs_declaration_lines")
    .select("id, declared_value_thb, duty_thb, vat_thb")
    .eq("declaration_id", declarationId);
  if (rowsErr) {
    console.error("[cargo-declarations recomputeTotals]", { declarationId, code: rowsErr.code, message: rowsErr.message });
  }
  const list = ((rows ?? []) as unknown as LineRow[]).map((r) => ({
    declared_value_thb: Number(r.declared_value_thb ?? 0),
    duty_thb:           Number(r.duty_thb ?? 0),
    vat_thb:            Number(r.vat_thb ?? 0),
  }));
  const declared = roundThb(list.reduce((s, r) => s + r.declared_value_thb, 0));
  const duty     = roundThb(list.reduce((s, r) => s + r.duty_thb, 0));
  const vat      = roundThb(list.reduce((s, r) => s + r.vat_thb, 0));
  const { error: updErr } = await admin
    .from("customs_declarations")
    .update({
      total_declared_value_thb: declared,
      total_duty_thb:           duty,
      total_vat_thb:            vat,
    })
    .eq("id", declarationId);
  if (updErr) {
    console.error("[cargo-declarations recomputeTotals update]", { declarationId, code: updErr.code, message: updErr.message });
  }
}

// ────────────────────────────────────────────────────────────
// 1) Create a draft cargo ใบขนรวม for an import-forwarder, seeding lines
//    from tb_forwarder_item (declared defaults from the captured COST).
// ────────────────────────────────────────────────────────────

const createCargoDeclarationSchema = z.object({
  forwarderId: z.coerce.number().int().positive(),
});

export async function createCargoDeclaration(
  input: { forwarderId: number | string },
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createCargoDeclarationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { forwarderId } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the forwarder exists + grab its cabinet for the consolidation grain.
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fcabinetnumber")
      .eq("id", forwarderId)
      .maybeSingle<{ id: number; userid: string | null; fcabinetnumber: string | null }>();
    if (fwdErr) {
      console.error("[cargo-declarations create fwd lookup]", { forwarderId, code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code}` };
    }
    if (!fwd) return { ok: false, error: "forwarder_not_found" };

    // Refuse if there's already a non-cancelled cargo declaration for this fwd
    // (the partial unique index enforces it too; a clean error is friendlier).
    const { data: existing, error: existingErr } = await admin
      .from("customs_declarations")
      .select("id, status")
      .eq("cargo_forwarder_id", forwarderId)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    if (existingErr) {
      console.error("[cargo-declarations create existing lookup]", { forwarderId, code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code}` };
    }
    if (existing) {
      return { ok: false, error: `existing_declaration:${existing.status}:${existing.id}` };
    }

    // Insert the draft header (cargo-keyed · freight_shipment_id NULL).
    const cabinet = fwd.fcabinetnumber?.trim() || null;
    const { data: inserted, error: insErr } = await admin
      .from("customs_declarations")
      .insert({
        freight_shipment_id: null,
        cargo_forwarder_id:  forwarderId,
        cargo_cabinet_no:    cabinet,
        declaration_type:    "import",
        status:              "draft",
        declared_at:         new Date().toISOString(),
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    // Seed lines from tb_forwarder_item (per-line declared/HS from mig 0158).
    // declared DEFAULTS from the captured COST: prefer the explicit
    // declared_value_thb (Pricing set it), else cost_unit_thb × qty. Docs
    // edits this DOWN later — never from the selling price.
    type ItemRow = {
      id:                 number;
      productname:        string | null;
      productqty:         number | null;
      cost_unit_thb:      number | string | null;
      declared_value_thb: number | string | null;
      hs_code:            string | null;
    };
    const { data: items, error: itemsErr } = await admin
      .from("tb_forwarder_item")
      .select("id, productname, productqty, cost_unit_thb, declared_value_thb, hs_code")
      .eq("fid", forwarderId)
      .order("id", { ascending: true })
      .limit(500);
    if (itemsErr) {
      // Soft-fail — seeding is best-effort; declaration still useful empty.
      console.error("[cargo-declarations create items lookup]", { forwarderId, code: itemsErr.code, message: itemsErr.message });
    }
    const list = (items ?? []) as unknown as ItemRow[];

    if (list.length > 0) {
      const seedRows = list.map((it, idx) => {
        const qty = Math.max(0, Number(it.productqty ?? 0));
        const explicitDeclared = it.declared_value_thb != null ? Number(it.declared_value_thb) : null;
        const costUnit = it.cost_unit_thb != null ? Number(it.cost_unit_thb) : null;
        const declared = roundThb(
          explicitDeclared != null && explicitDeclared > 0
            ? explicitDeclared
            : costUnit != null
              ? costUnit * (qty > 0 ? qty : 1)
              : 0,
        );
        // duty_rate defaults 0 (Docs sets it after HS/Form-E review).
        const taxes = computeLineTaxes({ declared_value_thb: declared, duty_rate_pct: 0 });
        return {
          declaration_id:     inserted.id,
          position:           idx + 1,
          hs_code:            it.hs_code,
          description:        it.productname || "(สินค้า)",
          country_of_origin:  "CN",
          qty,
          unit:               "PCS",
          declared_value_thb: declared,
          duty_rate_pct:      0,
          duty_thb:           taxes.duty_thb,
          vat_thb:            taxes.vat_thb,
          fta_applied:        false,
        };
      });
      const { error: seedErr } = await admin
        .from("customs_declaration_lines")
        .insert(seedRows);
      if (seedErr) {
        console.error("[cargo-declarations create seed lines]", { declarationId: inserted.id, code: seedErr.code, message: seedErr.message });
      } else {
        await recomputeHeaderTotals(admin, inserted.id);
      }
    }

    await logAdminAction(adminId, "cargo_declaration.create_draft", "customs_declaration", inserted.id, {
      cargo_forwarder_id: forwarderId,
      cabinet_no:         cabinet,
      userid:             fwd.userid,
      seeded_lines:       list.length,
    });

    revalidatePath("/admin/freight/declarations");
    revalidatePath("/admin/accounting/cargo-declarations");
    revalidatePath(`/admin/freight/declarations/${inserted.id}`);
    revalidatePath(`/admin/forwarders/${forwarderId}`);
    return { ok: true, data: { id: inserted.id } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Update a line's DECLARED value / HS / duty-rate (draft only).
//    This is the Docs role's core edit — set the มูลค่าสำแดง DOWN per the
//    value-engineering plan. Recomputes duty/VAT + header totals.
// ────────────────────────────────────────────────────────────

// Optional numeric: "" / null / undefined → undefined (leave unchanged); else coerce.
const optNum = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().min(0).max(999_999_999).optional(),
);
const optText = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.string().trim().max(40).nullable(),
);

const setCargoDeclarationLineSchema = z.object({
  lineId:           z.string().uuid(),
  declaredValueThb: optNum,
  dutyRatePct: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.number().min(0).max(100).optional(),
  ),
  hsCode:           optText,
});

export async function setCargoDeclarationLine(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<AdminActionResult> {
  const parsed = setCargoDeclarationLineSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: line, error: lineErr } = await admin
      .from("customs_declaration_lines")
      .select("id, declaration_id, declared_value_thb, duty_rate_pct")
      .eq("id", d.lineId)
      .maybeSingle<{ id: string; declaration_id: string; declared_value_thb: number; duty_rate_pct: number }>();
    if (lineErr) {
      console.error("[cargo-declarations setLine line lookup]", { lineId: d.lineId, code: lineErr.code, message: lineErr.message });
      return { ok: false, error: `db_error:${lineErr.code}` };
    }
    if (!line) return { ok: false, error: "not_found" };

    // Verify the parent is a cargo declaration in draft.
    const { data: parent, error: parentErr } = await admin
      .from("customs_declarations")
      .select("id, status, cargo_forwarder_id")
      .eq("id", line.declaration_id)
      .maybeSingle<{ id: string; status: string; cargo_forwarder_id: number | null }>();
    if (parentErr) {
      console.error("[cargo-declarations setLine parent lookup]", { declarationId: line.declaration_id, code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code}` };
    }
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.cargo_forwarder_id == null) return { ok: false, error: "not_cargo_declaration" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    const newDeclared = d.declaredValueThb ?? Number(line.declared_value_thb);
    const newDutyPct  = d.dutyRatePct      ?? Number(line.duty_rate_pct);
    const taxes = computeLineTaxes({ declared_value_thb: newDeclared, duty_rate_pct: newDutyPct });

    const { error: updErr } = await admin
      .from("customs_declaration_lines")
      .update({
        declared_value_thb: roundThb(newDeclared),
        duty_rate_pct:      newDutyPct,
        duty_thb:           taxes.duty_thb,
        vat_thb:            taxes.vat_thb,
        hs_code:            d.hsCode,
      })
      .eq("id", d.lineId);
    if (updErr) {
      console.error("[cargo-declarations setLine update]", { lineId: d.lineId, code: updErr.code, message: updErr.message });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${updErr.message}` };
    }

    await recomputeHeaderTotals(admin, line.declaration_id);

    await logAdminAction(adminId, "cargo_declaration.line_set_declared", "customs_declaration", line.declaration_id, {
      line_id:            d.lineId,
      declared_value_thb: roundThb(newDeclared),
      duty_rate_pct:      newDutyPct,
      duty_thb:           taxes.duty_thb,
      vat_thb:            taxes.vat_thb,
      hs_code:            d.hsCode,
    });

    revalidatePath(`/admin/freight/declarations/${line.declaration_id}`);
    return { ok: true };
  });
}
