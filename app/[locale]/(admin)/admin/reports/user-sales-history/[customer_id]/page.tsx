/**
 * V-G6 #4 drill-in — /admin/reports/user-sales-history/[customer_id].
 *
 * Wave 7.2 (2026-05-21 night): redirect to the customer detail page —
 * same data, less duplication. The customer detail page (Wave 7
 * legacy fallback) already shows recent forwarders / shop orders /
 * yuan payments from tb_* for the customer.
 *
 * The original page read rebuilt schema 3-way join → empty on prod.
 */

import { redirect } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function UserSalesHistoryDrillIn({
  params,
}: {
  params: Promise<{ customer_id: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const { customer_id } = await params;
  const locale = await getLocale();
  redirect({ href: `/admin/customers/${encodeURIComponent(customer_id)}`, locale });
}
