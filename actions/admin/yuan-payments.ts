"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const STATUSES = ["pending","processing","completed","failed","refunded"] as const;

// ── W-3 / revenue-flow H-1 — status-transition allow-list ────────────
// adminUpdateYuanPayment previously let ANY status → ANY status. That is
// a money hole: the wallet-tx flip block below only fires on a *new*
// `completed` and the refund branch only cancels a *pending* debit. So
// `refunded → completed` re-stamped the payment completed and shipped the
// goods WITHOUT re-debiting the wallet — the customer kept the money and
// the goods. The order/forwarder actions guard transitions with
// isStatusRollback; yuan-payment statuses are not a single linear chain
// (failed / refunded are branch terminals), so we use an explicit
// per-from-status allow-list instead.
//
// Rules:
//   pending    → processing | completed | failed | refunded
//   processing → completed  | failed    | refunded
//   completed  → refunded   (a settled payment may be refunded — the
//                            wallet credit-back is handled below)
//   failed     → pending    (retry only — no money moved on a failed
//                            payment, so re-opening is safe)
//   refunded   → (terminal — money already returned; no transition out)
//
// Explicitly FORBIDDEN — any transition that would require re-taking
// money the code does not re-debit: refunded→completed, refunded→*,
// failed→completed, failed→processing, completed→processing/pending/failed.
const YUAN_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  pending:    ["processing", "completed", "failed", "refunded"],
  processing: ["completed", "failed", "refunded"],
  completed:  ["refunded"],
  failed:     ["pending"],
  refunded:   [],
};

/** True when `from → to` is a permitted yuan-payment status transition. */
function isYuanTransitionAllowed(from: string, to: string): boolean {
  if (from === to) return true; // a no-op re-save of the same status is fine
  return (YUAN_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

const updateSchema = z.object({
  id:               z.string().uuid(),
  status:           z.enum(STATUSES).optional(),
  cost_rate:        z.number().positive().optional(),
  cost_thb:         z.number().nonnegative().optional(),
  profit_thb:       z.number().optional(),
  admin_proof_url:  z.string().max(500).optional(),
  note:             z.string().trim().max(1000).optional(),
});
export type AdminUpdateYuanPaymentInput = z.infer<typeof updateSchema>;

const STATUS_LABEL: Record<string, string> = {
  pending:    "รอตรวจสอบ",
  processing: "กำลังโอน",
  completed:  "สำเร็จ",
  failed:     "ไม่สำเร็จ",
  refunded:   "คืนเงินแล้ว",
};

export async function adminUpdateYuanPayment(input: AdminUpdateYuanPaymentInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("yuan_payments")
      .select("id, profile_id, status, yuan_amount, thb_amount, paid_via_wallet")
      .eq("id", d.id)
      .maybeSingle<{ id: string; profile_id: string; status: string; yuan_amount: number; thb_amount: number; paid_via_wallet: boolean }>();
    if (!existing) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = { admin_id_update: adminId };
    let statusChanged = false;
    if (d.status && d.status !== existing.status) {
      // W-3 / revenue-flow H-1 — reject any transition that is not on the
      // allow-list. Most importantly this blocks refunded→completed (and
      // failed→completed), which would re-stamp the payment completed
      // without re-debiting the wallet → customer keeps money + goods.
      if (!isYuanTransitionAllowed(existing.status, d.status)) {
        return {
          ok: false,
          error: `เปลี่ยนสถานะ ${STATUS_LABEL[existing.status] ?? existing.status} → ${STATUS_LABEL[d.status] ?? d.status} ไม่ได้ (ไม่อนุญาต) — สถานะนี้ห้ามย้อน/ข้าม เพราะจะทำให้ยอด wallet ไม่ตรง`,
        };
      }
      update.status = d.status;
      statusChanged = true;
      if (d.status === "completed" || d.status === "processing") {
        update.executed_at = new Date().toISOString();
      }
    }
    if (d.cost_rate       != null) update.cost_rate       = d.cost_rate;
    if (d.cost_thb        != null) update.cost_thb        = d.cost_thb;
    if (d.profit_thb      != null) update.profit_thb      = d.profit_thb;
    if (d.admin_proof_url != null) update.admin_proof_url = d.admin_proof_url || null;

    const { error } = await admin.from("yuan_payments").update(update).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    // If a wallet-paid payment is completed, flip the paired wallet_transaction to completed
    if (d.status === "completed" && existing.paid_via_wallet) {
      await admin
        .from("wallet_transactions")
        .update({ status: "completed", admin_id_update: adminId })
        .eq("reference_type", "yuan_payment")
        .eq("reference_id", existing.id)
        .eq("status", "pending");
    }

    // If a wallet-paid payment is refunded/failed, reverse the wallet
    // debit. W-3 / revenue-flow H-2 — the debit may be `pending` (payment
    // refunded before it ever completed) OR `completed` (the common case:
    // a payment is completed first, then later refunded — its wallet tx is
    // `completed` too). The old code filtered `.eq("status","pending")`
    // only, so a refund of a completed wallet-paid transfer left the debit
    // standing and the customer was never credited back. Cancelling both
    // pending AND completed makes the balance trigger (0007) drop the
    // debit → the customer's wallet is restored.
    if ((d.status === "refunded" || d.status === "failed") && existing.paid_via_wallet) {
      const { error: reverseErr } = await admin
        .from("wallet_transactions")
        .update({ status: "cancelled", admin_id_update: adminId })
        .eq("reference_type", "yuan_payment")
        .eq("reference_id", existing.id)
        .in("status", ["pending", "completed"]);
      if (reverseErr) {
        // The yuan_payments row is already updated; surface so an admin
        // reconciles the still-standing debit rather than silently leaving
        // the customer charged for a refunded transfer.
        return {
          ok: false,
          error: `payment marked ${d.status} but wallet refund failed (debit for ${existing.id} stands): ${reverseErr.message}`,
        };
      }
    }

    await logAdminAction(adminId, "yuan_payment.update", "yuan_payment", existing.id, {
      before: { status: existing.status }, after: update,
    });

    if (statusChanged && d.status) {
      const isSuccess = d.status === "completed";
      void sendNotification(existing.profile_id, {
        category: "yuan_payment",
        severity: isSuccess ? "success" : (d.status === "refunded" || d.status === "failed") ? "warning" : "info",
        title:    `ฝากโอนหยวน — ${STATUS_LABEL[d.status]}`,
        body:     `¥${Number(existing.yuan_amount).toFixed(2)} = ฿${Number(existing.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
        link_href: `/service-payment`,
        reference_type: "yuan_payment",
        reference_id:   existing.id,
        ...(d.note ? { body: d.note } : {}),
      });
    }

    revalidatePath("/admin/yuan-payments");
    revalidatePath(`/admin/yuan-payments/${d.id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// T-P3: BULK approve pending yuan_payments (cargo revenue path)
// ────────────────────────────────────────────────────────────
//
// Same pattern as adminBulkApproveDeposits (wallet.ts) — but for
// yuan_payments. Skips already-progressed rows silently.
//
// "Approve" here = transition pending → processing (admin starts
// transferring to the customer's Alipay account). Final 'completed'
// requires per-row context (cost rate, profit, proof URL) so it stays
// single-row.

const yuanBulkSchema = z.object({
  ids:  z.array(z.string().uuid()).min(1, "ต้องเลือกอย่างน้อย 1 รายการ").max(50, "เลือกได้สูงสุด 50 รายการต่อรอบ"),
  note: z.string().trim().max(500).optional(),
});
export type AdminBulkApproveYuanPaymentsInput = z.infer<typeof yuanBulkSchema>;

type YuanBulkResult = { approved: number; skipped: number; errors: Array<{ id: string; reason: string }> };

export async function adminBulkApproveYuanPayments(
  input: AdminBulkApproveYuanPaymentsInput,
): Promise<AdminActionResult<YuanBulkResult>> {
  const parsed = yuanBulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids } = parsed.data;

  return withAdmin<YuanBulkResult>(["accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: rows, error: selErr } = await admin
      .from("yuan_payments")
      .select("id, profile_id, status, yuan_amount, thb_amount, paid_via_wallet")
      .in("id", ids);
    if (selErr) return { ok: false, error: selErr.message };

    const result: YuanBulkResult = { approved: 0, skipped: 0, errors: [] };
    type Row = { id: string; profile_id: string; status: string; yuan_amount: number; thb_amount: number; paid_via_wallet: boolean };

    for (const row of (rows ?? []) as Row[]) {
      if (row.status !== "pending") {
        result.skipped++;
        continue;
      }

      const { error: updErr } = await admin
        .from("yuan_payments")
        .update({
          status:          "processing",
          executed_at:     new Date().toISOString(),
          admin_id_update: adminId,
        })
        .eq("id", row.id);

      if (updErr) {
        result.errors.push({ id: row.id, reason: updErr.message });
        continue;
      }

      result.approved++;

      await logAdminAction(adminId, "yuan_payment.bulk_approve", "yuan_payment", row.id, {
        yuan_amount: row.yuan_amount,
        thb_amount:  row.thb_amount,
        before:      { status: "pending" },
        after:       { status: "processing" },
      });

      void sendNotification(row.profile_id, {
        category: "yuan_payment",
        severity: "info",
        title:    `ฝากโอนหยวน — ${STATUS_LABEL.processing}`,
        body:     `¥${Number(row.yuan_amount).toFixed(2)} = ฿${Number(row.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} — กำลังโอนไป Alipay`,
        link_href: `/service-payment`,
        reference_type: "yuan_payment",
        reference_id:   row.id,
      });
    }

    const seenIds = new Set((rows ?? []).map((r) => r.id));
    for (const id of ids) {
      if (!seenIds.has(id)) {
        result.errors.push({ id, reason: "not_found" });
      }
    }

    revalidatePath("/admin/yuan-payments");
    return { ok: true, data: result };
  });
}

// ────────────────────────────────────────────────────────────
// V-A1: set yuan_payments.slip_transferred_at (admin edit)
// ────────────────────────────────────────────────────────────

const setYuanSlipTransferredAtSchema = z.object({
  id:                  z.string().uuid(),
  slip_transferred_at: z.string().trim().max(40),    // "" → clear
});
export type SetYuanSlipTransferredAtInput = z.infer<typeof setYuanSlipTransferredAtSchema>;

export async function adminSetYuanSlipTransferredAt(
  input: SetYuanSlipTransferredAtInput,
): Promise<AdminActionResult<{ id: string; slip_transferred_at: string | null }>> {
  const parsed = setYuanSlipTransferredAtSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  let next: string | null = null;
  if (d.slip_transferred_at.length > 0) {
    const dt = new Date(d.slip_transferred_at);
    if (Number.isNaN(dt.getTime())) return { ok: false, error: "slip_transferred_at รูปแบบไม่ถูกต้อง" };
    next = dt.toISOString();
  }

  return withAdmin<{ id: string; slip_transferred_at: string | null }>(
    ["super", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const { data: before, error: readErr } = await admin
        .from("yuan_payments")
        .select("id, slip_transferred_at")
        .eq("id", d.id)
        .maybeSingle<{ id: string; slip_transferred_at: string | null }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!before) return { ok: false, error: "not_found" };

      const { error: updErr } = await admin
        .from("yuan_payments")
        .update({ slip_transferred_at: next })
        .eq("id", d.id);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "yuan_payment.set_slip_transferred_at", "yuan_payment", d.id, {
        before: before.slip_transferred_at,
        after:  next,
      });

      revalidatePath("/admin/yuan-payments");
      return { ok: true, data: { id: d.id, slip_transferred_at: next } };
    },
  );
}
