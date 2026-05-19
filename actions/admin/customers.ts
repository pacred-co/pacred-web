"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

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

/**
 * Approve a customer — D1 Wave-2 (_SYNTHESIS §7.1 / §7.4): re-pointed
 * from the rebuilt-era `profiles` table to the legacy `tb_users` table.
 *
 * `id` is the legacy member code (`tb_users.userid`, e.g. `PR2791`) —
 * the identifier the re-pointed customer list (page.tsx) passes via
 * `<CustomerRowActions>`. Approving lifts a pending account by setting
 * the legacy `useractive` flag to `'1'` (1=ใช้งานแล้ว). A suspended
 * (deleted) account — `userstatus='0'` — is restored by setting it back
 * to `'1'`. Both flags are cleared so the derived status becomes active.
 */
export async function approveCustomer(id: string): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("tb_users")
      .select("userid, useractive, userstatus")
      .eq("userid", id)
      .maybeSingle<{ userid: string; useractive: string | null; userstatus: string | null }>();
    if (!before) return { ok: false, error: "not_found" };
    // No-op when already active (useractive='1' and not deleted).
    if (before.useractive === "1" && before.userstatus !== "0") return { ok: true };

    const { error } = await admin
      .from("tb_users")
      .update({ useractive: "1", userstatus: "1" })
      .eq("userid", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.approve", "tb_users", id, {
      before: { useractive: before.useractive, userstatus: before.userstatus },
      after:  { useractive: "1", userstatus: "1" },
    });

    // Note: customer notification deferred — migrated tb_users customers
    // have no `profiles` row yet (the _SYNTHESIS §8 ghost finding;
    // sendNotification is profiles-keyed). Wave-2 profiles backfill
    // re-enables the notify side-effect.

    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/pending");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Convert a personal account to juristic
// Port of legacy `pcs-admin/api/customers-move-to-juristic/` — used when
// a customer started as บุคคลธรรมดา then later opened a company and
// wants the same wallet/history to roll under the corporate identity.
//
// Trigger `guard_corporate_account_type` enforces that corporate rows
// can only exist where profiles.account_type='juristic', so the update
// order is non-negotiable:
//   1. Flip profiles.account_type → 'juristic'
//   2. Upsert corporate row (insert if absent, else refresh)
// If step 2 fails, revert step 1 so the two stay consistent.
// ────────────────────────────────────────────────────────────
const convertToJuristicSchema = z.object({
  profile_id:      z.string().uuid(),
  tax_id:          z.string().trim().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้อง 13 หลัก"),
  company_name:    z.string().trim().min(1, "กรอกชื่อบริษัท").max(255),
  company_address: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  // Admin-issued conversions are treated as already verified (the admin
  // is the verifier). Skip DBD round-trip; payload field stays null.
  mark_verified:   z.boolean().default(true),
});
export type ConvertToJuristicInput = z.infer<typeof convertToJuristicSchema>;

export async function adminConvertToJuristic(
  input: ConvertToJuristicInput,
): Promise<AdminActionResult> {
  const parsed = convertToJuristicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before } = await admin
      .from("profiles")
      .select("id, account_type, member_code, first_name, last_name")
      .eq("id", d.profile_id)
      .maybeSingle<{ id: string; account_type: "personal" | "juristic"; member_code: string | null; first_name: string | null; last_name: string | null }>();
    if (!before) return { ok: false, error: "not_found" };
    if (before.account_type === "juristic") return { ok: false, error: "already_juristic" };

    // Block duplicate tax_id collisions early — the partial unique index
    // on corporate(tax_id) only covers 'verified' rows, so we double-check.
    const { data: clash } = await admin
      .from("corporate")
      .select("profile_id")
      .eq("tax_id", d.tax_id)
      .neq("profile_id", d.profile_id)
      .maybeSingle();
    if (clash) return { ok: false, error: "tax_id_already_used" };

    // Step 1 — flip account_type so the corporate trigger lets the insert through
    const { error: profErr } = await admin
      .from("profiles")
      .update({ account_type: "juristic" })
      .eq("id", d.profile_id);
    if (profErr) return { ok: false, error: profErr.message };

    // Step 2 — upsert the corporate row
    const corporatePayload: Record<string, unknown> = {
      profile_id:      d.profile_id,
      tax_id:          d.tax_id,
      company_name:    d.company_name,
      company_address: d.company_address ?? null,
      status:          d.mark_verified ? "verified" : "pending",
      verified_at:     d.mark_verified ? new Date().toISOString() : null,
      verified_by:     d.mark_verified ? adminId : null,
      rejection_reason: null,
    };
    const { error: corpErr } = await admin
      .from("corporate")
      .upsert(corporatePayload, { onConflict: "profile_id" });

    if (corpErr) {
      // Rollback the account_type flip — best effort, so the trigger
      // doesn't end up rejecting future updates from a half-state.
      await admin
        .from("profiles")
        .update({ account_type: before.account_type })
        .eq("id", d.profile_id);
      return { ok: false, error: corpErr.message };
    }

    const display = `${before.first_name ?? ""} ${before.last_name ?? ""}`.trim()
      || d.company_name;

    await logAdminAction(adminId, "customer.convert_to_juristic", "profile", d.profile_id, {
      previous_account_type: before.account_type,
      tax_id:                d.tax_id,
      company_name:          d.company_name,
      mark_verified:         d.mark_verified,
    });

    void sendNotification(d.profile_id, notify.customerConvertedToJuristic({
      displayName: display,
      companyName: d.company_name,
    }));

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.profile_id}`);
    revalidatePath(`/admin/customers/${d.profile_id}/convert-to-juristic`);
    return { ok: true };
  });
}

/**
 * Suspend an active customer — D1 Wave-2 (_SYNTHESIS §7.1 / §7.4):
 * re-pointed from `profiles` to the legacy `tb_users` table. `id` is the
 * legacy member code (`tb_users.userid`). Legacy PCS has no distinct
 * "suspended" state — a disabled account is `userstatus='0'`
 * (0=ลบบัญชี), which the re-pointed customer list renders as "ระงับ".
 */
export async function suspendCustomer(id: string): Promise<AdminActionResult> {
  if (!id || typeof id !== "string") return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before } = await admin
      .from("tb_users")
      .select("userid, userstatus")
      .eq("userid", id)
      .maybeSingle<{ userid: string; userstatus: string | null }>();
    if (!before) return { ok: false, error: "not_found" };
    if (before.userstatus === "0") return { ok: true };  // no-op — already disabled

    const { error } = await admin
      .from("tb_users")
      .update({ userstatus: "0" })
      .eq("userid", id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "customer.suspend", "tb_users", id, {
      before: { userstatus: before.userstatus },
      after:  { userstatus: "0" },
    });

    // Note: customer notification deferred — see approveCustomer comment.

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${id}`);
    return { ok: true };
  });
}
