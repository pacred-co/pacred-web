"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * Admin actions for P-20 — HS codes dictionary + per-container line items.
 *
 *   addHsLine          — push a new line into container_hs_lines
 *   updateHsLine       — edit qty/weight/value/note of an existing line
 *   deleteHsLine       — remove a line
 *   upsertHsCode       — admin manages the hs_codes dictionary
 */

// ────────────────────────────────────────────────────────────
// container_hs_lines
// ────────────────────────────────────────────────────────────
const addLineSchema = z.object({
  container_id:  z.string().uuid(),
  hs_code:       z.string().trim().min(1).max(20),
  qty:           z.number().nonnegative(),
  weight_kg:     z.number().nonnegative(),
  value_thb:     z.number().nonnegative(),
  duty_pct_used: z.number().min(0).max(100).optional(),
  note:          z.string().trim().max(500).optional(),
});
export type AddHsLineInput = z.infer<typeof addLineSchema>;

export async function addHsLine(input: AddHsLineInput): Promise<AdminActionResult<{ id: string }>> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Snapshot the rate at line entry if not explicitly given
    let dutyPct = d.duty_pct_used;
    if (dutyPct === undefined) {
      const { data: hs } = await admin
        .from("hs_codes")
        .select("default_duty_pct")
        .eq("code", d.hs_code)
        .maybeSingle<{ default_duty_pct: number }>();
      if (!hs) return { ok: false, error: "hs_code_not_found" };
      dutyPct = Number(hs.default_duty_pct);
    }

    const { data: row, error } = await admin
      .from("container_hs_lines")
      .insert({
        container_id:  d.container_id,
        hs_code:       d.hs_code,
        qty:           d.qty,
        weight_kg:     d.weight_kg,
        value_thb:     d.value_thb,
        duty_pct_used: dutyPct,
        note:          d.note ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !row) return { ok: false, error: error?.message ?? "insert_failed" };

    await logAdminAction(adminId, "hs_line.add", "container_hs_lines", row.id, d);

    revalidatePath(`/admin/containers/${d.container_id}/hs`);
    revalidatePath(`/admin/containers/${d.container_id}`);
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true, data: { id: row.id } };
  });
}

const updateLineSchema = z.object({
  id:            z.string().uuid(),
  qty:           z.number().nonnegative().optional(),
  weight_kg:     z.number().nonnegative().optional(),
  value_thb:     z.number().nonnegative().optional(),
  duty_pct_used: z.number().min(0).max(100).optional(),
  note:          z.string().trim().max(500).optional().nullable(),
});
export type UpdateHsLineInput = z.infer<typeof updateLineSchema>;

export async function updateHsLine(input: UpdateHsLineInput): Promise<AdminActionResult> {
  const parsed = updateLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, ...fields } = parsed.data;

  return withAdmin(["ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("container_hs_lines")
      .select("id, container_id")
      .eq("id", id)
      .maybeSingle<{ id: string; container_id: string }>();
    if (!before) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = {};
    if (fields.qty           !== undefined) update.qty           = fields.qty;
    if (fields.weight_kg     !== undefined) update.weight_kg     = fields.weight_kg;
    if (fields.value_thb     !== undefined) update.value_thb     = fields.value_thb;
    if (fields.duty_pct_used !== undefined) update.duty_pct_used = fields.duty_pct_used;
    if (fields.note          !== undefined) update.note          = fields.note;

    const { error } = await admin.from("container_hs_lines").update(update).eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "hs_line.update", "container_hs_lines", id, update);
    revalidatePath(`/admin/containers/${before.container_id}/hs`);
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true };
  });
}

const deleteLineSchema = z.object({ id: z.string().uuid() });

export async function deleteHsLine(
  input: z.infer<typeof deleteLineSchema>,
): Promise<AdminActionResult> {
  const parsed = deleteLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("container_hs_lines")
      .select("id, container_id, hs_code")
      .eq("id", parsed.data.id)
      .maybeSingle<{ id: string; container_id: string; hs_code: string }>();
    if (!before) return { ok: false, error: "not_found" };

    const { error } = await admin.from("container_hs_lines").delete().eq("id", parsed.data.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "hs_line.delete", "container_hs_lines", parsed.data.id, {
      container_id: before.container_id,
      hs_code:      before.hs_code,
    });
    revalidatePath(`/admin/containers/${before.container_id}/hs`);
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// hs_codes dictionary
// ────────────────────────────────────────────────────────────
const upsertHsCodeSchema = z.object({
  code:             z.string().trim().min(1).max(20),
  description:      z.string().trim().min(1).max(300),
  description_en:   z.string().trim().max(300).optional(),
  default_duty_pct: z.number().min(0).max(100),
  unit:             z.string().trim().max(20).optional(),
  note:             z.string().trim().max(500).optional(),
  is_active:        z.boolean().optional(),
});
export type UpsertHsCodeInput = z.infer<typeof upsertHsCodeSchema>;

export async function upsertHsCode(input: UpsertHsCodeInput): Promise<AdminActionResult> {
  const parsed = upsertHsCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const payload: Record<string, unknown> = {
      code:             d.code,
      description:      d.description,
      default_duty_pct: d.default_duty_pct,
    };
    if (d.description_en !== undefined) payload.description_en = d.description_en;
    if (d.unit           !== undefined) payload.unit           = d.unit;
    if (d.note           !== undefined) payload.note           = d.note;
    if (d.is_active      !== undefined) payload.is_active      = d.is_active;

    const { error } = await admin
      .from("hs_codes")
      .upsert(payload, { onConflict: "code" });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "hs_code.upsert", "hs_codes", d.code, payload);
    revalidatePath("/admin/hs-codes");
    revalidatePath("/admin/reports/containers-hs");
    return { ok: true };
  });
}
