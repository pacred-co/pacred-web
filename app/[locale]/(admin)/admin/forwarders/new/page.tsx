import { redirect } from "next/navigation";

/**
 * Stub for the legacy `/forwarder/add/` sidebar item ("เพิ่มรายการนำเข้า").
 *
 * Legacy `pcs-admin/forwarder.php?page=add` is a 2,661-line god-page
 * that lets admin create a forwarder manually (warehouse + transport
 * + items + dimensions + add-ons + delivery — the full customer-side
 * form, but for staff). Pacred-current forwarders are customer-created
 * via /service-import/add. Admin manual-create needs:
 *  - select customer
 *  - the full /service-import/add form replicated under admin auth
 *  - bypass user-side validations + audit log
 *
 * Until that ships, redirect to the list so the sidebar link doesn't
 * 404. Admin can still create on the customer's behalf by impersonating
 * the customer (G-4 flow).
 *
 * Follow-up tracked in docs/runbook/faithful-port-plan.md.
 */
export default function AdminForwarderNewPage() {
  redirect("/admin/forwarders");
}
