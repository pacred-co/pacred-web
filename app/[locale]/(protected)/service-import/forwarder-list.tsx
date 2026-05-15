import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ForwarderSummary } from "@/actions/forwarder";
import { Eye, Package, Truck, Ship, Plane } from "lucide-react";

const STATUS_BADGE: Record<ForwarderSummary["status"], string> = {
  pending_payment:   "bg-amber-100 text-amber-700",
  shipped_china:     "bg-blue-100 text-blue-700",
  in_transit:        "bg-indigo-100 text-indigo-700",
  arrived_thailand:  "bg-purple-100 text-purple-700",
  out_for_delivery:  "bg-orange-100 text-orange-700",
  delivered:         "bg-emerald-100 text-emerald-700",
  cancelled:         "bg-gray-100 text-gray-600",
};

const WAREHOUSE_LABEL: Record<string, string> = {
  guangzhou: "กวางโจว",
  yiwu:      "อี้อู",
};

function TransportIcon({ type }: { type: string }) {
  switch (type) {
    case "truck": return <Truck className="w-3.5 h-3.5" />;
    case "ship":  return <Ship className="w-3.5 h-3.5" />;
    case "air":   return <Plane className="w-3.5 h-3.5" />;
    default:      return <Package className="w-3.5 h-3.5" />;
  }
}

export async function ForwarderList({
  items,
  activeFilter = "all",
  containerByFno,
}: {
  items: ForwarderSummary[];
  activeFilter?: string;
  containerByFno?: Map<string, { code: string; shipment_code: string }>;
}) {
  const t = await getTranslations("forwarder");

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-white dark:bg-surface p-12 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt text-muted">
          <Package className="w-7 h-7" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          {activeFilter === "all" ? t("listEmpty") : "ไม่มีรายการในสถานะที่เลือก"}
        </p>
        <p className="mt-1 text-xs text-muted">
          เพิ่มรายการนำเข้าเพื่อให้ Pacred ติดตามตู้ + ออกใบแจ้งหนี้อัตโนมัติ
        </p>
        <Link
          href="/service-import/add"
          className="mt-4 inline-block rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600 shadow-sm"
        >
          + {t("createNew")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 w-[140px]">วันที่สร้าง</th>
              <th className="px-4 py-3 w-[150px]">เลขที่</th>
              <th className="px-4 py-3">รายละเอียด</th>
              <th className="px-4 py-3 text-right w-[120px]">ค่าขนส่ง</th>
              <th className="px-4 py-3 w-[180px]">Tracking</th>
              <th className="px-4 py-3 w-[140px]">สถานะ</th>
              <th className="px-4 py-3 w-[140px]">ตัวเลือก</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((f) => {
              const created = new Date(f.created_at);
              return (
                <tr key={f.id} className="hover:bg-surface-alt/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap align-top">
                    <div>{created.toLocaleDateString("th-TH")}</div>
                    <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {f.f_no ? (
                      <Link href={`/service-import/${f.f_no}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {f.f_no}
                      </Link>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-medium border border-amber-200">
                        <TransportIcon type={f.transport_type} />
                        {f.transport_type === "truck" ? "ทางรถ" : f.transport_type === "ship" ? "ทางเรือ" : f.transport_type === "air" ? "ทางอากาศ" : f.transport_type}
                        {" · "}
                        {WAREHOUSE_LABEL[f.source_warehouse] ?? f.source_warehouse}
                      </div>
                      <p className="text-xs text-foreground">
                        {f.box_count} กล่อง · {Number(f.weight_kg).toFixed(2)} kg / {Number(f.volume_cbm).toFixed(3)} cbm
                      </p>
                      <p className="text-[10px] text-muted">{t(`productType.${f.product_type}` as Parameters<typeof t>[0])}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono align-top">
                    <div className="text-sm font-bold text-red-600">
                      ฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs align-top">
                    {f.tracking_chn && (
                      <div>
                        <span className="text-muted">🇨🇳</span>{" "}
                        <span className="font-mono text-foreground">{f.tracking_chn}</span>
                      </div>
                    )}
                    {f.tracking_th && (
                      <div>
                        <span className="text-muted">🇹🇭</span>{" "}
                        <span className="font-mono text-foreground">{f.tracking_th}</span>
                      </div>
                    )}
                    {!f.tracking_chn && !f.tracking_th && <span className="text-muted">—</span>}
                    {(() => {
                      const c = f.f_no ? containerByFno?.get(f.f_no) : undefined;
                      if (!c) return null;
                      return (
                        <Link
                          href={`/shipments/${c.shipment_code}`}
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] text-blue-700 hover:bg-blue-100"
                        >
                          📦 ตู้ <span className="font-mono">{c.code}</span> →
                        </Link>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[f.status]}`}>
                      {t(`status.${f.status}` as Parameters<typeof t>[0])}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {f.f_no && (
                      <Link
                        href={`/service-import/${f.f_no}`}
                        className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 text-green-700 px-3 py-1 text-xs font-semibold hover:bg-green-100"
                      >
                        <Eye className="w-3.5 h-3.5" /> ดูรายละเอียด
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
