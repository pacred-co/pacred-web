"use server";

/**
 * V-E1 — Freight shipments admin actions.
 *
 * Per [docs/port-specs/freight-document-suite.md] + ADR-0016.
 *
 * Surface area V1:
 *   adminCreateFreightShipment    — draft → reserves job_no A{YY}{NNNNN}
 *   adminUpdateFreightShipment    — header + value block (draft + confirmed only)
 *   adminUpsertFreightParty       — shipper/consignee snapshot (1 per role)
 *   adminConfirmFreightShipment   — draft → confirmed (locks logistics; value still editable per ADR-0016 super+accounting rules)
 *   adminMarkFreightInProgress    — confirmed → in_progress
 *   adminMarkFreightCleared       — in_progress → cleared
 *   adminMarkFreightDelivered     — cleared → delivered
 *   adminCancelFreightShipment    — any non-terminal → cancelled (with reason)
 *
 * RBAC:
 *   create / update / status flips: super, ops, sales_admin, accounting
 *   declared_customs_value_thb edit: super + accounting ONLY (ADR-0016 Q3 — enforced inside update action)
 *
 * Audit: every mutation writes admin_audit_log per ADR-0014.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { adminCreateFreightInvoice } from "./freight-invoices";
import {
  createFreightShipmentSchema, type CreateFreightShipmentInput,
  updateFreightShipmentSchema, type UpdateFreightShipmentInput,
  upsertPartySchema,           type UpsertPartyInput,
  shipmentIdOnlySchema,        type ShipmentIdOnlyInput,
  cancelShipmentSchema,        type CancelShipmentInput,
  computeValueBlock,
} from "@/lib/validators/freight-shipment";

const ROLES_WRITE = ["super", "ops", "sales_admin", "accounting"] as const;
const ROLES_DECLARED_VALUE = ["super", "accounting"] as const;

// ────────────────────────────────────────────────────────────
// 1) Create
// ────────────────────────────────────────────────────────────

type CreateResult = { id: string; job_no: string };

export async function adminCreateFreightShipment(
  input: CreateFreightShipmentInput,
): Promise<AdminActionResult<CreateResult>> {
  const parsed = createFreightShipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();

    // Reserve job_no.
    const { data: jobNo, error: serialErr } = await admin.rpc("next_freight_job_no");
    if (serialErr || typeof jobNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    // Compute derived value-block figures server-side.
    const derived = computeValueBlock({
      commercial_value_usd:       d.commercial_value_usd ?? null,
      exchange_rate:              d.exchange_rate ?? null,
      declared_customs_value_thb: d.declared_customs_value_thb ?? null,
      duty_rate_pct:              d.duty_rate_pct ?? null,
      vat_base_thb_override:      d.vat_base_thb ?? null,
    });

    const { data: inserted, error: insErr } = await admin
      .from("freight_shipments")
      .insert({
        job_no:                     jobNo,
        profile_id:                 d.profile_id,
        status:                     "draft",
        transport_mode:             d.transport_mode,
        container_code:             d.container_code ?? null,
        carrier_container_no:       d.carrier_container_no ?? null,
        bl_no:                      d.bl_no ?? null,
        vessel_voyage:              d.vessel_voyage ?? null,
        port_loading:               d.port_loading ?? null,
        port_discharge:             d.port_discharge ?? null,
        place_delivery:             d.place_delivery ?? null,
        incoterm:                   d.incoterm ?? null,
        payment_term:               d.payment_term ?? null,
        origin_country:             d.origin_country ?? "CHINA",
        commercial_value_usd:       d.commercial_value_usd ?? null,
        exchange_rate:              d.exchange_rate ?? null,
        rate_source:                d.commercial_value_usd != null ? "staff_entered" : null,
        rate_date:                  d.rate_date ?? null,
        commercial_value_thb:       derived.commercial_value_thb,
        declared_customs_value_thb: d.declared_customs_value_thb ?? null,
        declared_value_basis:       d.declared_value_basis ?? null,
        hs_code:                    d.hs_code ?? null,
        duty_rate_pct:              d.duty_rate_pct ?? null,
        duty_thb:                   derived.duty_thb,
        vat_base_thb:               derived.vat_base_thb,
        vat_thb:                    derived.vat_thb,
        vat_plan_label:             d.vat_plan_label ?? null,
        form_e_applied:             d.form_e_applied ?? false,
        source_quote_id:            d.source_quote_id ?? null,
        notes:                      d.notes ?? null,
        created_by_admin_id:        adminId,
      })
      .select("id, job_no")
      .single<{ id: string; job_no: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "freight_shipment.create", "freight_shipment", inserted.id, {
      job_no:         jobNo,
      profile_id:     d.profile_id,
      transport_mode: d.transport_mode,
      source_quote_id: d.source_quote_id ?? null,
    });

    revalidatePath("/admin/freight/shipments");
    return { ok: true, data: { id: inserted.id, job_no: inserted.job_no } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Update header + value block
// ────────────────────────────────────────────────────────────

export async function adminUpdateFreightShipment(
  input: UpdateFreightShipmentInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateFreightShipmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: beforeErr } = await admin
      .from("freight_shipments")
      .select("id, job_no, status, commercial_value_usd, exchange_rate, declared_customs_value_thb, duty_rate_pct, vat_base_thb")
      .eq("id", d.id)
      .maybeSingle<{
        id: string; job_no: string; status: string;
        commercial_value_usd: number | null; exchange_rate: number | null;
        declared_customs_value_thb: number | null; duty_rate_pct: number | null;
        vat_base_thb: number | null;
      }>();
    if (beforeErr) {
      console.error(`[freight_shipments mutation lookup] failed`, { code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: `db_error:${beforeErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "not_found" };
    if (["delivered", "cancelled"].includes(before.status)) {
      return { ok: false, error: "terminal_status" };
    }

    // ADR-0016 Q3: declared_customs_value_thb edit requires super OR accounting.
    if (d.declared_customs_value_thb !== undefined && d.declared_customs_value_thb !== null) {
      const callerRoles = (await getAdminRoles()) ?? [];
      const hasDeclaredRole = ROLES_DECLARED_VALUE.some((r) => callerRoles.includes(r));
      if (!hasDeclaredRole) {
        return { ok: false, error: "declared_value_requires_super_or_accounting" };
      }
      if (!d.declared_value_basis || d.declared_value_basis.trim().length === 0) {
        return { ok: false, error: "declared_value_basis_required" };
      }
    }

    // Build patch + compute derived.
    const patch: Record<string, unknown> = {};
    const setIf = <K extends keyof typeof d>(k: K) => {
      if (d[k] !== undefined) patch[k as string] = d[k];
    };
    setIf("container_code"); setIf("carrier_container_no"); setIf("bl_no"); setIf("vessel_voyage");
    setIf("port_loading"); setIf("port_discharge"); setIf("place_delivery"); setIf("incoterm");
    setIf("payment_term"); setIf("origin_country"); setIf("notes");
    setIf("commercial_value_usd"); setIf("exchange_rate"); setIf("rate_date");
    setIf("declared_customs_value_thb"); setIf("declared_value_basis"); setIf("hs_code");
    setIf("duty_rate_pct"); setIf("vat_base_thb"); setIf("vat_plan_label"); setIf("form_e_applied");

    if (Object.keys(patch).length === 0) return { ok: false, error: "no_changes" };

    // Recompute derived if any of the inputs changed.
    if ("commercial_value_usd" in patch || "exchange_rate" in patch
        || "declared_customs_value_thb" in patch || "duty_rate_pct" in patch
        || "vat_base_thb" in patch) {
      const derived = computeValueBlock({
        commercial_value_usd:       (patch.commercial_value_usd as number | null | undefined) ?? before.commercial_value_usd,
        exchange_rate:              (patch.exchange_rate        as number | null | undefined) ?? before.exchange_rate,
        declared_customs_value_thb: (patch.declared_customs_value_thb as number | null | undefined) ?? before.declared_customs_value_thb,
        duty_rate_pct:              (patch.duty_rate_pct        as number | null | undefined) ?? before.duty_rate_pct,
        vat_base_thb_override:      (patch.vat_base_thb         as number | null | undefined) ?? before.vat_base_thb,
      });
      patch.commercial_value_thb = derived.commercial_value_thb;
      patch.duty_thb             = derived.duty_thb;
      patch.vat_base_thb         = derived.vat_base_thb;
      patch.vat_thb              = derived.vat_thb;
      if ((patch.commercial_value_usd as number | null | undefined) != null && !("rate_source" in patch)) {
        patch.rate_source = "staff_entered";
      }
    }

    const { error: updErr } = await admin
      .from("freight_shipments")
      .update(patch)
      .eq("id", d.id)
      .not("status", "in", '("delivered","cancelled")');
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "freight_shipment.update", "freight_shipment", d.id, {
      job_no: before.job_no,
      patch,
    });

    revalidatePath("/admin/freight/shipments");
    revalidatePath(`/admin/freight/shipments/${d.id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Upsert party (shipper / consignee)
// ────────────────────────────────────────────────────────────

export async function adminUpsertFreightParty(
  input: UpsertPartyInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = upsertPartySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: parent, error: parentErr } = await admin
      .from("freight_shipments")
      .select("status, job_no")
      .eq("id", d.freight_shipment_id)
      .maybeSingle<{ status: string; job_no: string }>();
    if (parentErr) {
      console.error(`[freight_shipments mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
    if (!parent) return { ok: false, error: "not_found" };
    if (["delivered", "cancelled"].includes(parent.status)) {
      return { ok: false, error: "terminal_status" };
    }

    // Upsert via the partial-unique index (freight_shipment_id, role).
    const { data: inserted, error: upErr } = await admin
      .from("freight_parties")
      .upsert(
        {
          freight_shipment_id: d.freight_shipment_id,
          role:                d.role,
          name:                d.name,
          address:             d.address,
          tax_id:              d.tax_id ?? null,
          branch:              d.branch ?? null,
        },
        { onConflict: "freight_shipment_id,role" },
      )
      .select("id")
      .single<{ id: string }>();
    if (upErr || !inserted) {
      return { ok: false, error: `upsert_failed: ${upErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "freight_shipment.party_upsert", "freight_shipment", d.freight_shipment_id, {
      job_no: parent.job_no,
      role:   d.role,
      name:   d.name,
    });

    revalidatePath(`/admin/freight/shipments/${d.freight_shipment_id}`);
    return { ok: true, data: { id: inserted.id } };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Status flips
// ────────────────────────────────────────────────────────────

async function flipShipmentStatus(
  id: string, expectedFrom: string, to: string, extra: Record<string, unknown> = {},
): Promise<AdminActionResult<void>> {
  const admin = createAdminClient();
  const { data: row, error: rowErr } = await admin
    .from("freight_shipments")
    .select("status, job_no")
    .eq("id", id)
    .maybeSingle<{ status: string; job_no: string }>();
  if (rowErr) {
    console.error(`[freight_shipments mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
    return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
  }
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== expectedFrom) return { ok: false, error: `bad_status:${row.status}` };

  const { error: updErr } = await admin
    .from("freight_shipments")
    .update({ status: to, ...extra })
    .eq("id", id)
    .eq("status", expectedFrom);                                       // optimistic race-guard
  if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };
  return { ok: true };
}

export async function adminConfirmFreightShipment(input: ShipmentIdOnlyInput): Promise<AdminActionResult<void>> {
  const parsed = shipmentIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const now = new Date().toISOString();
    const res = await flipShipmentStatus(input.id, "draft", "confirmed", { confirmed_at: now });
    if (!res.ok) return res;
    await logAdminAction(adminId, "freight_shipment.confirm", "freight_shipment", input.id, {});
    revalidatePath(`/admin/freight/shipments/${input.id}`);
    return { ok: true };
  });
}

export async function adminMarkFreightInProgress(input: ShipmentIdOnlyInput): Promise<AdminActionResult<void>> {
  const parsed = shipmentIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const res = await flipShipmentStatus(input.id, "confirmed", "in_progress", {});
    if (!res.ok) return res;
    await logAdminAction(adminId, "freight_shipment.in_progress", "freight_shipment", input.id, {});
    revalidatePath(`/admin/freight/shipments/${input.id}`);
    return { ok: true };
  });
}

export async function adminMarkFreightCleared(input: ShipmentIdOnlyInput): Promise<AdminActionResult<void>> {
  const parsed = shipmentIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const res = await flipShipmentStatus(input.id, "in_progress", "cleared", {});
    if (!res.ok) return res;
    await logAdminAction(adminId, "freight_shipment.cleared", "freight_shipment", input.id, {});
    revalidatePath(`/admin/freight/shipments/${input.id}`);
    return { ok: true };
  });
}

export async function adminMarkFreightDelivered(input: ShipmentIdOnlyInput): Promise<AdminActionResult<void>> {
  const parsed = shipmentIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const now = new Date().toISOString();
    const res = await flipShipmentStatus(input.id, "cleared", "delivered", { delivered_at: now });
    if (!res.ok) return res;
    await logAdminAction(adminId, "freight_shipment.delivered", "freight_shipment", input.id, {});

    // U1-4 auto-chain: draft an invoice if none exists for this shipment.
    // Best-effort — parent flip already committed; failure here must not block
    // the delivery status update. Admin can manually create the draft later
    // if this fails. adminCreateFreightInvoice itself is idempotent against
    // an existing non-cancelled invoice (returns 'existing_invoice:...').
    try {
      const admin = createAdminClient();
      const { data: existing, error: existingErr } = await admin
        .from("freight_invoices")
        .select("id, status")
        .eq("freight_shipment_id", input.id)
        .neq("status", "cancelled")
        .limit(1)
        .maybeSingle<{ id: string; status: string }>();
      if (existingErr) {
        console.error(`[freight_invoices list] failed`, { code: existingErr.code, message: existingErr.message });
      }

      if (!existing) {
        const draftRes = await adminCreateFreightInvoice({ freight_shipment_id: input.id });
        if (draftRes.ok) {
          await logAdminAction(
            adminId,
            "freight_shipment.auto_draft_invoice_on_delivery",
            "freight_shipment",
            input.id,
            { freight_invoice_id: draftRes.data?.id ?? null, result: "drafted" },
          );
        } else {
          await logAdminAction(
            adminId,
            "freight_shipment.auto_draft_invoice_on_delivery",
            "freight_shipment",
            input.id,
            { result: "failed", error: draftRes.error },
          );
        }
      } else {
        await logAdminAction(
          adminId,
          "freight_shipment.auto_draft_invoice_on_delivery",
          "freight_shipment",
          input.id,
          { result: "skipped_existing", freight_invoice_id: existing.id, existing_status: existing.status },
        );
      }
    } catch (e) {
      // Swallow — delivery flip already committed; just log + continue.
      await logAdminAction(
        adminId,
        "freight_shipment.auto_draft_invoice_on_delivery",
        "freight_shipment",
        input.id,
        { result: "exception", error: e instanceof Error ? e.message : String(e) },
      );
    }

    revalidatePath(`/admin/freight/shipments/${input.id}`);
    return { ok: true };
  });
}

export async function adminCancelFreightShipment(input: CancelShipmentInput): Promise<AdminActionResult<void>> {
  const parsed = cancelShipmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: row, error: rowErr } = await admin
      .from("freight_shipments")
      .select("status")
      .eq("id", d.id)
      .maybeSingle<{ status: string }>();
    if (rowErr) {
      console.error(`[freight_shipments mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status === "cancelled") return { ok: false, error: "already_cancelled" };
    if (row.status === "delivered") return { ok: false, error: "cannot_cancel_after_delivery" };

    const { error: updErr } = await admin
      .from("freight_shipments")
      .update({
        status:           "cancelled",
        cancelled_at:     new Date().toISOString(),
        cancelled_reason: d.cancelled_reason,
      })
      .eq("id", d.id)
      .neq("status", "cancelled");
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "freight_shipment.cancel", "freight_shipment", d.id, {
      cancelled_reason: d.cancelled_reason,
    });

    revalidatePath(`/admin/freight/shipments/${d.id}`);
    return { ok: true };
  });
}
