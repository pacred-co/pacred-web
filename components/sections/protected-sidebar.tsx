"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutDashboard,
  MapPin,
  Package,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

const STORAGE_KEY = "pacred:sidebar";
const CHANGE_EVENT = "pacred:sidebar-change";
const W_COLLAPSED = "64px";
const W_EXPANDED = "208px";

type IconType = React.ComponentType<{ className?: string }>;

type LinkItem = {
  href: string;
  labelKey: string;
  Icon: IconType;
};

type GroupItem = {
  labelKey: string;
  Icon: IconType;
  children: { href: string; labelKey: string }[];
};

type MenuItem = LinkItem | GroupItem;

function isGroup(item: MenuItem): item is GroupItem {
  return "children" in item;
}

const MENU: MenuItem[] = [
  { href: "/", labelKey: "home", Icon: Home },
  { href: "/dashboard", labelKey: "dashboard", Icon: LayoutDashboard },
  {
    labelKey: "serviceOrder",
    Icon: ShoppingCart,
    children: [
      { href: "/service-order", labelKey: "serviceOrderAll" },
      { href: "/service-order/pending", labelKey: "serviceOrderPending" },
      { href: "/service-order/cart", labelKey: "serviceOrderCart" },
      { href: "/service-order/add", labelKey: "serviceOrderAdd" },
    ],
  },
  {
    labelKey: "serviceImport",
    Icon: Package,
    children: [
      { href: "/service-import", labelKey: "serviceImportAll" },
      { href: "/service-import/pending", labelKey: "serviceImportPending" },
      { href: "/service-import/receipts", labelKey: "serviceImportReceipts" },
      { href: "/service-import/add", labelKey: "serviceImportAdd" },
    ],
  },
  {
    labelKey: "servicePayment",
    Icon: Banknote,
    children: [
      { href: "/service-payment", labelKey: "servicePaymentMain" },
      { href: "/service-payment/add", labelKey: "servicePaymentAdd" },
    ],
  },
  {
    labelKey: "wallet",
    Icon: Wallet,
    children: [
      { href: "/wallet/history", labelKey: "walletHistory" },
      { href: "/wallet/withdraw", labelKey: "walletWithdraw" },
      { href: "/wallet/deposit", labelKey: "walletDeposit" },
    ],
  },
  { href: "/addresses", labelKey: "addresses", Icon: MapPin },
];

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === "expanded";
}

function getServerSnapshot() {
  return false;
}

type LinkHref = Parameters<typeof Link>[0]["href"];

export function ProtectedSidebar() {
  const t = useTranslations("sidebar");
  const pathname = usePathname();
  const expanded = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-w",
      expanded ? W_EXPANDED : W_COLLAPSED,
    );
  }, [expanded]);

  function toggleSidebar() {
    const next = !expanded;
    localStorage.setItem(STORAGE_KEY, next ? "expanded" : "collapsed");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function isGroupActive(group: GroupItem) {
    return group.children.some((c) => isActive(c.href));
  }

  return (
    <aside
      className={`fixed left-0 top-16 bottom-0 z-40 hidden lg:flex flex-col border-r border-border bg-white dark:bg-surface shadow-[4px_0_16px_rgba(0,0,0,0.04)] transition-[width] duration-200 ${
        expanded ? "w-52" : "w-16"
      }`}
    >
      <nav className="flex flex-1 flex-col gap-1 p-2 overflow-y-auto">
        {MENU.map((item) => {
          if (!isGroup(item)) {
            const active = isActive(item.href);
            return (
              <Link
                key={item.labelKey}
                href={item.href as LinkHref}
                title={expanded ? undefined : t(item.labelKey)}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                  active
                    ? "bg-primary-500 text-white"
                    : "text-foreground hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600"
                }`}
              >
                <item.Icon className="h-5 w-5 shrink-0" />
                {expanded && <span className="truncate">{t(item.labelKey)}</span>}
              </Link>
            );
          }

          // Group
          const groupActive = isGroupActive(item);

          // Collapsed: icon links to first child (primary entry point)
          if (!expanded) {
            return (
              <Link
                key={item.labelKey}
                href={item.children[0].href as LinkHref}
                title={t(item.labelKey)}
                className={`flex h-11 items-center justify-center rounded-lg text-sm font-medium transition ${
                  groupActive
                    ? "bg-primary-500 text-white"
                    : "text-foreground hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600"
                }`}
              >
                <item.Icon className="h-5 w-5 shrink-0" />
              </Link>
            );
          }

          // Expanded: toggle button + nested children
          const open = !!openGroups[item.labelKey] || groupActive;
          return (
            <div key={item.labelKey} className="flex flex-col">
              <button
                type="button"
                onClick={() => toggleGroup(item.labelKey)}
                aria-expanded={open}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                  groupActive
                    ? "text-primary-600"
                    : "text-foreground hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600"
                }`}
              >
                <item.Icon className="h-5 w-5 shrink-0" />
                <span className="truncate flex-1 text-left">
                  {t(item.labelKey)}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>

              {open && (
                <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                  {item.children.map((child) => {
                    const childActive = isActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href as LinkHref}
                        className={`flex h-9 items-center rounded-md px-2.5 text-[13px] transition ${
                          childActive
                            ? "bg-primary-500 text-white font-medium"
                            : "text-muted hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600"
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

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={expanded ? t("collapse") : t("expand")}
        title={expanded ? t("collapse") : t("expand")}
        className="flex h-12 items-center justify-center border-t border-border text-muted transition hover:bg-surface dark:hover:bg-surface-alt hover:text-primary-600"
      >
        {expanded ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
