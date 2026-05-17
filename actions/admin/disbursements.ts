"use server";

/**
 * U2-2 · Container disbursements (AP ledger) admin actions.
 *
 * Per UPGRADE_PLAN §2 U2-2 + G-2 / R-7: tracks ACTUAL outflows Pacred
 * paid against a cargo_container (vs the rate-card estimate in
 * container_costs). One row per outflow — see migration 0069 for the
 * kind enum (freight | customs_duty | handling | fuel | storage |
 * trucking | other).
 *
 * V1 surface area:
 *   - adminCreateDisbursement  — record a new AP entry
 *   - adminUpdateDisbursement  — edit existing row (e.g. add receipt path later)
 *   - adminDeleteDisbursement  — remove an erroneous entry (super only)
 *
 * RBAC: super + accounting only — finance territory per ADR-0005 K-7 +
 * W-1 keystone (gap-schema-security S-1).
 *
 * All mutations log to admin_audit_log per ADR-0014 pattern.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const KINDS = ["freight", "customs_duty", "handling", "fuel", "storage", "trucking", "other"] as const;
export type DisbursementKind = (typeof KINDS)[number];

const createSchema = z.object({
  cargo_container_id: z.string().uuid(),
  kind:               z.enum(KINDS),
  amount_thb:         z.number().positive("amount ต้องมากกว่า 0").max(50_000_000),
  vendor_name:        z.string().trim().min(1).max(200),
  invoice_no:         z.string().trim().max(100).optional(),
  paid_at:            z.string().datetime({ offset: true }).optional(),
  attachment_path:    z.string().trim().max(500).optional(),
  note:               z.string().trim().max(2000).optional(),
}).refine(
  // 'other' kind requires a note (mirrors the SQL CHECK).
  (d) => d.kind !== "other" || (d.note && d.note.trim().length > 0),
  { message: "kind=other ต้องระบุ note อธิบายค่าใช้จ่ายนี้", path: ["note"] },
);
export type CreateDisbursementInput = z.infer<typeof createSchema>;

export async function adminCreateDisbursement(
  input: CreateDisbursementInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Resolve container code for nicer audit + revalidatePath. Errors
    // here aren't fatal — the FK guards existence + the audit row still
    // captures cargo_container_id.
    const { data: cnt } = await admin
      .from("cargo_containers")
      .select("code")
      .eq("id", d.cargo_container_id)
      .maybeSingle<{ code: string | null }>();
    if (!cnt) return { ok: false, error: "ไม่พบ container" };

    const { data: created, error: insErr } = await admin
      .from("container_disbursements")
      .insert({
        cargo_container_id: d.cargo_container_id,
        kind:               d.kind,
        amount_thb:         d.amount_thb,
        vendor_name:        d.vendor_name,
        invoice_no:         d.invoice_no      ?? null,
        paid_at:            d.paid_at         ?? null,
        paid_by_admin_id:   adminId,
        attachment_path:    d.attachment_path ?? null,
        note:               d.note            ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) return { ok: false, error: insErr.message };

    await logAdminAction(adminId, "disbursement.create", "container_disbursement", created.id, {
      cargo_container_id: d.cargo_container_id,
      container_code:     cnt.code,
      kind:               d.kind,
      amount_thb:         d.amount_thb,
      vendor_name:        d.vendor_name,
      invoice_no:         d.invoice_no ?? null,
    });

    revalidatePath("/admin/accounting/disbursements");
    if (cnt.code) revalidatePath(`/admin/warehouse/containers/${cnt.code}`);

    return { ok: true, data: { id: created.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Update — admin edits an existing AP row (typo fix, attachment add)
// ────────────────────────────────────────────────────────────

const updateSchema = z.object({
  id:                 z.string().uuid(),
  kind:               z.enum(KINDS).optional(),
  amount_thb:         z.number().positive().max(50_000_000).optional(),
  vendor_name:        z.string().trim().min(1).max(200).optional(),
  invoice_no:         z.string().trim().max(100).nullable().optional(),
  paid_at:            z.string().datetime({ offset: true }).nullable().optional(),
  attachment_path:    z.string().trim().max(500).nullable().optional(),
  note:               z.string().trim().max(2000).nullable().optional(),
});
export type UpdateDisbursementInput = z.infer<typeof updateSchema>;

export async function adminUpdateDisbursement(
  input: UpdateDisbursementInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Need to read the existing row to enforce the 'other'-needs-note rule
    // when callers patch only one of the two fields.
    const { data: row, error: readErr } = await admin
      .from("container_disbursements")
      .select("id, kind, note, cargo_container_id")
      .eq("id", d.id)
      .maybeSingle<{ id: string; kind: string; note: string | null; cargo_container_id: string }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };

    const patch: Record<string, unknown> = {};
    if (d.kind            !== undefined) patch.kind            = d.kind;
    if (d.amount_thb      !== undefined) patch.amount_thb      = d.amount_thb;
    if (d.vendor_name     !== undefined) patch.vendor_name     = d.vendor_name;
    if (d.invoice_no      !== undefined) patch.invoice_no      = d.invoice_no;
    if (d.paid_at         !== undefined) patch.paid_at         = d.paid_at;
    if (d.attachment_path !== undefined) patch.attachment_path = d.attachment_path;
    if (d.note            !== undefined) patch.note            = d.note;

    if (Object.keys(patch).length === 0) {
      return { ok: false, error: "ไม่มีฟิลด์ที่ต้องการแก้ไข" };
    }

    // Enforce other-needs-note in app layer too so we return a friendly
    // message instead of a 23514 from the SQL CHECK constraint.
    const finalKind = (patch.kind as string | undefined) ?? row.kind;
    const finalNote = (patch.note as string | null | undefined) ?? row.note;
    if (finalKind === "other" && (!finalNote || finalNote.trim().length === 0)) {
      return { ok: false, error: "kind=other ต้องมี note" };
    }

    const { error } = await admin
      .from("container_disbursements")
      .update(patch)
      .eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "disbursement.update", "container_disbursement", d.id, patch);

    // Revalidate the parent container page + the AP list
    const { data: cnt } = await admin
      .from("cargo_containers")
      .select("code")
      .eq("id", row.cargo_container_id)
      .maybeSingle<{ code: string | null }>();
    revalidatePath("/admin/accounting/disbursements");
    if (cnt?.code) revalidatePath(`/admin/warehouse/containers/${cnt.code}`);

    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Delete — super only (erroneous entry; doesn't soft-delete)
// ────────────────────────────────────────────────────────────

const deleteSchema = z.object({
  id:     z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export async function adminDeleteDisbursement(
  input: z.infer<typeof deleteSchema>,
): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("container_disbursements")
      .select("id, cargo_container_id, kind, amount_thb, vendor_name")
      .eq("id", d.id)
      .maybeSingle<{ id: string; cargo_container_id: string; kind: string; amount_thb: number; vendor_name: string }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };

    const { error } = await admin
      .from("container_disbursements")
      .delete()
      .eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    // Log AFTER delete with the snapshot we read above — the row's gone
    // so the audit is the only trace left.
    await logAdminAction(adminId, "disbursement.delete", "container_disbursement", d.id, {
      reason:             d.reason,
      cargo_container_id: row.cargo_container_id,
      kind:               row.kind,
      amount_thb:         row.amount_thb,
      vendor_name:        row.vendor_name,
    });

    const { data: cnt } = await admin
      .from("cargo_containers")
      .select("code")
      .eq("id", row.cargo_container_id)
      .maybeSingle<{ code: string | null }>();
    revalidatePath("/admin/accounting/disbursements");
    if (cnt?.code) revalidatePath(`/admin/warehouse/containers/${cnt.code}`);

    return { ok: true };
  });
}
