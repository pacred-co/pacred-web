import { redirect } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLocale } from "next-intl/server";

/**
 * U1-1 — legacy `/admin/containers` list is now a redirect.
 *
 * The 0016 phase-H container table was unified into `cargo_containers`
 * via migration 0059. The canonical UI lives at
 * `/admin/warehouse/containers`. We keep this route as a 308 redirect
 * so legacy bookmarks / staff muscle-memory still land somewhere
 * useful.
 *
 * Detail routes `/admin/containers/[id]/*` remain functional during
 * the cutover (legacy `containers` table is read-only but still
 * accessible) — admin can finish in-flight edits via direct link,
 * but the entry point is the spine.
 */

export const dynamic = "force-dynamic";

export default async function AdminContainersLegacyListRedirect() {
  // Same role gate as the spine page (super/ops/warehouse).
  await requireAdmin(["super", "ops", "warehouse"]);
  const locale = await getLocale();
  redirect({ href: "/admin/warehouse/containers", locale });
}
