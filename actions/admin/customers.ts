"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const editCustomerSchema = z.object({
  id:              z.string().uuid(),
  first_name:      z.string().trim().max(100).optional(),
  last_name:       z.string().trim().max(100).optional(),
  email:           z.string().trim().email().max(255).optional().or(z.literal("")),
  phone:           z.string().trim().max(20).optional(),
  customer_group:  z.enum(["normal","vip","special"]).optional(),
  sex:             z.enum(["M","F","other"]).optional().nullable(),
  birthday:        z.string().optional().nullable(),
  line_id:         z.string().trim().max(100).optional().nullable(),
  recommended_by:  z.string().trim().max(100).optional().nullable(),
});
export type EditCustomerInput = z.infer<typeof editCustomerSchema>;

export async function editCustomer(input: EditCustomerInput): Promise<AdminActionResult> {
  const parsed = editCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { id, ...fields } = parsed.data;

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin.from("profiles").select("*").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = {};
    if (fields.first_name     !== undefined) update.first_name     = fields.first_name || null;
    if (fields.last_name      !== undefined) update.last_name      = fields.last_name || null;
    if (fields.email          !== undefined) update.email          = fields.email || null;
    if (fields.phone          !== undefined) update.phone          = fields.phone || null;
    if (fields.customer_group !== undefined) update.customer_group = fields.customer_group;
    if (fields.sex            !== undefined) update.sex            = fields.sex;
    if (fields.birthday       !== undefined) update.birthday       = fields.birthday;
    if (fields.line_id        !== undefined) update.line_id        = fields.line_id;
    if (fields.recommended_by !== undefined) update.recommended_by = fields.recommended_by;

    const { error } = await admin.from("profiles").update(update).eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.edit", "profile", id, { before, after: update });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}

const verifyJuristicSchema = z.object({ profile_id: z.string().uuid() });
const rejectJuristicSchema = z.object({
  profile_id: z.string().uuid(),
  reason:     z.string().trim().min(1).max(500),
});

export async function verifyJuristic(input: z.infer<typeof verifyJuristicSchema>): Promise<AdminActionResult> {
  const parsed = verifyJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("corporate")
      .update({ status: "verified", verified_at: new Date().toISOString(), rejection_reason: null })
      .eq("profile_id", parsed.data.profile_id);
    if (error) return { ok: false, error: error.message };

    await admin.from("profiles").update({ status: "active" }).eq("id", parsed.data.profile_id);
    await logAdminAction(adminId, "juristic.verify", "corporate", parsed.data.profile_id, {});
    revalidatePath("/admin/juristic-check");
    revalidatePath(`/admin/customers/${parsed.data.profile_id}`);
    return { ok: true };
  });
}

export async function rejectJuristic(input: z.infer<typeof rejectJuristicSchema>): Promise<AdminActionResult> {
  const parsed = rejectJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("corporate")
      .update({ status: "rejected", rejection_reason: parsed.data.reason, verified_at: null })
      .eq("profile_id", parsed.data.profile_id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "juristic.reject", "corporate", parsed.data.profile_id, { reason: parsed.data.reason });
    revalidatePath("/admin/juristic-check");
    revalidatePath(`/admin/customers/${parsed.data.profile_id}`);
    return { ok: true };
  });
}

/** Set profiles.status = 'active' (lifts both 'incomplete' new sign-ups
 *  and previously suspended accounts). */
export async function approveCustomer(id: string): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("profiles")
      .select("id, status, member_code")
      .eq("id", id)
      .maybeSingle<{ id: string; status: string; member_code: string | null }>();
    if (!before) return { ok: false, error: "not_found" };
    if (before.status === "active") return { ok: true };  // no-op

    const { error } = await admin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.approve", "profile", id, {
      before: { status: before.status },
      after:  { status: "active" },
    });

    void sendNotification(id, {
      category: "system",
      severity: "success",
      title:    "บัญชีของคุณได้รับการอนุมัติแล้ว",
      body:     before.member_code
        ? `ยินดีต้อนรับ! รหัสสมาชิก: ${before.member_code}`
        : "ยินดีต้อนรับเข้าใช้งาน Pacred",
      link_href: "/dashboard",
    });

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/pending");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}

/** Suspend an active customer. */
export async function suspendCustomer(id: string): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("profiles")
      .select("id, status")
      .eq("id", id)
      .maybeSingle<{ id: string; status: string }>();
    if (!before) return { ok: false, error: "not_found" };
    if (before.status === "suspended") return { ok: true };  // no-op

    const { error } = await admin
      .from("profiles")
      .update({ status: "suspended" })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.suspend", "profile", id, {
      before: { status: before.status },
      after:  { status: "suspended" },
    });

    void sendNotification(id, {
      category: "system",
      severity: "warning",
      title:    "บัญชีของคุณถูกระงับการใช้งาน",
      body:     "กรุณาติดต่อเจ้าหน้าที่หากต้องการสอบถามเพิ่มเติม",
    });

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}
