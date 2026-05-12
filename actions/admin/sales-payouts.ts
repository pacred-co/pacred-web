"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const updateSchema = z.object({
  id:                z.string().uuid(),
  status:            z.enum(["pending","approved","paid","rejected"]),
  slip_url:          z.string().optional(),
  rejection_reason:  z.string().trim().max(1000).optional(),
});
export type AdminUpdateSalesPayoutInput = z.infer<typeof updateSchema>;

const STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจ", approved: "อนุมัติ", paid: "โอนแล้ว", rejected: "ปฏิเสธ",
};

/**
 * Manage a sales payout request:
 *  - approved: green-lit, slip not yet uploaded
 *  - paid:     slip uploaded + bank transfer done → flip linked
 *              sales_commissions to 'paid' atomically
 *  - rejected: reason given → release the commissions back to 'unpaid'
 */
export async function adminUpdateSalesPayout(input: AdminUpdateSalesPayoutInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["accounting","sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: payout } = await admin
      .from("sales_payouts")
      .select("id, team_leader_id, amount_total, status, team_leader:team_leaders!team_leader_id ( profile_id )")
      .eq("id", d.id)
      .maybeSingle();
    if (!payout) return { ok: false, error: "not_found" };

    type TL = { profile_id: string };
    type PayoutRow = {
      id: string; team_leader_id: string; amount_total: number; status: string;
      team_leader: TL | TL[] | null;
    };
    const p = payout as PayoutRow;
    const tl = Array.isArray(p.team_leader) ? p.team_leader[0] : p.team_leader;
    const leaderProfileId = tl?.profile_id;

    const update: Record<string, unknown> = {
      status:           d.status,
      admin_id:         adminId,
      rejection_reason: d.status === "rejected" ? (d.rejection_reason ?? null) : null,
    };
    if (d.slip_url != null) update.slip_url = d.slip_url || null;
    if (d.status === "approved") update.approved_at = new Date().toISOString();
    if (d.status === "paid")     update.paid_at     = new Date().toISOString();

    const { error } = await admin.from("sales_payouts").update(update).eq("id", p.id);
    if (error) return { ok: false, error: error.message };

    // Side effects on linked commissions
    if (d.status === "paid") {
      // Mark commissions as paid
      const nowIso = new Date().toISOString();
      await admin.from("sales_commissions")
        .update({ status: "paid", paid_at: nowIso })
        .eq("payout_id", p.id)
        .eq("status", "unpaid");
    } else if (d.status === "rejected") {
      // Release commissions back to unpaid
      await admin.from("sales_commissions")
        .update({ payout_id: null })
        .eq("payout_id", p.id);
    }

    await logAdminAction(adminId, "sales_payout.update", "sales_payout", p.id, {
      before: { status: p.status }, after: { status: d.status, rejection_reason: d.rejection_reason },
    });

    if (leaderProfileId) {
      void sendNotification(leaderProfileId, {
        category: "sales",
        severity: d.status === "paid" ? "success" : d.status === "rejected" ? "warning" : "info",
        title:    `คำขอเบิกค่าคอม — ${STATUS_LABEL[d.status]}`,
        body:     `ยอด ฿${Number(p.amount_total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}${d.rejection_reason ? `\nเหตุผล: ${d.rejection_reason}` : ""}`,
        link_href: `/sales/history`,
        reference_type: "sales_payout",
        reference_id:   p.id,
      });
    }

    revalidatePath("/admin/sales-payouts");
    return { ok: true };
  });
}
