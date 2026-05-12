"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, Coins, Wallet, Users,
  BadgePercent, Settings as SettingsIcon, Languages, Menu, X,
} from "lucide-react";
import type { AdminRole } from "@/lib/auth/require-admin";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: AdminRole[];   // required role(s); empty = any admin
};

const items: NavItem[] = [
  { href: "/admin",                  label: "ภาพรวม",          icon: <LayoutDashboard className="w-5 h-5" /> },
  { href: "/admin/forwarders",       label: "ฝากนำเข้า",       icon: <Package className="w-5 h-5" />,         roles: ["ops"] },
  { href: "/admin/service-orders",   label: "ฝากสั่ง",          icon: <ShoppingCart className="w-5 h-5" />,    roles: ["ops"] },
  { href: "/admin/yuan-payments",    label: "ฝากโอนหยวน",      icon: <Languages className="w-5 h-5" />,       roles: ["accounting"] },
  { href: "/admin/wallet",           label: "กระเป๋าเงิน",     icon: <Wallet className="w-5 h-5" />,          roles: ["accounting"] },
  { href: "/admin/sales-payouts",    label: "เบิกค่าคอม",      icon: <BadgePercent className="w-5 h-5" />,    roles: ["accounting","sales_admin"] },
  { href: "/admin/customers",        label: "ลูกค้า",          icon: <Users className="w-5 h-5" /> },
  { href: "/admin/team-leaders",     label: "ทีมขาย",          icon: <Coins className="w-5 h-5" />,           roles: ["sales_admin"] },
  { href: "/admin/containers",       label: "รายการตู้",       icon: <Package className="w-5 h-5" />,         roles: ["ops"] },
  { href: "/admin/barcode",          label: "บาร์โค้ด",         icon: <ShoppingCart className="w-5 h-5" />,    roles: ["ops"] },
  { href: "/admin/admins",           label: "จัดการ admin",   icon: <Users className="w-5 h-5" />,           roles: ["super"] },
  { href: "/admin/settings",         label: "ตั้งค่าระบบ",     icon: <SettingsIcon className="w-5 h-5" />,    roles: ["super"] },
];

export function AdminSidebar({ roles }: { roles: AdminRole[] }) {
  const pathname = usePathname();
  const [openMobile, setOpenMobile] = useState(false);

  const visibleItems = items.filter(
    (it) => !it.roles || roles.includes("super") || it.roles.some((r) => roles.includes(r)),
  );

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin" || pathname?.endsWith("/admin");
    return pathname?.includes(href);
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpenMobile((v) => !v)}
        className="lg:hidden fixed top-3 left-3 z-[60] inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-500 text-white shadow-lg"
        aria-label="Menu"
      >
        {openMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#1a0000] text-white flex flex-col transition-transform lg:translate-x-0 ${
          openMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="px-5 py-5 border-b border-white/10">
          <p className="text-xs uppercase tracking-widest text-white/50">Pacred</p>
          <h2 className="text-lg font-bold">Admin</h2>
          <p className="mt-1 text-[10px] text-white/40">{roles.join(" · ")}</p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleItems.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpenMobile(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-primary-600 text-white font-semibold" : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {it.icon}
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-white/10 space-y-1">
          <Link
            href="/dashboard"
            onClick={() => setOpenMobile(false)}
            className="block rounded-lg px-3 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          >
            ← กลับฝั่งลูกค้า
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {openMobile && (
        <div
          onClick={() => setOpenMobile(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
        />
      )}
    </>
  );
}
