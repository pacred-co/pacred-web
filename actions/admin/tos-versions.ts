"use server";

/**
 * V-G4 TOS version management — admin actions.
 *
 * Per port-spec admin-polish-bundle.md §V-G4.
 *
 * V1 = backend management surface only. The customer-side gate
 * (actions/tos.ts::acceptCurrentTos) keeps reading CURRENT_TOS_VERSION
 * from lib/tos.ts. V-G4.1 migrates the gate to read DB.
 *
 * Surface area:
 *   createTosVersion       — admin creates new version (optionally active)
 *   updateTosVersion       — admin edits title/body/effective_from/applies_to/is_active
 *   activateTosVersion     — convenience: deactivate all other rows in same applies_to + activate this one
 *
 * Role: super only (TOS is a legal artifact — only owner should mutate).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createTosVersionSchema, type CreateTosVersionInput,
  updateTosVersionSchema, type UpdateTosVersionInput,
  type TosScope,
} from "@/lib/validators/tos-version";

export async function createTosVersion(
  input: CreateTosVersionInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createTosVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: inserted, error } = await admin
      .from("tos_versions")
      .insert({
        version_no:          d.version_no,
        title:               d.title,
        body_md:             d.body_md,
        effective_from:      d.effective_from,
        applies_to:          d.applies_to,
        is_active:           d.is_active,
        created_by_admin_id: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !inserted) {
      return {
        ok: false,
        error: error?.message?.includes("tos_versions_version_no_key")
          ? "version_no_exists"
          : `insert_failed: ${error?.message ?? "no_row"}`,
      };
    }

    await logAdminAction(adminId, "tos_version.create", "tos_version", inserted.id, {
      version_no: d.version_no,
      title:      d.title,
      applies_to: d.applies_to,
      is_active:  d.is_active,
    });

    revalidatePath("/admin/settings/tos-versions");
    return { ok: true, data: { id: inserted.id } };
  });
}

export async function updateTosVersion(
  input: UpdateTosVersionInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateTosVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before } = await admin
      .from("tos_versions")
      .select("id, version_no, title, applies_to, is_active, effective_from")
      .eq("id", d.id)
      .maybeSingle();
    if (!before) return { ok: false, error: "not_found" };

    const patch: Record<string, unknown> = {};
    if (d.title          !== undefined) patch.title          = d.title;
    if (d.body_md        !== undefined) patch.body_md        = d.body_md;
    if (d.effective_from !== undefined) patch.effective_from = d.effective_from;
    if (d.applies_to     !== undefined) patch.applies_to     = d.applies_to;
    if (d.is_active      !== undefined) patch.is_active      = d.is_active;
    if (Object.keys(patch).length === 0) return { ok: false, error: "no_changes" };

    const { error: updErr } = await admin
      .from("tos_versions")
      .update(patch)
      .eq("id", d.id);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "tos_version.update", "tos_version", d.id, { before, patch });

    revalidatePath("/admin/settings/tos-versions");
    return { ok: true };
  });
}

/**
 * Activate one version + deactivate every other row in the same applies_to
 * scope. Reflects the "only one active per scope" business rule (enforced
 * at app layer; the DB allows multiple-active-rows for safety during data
 * migrations).
 */
export async function activateTosVersion(
  id: string,
): Promise<AdminActionResult<void>> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row } = await admin
      .from("tos_versions")
      .select("id, applies_to, is_active")
      .eq("id", id)
      .maybeSingle<{ id: string; applies_to: TosScope; is_active: boolean }>();
    if (!row) return { ok: false, error: "not_found" };

    // Deactivate every other row with same applies_to.
    const { error: deErr } = await admin
      .from("tos_versions")
      .update({ is_active: false })
      .eq("applies_to", row.applies_to)
      .neq("id", id);
    if (deErr) return { ok: false, error: `deactivate_others_failed: ${deErr.message}` };

    // Activate this one.
    const { error: acErr } = await admin
      .from("tos_versions")
      .update({ is_active: true })
      .eq("id", id);
    if (acErr) return { ok: false, error: `activate_failed: ${acErr.message}` };

    await logAdminAction(adminId, "tos_version.activate", "tos_version", id, {
      applies_to: row.applies_to,
    });

    revalidatePath("/admin/settings/tos-versions");
    return { ok: true };
  });
}
