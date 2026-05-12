import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getMyTeamRoles, listMyCommissions } from "@/actions/sales";
import { PayoutForm } from "./payout-form";

export default async function SalesReportPage() {
  const t = await getTranslations("sales");

  const [rolesRes, commissionsRes] = await Promise.all([
    getMyTeamRoles(),
    listMyCommissions({ status: ["unpaid"], limit: 500 }),
  ]);
  const roles       = rolesRes.ok ? (rolesRes.data ?? []) : [];
  const commissions = commissionsRes.ok ? (commissionsRes.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("reportTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("reportSubtitle")}</p>
          </div>
          <Link href="/sales" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
            ← {t("backToOverview")}
          </Link>
        </div>

        <PayoutForm commissions={commissions} roles={roles} />
      </main>
      <Footer />
    </>
  );
}
