import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { getCurrentYuanRate, listYuanPayments } from "@/actions/payment";

const STATUS_BADGE: Record<string, string> = {
  pending:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed:  "bg-green-50 text-green-700 border-green-200",
  failed:     "bg-red-50 text-red-700 border-red-200",
  refunded:   "bg-gray-50 text-gray-600 border-gray-200",
};

const CHANNEL_LABEL: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat",
  bank:   "Bank",
};

export default async function ServicePaymentPage() {
  const t = await getTranslations("payment");

  const [rateRes, listRes] = await Promise.all([
    getCurrentYuanRate(),
    listYuanPayments(50),
  ]);
  const items = listRes.ok ? (listRes.data ?? []) : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">{t("kicker")}</p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
          <Link
            href="/service-payment/add"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            + {t("addTitle")}
          </Link>
        </div>

        {/* Rate banner */}
        <div className="rounded-2xl border border-primary-200 bg-primary-50/50 p-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs text-muted">{t("currentRate")}</p>
            <p className="text-2xl font-bold text-primary-700">1 CNY = ฿{rateRes.rate.toFixed(4)}</p>
          </div>
          <p className="text-xs text-muted">
            {t("rateUpdatedAt", { date: new Date(rateRes.updated_at).toLocaleString("th-TH") })}
          </p>
        </div>

        {/* History */}
        <section>
          <h2 className="text-lg font-bold mb-4">{t("historyTitle")}</h2>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            {items.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">{t("historyEmpty")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">{t("colDate")}</th>
                    <th className="px-4 py-3">{t("colChannel")}</th>
                    <th className="px-4 py-3 text-right">{t("colYuan")}</th>
                    <th className="px-4 py-3 text-right">{t("colThb")}</th>
                    <th className="px-4 py-3 text-right">{t("colRate")}</th>
                    <th className="px-4 py-3">{t("colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {new Date(p.created_at).toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-3">{CHANNEL_LABEL[p.channel]}</td>
                      <td className="px-4 py-3 text-right font-mono">¥{Number(p.yuan_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right font-mono">฿{Number(p.thb_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted">{Number(p.exchange_rate).toFixed(4)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[p.status]}`}>
                          {t(`status.${p.status}` as Parameters<typeof t>[0])}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
