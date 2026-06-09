import { createAdminClient } from "@/lib/supabase/admin";
import {
  isShopOrderAutoExpireEligible,
  type ShopOrderExpireHeader,
} from "./auto-expire-eligibility";

export { isShopOrderAutoExpireEligible, type ShopOrderExpireHeader };

/**
 * Auto-expire an overdue ฝากสั่งซื้อ order on open — faithful port of legacy
 * `detail.php` L73-78 / `update.php` L72-78: a status-2 (รอชำระเงิน) order
 * whose `hDatePayment` deadline has already passed flips to hStatus 6 (ยกเลิก)
 * the moment an admin opens its detail / edit page.
 *
 * - No notify (legacy auto-cancel doesn't send anything).
 * - Idempotent + safe: the UPDATE is guarded `WHERE id=? AND hstatus='2'`, so
 *   it only flips while still '2' (no double-flip, no race with a concurrent
 *   re-quote). Recoverable — the /edit page lets staff re-quote a 6 back to 2.
 * - The Date.now()/new Date() calls live HERE (a plain lib fn), NOT in the
 *   page render, to avoid the `react-hooks/purity` lint (AGENTS.md learning).
 * - The pure eligibility check is `isShopOrderAutoExpireEligible` (unit-tested).
 *
 * Returns true if it flipped (the caller should then treat status as '6').
 */
export async function autoExpireOverdueShopOrder(
  header: ShopOrderExpireHeader,
): Promise<boolean> {
  if (!isShopOrderAutoExpireEligible(header)) return false;

  const admin = createAdminClient();
  const { error } = await admin
    .from("tb_header_order")
    .update({ hstatus: "6", hdateupdate: new Date().toISOString() })
    .eq("id", header.id)
    .eq("hstatus", "2"); // optimistic — only flip while still awaiting payment
  if (error) {
    console.error(`[autoExpireOverdueShopOrder] failed (non-fatal)`, {
      code: error.code, message: error.message, id: header.id,
    });
    return false;
  }
  return true;
}
