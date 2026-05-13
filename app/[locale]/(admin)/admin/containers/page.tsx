import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { CreateContainerForm, StatusActions } from "./actions-cell";

const STATUS_BADGE: Record<string, string> = {
  preparing:       "bg-gray-50 text-gray-700 border-gray-200",
  sealed:          "bg-yellow-50 text-yellow-700 border-yellow-200",
  in_transit:      "bg-blue-50 text-blue-700 border-blue-200",
  arrived_port:    "bg-indigo-50 text-indigo-700 border-indigo-200",
  cleared_customs: "bg-purple-50 text-purple-700 border-purple-200",
  delivered:       "bg-green-50 text-green-700 border-green-200",
  cancelled:       "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<string, string> = {
  preparing: "เตรียมตู้", sealed: "ปิดตู้แล้ว", in_transit: "ขนส่งกลางทาง",
  arrived_port: "ถึงท่าไทย", cleared_customs: "ผ่านศุลฯ", delivered: "ส่งมอบ", cancelled: "ยกเลิก",
};

export default async function AdminContainersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("containers")
    .select(`
      id, container_no, vendor_container_id, vessel, carrier,
      origin_warehouse, transport_type, status, eta,
      date_in_transit, date_arrived_port, date_delivered,
      total_weight_kg, total_volume_cbm, note, created_at
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = NonNullable<typeof data>[number];
  const rows = (data ?? []) as Row[];

  // Counts per status
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">🚛 รายการตู้คอนเทนเนอร์</h1>
        <p className="mt-1 text-sm text-muted">ติดตามตู้สินค้าจากจีนถึงไทย — ผูกกับฝากนำเข้า/ฝากสั่งของลูกค้า</p>
      </div>

      {/* Status counters */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_LABEL).map(([k, label]) => (
          <span key={k} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE[k]}`}>
            <span>{label}</span>
            <span className="font-mono">{counts[k] ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ยังไม่มีตู้ — กดเพิ่มทางขวา</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">เลข Pacred</th>
                  <th className="px-4 py-3">Carrier / Vessel</th>
                  <th className="px-4 py-3">ต้นทาง</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">ETA</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 text-xs">
                      <Link
                        href={`/admin/containers/${r.id}` as Parameters<typeof Link>[0]["href"]}
                        className="font-mono font-bold text-primary-600 hover:text-primary-700 hover:underline"
                      >
                        {r.container_no ?? "—"}
                      </Link>
                      {r.vendor_container_id && <div className="text-muted">↳ {r.vendor_container_id}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium">{r.carrier ?? "—"}</div>
                      <div className="text-muted">{r.vessel ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{r.origin_warehouse === "yiwu" ? "อี้อู" : r.origin_warehouse === "other" ? "อื่นๆ" : "กวางโจว"}</td>
                    <td className="px-4 py-3 text-xs">
                      {r.transport_type === "truck" ? "🚚" : r.transport_type === "ship" ? "🚢" : "✈️"} {r.transport_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.eta ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusActions id={r.id} status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <CreateContainerForm />
      </div>
    </main>
  );
}
