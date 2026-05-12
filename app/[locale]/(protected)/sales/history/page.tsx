import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { listMyPayouts } from "@/actions/sales";

const STATUS_BADGE: Record<string, string> = {
  pending:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid:     "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export default async function SalesHistoryPage() {
  const t = await getTranslations("sales");
  const res = await listMyPayouts(100);
  const payouts = res.ok ? (res.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("payoutHistoryTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("payoutHistorySubtitle")}</p>
          </div>
          <Link href="/sales" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt">
            ← {t("backToOverview")}
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {payouts.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">{t("noPayouts")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">{t("colRequestedAt")}</th>
                  <th className="px-4 py-3 text-right">{t("colAmount")}</th>
                  <th className="px-4 py-3">{t("colBankInfo")}</th>
                  <th className="px-4 py-3">{t("colStatus")}</th>
                  <th className="px-4 py-3">{t("colPaidAt")}</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(p.requested_at).toLocaleString("th-TH")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      ฿{Number(p.amount_total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{p.bank_name}</div>
                      <div className="text-muted">{p.account_name}</div>
                      <div className="font-mono text-muted">{p.account_number}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[p.status]}`}>
                        {t(`payoutStatus.${p.status}` as Parameters<typeof t>[0])}
                      </span>
                      {p.rejection_reason && (
                        <div className="text-[10px] text-red-700 mt-1">{p.rejection_reason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString("th-TH") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
