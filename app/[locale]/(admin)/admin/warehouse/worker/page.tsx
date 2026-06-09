/**
 * /admin/warehouse/worker — China-warehouse worker-app DASHBOARD (W10 · Theme 7 P1).
 *
 * The home screen of the warehouse worker app: today's intake queue at a
 * glance + quick links to the 5 work views (intake · measure · sacks ·
 * shipping/transit · follow-product). READ-ONLY here — the work happens in
 * the sub-views.
 *
 * Reference: docs/research/cargothai-warehouse-ops-blueprint-2026-06-01.md
 * (the 7-view worker app). Reads the cargo spine (tb_forwarder) + the
 * isolated warehouse_intake_log / warehouse_sack audit tables.
 *
 * 🔒 Role-gated: super / warehouse / ops / manager. WHO gets the `warehouse`
 * role is the China-team RBAC sign-off (owner-blocked) — the code is built,
 * the role grant is the gate.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadWarehouseDashboard } from "@/lib/warehouse/worker-queries";
import { legacyForwarderStatusThai } from "@/lib/legacy-status-map";
import { ScanLine, Calculator, Boxes, Truck, PackageSearch, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const STEP_LABEL: Record<string, string> = {
  intake: "รับเข้าโกดังจีน",
  measure: "ชั่ง/วัด",
  sack: "เข้ากระสอบ",
  unsack: "ออกจากกระสอบ",
  assign_container: "ใส่ตู้",
  depart: "ออกจากจีน",
  arrive: "ถึงไทย",
  status_override: "แก้สถานะ",
  print_label: "พิมพ์ป้าย",
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default async function WarehouseWorkerDashboard() {
  await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const d = await loadWarehouseDashboard();

  const cards = [
    { href: "/admin/warehouse/worker/intake",  icon: ScanLine,     label: "รับสินค้าเข้าโกดัง", desc: "สแกน tracking → ยืนยันรับเข้าโกดังจีน", accent: "border-blue-200 bg-blue-50/50 text-blue-800" },
    { href: "/admin/warehouse/worker/measure", icon: Calculator,   label: "ชั่ง / วัดขนาด",     desc: "บันทึกน้ำหนัก + กว้าง×ยาว×สูง → คำนวณ CBM", accent: "border-emerald-200 bg-emerald-50/50 text-emerald-800" },
    { href: "/admin/warehouse/worker/sacks",   icon: Boxes,        label: "งานกระสอบ",          desc: "สร้างกระสอบ + จัดของลงกระสอบ + ซีล", accent: "border-amber-200 bg-amber-50/50 text-amber-800" },
    { href: "/admin/warehouse/worker/shipping",icon: Truck,        label: "ใส่ตู้ / ออกของ",     desc: "ใส่ตู้คอนเทนเนอร์ + ออกจากจีน → ถึงไทย", accent: "border-purple-200 bg-purple-50/50 text-purple-800" },
    { href: "/admin/warehouse/worker/follow",  icon: PackageSearch,label: "ติดตามสินค้า",       desc: "ไทม์ไลน์งานต่อรายการ (no phone call)", accent: "border-cyan-200 bg-cyan-50/50 text-cyan-800" },
  ];

  const stats = [
    { label: "รอเข้าโกดังจีน", value: d.awaitingArrival, status: "1" },
    { label: "ถึงโกดังจีน", value: d.atWarehouse, status: "2" },
    { label: "กำลังส่งมาไทย", value: d.inTransit, status: "3" },
    { label: "ถึงไทยแล้ว", value: d.arrivedTh, status: "4" },
  ];

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">โกดังจีน — แอปพนักงานคลัง</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          รับของ · ชั่ง/วัด · เข้ากระสอบ · ใส่ตู้ · ติดตาม — เรียลไทม์ ไม่ต้องโทรถาม
        </p>
      </header>

      {/* Today snapshot */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((s) => (
          <div key={s.status} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <div className="text-2xl font-semibold text-gray-900">{s.value.toLocaleString("th-TH")}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="text-2xl font-semibold text-blue-700">{d.intakedToday.toLocaleString("th-TH")}</div>
          <div className="text-xs text-gray-500 mt-0.5">รับเข้าวันนี้</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="text-2xl font-semibold text-amber-700">{d.openSacks.toLocaleString("th-TH")}</div>
          <div className="text-xs text-gray-500 mt-0.5">กระสอบที่ยังไม่ซีล</div>
        </div>
      </section>

      {/* Work views */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className={`rounded-xl border p-4 transition hover:shadow-sm ${c.accent}`}
            >
              <Icon className="w-6 h-6 mb-2" />
              <div className="font-medium">{c.label}</div>
              <div className="text-xs opacity-80 mt-0.5">{c.desc}</div>
            </Link>
          );
        })}
      </section>

      {/* Recent activity */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-700">กิจกรรมล่าสุด</h2>
        </div>
        {d.recentEvents.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">ยังไม่มีกิจกรรมในแอปคลัง</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {d.recentEvents.map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 shrink-0">
                    {STEP_LABEL[e.step] ?? e.step}
                  </span>
                  <Link href={`/admin/forwarders/${e.fid}`} className="text-blue-600 hover:underline shrink-0">
                    #{e.fid}
                  </Link>
                  {e.fstatus_to && (
                    <span className="text-gray-500 truncate">
                      → {legacyForwarderStatusThai(e.fstatus_to)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">{fmtTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-gray-400">
        🔒 สิทธิ์การใช้งานขึ้นกับบทบาท (warehouse) — รอการมอบหมายจากทีมจีน/ผู้ดูแลระบบ
      </p>
    </main>
  );
}
