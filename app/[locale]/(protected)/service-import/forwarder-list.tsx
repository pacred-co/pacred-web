import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ForwarderSummary } from "@/actions/forwarder";

const STATUS_BADGE: Record<ForwarderSummary["status"], string> = {
  pending_payment:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  shipped_china:     "bg-blue-50 text-blue-700 border-blue-200",
  in_transit:        "bg-indigo-50 text-indigo-700 border-indigo-200",
  arrived_thailand:  "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery:  "bg-orange-50 text-orange-700 border-orange-200",
  delivered:         "bg-green-50 text-green-700 border-green-200",
  cancelled:         "bg-gray-50 text-gray-600 border-gray-200",
};

const WAREHOUSE_LABEL: Record<string, string> = {
  guangzhou: "กวางโจว",
  yiwu:      "อี้อู",
};

const TRANSPORT_ICON: Record<string, string> = {
  truck: "🚚",
  ship:  "🚢",
  air:   "✈️",
};

export async function ForwarderList({ items }: { items: ForwarderSummary[] }) {
  const t = await getTranslations("forwarder");

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted">{t("listEmpty")}</p>
        <Link
          href="/service-import/add"
          className="mt-4 inline-block rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
        >
          + {t("createNew")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">{t("colFNo")}</th>
            <th className="px-4 py-3">{t("colShipment")}</th>
            <th className="px-4 py-3 text-right">{t("colBoxWeight")}</th>
            <th className="px-4 py-3 text-right">{t("colTotal")}</th>
            <th className="px-4 py-3">{t("colTracking")}</th>
            <th className="px-4 py-3">{t("colStatus")}</th>
            <th className="px-4 py-3">{t("colDate")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <tr key={f.id} className="border-t border-border hover:bg-surface-alt/30">
              <td className="px-4 py-3 font-mono text-xs text-primary-600">
                {f.f_no
                  ? <Link href={`/service-import/${f.f_no}`} className="hover:underline">{f.f_no}</Link>
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span>{TRANSPORT_ICON[f.transport_type] ?? "📦"}</span>
                  <span className="text-xs">
                    {WAREHOUSE_LABEL[f.source_warehouse] ?? f.source_warehouse}
                    {" · "}
                    {t(`productType.${f.product_type}` as Parameters<typeof t>[0])}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right text-xs">
                <div>{f.box_count} {t("box")}</div>
                <div className="text-muted">{Number(f.weight_kg).toFixed(2)} kg / {Number(f.volume_cbm).toFixed(3)} cbm</div>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </td>
              <td className="px-4 py-3 text-xs text-muted">
                {f.tracking_th ? <div>TH: {f.tracking_th}</div> : null}
                {f.tracking_chn ? <div>CN: {f.tracking_chn}</div> : null}
                {!f.tracking_th && !f.tracking_chn ? "—" : null}
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[f.status]}`}>
                  {t(`status.${f.status}` as Parameters<typeof t>[0])}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                {new Date(f.created_at).toLocaleDateString("th-TH")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
