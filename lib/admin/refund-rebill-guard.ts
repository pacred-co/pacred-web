/**
 * Refund/re-bill guard — the legacy `forwarder.php:1290` "ePayRe" check, ported.
 *
 * Legacy fires when a forwarder row is flipped to fStatus 5 (รอชำระเงิน) or 'c'
 * (credit): it refuses if a payment row already exists for that order —
 *   SELECT ID FROM tb_wallet_hs WHERE userID=… AND (typeNew='5' OR typeNew='6')
 *   AND refOrder='$ID'
 * `typenew ∈ {5,6}` = the pay-row kinds (see lib/forwarder/pending-slip.ts). So an
 * order that already carries a payment must NOT be demoted back into a
 * bill-collectible state (รอชำระเงิน / เครดิต) — that would let staff เรียกเก็บซ้ำ
 * (re-bill an already-paid import).
 *
 * Our columns are lowercase `typenew` / `reforder`; `reforder=fid` is row-unique
 * so the legacy userID scoping is redundant here.
 *
 * REFUSAL ONLY — this adds NO money mutation, changes no price/receipt/status
 * math; it just BLOCKS a flip-to-5/credit on a paid row. Fail-CLOSED: a failed
 * refund-check query refuses (does not proceed).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * @returns `{ ok: true }` when the row has NO payment record → safe to flip to
 * รอชำระเงิน(5)/เครดิต. `{ ok: false, error }` when a payment row exists (block
 * the re-bill) OR the check query failed (fail-closed).
 */
export async function assertNotRefunded(
  admin: SupabaseClient,
  fid: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("tb_wallet_hs")
    .select("id")
    .eq("reforder", String(fid))
    .in("typenew", ["5", "6"])
    .limit(1);
  if (error) {
    // Fail CLOSED — a money guard we can't complete must hold, not silently allow.
    console.error("[assertNotRefunded] failed — failing closed", {
      code: error.code, message: error.message, fid,
    });
    return { ok: false, error: `ตรวจสอบการชำระเงินไม่สำเร็จ: ${error.message}` };
  }
  if ((data?.length ?? 0) > 0) {
    return {
      ok: false,
      error:
        "รายการนี้มีบันทึกการชำระเงินแล้ว เปลี่ยนเป็นรอชำระเงิน/เครดิตไม่ได้ (กันเรียกเก็บซ้ำ)",
    };
  }
  return { ok: true };
}
