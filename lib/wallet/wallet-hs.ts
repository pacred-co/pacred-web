/**
 * Canonical SOT for `tb_wallet_hs` row DIRECTION + the pending-queue filters.
 *
 * ⚠️ ROOT FACT (the bug this module exists to prevent):
 *   `tb_wallet_hs.amount` is stored POSITIVE **always**. The money DIRECTION
 *   (in / out) comes from the row's `type`, NEVER from the amount sign.
 *   A withdrawal/debit is stored with a positive amount + a debit `type`, so any
 *   surface that partitions in/out (or topup-vs-withdraw) by `amount < 0` /
 *   `amount > 0` is WRONG — an `amount < 0` filter matches ZERO rows and a debit
 *   renders as if it were incoming money.
 *
 * Every wallet surface — customer history, admin transactions view, the /admin
 * dashboard queue tabs, and the sidebar badge counts — MUST route direction +
 * pending-queue decisions through THIS module so the type-vs-sign truth lives in
 * exactly one place and can never drift per-page again.
 */

/** Legacy withdraw type (ถอนเงิน · withdrawUser.php). */
export const WALLET_WITHDRAW_TYPE = "3";

/**
 * type → { kind, credit }. `credit: true` = money IN, `false` = money OUT.
 * (Moved here from actions/wallet.ts so it is the single shared source.)
 */
export const WALLET_HS_TYPE_KIND: Record<string, { kind: string; credit: boolean }> = {
  "1": { kind: "deposit", credit: true },
  "2": { kind: "order_payment", credit: false },
  "3": { kind: "withdraw", credit: false },
  "4": { kind: "import_payment", credit: false },
  "5": { kind: "refund", credit: true },
  "6": { kind: "yuan_payment", credit: false },
  "7": { kind: "order_top_up", credit: false },
};

/**
 * true = the row is money IN (credit / incoming). false = money OUT (debit).
 * Unknown/blank type → credit (the legacy default; keeps historical rows non-red).
 * This is the ONLY correct way to decide a wallet_hs row's direction — never the
 * amount sign.
 */
export function isWalletCredit(type: string | null | undefined): boolean {
  return WALLET_HS_TYPE_KIND[type ?? ""]?.credit ?? true;
}

/** Canonical kind label key for a wallet_hs type. */
export function walletKindOf(type: string | null | undefined): string {
  return WALLET_HS_TYPE_KIND[type ?? ""]?.kind ?? "adjustment";
}

/**
 * Minimal structural shape of a Supabase PostgREST filter builder over
 * `tb_wallet_hs`. Kept loose so callers pass the real builder without importing
 * its heavy generics; the returned type is the caller's own builder type `Q`, so
 * `.order()/.limit()/await` still chain normally afterward.
 */
type WalletHsQueryLike = {
  eq: (column: string, value: string) => WalletHsQueryLike;
  gt: (column: string, value: number) => WalletHsQueryLike;
  neq: (column: string, value: string) => WalletHsQueryLike;
  or: (filters: string) => WalletHsQueryLike;
};

/**
 * The pending "ชำระเงิน" slip-verify queue:
 *   status='1' (pending) · money-IN slips (amount>0) · EXCLUDING withdrawals
 *   (type '3') · DEDUPED to one row per payment — the "เติม-แล้วจ่าย" pay-half
 *   (type='4' with reforder2 set) collapses into its topup row (owner 2026-06-21),
 *   so `or` = NOT(type=4 AND reforder2 set).
 * Every consumer (dashboard topup tab + sidebar "ชำระเงิน" badge) MUST use this so
 * the tab and the badge always agree.
 */
export function pendingTopupFilter<Q>(q: Q): Q {
  return (q as unknown as WalletHsQueryLike)
    .eq("status", "1")
    .gt("amount", 0)
    .neq("type", WALLET_WITHDRAW_TYPE)
    .or("type.neq.4,reforder2.is.null") as unknown as Q;
}

/**
 * The pending "ถอนเงิน" (withdraw) queue: status='1' AND type='3'.
 * (NOT `amount < 0` — amounts are stored positive, so that matched nothing.)
 */
export function pendingWithdrawFilter<Q>(q: Q): Q {
  return (q as unknown as WalletHsQueryLike).eq("status", "1").eq("type", WALLET_WITHDRAW_TYPE) as unknown as Q;
}
