import { redirect } from "next/navigation";

/**
 * Stub for the legacy `/forwarder-bill.php` sidebar item ("รวมบิลสินค้า").
 *
 * Legacy lets warehouse staff combine multiple forwarders into one
 * shipping bill for the same customer (cuts the per-bill delivery
 * cost when several imports arrive in the same wave). Pacred-current
 * uses one-bill-per-forwarder + a Thai-delivery disbursement layer.
 *
 * Until the multi-bill combiner ships, redirect to the forwarder
 * list where staff can select the rows manually.
 *
 * Follow-up tracked in docs/runbook/faithful-port-plan.md.
 */
export default function AdminForwardersCombineBillPage() {
  redirect("/admin/forwarders");
}
