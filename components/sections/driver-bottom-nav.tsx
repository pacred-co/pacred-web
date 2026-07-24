"use client";

/**
 * แถบเมนูล่างมือถือ ของ role "คนขับรถ" (ปอน 2026-07-24) — ติดทุกหน้า admin บนมือถือ,
 * ซ่อนที่ ≥lg (sidebar ทำงานแทน). ฝังใน (admin)/layout.tsx โชว์เฉพาะตอนที่ effective
 * role = driver ล้วน (จริง หรือ view-as-driver).
 *
 * ไอคอน/badge แดง แนว legacy PCS · plain `fixed bottom-0` (ไม่ต้อง portal —
 * admin RouteFade เป็น opacity-only ตั้งแต่ 2026-07-18 จึงไม่มี transformed
 * ancestor มาดัก position:fixed). แม่แบบ = components-…/warehouse-bottom-nav.
 *
 * 🔴 ปลายทางแท็บ (ปอน ยืนยันได้): หน้าแรก + งานที่ต้องส่ง ชี้ /admin/drivers?view=todo
 * (หน้าที่ landing เด้งมาอยู่แล้ว) · ประวัติงาน → ?view=history · หมายเหตุ → /admin/incidents
 * (คนขับเข้าได้) · คำอธิบายเมนู → /admin/learning. badge "หมายเหตุ" ยังไม่ wire ตัวเลขจริง.
 */

import { Link, usePathname } from "@/i18n/navigation";
import { Home, Truck, History, StickyNote, Info } from "lucide-react";

type Tab = {
  href: string;
  /** pathname ที่ถือว่าแท็บนี้ active (ตัด query ออก). */
  match: string;
  label: string;
  icon: typeof Home;
  badge?: number;
};

export function DriverBottomNav({ noteBadge }: { noteBadge?: number }) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: "/admin/drivers?view=todo", match: "/admin/drivers", label: "หน้าแรก", icon: Home },
    { href: "/admin/drivers?view=todo", match: "/admin/drivers", label: "งานที่ต้องส่ง", icon: Truck },
    { href: "/admin/drivers?view=history", match: "/admin/drivers", label: "ประวัติงาน", icon: History },
    { href: "/admin/incidents", match: "/admin/incidents", label: "หมายเหตุ", icon: StickyNote, badge: noteBadge },
    { href: "/admin/learning?topic=new-system", match: "/admin/learning", label: "คำอธิบายเมนู", icon: Info },
  ];

  return (
    <>
      {/* spacer กันเนื้อหาถูกบังหลังแถบ fixed (มือถือเท่านั้น) — เผื่อ safe-area
          (home-indicator iPhone) ให้เท่ากับความสูง nav จริง ห้ามบังเนื้อหาเด็ดขาด (ปอน 2026-07-24) */}
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden print:hidden" aria-hidden />

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
        <ul className="grid grid-cols-5">
          {tabs.map((t, i) => {
            const active = pathname === t.match || pathname.startsWith(`${t.match}/`);
            const Icon = t.icon;
            return (
              <li key={`${t.href}-${i}`}>
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
                  <span className="text-[10px] leading-tight">{t.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
