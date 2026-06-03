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
};

async function computeWalletSystemTotals(): Promise<WalletSystemTotals> {
  const admin = createAdminClient();
  const [{ data: wallets }, { data: cb }] = await Promise.all([
    admin.from("tb_wallet").select("wallettotal").limit(50_000),
    admin.from("tb_cash_back").select("cbtotal").limit(50_000),
  ]);
  const walletRows = wallets ?? [];
  const cbRows = cb ?? [];
  const sumWallet = walletRows.reduce(
    (s, r) => s + Number((r as { wallettotal: number | null }).wallettotal ?? 0),
    0,
  );
  const sumCb = cbRows.reduce(
    (s, r) => s + Number((r as { cbtotal: number | null }).cbtotal ?? 0),
    0,
  );
  return { sumWallet, sumCb, walletCount: walletRows.length, cbCount: cbRows.length };
}

export const getWalletSystemTotals = unstable_cache(
  computeWalletSystemTotals,
  ["wallet-system-totals"],
  { revalidate: 60, tags: [WALLET_TOTALS_TAG] },
);
