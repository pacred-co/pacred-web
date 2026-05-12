import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ServiceOrderSummary } from "@/actions/service-order";

const STATUS_BADGE: Record<ServiceOrderSummary["status"], string> = {
  pending:               "bg-gray-50 text-gray-700 border-gray-200",
  awaiting_payment:      "bg-yellow-50 text-yellow-700 border-yellow-200",
  ordered:               "bg-blue-50 text-blue-700 border-blue-200",
  awaiting_chn_dispatch: "bg-indigo-50 text-indigo-700 border-indigo-200",
  completed:             "bg-green-50 text-green-700 border-green-200",
  cancelled:             "bg-red-50 text-red-700 border-red-200",
};

export async function ServiceOrderList({ items }: { items: ServiceOrderSummary[] }) {
  const t = await getTranslations("serviceOrder");

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted">{t("listEmpty")}</p>
        <Link
          href="/service-order/cart"
          className="mt-4 inline-block rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
        >
          {t("openCart")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">{t("colHNo")}</th>
            <th className="px-4 py-3">{t("colTitle")}</th>
            <th className="px-4 py-3 text-right">{t("colItems")}</th>
            <th className="px-4 py-3 text-right">{t("colTotal")}</th>
            <th className="px-4 py-3">{t("colStatus")}</th>
            <th className="px-4 py-3">{t("colDate")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr key={o.id} className="border-t border-border hover:bg-surface-alt/30">
              <td className="px-4 py-3 font-mono text-xs text-primary-600">{o.h_no ?? "—"}</td>
              <td className="px-4 py-3">
                <div className="font-medium">{o.title ?? "—"}</div>
                {o.status === "awaiting_payment" && o.payment_due_at && (
                  <div className="text-xs text-yellow-700">
                    {t("payBy", { date: new Date(o.payment_due_at).toLocaleString("th-TH") })}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right text-xs">{o.item_count}</td>
              <td className="px-4 py-3 text-right font-mono">
                ฿{Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                {o.yuan_rate_locked && (
                  <div className="text-[10px] text-muted">@ ฿{Number(o.yuan_rate_locked).toFixed(4)}/¥</div>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[o.status]}`}>
                  {t(`status.${o.status}` as Parameters<typeof t>[0])}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {new Date(o.created_at).toLocaleDateString("th-TH")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
