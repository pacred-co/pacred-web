import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * /admin/commissions/[id] — REDIRECT to /admin/sales-payouts/[id]
 *
 * REPOINTED 2026-06-02 per ADR-0026.
 *
 * The old detail page read `commission_withdrawals` + `commission_accruals`
 * (DEAD rebuilt tables · 0 rows on prod). The canonical detail lives at
 * `/admin/sales-payouts/[id]` which is wired to the live legacy
 * `tb_user_sales_admin_pay` family per ADR-0020 + P0-23 batch 2.
 *
 * Keeping this URL alive (as a redirect, not a 404) so existing audit-log
 * entries / breadcrumbs / external bookmarks survive the cutover. Eventually
 * delete-able once the old commission_* surface drops.
 */

export const dynamic = "force-dynamic";

export default async function AdminCommissionDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Keep the role gate so an unauth visit hits the same permission boundary
  // before the redirect fires (avoids login-loop on the target page).
  await requireAdmin(["super", "accounting"]);
  const { id } = await params;

  // Numeric ids (tb_user_sales_admin_pay.id is bigint) → /admin/sales-payouts/[id].
  // Non-numeric (legacy UUIDs from commission_withdrawals — dead rows anyway)
  // → fallback to the queue.
  if (/^\d+$/.test(id)) {
    redirect(`/admin/sales-payouts/${id}`);
  }
  redirect("/admin/sales-payouts");
}
