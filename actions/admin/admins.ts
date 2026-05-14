"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

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

// ────────────────────────────────────────────────────────────
// Transfer a customer's sales rep WITH a reason and dual-side notification.
// Port of legacy PHP `transferSalesCustomers.php` for the single-customer
// case. Bulk transfer is a separate workflow (adminBulkTransferSalesRep).
//
// Difference from adminAssignSalesRep():
//   • mandatory non-empty `reason` (audited)
//   • surfaces who the previous rep was in the audit payload
//   • fires three in-app notifications:
//       - the old rep ("ลูกค้า X ถูกย้ายออกจากทีมของท่าน")
//       - the new rep ("ลูกค้า X ถูกย้ายเข้าทีมของท่าน")
//       - the customer    ("ทีมเซลล์ของท่านถูกย้ายไปดูแลโดย Y")
//     (the second + third skip silently if either id is null)
// ────────────────────────────────────────────────────────────
const transferRepSchema = z.object({
  customer_id:        z.string().uuid(),
  new_sales_admin_id: z.string().uuid().nullable(),         // null = unassign (released to pool)
  reason:             z.string().trim().min(3, "กรุณาระบุเหตุผล").max(500),
});
export type TransferSalesRepInput = z.infer<typeof transferRepSchema>;

export async function adminTransferSalesRep(input: TransferSalesRepInput): Promise<AdminActionResult> {
  const parsed = transferRepSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load current state so we can notify the previous rep and audit the delta
    const { data: before } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, company_name, account_type, sales_admin_id")
      .eq("id", d.customer_id)
      .maybeSingle<{
        id: string; member_code: string | null; first_name: string | null; last_name: string | null;
        company_name: string | null; account_type: "personal" | "juristic"; sales_admin_id: string | null;
      }>();

    if (!before) return { ok: false, error: "customer_not_found" };

    const previous_sales_admin_id = before.sales_admin_id;
    if (previous_sales_admin_id === d.new_sales_admin_id) {
      return { ok: false, error: "same_rep_no_change" };
    }

    const { error: updErr } = await admin
      .from("profiles")
      .update({ sales_admin_id: d.new_sales_admin_id })
      .eq("id", d.customer_id);
    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "customer.transfer_rep", "profile", d.customer_id, {
      previous_sales_admin_id,
      new_sales_admin_id: d.new_sales_admin_id,
      reason:             d.reason,
    });

    const customerDisplay = before.account_type === "juristic"
      ? (before.company_name ?? "ลูกค้า")
      : `${before.first_name ?? ""} ${before.last_name ?? ""}`.trim() || "ลูกค้า";
    const customerLabel = `${customerDisplay}${before.member_code ? ` (${before.member_code})` : ""}`;

    // Notify old rep (silently skipped if unassigned)
    if (previous_sales_admin_id) {
      void sendNotification(previous_sales_admin_id, {
        category: "sales",
        severity: "info",
        title:    "ลูกค้าถูกย้ายออกจากทีม",
        body:     `${customerLabel} ถูกย้ายไปทีมอื่น — เหตุผล: ${d.reason}`,
      });
    }
    // Notify new rep
    if (d.new_sales_admin_id) {
      void sendNotification(d.new_sales_admin_id, {
        category:  "sales",
        severity:  "info",
        title:     "ลูกค้าถูกย้ายเข้าทีมท่าน",
        body:      `${customerLabel} ถูกย้ายมาดูแลในทีมท่าน — เหตุผล: ${d.reason}`,
        link_href: `/admin/customers/${d.customer_id}`,
      });
    }
    // Notify customer (only if newly assigned to someone — unassign isn't worth notifying)
    if (d.new_sales_admin_id) {
      void sendNotification(d.customer_id, {
        category: "system",
        severity: "info",
        title:    "ทีมเซลล์ที่ดูแลถูกเปลี่ยน",
        body:     "ทีม Pacred ได้มอบหมายเซลล์ใหม่ให้ดูแลบัญชีของท่าน",
      });
    }

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.customer_id}`);
    revalidatePath(`/admin/customers/${d.customer_id}/transfer-rep`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Bulk transfer sales rep across many customers in one shot.
// Ports legacy transferSalesCustomers.php — used when a rep leaves
// or for portfolio rebalancing between reps. Complements the per-customer
// adminTransferSalesRep() above; bulk path skips the reason field +
// per-customer notification fan-out to keep the single UPDATE tight.
// ────────────────────────────────────────────────────────────
const bulkTransferRepSchema = z.object({
  customer_ids:       z.array(z.string().uuid()).min(1, "เลือกอย่างน้อย 1 ลูกค้า").max(500),
  new_sales_admin_id: z.string().uuid().nullable(),    // null = unassign
});

export async function adminBulkTransferSalesRep(
  input: z.infer<typeof bulkTransferRepSchema>,
): Promise<AdminActionResult<{ updated: number }>> {
  const parsed = bulkTransferRepSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    // If a target rep is given, verify it's an active sales_admin/super to
    // prevent accidentally pointing customers at a non-admin profile.
    if (d.new_sales_admin_id) {
      const { data: target } = await admin
        .from("admins")
        .select("profile_id, role, is_active")
        .eq("profile_id", d.new_sales_admin_id)
        .in("role", ["sales_admin", "super"])
        .eq("is_active", true)
        .maybeSingle();
      if (!target) return { ok: false, error: "target_not_active_sales_admin" };
    }

    const { error, count } = await admin
      .from("profiles")
      .update({ sales_admin_id: d.new_sales_admin_id }, { count: "exact" })
      .in("id", d.customer_ids);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.bulk_transfer_rep", "profile", `${d.customer_ids.length}_customers`, {
      customer_ids:       d.customer_ids,
      new_sales_admin_id: d.new_sales_admin_id,
    });

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/transfer-rep");
    return { ok: true, data: { updated: count ?? d.customer_ids.length } };
  });
}
