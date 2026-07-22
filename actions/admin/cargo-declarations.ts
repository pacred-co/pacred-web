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

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { computeLineTaxes, roundThb } from "@/lib/validators/customs-declaration";
import { resolvePaymentAccount } from "@/lib/payment/bank-accounts";
import { sendNotification } from "@/lib/notifications";

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
      // The SELECT-then-INSERT races; a concurrent create wins the partial-
      // unique index (mig 0162) → 23505. Map it to the same friendly
      // existing_declaration the SELECT path returns (no corruption — the index
      // held — UX only).
      if (insErr?.code === "23505") {
        // Soft-fail — this re-read only enriches the message with the winner's
        // id/status. The insert already lost the race (no corruption); if the
        // read also fails we still return the friendly existing_declaration.
        const { data: dup, error: dupErr } = await admin
          .from("customs_declarations")
          .select("id, status")
          .eq("cargo_forwarder_id", forwarderId)
          .neq("status", "cancelled")
          .limit(1)
          .maybeSingle<{ id: string; status: string }>();
        if (dupErr) {
          console.error("[cargo-declarations create dup lookup]", { forwarderId, code: dupErr.code, message: dupErr.message });
        }
        if (dup) return { ok: false, error: `existing_declaration:${dup.status}:${dup.id}` };
        return { ok: false, error: "existing_declaration:draft:" };
      }
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
    // the cargo create button navigates to the ACCOUNTING detail route — revalidate
    // that one (the freight detail route notFound()s cargo rows). audit SF-6.
    revalidatePath(`/admin/accounting/cargo-declarations/${inserted.id}`);
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
  // หมายเหตุมูลค่าสำแดง (owner 2026-06-28 #2 "ต้องใส่หมายเหตุ") — the basis/ground for
  // the declared value (e.g. supplier invoice ref). Reuses the line's `notes`.
  notes:            z.preprocess((v) => (v === undefined ? undefined : String(v)), z.string().max(2000).optional()),
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

    const linePatch: Record<string, unknown> = {
      declared_value_thb: roundThb(newDeclared),
      duty_rate_pct:      newDutyPct,
      duty_thb:           taxes.duty_thb,
      vat_thb:            taxes.vat_thb,
      hs_code:            d.hsCode,
    };
    // Only touch notes when the field was sent (avoid wiping it on a value-only save).
    if (d.notes !== undefined) linePatch.notes = d.notes || null;
    const { error: updErr } = await admin
      .from("customs_declaration_lines")
      .update(linePatch)
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

    revalidatePath(`/admin/accounting/cargo-declarations/${line.declaration_id}`);
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// ใบขนพ่วง (#17) — ออกใบขนเป็น "ชื่อลูกค้าเอง" (customer's own name).
//
// FLOW: admin toggles own-name + fills the customer's consignee snapshot →
// sets the ค่าบริการ (service_fee_thb) → sends the draft (invoice + packing +
// ใบขน PDFs) to the customer via a tokenized LINE link → customer confirms the
// total → only THEN may accounting collect: service-fee + (duty + VAT in the
// ใบขน) into the SERVICE account (3-account SOT · pass-through · §0e key persisted
// + read on the detail page · §0f confirm · idempotent on declaration_id).
//
// The duty + VAT here are the CUSTOMER's customs liability that WE collect and
// remit (pass-through) — NOT a Pacred VAT line. Computed only from the header's
// existing total_duty_thb + total_vat_thb (set by the line editor via
// computeLineTaxes). This file NEVER computes money inline.
// ════════════════════════════════════════════════════════════════════

const optStr = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.string().trim().max(500).nullable(),
);

// ── 1) own-name + service-fee on the draft (draft only · §0f confirm in UI) ──
const setOwnNameSchema = z.object({
  declarationId:       z.string().uuid(),
  issueInCustomerName: z.coerce.boolean(),
  consigneeName:       optStr,
  consigneeTaxId:      optStr,
  consigneeAddress:    z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.string().trim().max(2000).nullable(),
  ),
  // service_fee_thb — our brokerage fee (computeDeclarationFee total · ≥0). The
  // collectable is service_fee + header duty + header VAT (never recomputed here).
  serviceFeeThb: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.number().min(0).max(9_999_999).optional(),
  ),
});

export async function adminSetCustomsOwnName(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<AdminActionResult> {
  const parsed = setOwnNameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: decl, error: declErr } = await admin
      .from("customs_declarations")
      .select("id, status, cargo_forwarder_id, customer_confirm_status")
      .eq("id", d.declarationId)
      .maybeSingle<{ id: string; status: string; cargo_forwarder_id: number | null; customer_confirm_status: string | null }>();
    if (declErr) {
      console.error("[cargo-declarations setOwnName lookup]", { id: d.declarationId, code: declErr.code, message: declErr.message });
      return { ok: false, error: `db_error:${declErr.code}` };
    }
    if (!decl) return { ok: false, error: "not_found" };
    if (decl.cargo_forwarder_id == null) return { ok: false, error: "not_cargo_declaration" };
    if (decl.status !== "draft") return { ok: false, error: "not_draft" };
    // Editing the own-name fields after a draft is already sent/confirmed would
    // desync what the customer agreed to — block it.
    if (decl.customer_confirm_status !== "none") {
      return { ok: false, error: "already_sent_to_customer" };
    }

    const patch: Record<string, unknown> = {
      issue_in_customer_name: d.issueInCustomerName,
      consignee_name:         d.consigneeName,
      consignee_tax_id:       d.consigneeTaxId,
      consignee_address:      d.consigneeAddress,
    };
    if (d.serviceFeeThb !== undefined) patch.service_fee_thb = roundThb(d.serviceFeeThb);

    const { error: updErr } = await admin
      .from("customs_declarations")
      .update(patch)
      .eq("id", d.declarationId);
    if (updErr) {
      console.error("[cargo-declarations setOwnName update]", { id: d.declarationId, code: updErr.code, message: updErr.message });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${updErr.message}` };
    }

    await logAdminAction(adminId, "cargo_declaration.set_own_name", "customs_declaration", d.declarationId, {
      issue_in_customer_name: d.issueInCustomerName,
      consignee_name:         d.consigneeName,
      consignee_tax_id:       d.consigneeTaxId,
      service_fee_thb:        d.serviceFeeThb !== undefined ? roundThb(d.serviceFeeThb) : undefined,
    });

    revalidatePath(`/admin/accounting/cargo-declarations/${d.declarationId}`);
    return { ok: true };
  });
}

// ── 2) send the draft to the customer (mint confirm_token + LINE notify) ──
const sendDraftSchema = z.object({ declarationId: z.string().uuid() });

export async function adminSendCustomsDraftToCustomer(
  raw: { declarationId: string },
): Promise<AdminActionResult<{ token: string }>> {
  const parsed = sendDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { declarationId } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: decl, error: declErr } = await admin
      .from("customs_declarations")
      .select(
        "id, declaration_no, status, cargo_forwarder_id, issue_in_customer_name, " +
          "service_fee_thb, total_duty_thb, total_vat_thb, customer_confirm_status, confirm_token",
      )
      .eq("id", declarationId)
      .maybeSingle<{
        id: string; declaration_no: string | null; status: string; cargo_forwarder_id: number | null;
        issue_in_customer_name: boolean; service_fee_thb: number | string | null;
        total_duty_thb: number | string | null; total_vat_thb: number | string | null;
        customer_confirm_status: string | null; confirm_token: string | null;
      }>();
    if (declErr) {
      console.error("[cargo-declarations sendDraft lookup]", { id: declarationId, code: declErr.code, message: declErr.message });
      return { ok: false, error: `db_error:${declErr.code}` };
    }
    if (!decl) return { ok: false, error: "not_found" };
    if (decl.cargo_forwarder_id == null) return { ok: false, error: "not_cargo_declaration" };
    if (!decl.issue_in_customer_name) return { ok: false, error: "not_own_name_declaration" };
    if (decl.status !== "draft") return { ok: false, error: "not_draft" };
    if (decl.customer_confirm_status === "confirmed") {
      return { ok: false, error: "already_confirmed" };
    }

    // Resolve the customer profile from the forwarder (member_code = userid).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, userid")
      .eq("id", decl.cargo_forwarder_id)
      .maybeSingle<{ id: number; userid: string | null }>();
    if (fwdErr) {
      console.error("[cargo-declarations sendDraft fwd]", { fid: decl.cargo_forwarder_id, code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code}` };
    }
    const userid = fwd?.userid?.trim();
    if (!userid) return { ok: false, error: "forwarder_has_no_customer" };

    let profileId: string | null = null;
    const { data: userRow, error: userErr } = await admin
      .from("tb_users").select("profile_id").eq("userID", userid).maybeSingle<{ profile_id: string | null }>();
    if (userErr) console.error("[cargo-declarations sendDraft tb_users]", { userid, code: userErr.code, message: userErr.message });
    if (userRow?.profile_id) profileId = userRow.profile_id;
    if (!profileId) {
      const { data: profileRow, error: profileErr } = await admin
        .from("profiles").select("id").eq("member_code", userid).maybeSingle<{ id: string }>();
      if (profileErr) console.error("[cargo-declarations sendDraft profiles]", { userid, code: profileErr.code, message: profileErr.message });
      if (profileRow?.id) profileId = profileRow.id;
    }
    if (!profileId) {
      return { ok: false, error: `ไม่พบ profile ของลูกค้า ${userid} — ส่งลิงก์ยืนยันทาง LINE ไม่ได้` };
    }

    // Mint the token (reuse if a prior 'sent'/'rejected' draft already has one).
    const token = decl.confirm_token ?? randomUUID();

    const { data: claimed, error: updErr } = await admin
      .from("customs_declarations")
      .update({ customer_confirm_status: "sent", confirm_token: token })
      .eq("id", declarationId)
      .eq("status", "draft")               // guard: only a draft can be sent
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updErr) {
      console.error("[cargo-declarations sendDraft update]", { id: declarationId, code: updErr.code, message: updErr.message });
      return { ok: false, error: `ส่งไม่สำเร็จ: ${updErr.message}` };
    }
    // 0 rows matched (a concurrent change moved it off 'draft') → don't mint a
    // token / notify the customer for a draft that wasn't actually sent.
    if (!claimed) return { ok: false, error: "ไม่ใช่ฉบับร่าง (อาจถูกส่งหรือเปลี่ยนสถานะแล้ว)" };

    const collectable = roundThb(
      Number(decl.service_fee_thb ?? 0) + Number(decl.total_duty_thb ?? 0) + Number(decl.total_vat_thb ?? 0),
    );
    const docTag = decl.declaration_no ?? declarationId.slice(0, 8);

    // Notify the customer — sendNotification logs the row + pushes via LINE OA
    // (link_href becomes the full https URL). The draft = the existing PDF links
    // surfaced on the confirm page.
    const notif = await sendNotification(profileId, {
      category:  "payment",
      severity:  "info",
      title:     `📄 ใบขน (ในชื่อท่าน) ${docTag} — โปรดตรวจสอบและยืนยันยอด`,
      body:      `บริษัทจัดทำใบขน อินวอยซ์ และแพคกิ้งลิสต์ในชื่อของท่านแล้ว ยอดที่ต้องชำระ ฿${collectable.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (ค่าบริการ + อากร + VAT) กดลิงก์เพื่อดูเอกสารและยืนยันยอด`,
      link_href: `/customs-confirm/${token}`,
    });

    await logAdminAction(adminId, "cargo_declaration.send_draft_to_customer", "customs_declaration", declarationId, {
      userid,
      collectable_thb:   collectable,
      service_fee_thb:   Number(decl.service_fee_thb ?? 0),
      total_duty_thb:    Number(decl.total_duty_thb ?? 0),
      total_vat_thb:     Number(decl.total_vat_thb ?? 0),
      delivered_line:    notif.deliveredLine,
      delivered_email:   notif.deliveredEmail,
      notification_id:   notif.id,
    });

    revalidatePath(`/admin/accounting/cargo-declarations/${declarationId}`);
    return { ok: true, data: { token } };
  });
}

// ── 3) collect (confirmed-gated · idempotent on declaration_id · → SERVICE) ──
const collectSchema = z.object({ declarationId: z.string().uuid() });

export async function adminCollectConfirmedCustomsDraft(
  raw: { declarationId: string },
): Promise<AdminActionResult<{ accountKey: string; collectableThb: number }>> {
  const parsed = collectSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { declarationId } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: decl, error: declErr } = await admin
      .from("customs_declarations")
      .select(
        "id, declaration_no, cargo_forwarder_id, issue_in_customer_name, customer_confirm_status, " +
          "service_fee_thb, total_duty_thb, total_vat_thb, service_collected_at, notes",
      )
      .eq("id", declarationId)
      .maybeSingle<{
        id: string; declaration_no: string | null; cargo_forwarder_id: number | null;
        issue_in_customer_name: boolean; customer_confirm_status: string | null;
        service_fee_thb: number | string | null; total_duty_thb: number | string | null;
        total_vat_thb: number | string | null; service_collected_at: string | null; notes: string | null;
      }>();
    if (declErr) {
      console.error("[cargo-declarations collect lookup]", { id: declarationId, code: declErr.code, message: declErr.message });
      return { ok: false, error: `db_error:${declErr.code}` };
    }
    if (!decl) return { ok: false, error: "not_found" };
    if (decl.cargo_forwarder_id == null) return { ok: false, error: "not_cargo_declaration" };
    if (!decl.issue_in_customer_name) return { ok: false, error: "not_own_name_declaration" };
    // GATE: collect only after the customer confirmed the amount.
    if (decl.customer_confirm_status !== "confirmed") {
      return { ok: false, error: "not_confirmed" };
    }
    // IDEMPOTENT on declaration_id — service_collected_at = the dedicated #17 collected
    // latch (mig 0237 · NOT the unrelated admin-editable paid_through_promptpay attribute).
    if (decl.service_collected_at) {
      return { ok: false, error: "already_collected" };
    }

    // Route via the 3-account SOT — own-name ใบขน issues NO ใบกำกับ → SERVICE
    // (pass-through: we collect the customer's duty + VAT and remit). Never hardcoded.
    const account = resolvePaymentAccount({ issuesTaxInvoice: false });
    const collectable = roundThb(
      Number(decl.service_fee_thb ?? 0) + Number(decl.total_duty_thb ?? 0) + Number(decl.total_vat_thb ?? 0),
    );

    // Persist the routing fact READABLY (§0e) — customs_declarations has no
    // bank_account_key column (mig 0236 added it only to the tax-invoice stores),
    // so record it on the declaration's notes as a structured, displayed line +
    // stamp service_collected_at (the dedicated #17 collected/idempotency latch).
    // The detail page reads + shows both, and the audit log carries the full fact.
    const stamp = new Date().toISOString();
    const routeLine =
      `[เก็บค่าบริการ+อากร+VAT ฿${collectable.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ` +
      `→ บัญชี ${account.label} key=${account.key} (${account.accountNo}) · ${stamp}]`;
    const newNotes = decl.notes ? `${decl.notes}\n${routeLine}` : routeLine;

    const { data: claimed, error: updErr } = await admin
      .from("customs_declarations")
      .update({ service_collected_at: stamp, notes: newNotes })
      .eq("id", declarationId)
      .eq("customer_confirm_status", "confirmed")
      .is("service_collected_at", null)           // TOCTOU guard — atomic claim
      .select("id")
      .maybeSingle<{ id: string }>();
    if (updErr) {
      console.error("[cargo-declarations collect update]", { id: declarationId, code: updErr.code, message: updErr.message });
      return { ok: false, error: `บันทึกการเก็บเงินไม่สำเร็จ: ${updErr.message}` };
    }
    if (!claimed) return { ok: false, error: "already_collected" };   // lost the race

    await logAdminAction(adminId, "cargo_declaration.collect_service_account", "customs_declaration", declarationId, {
      bank_account_key: account.key,
      account_no:       account.accountNo,
      collectable_thb:  collectable,
      service_fee_thb:  Number(decl.service_fee_thb ?? 0),
      total_duty_thb:   Number(decl.total_duty_thb ?? 0),
      total_vat_thb:    Number(decl.total_vat_thb ?? 0),
    });

    revalidatePath(`/admin/accounting/cargo-declarations/${declarationId}`);
    return { ok: true, data: { accountKey: account.key, collectableThb: collectable } };
  });
}
