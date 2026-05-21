/**
 * V-G6 #4 entry — /admin/reports/user-sales-history.
 *
 * Wave 7.2 (2026-05-21 night): redirect to the working customer
 * search / detail surface — the same data is now reachable via
 * /admin/customers (search by PR id / phone / name) + the customer
 * detail page (which shows recent forwarders / shop orders / yuan
 * payments from tb_*).
 *
 * The old "top 50 customers by lifetime value" landing read empty
 * rebuilt schema (`profiles`/`forwarders`/`service_orders`/`yuan_payments`)
 * and rendered nothing. Until Wave 8 ports the full V-G6 cohort tool
 * onto tb_*, the redirect avoids a misleading blank page.
 */

import { redirect } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function UserSalesHistoryEntry({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;
  const locale = await getLocale();

  // If a search query was supplied, send the operator straight to the
  // customer list pre-filtered — that surface knows how to look up legacy
  // userid / phone / name across tb_users.
  if (sp.q) {
    const q = encodeURIComponent(sp.q.trim());
    redirect({ href: `/admin/customers?q=${q}`, locale });
  }

  // Otherwise → "recently-active" view (Wave 7.2 rewrite reads
  // tb_users.userlastlogin desc · sales reps' first-stop for activity
  // ranking).
  redirect({ href: "/admin/customers/recently-active", locale });
}
