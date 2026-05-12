"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const STATUSES = ["pending","completed","failed","cancelled"] as const;

const updateSchema = z.object({
  id:        z.string().uuid(),
  status:    z.enum(STATUSES),
  note:      z.string().trim().max(1000).optional(),
});
export type AdminUpdateWalletTxInput = z.infer<typeof updateSchema>;

const STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ", completed: "สำเร็จ", failed: "ไม่สำเร็จ", cancelled: "ยกเลิก",
};

/**
 * Approve / reject / complete a wallet transaction.
 * - deposit: pending → completed → balance auto-recomputes via trigger
 * - withdraw: pending → completed (admin has already transferred)
 *           or pending → cancelled (refund request — debit cancelled,
 *           balance restored)
 */
export async function adminUpdateWalletTransaction(input: AdminUpdateWalletTxInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["accounting"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("wallet_transactions")
      .select("id, profile_id, kind, amount, status")
      .eq("id", d.id)
      .maybeSingle<{ id: string; profile_id: string; kind: string; amount: number; status: string }>();
    if (!existing) return { ok: false, error: "not_found" };
    if (existing.status === d.status) return { ok: true };  // no-op

    const update: Record<string, unknown> = {
      status: d.status,
      admin_id_update: adminId,
    };
    if (d.note != null) update.note = d.note;

    const { error } = await admin.from("wallet_transactions").update(update).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "wallet_tx.update", "wallet_transaction", existing.id, {
      kind: existing.kind, before: { status: existing.status }, after: { status: d.status },
    });

    // Notify customer
    const absAmount = Math.abs(Number(existing.amount));
    const kindLabel = existing.kind === "deposit" ? "เติมเงิน"
                    : existing.kind === "withdraw" ? "ถอนเงิน"
                    : existing.kind;
    void sendNotification(existing.profile_id, {
      category: "wallet",
      severity: d.status === "completed" ? "success" : d.status === "failed" || d.status === "cancelled" ? "warning" : "info",
      title:    `${kindLabel} — ${STATUS_LABEL[d.status] ?? d.status}`,
      body:     `จำนวน ฿${absAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}${d.note ? `\n${d.note}` : ""}`,
      link_href: `/wallet/history`,
      reference_type: "wallet_transaction",
      reference_id:   existing.id,
    });

    revalidatePath("/admin/wallet");
    return { ok: true };
  });
}
