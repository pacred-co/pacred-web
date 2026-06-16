"use server";

/**
 * Admin actions for shop-wallet payouts — Sprint-3 P2.3.
 *
 * The customer-facing G7 path (Sprint-2 P1.2) inserts a pending
 * `tb_shop_transactions` row with `kind='withdraw'` + `status='pending'`
 * carrying bank details. These admin actions process those rows:
 *
 *   adminApproveShopPayout    — pending → approved (no balance move yet)
 *   adminMarkShopPayoutPaid   — approved/pending → completed (THIS is
 *                               what actually moves the balance via the
 *                               tb_wallet_shop_recompute trigger)
 *   adminRejectShopPayout     — pending/approved → cancelled, with
 *                               rejection reason stored in `note`
 *
 * Auth — requireAdmin(["accounting", "super", "ops"]) gates each call.
 * Writes go through the admin client; the `tb_shop_transactions`
 * admin-all RLS policy already allows admin updates.
 *
 * No money moves until 'completed' — the auto-recompute trigger from
 * migration 0104 sums COMPLETED rows only. So an approved (but
 * unpaid) row still locks the funds via the available-balance
 * pending-sum calc in getShopWalletSummary, but doesn't yet appear in
 * tb_wallet_shop.balance.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

type ShopPayoutStatus = "pending" | "completed" | "failed" | "cancelled";

export type AdminUpdateShopPayoutInput = {
  id:               string;
  status:           ShopPayoutStatus;
  /** Required when status='cancelled' — surfaces to the customer's
      audit + on the row's `note` column. */
  rejection_reason?: string;
  /** Required when status='completed' — the proof-of-transfer slip
      uploaded by admin. Currently a URL string; future enhancement is
      a full slip-upload flow into supabase storage. */
  slip_url?:         string;
};

export async function adminUpdateShopPayout(
  input: AdminUpdateShopPayoutInput,
): Promise<ActionResult> {
  // accounting handles money flows; super/ops can override per the
  // admin-all RLS policy from migration 0104.
  const guard = await requireAdmin(["accounting", "ops"]);
  const adminProfileId = guard.user.id;

  if (!input.id) return { ok: false, error: "id_required" };
  if (input.status === "cancelled" && !input.rejection_reason?.trim()) {
    return { ok: false, error: "rejection_reason_required" };
  }

  const admin = createAdminClient();

  // Read the current row to check the source state + the kind. We only
  // allow status transitions on `withdraw` (or `transfer_out`) rows —
  // letting admin retroactively complete an `earn` row would break the
  // ledger.
  type Row = {
    id:     string;
    status: ShopPayoutStatus;
    kind:   string;
  };
  const { data: current, error: readErr } = await admin
    .from("tb_shop_transactions")
    .select("id, status, kind")
    .eq("id", input.id)
    .maybeSingle<Row>();
  if (readErr)   return { ok: false, error: readErr.message };
  if (!current)  return { ok: false, error: "row_not_found" };

  if (!["withdraw", "transfer_out"].includes(current.kind)) {
    return { ok: false, error: "kind_not_admin_actionable" };
  }

  // Forbid no-op + illegal transitions: a paid/cancelled row is final.
  if (current.status === "completed" || current.status === "cancelled" || current.status === "failed") {
    return { ok: false, error: `already_${current.status}` };
  }

  const updatePatch: Record<string, unknown> = {
    status: input.status,
    reviewed_by_admin_id: adminProfileId,
    reviewed_at:          new Date().toISOString(),
  };

  if (input.status === "cancelled") {
    updatePatch.rejected_reason = (input.rejection_reason ?? "").trim();
  }
  if (input.status === "completed") {
    if (input.slip_url) updatePatch.slip_url = input.slip_url;
  }

  // TOCTOU guard: fold the read-state into the UPDATE so a concurrent
  // complete/cancel (both passing the L87 "already final" check) can't both
  // win — the 0-row claim means another transition got there first.
  const { data: flipped, error: updErr } = await admin
    .from("tb_shop_transactions")
    .update(updatePatch)
    .eq("id", input.id)
    .eq("status", current.status)
    .select("id")
    .maybeSingle();
  if (updErr) return { ok: false, error: updErr.message };
  if (!flipped) return { ok: false, error: "already_processed" };

  revalidatePath("/admin/shop-payouts");
  revalidatePath("/wallet-shop");
  return { ok: true };
}
