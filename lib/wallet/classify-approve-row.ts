/**
 * classify-approve-row — decide whether approving a `tb_wallet_hs` row should
 * move the customer wallet balance, and by how much.
 *
 * WHY THIS EXISTS (money-critical · 2026-07-02)
 * ────────────────────────────────────────────
 * The ฝากนำเข้า pay flow is DIRECT-CUT: `submitForwarderPayment`
 * (actions/forwarder.ts) inserts a `type='4'` slip-backed row and NEVER credits
 * the wallet — the customer transfers straight to the bank and the slip proves
 * it. But the three approve paths still DEBITED the wallet on approve, so the
 * negative-wallet guard correctly refused to drive a ฿0 wallet negative
 * ("ยอดกระเป๋าลูกค้าไม่พอ") → admins could not settle legitimately-paid slips.
 *
 * The create side and the approve side disagreed about whether the wallet is
 * involved. This classifier is the single source of truth for that decision.
 *
 * THE DISTINGUISHING SHAPE
 * ────────────────────────
 *  • direct-slip   — a slip-backed DIRECT pay: money settled from the bank, the
 *                    wallet is NOT involved. Shape: type='4' typeservice='2'
 *                    reforder set (the tb_forwarder id) AND reforder2 empty AND
 *                    NO tb_wallet_paydeposit link. walletDelta = 0.
 *  • topup-cascade — part of a legacy "เติม-แล้วจ่าย" cascade (reforder2 set OR a
 *                    paydeposit link exists). The cascade path settles this
 *                    net-zero via its own branch (4b), so this classifier keeps
 *                    walletDelta = 0 and returns the shape only — it does NOT
 *                    change the cascade math.
 *  • wallet-funded — a genuine wallet spend/credit that MUST move the balance.
 *                    Debits (type '4' or '7') → −amount; credits (type '1' or
 *                    '2') → +amount. The negative-wallet guard stays armed for
 *                    this shape.
 *
 * Pure — no I/O. `hasPaydepositLink` is resolved by the caller (a defensive
 * tb_wallet_paydeposit lookup); it is empty for genuine direct slips.
 */

export type WalletApproveShape = "direct-slip" | "topup-cascade" | "wallet-funded";

export interface ClassifyWalletHsRowInput {
  type: string | null;
  typeservice: string | null;
  reforder: string | null;
  reforder2: string | null;
  amount: number | string | null;
}

export interface ClassifyWalletHsRowOptions {
  hasPaydepositLink: boolean;
}

export interface ClassifyWalletHsRowResult {
  shape: WalletApproveShape;
  /** Signed amount to apply to `tb_wallet.wallettotal` on approve. */
  walletDelta: number;
}

function isNonEmpty(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim() !== "";
}

export function classifyWalletHsRow(
  row: ClassifyWalletHsRowInput,
  opts: ClassifyWalletHsRowOptions,
): ClassifyWalletHsRowResult {
  const type = (row.type ?? "").trim();
  const typeservice = (row.typeservice ?? "").trim();
  const hasReforder = isNonEmpty(row.reforder);
  const hasReforder2 = isNonEmpty(row.reforder2);
  const amount = Number(row.amount ?? 0);

  // direct-slip — the ฝากนำเข้า DIRECT-CUT shape. Money is in the bank; the
  // wallet is untouched. Distinguishing shape (cite forwarder.ts:509-561):
  // type='4' typeservice='2' reforder set AND reforder2 empty AND no paydeposit
  // link (i.e. NOT part of a topup cascade).
  if (
    type === "4" &&
    typeservice === "2" &&
    hasReforder &&
    !hasReforder2 &&
    !opts.hasPaydepositLink
  ) {
    return { shape: "direct-slip", walletDelta: 0 };
  }

  // topup-cascade — the legacy "เติม-แล้วจ่าย" cascade. Recognised by a set
  // reforder2 OR a paydeposit link. Settled net-zero by the cascade branch (4b);
  // return the shape only, delta 0 (do NOT change the cascade math here).
  if (hasReforder2 || opts.hasPaydepositLink) {
    return { shape: "topup-cascade", walletDelta: 0 };
  }

  // wallet-funded — a genuine wallet-funded spend/credit that MUST move the
  // balance. Debits (type '4' spend · '7' withdraw/spend) → −amount; credits
  // (type '1' topup · '2' wallet-pay ledger) → +amount; else 0.
  const walletDelta =
    type === "4" || type === "7"
      ? -amount
      : type === "1" || type === "2"
        ? amount
        : 0;

  return { shape: "wallet-funded", walletDelta };
}
