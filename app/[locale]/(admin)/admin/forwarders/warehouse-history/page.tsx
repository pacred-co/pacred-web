import { redirect } from "next/navigation";

/**
 * Stub for the legacy `/forwarder-import-warehouse/` sidebar item
 * ("ประวัติเข้าโกดังไทย").
 *
 * Legacy view tracks every barcode-scan event when goods arrive at the
 * Thailand warehouse (the wave-by-wave "ของถึง" event log). Pacred has
 * the data on `/admin/warehouse/containers` but not the per-forwarder
 * timeline. Until that view ships, redirect to the container list
 * which surfaces the same arrived-Thailand items grouped by container.
 *
 * Follow-up tracked in docs/runbook/faithful-port-plan.md.
 */
export default function AdminForwardersWarehouseHistoryPage() {
  redirect("/admin/warehouse/containers");
}
