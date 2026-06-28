"use server";

/**
 * V-E11 — Customs declarations admin actions.
 *
 * Per [docs/port-specs/freight-customs-declaration.md] + migration 0057.
 *
 * Surface area V1:
 *   adminCreateDeclaration       — create a draft declaration for a shipment;
 *                                  seeds lines from freight_invoice_lines + hs_codes
 *   adminUpdateDeclarationHeader — edit header fields (draft only)
 *   adminAddDeclarationLine      — add a line (draft only)
 *   adminUpdateDeclarationLine   — edit a line (draft only; recomputes duty/VAT + header totals)
 *   adminDeleteDeclarationLine   — delete a line (draft only; recomputes header totals)
 *   adminSubmitDeclaration       — draft → submitted (reserves declaration_no, locks lines)
 *   adminMarkAccepted            — submitted → accepted (broker control_no optional)
 *   adminMarkReleased            — accepted → released
 *   adminCancelDeclaration       — any non-released → cancelled (with reason)
 *
 * RBAC: super + accounting (W-1 keystone — explicit per role rule).
 *
 * Submission freezes:
 *   - declaration_no reserved via next_customs_declaration_no() RPC
 *   - status → submitted; lines become immutable (action surface enforces draft-only)
 *
 * All mutations log to admin_audit_log per ADR-0014.
 *
 * NOT included in V1 (per spec):
 *   - NetBay / Customs Trader Portal API integration (Phase III — U3-1/U3-2)
 *   - Multi-currency declared values (V1 = THB only)
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createDeclarationSchema,        type CreateDeclarationInput,
  updateDeclarationHeaderSchema,  type UpdateDeclarationHeaderInput,
  addDeclarationLineSchema,       type AddDeclarationLineInput,
  updateDeclarationLineSchema,    type UpdateDeclarationLineInput,
  deleteDeclarationLineSchema,    type DeleteDeclarationLineInput,
  submitDeclarationSchema,        type SubmitDeclarationInput,
  markDeclarationAcceptedSchema,  type MarkDeclarationAcceptedInput,
  markDeclarationReleasedSchema,  type MarkDeclarationReleasedInput,
  cancelDeclarationSchema,        type CancelDeclarationInput,
  computeLineTaxes,
  roundThb,
} from "@/lib/validators/customs-declaration";

// Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles own customs
// declaration issuance (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
// All declaration actions (create/update/submit/accept/release/cancel) are
// Doc-workflow operations; none of them write to wallet/payment.
const ROLES = ["super", "accounting", "freight_export_doc", "freight_import_doc"] as const;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

type LineRow = {
  id:                 string;
  declared_value_thb: number;
  duty_thb:           number;
  vat_thb:            number;
};

/** Recompute header totals from line rows and persist. Best-effort. */
async function recomputeHeaderTotals(
  admin: ReturnType<typeof createAdminClient>,
  declarationId: string,
): Promise<{ declared: number; duty: number; vat: number }> {
  const { data: rows, error: rowsErr } = await admin
    .from("customs_declaration_lines")
    .select("id, declared_value_thb, duty_thb, vat_thb")
    .eq("declaration_id", declarationId);
  if (rowsErr) {
    console.error("[customs-declarations recomputeTotals] declarationId=", declarationId, { code: rowsErr.code, message: rowsErr.message });
    // Don't throw — best-effort totals — but the caller may persist stale numbers
  }
  const list = ((rows ?? []) as unknown as LineRow[]).map((r) => ({
    declared_value_thb: Number(r.declared_value_thb ?? 0),
    duty_thb:           Number(r.duty_thb ?? 0),
    vat_thb:            Number(r.vat_thb ?? 0),
  }));
  const declared = roundThb(list.reduce((s, r) => s + r.declared_value_thb, 0));
  const duty     = roundThb(list.reduce((s, r) => s + r.duty_thb, 0));
  const vat      = roundThb(list.reduce((s, r) => s + r.vat_thb, 0));
  await admin
    .from("customs_declarations")
    .update({
      total_declared_value_thb: declared,
      total_duty_thb:           duty,
      total_vat_thb:            vat,
    })
    .eq("id", declarationId);
  return { declared, duty, vat };
}

// ────────────────────────────────────────────────────────────
// 1) Create draft (seeds lines from freight_invoice_lines if present)
// ────────────────────────────────────────────────────────────

export async function adminCreateDeclaration(
  input: CreateDeclarationInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createDeclarationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the parent shipment exists.
    const { data: shipment, error: shipmentErr } = await admin
      .from("freight_shipments")
      .select("id, job_no, status")
      .eq("id", d.freight_shipment_id)
      .maybeSingle<{ id: string; job_no: string | null; status: string }>();
    if (shipmentErr) {
      console.error("[customs-declarations create shipment lookup] id=", d.freight_shipment_id, { code: shipmentErr.code, message: shipmentErr.message });
      return { ok: false, error: `db_error:${shipmentErr.code}` };
    }
    if (!shipment) return { ok: false, error: "shipment_not_found" };
    if (shipment.status === "cancelled") return { ok: false, error: "shipment_cancelled" };

    // Refuse if there's already a non-cancelled declaration (partial unique
    // index enforces this DB-side too, but a clean error is friendlier).
    const { data: existing, error: existingErr } = await admin
      .from("customs_declarations")
      .select("id, status")
      .eq("freight_shipment_id", d.freight_shipment_id)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    if (existingErr) {
      console.error("[customs-declarations create existing lookup] shipmentId=", d.freight_shipment_id, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code}` };
    }
    if (existing) {
      return { ok: false, error: `existing_declaration:${existing.status}:${existing.id}` };
    }

    // Insert the draft header.
    const { data: inserted, error: insErr } = await admin
      .from("customs_declarations")
      .insert({
        freight_shipment_id: d.freight_shipment_id,
        declaration_type:    d.declaration_type,
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

    // Seed lines from the latest non-cancelled freight_invoice_lines for
    // this shipment, if any exist. Each FI line → one CD line. Snapshot:
    //   description, qty, unit, gross_weight_kg, hs_code, USD→THB-converted
    //   value (commercial_value_thb is held at the invoice level — pro-rata
    //   share by line amount_usd).
    type InvoiceRow = {
      id:                   string;
      commercial_value_thb: number | null;
      exchange_rate:        number | null;
      hs_code:              string | null;
    };
    const { data: inv, error: invErr } = await admin
      .from("freight_invoices")
      .select("id, commercial_value_thb, exchange_rate, hs_code")
      .eq("freight_shipment_id", d.freight_shipment_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<InvoiceRow>();

    if (inv) {
      type FiLineRow = {
        position:        number;
        description:     string;
        qty:             number;
        unit:            string;
        amount_usd:      number;
        gross_weight_kg: number | null;
        hs_code:         string | null;
      };
      const { data: fiLines, error: fiLinesErr } = await admin
        .from("freight_invoice_lines")
        .select("position, description, qty, unit, amount_usd, gross_weight_kg, hs_code")
        .eq("freight_invoice_id", inv.id)
        .order("position", { ascending: true });
      if (fiLinesErr) {
        // Soft-fail — seeding lines is best-effort; declaration still useful empty.
        console.error("[customs-declarations create freight_invoice_lines lookup] invoiceId=", inv.id, { code: fiLinesErr.code, message: fiLinesErr.message });
      }
      const list = (fiLines ?? []) as unknown as FiLineRow[];

      if (list.length > 0) {
        const totalUsd = list.reduce((s, l) => s + Number(l.amount_usd ?? 0), 0);
        const invTotalThb = Number(inv.commercial_value_thb ?? 0);
        const rate        = Number(inv.exchange_rate ?? 0);

        // Best-effort look-up of duty rate per line's hs_code.
        const codes = Array.from(new Set(list.map((l) => l.hs_code).filter((c): c is string => !!c)));
        const dutyByCode = new Map<string, number>();
        if (codes.length > 0) {
          const { data: rates, error: ratesErr } = await admin
            .from("hs_codes")
            .select("code, default_duty_pct")
            .in("code", codes);
          if (ratesErr) {
            // Soft-fail — duty rates default to 0 (admin can edit later).
            console.error("[customs-declarations create hs_codes lookup] codes=", codes, { code: ratesErr.code, message: ratesErr.message });
          }
          for (const r of (rates ?? []) as Array<{ code: string; default_duty_pct: number | null }>) {
            dutyByCode.set(r.code, Number(r.default_duty_pct ?? 0));
          }
        }

        const seedRows = list.map((l, idx) => {
          // Pro-rata share of invoice-level commercial_value_thb; fall back
          // to per-line USD × rate if total is unset.
          const share = totalUsd > 0 ? Number(l.amount_usd) / totalUsd : (1 / list.length);
          const declared = invTotalThb > 0
            ? roundThb(invTotalThb * share)
            : roundThb(Number(l.amount_usd) * rate);
          const dutyRate = l.hs_code ? (dutyByCode.get(l.hs_code) ?? 0) : 0;
          const taxes = computeLineTaxes({ declared_value_thb: declared, duty_rate_pct: dutyRate });
          return {
            declaration_id:     inserted.id,
            position:           l.position ?? (idx + 1),
            hs_code:            l.hs_code,
            description:        l.description,
            country_of_origin:  "CN",
            qty:                Number(l.qty ?? 0),
            unit:               l.unit,
            gross_weight_kg:    l.gross_weight_kg,
            net_weight_kg:      null,
            declared_value_thb: declared,
            duty_rate_pct:      dutyRate,
            duty_thb:           taxes.duty_thb,
            vat_thb:            taxes.vat_thb,
            fta_applied:        false,
          };
        });

        if (seedRows.length > 0) {
          await admin.from("customs_declaration_lines").insert(seedRows);
          await recomputeHeaderTotals(admin, inserted.id);
        }
      }
    }

    await logAdminAction(adminId, "customs_declaration.create_draft", "customs_declaration", inserted.id, {
      freight_shipment_id: d.freight_shipment_id,
      job_no:              shipment.job_no,
      declaration_type:    d.declaration_type,
      seeded_from_invoice: inv?.id ?? null,
    });

    revalidatePath("/admin/freight/declarations");
    revalidatePath(`/admin/freight/declarations/${inserted.id}`);
    revalidatePath(`/admin/freight/shipments/${d.freight_shipment_id}`);
    return { ok: true, data: { id: inserted.id } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Update header (draft only)
// ────────────────────────────────────────────────────────────

export async function adminUpdateDeclarationHeader(
  input: UpdateDeclarationHeaderInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateDeclarationHeaderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("customs_declarations")
      .select("id, status, freight_shipment_id")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string }>();
    if (rowErr) {
      console.error("[customs-declarations updateHeader row lookup] id=", d.id, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "draft") return { ok: false, error: "not_draft" };

    const patch: Record<string, unknown> = { updated_by_admin_id: adminId };
    if (d.declaration_type           !== undefined) patch.declaration_type           = d.declaration_type;
    if (d.customs_office             !== undefined) patch.customs_office             = d.customs_office;
    if (d.broker_name                !== undefined) patch.broker_name                = d.broker_name;
    if (d.broker_license_no          !== undefined) patch.broker_license_no          = d.broker_license_no;
    if (d.ship_or_truck_arrival_date !== undefined) patch.ship_or_truck_arrival_date = d.ship_or_truck_arrival_date;
    if (d.port_of_entry              !== undefined) patch.port_of_entry              = d.port_of_entry;
    if (d.paid_through_promptpay     !== undefined) patch.paid_through_promptpay     = d.paid_through_promptpay;
    if (d.total_other_taxes_thb      !== undefined) patch.total_other_taxes_thb      = d.total_other_taxes_thb;
    if (d.notes                      !== undefined) patch.notes                      = d.notes;

    const { error: updErr } = await admin
      .from("customs_declarations")
      .update(patch)
      .eq("id", d.id);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "customs_declaration.update_header", "customs_declaration", d.id, { patch });

    revalidatePath(`/admin/freight/declarations/${d.id}`);
    revalidatePath(`/admin/freight/shipments/${row.freight_shipment_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Line CRUD (draft only)
// ────────────────────────────────────────────────────────────

export async function adminAddDeclarationLine(
  input: AddDeclarationLineInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = addDeclarationLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: parent, error: parentErr } = await admin
      .from("customs_declarations")
      .select("id, status, freight_shipment_id")
      .eq("id", d.declaration_id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string }>();
    if (parentErr) {
      console.error("[customs-declarations addLine parent lookup] declarationId=", d.declaration_id, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code}` };
    }
    if (!parent) return { ok: false, error: "not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    let position = d.position ?? 1;
    if (!d.position) {
      const { data: maxRow, error: maxRowErr } = await admin
        .from("customs_declaration_lines")
        .select("position")
        .eq("declaration_id", d.declaration_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle<{ position: number }>();
      if (maxRowErr) {
        // Soft-fail — default position to 1 (next-position calc is convenience).
        console.error("[customs-declarations addLine maxPos lookup] declarationId=", d.declaration_id, { code: maxRowErr.code, message: maxRowErr.message });
      }
      position = (maxRow?.position ?? 0) + 1;
    }

    const taxes = computeLineTaxes({
      declared_value_thb: d.declared_value_thb,
      duty_rate_pct:      d.duty_rate_pct,
    });

    const { data: inserted, error: insErr } = await admin
      .from("customs_declaration_lines")
      .insert({
        declaration_id:     d.declaration_id,
        position,
        hs_code:            d.hs_code ?? null,
        description:        d.description,
        country_of_origin:  d.country_of_origin ?? "CN",
        qty:                d.qty,
        unit:               d.unit,
        gross_weight_kg:    d.gross_weight_kg ?? null,
        net_weight_kg:      d.net_weight_kg ?? null,
        declared_value_thb: d.declared_value_thb,
        duty_rate_pct:      d.duty_rate_pct,
        duty_thb:           taxes.duty_thb,
        vat_thb:            taxes.vat_thb,
        fta_applied:        d.fta_applied ?? false,
        notes:              d.notes ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await recomputeHeaderTotals(admin, d.declaration_id);

    await logAdminAction(adminId, "customs_declaration.line_add", "customs_declaration", d.declaration_id, {
      line_id:            inserted.id,
      description:        d.description,
      declared_value_thb: d.declared_value_thb,
      duty_thb:           taxes.duty_thb,
      vat_thb:            taxes.vat_thb,
    });

    revalidatePath(`/admin/freight/declarations/${d.declaration_id}`);
    revalidatePath(`/admin/freight/shipments/${parent.freight_shipment_id}`);
    return { ok: true, data: { id: inserted.id } };
  });
}

export async function adminUpdateDeclarationLine(
  input: UpdateDeclarationLineInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateDeclarationLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("customs_declaration_lines")
      .select("id, declaration_id, declared_value_thb, duty_rate_pct")
      .eq("id", d.id)
      .maybeSingle<{ id: string; declaration_id: string; declared_value_thb: number; duty_rate_pct: number }>();
    if (rowErr) {
      console.error("[customs-declarations updateLine row lookup] id=", d.id, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code}` };
    }
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent, error: parentErr } = await admin
      .from("customs_declarations")
      .select("status, freight_shipment_id")
      .eq("id", row.declaration_id)
      .maybeSingle<{ status: string; freight_shipment_id: string }>();
    if (parentErr) {
      console.error("[customs-declarations updateLine parent lookup] declarationId=", row.declaration_id, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code}` };
    }
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    const newDeclared = d.declared_value_thb ?? Number(row.declared_value_thb);
    const newDutyPct  = d.duty_rate_pct      ?? Number(row.duty_rate_pct);
    const taxes = computeLineTaxes({
      declared_value_thb: newDeclared,
      duty_rate_pct:      newDutyPct,
    });

    const patch: Record<string, unknown> = {
      declared_value_thb: newDeclared,
      duty_rate_pct:      newDutyPct,
      duty_thb:           taxes.duty_thb,
      vat_thb:            taxes.vat_thb,
    };
    if (d.hs_code           !== undefined) patch.hs_code           = d.hs_code;
    if (d.description       !== undefined) patch.description       = d.description;
    if (d.country_of_origin !== undefined) patch.country_of_origin = d.country_of_origin;
    if (d.qty               !== undefined) patch.qty               = d.qty;
    if (d.unit              !== undefined) patch.unit              = d.unit;
    if (d.gross_weight_kg   !== undefined) patch.gross_weight_kg   = d.gross_weight_kg;
    if (d.net_weight_kg     !== undefined) patch.net_weight_kg     = d.net_weight_kg;
    if (d.fta_applied       !== undefined) patch.fta_applied       = d.fta_applied;
    if (d.notes             !== undefined) patch.notes             = d.notes;

    const { error: updErr } = await admin
      .from("customs_declaration_lines")
      .update(patch)
      .eq("id", d.id);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await recomputeHeaderTotals(admin, row.declaration_id);

    await logAdminAction(adminId, "customs_declaration.line_update", "customs_declaration", row.declaration_id, {
      line_id: d.id,
      patch,
    });

    revalidatePath(`/admin/freight/declarations/${row.declaration_id}`);
    revalidatePath(`/admin/freight/shipments/${parent.freight_shipment_id}`);
    return { ok: true };
  });
}

export async function adminDeleteDeclarationLine(
  input: DeleteDeclarationLineInput,
): Promise<AdminActionResult<void>> {
  const parsed = deleteDeclarationLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("customs_declaration_lines")
      .select("id, declaration_id")
      .eq("id", parsed.data.id)
      .maybeSingle<{ id: string; declaration_id: string }>();
    if (rowErr) {
      console.error("[customs-declarations deleteLine row lookup] id=", parsed.data.id, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code}` };
    }
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent, error: parentErr } = await admin
      .from("customs_declarations")
      .select("status, freight_shipment_id")
      .eq("id", row.declaration_id)
      .maybeSingle<{ status: string; freight_shipment_id: string }>();
    if (parentErr) {
      console.error("[customs-declarations deleteLine parent lookup] declarationId=", row.declaration_id, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code}` };
    }
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    const { error: delErr } = await admin
      .from("customs_declaration_lines")
      .delete()
      .eq("id", parsed.data.id);
    if (delErr) return { ok: false, error: `delete_failed: ${delErr.message}` };

    await recomputeHeaderTotals(admin, row.declaration_id);

    await logAdminAction(adminId, "customs_declaration.line_delete", "customs_declaration", row.declaration_id, {
      line_id: parsed.data.id,
    });

    revalidatePath(`/admin/freight/declarations/${row.declaration_id}`);
    revalidatePath(`/admin/freight/shipments/${parent.freight_shipment_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Status flips
// ────────────────────────────────────────────────────────────

export async function adminSubmitDeclaration(
  input: SubmitDeclarationInput,
): Promise<AdminActionResult<{ declaration_no: string }>> {
  const parsed = submitDeclarationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("customs_declarations")
      .select("id, status, freight_shipment_id")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string }>();
    if (rowErr) {
      console.error("[customs-declarations submit row lookup] id=", d.id, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "draft") return { ok: false, error: "not_draft" };

    // Must have at least one line.
    const { count: linesCount, error: countErr } = await admin
      .from("customs_declaration_lines")
      .select("*", { count: "exact", head: true })
      .eq("declaration_id", d.id);
    if (countErr) {
      console.error("[customs-declarations submit lines count] declarationId=", d.id, { code: countErr.code, message: countErr.message });
      return { ok: false, error: `db_error:${countErr.code}` };
    }
    if (!linesCount || linesCount === 0) {
      return { ok: false, error: "no_lines" };
    }

    // Reserve declaration_no.
    const { data: declarationNo, error: serialErr } = await admin.rpc("next_customs_declaration_no");
    if (serialErr || typeof declarationNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    const now = new Date().toISOString();
    const { error: updErr } = await admin
      .from("customs_declarations")
      .update({
        status:                "submitted",
        declaration_no:        declarationNo,
        customs_office:        d.customs_office,
        broker_name:           d.broker_name ?? null,
        submitted_at:          now,
        submitted_by_admin_id: adminId,
        updated_by_admin_id:   adminId,
      })
      .eq("id", d.id)
      .eq("status", "draft");
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message} (serial ${declarationNo} reserved — gap logged)` };
    }

    await logAdminAction(adminId, "customs_declaration.submit", "customs_declaration", d.id, {
      declaration_no: declarationNo,
      customs_office: d.customs_office,
      broker_name:    d.broker_name,
    });

    revalidatePath("/admin/freight/declarations");
    revalidatePath(`/admin/freight/declarations/${d.id}`);
    revalidatePath(`/admin/freight/shipments/${row.freight_shipment_id}`);
    return { ok: true, data: { declaration_no: declarationNo } };
  });
}

export async function adminMarkAccepted(
  input: MarkDeclarationAcceptedInput,
): Promise<AdminActionResult<void>> {
  const parsed = markDeclarationAcceptedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("customs_declarations")
      .select("id, status, freight_shipment_id")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string }>();
    if (rowErr) {
      console.error("[customs-declarations markAccepted row lookup] id=", d.id, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "submitted") return { ok: false, error: "not_submitted" };

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status:               "accepted",
      accepted_at:          now,
      accepted_by_admin_id: adminId,
      updated_by_admin_id:  adminId,
    };
    if (d.customs_control_no !== undefined && d.customs_control_no !== null) {
      patch.customs_control_no = d.customs_control_no;
    }

    const { error: updErr } = await admin
      .from("customs_declarations")
      .update(patch)
      .eq("id", d.id)
      .eq("status", "submitted");
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "customs_declaration.mark_accepted", "customs_declaration", d.id, {
      customs_control_no: d.customs_control_no ?? null,
    });

    revalidatePath("/admin/freight/declarations");
    revalidatePath(`/admin/freight/declarations/${d.id}`);
    revalidatePath(`/admin/freight/shipments/${row.freight_shipment_id}`);
    return { ok: true };
  });
}

export async function adminMarkReleased(
  input: MarkDeclarationReleasedInput,
): Promise<AdminActionResult<void>> {
  const parsed = markDeclarationReleasedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("customs_declarations")
      .select("id, status, freight_shipment_id")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string }>();
    if (rowErr) {
      console.error("[customs-declarations markReleased row lookup] id=", d.id, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status !== "accepted") return { ok: false, error: "not_accepted" };

    const now = new Date().toISOString();
    const { error: updErr } = await admin
      .from("customs_declarations")
      .update({
        status:               "released",
        released_at:          now,
        released_by_admin_id: adminId,
        updated_by_admin_id:  adminId,
      })
      .eq("id", d.id)
      .eq("status", "accepted");
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "customs_declaration.mark_released", "customs_declaration", d.id, {});

    revalidatePath("/admin/freight/declarations");
    revalidatePath(`/admin/freight/declarations/${d.id}`);
    revalidatePath(`/admin/freight/shipments/${row.freight_shipment_id}`);
    return { ok: true };
  });
}

export async function adminCancelDeclaration(
  input: CancelDeclarationInput,
): Promise<AdminActionResult<void>> {
  const parsed = cancelDeclarationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("customs_declarations")
      .select("id, status, freight_shipment_id, declaration_no")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string; declaration_no: string | null }>();
    if (rowErr) {
      console.error("[customs-declarations cancel row lookup] id=", d.id, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status === "released")  return { ok: false, error: "already_released" };
    if (row.status === "cancelled") return { ok: false, error: "already_cancelled" };

    const now = new Date().toISOString();
    const { error: updErr } = await admin
      .from("customs_declarations")
      .update({
        status:                "cancelled",
        cancelled_at:          now,
        cancelled_by_admin_id: adminId,
        cancelled_reason:      d.cancelled_reason,
        updated_by_admin_id:   adminId,
      })
      .eq("id", d.id)
      .neq("status", "cancelled")
      .neq("status", "released");
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "customs_declaration.cancel", "customs_declaration", d.id, {
      declaration_no: row.declaration_no,
      reason:         d.cancelled_reason,
    });

    revalidatePath("/admin/freight/declarations");
    revalidatePath(`/admin/freight/declarations/${d.id}`);
    revalidatePath(`/admin/freight/shipments/${row.freight_shipment_id}`);
    return { ok: true };
  });
}

// ── declared-value justification images (owner 2026-06-28 #2 · mig 0222) ────────
// "มูลค่าสำแดง แนบรูปได้หลายรูป" — supplier-invoice/packing evidence per line. The
// หมายเหตุ uses the line's existing `notes`; these manage the multi-image store.
// Draft-only (matches line edit). Mirrors adminAddForwarderImage's upload pattern.
const DECL_IMG_CAP = 8;
function parseLineImages(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") { try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []; } catch { return []; } }
  return [];
}

type DraftLine = { id: string; declaration_id: string; declared_value_images: unknown };
async function loadDraftLine(
  admin: ReturnType<typeof createAdminClient>,
  lineId: string,
): Promise<{ ok: true; row: DraftLine } | { ok: false; error: string }> {
  const { data: row, error: rowErr } = await admin
    .from("customs_declaration_lines")
    .select("id, declaration_id, declared_value_images")
    .eq("id", lineId)
    .maybeSingle<DraftLine>();
  if (rowErr) { console.error("[decl-line-image read] failed", { code: rowErr.code, message: rowErr.message }); return { ok: false, error: `db_error:${rowErr.code ?? "?"}` }; }
  if (!row) return { ok: false, error: "not_found" };
  const { data: parent, error: pErr } = await admin.from("customs_declarations").select("status").eq("id", row.declaration_id).maybeSingle<{ status: string }>();
  if (pErr) { console.error("[decl-line-image parent] failed", { code: pErr.code, message: pErr.message }); return { ok: false, error: `db_error:${pErr.code ?? "?"}` }; }
  if (parent?.status !== "draft") return { ok: false, error: "not_draft" };
  return { ok: true, row };
}

export async function adminAddDeclarationLineImage(formData: FormData): Promise<AdminActionResult> {
  const lineId = String(formData.get("lineId") ?? "");
  const file = formData.get("file");
  if (!lineId) return { ok: false, error: "invalid_line" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์รูป" };
  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const r = await loadDraftLine(admin, lineId);
    if (!r.ok) return r;
    const current = parseLineImages(r.row.declared_value_images);
    if (current.length >= DECL_IMG_CAP) return { ok: false, error: `แนบรูปได้สูงสุด ${DECL_IMG_CAP} รูป/รายการ — ลบบางรูปก่อน` };
    const up = await uploadToBucket(file, "forwarder-covers", `declaration/${r.row.declaration_id}/${lineId}`);
    if (!up.ok) return { ok: false, error: up.error ?? "อัปโหลดรูปไม่สำเร็จ" };
    const next = [...current, up.filename];
    const { error: updErr } = await admin.from("customs_declaration_lines").update({ declared_value_images: JSON.stringify(next) }).eq("id", lineId);
    if (updErr) return { ok: false, error: `update_failed:${updErr.message}` };
    await logAdminAction(adminId, "customs_declaration.line_add_evidence", "customs_declaration", r.row.declaration_id, { line_id: lineId, count: next.length });
    revalidatePath(`/admin/freight/declarations/${r.row.declaration_id}`);
    return { ok: true };
  });
}

export async function adminRemoveDeclarationLineImage(input: { lineId: string; imageKey: string }): Promise<AdminActionResult> {
  const lineId = String(input?.lineId ?? "");
  const imageKey = String(input?.imageKey ?? "");
  if (!lineId || !imageKey) return { ok: false, error: "invalid_input" };
  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const r = await loadDraftLine(admin, lineId);
    if (!r.ok) return r;
    const next = parseLineImages(r.row.declared_value_images).filter((k) => k !== imageKey);
    const { error: updErr } = await admin.from("customs_declaration_lines").update({ declared_value_images: JSON.stringify(next) }).eq("id", lineId);
    if (updErr) return { ok: false, error: `update_failed:${updErr.message}` };
    await logAdminAction(adminId, "customs_declaration.line_remove_evidence", "customs_declaration", r.row.declaration_id, { line_id: lineId, removed: imageKey });
    revalidatePath(`/admin/freight/declarations/${r.row.declaration_id}`);
    return { ok: true };
  });
}
