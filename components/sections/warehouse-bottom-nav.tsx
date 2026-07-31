"use client";

/**
 * แถบเมนูล่างมือถือ ของ role "พนักงานโกดัง" — ใช้ "รูปแบบเดียวกับของคนขับรถ"
 * (ภูม 2026-07-31 "โกดังกับคนขับคนละแบบ เอาสไตล์คนขับมาใช้"). โครงสร้าง/สปิริต
 * เดียวกับ components-…/driver-bottom-nav: flex + ปุ่มกลางลอยเด่น (วงกลมแดง) +
 * รองรับ safe-area (home-indicator iPhone). ต่างกันแค่ "รายการ/หน้าที่" = ของโกดัง.
 *
 * ปุ่มกลาง = "สแกนหาสินค้า" (งานหลักที่โกดังใช้ทุกวัน) แทนปุ่มโทรของคนขับ.
 *
 * Mobile-only (ซ่อน ≥lg ให้ sidebar ทำงานแทน). plain `fixed bottom-0` (admin
 * RouteFade เป็น opacity-only ตั้งแต่ 2026-07-18 จึงไม่มี transformed ancestor
 * มาดัก position:fixed). ฝังใน (admin)/layout.tsx โชว์เฉพาะตอน effective role
 * = warehouse ล้วน (จริง หรือ view-as-warehouse).
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
  href?: string;
  /** pathname ที่ถือว่า active (ถ้าต่างจาก href) */
  match?: string;
  /** แท็บปุ่ม: กดแล้วเปิดชีท "เมนู" แทนการนำทาง */
  action?: "openMenu";
  /** ปุ่มกลางเด่น = วงกลมแดงลอยขึ้นเหนือแถบ (สแกนหาสินค้า) */
  center?: boolean;
  label: string;
  icon: typeof Home;
  badge?: number;
};

/** ลิงก์ที่ชีท "เมนู" กางออก (role โกดัง เข้าถึงได้). */
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

  // ซ่อนแถบล่างบนหน้า "มอบงานรถ" — หน้านั้นมีแถบดำเนินการล่างของตัวเองอยู่แล้ว
  // (มอบคนขับ / รับเองหน้าโกดัง) → กันซ้อน 2 แถบล่าง (owner 2026-07-30).
  if (pathname === "/admin/drivers/new") return null;

  const tabs: Tab[] = [
    { href: "/admin/warehouse/home", match: "/admin/warehouse/home", label: "หน้าแรก", icon: Home },
    { href: "/admin/report-cnt", match: "/admin/report-cnt", label: "หมายเลขตู้", icon: Container, badge: containers },
    // ปุ่มกลาง = สแกนหาสินค้า (งานหลักโกดัง · แทนปุ่มโทรของคนขับ)
    { href: "/admin/barcode/driver/import", match: "/admin/barcode/driver", center: true, label: "สแกนหาสินค้า", icon: ScanLine },
    { href: "/admin/drivers", match: "/admin/drivers", label: "ส่งไปไม่สำเร็จ", icon: PackageX, badge: failedDelivery },
    { action: "openMenu", label: "เมนู", icon: Menu },
  ];

  return (
    <>
      {/* spacer กันเนื้อหาถูกบังหลังแถบ fixed (มือถือ) + เผื่อ safe-area (เหมือนคนขับ) */}
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] bg-[#f4f5fa] lg:hidden print:hidden" aria-hidden />
      {/* เคลียร์ body padding-bottom (แถบเมนูลูกค้า) บนมือถือ — spacer จองที่ให้แล้ว */}
      <style>{`@media (max-width:767px){body{padding-bottom:0 !important}}`}</style>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
        <ul className="flex items-stretch">
          {tabs.map((t, i) => {
            const active = !!t.match && (pathname === t.match || pathname.startsWith(`${t.match}/`));
            const Icon = t.icon;

            // ── ปุ่มกลาง = วงกลมแดงลอยขึ้นเหนือแถบ (สแกนหาสินค้า) ──
            if (t.center) {
              return (
                <li key={`center-${i}`} className="flex flex-1 justify-center">
                  <Link
                    href={t.href ?? "#"}
                    aria-label={t.label}
                    className="flex flex-col items-center justify-end gap-0.5 pb-1.5"
                  >
                    <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#e30613] text-white shadow-lg ring-4 ring-white">
                      <Icon className="h-7 w-7" strokeWidth={2.2} />
                    </span>
                    <span className="text-[10px] font-semibold leading-tight text-[#cc3333]">{t.label}</span>
                  </Link>
                </li>
              );
            }

            // เนื้อในเหมือนกันทั้งแท็บลิงก์และปุ่ม (ไอคอน + badge + label)
            const inner = (
              <>
                <span className="relative">
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} />
                  {typeof t.badge === "number" && t.badge > 0 && (
                    <span className="absolute -right-2.5 -top-2 min-w-[18px] rounded-full bg-[#ff4961] px-1 text-center text-[11px] font-bold leading-[18px] text-white">
                      {t.badge > 999 ? "999+" : t.badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] leading-tight">{t.label}</span>
              </>
            );
            const cls = `relative flex w-full flex-col items-center justify-center gap-0.5 py-2 text-center ${
              active ? "text-[#cc3333]" : "text-[#cc3333]/85"
            }`;
            return (
              <li key={`${t.href ?? t.action}-${i}`} className="flex-1">
                {t.action === "openMenu" ? (
                  <button type="button" aria-label="เปิดเมนู" onClick={() => setMenuOpen(true)} className={cls}>
                    {inner}
                  </button>
                ) : (
                  <Link href={t.href ?? "#"} className={cls}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* เมนู sheet — ลิงก์โกดังทั้งหมด */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
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
