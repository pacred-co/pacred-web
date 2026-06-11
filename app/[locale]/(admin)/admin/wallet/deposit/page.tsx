import { redirect } from "next/navigation";

/**
 * Stub for the legacy `wallet/deposit/` sidebar item (รายการชำระเงิน ③).
 *
 * D1 Phase-B Wave-A audit fix
 * (docs/research/sidebar-fidelity-audit/02-wallet-withdrawal-pattern.md
 *  §3 row "รายการชำระเงิน ③" + §5.1a): the previous redirect dropped to
 * the unfiltered /admin/wallet view, breaking the legacy "pending
 * deposits queue" workflow that staff click through the sidebar badge.
 * Preserve the kind+status filter so staff land directly on the pending
 * deposit queue they expected.
 *
 * The dedicated /admin/wallet/deposit page (Wave-B B-2) will eventually
 * replace this redirect with the legacy wallet/add admin top-up form.
 */
export default function WalletDepositPage() {
  redirect("/admin/wallet?kind=deposit&status=pending");
}
