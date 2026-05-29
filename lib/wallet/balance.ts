/**
 * Wallet available-balance helper — the single pending-aware spend check.
 *
 * ── ADR-0018 §D-3 #1 repoint (2026-05-30) ──────────────────────────
 *
 * Source-of-truth for the wallet is now the LEGACY `tb_wallet` +
 * `tb_wallet_hs` tables (ADR-0018 D-1), NOT the rebuilt
 * `wallet` / `wallet_transactions` tables (empty on prod). The 8,898
 * migrated customers' real balances live in `tb_wallet.wallettotal`,
 * keyed by `userID` = member_code (`PR####`) — NOT the auth uuid.
 *
 * What changed vs the pre-repoint version:
 *   - OLD: SELECT amount,status FROM wallet_transactions WHERE profile_id=<uuid>
 *          → sum(completed + open-pending-debit). All correct for the
 *          rebuilt model — and 0 for every migrated customer because the
 *          rebuilt table is empty (cust-04 P0-2: the "ชำระจากกระเป๋า"
 *          radio shows ฿0 → disabled → createYuanPaymentFromWallet is
 *          unreachable). That is the bug this repoint closes.
 *   - NEW: balance = `tb_wallet.wallettotal` (the SETTLED running balance —
 *          under ADR-0018 D-2, money only moves on status='2', so
 *          wallettotal already reflects every approved credit/debit)
 *          MINUS the "open pending-debit overhang" = SUM of `tb_wallet_hs`
 *          rows WHERE userID=member_code AND status='1' (pending) AND
 *          type ∈ {debit types}. This mirrors the original helper's
 *          intent: prevent stacking many pending requests that each pass
 *          individually but overdraw in aggregate once approved
 *          (gap-customer.md §H-1).
 *
 * ── Why member_code, not the auth uuid ──────────────────────────────
 *
 * `tb_wallet`/`tb_wallet_hs` key on `userID` (`PR####`). Every existing
 * caller passes a `profiles.id` (= the auth uuid): customer callers pass
 * `user.id`; admin callers pass `order.profile_id`/`forwarder.profile_id`.
 * To keep the call sites byte-identical (zero churn on the WRITE actions —
 * those are a separate P0-7 lane, out of scope here), this helper RESOLVES
 * `profileId → profiles.member_code` internally, then reads the legacy
 * tables by member_code. The exported signature + `number | null` return
 * contract are unchanged.
 *
 * ── Why an internal service-role client (ignoring the `supabase` arg) ──
 *
 * `tb_wallet` + `tb_wallet_hs` have RLS ENABLED with NO select policy for
 * `authenticated` (migration 0081 L8601-8602) → an RLS customer client
 * (`createClient()`) reads ZERO rows from them. The faithful precedent
 * `actions/payment-tb.ts::createYuanPaymentFromWallet` reads `tb_wallet`
 * via `createAdminClient()` (service role) for exactly this reason. So
 * this helper uses an internal `createAdminClient()` for the legacy reads.
 * The `supabase` parameter is retained ONLY for call-site compatibility
 * (so neither the customer nor admin callers change) — it is intentionally
 * not used for the legacy-table reads. This is safe: every consumer of
 * this module is a server context (`createAdminClient` is `server-only`).
 *
 * ── Fail-closed contract (unchanged — load-bearing) ─────────────────
 *
 * Returns `null` if the read fails; callers MUST treat `null` as
 * "cannot verify" and refuse the spend. Do not change this — it is the
 * app-layer overdraw guard's safety mechanism.
 *
 * ── Buckets (ADR-0018 §D-3 #1) ──────────────────────────────────────
 *
 * `tb_wallet` has NO bucket dimension — it is a single per-user balance.
 * The "cash-back" wallet lives in a SEPARATE table `tb_cash_back`
 * (cust-01 P1-16) and the customer credit-line in `tb_wallet_credit` —
 * both are different actions against different tables, out of scope for
 * this ADR. So `WalletBucket` collapses to a single `"main"`. No current
 * caller passes a non-main bucket (verified 2026-05-30); a non-main bucket
 * here returns `0` with a documented TODO rather than inventing a number.
 *
 * The DB-level `wallet_available_balance()` (migration 0064) + the 0007
 * `wallet_recompute_balance` trigger are obsolete under ADR-0018 — flagged
 * for retire when the last `wallet_transactions` reader migrates.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// NOTE: `createAdminClient` (server-only) is imported LAZILY inside
// `getWalletAvailableBalance` (via `await import`) rather than at the top of
// the module. This keeps the PURE reducer `sumAvailableBalance` importable by
// the plain-tsx unit test (`lib/wallet/balance.test.ts`) — a top-level
// `import "@/lib/supabase/admin"` pulls `server-only`, which THROWS under
// non-bundler (tsx) resolution and would break the unit test at load. The
// established codebase rule (see actions/payment-tb.test.ts + wallet-hs.test.ts)
// is: plain-tsx unit tests never import a server-only module. The lazy import
// preserves that while keeping every caller's `@/lib/wallet/balance` path
// unchanged.

export type WalletBucket = "main" | "cashback" | "credit";

/**
 * `tb_wallet_hs.type` values that represent a DEBIT (money leaving the
 * wallet). Direction is encoded by `type` in the legacy schema, not by
 * the sign of `amount` (which is always stored positive).
 *
 * Legacy `tb_wallet_hs.type` comment (0081 L6220):
 *   1 = รายการเติมเงิน           (deposit / credit)
 *   2 = รายการชำระเงินฝากสั่ง     (shop-order pay · DEBIT)
 *   3 = รายการถอนเงิน            (withdraw · DEBIT)
 *   4 = รายการชำระเงินฝากนำเข้า   (forwarder-import pay · DEBIT)
 *   5 = รายการคืนเงิน            (refund / credit)
 *   6 = ชำระเงินฝากโอน           (yuan-transfer pay · DEBIT)
 *   7 = ชำระเงินรอตรวจสอบการเติม  (topup-and-pay pending · DEBIT direction)
 *
 * Credits (types 1, 5) are NOT counted as a pending overhang — a pending
 * deposit/refund is money not yet in the wallet, exactly as the rebuilt
 * helper excluded pending CREDITS.
 */
const DEBIT_TYPES = ["2", "3", "4", "6", "7"] as const;

/** One legacy ledger row, as read for the pending-overhang sum. */
type WalletHsRow = { amount: number | string; status: string | null; type: string | null };

/**
 * Pure spendable-balance reducer for the LEGACY model.
 *
 *   available = settledBalance − Σ open-pending-debits
 *
 * where `settledBalance` is `tb_wallet.wallettotal` (already reflects every
 * status='2' movement under ADR-0018 D-2), and an "open pending debit" is a
 * `tb_wallet_hs` row with `status='1'` whose `type` is a debit type. The
 * stored `amount` is positive; we subtract it.
 *
 * Exported for unit testing; `getWalletAvailableBalance` wraps it around
 * the Supabase reads.
 */
export function sumAvailableBalance(
  // `number | string` because PostgREST returns numeric(10,2) columns as
  // strings; the caller already coerces, but accepting both keeps the helper
  // honest + the unit test type-safe.
  settledBalance: number | string,
  pendingRows: WalletHsRow[],
): number {
  let available = Number(settledBalance);
  if (!Number.isFinite(available)) available = 0;

  for (const row of pendingRows) {
    if (row.status !== "1") continue; // only OPEN pending rows are an overhang
    const type = row.type ?? "";
    if (!(DEBIT_TYPES as readonly string[]).includes(type)) continue; // credits don't reduce spendable
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    available -= Math.abs(amount); // amount is stored positive; debit reduces spendable
  }

  // tb_wallet.wallettotal + tb_wallet_hs.amount are numeric(10,2) — round
  // away the float drift the JS summation can introduce before callers
  // compare it.
  return Math.round(available * 100) / 100;
}

/**
 * Spendable balance for one wallet bucket against the LEGACY
 * `tb_wallet` + `tb_wallet_hs` tables.
 *
 * @param _supabase retained for call-site compatibility only — NOT used
 *   for the legacy reads (those go through an internal service-role client
 *   because `tb_wallet*` is RLS deny-all for non-service-role). See the
 *   module docblock.
 * @param profileId a `profiles.id` (= auth uuid). Resolved internally to
 *   `profiles.member_code` (`PR####`) — the key on `tb_wallet*`.
 * @param bucket only `"main"` is meaningful on `tb_wallet` (no bucket
 *   dimension). Non-main returns 0 (documented TODO — cashback/credit are
 *   separate tables, ADR-0018 §D-3 #1).
 *
 * Returns `null` if any read fails; callers MUST treat `null` as
 * "cannot verify" and refuse the spend (fail closed).
 */
export async function getWalletAvailableBalance(
  _supabase: SupabaseClient,
  profileId: string,
  bucket: WalletBucket = "main",
): Promise<number | null> {
  // tb_wallet has no bucket dimension — cashback (tb_cash_back) + credit
  // (tb_wallet_credit) are separate tables/actions, out of scope here.
  // Return 0 (not the main balance, not an invented number) so a non-main
  // caller can't accidentally spend the main balance. No caller passes a
  // non-main bucket today (verified 2026-05-30).
  // TODO(ADR-0018 follow-up): wire tb_cash_back / tb_wallet_credit if a
  // bucket-aware caller ever lands.
  if (bucket !== "main") return 0;

  // Lazy server-only import (see module-top note) — only resolved at runtime,
  // always in a server context. `tb_wallet*` is RLS deny-all for
  // non-service-role, so we MUST use the service-role client here regardless
  // of the (possibly RLS) `_supabase` the caller passed.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // ── Resolve profileId (auth uuid) → member_code (PR####) ──────────
  // profiles.id === auth uuid (lib/auth/get-user.ts queries .eq("id", user.id)).
  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", profileId)
    .maybeSingle<{ member_code: string | null }>();
  if (profileErr) {
    console.error(`[profiles member_code lookup] failed`, {
      code: profileErr.code,
      message: profileErr.message,
      profile_id: profileId,
    });
    return null; // fail closed
  }
  const memberCode = profileRow?.member_code ?? null;
  if (!memberCode) {
    // No member_code yet (brand-new account mid-signup) → no legacy wallet
    // row exists → spendable is 0. This is NOT a read failure, so return 0
    // (not null) — the customer genuinely has no migrated balance to spend.
    return 0;
  }

  // ── Settled balance = tb_wallet.wallettotal ───────────────────────
  const { data: walletRow, error: walletErr } = await admin
    .from("tb_wallet")
    .select("wallettotal")
    .eq("userid", memberCode)
    .maybeSingle<{ wallettotal: number | string }>();
  if (walletErr) {
    console.error(`[tb_wallet read] failed`, {
      code: walletErr.code,
      message: walletErr.message,
      userid: memberCode,
    });
    return null; // fail closed
  }
  const settledBalance = Number(walletRow?.wallettotal ?? 0);

  // ── Open pending-debit overhang from tb_wallet_hs ─────────────────
  // status='1' (pending) + debit types only. We over-fetch by status and
  // filter type in JS (DEBIT_TYPES) so the reducer + its unit test stay
  // the single source of the debit-type logic.
  const { data: pendingRows, error: hsErr } = await admin
    .from("tb_wallet_hs")
    .select("amount, status, type")
    .eq("userid", memberCode)
    .eq("status", "1");
  if (hsErr) {
    console.error(`[tb_wallet_hs pending read] failed`, {
      code: hsErr.code,
      message: hsErr.message,
      userid: memberCode,
    });
    return null; // fail closed
  }

  return sumAvailableBalance(settledBalance, (pendingRows ?? []) as WalletHsRow[]);
}

/**
 * True when a Supabase error is the migration-0064 overdraw-guard
 * rejection. Retained for callers that still pattern-match it on the
 * (rebuilt) `wallet_transactions` direct-insert path.
 *
 * NOTE (ADR-0018): the 0064 trigger fires on the rebuilt
 * `wallet_transactions` table, which under ADR-0018 D-1 is being retired.
 * Once the last `wallet_transactions` writer migrates to the legacy
 * tables this becomes dead and can be removed with the table drop. Kept
 * for now so the WRITE actions (createWithdraw etc. — separate P0-7 lane)
 * that still insert `wallet_transactions` keep their friendly-error path.
 */
export function isWalletOverdrawError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /overdraw/i.test(message);
}
