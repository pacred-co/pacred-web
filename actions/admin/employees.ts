"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const COMPANY = z.enum(["pacred", "pacred-cargo", "pacred-freight"]);
const EMPLOYEE_TYPE = z.enum(["full_time", "probation", "contract", "daily", "intern", "partner"]);

// ────────────────────────────────────────────────────────────
// Upsert all HR fields on admin_contact_extras
// ────────────────────────────────────────────────────────────
const upsertSchema = z.object({
  profile_id:    z.string().uuid(),
  display_name:  z.string().trim().max(200).optional().nullable(),
  nickname:      z.string().trim().max(50).optional().nullable(),
  company:       COMPANY.optional(),
  employee_type: EMPLOYEE_TYPE.optional(),
  department:    z.string().trim().max(100).optional().nullable(),
  section:       z.string().trim().max(100).optional().nullable(),
  work_email:    z.string().trim().email().optional().nullable().or(z.literal("")),
  work_phone:    z.string().trim().max(50).optional().nullable(),
  direct_phone:  z.string().trim().max(50).optional().nullable(),
  hired_at:      z.string().optional().nullable(),
});

export async function adminUpsertEmployeeExtras(input: z.infer<typeof upsertSchema>): Promise<AdminActionResult> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admin_contact_extras")
      .upsert(
        {
          profile_id:    d.profile_id,
          display_name:  d.display_name ?? null,
          nickname:      d.nickname ?? null,
          company:       d.company ?? "pacred",
          employee_type: d.employee_type ?? "full_time",
          department:    d.department ?? null,
          section:       d.section ?? null,
          work_email:    d.work_email || null,
          work_phone:    d.work_phone ?? null,
          direct_phone:  d.direct_phone ?? null,
          hired_at:      d.hired_at || null,
        },
        { onConflict: "profile_id" },
      );
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "employee.upsert_extras", "admin_contact_extras", d.profile_id, d);
    revalidatePath("/admin/hr/employees");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Suspend / un-suspend an employee
// ────────────────────────────────────────────────────────────
const suspendSchema = z.object({
  profile_id: z.string().uuid(),
  suspend:    z.boolean(),
});

export async function adminSuspendEmployee(input: z.infer<typeof suspendSchema>): Promise<AdminActionResult> {
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Toggle admin_contact_extras.suspended_at + flip every admins row is_active
    const ts = parsed.data.suspend ? new Date().toISOString() : null;

    const { error: e1 } = await admin
      .from("admin_contact_extras")
      .upsert(
        { profile_id: parsed.data.profile_id, suspended_at: ts },
        { onConflict: "profile_id" },
      );
    if (e1) return { ok: false, error: e1.message };

    const { error: e2 } = await admin
      .from("admins")
      .update({ is_active: !parsed.data.suspend })
      .eq("profile_id", parsed.data.profile_id);
    if (e2) return { ok: false, error: e2.message };

    await logAdminAction(adminId, parsed.data.suspend ? "employee.suspend" : "employee.unsuspend", "profile", parsed.data.profile_id);
    revalidatePath("/admin/hr/employees");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Reset password — sends Supabase password reset email
// ────────────────────────────────────────────────────────────
const resetSchema = z.object({
  profile_id: z.string().uuid(),
});

export async function adminResetEmployeePassword(input: z.infer<typeof resetSchema>): Promise<AdminActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", parsed.data.profile_id)
      .single();
    if (!profile?.email) return { ok: false, error: "no_email_on_file" };

    const { error } = await admin.auth.admin.generateLink({
      type:  "recovery",
      email: profile.email,
    });
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "employee.password_reset", "profile", parsed.data.profile_id, { email: profile.email });
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Hard delete — yanks the admins row (keeps the profile so they
// can still log in as a regular customer if applicable). Audit log
// retains the action for compliance.
// ────────────────────────────────────────────────────────────
const removeSchema = z.object({
  profile_id: z.string().uuid(),
});

export async function adminRemoveEmployee(input: z.infer<typeof removeSchema>): Promise<AdminActionResult> {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { error: e1 } = await admin
      .from("admins")
      .delete()
      .eq("profile_id", parsed.data.profile_id);
    if (e1) return { ok: false, error: e1.message };

    // End any active org_assignments
    const { error: e2 } = await admin
      .from("org_assignments")
      .update({ ended_at: new Date().toISOString().slice(0, 10) })
      .eq("profile_id", parsed.data.profile_id)
      .is("ended_at", null);
    if (e2) return { ok: false, error: e2.message };

    await logAdminAction(adminId, "employee.remove", "profile", parsed.data.profile_id);
    revalidatePath("/admin/hr/employees");
    return { ok: true };
  });
}
