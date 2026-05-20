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
 */
export default function AdminWithdrawalsPage() {
  redirect("/admin/wallet?kind=withdraw&status=pending");
}
