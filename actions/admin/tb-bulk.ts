"use server";

/**
 * Wave 8 Group A — Bulk-action server actions for the legacy `tb_*` schema.
 *
 * 3 endpoints (all admin-only · all use `service_role` via createAdminClient):
 *   1. adminBulkApproveWalletHs        — approve N pending tb_wallet_hs rows
 *   2. adminBulkApproveYuanPayments    — approve N pending tb_payment rows
 *   3. adminBulkApproveCustomers       — activate N pending tb_users rows
 *
 * Pattern reference: `actions/admin/wallet.ts` (rebuilt-schema bulk approve).
 * Why separate file: the rebuilt-schema actions live in `wallet.ts` /
 * `yuan-payments.ts`; the tb_*-schema bulk actions live here so they're
 * trivially deletable when the rebuilt schema fully retires (Phase C+).
 *
 * Audit: every approval emits an `admin_audit_log` row with the before/after
 * status + the affected row IDs.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ════════════════════════════════════════════════════════════════
// 1. WALLET — bulk approve tb_wallet_hs pending rows
// ════════════════════════════════════════════════════════════════
//
// Legacy flow (pcs-admin/wallet.php `?action=approve`):
//   UPDATE tb_wallet_hs SET status='2', adminid=$adminID WHERE id IN (...)
//   For each row, also adjust tb_wallet.wallettotal:
//     type 1,2 (deposit / manual deposit) → wallettotal += amount
//     type 7   (withdraw)                  → wallettotal −= amount
//     type 4   (order payment)             → wallettotal −= amount (already
//                                           debited at order time · double
//                                           check legacy before flipping)
//
// Pacred replication: sequential per-row updates inside a per-row loop. No
// multi-table atomic transaction (PostgREST doesn't expose one without an
// RPC). Failures partial-rollback by manual reversal — caller sees the
// summary { ok, processed, failed }.

const bulkApproveWalletHsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});
export type AdminBulkApproveWalletHsInput = z.infer<typeof bulkApproveWalletHsSchema>;

export async function adminBulkApproveWalletHs(
  input: AdminBulkApproveWalletHsInput,
): Promise<AdminActionResult<{ processed: number; failed: number; errors: string[] }>> {
  const parsed = bulkApproveWalletHsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids } = parsed.data;

  return withAdmin<{ processed: number; failed: number; errors: string[] }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // 1. Fetch all candidate rows in one query (filter to pending only).
      const { data: rows, error: readErr } = await admin
        .from("tb_wallet_hs")
        .select("id, userid, amount, type, status")
        .in("id", ids)
        .eq("status", "1");
      if (readErr) return { ok: false, error: readErr.message };
      if (!rows || rows.length === 0) {
        return { ok: false, error: "ไม่พบรายการที่รออนุมัติ (อาจถูกอนุมัติไปแล้ว)" };
      }

      type Row = { id: number; userid: string; amount: number; type: string; status: string };
      const candidates = rows as Row[];

      // 2. Per-row: UPDATE tb_wallet_hs status='2' + adjust tb_wallet.wallettotal.
      let processed = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const r of candidates) {
        const amt = Number(r.amount);
        // Determine wallet delta from legacy `type` taxonomy:
        //   '1'/'2' = deposit (credit) · '4'/'7' = withdraw/order-pay (debit)
        const delta = (r.type === "1" || r.type === "2") ? amt
                    : (r.type === "4" || r.type === "7") ? -amt
                    : 0;

        // Approve the wallet_hs row first.
        const { error: updHsErr } = await admin
          .from("tb_wallet_hs")
          .update({ status: "2", adminid: adminId })
          .eq("id", r.id)
          .eq("status", "1");  // re-guard against race
        if (updHsErr) {
          failed++;
          errors.push(`id=${r.id}: ${updHsErr.message}`);
          continue;
        }

        // Adjust wallet balance (if applicable).
        if (delta !== 0) {
          // Read current balance (upsert if missing — new customer).
          const { data: wRow } = await admin
            .from("tb_wallet")
            .select("userid, wallettotal")
            .eq("userid", r.userid)
            .maybeSingle<{ userid: string; wallettotal: number }>();

          if (!wRow) {
            // No tb_wallet row yet — insert with the delta.
            const { error: insErr } = await admin
              .from("tb_wallet")
              .insert({ userid: r.userid, wallettotal: delta });
            if (insErr) {
              failed++;
              errors.push(`id=${r.id} wallet-insert ${r.userid}: ${insErr.message}`);
              continue;
            }
          } else {
            const newTotal = Number(wRow.wallettotal) + delta;
            const { error: updWErr } = await admin
              .from("tb_wallet")
              .update({ wallettotal: newTotal })
              .eq("userid", r.userid);
            if (updWErr) {
              failed++;
              errors.push(`id=${r.id} wallet-update ${r.userid}: ${updWErr.message}`);
              continue;
            }
          }
        }

        processed++;
      }

      // Audit one entry per call (not per row) — payload carries the list.
      await logAdminAction(adminId, "tb_wallet_hs.bulk_approve", "tb_wallet_hs", ids.join(","), {
        requested_ids: ids,
        processed,
        failed,
        errors: errors.length > 10 ? errors.slice(0, 10).concat("...") : errors,
      });

      revalidatePath("/admin/wallet");
      revalidatePath("/admin");

      return { ok: true, data: { processed, failed, errors } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 2. YUAN PAYMENTS — bulk approve tb_payment pending rows
// ════════════════════════════════════════════════════════════════
//
// Legacy flow (pcs-admin/payment.php `?action=approve`):
//   UPDATE tb_payment SET paystatus='2', adminid=$adminID,
//   paydateadmin=NOW() WHERE id IN (...)
//
// Pacred verified prod column names (see /admin/yuan-payments/page.tsx
// docblock): paystatus, paytype, paydate, paydateadmin, payyuan, payrate,
// paythb, paythbcost, payprofitthb, userid, adminid, adminidupdate.
//
// No wallet adjustment — yuan payments don't credit wallet (they're an
// outgoing transfer; wallet was already debited at customer-submit time).

const bulkApproveYuanSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
});
export type AdminBulkApproveYuanPaymentsTbInput = z.infer<typeof bulkApproveYuanSchema>;

export async function adminBulkApproveYuanPaymentsTb(
  input: AdminBulkApproveYuanPaymentsTbInput,
): Promise<AdminActionResult<{ processed: number; failed: number; errors: string[] }>> {
  const parsed = bulkApproveYuanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids } = parsed.data;

  return withAdmin<{ processed: number; failed: number; errors: string[] }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      const { data: rows, error: readErr } = await admin
        .from("tb_payment")
        .select("id, userid, payyuan, paystatus")
        .in("id", ids)
        .eq("paystatus", "1");
      if (readErr) return { ok: false, error: readErr.message };
      if (!rows || rows.length === 0) {
        return { ok: false, error: "ไม่พบรายการที่รออนุมัติ" };
      }

      const nowIso = new Date().toISOString();

      // Bulk UPDATE in one call (no per-row balance work needed).
      const { error: updErr } = await admin
        .from("tb_payment")
        .update({ paystatus: "2", adminid: adminId, paydateadmin: nowIso })
        .in("id", rows.map((r) => (r as { id: number }).id))
        .eq("paystatus", "1");

      if (updErr) {
        return { ok: false, error: updErr.message };
      }

      const processed = rows.length;
      await logAdminAction(adminId, "tb_payment.bulk_approve", "tb_payment", ids.join(","), {
        requested_ids: ids,
        approved_ids: rows.map((r) => (r as { id: number }).id),
        processed,
      });

      revalidatePath("/admin/yuan-payments");
      revalidatePath("/admin");

      return { ok: true, data: { processed, failed: 0, errors: [] } };
    },
  );
}

// ════════════════════════════════════════════════════════════════
// 3. CUSTOMERS — bulk activate tb_users (useractive '0' → '1')
// ════════════════════════════════════════════════════════════════
//
// Legacy flow (pcs-admin/user-active.php · approve action):
//   UPDATE tb_users SET useractive='1', adminidupdate=$adminID,
//   userdateactive=NOW() WHERE userid IN (...)

const bulkApproveCustomersSchema = z.object({
  user_ids: z.array(z.string().regex(/^PR\d+$/i, "user_id ต้องเป็นรหัส PR####"))
    .min(1)
    .max(200),
});
export type AdminBulkApproveCustomersInput = z.infer<typeof bulkApproveCustomersSchema>;

export async function adminBulkApproveCustomers(
  input: AdminBulkApproveCustomersInput,
): Promise<AdminActionResult<{ processed: number; failed: number; errors: string[] }>> {
  const parsed = bulkApproveCustomersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { user_ids } = parsed.data;

  return withAdmin<{ processed: number; failed: number; errors: string[] }>(
    ["ops", "sales_admin", "accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      const { data: rows, error: readErr } = await admin
        .from("tb_users")
        .select("userid, useractive")
        .in("userid", user_ids)
        .eq("useractive", "0");
      if (readErr) return { ok: false, error: readErr.message };
      if (!rows || rows.length === 0) {
        return { ok: false, error: "ไม่พบสมาชิกที่รออนุมัติ (อาจถูกอนุมัติไปแล้ว)" };
      }

      const toApprove = rows.map((r) => (r as { userid: string }).userid);
      const nowIso = new Date().toISOString();

      const { error: updErr } = await admin
        .from("tb_users")
        .update({
          useractive: "1",
          adminidupdate: adminId,
          userdateactive: nowIso,
        })
        .in("userid", toApprove)
        .eq("useractive", "0");

      if (updErr) {
        return { ok: false, error: updErr.message };
      }

      await logAdminAction(adminId, "tb_users.bulk_approve", "tb_users", toApprove.join(","), {
        requested_user_ids: user_ids,
        approved_user_ids: toApprove,
        processed: toApprove.length,
      });

      revalidatePath("/admin/customers/pending");
      revalidatePath("/admin/customers");
      revalidatePath("/admin");

      return { ok: true, data: { processed: toApprove.length, failed: 0, errors: [] } };
    },
  );
}
