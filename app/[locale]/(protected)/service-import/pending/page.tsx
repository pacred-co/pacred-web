import { redirect } from "next/navigation";

/**
 * `/service-import/pending` was a divergent DEAD TWIN: it read the rebuilt,
 * 0-row `forwarders` table via `listForwarders` → always empty for the 8,898
 * migrated customers (Wave A trust sweep · big-audit §0e dead-read trap).
 *
 * The canonical "รอชำระเงิน" (pending-payment) view is the faithful
 * `tb_forwarder` transcription at `/service-import` filtered to fStatus=5
 * (`?q=5` — see service-import/page.tsx L261). Redirect so every inbound nav
 * (sidebar / mobile FAB / mobile-launchpad / bookmark) lands on REAL data.
 *
 * The orphan reader (`listForwarders` + `ForwarderSummary` + the
 * `<ForwarderList>` component) was removed in the same sweep.
 */
export default function ServiceImportPendingPage() {
  redirect("/service-import?q=5");
}
