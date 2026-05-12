"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const STATUSES = ["pending","processing","completed","failed","refunded"] as const;

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

    // If a wallet-paid payment is refunded/failed, also cancel the wallet debit
    if ((d.status === "refunded" || d.status === "failed") && existing.paid_via_wallet) {
      await admin
        .from("wallet_transactions")
        .update({ status: "cancelled", admin_id_update: adminId })
        .eq("reference_type", "yuan_payment")
        .eq("reference_id", existing.id)
        .eq("status", "pending");
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
