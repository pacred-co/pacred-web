import { redirect } from "next/navigation";

/**
 * Stub for the legacy `/cart/add/` sidebar item ("เพิ่มสินค้าในรถเข็น" —
 * the example ภูม flagged: sidebar link was a 404 before this commit).
 *
 * Legacy admin add-to-cart-for-customer flow ("ฝากสั่งให้ลูกค้า") needs
 * the customer-side add-cart form replicated under admin auth + the
 * URL-scrape step for 1688/Taobao products. Until that ships, redirect
 * to the customer-side add page (admin can use impersonation to add
 * on a customer's behalf — G-4 flow).
 *
 * Follow-up tracked in docs/runbook/faithful-port-plan.md.
 */
export default function AdminServiceOrdersCartAddPage() {
  redirect("/service-order/add");
}
