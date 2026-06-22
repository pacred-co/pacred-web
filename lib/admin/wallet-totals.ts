/**
 * System-wide wallet + cash-back totals — cached aggregate.
 *
 * PERF (2026-06-03): both `/admin/wallet` (balance view) and the `/admin`
 * dashboard computed these totals by pulling up to 50,000 rows from
 * `tb_wallet` + `tb_cash_back` and summing in JS on EVERY page render
 * (PostgREST has no SUM endpoint). The two pages duplicated the work and
 * neither cached it. These are bank-wide totals that do not need to be
 * live-to-the-second — wrapping them in `unstable_cache` (60 s TTL, global
 * key) means the ~9k+9k row pull happens at most once a minute instead of
 * on every nav, and the wallet/dashboard pages share the one cache entry.
 *
 * Uses the service-role admin client (no cookies → safe inside unstable_cache).
 * Call `revalidateTag(WALLET_TOTALS_TAG)` from any Server Action that mutates
 * a balance (slip approve/reject, top-up, withdraw) to refresh immediately.
 */
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const WALLET_TOTALS_TAG = "wallet-system-totals";

export type WalletSystemTotals = {
  sumWallet: number;
  sumCb: number;
  /** Row counts behind each sum — for the "(N ราย)" sub-labels. */
  walletCount: number;
  cbCount: number;
  /** Negative-balance accounting (owner 2026-06-22: explain a negative TOTAL —
   *  it's not a code bug, it's customers whose wallet went negative from an
   *  unbalanced legacy "เติม-แล้วจ่าย" pay · needs accounting reconcile). */
  negCount: number;
  negSum: number;          // total of all negative balances (≤ 0)
  topNegUserid: string | null;
  topNegAmount: number;    // the single most-negative balance (≤ 0)
};

async function computeWalletSystemTotals(): Promise<WalletSystemTotals> {
  const admin = createAdminClient();
  const [{ data: wallets }, { data: cb }] = await Promise.all([
    admin.from("tb_wallet").select("userid,wallettotal").limit(50_000),
    admin.from("tb_cash_back").select("cbtotal").limit(50_000),
  ]);
  const walletRows = (wallets ?? []) as Array<{ userid: string | null; wallettotal: number | null }>;
  const cbRows = cb ?? [];
  let sumWallet = 0, negCount = 0, negSum = 0, topNegAmount = 0;
  let topNegUserid: string | null = null;
  for (const r of walletRows) {
    const v = Number(r.wallettotal ?? 0);
    sumWallet += v;
    if (v < 0) {
      negCount += 1;
      negSum += v;
      if (v < topNegAmount) { topNegAmount = v; topNegUserid = r.userid ?? null; }
    }
  }
  const sumCb = cbRows.reduce(
    (s, r) => s + Number((r as { cbtotal: number | null }).cbtotal ?? 0),
    0,
  );
  return {
    sumWallet, sumCb, walletCount: walletRows.length, cbCount: cbRows.length,
    negCount, negSum, topNegUserid, topNegAmount,
  };
}

export const getWalletSystemTotals = unstable_cache(
  computeWalletSystemTotals,
  ["wallet-system-totals"],
  { revalidate: 60, tags: [WALLET_TOTALS_TAG] },
);
