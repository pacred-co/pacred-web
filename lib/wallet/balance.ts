/**
 * Wallet available-balance helper — the single pending-aware spend check.
 *
 * The 0007 `wallet_recompute_balance` trigger sums only `status='completed'`
 * rows, so the `wallet.balance` column ignores not-yet-approved pending
 * debits (withdraw / wallet-paid yuan_payment / order_payment / …).
 * Checking a spend against that raw column lets a customer stack many
 * pending requests that each pass individually but overdraw in aggregate
 * once an admin approves them (gap-customer.md §H-1).
 *
 * "Available balance" = completed rows + open pending DEBITS. Pending
 * CREDITS (a deposit awaiting approval) are NOT counted — that money is
 * not in the wallet yet. This is the app-layer mirror of the SQL
 * `wallet_available_balance()` function (migration 0064) that backs the
 * DB-level overdraw-guard trigger.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type WalletBucket = "main" | "cashback" | "credit";

type LedgerRow = { amount: number | string; status: string };

/**
 * Pure spendable-balance reducer — completed rows plus open pending
 * debits. Exported for unit testing; `getWalletAvailableBalance` wraps it
 * around a Supabase read.
 */
export function sumAvailableBalance(rows: LedgerRow[]): number {
  let available = 0;
  for (const row of rows) {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.status === "completed" || (row.status === "pending" && amount < 0)) {
      available += amount;
    }
  }
  // wallet_transactions.amount is numeric(12,2) — round away the float
  // drift the JS summation can introduce before callers compare it.
  return Math.round(available * 100) / 100;
}

/**
 * Spendable balance for one wallet bucket — completed rows plus open
 * pending debits. Returns `null` if the ledger read fails; callers MUST
 * treat `null` as "cannot verify" and refuse the spend (fail closed).
 */
export async function getWalletAvailableBalance(
  supabase: SupabaseClient,
  profileId: string,
  bucket: WalletBucket = "main",
): Promise<number | null> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("amount, status")
    .eq("profile_id", profileId)
    .eq("bucket", bucket)
    .in("status", ["completed", "pending"]);

  if (error || !data) return null;
  return sumAvailableBalance(data as LedgerRow[]);
}

/**
 * True when a Supabase error is the migration-0064 overdraw-guard
 * rejection. Lets callers surface a friendly message instead of the raw
 * DB exception text on the rare race / direct-RLS-insert path that slips
 * past the app-layer check.
 */
export function isWalletOverdrawError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /overdraw/i.test(message);
}
