"use server";

// ────────────────────────────────────────────────────────────────────
// Admin actions for the customer credit line · ADR-0023 (legacy-SOT repoint)
// ────────────────────────────────────────────────────────────────────
// SOT (ADR-0023 D-1): limit = tb_users.userCreditValue (camelCase, per
// userID); outstanding = tb_credit.creditvalue (lowercase, per userid).
// The rebuilt profiles.credit_limit/credit_days/credit_enabled +
// wallet_transactions bucket='credit' model is FROZEN (empty on prod) and
// retires in a later cleanup — no new writes here.
//
//   1. adminSetCustomerCreditLimit — set the per-customer cap (THB) on
//      tb_users.userCreditValue. super + accounting only. 0 = feature off
//      (userCreditValue>0 is the "enabled" signal — no separate boolean).
//      Reachable at /admin/customers/[id]. (ADR-0023 D-5 #4.)
//
//   2. adminChargeToCredit — DEPRECATED (ADR-0023 D-5 #5). The live,
//      reachable, faithful grant is adminMarkForwarderCredit
//      (actions/admin/forwarders-field-edits.ts) which UPSERTs
//      tb_credit.creditvalue on a real forwarder bill with a headroom gate.
//      A second generic "charge to credit" wrote the DEAD wallet_transactions
//      bucket='credit' model (0 rows on prod) → a silent dead-write trap
//      (AGENTS.md §0e). It is now a no-op stub that refuses + points callers
//      at the real grant. (No UI invoked it — verified zero consumers.)
// ────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ── adminSetCustomerCreditLimit ─────────────────────────────────────
// super + accounting set a customer's credit cap. ADR-0023 D-5 #4: the
// canonical limit column is tb_users.userCreditValue (NOT the dead
// profiles.credit_limit). Resolve profile_id → member_code, then write the
// legacy column. credit_terms_days is accepted for signature stability but
// NOT persisted — the legacy has no global terms-days column (D-2/D-5 #1);
// the per-grant due date lives on tb_forwarder.fcreditdate via
// adminMarkForwarderCredit. We log it in the audit payload for traceability.

const setCreditLimitSchema = z.object({
  profile_id:         z.string().uuid(),
  credit_limit_thb:   z.coerce.number().min(0).max(10_000_000),
  credit_terms_days:  z.coerce.number().int().min(0).max(365).optional(),
});
export type AdminSetCustomerCreditLimitInput = z.infer<typeof setCreditLimitSchema>;

export async function adminSetCustomerCreditLimit(
  input: AdminSetCustomerCreditLimitInput,
): Promise<AdminActionResult> {
  const parsed = setCreditLimitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Resolve profile_id → member_code (PR-code = tb_users.userID).
    const { data: profileRow, error: profileErr } = await admin
      .from("profiles")
      .select("id, member_code")
      .eq("id", d.profile_id)
      .maybeSingle<{ id: string; member_code: string | null }>();
    if (profileErr) {
      console.error(`[profiles read] failed`, { code: profileErr.code, message: profileErr.message, profile_id: d.profile_id });
      return { ok: false, error: profileErr.message };
    }
    if (!profileRow) return { ok: false, error: "not_found" };
    const memberCode = profileRow.member_code ?? "";
    if (!memberCode) {
      return { ok: false, error: "no_member_code — ลูกค้ายังไม่มีรหัส PR (ยังไม่ migrate)" };
    }

    // Read the current legacy limit for the before/after audit (tb_users · camelCase).
    const { data: before, error: readErr } = await admin
      .from("tb_users")
      .select("userID, userCreditValue")
      .eq("userID", memberCode)
      .maybeSingle<{ userID: string; userCreditValue: number | string | null }>();
    if (readErr) {
      console.error(`[tb_users credit read] failed`, { code: readErr.code, message: readErr.message, userid: memberCode });
      return { ok: false, error: readErr.message };
    }
    if (!before) {
      return { ok: false, error: "tb_users_not_found — ไม่พบบัญชีลูกค้าในระบบเดิม" };
    }
    const prevLimit = Number(before.userCreditValue ?? 0);

    // Write the canonical legacy limit. userCreditValue>0 IS the enabled
    // signal (no separate boolean) — setting 0 turns the credit line off.
    const { error: updErr } = await admin
      .from("tb_users")
      .update({ userCreditValue: d.credit_limit_thb })
      .eq("userID", memberCode);
    if (updErr) {
      console.error(`[tb_users credit update] failed`, { code: updErr.code, message: updErr.message, userid: memberCode });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "customer.credit_limit_set", "tb_users", memberCode, {
      profile_id:        d.profile_id,
      member_code:       memberCode,
      // credit_terms_days has no legacy home — recorded for traceability only
      // (the binding due date is per-order on tb_forwarder.fcreditdate).
      credit_terms_days: d.credit_terms_days ?? null,
      before:            { userCreditValue: prevLimit },
      after:             { userCreditValue: d.credit_limit_thb },
    });

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.profile_id}`);
    return { ok: true };
  });
}

// ── adminChargeToCredit — DEPRECATED (ADR-0023 D-5 #5) ──────────────
// The faithful, reachable grant is adminMarkForwarderCredit (it UPSERTs
// tb_credit.creditvalue on a real forwarder bill with a `userCreditValue −
// creditvalue >= pricePay` headroom gate, reachable at
// /admin/forwarders/[fNo]). This generic "charge to credit" wrote the DEAD
// wallet_transactions bucket='credit' model (0 rows on prod) — a silent
// dead-write trap. It is intentionally retained as a refusing stub (zero UI
// consumers today) so any future caller fails loudly toward the real path
// instead of silently writing nothing. The input schema is preserved so the
// signature is stable.

const REFERENCE_TYPES = ["order_header", "forwarder", "manual"] as const;

const chargeToCreditSchema = z.object({
  profile_id:     z.string().uuid(),
  amount_thb:     z.coerce.number().positive().max(10_000_000),
  reason:         z.string().trim().min(3).max(500),
  reference_type: z.enum(REFERENCE_TYPES).optional(),
  reference_id:   z.string().trim().max(255).optional(),
});
export type AdminChargeToCreditInput = z.infer<typeof chargeToCreditSchema>;

type ChargeToCreditData = { tx_id: string; already_charged: boolean; new_outstanding_thb: number };

export async function adminChargeToCredit(
  input: AdminChargeToCreditInput,
): Promise<AdminActionResult<ChargeToCreditData>> {
  // Deprecated per ADR-0023 D-5 #5. Validate the shape (keeps the schema +
  // exported type live), then REFUSE — do NOT write the dead
  // wallet_transactions bucket='credit' model. Direct the caller to the
  // faithful grant (adminMarkForwarderCredit on the forwarder bill).
  chargeToCreditSchema.safeParse(input);
  return {
    ok: false,
    error:
      "deprecated — ใช้การให้เครดิตจากรายการฝากนำเข้า (/admin/forwarders/[fNo] → ให้เครดิต) " +
      "ซึ่งบันทึก tb_credit.creditvalue โดยตรง (ADR-0023). adminChargeToCredit เลิกใช้แล้ว.",
  };
}
