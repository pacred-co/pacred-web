"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * V-A1 (D1 faithful-port) — admin edit of tb_payment.slip_transfer_time.
 *
 * Spec: see PORT_PLAN Part V-A1 + migration 0109.
 *
 * Legacy reference: member/pcs-admin/payment.php
 *   • L34 / L59 / L68  — INSERT captures `paydate` server-side (the
 *                        REQUEST time, not the bank-transfer time).
 *   • L644 / L659      — UPDATE on approve sets `paydateadmin=NOW()`
 *                        (the APPROVAL-CLICK time).
 *
 * Neither column matches the REAL bank-transfer time on the slip. This
 * action lets a super/accounting admin record that real time so the
 * bank-reconciliation timeline matches the customer's actual
 * transaction. The reconciliation/export reads
 *   coalesce(slip_transfer_time, paydateadmin, paydate)
 * (see 0109 comment block).
 *
 * Validation:
 *   • Empty string clears the column (back to "use approval time").
 *   • Otherwise must be a valid ISO datetime AND
 *       slip_transfer_time ≤ now()                       (no future)
 *       slip_transfer_time ≥ tb_payment.paydate          (not before the
 *                                                         request was
 *                                                         created)
 *
 * RBAC: super + accounting (financial-truth column — ops does not need it).
 * Audit: every change logs an `admin_audit_log` row with {before, after}.
 */

const setTbPaymentSlipTransferTimeSchema = z.object({
  id:                 z.number().int().positive(),     // tb_payment.id is bigint
  slip_transfer_time: z.string().trim().max(40),       // "" → clear; else ISO datetime
});
export type SetTbPaymentSlipTransferTimeInput = z.infer<typeof setTbPaymentSlipTransferTimeSchema>;

export async function adminSetTbPaymentSlipTransferTime(
  input: SetTbPaymentSlipTransferTimeInput,
): Promise<AdminActionResult<{ id: number; slip_transfer_time: string | null }>> {
  const parsed = setTbPaymentSlipTransferTimeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // Parse the incoming value early — fail fast before hitting the DB.
  let next: string | null = null;
  if (d.slip_transfer_time.length > 0) {
    const dt = new Date(d.slip_transfer_time);
    if (Number.isNaN(dt.getTime())) {
      return { ok: false, error: "slip_transfer_time รูปแบบไม่ถูกต้อง (ต้องเป็น ISO datetime)" };
    }
    if (dt.getTime() > Date.now()) {
      return { ok: false, error: "slip_transfer_time ห้ามเป็นเวลาในอนาคต" };
    }
    next = dt.toISOString();
  }

  return withAdmin<{ id: number; slip_transfer_time: string | null }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Read-before-write — need `paydate` for the "not before request" guard
      // AND the previous `slip_transfer_time` for the audit row.
      const { data: before, error: readErr } = await admin
        .from("tb_payment")
        .select("id, paydate, slip_transfer_time")
        .eq("id", d.id)
        .maybeSingle<{ id: number; paydate: string | null; slip_transfer_time: string | null }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!before) return { ok: false, error: "not_found" };

      // Cross-field guard — clearing skips this branch; an explicit value
      // must be ≥ the request timestamp (paydate). The legacy column is
      // "timestamp without time zone"; Supabase serialises it without an
      // offset so we treat it as UTC for the comparison (the rest of the
      // app does the same — see lib/legacy/pcs-chrome.ts).
      if (next && before.paydate) {
        const requestedAt = new Date(before.paydate).getTime();
        if (Number.isFinite(requestedAt) && new Date(next).getTime() < requestedAt) {
          return {
            ok: false,
            error: `slip_transfer_time ห้ามเก่ากว่าเวลาที่ลูกค้าทำรายการ (${before.paydate})`,
          };
        }
      }

      const { error: updErr } = await admin
        .from("tb_payment")
        .update({ slip_transfer_time: next })
        .eq("id", d.id);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(
        adminId,
        "tb_payment.set_slip_transfer_time",
        "payment_slip",                           // per spec: target_type='payment_slip'
        String(d.id),
        {
          tb_payment_id: d.id,
          before:        before.slip_transfer_time,
          after:         next,
          action:        "edit_transfer_time",    // per spec
        },
      );

      revalidatePath("/admin/payments");
      revalidatePath("/admin/yuan-payments");
      return { ok: true, data: { id: d.id, slip_transfer_time: next } };
    },
  );
}
