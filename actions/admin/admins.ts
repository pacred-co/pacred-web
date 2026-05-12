"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const ROLE = z.enum(["super", "ops", "accounting", "sales_admin"]);

// ────────────────────────────────────────────────────────────
// Grant role to an existing profile
// ────────────────────────────────────────────────────────────
const grantSchema = z.object({
  profile_id: z.string().uuid(),
  role:       ROLE,
});

export async function adminGrantRole(input: z.infer<typeof grantSchema>): Promise<AdminActionResult> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admins")
      .upsert(
        { profile_id: parsed.data.profile_id, role: parsed.data.role, is_active: true, granted_by: adminId, granted_at: new Date().toISOString() },
        { onConflict: "profile_id,role" },
      );
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin.grant", "admins", `${parsed.data.profile_id}/${parsed.data.role}`, parsed.data);
    revalidatePath("/admin/admins");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Toggle active / inactive (don't drop the row so history stays)
// ────────────────────────────────────────────────────────────
const toggleSchema = z.object({
  profile_id: z.string().uuid(),
  role:       ROLE,
  is_active:  z.boolean(),
});

export async function adminToggleRole(input: z.infer<typeof toggleSchema>): Promise<AdminActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admins")
      .update({ is_active: parsed.data.is_active })
      .eq("profile_id", parsed.data.profile_id)
      .eq("role", parsed.data.role);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin.toggle", "admins", `${parsed.data.profile_id}/${parsed.data.role}`, parsed.data);
    revalidatePath("/admin/admins");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Update admin's contact extras (display_name, direct_phone, department)
// ────────────────────────────────────────────────────────────
const contactSchema = z.object({
  profile_id:   z.string().uuid(),
  display_name: z.string().trim().max(200).optional(),
  direct_phone: z.string().trim().max(50).optional(),
  department:   z.string().trim().max(100).optional(),
  section:      z.string().trim().max(100).optional(),
});

export async function adminUpdateContactExtras(input: z.infer<typeof contactSchema>): Promise<AdminActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("admin_contact_extras")
      .upsert(
        {
          profile_id:   d.profile_id,
          display_name: d.display_name ?? null,
          direct_phone: d.direct_phone ?? null,
          department:   d.department ?? null,
          section:      d.section ?? null,
        },
        { onConflict: "profile_id" },
      );
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "admin.contact_update", "admin_contact_extras", d.profile_id, d);
    revalidatePath("/admin/admins");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Assign sales rep to a customer (sets profiles.sales_admin_id)
// Available to super OR sales_admin
// ────────────────────────────────────────────────────────────
const assignRepSchema = z.object({
  customer_id:    z.string().uuid(),
  sales_admin_id: z.string().nullable(),                     // null = unassign
});

export async function adminAssignSalesRep(input: z.infer<typeof assignRepSchema>): Promise<AdminActionResult> {
  const parsed = assignRepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ sales_admin_id: parsed.data.sales_admin_id })
      .eq("id", parsed.data.customer_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.assign_rep", "profile", parsed.data.customer_id, parsed.data);
    revalidatePath(`/admin/customers/${parsed.data.customer_id}`);
    return { ok: true };
  });
}
