import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * U1-1 — legacy `/admin/containers/[id]` is now a redirect.
 *
 * Migration 0059 mirrored every legacy `containers` row into
 * `cargo_containers` via the `legacy_container_id` join. This page looks
 * up the spine code for the legacy id and redirects to the canonical
 * spine detail page. If no mirror exists yet (unlikely — backfill is
 * idempotent), fall back to the spine list.
 *
 * Per the audit follow-up to commit 185adfd: closing the "legacy still
 * editable" hole that would let the spine mirror drift.
 */

export const dynamic = "force-dynamic";

export default async function LegacyContainerDetailRedirect({
  params,
}: { params: Promise<{ id: string }> }) {
  await requireAdmin(["super", "ops", "warehouse"]);
  const { id } = await params;
  const locale = await getLocale();
  const admin  = createAdminClient();
  const { data } = await admin
    .from("cargo_containers")
    .select("code")
    .eq("legacy_container_id", id)
    .maybeSingle<{ code: string | null }>();

  if (data?.code) {
    redirect({ href: `/admin/warehouse/containers/${encodeURIComponent(data.code)}`, locale });
  }
  redirect({ href: "/admin/warehouse/containers", locale });
}
