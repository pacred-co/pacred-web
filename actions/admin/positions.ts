"use server";

/**
 * Positions (ตำแหน่ง) CRUD — owner ปอน 2026-06-27.
 *
 * A position belongs to a department (lib/admin/departments.ts) and references a
 * `workspace_role` (an AdminRole menu key · lib/admin/sidebar-menu.ts ROLE_MENUS)
 * that drives the staffer's workspace. Managed at /admin/positions.
 *
 * Auth: super only (oversight) — `withAdmin(["super"])` (ultra bypasses via
 * isGodRole). Every mutation is audit-logged + confirm-gated in the UI (§0f).
 */
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { DEPARTMENT_KEYS } from "@/lib/admin/departments";
import { adminRoleSchema } from "@/lib/validators/admin-form";

const createSchema = z.object({
  name_th:        z.string().trim().min(1, "กรอกชื่อตำแหน่ง").max(120),
  department:     z.enum(DEPARTMENT_KEYS),
  workspace_role: adminRoleSchema,        // the menu template (ROLE_MENUS key)
});
export type CreatePositionInput = z.infer<typeof createSchema>;

export async function createPosition(input: CreatePositionInput): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string }>(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_positions")
      .insert({ name_th: d.name_th, department: d.department, workspace_role: d.workspace_role, created_by: adminId })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      // 23505 = duplicate (same name in the same department)
      if (error.code === "23505") return { ok: false, error: "มีตำแหน่งชื่อนี้ในแผนกนี้แล้ว" };
      console.error("[createPosition] failed", { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    await logAdminAction(adminId, "position.create", "admin_positions", data?.id ?? "?", d);
    revalidatePath("/admin/positions");
    revalidatePath("/admin/admins/new");
    return { ok: true, data: { id: data?.id ?? "" } };
  });
}

const updateSchema = z.object({
  id:             z.uuid(),
  name_th:        z.string().trim().min(1, "กรอกชื่อตำแหน่ง").max(120),
  department:     z.enum(DEPARTMENT_KEYS),
  workspace_role: adminRoleSchema,
});
export type UpdatePositionInput = z.infer<typeof updateSchema>;

export async function updatePosition(input: UpdatePositionInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admin_positions")
      .update({ name_th: d.name_th, department: d.department, workspace_role: d.workspace_role, updated_at: new Date().toISOString() })
      .eq("id", d.id);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "มีตำแหน่งชื่อนี้ในแผนกนี้แล้ว" };
      console.error("[updatePosition] failed", { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    await logAdminAction(adminId, "position.update", "admin_positions", d.id, d);
    revalidatePath("/admin/positions");
    revalidatePath("/admin/admins/new");
    return { ok: true };
  });
}

const setActiveSchema = z.object({ id: z.uuid(), is_active: z.boolean() });

export async function setPositionActive(input: z.infer<typeof setActiveSchema>): Promise<AdminActionResult> {
  const parsed = setActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admin_positions")
      .update({ is_active: d.is_active, updated_at: new Date().toISOString() })
      .eq("id", d.id);
    if (error) {
      console.error("[setPositionActive] failed", { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    await logAdminAction(adminId, "position.set_active", "admin_positions", d.id, d);
    revalidatePath("/admin/positions");
    revalidatePath("/admin/admins/new");
    return { ok: true };
  });
}
