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
import { Home, Truck, History, StickyNote, Menu, Phone, ScanLine } from "lucide-react";

type Tab = {
  /** แท็บลิงก์: href + match (pathname ที่ถือว่า active) */
  href?: string;
  match?: string;
  /** แท็บปุ่ม: กดแล้วสั่งงาน (เช่น "เมนู" เปิด sidebar) แทนการนำทาง */
  action?: "openSidebar";
  /** ปุ่มโทร (ปรึกษา) — href = tel:<tel> */
  tel?: string;
  /** ปุ่มกลางเด่น = วงกลมแดงลอยขึ้นเหนือแถบ */
  center?: boolean;
  label: string;
  icon: typeof Home;
  badge?: number;
};

// TODO(owner 2026-07-25): เบอร์ "keetar" (สายปรึกษา/ดิสแพตช์คนขับ) — รอ owner ยืนยันเบอร์จริง
// แล้วแก้ค่านี้ (หรือส่งผ่าน prop consultTel จาก layout). ตอนนี้เป็น placeholder.
const CONSULT_TEL = "0000000000";

export function DriverBottomNav({
  noteBadge,
  todoBadge,
  consultTel,
}: {
  noteBadge?: number;
  todoBadge?: number;
  consultTel?: string;
}) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: "/admin/drivers?view=todo", match: "/admin/drivers", label: "หน้าแรก", icon: Home },
    // badge = จำนวนงานที่ต้องส่ง (รอบเปิดของคนขับคนนี้) · จาก countDriverOpenBatches.
    { href: "/admin/drivers?view=todo", match: "/admin/drivers", label: "ต้องส่ง", icon: Truck, badge: todoBadge },
    { href: "/admin/drivers?view=history", match: "/admin/drivers", label: "ประวัติงาน", icon: History },
    // ปุ่มกลาง "ปรึกษา" = โทรหา keetar (owner 2026-07-25 · เบอร์รอ owner · "เดี๋ยวว่ากันที่เหลือ")
    { tel: consultTel ?? CONSULT_TEL, center: true, label: "ปรึกษา", icon: Phone },
    // "ยิงหาของ" = สแกนบาร์โค้ดหาพัสดุ (owner เลือกมา · /admin/barcode/driver/all)
    { href: "/admin/barcode/driver/all", match: "/admin/barcode/driver", label: "ยิงหาของ", icon: ScanLine },
    { href: "/admin/incidents", match: "/admin/incidents", label: "หมายเหตุ", icon: StickyNote, badge: noteBadge },
    // "เมนู" — เปิด left sidebar ตัวเดียวกับปุ่มแฮมเบอร์เกอร์ (ยิง event ให้ AdminSidebar).
    { action: "openSidebar", label: "เมนู", icon: Menu },
  ];

  return (
    <>
      {/* spacer กันเนื้อหาถูกบังหลังแถบ fixed (มือถือเท่านั้น) — เผื่อ safe-area
          (home-indicator iPhone) ให้เท่ากับความสูง nav จริง ห้ามบังเนื้อหาเด็ดขาด (ปอน 2026-07-24) */}
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] bg-[#f4f5fa] lg:hidden print:hidden" aria-hidden />

      {/* globals.css ตั้ง body{padding-bottom:90px} บนมือถือ เผื่อแถบเมนู "ลูกค้า" —
          หน้า admin (คนขับ) ไม่ต้องการ (spacer ด้านบนจองที่ให้แถบนี้เองแล้ว) ไม่งั้น
          จะเหลือพื้นขาวของ body ~26px โผล่ใต้สุด → เคลียร์ทิ้งเฉพาะตอนแสดงแถบนี้ (ปอน 2026-07-25) */}
      <style>{`@media (max-width:767px){body{padding-bottom:0 !important}}`}</style>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
        <ul className="flex items-stretch">
          {tabs.map((t, i) => {
            const active = !!t.match && (pathname === t.match || pathname.startsWith(`${t.match}/`));
            const Icon = t.icon;

            // ── ปุ่มกลาง "ปรึกษา" = วงกลมแดงลอยขึ้นเหนือแถบ (โทรหา keetar) ──
            if (t.center) {
              return (
                <li key={`center-${i}`} className="flex flex-1 justify-center">
                  <a
                    href={`tel:${t.tel}`}
                    aria-label={`${t.label} (โทร)`}
                    className="flex flex-col items-center justify-end gap-0.5 pb-1.5"
                  >
                    <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#e30613] text-white shadow-lg ring-4 ring-white">
                      <Icon className="h-7 w-7" strokeWidth={2.2} />
                    </span>
                    <span className="text-[10px] font-semibold leading-tight text-[#cc3333]">{t.label}</span>
                  </a>
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
                {t.action === "openSidebar" ? (
                  // ปุ่ม "เมนู" — เปิด left sidebar ตัวเดียวกับปุ่มแฮมเบอร์เกอร์
                  // (ยิง event · AdminSidebar ฟังแล้ว setOpenMobile(true)).
                  <button
                    type="button"
                    aria-label="เปิดเมนู"
                    onClick={() => window.dispatchEvent(new CustomEvent("pacred:open-admin-sidebar"))}
                    className={cls}
                  >
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
    </>
  );
}
