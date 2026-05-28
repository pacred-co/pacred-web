import { redirect } from "next/navigation";

/**
 * Stub for the legacy `/pay-users.php` sidebar item ("จ่ายแทนลูกค้า").
 *
 * The full PHP page is 1,140 lines covering admin-initiated payments
 * from the company wallet on behalf of a customer (cash withdrawals,
 * supplier transfers, fee waivers). Porting it 1:1 needs:
 *  - select-customer + select-bucket + amount + reason
 *  - debit wallet_transactions (kind=adjustment, negative amount)
 *  - audit + notification flow
 *
 * Until that ships, this stub redirects to the existing payment-view
 * filter so the sidebar link no longer 404s. The order-payment kind
 * surfaces the same "money out the door" transactions the legacy
 * pay-users page tracked.
 *
 * Follow-up tracked in docs/runbook/faithful-port-plan.md.
 */
export default function AdminWalletPayUserPage() {
  redirect("/admin/wallet?kind=order_payment");
}
