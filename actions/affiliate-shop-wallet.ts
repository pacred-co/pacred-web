"use server";

/**
 * G7 · Shop wallet / affiliate payouts FOUNDATION
 * (D1 customer-backend gap #4 — `docs/research/d1-customer-backend-gap-2026-05-24.md` §5 #4).
 *
 * ⚠️ This file was lost in the 8-agent parallel save-point push for
 *    commit 8f4b64d (the agent created the file but the memory-limit
 *    shutdown skipped staging it). Rebuilt 2026-05-24 with the contract
 *    the surrounding page + client component require — but kept
 *    deliberately *stub-only* for the mutations because the underlying
 *    schema (`tb_wallet_shop`, `tb_shop_transactions`) is NOT in the
 *    pacred-web migrations yet. Each mutation returns
 *    `feature_not_yet_implemented` with a Thai-language hint so the UI
 *    surfaces a clear "coming soon" message instead of a silent failure.
 *
 *    Reads (`getShopWalletSummary` + `listShopWalletTransactions`) return
 *    zero/empty data — the page renders the 4-card hero with all zeros +
 *    an empty transactions table. This is by design for the foundation
 *    landing.
 *
 *    Next sprint must:
 *      1. Add a `tb_wallet_shop` (balance per profile_id) + a
 *         `tb_shop_transactions` (history ledger) migration.
 *      2. Wire up `tb_shop_pay_h` (the legacy withdraw-request table —
 *         schema in 0081 L4896-4961, mirrored on prod) for the withdraw
 *         flow.
 *      3. Replace the read stubs + mutation `not_implemented` returns
 *         here with the real queries.
 *
 * Legacy refs (for the future port):
 *   - `member/include/pages/wallet/load_wallet_shop.php` (load summary)
 *   - `member/include/pages/wallet-shop/*` (transfer + withdraw forms)
 *   - `tb_shop_pay_h` + `tb_shop_pay_sub` (0081 L4896, L4984)
 *   - `tb_user_sales*` (commission accruals — already partly ported via
 *     0013_sales_referral.sql + new `actions/commissions.ts` G6)
 */

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/auth/impersonation";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// Types — wire format for the /wallet-shop page + actions client
// ────────────────────────────────────────────────────────────

export type ShopWalletKind =
  | "earn"
  | "refund"
  | "payment"
  | "withdraw"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

export type ShopWalletTxnStatus = "pending" | "completed" | "failed" | "cancelled";

export type ShopWalletTransaction = {
  id:          string;
  kind:        ShopWalletKind;
  status:      ShopWalletTxnStatus;
  amount:      number;
  note:        string | null;
  created_at:  string;
};

export type ShopWalletSummary = {
  /** Currently spendable in the shop wallet. */
  balance:         number;
  /** Sum of all-time inbound (earn + refund + transfer_in). */
  lifetime_earned: number;
  /** Sum of pending outbound (withdraw + transfer_out, status=pending). */
  pending:         number;
  /** = balance - pending (the "can ask now" number). */
  available:       number;
};

export type TransferToShopInput = {
  amount: number;
  note?:  string;
};

export type ShopWithdrawInput = {
  amount:         number;
  bank_name:      string;
  account_name:   string;
  account_number: string;
  note?:          string;
};

// ────────────────────────────────────────────────────────────
// getShopWalletSummary — 4 hero cards on /wallet-shop
// ────────────────────────────────────────────────────────────
/**
 * Returns the caller's shop-wallet summary numbers.
 *
 * FOUNDATION STUB: the `tb_wallet_shop` table is not yet in the
 * pacred-web migrations, so every field returns 0. The page renders
 * the 4 stat cards in their neutral/empty state. When the schema lands,
 * replace the zero defaults with the real aggregate.
 */
export async function getShopWalletSummary(): Promise<ActionResult<ShopWalletSummary>> {
  // Auth gate kept — even the stub must require sign-in so the page
  // redirects guests via `requireAuth()`.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  return {
    ok: true,
    data: {
      balance:         0,
      lifetime_earned: 0,
      pending:         0,
      available:       0,
    },
  };
}

// ────────────────────────────────────────────────────────────
// listShopWalletTransactions — history table on /wallet-shop
// ────────────────────────────────────────────────────────────
/**
 * Returns the caller's shop-wallet transaction history (newest first).
 *
 * FOUNDATION STUB: returns an empty list. The page renders the "no
 * transactions yet" empty state.
 */
export async function listShopWalletTransactions(
  // Accepted for API stability with the future implementation; ignored
  // by the stub.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opts: { limit?: number } = {},
): Promise<ActionResult<ShopWalletTransaction[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  return { ok: true, data: [] };
}

// ────────────────────────────────────────────────────────────
// transferFromPersonalToShopWallet — modal action
// ────────────────────────────────────────────────────────────
/**
 * Debit personal wallet, credit shop wallet (atomic).
 *
 * FOUNDATION STUB: returns a clear "ยังไม่พร้อม" error so the modal
 * shows a localised message. Real implementation requires the
 * `tb_wallet_shop` schema + the wallet-transaction debit/credit pair.
 */
export async function transferFromPersonalToShopWallet(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  input: TransferToShopInput,
): Promise<ActionResult> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  return {
    ok:    false,
    error: "ฟีเจอร์โอนเข้ากระเป๋าร้านค้ายังไม่พร้อมใช้งาน — เร็วๆ นี้",
  };
}

// ────────────────────────────────────────────────────────────
// requestShopWalletWithdraw — modal action
// ────────────────────────────────────────────────────────────
/**
 * Submit a withdraw-to-bank request against the shop wallet balance.
 *
 * FOUNDATION STUB: returns a clear "ยังไม่พร้อม" error. Real
 * implementation writes to `tb_shop_pay_h` (legacy schema in 0081
 * L4896) with status='1' (รอดำเนินการ), and admin approves via the
 * back-office payout console (also pending).
 */
export async function requestShopWalletWithdraw(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  input: ShopWithdrawInput,
): Promise<ActionResult> {
  const impErr = await assertNotImpersonating();
  if (impErr) return impErr;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  return {
    ok:    false,
    error: "ฟีเจอร์ขอเบิกจากกระเป๋าร้านค้ายังไม่พร้อมใช้งาน — เร็วๆ นี้",
  };
}
