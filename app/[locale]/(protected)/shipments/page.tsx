import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { listMyShipments, type ShipmentSummary } from "@/actions/shipments";
import { relativeTimeTh, freshnessClass } from "@/lib/utils/relative-time";

/**
 * U1-7 freshness pill — displayed prominently so customer knows whether
 * data is current or stale. Maps freshness bucket → Tailwind classes.
 */
const FRESHNESS_PILL: Record<ReturnType<typeof freshnessClass>, string> = {
  fresh:      "bg-green-50 text-green-700 border-green-200",
  recent:     "bg-gray-50 text-gray-600 border-gray-200",
  stale:      "bg-amber-50 text-amber-700 border-amber-200",
  "very-old": "bg-red-50 text-red-700 border-red-200",
  unknown:    "bg-gray-50 text-gray-500 border-gray-200",
};

/**
 * Customer-side shipment tracking list (T-P2 / CT-3).
 *
 * Per Part T-P2: "Where's my container?" = #1 churn factor.  Customer
 * lands here from /dashboard or sidebar, scans status pills, drills in
 * via [code] for full timeline.
 *
 * Empty state intentionally calls out that shipments are CREATED by
 * Pacred warehouse staff (customer can't manually add) — avoids confusion
 * for new customers who haven't placed a cargo order yet.
 */

const STATUS_LABEL: Record<string, string> = {
  received_cn:         "รับเข้าโกดังจีน",
  packed_cn:           "บรรจุแล้ว (จีน)",
  sealed_in_container: "ปิดตู้แล้ว (จีน)",
  in_transit:          "กำลังเดินทาง",
  arrived_th:          "ถึงไทยแล้ว",
  unloaded:            "ลงจากตู้ (ไทย)",
  out_for_delivery:    "กำลังจัดส่ง",
  delivered:           "ส่งสำเร็จ",
};

const STATUS_BADGE: Record<string, string> = {
  received_cn:         "bg-gray-50 text-gray-700 border-gray-200",
  packed_cn:           "bg-blue-50 text-blue-700 border-blue-200",
  sealed_in_container: "bg-blue-50 text-blue-700 border-blue-200",
  in_transit:          "bg-amber-50 text-amber-700 border-amber-200",
  arrived_th:          "bg-amber-50 text-amber-700 border-amber-200",
  unloaded:            "bg-purple-50 text-purple-700 border-purple-200",
  out_for_delivery:    "bg-purple-50 text-purple-700 border-purple-200",
  delivered:           "bg-green-50 text-green-700 border-green-200",
};

const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ",
  sea:   "🚢 เรือ",
  air:   "✈️ เครื่องบิน",
};

export default async function ShipmentsPage() {
  const t = await getTranslations("shipments");
  const res = await listMyShipments(50);

  if (!res.ok) {
    return (
      <main className="p-6 lg:p-8 space-y-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {t("loadError", { error: res.error })}
        </div>
      </main>
    );
  }

  const shipments = res.data;

  // U1-7: latest scan-event timestamp across all shipments = "data fresh
  // as of this moment". Customer can compare to wall-clock to decide if
  // the system has been updated recently.
  const latestEventAt = shipments
    .map((s) => s.latest_event?.scanned_at)
    .filter((x): x is string => !!x)
    .sort()
    .reverse()[0] ?? null;
  const freshness = freshnessClass(latestEventAt);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">{t("kicker")}</p>
          <h1 className="mt-1 text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        {latestEventAt && (
          <div
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${FRESHNESS_PILL[freshness]}`}
            title={new Date(latestEventAt).toLocaleString("th-TH")}
          >
            🔄 ข้อมูลล่าสุด: {relativeTimeTh(latestEventAt)}
          </div>
        )}
      </div>

      {/* Stale / very-old data hint — nudge customer to contact sales if data hasn't moved */}
      {(freshness === "stale" || freshness === "very-old") && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ข้อมูลไม่ได้อัพเดทมา {relativeTimeTh(latestEventAt)} —
          ถ้าคุณคาดว่าน่าจะมีการเคลื่อนไหวล่าสุด กรุณาติดต่อทีมงานเพื่อตรวจสอบ
        </div>
      )}

      {shipments.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shipments.map((s) => (
            <ShipmentCard key={s.id} shipment={s} />
          ))}
        </ul>
      )}
    </main>
  );
}

function ShipmentCard({ shipment: s }: { shipment: ShipmentSummary }) {
  const statusBadge = STATUS_BADGE[s.status] ?? "bg-gray-50 text-gray-700 border-gray-200";
  const statusLabel = STATUS_LABEL[s.status] ?? s.status;
  const transport   = s.container?.transport_mode ? TRANSPORT_LABEL[s.container.transport_mode] : null;

  return (
    <Link
      href={`/shipments/${s.shipment_code}`}
      className="block rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm hover:shadow-md transition-shadow space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted font-mono">{s.shipment_code}</p>
          {s.container && (
            <p className="text-xs text-muted mt-0.5 truncate">
              📦 <span className="font-mono">{s.container.code}</span>
              {transport && <span className="ml-1">{transport}</span>}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge}`}>
          {statusLabel}
        </span>
      </div>

      {s.container && (
        <div className="text-xs text-muted">
          {s.container.origin} → {s.container.destination}
          {s.container.eta && (
            <span className="block mt-0.5">
              ETA: {new Date(s.container.eta).toLocaleDateString("th-TH")}
            </span>
          )}
        </div>
      )}

      {/* V-D4: received-vs-expected mini progress bar (same shape as detail page) */}
      {s.box_count != null && s.box_count > 0 && (
        <div className="text-xs border-t border-border pt-2 space-y-1">
          <div className="flex justify-between">
            <span className="text-muted">รับเข้าโกดังไทย</span>
            <span className="font-medium">
              <span className="font-mono">{s.received_box_count}</span>
              {" / "}
              <span className="font-mono">{s.box_count}</span>
              {" กล่อง"}
              {s.received_box_count >= s.box_count && (
                <span className="ml-1 text-green-600">✓</span>
              )}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
            <div
              className={`h-full transition-all ${
                s.received_box_count >= s.box_count ? "bg-green-500" : "bg-primary-500"
              }`}
              style={{
                width: `${Math.min(100, (s.received_box_count / s.box_count) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {s.latest_event && (
        <div className="text-xs border-t border-border pt-2">
          <span className="font-medium">{s.latest_event.event}</span>
          {s.latest_event.location && <span className="text-muted"> · {s.latest_event.location}</span>}
          <p className="text-muted mt-0.5">
            {new Date(s.latest_event.scanned_at).toLocaleString("th-TH", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </div>
      )}

      {/* Order references (so customer knows which cargo/shop order this came from) */}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {s.forwarder_f_no && (
          <span className="rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5">
            ฝากนำเข้า: <span className="font-mono">{s.forwarder_f_no}</span>
          </span>
        )}
        {s.service_order_h_no && (
          <span className="rounded bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5">
            ฝากสั่ง: <span className="font-mono">{s.service_order_h_no}</span>
          </span>
        )}
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-3">
      <p className="text-4xl">📦</p>
      <h2 className="font-bold text-lg">ยังไม่มีรายการขนส่ง</h2>
      <p className="text-sm text-muted max-w-sm mx-auto">
        Shipment ถูกสร้างโดยทีมงานคลังสินค้า Pacred เมื่อสินค้าของคุณเข้าโกดังที่จีน — ไม่ใช่สิ่งที่คุณสร้างเอง
      </p>
      <div className="flex flex-wrap gap-2 justify-center pt-2">
        <Link
          href="/service-import"
          className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs text-primary-700 hover:bg-primary-100"
        >
          → ดูฝากนำเข้าของฉัน
        </Link>
        <Link
          href="/service-order"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-alt"
        >
          → ดูฝากสั่งของฉัน
        </Link>
      </div>
    </div>
  );
}
