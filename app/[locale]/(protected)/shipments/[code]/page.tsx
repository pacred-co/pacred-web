import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getMyShipment } from "@/actions/shipments";
import { createClient } from "@/lib/supabase/server";
import { relativeTimeTh, freshnessClass } from "@/lib/utils/relative-time";
import { CARGO_TYPE_LABEL_TH, isCargoType } from "@/lib/warehouse/cargo-type";

// Module-scope helper so React Compiler doesn't flag Date.now as impure-in-render.
function daysUntilIso(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** U1-7: same freshness palette as the list page. */
const FRESHNESS_PILL: Record<ReturnType<typeof freshnessClass>, string> = {
  fresh:      "bg-green-50 text-green-700 border-green-200",
  recent:     "bg-gray-50 text-gray-600 border-gray-200",
  stale:      "bg-amber-50 text-amber-700 border-amber-200",
  "very-old": "bg-red-50 text-red-700 border-red-200",
  unknown:    "bg-gray-50 text-gray-500 border-gray-200",
};

/**
 * Customer-side shipment detail with full tracking timeline (T-P2 / CT-3).
 *
 * Reached from /shipments list — customer drills in to see the full event
 * history newest-first.  RLS in actions/shipments.ts keeps this page
 * automatically scoped to the customer's own shipments.
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

const EVENT_LABEL: Record<string, string> = {
  scan_receive: "รับสินค้าเข้าโกดัง",
  scan_pack:    "บรรจุลงตู้",
  scan_seal:    "ปิดตู้",
  scan_depart:  "ออกจากต้นทาง",
  scan_arrive:  "ถึงปลายทาง",
  scan_unload:  "ขนลงจากตู้",
  scan_deliver: "ส่งถึงผู้รับ",
};

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const res = await getMyShipment(code);

  if (!res.ok) {
    if (res.error === "not_found" || res.error === "invalid_shipment_code") {
      notFound();
    }
    return (
      <main className="p-6 lg:p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          เกิดข้อผิดพลาด: {res.error}
        </div>
      </main>
    );
  }

  const s = res.data;
  const statusBadge = STATUS_BADGE[s.status] ?? "bg-gray-50 text-gray-700 border-gray-200";
  const statusLabel = STATUS_LABEL[s.status] ?? s.status;
  const transport   = s.container?.transport_mode ? TRANSPORT_LABEL[s.container.transport_mode] : null;

  // V-E10: QA/QC inspection for this shipment (latest row).
  // RLS: customer reads own (via cargo_shipments.profile_id = auth.uid()).
  const supabase = await createClient();
  const { data: qaRow } = await supabase
    .from("freight_qa_inspections")
    .select("inspection_no, outcome, damage_level, missing_items, notes, inspected_at")
    .eq("cargo_shipment_id", s.id)
    .order("inspected_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      inspection_no:  string;
      outcome:        "pass" | "fail_minor" | "fail_major" | "waived";
      damage_level:   string | null;
      missing_items:  number;
      notes:          string | null;
      inspected_at:   string;
    }>();

  // U1-7 freshness: most recent scanned_at across all events
  const latestScannedAt = s.events[0]?.scanned_at ?? null;
  const freshness = freshnessClass(latestScannedAt);

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">SHIPMENT</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{s.shipment_code}</h1>
        </div>
        <Link
          href="/shipments"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรายการ
        </Link>
      </div>

      {/* Hero status card */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted">สถานะปัจจุบัน</p>
            <p className="mt-1 text-2xl font-bold">{statusLabel}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge}`}>
              {statusLabel}
            </span>
            {/* U1-7: per-shipment freshness — closes chat L-4 (customer trust). */}
            {latestScannedAt && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${FRESHNESS_PILL[freshness]}`}
                title={`scan ล่าสุด: ${new Date(latestScannedAt).toLocaleString("th-TH")}`}
              >
                🔄 {relativeTimeTh(latestScannedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Stale data hint — explicit nudge per chat audit L-4 */}
        {(freshness === "stale" || freshness === "very-old") && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            ข้อมูลไม่ได้อัพเดทมา {relativeTimeTh(latestScannedAt)} —
            หากต้องการสอบถามสถานะล่าสุด กรุณาติดต่อทีมงาน
          </div>
        )}

        {s.container && (() => {
          const daysToClose = daysUntilIso(s.container.close_at);
          return (
            <>
              <div className="border-t border-border pt-3 grid grid-cols-2 gap-y-2 text-sm">
                <Cell label="ตู้คอนเทนเนอร์" value={s.container.code} mono />
                <Cell label="ประเภทขนส่ง"   value={transport ?? s.container.transport_mode} />
                <Cell label="ต้นทาง" value={s.container.origin} />
                <Cell label="ปลายทาง" value={s.container.destination} />
                {s.container.eta && (
                  <Cell label="ETA" value={new Date(s.container.eta).toLocaleDateString("th-TH")} />
                )}
                {s.container.actual_arrival && (
                  <Cell
                    label="ถึงจริง"
                    value={new Date(s.container.actual_arrival).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  />
                )}
                {s.container.carrier_container_no && (
                  <Cell label="เลขตู้สายเรือ (B/L)" value={s.container.carrier_container_no} mono />
                )}
                {s.cargo_type && isCargoType(s.cargo_type) && (
                  <Cell label="ประเภทสินค้า" value={CARGO_TYPE_LABEL_TH[s.cargo_type]} />
                )}
              </div>
              {/* V-C3: ตัดตู้ visibility for the customer — only show if not yet sealed/closed */}
              {daysToClose != null && daysToClose >= 0 && (
                <div className={`mt-3 rounded-lg border p-3 text-xs ${
                  daysToClose <= 1 ? "border-amber-300 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"
                }`}>
                  ⏰ ตู้จะปิดรับสินค้า (ตัดตู้) วันที่{" "}
                  <span className="font-medium">
                    {new Date(s.container.close_at!).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  {daysToClose === 0 ? <span className="ml-1 font-semibold">— วันนี้</span>
                    : <span className="ml-1 font-semibold">(อีก {daysToClose} วัน)</span>}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Order references */}
      {(s.forwarder_f_no || s.service_order_h_no) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {s.forwarder_f_no && (
            <Link
              href={`/service-import/${s.forwarder_f_no}`}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-700 hover:bg-amber-100"
            >
              ↗ ฝากนำเข้า: <span className="font-mono">{s.forwarder_f_no}</span>
            </Link>
          )}
          {s.service_order_h_no && (
            <Link
              href={`/service-order/${s.service_order_h_no}`}
              className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-blue-700 hover:bg-blue-100"
            >
              ↗ ฝากสั่ง: <span className="font-mono">{s.service_order_h_no}</span>
            </Link>
          )}
        </div>
      )}

      {/* V-E10 QA status panel */}
      {qaRow && (
        <div className={`rounded-2xl border p-5 ${
          qaRow.outcome === "pass"       ? "border-green-200 bg-green-50/40"
          : qaRow.outcome === "fail_minor" ? "border-yellow-200 bg-yellow-50/40"
          : qaRow.outcome === "fail_major" ? "border-red-200 bg-red-50/40"
          :                                 "border-gray-200 bg-gray-50/40"
        }`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-bold">
              {qaRow.outcome === "pass"       && "✅ ผ่านการตรวจคุณภาพแล้ว"}
              {qaRow.outcome === "fail_minor" && "⚠️ ตรวจพบปัญหาเล็กน้อย (ส่งมอบได้)"}
              {qaRow.outcome === "fail_major" && "🚨 ตรวจพบปัญหาสำคัญ"}
              {qaRow.outcome === "waived"     && "ℹ️ ยกเว้นการตรวจ"}
            </h3>
            <span className="text-[10px] font-mono text-muted">{qaRow.inspection_no}</span>
          </div>
          <p className="text-xs text-muted mt-1">
            ตรวจเมื่อ {new Date(qaRow.inspected_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
          </p>
          {qaRow.damage_level && qaRow.damage_level !== "none" && (
            <p className="text-xs mt-2">ระดับความเสียหาย: <strong>{qaRow.damage_level}</strong></p>
          )}
          {qaRow.missing_items > 0 && (
            <p className="text-xs mt-1">ของขาด: <strong>{qaRow.missing_items}</strong> ชิ้น</p>
          )}
          {qaRow.notes && (
            <p className="text-xs mt-2 whitespace-pre-line">{qaRow.notes}</p>
          )}
          {qaRow.outcome === "fail_major" && (
            <p className="text-xs mt-3 text-red-700">
              📞 กรุณาติดต่อทีมงาน — LINE @pacred เพื่อหารือเกี่ยวกับการรับสินค้า
            </p>
          )}
        </div>
      )}

      {/* Shipment metrics */}
      {(s.box_count || s.weight_kg || s.volume_cbm) && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">รายละเอียด</h3>

          {/* U1-5: received/expected progress — "ได้รับแล้ว 40 / 85 กล่อง" */}
          {s.box_count != null && s.box_count > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted">ได้รับแล้ว</span>
                <span className="font-medium">
                  <span className="font-mono">{s.received_box_count}</span>
                  {" / "}
                  <span className="font-mono">{s.box_count}</span>
                  {" กล่อง"}
                  {s.received_box_count >= s.box_count && (
                    <span className="ml-2 text-green-600">✓ ครบ</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-alt overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    s.received_box_count >= s.box_count ? "bg-green-500" : "bg-primary-500"
                  }`}
                  style={{
                    width: `${Math.min(100, (s.received_box_count / s.box_count) * 100)}%`,
                  }}
                />
              </div>
              {s.received_at_partial && s.received_box_count > 0 && s.received_box_count < s.box_count && (
                <p className="text-[10px] text-muted">
                  รับเพิ่มล่าสุด: {relativeTimeTh(s.received_at_partial)}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-sm border-t border-border pt-3">
            {s.weight_kg != null && <Cell label="น้ำหนัก" value={`${Number(s.weight_kg).toFixed(2)} kg`} />}
            {s.volume_cbm != null && <Cell label="ปริมาตร" value={`${Number(s.volume_cbm).toFixed(3)} CBM`} />}
            {s.box_count != null && <Cell label="กล่องคาดรับ" value={`${s.box_count} กล่อง`} />}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="text-sm font-bold mb-3">📍 ไทม์ไลน์การติดตาม</h3>
        {s.events.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีบันทึก scan — ทีมงานจะอัพเดทเมื่อสินค้าถูกประมวลผล</p>
        ) : (
          <ol className="space-y-3 relative before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {s.events.map((e, idx) => (
              <li key={e.id} className="relative pl-6">
                <span
                  className={`absolute left-0 top-1.5 size-3.5 rounded-full border-2 ${
                    idx === 0 ? "bg-primary-500 border-primary-500" : "bg-white dark:bg-surface border-border"
                  }`}
                />
                <p className="text-sm font-medium">{EVENT_LABEL[e.event] ?? e.event}</p>
                <p className="text-xs text-muted mt-0.5">
                  {new Date(e.scanned_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  {e.location && <span> · 📍 {e.location}</span>}
                  {e.source !== "pacred" && <span className="ml-1 text-[10px] uppercase">[{e.source}]</span>}
                </p>
                {e.note && <p className="text-xs text-muted mt-1 italic">📝 {e.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
