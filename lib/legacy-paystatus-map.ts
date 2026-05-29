/**
 * Tier A5 (2026-05-29) — legacy `tb_payment.paystatus` ↔ Pacred 5-state map.
 *
 * `actions/admin/yuan-payments.ts` is `"use server"` and per
 * `docs/learnings/nextjs-16-quirks.md` cannot export non-async-function
 * value exports. The status-mapping helpers + transition allow-list live
 * here so they can be unit-tested + reused (e.g. by a future detail-page
 * approve/reject UI that needs to display the Pacred-mapped status).
 *
 * Legacy `paystatus` is a varchar(1):
 *   '1' = รอตรวจสอบ  (pending)
 *   '2' = สำเร็จ      (approved / completed)
 *   '3' = ไม่สำเร็จ   (rejected — may or may not be a wallet refund)
 *
 * Pacred enum is 5-state (rebuilt-schema-era taxonomy that the UI still
 * uses): pending / processing / completed / failed / refunded.
 *
 * The two enums don't bijection — `processing` has no DB representation
 * (legacy admins simply approved 1→2 or rejected 1→3); `failed` and
 * `refunded` both collapse to '3' but differ on whether a tb_wallet_hs
 * type='5' refund row was written. We treat that refund row as the tie-
 * breaker: a '3' row WITH a matching refund → `refunded`; without → `failed`.
 */

export const YUAN_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
] as const;

export type YuanStatus = (typeof YUAN_STATUSES)[number];

// ── Transition allow-list (W-3 / revenue-flow H-1) ───────────────────
// Rules (legacy-faithful + Pacred superset):
//   pending    → processing | completed | failed | refunded
//   processing → completed  | failed    | refunded
//   completed  → refunded   (a settled payment may be refunded — the
//                            wallet credit-back is handled by the action)
//   failed     → pending    (retry only — no money moved on a failed
//                            payment, so re-opening is safe)
//   refunded   → (terminal — money already returned)
//
// Explicitly FORBIDDEN — any transition that would require re-taking
// money the code does not re-debit: refunded→completed, refunded→*,
// failed→completed, failed→processing, completed→processing/pending/failed.
const YUAN_STATUS_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  pending:    ["processing", "completed", "failed", "refunded"],
  processing: ["completed", "failed", "refunded"],
  completed:  ["refunded"],
  failed:     ["pending"],
  refunded:   [],
};

/** True when `from → to` is a permitted yuan-payment status transition. */
export function isYuanTransitionAllowed(from: string, to: string): boolean {
  if (from === to) return true; // a no-op re-save of the same status is fine
  return (YUAN_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Map a legacy `tb_payment.paystatus` code to the Pacred 5-state enum.
 *
 * `paystatus='3'` is ambiguous: it covers both "rejected without wallet
 * refund" (legacy admins flipped 1→3 on a cash payment they decided not
 * to honor) AND "rejected WITH wallet refund" (legacy admins flipped
 * 1→3 on a wallet-paid payment, which INSERTed a tb_wallet_hs type='5'
 * refund row + UPDATEd tb_wallet.wallettotal). The caller must look up
 * the refund row first and pass `wasWalletRefunded` accordingly.
 */
export function paystatusToPacred(
  paystatus: string,
  wasWalletRefunded: boolean,
): YuanStatus {
  switch (paystatus) {
    case "1": return "pending";
    case "2": return "completed";
    case "3": return wasWalletRefunded ? "refunded" : "failed";
    default:  return "pending";
  }
}

/**
 * Map a Pacred 5-state status to the legacy `tb_payment.paystatus` code.
 *
 * Returns `null` for `processing` because legacy has no "in-flight" state
 * — the action treats `processing` as a UI-only transition that fires a
 * notification but does NOT update the DB paystatus column.
 */
export function pacredToPaystatus(s: YuanStatus): string | null {
  switch (s) {
    case "pending":    return "1";
    case "processing": return null;
    case "completed":  return "2";
    case "failed":     return "3";
    case "refunded":   return "3";
    default:           return null;
  }
}

/** Human-readable labels (Thai) — used in error messages + notifications. */
export const YUAN_STATUS_LABEL: Record<YuanStatus, string> = {
  pending:    "รอตรวจสอบ",
  processing: "กำลังโอน",
  completed:  "สำเร็จ",
  failed:     "ไม่สำเร็จ",
  refunded:   "คืนเงินแล้ว",
};
