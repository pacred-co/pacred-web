/**
 * /admin/forwarders/search — the clean "ค้นหารายการฝากนำเข้าสินค้า" page, a
 * faithful port of legacy `forwarder-search.php`.
 *
 * Owner 2026-07-18: the warehouse sidebar's "ค้นหารายการนำเข้า" used to link
 * straight to the full 549-row import list (`/admin/forwarders`) — hard for
 * warehouse staff to use. Legacy opens a tidy search box first (this page),
 * then shows the matching rows in the list. Restores that entry experience
 * (and de-duplicates the two sidebar items that both pointed at the list).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ForwarderSearchForm } from "./forwarder-search-form";

export const dynamic = "force-dynamic";

export default async function ForwarderSearchPage() {
  await requireAdmin(["super", "warehouse", "ops", "manager", "accounting", "sales", "sales_admin"]);

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-widest text-[#cc3333]">ADMIN · ฝากนำเข้า</p>
        <Link href="/admin/forwarders" className="text-xs text-primary-500 hover:underline">
          ดูรายการนำเข้าทั้งหมด →
        </Link>
      </div>
      <ForwarderSearchForm />
    </main>
  );
}
