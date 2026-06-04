import { redirect } from "next/navigation";

/**
 * /commissions — REDIRECT to /sales/report
 *
 * REPOINTED 2026-06-02 per ADR-0026 D-3 + customer silent-fail fix.
 *
 * The old page read `team_leaders` (DEAD rebuilt table · 0 rows on prod)
 * and posted to `requestCommissionWithdraw` from `actions/commissions.ts`
 * which writes the DEAD `sales_payouts` table. Every signed-in customer
 * fell through to the "Not on the affiliate program" empty state because
 * `team_leaders` has 0 rows — even the 4 real VIP teams (THADA.VIP ·
 * SIN.VIP · OOAEOM.VIP · SWAN) saw nothing.
 *
 * The canonical customer-facing commission surface is `/sales/report` +
 * `/sales/report/add` — the faithful transcription of legacy
 * `report-user-sales.php` + `report-user-sales-add.php`. That stack reads
 * the LIVE legacy `tb_user_sales` (4,104 unpaid earns) and writes via
 * `submitSalesWithdrawal` → real admin processing on `/admin/sales-payouts`.
 *
 * Keeping the URL as a redirect (not 404) so any sidebar / breadcrumb /
 * marketing link survives the cutover.
 */

export const dynamic = "force-dynamic";

export default function CommissionsRedirect() {
  redirect("/sales/report");
}
