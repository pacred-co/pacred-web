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

// ────────────────────────────────────────────────────────────
// T-P3: BULK approve pending deposits (cargo revenue path)
// ────────────────────────────────────────────────────────────
//
// Pacred staff approves customer deposit slips one-at-a-time today —
// real bottleneck during ad spikes (each approval = open detail, eyeball
// slip image, click button, repeat). Bulk approve cuts the per-row
// click cost from 4 → 1 for trusted-batch scenarios.
//
// Safety constraints:
// - Only approves rows that are CURRENTLY pending — silently skips
//   anything else (cancelled / completed / failed) so a stale checkbox
//   selection doesn't accidentally re-process
// - Only works on kind='deposit' — withdraws need refund flow, not
//   bulk approve. Other kinds are admin-internal.
// - Reuses adminUpdateWalletTransaction's logic per-row (loop inside
//   the action — keeps audit log granular, one log entry per id) so the
//   existing notification + revalidation chain fires unchanged.
//
// Returns counts so the UI can show "อนุมัติแล้ว 12 / ข้าม 3" toast.

const bulkApproveSchema = z.object({
  ids:  z.array(z.string().uuid()).min(1, "ต้องเลือกอย่างน้อย 1 รายการ").max(50, "เลือกได้สูงสุด 50 รายการต่อรอบ"),
  note: z.string().trim().max(500).optional(),
});
export type AdminBulkApproveDepositsInput = z.infer<typeof bulkApproveSchema>;

type BulkResult = { approved: number; skipped: number; errors: Array<{ id: string; reason: string }> };

export async function adminBulkApproveDeposits(
  input: AdminBulkApproveDepositsInput,
): Promise<AdminActionResult<BulkResult>> {
  const parsed = bulkApproveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { ids, note } = parsed.data;

  return withAdmin<BulkResult>(["accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Pull all selected rows in one query. Filter to pending deposits only —
    // anything else gets recorded as "skipped" without surfacing as error.
    const { data: rows, error: selErr } = await admin
      .from("wallet_transactions")
      .select("id, profile_id, kind, status, amount")
      .in("id", ids);
    if (selErr) return { ok: false, error: selErr.message };

    const result: BulkResult = { approved: 0, skipped: 0, errors: [] };
    type Row = { id: string; profile_id: string; kind: string; status: string; amount: number };

    for (const row of (rows ?? []) as Row[]) {
      if (row.kind !== "deposit") {
        result.skipped++;
        continue;
      }
      if (row.status !== "pending") {
        result.skipped++;
        continue;
      }

      const { error: updErr } = await admin
        .from("wallet_transactions")
        .update({
          status:          "completed",
          admin_id_update: adminId,
          ...(note ? { note } : {}),
        })
        .eq("id", row.id);

      if (updErr) {
        result.errors.push({ id: row.id, reason: updErr.message });
        continue;
      }

      result.approved++;

      // Per-row audit trail — keeps logs queryable by tx id later.
      await logAdminAction(adminId, "wallet_tx.bulk_approve", "wallet_transaction", row.id, {
        kind:   row.kind,
        amount: row.amount,
        before: { status: "pending" },
        after:  { status: "completed" },
      });

      // Notify customer (fire-and-forget — same template the per-row action uses).
      void sendNotification(row.profile_id, notify.walletTxStatusChanged({
        kind:   row.kind,
        status: "completed",
        amount: Number(row.amount),
        note:   note,
        txId:   row.id,
      }));
    }

    // Any selected ids that weren't in the SELECT result (deleted between
    // page render and submit) — surface as error so UI total = ids.length.
    const seenIds = new Set((rows ?? []).map((r) => r.id));
    for (const id of ids) {
      if (!seenIds.has(id)) {
        result.errors.push({ id, reason: "not_found" });
      }
    }

    revalidatePath("/admin/wallet");
    return { ok: true, data: result };
  });
}
