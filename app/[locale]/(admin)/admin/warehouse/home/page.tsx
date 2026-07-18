/**
 * /admin/warehouse/home — the warehouse-employee (โกดังไทย / จ่ายของ) handheld
 * HOME, a faithful port of the legacy PCS warehouse-staff home the owner
 * photographed off the handheld device.
 *
 * Two faithful parts (owner 2026-07-18):
 *   1. Four tappable summary cards (photo 2) — ประวัติการจัดงานรถ · งานส่งของ
 *      ไม่สำเร็จ · มอบงานคนขับรถ · ส่งงานหน้าโกดัง — each a REAL count (§0f) that
 *      links straight into the matching workflow page.
 *   2. A fixed mobile bottom tab-bar (photo 1, blue-circled) — the 6-item
 *      launcher (`warehouse-bottom-nav.tsx`).
 *
 * This is the `warehouse` role's landing (admin/page.tsx bounces warehouse-only
 * staff here). Legacy palette: red #cc3333 · badge-info blue #1e9ff2 · badge-
 * warning orange #ff9149 · badge-success green #28d094.
 *
 * 🔒 Role-gated: super / warehouse / ops / manager (mirror /warehouse/worker).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadWarehouseDispatchHome } from "@/lib/warehouse/dispatch-home";
import { ShoppingCart, PackageX, Truck, Warehouse, History, Info } from "lucide-react";
import { WarehouseBottomNav } from "./warehouse-bottom-nav";
import { HomeTrackingSearch } from "./home-search";
import { HomeLocation } from "./home-location";

export const dynamic = "force-dynamic";

const thNum = (n: number) => n.toLocaleString("th-TH");

export default async function WarehouseHome() {
  await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const d = await loadWarehouseDispatchHome();

  const cards = [
    {
      href: "/admin/drivers",
      label: "ประวัติการจัดงานรถ",
      value: d.batchHistory,
      icon: ShoppingCart,
      accent: "#1e9ff2", // blue
    },
    {
      href: "/admin/drivers",
      label: "งานส่งของไม่สำเร็จ",
      value: d.failedDelivery,
      icon: PackageX,
      accent: "#cc3333", // red
    },
    {
      href: "/admin/drivers/new",
      label: "มอบงานคนขับรถ",
      value: d.assignDriver,
      icon: Truck,
      accent: "#ff9149", // orange
    },
    {
      href: "/admin/drivers/new?tab=pickup",
      label: "ส่งงานหน้าโกดัง",
      value: d.selfPickup,
      icon: Warehouse,
      accent: "#ff9149", // orange
    },
  ];

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <header className="mb-4">
        <p className="text-xs font-semibold tracking-widest text-[#cc3333]">ADMIN · โกดัง</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">หน้าแรกพนักงานโกดัง</h1>
        <p className="mt-0.5 text-sm text-gray-500">สรุปงาน + ทางลัดจ่ายของ (แตะการ์ดเพื่อเข้าหน้านั้น)</p>
      </header>

      {/* 4 summary cards — 2×2 grid, tappable */}
      <section className="grid grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.label}
              href={c.href}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition active:scale-[0.99]"
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl font-bold leading-none" style={{ color: c.accent }}>
                  {thNum(c.value)}
                </span>
                <Icon className="h-6 w-6 shrink-0 text-[#cc3333]" strokeWidth={1.8} />
              </div>
              <span className="mt-2 text-sm font-medium text-gray-700">{c.label}</span>
              <span className="mt-3 block h-1 w-full rounded-full" style={{ backgroundColor: c.accent }} />
            </Link>
          );
        })}
      </section>

      {/* Quick-action pills + location */}
      <section className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/forwarders/warehouse-history"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#1e9ff2] px-4 py-2 text-sm font-medium text-white shadow-sm active:bg-[#1785cf]"
        >
          <History className="h-4 w-4" strokeWidth={2} />
          ไปยังประวัติรายการเข้าโกดัง
        </Link>
        <Link
          href="/admin/learning?topic=new-system"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#28d094] px-4 py-2 text-sm font-medium text-white shadow-sm active:bg-[#22b17f]"
        >
          <Info className="h-4 w-4" strokeWidth={2} />
          คำอธิบายระบบ
        </Link>
      </section>

      {/* Current warehouse zone (fPallet) — worker-set, shared with scan-in */}
      <section className="mt-3">
        <HomeLocation />
      </section>

      {/* Tracking search */}
      <section className="mt-3">
        <HomeTrackingSearch />
      </section>

      {/* Fixed mobile bottom tab-bar (blue-circled in the owner's photo) */}
      <WarehouseBottomNav failedDelivery={d.failedDelivery} containers={d.containers} />
    </main>
  );
}
