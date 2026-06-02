import { redirect } from "next/navigation";

/**
 * /commissions/me — REDIRECT to /sales/report
 *
 * REPOINTED 2026-06-02 per ADR-0026 D-3 + customer silent-fail fix.
 *
 * The old page read `commission_accruals` + `commission_withdrawals` (DEAD
 * rebuilt tables · 0 rows on prod) and posted to `staffRequestWithdrawal`
 * in the tombstoned `actions/admin/commissions.ts`. Result: every customer
 * "ขอเบิกค่าคอม" click → toast success → request vanished into the void →
 * no one ever processed it (the #1 dead-write pattern per AGENTS.md §0e +
 * `docs/audit/home-claude-258-commits-audit-2026-06-02.md` Surprise Findings).
 *
 * The canonical customer-facing commission surface is `/sales/report` +
 * `/sales/report/add` — the faithful transcription of legacy
 * `report-user-sales.php` + `report-user-sales-add.php`. That stack writes
 * `tb_user_sales_admin_pay` / `tb_user_sales_pay` via
 * `actions/commissions-tb.ts: submitSalesWithdrawal` → admin sees it at
 * `/admin/sales-payouts` → real processing → real money.
 *
 * Keeping the URL as a redirect (not 404) so any bookmark / sidebar link
 * survives the cutover. Eventually delete-able once the rebuilt
 * `commission_*` stack drops.
 */

export const dynamic = "force-dynamic";

export default function MyCommissionsRedirect() {
  redirect("/sales/report");
}
