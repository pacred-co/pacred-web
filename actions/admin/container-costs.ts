"use server";

/**
 * U2-2 · Container-cost (carrier rate card) admin actions.
 *
 * Per UPGRADE_PLAN §2 U2-2 + G-1: per-container cost basis. This file
 * owns the carrier rate-card lifecycle (what does THIS carrier charge
 * per CBM/kg for THIS route + container type?). Actual outflows live in
 * actions/admin/disbursements.ts.
 *
 * V1 surface area:
 *   - adminCreateContainerCost  — record a new rate-card row
 *   - adminUpdateContainerCost  — edit existing rate (e.g. extend effective_to)
 *   - adminArchiveContainerCost — close out a rate (set effective_to = today)
 *
 * RBAC: super + accounting WRITE (rate-card is finance territory).
 * Read happens server-side via createAdminClient (page-level role gate).
 *
 * All mutations log to admin_audit_log per ADR-0014 pattern.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const TRANSPORT_MODES = ["truck", "sea", "air"] as const;
const SOURCES = ["manual", "momo_api", "partner_email"] as const;

const createSchema = z.object({
  carrier_name:        z.string().trim().min(1).max(100),
  transport_mode:      z.enum(TRANSPORT_MODES),
  origin:              z.string().trim().min(1).max(100),
  destination:         z.string().trim().min(1).max(100),
  container_type:      z.string().trim().min(1).max(50),
  rate_per_cbm_thb:    z.number().nonnegative().max(10_000_000).nullable().optional(),
  rate_per_kg_thb:     z.number().nonnegative().max(10_000_000).nullable().optional(),
  minimum_charge_thb:  z.number().nonnegative().max(10_000_000).nullable().optional(),
  fuel_surcharge_pct:  z.number().nonnegative().max(999.99).nullable().optional(),
  effective_from:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effective_from ต้องเป็น YYYY-MM-DD"),
  effective_to:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  source:              z.enum(SOURCES).default("manual"),
  note:                z.string().trim().max(2000).optional(),
}).refine(
  (d) => d.rate_per_cbm_thb != null || d.rate_per_kg_thb != null,
  { message: "ต้องระบุ rate_per_cbm_thb หรือ rate_per_kg_thb อย่างน้อยอย่างใดอย่างหนึ่ง", path: ["rate_per_cbm_thb"] },
).refine(
  (d) => !d.effective_to || d.effective_to >= d.effective_from,
  { message: "effective_to ต้องไม่ก่อน effective_from", path: ["effective_to"] },
);
export type CreateContainerCostInput = z.infer<typeof createSchema>;

export async function adminCreateContainerCost(
  input: CreateContainerCostInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: created, error: insErr } = await admin
      .from("container_costs")
      .insert({
        carrier_name:        d.carrier_name,
        transport_mode:      d.transport_mode,
        origin:              d.origin,
        destination:         d.destination,
        container_type:      d.container_type,
        rate_per_cbm_thb:    d.rate_per_cbm_thb   ?? null,
        rate_per_kg_thb:     d.rate_per_kg_thb    ?? null,
        minimum_charge_thb:  d.minimum_charge_thb ?? null,
        fuel_surcharge_pct:  d.fuel_surcharge_pct ?? null,
        effective_from:      d.effective_from,
        effective_to:        d.effective_to       ?? null,
        source:              d.source,
        note:                d.note               ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) return { ok: false, error: insErr.message };

    await logAdminAction(adminId, "container_cost.create", "container_cost", created.id, {
      carrier_name:    d.carrier_name,
      transport_mode:  d.transport_mode,
      origin:          d.origin,
      destination:     d.destination,
      container_type:  d.container_type,
      rate_per_cbm:    d.rate_per_cbm_thb,
      rate_per_kg:     d.rate_per_kg_thb,
      effective_from:  d.effective_from,
    });

    revalidatePath("/admin/accounting/container-costs");
    return { ok: true, data: { id: created.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Update (edit a rate-card row in place — e.g. extend effective_to)
// ────────────────────────────────────────────────────────────

const updateSchema = z.object({
  id:                  z.string().uuid(),
  carrier_name:        z.string().trim().min(1).max(100).optional(),
  transport_mode:      z.enum(TRANSPORT_MODES).optional(),
  origin:              z.string().trim().min(1).max(100).optional(),
  destination:         z.string().trim().min(1).max(100).optional(),
  container_type:      z.string().trim().min(1).max(50).optional(),
  rate_per_cbm_thb:    z.number().nonnegative().max(10_000_000).nullable().optional(),
  rate_per_kg_thb:     z.number().nonnegative().max(10_000_000).nullable().optional(),
  minimum_charge_thb:  z.number().nonnegative().max(10_000_000).nullable().optional(),
  fuel_surcharge_pct:  z.number().nonnegative().max(999.99).nullable().optional(),
  effective_from:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effective_to:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note:                z.string().trim().max(2000).nullable().optional(),
});
export type UpdateContainerCostInput = z.infer<typeof updateSchema>;

export async function adminUpdateContainerCost(
  input: UpdateContainerCostInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Build update payload — only include explicitly-passed fields so we
    // don't accidentally overwrite columns with undefined.
    const patch: Record<string, unknown> = {};
    if (d.carrier_name        !== undefined) patch.carrier_name        = d.carrier_name;
    if (d.transport_mode      !== undefined) patch.transport_mode      = d.transport_mode;
    if (d.origin              !== undefined) patch.origin              = d.origin;
    if (d.destination         !== undefined) patch.destination         = d.destination;
    if (d.container_type      !== undefined) patch.container_type      = d.container_type;
    if (d.rate_per_cbm_thb    !== undefined) patch.rate_per_cbm_thb    = d.rate_per_cbm_thb;
    if (d.rate_per_kg_thb     !== undefined) patch.rate_per_kg_thb     = d.rate_per_kg_thb;
    if (d.minimum_charge_thb  !== undefined) patch.minimum_charge_thb  = d.minimum_charge_thb;
    if (d.fuel_surcharge_pct  !== undefined) patch.fuel_surcharge_pct  = d.fuel_surcharge_pct;
    if (d.effective_from      !== undefined) patch.effective_from      = d.effective_from;
    if (d.effective_to        !== undefined) patch.effective_to        = d.effective_to;
    if (d.note                !== undefined) patch.note                = d.note;

    if (Object.keys(patch).length === 0) {
      return { ok: false, error: "ไม่มีฟิลด์ที่ต้องการแก้ไข" };
    }

    const { error } = await admin
      .from("container_costs")
      .update(patch)
      .eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "container_cost.update", "container_cost", d.id, patch);

    revalidatePath("/admin/accounting/container-costs");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Archive (close out a rate by setting effective_to=today)
// ────────────────────────────────────────────────────────────

const archiveSchema = z.object({
  id: z.string().uuid(),
});

export async function adminArchiveContainerCost(
  input: z.infer<typeof archiveSchema>,
): Promise<AdminActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await admin
      .from("container_costs")
      .update({ effective_to: today })
      .eq("id", d.id)
      .is("effective_to", null);   // refuse to re-archive a closed row
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "container_cost.archive", "container_cost", d.id, {
      effective_to: today,
    });

    revalidatePath("/admin/accounting/container-costs");
    return { ok: true };
  });
}
