import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ServiceOrderSummary } from "@/actions/service-order";
import { Eye, Package } from "lucide-react";

const STATUS_BADGE: Record<ServiceOrderSummary["status"], string> = {
  pending:               "bg-gray-100 text-gray-700",
  awaiting_payment:      "bg-amber-100 text-amber-700",
  ordered:               "bg-blue-100 text-blue-700",
  awaiting_chn_dispatch: "bg-indigo-100 text-indigo-700",
  completed:             "bg-emerald-100 text-emerald-700",
  cancelled:             "bg-red-100 text-red-700",
};

export async function ServiceOrderList({
  items,
  activeFilter = "all",
}: {
  items: ServiceOrderSummary[];
  activeFilter?: string;
}) {
  const t = await getTranslations("serviceOrder");

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
          เริ่มต้นด้วยการค้นหาสินค้าจาก 1688 / Taobao / Tmall
        </p>
        <Link
          href="/service-order/add"
          className="mt-4 inline-block rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-bold hover:bg-primary-600 shadow-sm"
        >
          + {t("addItem")}
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
              <th className="px-4 py-3 w-[140px]">วันที่</th>
              <th className="px-4 py-3 w-[150px]">ออเดอร์เลขที่</th>
              <th className="px-4 py-3">ข้อมูลสินค้า</th>
              <th className="px-4 py-3 w-[140px]">สถานะ</th>
              <th className="px-4 py-3 text-right w-[120px]">ราคา (บาท)</th>
              <th className="px-4 py-3 w-[140px]">ตัวเลือก</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((o) => {
              const created = new Date(o.created_at);
              return (
                <tr key={o.id} className="hover:bg-surface-alt/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap align-top">
                    <div>{created.toLocaleDateString("th-TH")}</div>
                    <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {o.h_no ? (
                      <Link href={`/service-order/${o.h_no}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {o.h_no}
                      </Link>
                    ) : <span className="text-muted">—</span>}
                    {o.payment_due_at && o.status === "awaiting_payment" && (
                      <div className="mt-1 text-[10px] text-amber-700">
                        {t("payBy", { date: new Date(o.payment_due_at).toLocaleString("th-TH") })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-surface-alt border border-border flex items-center justify-center">
                        {o.cover_image_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.cover_image_path} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-6 h-6 text-muted" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm line-clamp-2 text-foreground">
                          {o.title ?? "—"}
                        </p>
                        <p className="text-[11px] text-muted mt-1">
                          {o.item_count} ชิ้น
                          {o.warehouse_china && <> · {o.warehouse_china === "yiwu" ? "อี้อู" : "กวางโจว"}</>}
                          {o.ship_by && <> · {o.ship_by}</>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[o.status]}`}>
                      {t(`status.${o.status}` as Parameters<typeof t>[0])}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono align-top">
                    <div className="text-sm font-bold text-red-600">
                      {Number(o.total_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </div>
                    {o.yuan_rate_locked && (
                      <div className="text-[10px] text-muted">@ ฿{Number(o.yuan_rate_locked).toFixed(4)}/¥</div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {o.h_no && (
                      <Link
                        href={`/service-order/${o.h_no}`}
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
