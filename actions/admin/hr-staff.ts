"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * เฟส 2 (owner 2026-08-03) — จัดพนักงานเข้าตำแหน่งในผัง.
 * เขียน tb_admin.org_unit_id เท่านั้น (ไม่แตะ field อื่น ไม่แตะเงิน · reference).
 * RBAC: HR = super | accounting (เหมือนหน้าผัง).
 */

const HR_ROLES = ["super", "accounting"] as const;

const assignSchema = z.object({
  adminId: z.string().trim().min(1).max(60), // = profiles.admin_login_id
  orgUnitId: z.string().uuid().nullable(),   // null = ปลดออกจากตำแหน่ง
});

export type AssignStaffInput = z.infer<typeof assignSchema>;

/**
 * จัดพนักงานเข้าตำแหน่ง — เขียน `profiles.org_unit_id` (SPINE · unify 2026-08-03).
 * profiles คือรายชื่อพนักงานที่ครบ (login+role) → เขียนที่นี่ที่เดียว.
 * tb_admin.org_unit_id (0288) เลิกใช้ (คงคอลัมน์ไว้กัน rollback).
 */
export async function assignStaffToPosition(input: AssignStaffInput): Promise<AdminActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { adminId, orgUnitId } = parsed.data;

  return withAdmin([...HR_ROLES], async ({ adminId: actor }) => {
    const admin = createAdminClient();

    // ถ้าผูกตำแหน่ง — ตำแหน่งต้องมีจริง + เป็น kind=position
    if (orgUnitId) {
      const { data: unit, error: uErr } = await admin
        .from("hr_org_units")
        .select("id,kind")
        .eq("id", orgUnitId)
        .maybeSingle();
      if (uErr) return { ok: false, error: `db_error:${uErr.code ?? "unknown"}` };
      if (!unit) return { ok: false, error: "position_not_found" };
      if ((unit as { kind: string }).kind !== "position") return { ok: false, error: "not_a_position" };
    }

    const { data: updated, error } = await admin
      .from("profiles")
      .update({ org_unit_id: orgUnitId })
      .eq("admin_login_id", adminId)
      .eq("is_active", true)
      .select("id");
    if (error) return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    if (!updated || updated.length === 0) return { ok: false, error: "staff_not_found_or_inactive" };

    await logAdminAction(actor, "hr.assign_position", "profiles", adminId, { orgUnitId });
    revalidatePath("/admin/hr/staff");
    revalidatePath("/admin/hr/org-chart");
    revalidatePath("/admin/hr/org-table");
    return { ok: true };
  });
}
