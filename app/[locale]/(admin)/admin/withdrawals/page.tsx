import { redirect } from "next/navigation";

/**
 * Stub for the legacy `wallet/withdraw/` sidebar item (รายการถอนเงิน ③).
 *
 * Per the D1 Phase-B Wave-A audit
 * (docs/research/sidebar-fidelity-audit/02-wallet-withdrawal-pattern.md
 *  §3 row "รายการถอนเงิน ③" + §5.1 — option C hybrid): the legacy item
 * is a filter view over the shared wallet table, so we redirect into
 * the `/admin/wallet` filter chips at the pending-withdraw view. The
 * walletWithdraw badge in actions/admin/sidebar-counts.ts already
 * feeds the count badge from the same query.
 *
 * Wave 23 P1 #7 (2026-05-27 — master tech-debt row 7): the redirect
 * was hardcoded to `?kind=withdraw&status=pending` and silently
 * stripped any incoming searchParams. Worse, it landed on
 * `/admin/wallet` (which defaults to `?view=balance`) instead of
 * `?view=tx`, so staff clicking `/admin/withdrawals?kind=...&status=...`
 * from chrome/breadcrumbs/audit links got the balance summary list
 * instead of the filtered withdrawal queue.
 *
 * Fix: forward whatever `kind`/`status` the caller passed (defaulting
 * to the legacy withdraw-pending preset only when neither is given) and
 * always force `view=tx` so the transactions list actually renders.
 *
 * AGENTS.md §0c — destructure `searchParams` as Promise (Next 16) and
 * normalise the `status=pending` legacy alias to the `status=1` enum the
 * wallet tx view understands (`transactions-view.tsx` line 112).
 */
export default async function AdminWithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const sp = await searchParams;

  // Default to the legacy "รอถอน" preset when no params arrive (e.g. plain
  // sidebar click). When the caller explicitly passes `kind` or `status`,
  // honour them — that's the row-7 bug fix.
  const kind = sp.kind ?? "withdraw";
  // `status=pending` is the legacy alias; the wallet tx view also accepts
  // it (see transactions-view.tsx line 112) but normalising here keeps the
  // forwarded URL self-describing in browser history + screenshots.
  const statusRaw = sp.status ?? "pending";
  const status = statusRaw === "pending" ? "1" : statusRaw;

  const qs = new URLSearchParams({ view: "tx", kind, status });
  redirect(`/admin/wallet?${qs.toString()}`);
}
