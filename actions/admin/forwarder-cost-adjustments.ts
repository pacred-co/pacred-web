"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

/**
 * U2-4: Post-delivery cost adjustment workflow (chat W-4).
 *
 * Per chat AIR IMPORT: extra fees (D/O · gateway · weight rebill ·
 * customs extra) are discovered AFTER delivery and need a traceable
 * rebill flow rather than today's ad-hoc LINE chat → wallet adjustment.
 *
 * V1 actions:
 *   - adminAddForwarderCostAdjustment: create unpaid row + notify customer
 *   - adminMarkCostAdjustmentPaid: debit wallet (-amount) + flip status='paid'
 *   - adminCancelCostAdjustment: flip status='cancelled' + notify
 *
 * Gate: super OR accounting (money-moving). Ops can't add adjustments
 * because they bypass the wallet ledger gate per ADR-0005 K-7.
 */

const KINDS = ["do_fee", "gateway_fee", "weight_rebill", "customs_extra", "other"] as const;
const KIND_LABEL_TH: Record<typeof KINDS[number], string> = {
  do_fee:        "ค่า D/O",
  gateway_fee:   "ค่า gateway",
  weight_rebill: "ค่าน้ำหนักเพิ่ม",
  customs_extra: "ค่าศุลกากรเพิ่ม",
  other:         "อื่นๆ",
};

const addSchema = z.object({
  forwarder_id: z.string().uuid(),
  kind:         z.enum(KINDS),
  amount_thb:   z.number().positive("amount ต้องมากกว่า 0").max(10_000_000),
  note:         z.string().trim().max(2000).optional(),
  slip_url:     z.string().trim().max(500).optional(),
});
export type AddCostAdjustmentInput = z.infer<typeof addSchema>;

export async function adminAddForwarderCostAdjustment(
  input: AddCostAdjustmentInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Resolve forwarder + profile
    const { data: fwd } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id")
      .eq("id", d.forwarder_id)
      .maybeSingle<{ id: string; f_no: string; profile_id: string }>();
    if (!fwd) return { ok: false, error: "forwarder not_found" };

    const { data: created, error: insErr } = await admin
      .from("forwarder_cost_adjustments")
      .insert({
        forwarder_id:   fwd.id,
        profile_id:     fwd.profile_id,
        kind:           d.kind,
        amount_thb:     d.amount_thb,
        note:           d.note ?? null,
        slip_url:       d.slip_url ?? null,
        status:         "unpaid",
        added_by_admin: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr) return { ok: false, error: insErr.message };

    await logAdminAction(adminId, "fwd_cost_adj.create", "forwarder_cost_adjustment", created.id, {
      forwarder_f_no: fwd.f_no,
      kind:           d.kind,
      amount_thb:     d.amount_thb,
    });

    // Notify customer (use payment category for visibility in their feed)
    void sendNotification(fwd.profile_id, {
      category: "payment",
      severity: "warning",
      title:    `มีค่าใช้จ่ายเพิ่ม — ${fwd.f_no}`,
      body:     `${KIND_LABEL_TH[d.kind]} ฿${d.amount_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} — ติดต่อทีมงานเพื่อชำระ`,
      link_href: `/service-import/${fwd.f_no}/receipt`,
      reference_type: "forwarder",
      reference_id:   fwd.id,
    });

    revalidatePath(`/admin/forwarders/${fwd.f_no}`);
    revalidatePath(`/service-import/${fwd.f_no}/receipt`);
    revalidatePath(`/service-import/${fwd.f_no}`);

    return { ok: true, data: { id: created.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Mark paid — debit wallet + link wallet_tx for traceability
// ────────────────────────────────────────────────────────────
const markPaidSchema = z.object({
  id:             z.string().uuid(),
  allow_overdraw: z.boolean().optional(),
});
export type MarkCostAdjustmentPaidInput = z.infer<typeof markPaidSchema>;

export async function adminMarkCostAdjustmentPaid(
  input: MarkCostAdjustmentPaidInput,
): Promise<AdminActionResult<{ wallet_tx_id: string }>> {
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ wallet_tx_id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: adj } = await admin
      .from("forwarder_cost_adjustments")
      .select("id, forwarder_id, profile_id, kind, amount_thb, status, paid_via_wallet_tx_id")
      .eq("id", d.id)
      .maybeSingle<{
        id: string; forwarder_id: string; profile_id: string;
        kind: string; amount_thb: number; status: string;
        paid_via_wallet_tx_id: string | null;
      }>();
    if (!adj)                          return { ok: false, error: "not_found" };
    if (adj.status === "paid")         return { ok: false, error: "already_paid" };
    if (adj.status === "cancelled")    return { ok: false, error: "cancelled" };

    const total = Number(adj.amount_thb);
    if (!d.allow_overdraw) {
      const { data: wallet } = await admin
        .from("wallet")
        .select("balance")
        .eq("profile_id", adj.profile_id)
        .maybeSingle<{ balance: number }>();
      const balance = Number(wallet?.balance ?? 0);
      if (balance < total) {
        return {
          ok: false,
          error: `wallet ไม่พอ (มี ฿${balance.toLocaleString()} ต้อง ฿${total.toLocaleString()}) — ใช้ allow_overdraw ถ้ารับเงินสด`,
        };
      }
    }

    // Look up forwarder f_no for the wallet_tx note
    const { data: fwd } = await admin
      .from("forwarders")
      .select("f_no")
      .eq("id", adj.forwarder_id)
      .maybeSingle<{ f_no: string }>();
    const fNo = fwd?.f_no ?? "—";

    const { data: tx, error: txErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id:     adj.profile_id,
        bucket:         "main",
        amount:         -total,
        // P0-1: distinct kind so a cost-adjustment debit never collides
        // with the MAIN forwarder payment's idempotency tuple. The
        // payForwarderFromWallet / adminMarkForwarderPaid idempotency
        // SELECTs filter kind='import_payment' → they skip these rows.
        kind:           "cost_adjustment",
        status:         "completed",
        reference_type: "forwarder",
        reference_id:   fNo,
        admin_id:       adminId,
        note:           `ค่าใช้จ่ายเพิ่ม ${KIND_LABEL_TH[adj.kind as keyof typeof KIND_LABEL_TH] ?? adj.kind} — ${fNo}${d.allow_overdraw ? " (override)" : ""}`,
      })
      .select("id")
      .single<{ id: string }>();
    if (txErr) return { ok: false, error: `wallet insert: ${txErr.message}` };

    const nowIso = new Date().toISOString();
    const { error: updErr } = await admin
      .from("forwarder_cost_adjustments")
      .update({
        status:                "paid",
        paid_at:               nowIso,
        paid_via_wallet_tx_id: tx.id,
      })
      .eq("id", adj.id)
      .neq("status", "paid");
    if (updErr) {
      return {
        ok: false,
        error: `update failed AFTER wallet debit (tx ${tx.id} stays): ${updErr.message}`,
      };
    }

    await logAdminAction(adminId, "fwd_cost_adj.mark_paid", "forwarder_cost_adjustment", adj.id, {
      kind:           adj.kind,
      amount_thb:     total,
      tx_id:          tx.id,
      allow_overdraw: !!d.allow_overdraw,
    });

    void sendNotification(adj.profile_id, {
      category: "payment",
      severity: "success",
      title:    `ชำระค่าใช้จ่ายเพิ่ม — ${fNo}`,
      body:     `${KIND_LABEL_TH[adj.kind as keyof typeof KIND_LABEL_TH] ?? adj.kind} ฿${total.toLocaleString()} ชำระแล้ว`,
      link_href: `/service-import/${fNo}/receipt`,
      reference_type: "forwarder",
      reference_id:   adj.forwarder_id,
    });

    revalidatePath(`/admin/forwarders/${fNo}`);
    revalidatePath(`/service-import/${fNo}/receipt`);
    revalidatePath("/admin/wallet");

    return { ok: true, data: { wallet_tx_id: tx.id } };
  });
}

// ────────────────────────────────────────────────────────────
// Cancel adjustment (admin made an error, or fee waived)
// ────────────────────────────────────────────────────────────
const cancelSchema = z.object({
  id:     z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export async function adminCancelCostAdjustment(
  input: z.infer<typeof cancelSchema>,
): Promise<AdminActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: adj } = await admin
      .from("forwarder_cost_adjustments")
      .select("id, forwarder_id, profile_id, status")
      .eq("id", d.id)
      .maybeSingle<{ id: string; forwarder_id: string; profile_id: string; status: string }>();
    if (!adj)                       return { ok: false, error: "not_found" };
    if (adj.status === "cancelled") return { ok: false, error: "already_cancelled" };
    if (adj.status === "paid")      return { ok: false, error: "ชำระแล้ว — ยกเลิกไม่ได้ (ทำ refund แทน)" };

    const { error } = await admin
      .from("forwarder_cost_adjustments")
      .update({
        status:              "cancelled",
        cancelled_at:        new Date().toISOString(),
        cancelled_by_admin:  adminId,
        cancellation_reason: d.reason,
      })
      .eq("id", adj.id)
      .neq("status", "cancelled");
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "fwd_cost_adj.cancel", "forwarder_cost_adjustment", adj.id, {
      reason: d.reason,
    });

    // Look up f_no for revalidate
    const { data: fwd } = await admin
      .from("forwarders")
      .select("f_no")
      .eq("id", adj.forwarder_id)
      .maybeSingle<{ f_no: string }>();
    if (fwd) {
      revalidatePath(`/admin/forwarders/${fwd.f_no}`);
      revalidatePath(`/service-import/${fwd.f_no}/receipt`);
    }
    return { ok: true };
  });
}
