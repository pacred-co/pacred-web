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

    // C-1 defence-in-depth (audit-core-2026-05-18 §3): sign-sanity check
    // before any pending→completed flip. The 0072 migration adds an RLS
    // policy + table CHECK, but those only catch INSERTs — an admin
    // approving an already-existing row with a wrong-signed amount
    // would have slipped through pre-0072. This guard rejects flipping
    // a deposit-with-non-positive-amount or withdraw-with-non-negative-
    // amount to 'completed'. Defensive: should be unreachable after 0072.
    if (d.status === "completed") {
      const amt = Number(existing.amount);
      if (existing.kind === "deposit" && !(amt > 0)) {
        return { ok: false, error: `wallet_tx amount sign mismatch — deposit must be positive but is ${amt}. Reject + investigate.` };
      }
      if (existing.kind === "withdraw" && !(amt < 0)) {
        return { ok: false, error: `wallet_tx amount sign mismatch — withdraw must be negative but is ${amt}. Reject + investigate.` };
      }
    }

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
// Phase C QoL #3 — signed-URL helper for the deposit slip modal.
// ────────────────────────────────────────────────────────────
// The `slips` bucket is private + storage RLS lets only the owner read.
// Admins need a short-lived signed URL to preview the customer slip
// when verifying the deposit against the typed amount. This helper
// authenticates (super/accounting) + returns a 1h signed URL only;
// no mutation, no audit log (signed URLs leak nothing extra given the
// admin already has bypass access via the service role).
//
// Returns `null` instead of erroring on missing path so callers can
// render "no slip uploaded" gracefully.

const slipSignedUrlSchema = z.object({
  id: z.string().uuid(),
});

export async function adminGetWalletTxSlipSignedUrl(
  input: z.infer<typeof slipSignedUrlSchema>,
): Promise<AdminActionResult<{ url: string | null; mime: string | null }>> {
  const parsed = slipSignedUrlSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin<{ url: string | null; mime: string | null }>(
    ["super", "accounting"],
    async () => {
      const admin = createAdminClient();
      const { data: row } = await admin
        .from("wallet_transactions")
        .select("id, slip_url")
        .eq("id", parsed.data.id)
        .maybeSingle<{ id: string; slip_url: string | null }>();
      if (!row) return { ok: false, error: "not_found" };
      if (!row.slip_url) return { ok: true, data: { url: null, mime: null } };

      const { data: signed, error: sErr } = await admin.storage
        .from("slips")
        .createSignedUrl(row.slip_url, 60 * 60);
      if (sErr) return { ok: false, error: sErr.message };

      // Best-effort MIME inference from the path extension so the modal
      // knows whether to render <img> or <embed type="application/pdf">.
      const ext = (row.slip_url.split(".").pop() ?? "").toLowerCase();
      const mime = ext === "pdf" ? "application/pdf"
                 : ext === "png" ? "image/png"
                 : (ext === "jpg" || ext === "jpeg") ? "image/jpeg"
                 : null;

      return { ok: true, data: { url: signed?.signedUrl ?? null, mime } };
    },
  );
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

// ────────────────────────────────────────────────────────────
// V-A1: set wallet_transactions.slip_transferred_at (admin edit)
// ────────────────────────────────────────────────────────────
// Empty string clears. ISO datetime parsed; UI sends ISO from a
// datetime-local input via new Date().toISOString().

const setWalletTxSlipTransferredAtSchema = z.object({
  id:                  z.string().uuid(),
  slip_transferred_at: z.string().trim().max(40),    // "" → clear
});
export type SetWalletTxSlipTransferredAtInput = z.infer<typeof setWalletTxSlipTransferredAtSchema>;

export async function adminSetWalletTxSlipTransferredAt(
  input: SetWalletTxSlipTransferredAtInput,
): Promise<AdminActionResult<{ id: string; slip_transferred_at: string | null }>> {
  const parsed = setWalletTxSlipTransferredAtSchema.safeParse(input);
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
        .from("wallet_transactions")
        .select("id, slip_transferred_at")
        .eq("id", d.id)
        .maybeSingle<{ id: string; slip_transferred_at: string | null }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!before) return { ok: false, error: "not_found" };

      const { error: updErr } = await admin
        .from("wallet_transactions")
        .update({ slip_transferred_at: next })
        .eq("id", d.id);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(adminId, "wallet_tx.set_slip_transferred_at", "wallet_tx", d.id, {
        before: before.slip_transferred_at,
        after:  next,
      });

      revalidatePath("/admin/wallet");
      return { ok: true, data: { id: d.id, slip_transferred_at: next } };
    },
  );
}
