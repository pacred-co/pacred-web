"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

const STATUSES = [
  "pending_payment","shipped_china","in_transit","arrived_thailand",
  "out_for_delivery","delivered","cancelled",
] as const;

// V-A2: forward-direction lifecycle order. 'cancelled' is terminal-anywhere.
// Going from a higher-index status back to a lower-index = rollback → reason required.
const STATUS_ORDER: ReadonlyArray<string> = [
  "pending_payment","shipped_china","in_transit","arrived_thailand",
  "out_for_delivery","delivered",
];
function isStatusRollback(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === toStatus) return false;
  if (toStatus === "cancelled") return false;          // cancellation is its own path
  if (fromStatus === "cancelled") return false;        // un-cancel = forward repair, not rollback
  const fi = STATUS_ORDER.indexOf(fromStatus);
  const ti = STATUS_ORDER.indexOf(toStatus);
  return fi >= 0 && ti >= 0 && ti < fi;
}

const updateForwarderSchema = z.object({
  f_no:             z.string(),
  status:           z.enum(STATUSES).optional(),
  tracking_chn:     z.string().trim().max(255).optional(),
  tracking_th:      z.string().trim().max(255).optional(),
  cabinet_number:   z.string().trim().max(255).optional(),
  partner_warehouse: z.enum(["sang","ctt","mk","mx","jmf"]).optional(),
  note_admin:       z.string().trim().max(2000).optional(),
  // V-A2: required when status change is a rollback (going backward).
  // Optional otherwise; ignored unless a rollback transition is detected.
  rollback_reason:  z.string().trim().max(500).optional(),
});
export type UpdateForwarderInput = z.infer<typeof updateForwarderSchema>;

const STATUS_DATE_COL: Record<string, string | null> = {
  shipped_china:    "date_shipped_china",
  in_transit:       "date_in_transit",
  arrived_thailand: "date_arrived_thailand",
  out_for_delivery: "date_out_for_delivery",
  delivered:        "date_delivered",
};

export async function adminUpdateForwarder(input: UpdateForwarderInput): Promise<AdminActionResult> {
  const parsed = updateForwarderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Fetch existing for diff + customer notification + V-A2 rollback note merging
    const { data: existing } = await admin
      .from("forwarders")
      .select("id, profile_id, status, total_price, note_admin")
      .eq("f_no", d.f_no)
      .maybeSingle<{ id: string; profile_id: string; status: string; total_price: number; note_admin: string | null }>();
    if (!existing) return { ok: false, error: "not_found" };

    const update: Record<string, unknown> = { admin_id_update: adminId };
    let statusChanged = false;
    let isRollback    = false;

    if (d.status && d.status !== existing.status) {
      // V-A2: rollback path requires a reason
      isRollback = isStatusRollback(existing.status, d.status);
      if (isRollback) {
        const reason = (d.rollback_reason ?? "").trim();
        if (reason.length < 3) {
          return {
            ok: false,
            error: `rollback ${existing.status} → ${d.status} ต้องระบุเหตุผล (≥3 ตัว) — ใส่ใน rollback_reason`,
          };
        }
        // Stamp the reason into note_admin so it surfaces in admin UI thread.
        // Prepend (not replace) so prior notes survive.
        update.note_admin = `[ROLLBACK ${existing.status}→${d.status}] ${reason}`
          + (existing.note_admin && existing.note_admin !== d.note_admin
              ? `\n${existing.note_admin}` : (d.note_admin ? `\n${d.note_admin}` : ""));
      }

      update.status = d.status;
      statusChanged = true;
      const dateCol = STATUS_DATE_COL[d.status];
      if (dateCol) update[dateCol] = new Date().toISOString();
    }
    if (d.tracking_chn      != null) update.tracking_chn      = d.tracking_chn || null;
    if (d.tracking_th       != null) update.tracking_th       = d.tracking_th || null;
    if (d.cabinet_number    != null) update.cabinet_number    = d.cabinet_number || null;
    if (d.partner_warehouse != null) update.partner_warehouse = d.partner_warehouse;
    if (d.note_admin        != null && !isRollback) update.note_admin = d.note_admin || null;

    const { error } = await admin
      .from("forwarders")
      .update(update)
      .eq("id", existing.id);

    if (error) return { ok: false, error: error.message };

    // V-A2: audit log marks rollback distinctly from forward-update so reports
    // can flag rollback frequency per admin (governance signal).
    await logAdminAction(adminId, isRollback ? "forwarder.rollback" : "forwarder.update", "forwarder", existing.id, {
      f_no:      d.f_no,
      before:    { status: existing.status },
      after:     update,
      ...(isRollback && d.rollback_reason ? { rollback_reason: d.rollback_reason.trim() } : {}),
    });

    // Notify customer when status changes. V-A2: rollback gets a distinct
    // payload so the customer sees the reason + warning severity, not just
    // a plain "status changed" line.
    if (statusChanged && d.status) {
      if (isRollback && d.rollback_reason) {
        void sendNotification(existing.profile_id, {
          category: "forwarder",
          severity: "warning",
          title:    `ฝากนำเข้า ${d.f_no} ถูกย้อนสถานะ`,
          body:     `กลับเป็น ${d.status} · เหตุผล: ${d.rollback_reason.trim()}`,
          link_href: `/service-import/${d.f_no}`,
          reference_type: "forwarder",
          reference_id:   existing.id,
        });
      } else {
        void sendNotification(existing.profile_id, notify.forwarderStatusChanged({
          fNo:         d.f_no,
          status:      d.status,
          forwarderId: existing.id,
        }));
      }
    }

    revalidatePath("/admin/forwarders");
    revalidatePath(`/admin/forwarders/${d.f_no}`);
    return { ok: true };
  });
}

// ── Bulk status update ────────────────────────────────────────────────────────

const bulkSchema = z.object({
  f_nos:  z.array(z.string()).min(1).max(100),
  status: z.enum(STATUSES),
});

export async function adminBulkUpdateForwarderStatus(
  input: z.infer<typeof bulkSchema>,
): Promise<AdminActionResult & { updated?: number }> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { f_nos, status } = parsed.data;

  return withAdmin(["ops"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("forwarders")
      .select("id, f_no, profile_id, status")
      .in("f_no", f_nos);

    if (!existing || existing.length === 0) return { ok: false, error: "not_found" };

    const dateCol = STATUS_DATE_COL[status];
    const update: Record<string, unknown> = {
      status,
      admin_id_update: adminId,
      ...(dateCol ? { [dateCol]: new Date().toISOString() } : {}),
    };

    const { error } = await admin
      .from("forwarders")
      .update(update)
      .in("f_no", f_nos);

    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "forwarder.bulk_update", "forwarder", "bulk", {
      f_nos, before_statuses: existing.map((r) => ({ f_no: r.f_no, status: r.status })), after: { status },
    });

    // Notify each customer
    for (const row of existing) {
      if (row.status === status) continue;
      void sendNotification(row.profile_id, notify.forwarderStatusChanged({
        fNo:         row.f_no,
        status,
        forwarderId: row.id,
      }));
    }

    revalidatePath("/admin/forwarders");
    return { ok: true, updated: existing.length };
  });
}

// ────────────────────────────────────────────────────────────
// adminMarkForwarderPaid — admin override mirror of
// `payForwarderFromWallet` (customer self-service, dave commit `2be9eb5`)
// ────────────────────────────────────────────────────────────
//
// Why this exists:
//   The customer-side `payForwarderFromWallet` closed the import loop for
//   self-pay-from-wallet, but admin still needs an override path for:
//     - Customer paid via bank transfer / cash / OOB → admin records it
//     - Customer can't self-pay (slow internet, technical issue, account
//       has zero balance + admin agreed to receive cash)
//
// Pattern is the EXACT mirror of `adminMarkServiceOrderPaid` (T-P1) with
// forwarder column names:
//   - kind = 'import_payment' (vs 'order_payment')
//   - reference_type = 'forwarder' (vs 'order_header')
//   - reference_id = f_no
//   - status flip: pending_payment → shipped_china (matches customer flow)
//
// Idempotency: existing completed (kind='import_payment', ref to f_no)
// → return { already_paid: true } without double-debit.
//
// Per ADR-0005 K-7: wallet movements gated by accounting role (super
// inherits all). Audit log captures override flag for compliance.

const markForwarderPaidSchema = z.object({
  f_no:           z.string(),
  allow_overdraw: z.boolean().optional(),
});
export type AdminMarkForwarderPaidInput = z.infer<typeof markForwarderPaidSchema>;

type MarkForwarderPaidData = { tx_id: string; already_paid: boolean };

export async function adminMarkForwarderPaid(
  input: AdminMarkForwarderPaidInput,
): Promise<AdminActionResult<MarkForwarderPaidData>> {
  const parsed = markForwarderPaidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<MarkForwarderPaidData>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: forwarder } = await admin
      .from("forwarders")
      .select("id, profile_id, f_no, status, total_price")
      .eq("f_no", d.f_no)
      .maybeSingle<{ id: string; profile_id: string; f_no: string; status: string; total_price: number }>();
    if (!forwarder) return { ok: false, error: "not_found" };

    if (forwarder.status === "cancelled") {
      return { ok: false, error: "ฝากนำเข้าถูกยกเลิกแล้ว — บันทึกชำระไม่ได้" };
    }
    if (forwarder.status === "delivered") {
      return { ok: false, error: "ฝากนำเข้าส่งสำเร็จแล้ว — ไม่ต้องบันทึกชำระซ้ำ" };
    }
    // pending_payment is the canonical pre-payment state. We allow other
    // pre-delivered statuses too in case the row was status-flipped without
    // payment recorded (legacy/recovery path).

    // Idempotency check
    const { data: existingTx } = await admin
      .from("wallet_transactions")
      .select("id")
      .eq("reference_type", "forwarder")
      .eq("reference_id",   forwarder.f_no)
      .eq("kind",           "import_payment")
      .eq("status",         "completed")
      .maybeSingle<{ id: string }>();
    if (existingTx) {
      // Already paid — nudge status forward if still pending_payment
      if (forwarder.status === "pending_payment") {
        await admin
          .from("forwarders")
          .update({ status: "shipped_china", admin_id_update: adminId })
          .eq("id", forwarder.id);
      }
      return { ok: true, data: { tx_id: existingTx.id, already_paid: true } };
    }

    const totalThb = Number(forwarder.total_price);
    if (!(totalThb > 0)) return { ok: false, error: "total_price ไม่ถูกต้อง — บันทึกชำระไม่ได้" };

    // Balance check (skip if admin overrides via cash/bank-direct path)
    if (!d.allow_overdraw) {
      const { data: wallet } = await admin
        .from("wallet")
        .select("balance")
        .eq("profile_id", forwarder.profile_id)
        .maybeSingle<{ balance: number }>();
      const balance = Number(wallet?.balance ?? 0);
      if (balance < totalThb) {
        return {
          ok: false,
          error: `ยอด wallet ไม่พอ (มี ฿${balance.toLocaleString()} ต้อง ฿${totalThb.toLocaleString()}) — ถ้ารับเงินสด/โอนตรง กดยืนยันด้วย allow_overdraw`,
        };
      }
    }

    // Insert debit wallet_tx (admin_id stamped — distinguishes from
    // customer self-pay which uses null)
    const { data: tx, error: txErr } = await admin
      .from("wallet_transactions")
      .insert({
        profile_id:     forwarder.profile_id,
        bucket:         "main",
        amount:         -totalThb,
        kind:           "import_payment",
        status:         "completed",
        reference_type: "forwarder",
        reference_id:   forwarder.f_no,
        admin_id:       adminId,
        note:           `ชำระค่าฝากนำเข้า ${forwarder.f_no}${d.allow_overdraw ? " (admin override — รับเงินสด/โอนตรง)" : ""}`,
      })
      .select("id")
      .single<{ id: string }>();
    if (txErr) return { ok: false, error: `wallet insert: ${txErr.message}` };

    // Status flip pending_payment → shipped_china (matches customer flow)
    const { error: fwdErr } = await admin
      .from("forwarders")
      .update({
        status:           "shipped_china",
        admin_id_update:  adminId,
        date_shipped_china: new Date().toISOString(),
      })
      .eq("id", forwarder.id);
    if (fwdErr) {
      // Don't auto-rollback the wallet tx — admin can resolve manually +
      // we surface the error so the audit trail is complete.
      return {
        ok: false,
        error: `forwarder update failed AFTER wallet debit (tx ${tx.id} stays): ${fwdErr.message}`,
      };
    }

    await logAdminAction(adminId, "forwarder.mark_paid", "forwarder", forwarder.id, {
      f_no:           forwarder.f_no,
      total_thb:      totalThb,
      tx_id:          tx.id,
      allow_overdraw: !!d.allow_overdraw,
      before:         { status: forwarder.status },
      after:          { status: "shipped_china" },
    });

    void sendNotification(forwarder.profile_id, {
      category: "forwarder",
      severity: "success",
      title:    `ชำระเงินสำเร็จ — ${forwarder.f_no}`,
      body:     `รับเงิน ฿${totalThb.toLocaleString()} แล้ว — ระบบเริ่มดำเนินการสั่งสินค้า`,
      link_href: `/service-import/${forwarder.f_no}`,
      reference_type: "forwarder",
      reference_id:   forwarder.id,
    });

    revalidatePath("/admin/forwarders");
    revalidatePath(`/admin/forwarders/${forwarder.f_no}`);
    revalidatePath("/admin/wallet");
    return { ok: true, data: { tx_id: tx.id, already_paid: false } };
  });
}
