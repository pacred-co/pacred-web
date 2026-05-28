"use server";

// ────────────────────────────────────────────────────────────────────
// U4-2 · Admin actions for customer credit line (เครดิตสินค้า)
// ────────────────────────────────────────────────────────────────────
// Two surfaces:
//
//   1. adminSetCustomerCreditLimit — set the per-customer cap (THB)
//      and term days (e.g. 30). super + accounting only. The actual
//      column writes go to profiles.credit_limit / profiles.credit_days
//      (existing columns from migration 0003; column comments in
//      migration 0071 explain the mapping to upgrade-plan wording).
//
//   2. adminChargeToCredit — staff places an order on the customer's
//      behalf using their credit line (e.g. a phone-in order, or a
//      "ลงไว้ก่อน เดี๋ยวจ่ายสิ้นเดือน" arrangement). Inserts a
//      wallet_transactions row kind='credit_charge', bucket='credit',
//      amount=-thb. Refuses if (outstanding + amount > credit_limit)
//      so the cap is enforced at the write boundary, not just by the
//      v_customer_credit_outstanding view at read time.
//
// Both audit-log via logAdminAction (forwarder.* / customer.* pattern).
// ────────────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ── adminSetCustomerCreditLimit ─────────────────────────────────────
// super + accounting can set a customer's credit cap and terms. The
// profiles columns already exist (0003) — this action gates +
// audit-logs the writes and notifies the customer when meaningful.

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

    const { data: before, error: readErr } = await admin
      .from("profiles")
      .select("id, credit_limit, credit_days, credit_enabled, member_code")
      .eq("id", d.profile_id)
      .maybeSingle<{
        id: string;
        credit_limit: number | null;
        credit_days: number | null;
        credit_enabled: boolean | null;
        member_code: string | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!before) return { ok: false, error: "not_found" };

    // Setting limit > 0 implies the customer has the feature on; a
    // zero limit turns it off. We mirror that to credit_enabled so
    // legacy reports that key off the boolean keep working.
    const update: Record<string, unknown> = {
      credit_limit:   d.credit_limit_thb,
      credit_enabled: d.credit_limit_thb > 0,
    };
    if (d.credit_terms_days !== undefined) {
      update.credit_days = d.credit_terms_days;
    } else if (d.credit_limit_thb > 0 && (before.credit_days ?? 0) <= 0) {
      // First-time enable with no explicit terms → default 30 days
      // (matches the upgrade-plan default).
      update.credit_days = 30;
    }

    const { error: updErr } = await admin
      .from("profiles")
      .update(update)
      .eq("id", d.profile_id);
    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "customer.credit_limit_set", "profile", d.profile_id, {
      before: {
        credit_limit:   Number(before.credit_limit ?? 0),
        credit_days:    Number(before.credit_days ?? 0),
        credit_enabled: Boolean(before.credit_enabled),
      },
      after: update,
    });

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.profile_id}`);
    return { ok: true };
  });
}

// ── adminChargeToCredit ─────────────────────────────────────────────
// Staff bills an in-flight cost to the customer's credit line. Writes
// a completed credit_charge row (bucket='credit', negative amount) so
// the outstanding goes UP by the charged amount. Refuses if the new
// outstanding would exceed credit_limit — the cap is the write-time
// floor, not a read-time hint.
//
// Idempotency: caller may pass a stable reference_id (e.g. the order
// number or forwarder f_no the credit was used for). When supplied, we
// re-SELECT first and return the existing row instead of double-charging.

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
  const parsed = chargeToCreditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<ChargeToCreditData>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // 1) Read the customer's current credit window from the view
    //    (single SQL source of truth). If the row doesn't exist (no
    //    credit_limit set, no prior credit txns) the customer is
    //    NOT enrolled in credit — bail out clearly.
    const { data: state, error: stateErr } = await admin
      .from("v_customer_credit_outstanding")
      .select("credit_limit_thb, outstanding_thb, available_credit_thb")
      .eq("profile_id", d.profile_id)
      .maybeSingle<{
        credit_limit_thb: number;
        outstanding_thb: number;
        available_credit_thb: number;
      }>();
    if (stateErr) return { ok: false, error: stateErr.message };
    if (!state || Number(state.credit_limit_thb) <= 0) {
      return {
        ok: false,
        error: "credit_not_enabled — ลูกค้ายังไม่ได้เปิดวงเงินเครดิต (credit_limit = 0)",
      };
    }

    const limit       = Number(state.credit_limit_thb);
    const outstanding = Number(state.outstanding_thb);
    const projected   = outstanding + d.amount_thb;
    if (projected > limit) {
      return {
        ok: false,
        error: `credit_over_limit — ยอดเครดิตเกินวงเงิน (มียอดค้าง ฿${outstanding.toLocaleString("th-TH", { minimumFractionDigits: 2 })} + ชาร์จใหม่ ฿${d.amount_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} = ฿${projected.toLocaleString("th-TH", { minimumFractionDigits: 2 })} > วงเงิน ฿${limit.toLocaleString("th-TH", { minimumFractionDigits: 2 })})`,
      };
    }

    // 2) Idempotency probe — only meaningful when caller supplied a
    //    reference. A bare "charge ฿500 reason=manual" has no anchor
    //    to dedupe against, so we always insert in that case.
    if (d.reference_type && d.reference_id) {
      const { data: existingTx, error: existingTxErr } = await admin
        .from("wallet_transactions")
        .select("id, amount")
        .eq("profile_id",     d.profile_id)
        .eq("reference_type", d.reference_type)
        .eq("reference_id",   d.reference_id)
        .eq("kind",           "credit_charge")
        .eq("status",         "completed")
        .maybeSingle<{ id: string; amount: number }>();
      if (existingTxErr) {
        console.error(`[wallet_transactions list] failed`, { code: existingTxErr.code, message: existingTxErr.message });
      }
      if (existingTx) {
        return {
          ok: true,
          data: {
            tx_id:                existingTx.id,
            already_charged:      true,
            new_outstanding_thb:  outstanding,
          },
        };
      }
    }

    // 3) Insert the credit_charge debit (negative amount on the
    //    credit bucket). The 0007 trigger will recompute
    //    wallet.credit_balance accordingly.
    const { data: tx, error: txErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id:     d.profile_id,
        bucket:         "credit",
        amount:         -d.amount_thb,
        kind:           "credit_charge",
        status:         "completed",
        reference_type: d.reference_type ?? null,
        reference_id:   d.reference_id   ?? null,
        admin_id:       adminId,
        note:           d.reason,
      })
      .select("id")
      .single<{ id: string }>();
    if (txErr) return { ok: false, error: `wallet insert: ${txErr.message}` };

    await logAdminAction(adminId, "customer.credit_charged", "profile", d.profile_id, {
      tx_id:          tx.id,
      amount_thb:     d.amount_thb,
      reason:         d.reason,
      reference_type: d.reference_type ?? null,
      reference_id:   d.reference_id   ?? null,
      before: { outstanding_thb: outstanding },
      after:  { outstanding_thb: projected },
    });

    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${d.profile_id}`);
    revalidatePath("/wallet/history");

    return {
      ok: true,
      data: {
        tx_id:                tx.id,
        already_charged:      false,
        new_outstanding_thb:  projected,
      },
    };
  });
}
