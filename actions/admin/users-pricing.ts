"use server";

// ────────────────────────────────────────────────────────────────────
// Per-customer PRICING-SEGMENT management (money-critical · 2026-06-05)
// ────────────────────────────────────────────────────────────────────
// Faithful port of two legacy PCS admin pages that set HOW a customer is
// priced — previously the engines applied these values but admins had NO
// way to set/edit/remove them in Pacred (forced back to legacy PHP):
//
//   • ค่าเทียบ (CPS) — legacy users/comparison + editUserComparison +
//     deleteUserComparison. tb_users.userComparison='1' enables it;
//     userComparisonValue = the kg-per-CBM DENSITY THRESHOLD (NOT a price):
//     a CPS customer bills by KG when kgPerCbm > value, else by CBM — i.e.
//     exempt from the normal "max(KG,CBM)" rule (usually cheaper). The price
//     engine (lib/forwarder/resolve-rate.ts) already reads these; this just
//     adds the missing admin CRUD. Legacy default seed = 150.
//
//   • เครดิต (credit line) — legacy users/credit + editUserCredit +
//     deleteUserCredit. tb_users.userCreditValue = วงเงิน (limit, THB),
//     userCreditDate = จำนวนวันเครดิต (default term, days), userCredit='1'
//     the enabled flag. Outstanding = tb_credit.creditvalue (per userid);
//     remaining = limit − outstanding. The grant path (adminMarkForwarderCredit)
//     enforces the headroom + lazily creates the tb_credit row, so enabling
//     here does NOT pre-create it. Remove refuses while outstanding > 0
//     (legacy deleteUserCredit only deletes when creditValue = 0).
//
// All keyed by tb_users.userID (camelCase PK) — this page is userID-keyed,
// unlike actions/admin/credit.ts::adminSetCustomerCreditLimit (profile_id).
// confirm-before-mutate is enforced in the UI (§0f).
// ────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const useridField = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]+$/, "รหัสลูกค้าไม่ถูกต้อง")
  .max(30);

// Verify the customer exists + return their current pricing-segment state.
async function readPricingState(
  admin: ReturnType<typeof createAdminClient>,
  userid: string,
) {
  const { data, error } = await admin
    .from("tb_users")
    .select(
      "userID,userComparison,userComparisonValue,userCredit,userCreditValue,userCreditDate",
    )
    .eq("userID", userid)
    .maybeSingle<{
      userID: string;
      userComparison: string | null;
      userComparisonValue: number | string | null;
      userCredit: string | null;
      userCreditValue: number | string | null;
      userCreditDate: number | string | null;
    }>();
  return { data, error };
}

// ── ค่าเทียบ (CPS) ─────────────────────────────────────────────────────
const setComparisonSchema = z.object({
  userid: useridField,
  value: z.coerce.number().min(0).max(99_999_999),
});
export type AdminSetUserComparisonInput = z.infer<typeof setComparisonSchema>;

/** Enable / update a customer's ค่าเทียบ (CPS density threshold). */
export async function adminSetUserComparison(
  input: AdminSetUserComparisonInput,
): Promise<AdminActionResult> {
  const parsed = setComparisonSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.userid.toUpperCase();
  const value = parsed.data.value;

  return withAdmin(["super", "accounting", "sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: readErr } = await readPricingState(admin, userid);
    if (readErr) {
      console.error(`[users-pricing comparison read] failed`, { userid, code: readErr.code, message: readErr.message });
      return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า (userid ไม่ตรงกับ tb_users)" };

    const { error: updErr } = await admin
      .from("tb_users")
      .update({ userComparison: "1", userComparisonValue: value })
      .eq("userID", userid);
    if (updErr) {
      console.error(`[users-pricing comparison update] failed`, { userid, code: updErr.code, message: updErr.message });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "tb_users.set_comparison", "tb_users", userid, {
      userid,
      before: { userComparison: before.userComparison, userComparisonValue: Number(before.userComparisonValue ?? 0) },
      after: { userComparison: "1", userComparisonValue: value },
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

/** Remove a customer from ค่าเทียบ (legacy deleteUserComparison). */
export async function adminRemoveUserComparison(
  input: { userid: string },
): Promise<AdminActionResult> {
  const parsed = useridField.safeParse(input.userid);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.toUpperCase();

  return withAdmin(["super", "accounting", "sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: readErr } = await readPricingState(admin, userid);
    if (readErr) return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };

    const { error: updErr } = await admin
      .from("tb_users")
      .update({ userComparison: "0", userComparisonValue: 0 })
      .eq("userID", userid);
    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "tb_users.remove_comparison", "tb_users", userid, {
      userid,
      before: { userComparisonValue: Number(before.userComparisonValue ?? 0) },
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

// ── เครดิต (credit line) ──────────────────────────────────────────────
const setCreditSchema = z.object({
  userid: useridField,
  limit: z.coerce.number().min(0).max(10_000_000),
  days: z.coerce.number().int().min(0).max(365),
});
export type AdminSetUserCreditInput = z.infer<typeof setCreditSchema>;

/** Enable / update a customer's credit line (วงเงิน + จำนวนวัน). */
export async function adminSetUserCredit(
  input: AdminSetUserCreditInput,
): Promise<AdminActionResult> {
  const parsed = setCreditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { userid: rawUid, limit, days } = parsed.data;
  const userid = rawUid.toUpperCase();

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: readErr } = await readPricingState(admin, userid);
    if (readErr) {
      console.error(`[users-pricing credit read] failed`, { userid, code: readErr.code, message: readErr.message });
      return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "ไม่พบลูกค้า (userid ไม่ตรงกับ tb_users)" };

    // userCredit='1' the enabled flag (legacy list filters this) + the limit +
    // the default term days. The tb_credit outstanding row is created lazily on
    // the first real credit grant (adminMarkForwarderCredit) — not here.
    const { error: updErr } = await admin
      .from("tb_users")
      .update({ userCredit: "1", userCreditValue: limit, userCreditDate: days })
      .eq("userID", userid);
    if (updErr) {
      console.error(`[users-pricing credit update] failed`, { userid, code: updErr.code, message: updErr.message });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "tb_users.set_credit", "tb_users", userid, {
      userid,
      before: { userCreditValue: Number(before.userCreditValue ?? 0), userCreditDate: Number(before.userCreditDate ?? 0) },
      after: { userCreditValue: limit, userCreditDate: days },
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}

/**
 * Remove a customer's credit line (legacy deleteUserCredit). Refuses while the
 * outstanding balance (tb_credit.creditvalue) is > 0 — you can't pull a credit
 * line that still owes money. Clears the flag/limit/days + deletes the (zero)
 * tb_credit row.
 */
export async function adminRemoveUserCredit(
  input: { userid: string },
): Promise<AdminActionResult> {
  const parsed = useridField.safeParse(input.userid);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const userid = parsed.data.toUpperCase();

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: before, error: readErr } = await readPricingState(admin, userid);
    if (readErr) return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    if (!before) return { ok: false, error: "ไม่พบลูกค้า" };

    // Guard: refuse if there's still outstanding credit owed.
    const { data: creditRow, error: credErr } = await admin
      .from("tb_credit")
      .select("creditvalue")
      .eq("userid", userid)
      .maybeSingle<{ creditvalue: number | string | null }>();
    if (credErr) {
      console.error(`[users-pricing tb_credit read] failed`, { userid, code: credErr.code, message: credErr.message });
      return { ok: false, error: `db_error:${credErr.code ?? "unknown"}` };
    }
    const outstanding = Number(creditRow?.creditvalue ?? 0);
    if (outstanding > 0) {
      return {
        ok: false,
        error: `ยกเลิกเครดิตไม่ได้ — ลูกค้ายังมียอดค้างชำระเครดิต ฿${outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })} (ต้องเคลียร์ให้เป็น 0 ก่อน)`,
      };
    }

    const { error: updErr } = await admin
      .from("tb_users")
      .update({ userCredit: "0", userCreditValue: 0, userCreditDate: 0 })
      .eq("userID", userid);
    if (updErr) return { ok: false, error: updErr.message };

    // Best-effort: drop the zero tb_credit row (legacy deletes it).
    if (creditRow) {
      const { error: delErr } = await admin.from("tb_credit").delete().eq("userid", userid);
      if (delErr) console.error(`[users-pricing tb_credit delete] failed`, { userid, code: delErr.code, message: delErr.message });
    }

    await logAdminAction(adminId, "tb_users.remove_credit", "tb_users", userid, {
      userid,
      before: { userCreditValue: Number(before.userCreditValue ?? 0), userCreditDate: Number(before.userCreditDate ?? 0) },
    });
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${userid}`);
    return { ok: true };
  });
}
