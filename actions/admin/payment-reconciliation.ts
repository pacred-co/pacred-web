"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";

/**
 * V-A3 (Phase 2) — slip ↔ order payment reconciliation.
 *
 * Companion to the existing /admin/accounting/reconcile page (forwarder
 * status auto-clear, ภูม Phase G) and migration 0043 (slip_transferred_at).
 * Surface lives at /admin/payment-reconciliation.
 *
 * Legacy reference:
 *   /Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/
 *     member/pcs-admin/forwarder.php:1431          (sets fCredit=1, fCreditDate)
 *     member/pcs-admin/forwarder-action.php:185-186 (fCreditError filter:
 *       "AND fCredit='1' AND fCreditDate<NOW()")
 *
 * In legacy PHP:
 *   - admin set fCredit=1 + fCreditDate when a customer was extended credit
 *   - customer's later slip upload was approved by hand
 *   - **nothing** linked the slip to the original forwarder — staff did
 *     this by reading the slip image + running MySQL UPDATEs
 *
 * Pacred Phase 2 reconciliation:
 *   1. listPendingReconciliations  — surface every completed deposit
 *      wallet_tx that's not yet been cross-linked to a forwarder,
 *      with suggested matches (same userid, amount within ±2 THB,
 *      forwarder still pending_payment)
 *   2. manualMatch                 — admin force-links a slip wallet_tx
 *      to a specific forwarder. Marks status='matched' on the tx,
 *      flips forwarder out of pending_payment, writes audit + notifies
 *   3. markUnmatched               — admin reviewed + confirms no
 *      matching credit order; routes to refund queue / write-off
 *
 * RBAC: super OR accounting (money-state mutations).
 */

// ────────────────────────────────────────────────────────────
// listPendingReconciliations — admin list
// ────────────────────────────────────────────────────────────
//
// Returns every completed deposit wallet_tx with null reconciliation_status,
// joined with the customer's still-pending forwarders. The UI uses this to
// suggest auto-matches (one tx ↔ one forwarder, amounts within tolerance)
// and to expose "no match" or "ambiguous" rows for manual handling.

const listSchema = z.object({
  days_back: z.number().int().min(1).max(365).optional(),
  limit:     z.number().int().min(1).max(500).optional(),
}).optional();

export type PendingReconciliationItem = {
  wallet_tx: {
    id:                  string;
    profile_id:          string;
    amount:              number;
    status:              string;
    created_at:          string;
    slip_transferred_at: string | null;
  };
  profile: {
    member_code: string | null;
    first_name:  string | null;
    last_name:   string | null;
  } | null;
  candidates: Array<{
    forwarder_id: string;
    f_no:         string;
    total_price:  number;
    status:       string;
    amount_diff:  number;          // tx.amount - forwarder.total_price (deposits store positive amount on credit kind)
    is_exact:     boolean;         // |diff| <= 2 THB → safe one-click
  }>;
};

const AMOUNT_TOLERANCE_THB = 2;

export async function listPendingReconciliations(
  input?: z.infer<typeof listSchema>,
): Promise<AdminActionResult<{ items: PendingReconciliationItem[]; total: number }>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const daysBack = parsed.data?.days_back ?? 90;
  const limit    = parsed.data?.limit     ?? 200;

  return withAdmin<{ items: PendingReconciliationItem[]; total: number }>(
    ["super", "accounting"],
    async () => {
      const admin = createAdminClient();
      const sinceIso = new Date(Date.now() - daysBack * 24 * 60 * 60_000).toISOString();

      // 1. Unreviewed completed deposit wallet_tx (window: N days).
      const { data: txsRaw, error: txErr } = await admin
        .from("wallet_transactions")
        .select(`
          id, profile_id, amount, status, created_at, slip_transferred_at,
          profile:profiles!profile_id ( member_code, first_name, last_name )
        `)
        .eq("kind",   "deposit")
        .eq("status", "completed")
        .is("reconciliation_status", null)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (txErr) return { ok: false, error: txErr.message };

      type RawTx = {
        id: string; profile_id: string; amount: number; status: string;
        created_at: string; slip_transferred_at: string | null;
        profile: PendingReconciliationItem["profile"] | PendingReconciliationItem["profile"][] | null;
      };
      const txs = (txsRaw ?? []) as RawTx[];
      if (txs.length === 0) return { ok: true, data: { items: [], total: 0 } };

      // 2. Pull pending_payment forwarders for every profile that has an
      //    unreviewed tx, in one go.
      const profileIds = Array.from(new Set(txs.map((t) => t.profile_id)));
      const { data: fwdsRaw, error: fwdErr } = await admin
        .from("forwarders")
        .select("id, f_no, profile_id, total_price, status, created_at")
        .in("profile_id", profileIds)
        .eq("status", "pending_payment")
        .order("created_at", { ascending: false });
      if (fwdErr) return { ok: false, error: fwdErr.message };

      type RawForwarder = {
        id: string; f_no: string; profile_id: string;
        total_price: number; status: string; created_at: string;
      };
      const fwds = (fwdsRaw ?? []) as RawForwarder[];

      // Group forwarders by profile_id for O(1) lookup
      const fwdByProfile = new Map<string, RawForwarder[]>();
      for (const f of fwds) {
        const list = fwdByProfile.get(f.profile_id) ?? [];
        list.push(f);
        fwdByProfile.set(f.profile_id, list);
      }

      // 3. Build items + candidates
      const items: PendingReconciliationItem[] = txs.map((t) => {
        const txAmount = Math.abs(Number(t.amount));   // deposits stored positive; abs for safety
        const profileFwds = fwdByProfile.get(t.profile_id) ?? [];
        const candidates = profileFwds.map((f) => {
          const diff = txAmount - Number(f.total_price);
          return {
            forwarder_id: f.id,
            f_no:         f.f_no,
            total_price:  Number(f.total_price),
            status:       f.status,
            amount_diff:  diff,
            is_exact:     Math.abs(diff) <= AMOUNT_TOLERANCE_THB,
          };
        });
        // Sort: exact match first, then closest diff
        candidates.sort((a, b) => {
          if (a.is_exact !== b.is_exact) return a.is_exact ? -1 : 1;
          return Math.abs(a.amount_diff) - Math.abs(b.amount_diff);
        });
        return {
          wallet_tx: {
            id:                  t.id,
            profile_id:          t.profile_id,
            amount:              Number(t.amount),
            status:              t.status,
            created_at:          t.created_at,
            slip_transferred_at: t.slip_transferred_at,
          },
          profile:    Array.isArray(t.profile) ? t.profile[0] ?? null : t.profile,
          candidates: candidates.slice(0, 5),     // top 5 to keep UI snappy
        };
      });

      return { ok: true, data: { items, total: items.length } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// manualMatch — admin force-matches a wallet_tx to a forwarder
// ────────────────────────────────────────────────────────────
//
// Stamps the tx as `reconciliation_status='manual_match'`, links
// `reconciled_forwarder_id`, flips the forwarder out of pending_payment
// (parallel to adminAutoClearForwarderPayment in reconciliation.ts but
// addressable from the slip side), writes audit + notifies customer.

const manualMatchSchema = z.object({
  wallet_tx_id:  z.string().uuid(),
  forwarder_id:  z.string().uuid(),
  reason:        z.string().trim().max(500).optional(),
});

export async function manualMatch(
  input: z.infer<typeof manualMatchSchema>,
): Promise<AdminActionResult<{ wallet_tx_id: string; f_no: string; amount_diff: number }>> {
  const parsed = manualMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  type Result = { wallet_tx_id: string; f_no: string; amount_diff: number };
  return withAdmin<Result>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load both sides in parallel
    const [{ data: tx, error: txErr }, { data: fwd, error: fwdErr }] = await Promise.all([
      admin
        .from("wallet_transactions")
        .select("id, profile_id, amount, status, kind, reconciliation_status, reconciled_forwarder_id")
        .eq("id", parsed.data.wallet_tx_id)
        .maybeSingle<{
          id: string; profile_id: string; amount: number; status: string;
          kind: string; reconciliation_status: string | null;
          reconciled_forwarder_id: string | null;
        }>(),
      admin
        .from("forwarders")
        .select("id, f_no, profile_id, status, total_price")
        .eq("id", parsed.data.forwarder_id)
        .maybeSingle<{
          id: string; f_no: string; profile_id: string;
          status: string; total_price: number;
        }>(),
    ]);
    if (txErr)  return { ok: false, error: txErr.message };
    if (fwdErr) return { ok: false, error: fwdErr.message };
    if (!tx)    return { ok: false, error: "wallet_tx_not_found" };
    if (!fwd)   return { ok: false, error: "forwarder_not_found" };

    // Sanity gates
    if (tx.kind !== "deposit") {
      return { ok: false, error: `wallet_tx kind=${tx.kind} ไม่ใช่ deposit — ไม่สามารถจับคู่ได้` };
    }
    if (tx.status !== "completed") {
      return { ok: false, error: `wallet_tx ยังไม่ completed (ปัจจุบัน: ${tx.status}) — อนุมัติก่อนจึงจะจับคู่ได้` };
    }
    if (tx.reconciliation_status) {
      return {
        ok:    false,
        error: `wallet_tx ถูกจับคู่ไปแล้ว (status=${tx.reconciliation_status}) — แตะ "เลิกจับคู่" ก่อนถ้าต้องการแก้`,
      };
    }
    if (tx.profile_id !== fwd.profile_id) {
      return {
        ok:    false,
        error: "wallet_tx + forwarder ไม่ใช่ของลูกค้ารายเดียวกัน — ห้ามจับคู่ข้ามคน",
      };
    }
    if (fwd.status === "cancelled") {
      return { ok: false, error: `forwarder ${fwd.f_no} ยกเลิกแล้ว — จับคู่ไม่ได้, ใช้ refund flow แทน` };
    }

    const txAmount = Math.abs(Number(tx.amount));
    const diff = txAmount - Number(fwd.total_price);

    // Stamp the wallet_tx as manual_match + cross-link
    const nowIso = new Date().toISOString();
    const { error: updTxErr } = await admin
      .from("wallet_transactions")
      .update({
        reconciliation_status:    "manual_match",
        reconciled_forwarder_id:  fwd.id,
        reconciled_at:            nowIso,
        reconciled_by:            adminId,
        reconciliation_note:      parsed.data.reason ?? null,
      })
      .eq("id", tx.id)
      .is("reconciliation_status", null);                      // race-safe
    if (updTxErr) return { ok: false, error: updTxErr.message };

    // Flip forwarder out of pending_payment if it's still there. Skip if
    // it already moved on — staff may have manually progressed it.
    let movedStatus: string | null = null;
    if (fwd.status === "pending_payment") {
      const { error: updFwdErr } = await admin
        .from("forwarders")
        .update({
          status:             "shipped_china",
          date_shipped_china: nowIso,
          admin_id_update:    adminId,
        })
        .eq("id", fwd.id)
        .eq("status", "pending_payment");                      // race-safe
      if (updFwdErr) return { ok: false, error: updFwdErr.message };
      movedStatus = "shipped_china";
    }

    await logAdminAction(adminId, "wallet_tx.manual_match", "wallet_transaction", tx.id, {
      f_no:                fwd.f_no,
      forwarder_id:        fwd.id,
      tx_amount:           txAmount,
      forwarder_total:     Number(fwd.total_price),
      amount_diff:         diff,
      forwarder_status_to: movedStatus,
      reason:              parsed.data.reason ?? null,
    });

    void sendNotification(fwd.profile_id, {
      category:       "forwarder",
      severity:       "success",
      title:          `ฝากนำเข้า ${fwd.f_no} จับคู่กับสลิปแล้ว`,
      body:           movedStatus === "shipped_china"
        ? `แอดมินจับคู่สลิปกับใบ ${fwd.f_no} เปลี่ยนสถานะเป็น "ออกจากจีน"`
        : `แอดมินจับคู่สลิปกับใบ ${fwd.f_no} แล้ว (สถานะปัจจุบันคงเดิม)`,
      link_href:      `/service-import/${fwd.f_no}`,
      reference_type: "forwarder",
      reference_id:   fwd.id,
    });

    revalidatePath("/admin/payment-reconciliation");
    revalidatePath("/admin/accounting/reconcile");
    revalidatePath(`/admin/forwarders/${fwd.f_no}`);
    revalidatePath("/admin/wallet");
    return { ok: true, data: { wallet_tx_id: tx.id, f_no: fwd.f_no, amount_diff: diff } };
  });
}

// ────────────────────────────────────────────────────────────
// markUnmatched — admin confirms no matching credit order
// ────────────────────────────────────────────────────────────
//
// Stamps tx as `reconciliation_status='unmatched'`. The slip wallet_tx
// keeps its balance (deposit already credited the customer) — admin's
// next move is usually a manual refund (existing /admin/refunds flow)
// or leaving the balance for future use. This action just records the
// decision so the queue stays clean.

const markUnmatchedSchema = z.object({
  wallet_tx_id: z.string().uuid(),
  reason:       z.string().trim().min(3, "ต้องระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(500),
});

export async function markUnmatched(
  input: z.infer<typeof markUnmatchedSchema>,
): Promise<AdminActionResult<{ wallet_tx_id: string }>> {
  const parsed = markUnmatchedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin<{ wallet_tx_id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: tx } = await admin
      .from("wallet_transactions")
      .select("id, profile_id, amount, kind, status, reconciliation_status")
      .eq("id", parsed.data.wallet_tx_id)
      .maybeSingle<{
        id: string; profile_id: string; amount: number;
        kind: string; status: string; reconciliation_status: string | null;
      }>();
    if (!tx) return { ok: false, error: "wallet_tx_not_found" };
    if (tx.reconciliation_status) {
      return {
        ok:    false,
        error: `wallet_tx ถูกตัดสินไปแล้ว (status=${tx.reconciliation_status})`,
      };
    }
    if (tx.kind !== "deposit") {
      return { ok: false, error: `wallet_tx kind=${tx.kind} ไม่ใช่ deposit` };
    }

    const { error: updErr } = await admin
      .from("wallet_transactions")
      .update({
        reconciliation_status: "unmatched",
        reconciliation_note:   parsed.data.reason,
        reconciled_at:         new Date().toISOString(),
        reconciled_by:         adminId,
      })
      .eq("id", tx.id)
      .is("reconciliation_status", null);                      // race-safe
    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "wallet_tx.mark_unmatched", "wallet_transaction", tx.id, {
      amount: Number(tx.amount),
      reason: parsed.data.reason,
    });

    revalidatePath("/admin/payment-reconciliation");
    revalidatePath("/admin/refunds");
    return { ok: true, data: { wallet_tx_id: tx.id } };
  });
}
