"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

const STATUSES = [
  "pending","awaiting_payment","ordered","awaiting_chn_dispatch","completed","cancelled",
] as const;

const updateSchema = z.object({
  h_no:    z.string(),
  status:  z.enum(STATUSES).optional(),
  note_admin: z.string().trim().max(2000).optional(),
});
export type AdminUpdateServiceOrderInput = z.infer<typeof updateSchema>;

const STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ", awaiting_payment: "รอชำระเงิน", ordered: "สั่งสินค้าแล้ว",
  awaiting_chn_dispatch: "รอจีนจัดส่ง", completed: "สำเร็จ", cancelled: "ยกเลิก",
};
const STATUS_DATE_COL: Record<string, string | null> = {
  awaiting_payment: "date_awaiting_payment",
  ordered:          "date_ordered",
  awaiting_chn_dispatch: "date_dispatched",
  completed:        "date_completed",
};

export async function adminUpdateServiceOrder(input: AdminUpdateServiceOrderInput): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("service_orders")
      .select("id, profile_id, status, total_thb")
      .eq("h_no", d.h_no)
      .maybeSingle<{ id: string; profile_id: string; status: string; total_thb: number }>();
    if (!existing) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = { admin_id_update: adminId };
    let statusChanged = false;
    if (d.status && d.status !== existing.status) {
      update.status = d.status;
      statusChanged = true;
      const dateCol = STATUS_DATE_COL[d.status];
      if (dateCol) update[dateCol] = new Date().toISOString();
    }
    if (d.note_admin != null) update.note_admin = d.note_admin || null;

    const { error } = await admin.from("service_orders").update(update).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "service_order.update", "service_order", existing.id, {
      h_no: d.h_no, before: { status: existing.status }, after: update,
    });

    if (statusChanged && d.status) {
      void sendNotification(existing.profile_id, {
        category: "order",
        severity: d.status === "cancelled" ? "warning" : "info",
        title:    `ฝากสั่ง ${d.h_no} อัพเดทแล้ว`,
        body:     `สถานะ: ${STATUS_LABEL[d.status] ?? d.status}`,
        link_href: `/service-order/${d.h_no}`,
        reference_type: "service_order",
        reference_id:   existing.id,
      });
    }

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${d.h_no}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// T-P1: MARK service-order PAID — debit wallet + flip status
// ────────────────────────────────────────────────────────────
//
// The plain `adminUpdateServiceOrder({ status: "ordered" })` flow flips
// status but doesn't move money in the wallet ledger.  Per Part T-P1,
// admin needs an explicit "ลูกค้าจ่ายเงินแล้ว" action that:
//
//   1. Validates the order is in awaiting_payment (or pending) state
//   2. Validates customer has enough wallet balance (main bucket)
//      — admin can override by passing allow_overdraw=true
//      (e.g. "received cash directly, will reconcile later")
//   3. Creates wallet_transactions row:
//        kind='order_payment', amount=-total_thb, status='completed',
//        reference_type='order_header', reference_id=h_no
//      The wallet_recompute_balance trigger debits the main bucket.
//   4. Flips order status awaiting_payment → ordered, stamps date_ordered
//   5. Logs audit + notifies customer
//
// Idempotency: if a wallet_transaction with the same (reference_type,
// reference_id, kind, status='completed') already exists, skip the
// double-debit and just ensure status is 'ordered'.

const markPaidSchema = z.object({
  h_no:           z.string(),
  allow_overdraw: z.boolean().optional(),
});
export type AdminMarkServiceOrderPaidInput = z.infer<typeof markPaidSchema>;

type MarkPaidData = { tx_id: string; already_paid: boolean };
export async function adminMarkServiceOrderPaid(
  input: AdminMarkServiceOrderPaidInput,
): Promise<AdminActionResult<MarkPaidData>> {
  const parsed = markPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // Accounting role gate per ADR-0005 K-7 — wallet movements are
  // accounting work, not ops.  Super gets it too (full powers).
  return withAdmin<MarkPaidData>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: order } = await admin
      .from("service_orders")
      .select("id, profile_id, h_no, status, total_thb")
      .eq("h_no", d.h_no)
      .maybeSingle<{ id: string; profile_id: string; h_no: string; status: string; total_thb: number }>();
    if (!order) return { ok: false, error: "not_found" };

    if (order.status === "cancelled") {
      return { ok: false, error: "ออเดอร์ยกเลิกแล้ว — ไม่สามารถบันทึกชำระได้" };
    }
    if (order.status === "completed") {
      return { ok: false, error: "ออเดอร์เสร็จสมบูรณ์แล้ว — ไม่ต้องบันทึกชำระซ้ำ" };
    }

    // Idempotency: did this order already have a completed payment tx?
    const { data: existingTx } = await admin
      .from("wallet_transactions")
      .select("id")
      .eq("reference_type", "order_header")
      .eq("reference_id", order.h_no)
      .eq("kind", "order_payment")
      .eq("status", "completed")
      .maybeSingle<{ id: string }>();
    if (existingTx) {
      // Already paid — just nudge status forward if it isn't already
      if (order.status === "awaiting_payment" || order.status === "pending") {
        await admin
          .from("service_orders")
          .update({
            status:       "ordered",
            date_ordered: new Date().toISOString(),
            admin_id_update: adminId,
          })
          .eq("id", order.id);
      }
      return { ok: true, data: { tx_id: existingTx.id, already_paid: true } };
    }

    const totalThb = Number(order.total_thb);
    if (!(totalThb > 0)) return { ok: false, error: "total_thb invalid — ไม่สามารถบันทึกชำระได้" };

    // Balance check (skip if admin overrides)
    if (!d.allow_overdraw) {
      const { data: wallet } = await admin
        .from("wallet")
        .select("balance")
        .eq("profile_id", order.profile_id)
        .maybeSingle<{ balance: number }>();
      const balance = Number(wallet?.balance ?? 0);
      if (balance < totalThb) {
        return {
          ok: false,
          error: `ยอด wallet ไม่พอ (มี ฿${balance.toLocaleString()} ต้อง ฿${totalThb.toLocaleString()}) — ถ้ารับเงินสด/โอนตรง กดยืนยันด้วย allow_overdraw`,
        };
      }
    }

    // Create the debit wallet_transaction
    const { data: tx, error: txErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id:     order.profile_id,
        bucket:         "main",
        amount:         -totalThb,             // debit
        kind:           "order_payment",
        status:         "completed",
        reference_type: "order_header",
        reference_id:   order.h_no,
        admin_id:       adminId,
        note:           `ชำระค่าฝากสั่ง ${order.h_no}${d.allow_overdraw ? " (admin override — รับเงินสด/โอนตรง)" : ""}`,
      })
      .select("id")
      .single<{ id: string }>();
    if (txErr) return { ok: false, error: `wallet insert: ${txErr.message}` };

    // Flip the order status forward
    const { error: ordErr } = await admin
      .from("service_orders")
      .update({
        status:           "ordered",
        date_ordered:     new Date().toISOString(),
        admin_id_update:  adminId,
      })
      .eq("id", order.id);
    if (ordErr) {
      // Don't roll back the wallet tx automatically — admin can decide
      // whether to cancel the tx or fix the order row. Surface the error.
      return { ok: false, error: `order update failed AFTER wallet debit (tx ${tx.id} stays): ${ordErr.message}` };
    }

    await logAdminAction(adminId, "service_order.mark_paid", "service_order", order.id, {
      h_no:           order.h_no,
      total_thb:      totalThb,
      tx_id:          tx.id,
      allow_overdraw: !!d.allow_overdraw,
      before:         { status: order.status },
      after:          { status: "ordered" },
    });

    void sendNotification(order.profile_id, {
      category: "order",
      severity: "success",
      title:    `ชำระเงินสำเร็จ — ${order.h_no}`,
      body:     `รับเงิน ฿${totalThb.toLocaleString()} แล้ว — ระบบจะสั่งสินค้าให้ต่อไป`,
      link_href: `/service-order/${order.h_no}`,
      reference_type: "service_order",
      reference_id:   order.id,
    });

    revalidatePath("/admin/service-orders");
    revalidatePath(`/admin/service-orders/${order.h_no}`);
    revalidatePath("/admin/wallet");
    return { ok: true, data: { tx_id: tx.id, already_paid: false } };
  });
}
