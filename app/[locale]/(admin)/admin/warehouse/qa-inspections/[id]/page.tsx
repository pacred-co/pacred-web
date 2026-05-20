/**
 * /admin/warehouse/qa-inspections/[id] — TOMBSTONE (Wave 3 cleanup).
 *
 * See ../page.tsx — QA module deferred to Phase C.
 */

import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function QaInspectionDetailTombstone() {
  await requireAdmin(["super", "accounting", "warehouse"]);
  const locale = await getLocale();
  redirect({ href: "/admin/warehouse/qa-inspections", locale });
}
