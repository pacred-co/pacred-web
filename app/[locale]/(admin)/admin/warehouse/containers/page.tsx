import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listContainers, type ContainerStatus } from "@/lib/warehouse";
import { NewContainerForm } from "./new-container-form";

/**
 * /admin/warehouse/containers — list view (T-P2 / CT-4).
 *
 * Server component renders the filtered table; create-form is a client
 * component to handle inline submit + state. Per ADR-0005 K-7 + 0033
 * spec, gated to ['super','ops','warehouse'] roles.
 *
 * NOTE: Distinct from the legacy `/admin/containers` page which surfaces
 * the 0016 phase-H container_no/vessel/carrier columns. This new page
 * uses the 0033 spine columns (code/transport_mode/origin/destination/
 * source). Both views read the same `containers` table — the rows
 * coexist via the union CHECK constraint added in `bf7acf8`.
 */

const STATUS_BADGE: Record<string, string> = {
  // 0033 spine
  packing:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  sealed:     "bg-blue-50 text-blue-700 border-blue-200",
  in_transit: "bg-amber-50 text-amber-700 border-amber-200",
  arrived:    "bg-purple-50 text-purple-700 border-purple-200",
  unloading:  "bg-purple-50 text-purple-700 border-purple-200",
  closed:     "bg-green-50 text-green-700 border-green-200",
  // 0016 legacy fallthrough
  preparing:        "bg-yellow-50 text-yellow-700 border-yellow-200",
  arrived_port:     "bg-purple-50 text-purple-700 border-purple-200",
  cleared_customs:  "bg-purple-50 text-purple-700 border-purple-200",
  delivered:        "bg-green-50 text-green-700 border-green-200",
  cancelled:        "bg-gray-50 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  packing:    "กำลังบรรจุ",
  sealed:     "ปิดตู้แล้ว",
  in_transit: "กำลังเดินทาง",
  arrived:    "ถึงปลายทาง",
  unloading:  "กำลังขนลง",
  closed:     "ปิดงานแล้ว",
  preparing:        "เตรียมการ (legacy)",
  arrived_port:     "ถึงท่า (legacy)",
  cleared_customs:  "ผ่านศุลกากร (legacy)",
  delivered:        "ส่งมอบแล้ว (legacy)",
  cancelled:        "ยกเลิก",
};
const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ",
  sea:   "🚢 เรือ",
  air:   "✈️ เครื่องบิน",
};

type SP = { status?: string; mode?: string; q?: string };

export default async function AdminWarehouseContainersPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops", "warehouse"]);

  const sp     = await searchParams;
  const admin  = createAdminClient();
  const result = await listContainers(admin, {
    status:        (sp.status || undefined) as ContainerStatus | undefined,
    transportMode: sp.mode,
    codeContains:  sp.q,
    limit:         200,
  });

  const containers = result.ok ? result.data : [];
  const error      = result.ok ? null : result.error;

  // Pre-aggregate shipment counts per container (single IN-query).
  const ids = containers.map((c) => c.id);
  const shipmentCountByContainer = new Map<string, number>();
  if (ids.length > 0) {
    const { data } = await admin
      .from("cargo_shipments")
      .select("cargo_container_id")
      .in("cargo_container_id", ids);
    type Row = { cargo_container_id: string };
    for (const r of (data ?? []) as Row[]) {
      shipmentCountByContainer.set(r.cargo_container_id, (shipmentCountByContainer.get(r.cargo_container_id) ?? 0) + 1);
    }
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · WAREHOUSE</p>
          <h1 className="mt-1 text-2xl font-bold">ตู้คอนเทนเนอร์ (Spine)</h1>
          <p className="mt-1 text-sm text-muted">
            ตู้ + shipments ของลูกค้าหลายคนที่อยู่ในตู้เดียวกัน — กดที่รหัสตู้เพื่อดูรายละเอียด + เพิ่มสแกน
          </p>
        </div>
        <NewContainerForm />
      </div>

      {/* Filter chips */}
      <FilterChips currentStatus={sp.status} currentMode={sp.mode} currentQ={sp.q} />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {containers.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีตู้ที่ตรงกับ filter</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">รหัสตู้</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">เส้นทาง</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">Shipments</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก / CBM</th>
                  <th className="px-4 py-3">ETA</th>
                  <th className="px-4 py-3">แหล่ง</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((c) => {
                  const statusBadge = STATUS_BADGE[c.status] ?? "bg-gray-50 text-gray-600 border-gray-200";
                  const statusLabel = STATUS_LABEL[c.status] ?? c.status;
                  const transport   = c.transport_mode ? TRANSPORT_LABEL[c.transport_mode] : "—";
                  const shipCount   = shipmentCountByContainer.get(c.id) ?? 0;

                  return (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 font-mono text-xs">
                        {c.code ? (
                          <Link href={`/admin/warehouse/containers/${c.code}`} className="text-primary-600 hover:underline">
                            {c.code}
                          </Link>
                        ) : (
                          <span className="text-muted">— (no code)</span>
                        )}
                        {c.carrier_container_no && (
                          <p className="text-[10px] text-muted mt-0.5">B/L: {c.carrier_container_no}</p>
                        )}
                        <p className="text-[10px] text-muted mt-0.5">{c.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{transport}</td>
                      <td className="px-4 py-3 text-xs">
                        {c.origin ?? "—"} → {c.destination ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        <span className="font-mono">{shipCount}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-mono">
                        {Number(c.total_weight_kg).toFixed(1)} kg
                        <p className="text-[10px] text-muted">{Number(c.total_cbm).toFixed(2)} CBM</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.eta ? new Date(c.eta).toLocaleDateString("th-TH") : "—"}
                      </td>
                      <td className="px-4 py-3 text-[10px] uppercase text-muted">{c.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function FilterChips({ currentStatus, currentMode, currentQ }: { currentStatus?: string; currentMode?: string; currentQ?: string }) {
  const buildHref = (overrides: Partial<SP>) => {
    const params = new URLSearchParams();
    const merged = { status: currentStatus, mode: currentMode, q: currentQ, ...overrides };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const qs = params.toString();
    return `/admin/warehouse/containers${qs ? "?" + qs : ""}`;
  };

  return (
    <div className="flex flex-wrap gap-2 items-center text-xs">
      <span className="text-muted font-medium">สถานะ:</span>
      <Chip active={!currentStatus} href={buildHref({ status: undefined })}>ทั้งหมด</Chip>
      {(["packing", "sealed", "in_transit", "arrived", "unloading", "closed"] as const).map((s) => (
        <Chip key={s} active={currentStatus === s} href={buildHref({ status: s })}>
          {STATUS_LABEL[s]}
        </Chip>
      ))}
      <span className="text-muted font-medium ml-2">ขนส่ง:</span>
      <Chip active={!currentMode} href={buildHref({ mode: undefined })}>ทุก mode</Chip>
      {(["truck", "sea", "air"] as const).map((m) => (
        <Chip key={m} active={currentMode === m} href={buildHref({ mode: m })}>
          {TRANSPORT_LABEL[m]}
        </Chip>
      ))}
    </div>
  );
}

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-2.5 py-1 ${
        active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
      }`}
    >
      {children}
    </Link>
  );
}
