import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * Wave 3 cleanup (2026-05-20 ค่ำ) — legacy `/admin/containers/[id]` →
 * `/admin/report-cnt`.
 *
 * The 0033 spine (cargo_containers + cargo_shipments) was retired under
 * D1 Option A in Wave 2. The faithful `report-cnt.php` port at
 * `/admin/report-cnt` reads `tb_forwarder` GROUP BY fCabinetNumber and
 * is the canonical container view going forward. We keep this route as
 * a redirect so legacy bookmarks / staff muscle-memory still land
 * somewhere useful.
 */

export const dynamic = "force-dynamic";

export default async function LegacyContainerDetailRedirect() {
  await requireAdmin(["super", "ops", "warehouse"]);
  const locale = await getLocale();
  redirect({ href: "/admin/report-cnt", locale });
}
