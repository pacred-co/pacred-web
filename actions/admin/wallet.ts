"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

const STATUSES = ["pending","completed","failed","cancelled"] as const;

const updateSchema = z.object({
  id:        z.string().uuid(),
  status:    z.enum(STATUSES),
  note:      z.string().trim().max(1000).optional(),
});
export type AdminUpdateWalletTxInput = z.infer<typeof updateSchema>;

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
    void sendNotification(existing.profile_id, notify.walletTxStatusChanged({
      kind:   existing.kind,
      status: d.status,
      amount: Number(existing.amount),
      note:   d.note,
      txId:   existing.id,
    }));

    revalidatePath("/admin/wallet");
    return { ok: true };
  });
}
