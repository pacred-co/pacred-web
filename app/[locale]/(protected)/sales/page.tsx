import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getMyTeamRoles, listMyCommissions } from "@/actions/sales";

export default async function SalesPage() {
  const t = await getTranslations("sales");

  const [rolesRes, commissionsRes] = await Promise.all([
    getMyTeamRoles(),
    listMyCommissions({ limit: 1000 }),
  ]);

  const roles       = rolesRes.ok ? (rolesRes.data ?? []) : [];
  const commissions = commissionsRes.ok ? (commissionsRes.data ?? []) : [];

  // Aggregate per-team summary
  const perTeam = roles.map((r) => {
    const own = commissions.filter((c) => c.team_leader_id === r.id);
    const unpaid = own.filter((c) => c.status === "unpaid");
    const paid   = own.filter((c) => c.status === "paid");
    return {
      ...r,
      total_unpaid:  unpaid.reduce((s, c) => s + c.commission_amount, 0),
      total_paid:    paid.reduce((s, c) => s + c.commission_amount, 0),
      count_unpaid:  unpaid.length,
      count_paid:    paid.length,
    };
  });

  const totalUnpaid = perTeam.reduce((s, t) => s + t.total_unpaid, 0);
  const totalEarned = perTeam.reduce((s, t) => s + t.total_paid + t.total_unpaid, 0);

  return (
    <>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/sales/report/add"
              className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600">
              {t("requestPayout")}
            </Link>
            <Link href="/sales/report"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
              {t("viewReport")}
            </Link>
            <Link href="/sales/history"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
              {t("payoutHistory")}
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("statTotalEarned")}  value={`฿${totalEarned.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} tone="primary" />
          <Stat label={t("statUnpaid")}       value={`฿${totalUnpaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} tone="yellow" />
          <Stat label={t("statTeams")}        value={String(roles.length)} tone="blue" />
        </section>

        {/* Per-team breakdown */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-bold">{t("perTeamTitle")}</h2>
          </div>
          {perTeam.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">{t("noTeams")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">{t("colTeam")}</th>
                  <th className="px-4 py-3 text-right">{t("colCommissionPct")}</th>
                  <th className="px-4 py-3 text-right">{t("colUnpaid")}</th>
                  <th className="px-4 py-3 text-right">{t("colPaid")}</th>
                  <th className="px-4 py-3 text-right">{t("colTotal")}</th>
                </tr>
              </thead>
              <tbody>
                {perTeam.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs">{r.team_code}</td>
                    <td className="px-4 py-3 text-right">{(r.commission_pct * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right font-mono">
                      ฿{r.total_unpaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      <div className="text-[10px] text-muted">{r.count_unpaid} {t("items")}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">
                      ฿{r.total_paid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      <div className="text-[10px] text-muted">{r.count_paid} {t("items")}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ฿{(r.total_paid + r.total_unpaid).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "primary" | "yellow" | "blue" }) {
  const tones = {
    primary: "from-primary-500/10 to-primary-500/0 border-primary-500/30",
    yellow:  "from-yellow-500/10 to-yellow-500/0 border-yellow-500/30",
    blue:    "from-blue-500/10 to-blue-500/0 border-blue-500/30",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${tones}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono text-foreground">{value}</p>
    </div>
  );
}
