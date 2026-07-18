"use client";

/**
 * Warehouse handheld bottom tab-bar — the fixed 6-item launcher the legacy PCS
 * warehouse-staff home shows on mobile (the blue-circled bar in the owner's
 * photo). Mobile-only (hidden ≥lg where the sidebar takes over). Red icons +
 * red count badges, faithful to the legacy PCS admin chrome.
 *
 * Plain `fixed bottom-0` (no portal needed — the admin RouteFade is opacity-only
 * since 2026-07-18, so no transformed ancestor breaks position:fixed).
 */

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import {
  Home,
  ScanLine,
  Container,
  PackageX,
  Truck,
  Menu,
  X,
  History,
  Warehouse,
  Info,
} from "lucide-react";

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  badge?: number;
};

/** The extra links revealed by the "เมนู" sheet (warehouse-role reachable). */
const MENU_LINKS: { href: string; label: string; icon: typeof Home }[] = [
  { href: "/admin/warehouse/home", label: "หน้าแรก", icon: Home },
  { href: "/admin/drivers", label: "ประวัติการจัดงานรถ", icon: History },
  { href: "/admin/drivers/new", label: "มอบงานคนขับรถ", icon: Truck },
  { href: "/admin/drivers/new?tab=pickup", label: "ส่งงานหน้าโกดัง", icon: Warehouse },
  { href: "/admin/report-cnt", label: "รายงานตู้สินค้า", icon: Container },
  { href: "/admin/forwarders/warehouse-history", label: "ประวัติเข้าโกดังไทย", icon: History },
  { href: "/admin/barcode/driver/import", label: "สแกนบันทึกเข้าโกดัง", icon: ScanLine },
  { href: "/admin/warehouse/worker", label: "โกดังจีน — แอปพนักงานคลัง", icon: Warehouse },
  { href: "/admin/learning?topic=new-system", label: "คำอธิบายระบบ", icon: Info },
];

export function WarehouseBottomNav({
  failedDelivery,
  containers,
}: {
  failedDelivery: number;
  containers: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: "/admin/warehouse/home", label: "หน้าแรก", icon: Home },
    { href: "/admin/barcode/driver/import", label: "สแกนหาสินค้า", icon: ScanLine },
    { href: "/admin/report-cnt", label: "หมายเลขตู้", icon: Container, badge: containers },
    { href: "/admin/drivers", label: "ส่งไปไม่สำเร็จ", icon: PackageX, badge: failedDelivery },
    { href: "/admin/drivers/new", label: "มอบงานรถ", icon: Truck },
  ];

  return (
    <>
      {/* spacer so page content isn't hidden behind the fixed bar (mobile only) */}
      <div className="h-16 lg:hidden" aria-hidden />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)] lg:hidden">
        <ul className="grid grid-cols-6">
          {tabs.map((t) => {
            const active = pathname === t.href || (t.href === "/admin/warehouse/home" && pathname.endsWith("/warehouse/home"));
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-center ${
                    active ? "text-[#cc3333]" : "text-[#cc3333]/85"
                  }`}
                >
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} />
                    {typeof t.badge === "number" && t.badge > 0 && (
                      <span className="absolute -right-2.5 -top-2 min-w-[18px] rounded-full bg-[#ff4961] px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                        {t.badge > 999 ? "999+" : t.badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] leading-tight">{t.label}</span>
                </Link>
              </li>
            );
          })}
          {/* เมนู — opens the full warehouse quick-link sheet */}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[#cc3333]/85"
            >
              <Menu className="h-6 w-6" strokeWidth={1.9} />
              <span className="text-[11px] leading-tight">เมนู</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* เมนู sheet */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white pb-6">
            <div className="flex items-center justify-between border-b border-gray-100 bg-[#cc3333] px-4 py-3 text-white">
              <span className="text-sm font-semibold">เมนูพนักงานโกดัง</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="ปิด">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {MENU_LINKS.map((m) => {
                const Icon = m.icon;
                return (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-gray-800 active:bg-gray-50"
                    >
                      <Icon className="h-5 w-5 text-[#cc3333]" strokeWidth={1.9} />
                      <span>{m.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
