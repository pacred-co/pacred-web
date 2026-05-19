import { redirect } from "next/navigation";

/**
 * Stub for the legacy `/payment/add/` sidebar item ("เพิ่มรายการฝากชำระ").
 *
 * Legacy lets admin create a yuan-payment request on a customer's behalf
 * (CNY amount + recipient details + supporting docs). Pacred-current
 * design is customer-initiated only — admin only approves. Until the
 * admin-initiated flow ships, redirect to the queue so the sidebar
 * link doesn't 404.
 *
 * Follow-up tracked in docs/runbook/faithful-port-plan.md.
 */
export default function AdminYuanPaymentNewPage() {
  redirect("/admin/yuan-payments");
}
