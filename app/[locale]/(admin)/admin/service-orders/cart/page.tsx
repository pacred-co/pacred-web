import { redirect } from "next/navigation";

/**
 * Stub for the legacy `/cart/` sidebar item ("รถเข็นสินค้า" — admin view).
 *
 * Legacy `pcs-admin/cart.php` (870 lines) lets admin view + manipulate
 * every customer's shopping cart (typically used by CS to add items
 * for customers who can't navigate Chinese sites). Pacred-current
 * carts are customer-scoped + admin only sees them when impersonating
 * the customer.
 *
 * Until the admin cart view ships, redirect to the pending orders
 * queue (where cart items become orders after checkout).
 *
 * Follow-up tracked in docs/runbook/faithful-port-plan.md.
 */
export default function AdminServiceOrdersCartPage() {
  redirect("/admin/service-orders?q=1");
}
