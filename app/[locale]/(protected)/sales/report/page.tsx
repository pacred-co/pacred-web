import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getMyTeamRoles, listMyCommissions } from "@/actions/sales";
import { ReportTable } from "./report-table";

export default async function SalesReportPage() {
  const t = await getTranslations("sales");

  const [rolesRes, commissionsRes] = await Promise.all([
    getMyTeamRoles(),
    listMyCommissions({ limit: 1000 }),
  ]);
  const roles       = rolesRes.ok ? (rolesRes.data ?? []) : [];
  const commissions = commissionsRes.ok ? (commissionsRes.data ?? []) : [];

  const totals = {
    all:    commissions.length,
    unpaid: commissions.filter((c) => c.status === "unpaid").length,
    paid:   commissions.filter((c) => c.status === "paid").length,
    sumAll:    commissions.reduce((s, c) => s + c.commission_amount, 0),
    sumUnpaid: commissions.filter((c) => c.status === "unpaid").reduce((s, c) => s + c.commission_amount, 0),
    sumPaid:   commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.commission_amount, 0),
  };

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("reportTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("reportSubtitle")}</p>
          </div>
          <div className="flex gap-2">
            {totals.unpaid > 0 && (
              <Link href="/sales/report/add"
                className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
                + {t("requestPayout")}
              </Link>
            )}
            <Link href="/sales" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
              ← {t("backToOverview")}
            </Link>
          </div>
        </div>

        {/* Summary stats */}
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat tone="primary"
            label={t("statTotalEarned")}
            value={`฿${totals.sumAll.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            sub={`${totals.all} ${t("items")}`} />
          <Stat tone="yellow"
            label={t("statUnpaid")}
            value={`฿${totals.sumUnpaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            sub={`${totals.unpaid} ${t("items")}`} />
          <Stat tone="green"
            label={t("statPaid")}
            value={`฿${totals.sumPaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
            sub={`${totals.paid} ${t("items")}`} />
        </section>

        <ReportTable commissions={commissions} roles={roles} />
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "primary" | "yellow" | "green" }) {
  const tones = {
    primary: "from-primary-500/10 to-primary-500/0 border-primary-500/30",
    yellow:  "from-yellow-500/10 to-yellow-500/0 border-yellow-500/30",
    green:   "from-green-500/10 to-green-500/0 border-green-500/30",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${tones}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono text-foreground">{value}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}
