"use server";

/**
 * V-G5 org_contacts admin actions.
 *
 * Per port-spec [docs/port-specs/admin-polish-bundle.md] §V-G5.
 *
 * Surface area:
 *   createOrgContact / updateOrgContact / deleteOrgContact
 *
 * RBAC: super + accounting + sales_admin (each owns a subset of the
 * contact kinds — super for org-wide, accounting for invoice/receipt
 * contact info, sales_admin for sales-rep phone/LINE updates).
 *
 * RLS at DB layer enforces the same role list — withAdmin is the app-
 * layer belt-and-braces + audit hook.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createOrgContactSchema, type CreateOrgContactInput,
  updateOrgContactSchema, type UpdateOrgContactInput,
  deleteOrgContactSchema, type DeleteOrgContactInput,
} from "@/lib/validators/org-contact";

const ROLES = ["super", "accounting", "sales_admin"] as const;

export async function createOrgContact(
  input: CreateOrgContactInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createOrgContactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const payload = {
      kind:                d.kind,
      label:               d.label,
      value:               d.value,
      department:          d.department ?? null,
      is_active:           d.is_active,
      display_order:       d.display_order,
      notes:               d.notes ?? null,
      created_by_admin_id: adminId,
    };

    const { data: inserted, error } = await admin
      .from("org_contacts")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();
    if (error || !inserted) {
      return { ok: false, error: `insert_failed: ${error?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "org_contact.create", "org_contact", inserted.id, {
      kind:  d.kind,
      label: d.label,
      value: d.value,
    });

    revalidatePath("/admin/settings/contacts");
    return { ok: true, data: { id: inserted.id } };
  });
}

export async function updateOrgContact(
  input: UpdateOrgContactInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateOrgContactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Read existing for audit-before snapshot.
    const { data: before, error: readErr } = await admin
      .from("org_contacts")
      .select("id, kind, label, value, department, is_active, display_order, notes")
      .eq("id", d.id)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!before) return { ok: false, error: "not_found" };

    const patch: Record<string, unknown> = {};
    if (d.label         !== undefined) patch.label         = d.label;
    if (d.value         !== undefined) patch.value         = d.value;
    if (d.department    !== undefined) patch.department    = d.department;
    if (d.is_active     !== undefined) patch.is_active     = d.is_active;
    if (d.display_order !== undefined) patch.display_order = d.display_order;
    if (d.notes         !== undefined) patch.notes         = d.notes;
    if (Object.keys(patch).length === 0) {
      return { ok: false, error: "no_changes" };
    }

    const { error: updErr } = await admin
      .from("org_contacts")
      .update(patch)
      .eq("id", d.id);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "org_contact.update", "org_contact", d.id, {
      before,
      patch,
    });

    revalidatePath("/admin/settings/contacts");
    return { ok: true };
  });
}

export async function deleteOrgContact(
  input: DeleteOrgContactInput,
): Promise<AdminActionResult<void>> {
  const parsed = deleteOrgContactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before } = await admin
      .from("org_contacts")
      .select("id, kind, label, value")
      .eq("id", d.id)
      .maybeSingle();
    if (!before) return { ok: false, error: "not_found" };

    const { error: delErr } = await admin
      .from("org_contacts")
      .delete()
      .eq("id", d.id);
    if (delErr) return { ok: false, error: `delete_failed: ${delErr.message}` };

    await logAdminAction(adminId, "org_contact.delete", "org_contact", d.id, { before });

    revalidatePath("/admin/settings/contacts");
    return { ok: true };
  });
}
