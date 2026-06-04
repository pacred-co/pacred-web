import { redirect } from "next/navigation";

/**
 * /commissions/me/[id] — REDIRECT to /sales/report
 *
 * REPOINTED 2026-06-02 per ADR-0026 D-3 + customer silent-fail fix.
 *
 * The old page read `commission_withdrawals` (DEAD rebuilt table · 0 rows on
 * prod) — every detail request resolved to 404 even though the row existed
 * in the LIVE legacy `tb_user_sales_admin_pay`. The canonical customer-side
 * withdrawal history lives on `/sales/report` (port of legacy
 * `report-user-sales-history.php`).
 *
 * Keeping the URL as a redirect (not 404) so existing bookmarks survive.
 * Eventually delete-able once the rebuilt `commission_*` stack drops.
 */

export const dynamic = "force-dynamic";

export default function MyWithdrawalDetailRedirect() {
  redirect("/sales/report");
}
