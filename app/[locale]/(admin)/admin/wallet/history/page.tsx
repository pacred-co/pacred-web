/**
 * /admin/wallet/history — RETIRED (Wave 7.2 · 2026-05-21 night).
 *
 * The legacy "ประวัติรายการ" page read the rebuilt `wallet_transactions`
 * table (empty on prod under D1 · the real ~104k wallet rows live in
 * tb_wallet_hs). Instead of duplicating the main list rewrite, this
 * page now redirects to the main wallet list with the "อนุมัติแล้ว"
 * filter applied — that's the same view ops use for browsing the
 * historical ledger.
 *
 * The main list at `/admin/wallet` (Wave 7.2 rewrite) shows the latest
 * 200 rows per filter + has full search by userid / id. Date-range
 * historical export → Wave 8 reports.
 */

import { redirect } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminWalletHistoryRedirect() {
  await requireAdmin(["ops", "accounting"]);
  const locale = await getLocale();
  redirect({ href: "/admin/wallet?status=2", locale });
}
