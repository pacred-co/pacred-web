import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Customer-flow clarity (gap-hunt 2026-06-29 P1) — "ส่งสลิปแล้ว · รอตรวจ".
 *
 * When a customer submits a forwarder/import payment (`submitForwarderPayment`,
 * actions/forwarder.ts) the handler INSERTs a pending `tb_wallet_hs` row but
 * deliberately keeps `tb_forwarder.fstatus='5'` ("รอชำระเงิน") — the legacy
 * waits for an admin to verify the slip before any status/money flip. With no
 * indicator the customer thinks the slip vanished and re-pays / asks "ส่งสลิป
 * ไปแล้วเงียบ". This helper resolves WHICH forwarder rows already have a
 * pending (not-yet-verified) slip so the customer surfaces can render a clear
 * "ส่งสลิปแล้ว · รอตรวจ" badge beside the plain "รอชำระเงิน" pill.
 *
 * The link (§0b verified against submitForwarderPayment L342-349 + L518-552):
 *   tb_wallet_hs.reforder = String(tb_forwarder.id)        ← the join key
 *   tb_wallet_hs.typeservice = '2'                          ← import service
 *   tb_wallet_hs.status      = '1'                          ← pending admin verify
 *   tb_wallet_hs.typenew     IN ('5','6')                   ← the pay row kinds
 * (status flips 1→2 on admin approve via adminApproveWalletHs /
 *  adminBulkApproveWalletHs — once approved it is NO LONGER "รอตรวจ".)
 *
 * READ-ONLY — this never mutates fstatus or any money. Additive signal only.
 */

const IMPORT_TYPESERVICE = "2";
const PENDING_STATUS = "1";
const PAY_TYPENEW = ["5", "6"] as const;

/**
 * Returns the SUBSET of `forwarderIds` that currently have a pending
 * (status='1') import payment slip in `tb_wallet_hs`, as a Set of numeric ids.
 *
 * `admin` must be a service-role client (tb_wallet_hs is RLS-locked). `userId`
 * is the customer's member_code (PR<n>) — the same `userid` the slip rows carry,
 * so a customer can never see another customer's pending state.
 *
 * On any query error this returns an EMPTY set (fail-soft): a missing badge is
 * strictly better than a thrown render on a supplementary signal (§0c — the
 * caller still logs the error).
 */
export async function resolvePendingSlipForwarderIds(
  admin: SupabaseClient,
  userId: string,
  forwarderIds: number[],
): Promise<Set<number>> {
  const ids = forwarderIds.filter((id) => Number.isFinite(id));
  if (!userId || ids.length === 0) return new Set();

  const { data, error } = await admin
    .from("tb_wallet_hs")
    .select("reforder")
    .eq("userid", userId)
    .eq("typeservice", IMPORT_TYPESERVICE)
    .eq("status", PENDING_STATUS)
    .in("typenew", [...PAY_TYPENEW])
    .in("reforder", ids.map(String));
  if (error) {
    console.error(`[tb_wallet_hs pending-slip] failed`, {
      code: error.code,
      message: error.message,
      userid: userId,
    });
    return new Set();
  }

  const out = new Set<number>();
  for (const r of (data ?? []) as { reforder: string | null }[]) {
    const n = Number(r.reforder);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}
