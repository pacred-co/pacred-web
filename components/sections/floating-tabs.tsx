"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LineIcon } from "@/components/icons/social-icons";

// Sales reps' direct phones — kept in sync with SALES_CARDS_DATA in lib/booking-data.ts.
// (lib/ is outside ปอน's scope, so the digits are mirrored here for the mobile FAB.)
const SALES_PHONES = ["0660901217", "0661253007", "024213325"];

function callRandomSalesRep() {
  const num = SALES_PHONES[Math.floor(Math.random() * SALES_PHONES.length)];
  window.location.href = `tel:${num}`;
}

export function FloatingTabs() {
  const t = useTranslations("floatingTabs");
  const [active, setActive] = useState<number | null>(null);
  const pathname = usePathname();

  // Don't render in admin back-office — admin gets its own dedicated
  // sidebar UI and the customer-facing floating tabs would clutter the
  // workflow. Pattern matches `/admin` AND `/<locale>/admin`.
  // Per ภูม + เดฟ confirm 2026-05-16 evening.
  if (pathname && /^(?:\/[a-z]{2})?\/admin(?:\/|$)/.test(pathname)) {
    return null;
  }

  const desktopTabs = [
    { label: t("home"),       icon: "/images/home/iconfloating/pacred-home-main.png", href: "#home" },
    { label: t("services"),   icon: "/images/home/iconfloating/pcs-shop.png",         href: "#services" },
    { label: t("promotions"), icon: "/images/home/iconfloating/ranka.png",            href: "#promotions" },
    { label: t("blog"),       icon: "/images/home/iconfloating/checklistred.png",     href: "/knowledge" },
    // Per ปอน 2026-05-15: partner tab swapped out for Pacred News.
    { label: t("news"),       icon: "/images/home/iconfloating/pcs-line-notify.png",  href: "/news" },
    { label: t("contact"),    icon: "/images/home/iconfloating/pcs-call-center.png",  href: "#contact" },
  ];

  // Mobile bottom nav drops `news` + `contact` — those slots get a centered call FAB instead.
  const mobileTabs = [
    desktopTabs[0],
    desktopTabs[1],
    desktopTabs[2],
    desktopTabs[3],
  ];

  return (
    <>
      {/* Vertical floating tabs — right center (desktop only) */}
      <div className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-50 flex-col shadow-xl">
        {desktopTabs.map((item, i) => {
          const isAnchor = item.href.startsWith("#");
          const cls = "group w-[64px] xl:w-[72px] py-3 bg-white dark:bg-surface border border-border flex flex-col items-center justify-center gap-1.5 text-[10px] font-medium text-muted hover:text-foreground transition-colors first:rounded-tl-xl last:rounded-bl-xl";
          const inner = (
            <>
              {item.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.icon}
                  alt={item.label}
                  className={`w-7 h-7 object-contain transition-all duration-300 ${
                    active === i
                      ? "grayscale-0 brightness-100 opacity-100"
                      : "grayscale brightness-75 opacity-60 group-hover:grayscale-0 group-hover:brightness-100 group-hover:opacity-100"
                  }`}
                />
              )}
              <span className="text-center leading-tight">{item.label}</span>
            </>
          );
          return isAnchor ? (
            <a key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>

      {/* Bottom navigation bar (mobile only) — 4 tabs + center call FAB */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-surface/95 backdrop-blur-md border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Grid splits 2 tabs | spacer (room for FAB) | 2 tabs — tabs "แหวก" symmetrically around the call button */}
        <div className="grid grid-cols-[1fr_1fr_88px_1fr_1fr]">
          {[
            mobileTabs[0],
            mobileTabs[1],
            null,
            mobileTabs[2],
            mobileTabs[3],
          ].map((item, i) => {
            // The spacer slot — leaves room for the absolutely-positioned call FAB
            if (!item) return <div key="spacer" aria-hidden />;

            // Index in `mobileTabs` (skipping the null spacer) — used for active state
            const tabIndex = i < 2 ? i : i - 1;
            const isAnchor = item.href.startsWith("#");
            const isActive = active === tabIndex;
            const cls = "group flex flex-col items-center justify-center gap-1.5 py-4 transition-colors active:bg-primary-50/60 dark:active:bg-primary-900/20";
            const inner = (
              <>
                {item.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.icon}
                    alt={item.label}
                    className={`w-8 h-8 object-contain transition-all duration-300 ${
                      isActive
                        ? "grayscale-0 brightness-100 opacity-100 scale-110"
                        : "grayscale brightness-75 opacity-75"
                    }`}
                  />
                )}
                <span className={`text-[11.5px] leading-tight font-medium ${
                  isActive ? "text-primary-600 font-bold" : "text-muted"
                }`}>
                  {item.label}
                </span>
              </>
            );
            return isAnchor ? (
              <a key={item.href} href={item.href} onClick={() => setActive(tabIndex)} className={cls}>
                {inner}
              </a>
            ) : (
              <Link key={item.href} href={item.href} onClick={() => setActive(tabIndex)} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>

        {/* Center call FAB — lifts above the bar with a subtle pulsing red aura */}
        <button
          type="button"
          onClick={callRandomSalesRep}
          aria-label={t("callAria")}
          className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[68px] h-[68px] rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-600/35 ring-2 ring-white/40 dark:ring-primary-300/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          {/* Subtle aura — theme-tinted soft halo that pulses in place (no scale, never reaches nav edge) */}
          <span
            aria-hidden
            className="absolute -inset-1 rounded-full bg-primary-500/30 blur-[5px] animate-pulse [animation-duration:1.8s]"
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-primary-200/50 dark:ring-primary-300/40 animate-pulse [animation-duration:1.8s] [animation-delay:0.45s]"
          />
          <Phone className="relative w-6 h-6" strokeWidth={2.4} fill="currentColor" />
        </button>
      </nav>

      {/* Floating LINE bubble — sits above mobile bottom nav */}
      <div className="fixed bottom-[78px] right-3 md:bottom-6 md:right-6 z-[51] flex items-center gap-2 md:gap-3">
        <span className="hidden sm:block rounded-full bg-white dark:bg-surface shadow-md px-4 py-2 text-sm font-medium text-foreground border border-border">
          {t("askMore")}
        </span>
        <a
          href="/line"
          target="_blank"
          rel="noopener noreferrer"
          suppressHydrationWarning
          className="w-[52px] h-[52px] md:w-[70px] md:h-[70px] rounded-full bg-[#06C755] shadow-lg flex items-center justify-center hover:bg-[#05a548] transition-colors shrink-0 text-white"
          aria-label={t("chatAria")}
        >
          <LineIcon className="h-7 w-7 md:h-9 md:w-9" />
        </a>
      </div>
    </>
  );
}
