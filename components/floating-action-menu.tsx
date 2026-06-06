"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Home, Wallet, PlusCircle, CreditCard, Truck } from "lucide-react";

/**
 * Bottom floating quick-action bar — visible on mobile only.
 * 5 most common actions: home / wallet / deposit / pay-for-goods /
 * pay-shipping.
 */
export function FloatingActionMenu() {
  const t = useTranslations("floatingActionMenu");
  const pathname = usePathname() ?? "";
  const items = [
    { href: "/dashboard",        label: t("home"),       Icon: Home,        match: ["/dashboard"] },
    { href: "/wallet/history",   label: t("wallet"),     Icon: Wallet,      match: ["/wallet"] },
    { href: "/wallet/deposit",   label: t("deposit"),    Icon: PlusCircle,  match: ["/wallet/deposit"], primary: true },
    { href: "/service-order/pending",   label: t("payGoods"), Icon: CreditCard,  match: ["/service-order"] },
    { href: "/service-import",          label: t("shipping"), Icon: Truck,       match: ["/service-import"] },
  ];

  const isActive = (m: string[]) => m.some((p) => pathname.includes(p));

  // Hide on auth-protected pages where we already have explicit nav
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-surface border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const active = isActive(it.match);
          if (it.primary) {
            return (
              <li key={it.href} className="relative">
                <Link
                  href={it.href}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 -mt-4 mx-auto w-14 h-14 rounded-full bg-primary-500 text-white shadow-lg"
                >
                  <it.Icon className="w-6 h-6" />
                  <span className="text-[9px] font-medium">{it.label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
                  active ? "text-primary-600 font-semibold" : "text-muted hover:text-foreground"
                }`}
              >
                <it.Icon className="w-5 h-5" />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
