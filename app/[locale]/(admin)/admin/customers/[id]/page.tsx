/**
 * /admin/customers/[id] — customer detail (D1 legacy `tb_*` primary).
 *
 * Wave 20 P0-1 (2026-05-25 ค่ำ): promoted the legacy `tb_users`-backed view
 * to be the ONLY view + deleted the rebuilt-schema codepath. Audit
 * `docs/audit/admin-pages-audit-2026-05-25-night.md` row P0-1 + same bug
 * class as the 2026-05-25 PR10899 issue: the list page is on `tb_users` ✅,
 * but the prior detail page queried the rebuilt `profiles` table which is
 * essentially empty for the ~8,898 migrated PCS customers → every row-click
 * 404'd or fell through to legacy-view via a fragile short-circuit.
 *
 * The legacy view (`legacy-view.tsx`) is now THE customer detail page. It
 * reads `tb_users` + `tb_wallet` + `tb_corporate` + `tb_address` and
 * surfaces recent forwarder / shop / yuan activity — everything staff need
 * for the migrated customer base. Action panels (credit-line · impersonate ·
 * assign-rep · edit) targeted the rebuilt-schema `profiles.id` (uuid) and
 * cannot run against `tb_users.userid` without a profiles-backfill — they
 * are deferred to Phase C per audit guidance.
 *
 * The sub-routes `convert-to-juristic/` and `transfer-rep/` are tracked as
 * separate audit items (P0-1 sub-tasks · P1-2). NOT touched here.
 */
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { renderLegacyCustomerView } from "./legacy-view";

// W-1: requireAdmin reads auth cookies; a page under a dynamic [id]
// segment that reads cookies MUST be force-dynamic (AGENTS.md §11).
export const dynamic = "force-dynamic";

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // W-1 (gap-admin H-1/H-7): page-level role gate. Customer detail =
  // full PII (corporate, addresses, wallet). ops + sales + accounting.
  await requireAdmin(["ops", "sales_admin", "accounting"]);

  const { id } = await params;

  // legacy-view destructures `error` from EVERY supabase read and throws on
  // a real error (AGENTS §0c). A null return means "row genuinely not in
  // tb_users" — only then do we 404.
  const view = await renderLegacyCustomerView(id);
  if (!view) notFound();
  return view;
}
