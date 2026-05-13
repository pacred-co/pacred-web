"use client";

import { useState } from "react";
import {
  BarChart3,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  FileText,
  LogOut,
  ArrowLeftRight,
  Ship,
  Plane,
  Truck,
  Receipt,
  BadgePercent,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

type IconType = React.ComponentType<{ className?: string }>;

type LinkItem = { href: string; labelKey: string; Icon: IconType };
type GroupItem = {
  labelKey: string;
  Icon: IconType;
  children: { href: string; labelKey: string }[];
};
type SectionItem = { section: string };
type MenuItem = LinkItem | GroupItem | SectionItem;

function isGroup(item: MenuItem): item is GroupItem {
  return "children" in item;
}
function isSection(item: MenuItem): item is SectionItem {
  return "section" in item;
}

const MENU: MenuItem[] = [
  { href: "/admin/dashboard", labelKey: "dashboard", Icon: LayoutDashboard },

  { section: "ลูกค้า" },
  {
    labelKey: "customers",
    Icon: Users,
    children: [
      { href: "/admin/customers", labelKey: "customersList" },
      { href: "/admin/customers/pending", labelKey: "customersPending" },
    ],
  },
  { href: "/admin/wallet", labelKey: "wallet", Icon: Wallet },
  { href: "/admin/withdrawals", labelKey: "withdrawals", Icon: Receipt },

  { section: "Cargo (สินค้าจีน)" },
  {
    labelKey: "shopOrders",
    Icon: ShoppingCart,
    children: [
      { href: "/admin/orders/shop", labelKey: "shopOrdersAll" },
      { href: "/admin/orders/shop/pending", labelKey: "shopOrdersPending" },
    ],
  },
  {
    labelKey: "importOrders",
    Icon: Package,
    children: [
      { href: "/admin/orders/import", labelKey: "importOrdersAll" },
      { href: "/admin/orders/import/pending", labelKey: "importOrdersPending" },
    ],
  },
  { href: "/admin/orders/transfer", labelKey: "transferOrders", Icon: ArrowLeftRight },

  { section: "Freight (ขนส่งสากล)" },
  { href: "/admin/freight/sea", labelKey: "freightSea", Icon: Ship },
  { href: "/admin/freight/air", labelKey: "freightAir", Icon: Plane },
  { href: "/admin/freight/truck", labelKey: "freightTruck", Icon: Truck },

  { section: "บัญชีและรายงาน" },
  { href: "/admin/reports", labelKey: "reports", Icon: BarChart3 },
  { href: "/admin/rates", labelKey: "rates", Icon: BadgePercent },

  { section: "ระบบ" },
  { href: "/admin/inventory", labelKey: "inventory", Icon: Box },
  { href: "/admin/settings", labelKey: "settings", Icon: Settings },
];

type LinkHref = Parameters<typeof Link>[0]["href"];

export function AdminSidebar({ expanded: defaultExpanded = true }: { expanded?: boolean }) {
  const t = useTranslations("admin.sidebar");
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isActive(href: string) {
    if (href === "/admin/dashboard") return pathname === "/admin/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function isGroupActive(group: GroupItem) {
    return group.children.some((c) => isActive(c.href));
  }

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-[width] duration-200 ${
        expanded ? "w-60" : "w-16"
      }`}
      style={{ background: "linear-gradient(180deg, #1a0000 0%, #2d0000 100%)" }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-white/10 px-4 shrink-0">
        {expanded ? (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold text-sm shrink-0">
              P
            </div>
            <div className="leading-tight">
              <div className="text-white font-bold text-sm">Pacred</div>
              <div className="text-primary-300 text-[10px] font-medium tracking-wide uppercase">Admin</div>
            </div>
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white font-bold text-sm mx-auto">
            P
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-2 overflow-y-auto">
        {MENU.map((item, idx) => {
          if (isSection(item)) {
            if (!expanded) return null;
            return (
              <div key={`section-${idx}`} className="mt-3 mb-1 px-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">
                  {item.section}
                </span>
              </div>
            );
          }

          if (!isGroup(item)) {
            const active = isActive(item.href);
            return (
              <Link
                key={item.labelKey}
                href={item.href as LinkHref}
                title={expanded ? undefined : t(item.labelKey)}
                className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary-600 text-white shadow-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
                {expanded && <span className="truncate">{t(item.labelKey)}</span>}
              </Link>
            );
          }

          const groupActive = isGroupActive(item);

          if (!expanded) {
            return (
              <Link
                key={item.labelKey}
                href={item.children[0].href as LinkHref}
                title={t(item.labelKey)}
                className={`flex h-9 items-center justify-center rounded-lg transition-colors ${
                  groupActive
                    ? "bg-primary-600 text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
              </Link>
            );
          }

          const open = !!openGroups[item.labelKey] || groupActive;
          return (
            <div key={item.labelKey} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleGroup(item.labelKey)}
                aria-expanded={open}
                className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                  groupActive ? "text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <item.Icon className="h-4 w-4 shrink-0" />
                <span className="truncate flex-1 text-left">{t(item.labelKey)}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open && (
                <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-2">
                  {item.children.map((child) => {
                    const childActive = isActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href as LinkHref}
                        className={`flex h-8 items-center rounded-md px-2.5 text-[12px] transition-colors ${
                          childActive
                            ? "bg-primary-600 text-white font-medium"
                            : "text-white/50 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{t(child.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-2 shrink-0 space-y-0.5">
        <Link
          href="/"
          className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          title={expanded ? undefined : "ออกจากหน้า Admin"}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {expanded && <span className="truncate">ออกจากหน้า Admin</span>}
        </Link>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "ย่อเมนู" : "ขยายเมนู"}
          className="flex h-9 w-full items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors"
        >
          {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
