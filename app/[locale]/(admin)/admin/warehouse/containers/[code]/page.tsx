import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getContainerByCode,
  listShipmentsByContainer,
  latestEventsByShipments,
} from "@/lib/warehouse";
import { ContainerStatusForm } from "./status-form";
import { ScanEventForm } from "./scan-form";

/**
 * /admin/warehouse/containers/[code] — detail view (T-P2 / CT-4).
 *
 * Shows the container's spine fields + the customer list inside (each
 * shipment row links back to the parent forwarder/service-order +
 * exposes per-shipment scan event recorder).
 *
 * RBAC: ['super','ops','warehouse']. Status changes go through
 * `actions/admin/warehouse.ts::adminSetContainerStatus` which logs
 * container_status_history; scans go through adminAddTrackingEvent.
 */

const STATUS_LABEL: Record<string, string> = {
  packing:    "กำลังบรรจุ",
  sealed:     "ปิดตู้แล้ว",
  in_transit: "กำลังเดินทาง",
  arrived:    "ถึงปลายทาง",
  unloading:  "กำลังขนลง",
  closed:     "ปิดงาน",
  preparing:        "เตรียมการ (legacy)",
  arrived_port:     "ถึงท่า (legacy)",
  cleared_customs:  "ผ่านศุลกากร (legacy)",
  delivered:        "ส่งมอบแล้ว (legacy)",
  cancelled:        "ยกเลิก",
};
const STATUS_BADGE: Record<string, string> = {
  packing:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  sealed:     "bg-blue-50 text-blue-700 border-blue-200",
  in_transit: "bg-amber-50 text-amber-700 border-amber-200",
  arrived:    "bg-purple-50 text-purple-700 border-purple-200",
  unloading:  "bg-purple-50 text-purple-700 border-purple-200",
  closed:     "bg-green-50 text-green-700 border-green-200",
  preparing:        "bg-yellow-50 text-yellow-700 border-yellow-200",
  arrived_port:     "bg-purple-50 text-purple-700 border-purple-200",
  cleared_customs:  "bg-purple-50 text-purple-700 border-purple-200",
  delivered:        "bg-green-50 text-green-700 border-green-200",
  cancelled:        "bg-gray-50 text-gray-600 border-gray-200",
};
const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  received_cn:         "รับเข้าโกดังจีน",
  packed_cn:           "บรรจุแล้ว (จีน)",
  sealed_in_container: "ปิดตู้แล้ว (จีน)",
  in_transit:          "กำลังเดินทาง",
  arrived_th:          "ถึงไทยแล้ว",
  unloaded:            "ลงจากตู้ (ไทย)",
  out_for_delivery:    "กำลังจัดส่ง",
  delivered:           "ส่งสำเร็จ",
};
const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ",
  sea:   "🚢 เรือ",
  air:   "✈️ เครื่องบิน",
};

export default async function AdminContainerDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireAdmin(["super", "ops", "warehouse"]);

  const { code } = await params;
  const admin = createAdminClient();

  const containerRes = await getContainerByCode(admin, code);
  if (!containerRes.ok) {
    return (
      <main className="p-6 lg:p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          โหลดข้อมูลตู้ไม่สำเร็จ: {containerRes.error}
        </div>
      </main>
    );
  }
  if (!containerRes.data) notFound();
  const container = containerRes.data;

  // Shipments inside + their parent customer profile + latest tracking event
  const shipmentsRes = await listShipmentsByContainer(admin, container.id);
  const shipments    = shipmentsRes.ok ? shipmentsRes.data : [];

  // Customer profiles for the shipments — one IN-query
  const profileIds = Array.from(new Set(shipments.map((s) => s.profile_id)));
  const profileById = new Map<string, { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null }>();
  if (profileIds.length > 0) {
    const { data } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, phone")
      .in("id", profileIds);
    type P = { id: string; member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null };
    for (const p of (data ?? []) as P[]) profileById.set(p.id, p);
  }

  // Latest tracking event per shipment
  const eventsRes  = await latestEventsByShipments(admin, shipments.map((s) => s.id));
  const latestByShip = eventsRes.ok ? eventsRes.data : new Map();

  // Container status history (full audit trail)
  const { data: historyRaw } = await admin
    .from("cargo_container_status_history")
    .select("id, from_status, to_status, note, changed_at, source")
    .eq("cargo_container_id", container.id)
    .order("changed_at", { ascending: false })
    .limit(20);
  type H = { id: string; from_status: string | null; to_status: string; note: string | null; changed_at: string; source: string };
  const history = (historyRaw ?? []) as H[];

  const statusBadge = STATUS_BADGE[container.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const statusLabel = STATUS_LABEL[container.status] ?? container.status;
  const transport   = container.transport_mode ? TRANSPORT_LABEL[container.transport_mode] : "—";

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · WAREHOUSE</p>
          <h1 className="mt-1 text-2xl font-bold font-mono">{container.code ?? "(no code)"}</h1>
          <p className="mt-1 text-sm text-muted">
            {container.origin ?? "—"} → {container.destination ?? "—"} · {transport}
          </p>
        </div>
        <Link
          href="/admin/warehouse/containers"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรายการ
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          {/* Overview */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-muted">สถานะปัจจุบัน</p>
                <p className="mt-1 text-2xl font-bold">{statusLabel}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge}`}>
                {statusLabel}
              </span>
            </div>
            <div className="border-t border-border pt-3 grid grid-cols-2 sm:grid-cols-4 gap-y-2 text-sm">
              <Cell label="Shipments" value={String(shipments.length)} />
              <Cell label="กล่องรวม" value={String(container.total_boxes)} />
              <Cell label="น้ำหนักรวม" value={`${Number(container.total_weight_kg).toFixed(2)} kg`} />
              <Cell label="ปริมาตรรวม" value={`${Number(container.total_cbm).toFixed(3)} CBM`} />
              {container.eta && (
                <Cell label="ETA" value={new Date(container.eta).toLocaleDateString("th-TH")} />
              )}
              {container.actual_arrival && (
                <Cell label="ถึงจริง" value={new Date(container.actual_arrival).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })} />
              )}
              <Cell label="แหล่ง" value={container.source} />
            </div>
          </div>

          {/* Shipments list — each row has scan recorder */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-bold text-sm">📦 Shipments ในตู้นี้ ({shipments.length})</h2>
            </div>
            {shipments.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted">
                ยังไม่มี shipment อยู่ในตู้นี้ — ใช้หน้าแยก attach shipment (CT future) หรือเข้า DB ตรง
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {shipments.map((s) => {
                  const profile = profileById.get(s.profile_id);
                  const customerName = profile
                    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—"
                    : "(profile not found)";
                  const latest = latestByShip.get(s.id);
                  return (
                    <li key={s.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-sm">{s.shipment_code}</p>
                          <p className="text-xs text-muted">
                            {customerName}
                            {profile?.member_code && <span className="ml-2 font-mono">{profile.member_code}</span>}
                            {profile?.phone && <span> · ☎ {profile.phone}</span>}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                            {s.forwarder_f_no && (
                              <Link
                                href={`/admin/forwarders/${s.forwarder_f_no}`}
                                className="rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 hover:bg-amber-100"
                              >
                                ↗ ฝากนำเข้า: <span className="font-mono">{s.forwarder_f_no}</span>
                              </Link>
                            )}
                            {s.service_order_h_no && (
                              <Link
                                href={`/admin/service-orders/${s.service_order_h_no}`}
                                className="rounded bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 hover:bg-blue-100"
                              >
                                ↗ ฝากสั่ง: <span className="font-mono">{s.service_order_h_no}</span>
                              </Link>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <span className="rounded-full border bg-surface-alt px-2 py-0.5 text-[11px]">
                            {SHIPMENT_STATUS_LABEL[s.status] ?? s.status}
                          </span>
                          <p className="text-muted mt-1">
                            {s.box_count} กล่อง · {Number(s.weight_kg ?? 0).toFixed(1)} kg
                          </p>
                        </div>
                      </div>
                      {latest && (
                        <p className="text-[11px] text-muted bg-surface-alt rounded px-2 py-1">
                          📍 last scan: <span className="font-medium">{latest.event}</span>
                          {latest.location && <> · {latest.location}</>}
                          <> · {new Date(latest.scanned_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</>
                        </p>
                      )}
                      <ScanEventForm shipmentId={s.id} shipmentCode={s.shipment_code} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Status history audit */}
          {history.length > 0 && (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-bold text-sm">📜 ประวัติเปลี่ยนสถานะ</h2>
              </div>
              <ul className="divide-y divide-border text-xs">
                {history.map((h) => (
                  <li key={h.id} className="px-5 py-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p>
                        {h.from_status ?? "—"} → <span className="font-medium">{STATUS_LABEL[h.to_status] ?? h.to_status}</span>
                      </p>
                      {h.note && <p className="text-muted mt-0.5 italic">📝 {h.note}</p>}
                    </div>
                    <p className="text-muted shrink-0 text-right">
                      {new Date(h.changed_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                      <span className="block text-[10px] uppercase">[{h.source}]</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <ContainerStatusForm containerId={container.id} currentStatus={container.status} />
        </aside>
      </div>
    </main>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium font-mono">{value}</p>
    </div>
  );
}
