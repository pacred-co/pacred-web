import { notFound } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { resolveSalesAgent } from "./team-map";

/**
 * Layout for the /sales routes — the FAITHFUL 1:1 transcription of the
 * legacy PCS Cargo sales-rep report cluster (D1 / ADR-0017 · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * The four legacy screens — `user-sales.php`, `report-user-sales.php`,
 * `report-user-sales-add.php`, `report-user-sales-history.php` — every
 * one opens with the SAME hardcoded access gate:
 *
 *   if( ($userID=='PCS888') || ($userID=='PCS2000') || ($userID=='PCS352')
 *       || ($userID=='PCS2678') || ($userID=='PCS4155') ) { … } else { //404 }
 *
 * i.e. only five specific member codes (the team-leader VIP accounts)
 * may see these screens; everyone else gets a 404. This layout
 * transcribes that gate 1:1 — `PCS<n>` → `PR<n>` (the only rebrand) —
 * via `resolveSalesAgent()` (see `team-map.ts`), which is `null` for any
 * non-whitelisted account → `notFound()`.
 *
 * The legacy never reads this whitelist from the DB — it is hardcoded
 * in every file. The faithful port keeps it hardcoded (in `team-map.ts`).
 */
export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getCurrentUserWithProfile();
  const agent = resolveSalesAgent(data?.profile?.member_code ?? null);
  if (!agent) {
    // Legacy `else { //404 }` — non-whitelisted member codes.
    notFound();
  }
  return <>{children}</>;
}
