"use server";

// TOMBSTONE 2026-05-30: superseded by actions/admin/wallet-hs.ts per ADR-0018 D-3.
// All imports repointed; this file retires when no reader remains.
//
// Every export here writes to the REBUILT `wallet_transactions` table which is
// EMPTY on prod. Calling these is a "silent dead-write" (Master Gap Audit §5 #1)
// — UI shows green toast, zero real rows change. The canonical wallet ledger
// per ADR-0018 D-1 is `tb_wallet` + `tb_wallet_hs` (legacy schema, 104,591 rows).
//
// Faithful replacements (use these instead):
//   adminUpdateWalletTransaction     → adminApproveWalletDeposit /
//                                      adminRejectWalletDeposit  (wallet-hs.ts)
//   adminBulkApproveDeposits         → adminBulkApproveWalletDeposits (wallet-hs.ts)
//   adminGetWalletTxSlipSignedUrl    → resolveLegacyUrl(filename, 'slip')
//                                      (lib/storage/legacy-resolver.ts)
//   adminSetWalletTxSlipTransferredAt → adminUpdateWalletHsDateSlip
//                                       (actions/admin/wallet-trans.ts)
//   adminCreateManualWalletEntry     → adminCreateWalletHsManual (wallet-hs.ts)
//
// One-sprint retire window per ADR-0018 D-3 #2. Last grep-survey 2026-05-30
// shows no readers remain in app/, components/, actions/, lib/ except the
// 4 already-tombstoned orphan UI files (slip-review-modal · actions-cell ·
// bulk-approve-bar · components/admin/slip-transferred-at-cell) — those
// have been repointed to wallet-hs.ts tombstone shims.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

// Module-load warning — any import of this file logs a tombstone notice on
// server start (next dev/start). Helps surface forgotten readers in CI logs.
console.warn(
  "[actions/admin/wallet.ts] TOMBSTONED 2026-05-30 per ADR-0018 D-3 #2. " +
  "All exports here write to the empty rebuilt `wallet_transactions` table — " +
  "silent dead-writes. Migrate readers to `actions/admin/wallet-hs.ts` + " +
  "`actions/admin/wallet-trans.ts:adminUpdateWalletHsDateSlip` immediately.",
);

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
    const { data: existing, error: existingErr } = await admin
      .from("wallet_transactions")
      .select("id, profile_id, kind, amount, status")
      .eq("id", d.id)
      .maybeSingle<{ id: string; profile_id: string; kind: string; amount: number; status: string }>();
    if (existingErr) {
      console.error("[admin/wallet updateTx lookup] id=", d.id, { code: existingErr.code, message: existingErr.message });
      return { ok: false, error: `db_error:${existingErr.code}` };
    }
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
      const { data: row, error: rowErr } = await admin
        .from("wallet_transactions")
        .select("id, slip_url")
        .eq("id", parsed.data.id)
        .maybeSingle<{ id: string; slip_url: string | null }>();
      if (rowErr) {
        console.error("[admin/wallet getSlipUrl lookup] id=", parsed.data.id, { code: rowErr.code, message: rowErr.message });
        return { ok: false, error: `db_error:${rowErr.code}` };
      }
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

// ════════════════════════════════════════════════════════════
// Admin manual wallet entry — legacy /admin/wallet/add
// ════════════════════════════════════════════════════════════
// The legacy `pcs-admin/wallet.php` ($_GET['page']=='add' branch) lets
// an accounting admin record a wallet entry that the auto-verify flow
// couldn't post — typically a customer slip that didn't match any
// pending row, or a manual balance adjustment.
//
// Pacred mapping: insert a single `wallet_transactions` row with
// admin_id set + status='completed' (admin is the one verifying — no
// second-admin approval needed for the legacy parity). The balance
// trigger auto-recomputes `wallet.balance` for the affected bucket.
//
// Guard: accounting (or super) only. Amount sign is enforced (deposit
// positive · withdraw negative · adjustment either) on top of the
// `wallet_transactions` table CHECK constraint added by migration 0072.

const manualEntrySchema = z.object({
  profile_id:    z.string().uuid({ message: "เลือกสมาชิกก่อน" }),
  bucket:        z.enum(["main","cashback","credit"]).default("main"),
  kind:          z.enum(["deposit","withdraw","adjustment","refund"]),
  amount:        z.number().refine((n) => n !== 0, { message: "จำนวนต้องไม่เท่ากับ 0" }),
  bank_name:     z.string().trim().max(100).optional(),
  account_name:  z.string().trim().max(200).optional(),
  account_number: z.string().trim().max(50).optional(),
  slip_date:     z.string().optional(),    // YYYY-MM-DD or empty
  note:          z.string().trim().max(1000).optional(),
});

export type AdminCreateManualWalletEntryInput = z.infer<typeof manualEntrySchema>;

export async function adminCreateManualWalletEntry(
  input: AdminCreateManualWalletEntryInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = manualEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Sign-sanity (defence-in-depth alongside migration 0072 CHECK):
  // deposit must be positive, withdraw must be negative. adjustment +
  // refund accept either sign (refunds are typically positive but
  // admin reversals can be negative).
  if (d.kind === "deposit"  && !(d.amount > 0))
    return { ok: false, error: "deposit ต้องเป็นจำนวนบวก" };
  if (d.kind === "withdraw" && !(d.amount < 0))
    return { ok: false, error: "withdraw ต้องเป็นจำนวนลบ (เช่น -100.00)" };

  return withAdmin<{ id: string }>(
    ["accounting"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Verify the target customer exists.
      const { data: prof, error: profErr } = await admin
        .from("profiles")
        .select("id, member_code")
        .eq("id", d.profile_id)
        .maybeSingle<{ id: string; member_code: string | null }>();
      if (profErr) {
        console.error("[admin/wallet manual profile lookup] profileId=", d.profile_id, { code: profErr.code, message: profErr.message });
        return { ok: false, error: `db_error:${profErr.code}` };
      }
      if (!prof) return { ok: false, error: "ไม่พบสมาชิก" };

      let slipDateIso: string | null = null;
      if (d.slip_date && d.slip_date.trim()) {
        const dt = new Date(d.slip_date);
        if (Number.isNaN(dt.getTime())) {
          return { ok: false, error: "วันที่สลิปไม่ถูกต้อง" };
        }
        slipDateIso = dt.toISOString();
      }

      const { data: row, error } = await admin
        .from("wallet_transactions")
        .insert({
          profile_id:     d.profile_id,
          bucket:         d.bucket,
          amount:         d.amount,
          kind:           d.kind,
          status:         "completed",   // admin is the verifier
          bank_name:      d.bank_name ?? null,
          account_name:   d.account_name ?? null,
          account_number: d.account_number ?? null,
          slip_date:      slipDateIso,
          reference_type: "manual",
          note:           d.note ?? null,
          admin_id:       adminId,
        })
        .select("id")
        .single<{ id: string }>();

      if (error || !row) return { ok: false, error: error?.message ?? "insert failed" };

      await logAdminAction(adminId, "wallet_tx.manual_create", "wallet_tx", row.id, {
        member_code: prof.member_code,
        bucket: d.bucket,
        kind: d.kind,
        amount: d.amount,
        note: d.note,
      });

      revalidatePath("/admin/wallet");
      revalidatePath("/admin/wallet/history");
      return { ok: true, data: { id: row.id } };
    },
  );
}
