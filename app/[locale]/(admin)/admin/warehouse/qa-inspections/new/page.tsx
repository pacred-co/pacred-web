/**
 * /admin/warehouse/qa-inspections/new — create a new QA inspection.
 *
 * Server-rendered shell + the client `NewInspectionForm` component.
 * The form accepts an optional `?forwarder_f_no=<n>` query param to
 * pre-fill the lookup (used by /admin/forwarders/[fNo] when warehouse
 * staff want to record QA against the job currently being viewed).
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NewInspectionForm } from "./new-inspection-form";

export const dynamic = "force-dynamic";

type SP = { forwarder_f_no?: string };

export default async function NewQaInspectionPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops", "warehouse", "qa"]);
  const sp = await searchParams;
  const t = await getTranslations("qaInspection");
  const initialFno = sp.forwarder_f_no ?? "";

  return (
    <main className="p-4 lg:p-6 space-y-5 max-w-3xl">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · QA</p>
        <h1 className="mt-1 text-2xl font-bold">{t("newTitle")}</h1>
        <p className="text-sm text-muted">{t("newSubtitle")}</p>
      </div>

      <Link
        href="/admin/warehouse/qa-inspections"
        className="text-sm text-muted hover:text-foreground underline"
      >
        ← {t("backToList")}
      </Link>

      <NewInspectionForm initialForwarderFNo={initialFno} />
    </main>
  );
}
