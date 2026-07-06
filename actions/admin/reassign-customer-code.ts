"use server";

/**
 * actions/admin/reassign-customer-code.ts — "รันเลข PR ลูกค้าใหม่".
 *
 * Owner 2026-07-06 — next to the reset-password button, an ULTRA-ONLY button that
 * re-assigns a customer a NEW PR code = the LOWEST VACANT gap (or an explicit
 * code), MOVES ALL of the customer's data to it, FREES the old code, and
 * preserves login + receipts + everything. Only the PR number changes.
 *
 * 🔐 Role gate — `ultra` ONLY (NOT super, NOT normies). This RE-KEYS a customer's
 * entire identity across 52+ tables + auth — the strongest destructive-adjacent
 * operation — so it is reserved for "Ultra Admin Z". NOTE: withAdmin(["ultra"])
 * alone is NOT sufficient because requireAdmin grants ANY god role (super/normies)
 * via its isGodRole bypass — so we RE-ASSERT `roles.includes("ultra")` inside the
 * body (this explicit check is the load-bearing gate; do NOT use isGodRole here).
 *
 * ATOMIC + INTROSPECTIVE: delegates to the shared server-side mover
 * (lib/admin/reassign-member-code-mover.ts) which runs the whole move in ONE pg
 * transaction over an introspected table list — identical invariants to the
 * dry-run script scripts/reassign-member-code.mjs. Confirm-before-mutate is
 * enforced at the UI (§0f). Audited via logAdminAction; revalidates the page.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { moveMemberCode } from "@/lib/admin/reassign-member-code-mover";
import { PR_CODE_RE } from "@/lib/admin/reassign-member-code";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const inputSchema = z.object({
  memberCode: z.string().trim().min(1, "missing memberCode").max(10),
  /** Optional explicit target; omit → the lowest vacant gap is computed. */
  newCode: z
    .string()
    .trim()
    .max(10)
    .regex(PR_CODE_RE, "รหัสใหม่ต้องเป็นรูปแบบ PRxxxx")
    .optional(),
});
export type AdminReassignCustomerCodeInput = z.infer<typeof inputSchema>;

export type AdminReassignCustomerCodeData = {
  fromCode: string;
  toCode: string;
  movedRows: number;
  tableCount: number;
  authRealigned: boolean;
  /** Present if tables moved but the auth-email realign lagged (needs a manual fix). */
  authWarning?: string;
};

export async function adminReassignCustomerCode(
  input: AdminReassignCustomerCodeInput,
): Promise<AdminActionResult<AdminReassignCustomerCodeData>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { memberCode, newCode } = parsed.data;

  // withAdmin(["ultra"]) admits any god role; the isGodRole bypass means super +
  // normies would pass. Re-assert ultra explicitly below — that is the real gate.
  return withAdmin<AdminReassignCustomerCodeData>(["ultra"], async ({ adminId }) => {
    const roles = (await getAdminRoles()) ?? [];
    if (!roles.includes("ultra")) {
      return { ok: false, error: "forbidden — เฉพาะ Ultra Admin Z รันเลข PR ใหม่ได้" };
    }

    const res = await moveMemberCode({ fromCode: memberCode, newCode: newCode ?? null });
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "tb_users.reassign_member_code", "tb_users", memberCode, {
      from_code: res.plan.fromCode,
      to_code: res.plan.toCode,
      moved_rows: res.movedRows,
      table_count: res.plan.tables.length,
      auth_realigned: res.authRealigned,
      auth_warning: res.authWarning ?? null,
    });

    // Refresh the customer surfaces (the old code page now 404s; the new one lives).
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${res.plan.fromCode}`);
    revalidatePath(`/admin/customers/${res.plan.toCode}`);

    return {
      ok: true,
      data: {
        fromCode: res.plan.fromCode,
        toCode: res.plan.toCode,
        movedRows: res.movedRows,
        tableCount: res.plan.tables.length,
        authRealigned: res.authRealigned,
        authWarning: res.authWarning,
      },
    };
  });
}
