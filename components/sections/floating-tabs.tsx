"use client";

import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Phone, Menu } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { LineIcon } from "@/components/icons/social-icons";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import { createClient } from "@/lib/supabase/client";
import { trackSignOut } from "@/lib/analytics";

const MOBILE_ICON = {
  home:    "/images/home/iconfloating/pacred-home-main.png",
  blog:    "/images/home/iconfloating/checklistred.png",
  news:    "/images/home/iconfloating/pcs-line-notify.png",
  logout:  "/images/home/iconfloating/pcs-log-out.png", // also used flipped for login
} as const;

// Pacred main office line — single number for mobile FAB (per ปอน 2026-05-22,
// no random sales-rep rotation).
const OFFICE_PHONE = "0661310253";

export function FloatingTabs() {
  const t = useTranslations("floatingTabs");
  const [active, setActive] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const pathname = usePathname();

  // Watch auth state for the mobile login/logout tab — per ปอน 2026-05-18,
  // the right-of-FAB slot flips between "ล็อคอิน" and "ล็อคเอาท์".
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Don't render in admin back-office (admin has its own sidebar) or on the
  // auth flow (login/register/forgot-password) — auth pages are designed to
  // fit one viewport, so the bottom nav + its 64px body-padding clearance
  // both need to go away. Pattern matches `/<route>` AND `/<locale>/<route>`.
  // Per ภูม + เดฟ confirm 2026-05-16 evening; auth-hide per ปอน 2026-05-19.
  const isHidden =
    !!pathname &&
    (/^(?:\/[a-z]{2})?\/admin(?:\/|$)/.test(pathname) ||
      /^(?:\/[a-z]{2})?\/(?:login|register|forgot-password)(?:\/|$)/.test(pathname));

  // Toggle a body class so globals.css can drop the bottom-padding clearance.
  useEffect(() => {
    if (!isHidden) return;
    document.body.classList.add("no-bottom-tabs");
    return () => document.body.classList.remove("no-bottom-tabs");
  }, [isHidden]);

  if (isHidden) return null;

  // Desktop floating tabs mirror the mobile bottom-nav set MINUS the centre
  // call-FAB AND the "บริการ" tab — ปอน 2026-05-24 dropped "บริการ" on
  // desktop because the top NavBar already exposes the service mega-menu.
  // Mobile keeps it (the bottom nav doesn't carry the desktop NavBar).
  const desktopTabs: Array<{
    label: string;
    href: string;
    iconImg?: string;
    iconNode?: ReactNode;
    external?: boolean;
  }> = [
    { label: t("homeMain"), iconImg: "/images/home/iconfloating/pacred-home-main.png", href: "/" },
    { label: t("orders"),   iconImg: "/images/home/iconfloating/pcs-cart.png",         href: "/service-order" },
    { label: t("pay"),      iconImg: "/images/home/iconfloating/pcs-payment.png",      href: "/dashboard" },
    { label: t("chat"),     iconImg: "/images/home/iconfloating/pcs-line-notify.png",  href: "/line", external: true },
    { label: t("menu"),     iconNode: <Menu className="w-8 h-8" strokeWidth={2.2} />,  href: "/dashboard" },
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
              {item.iconImg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.iconImg}
                  alt={item.label}
                  className={`w-8 h-8 object-contain transition-all duration-300 ${
                    active === i
                      ? "grayscale-0 brightness-100 opacity-100"
                      : "grayscale brightness-75 opacity-60 group-hover:grayscale-0 group-hover:brightness-100 group-hover:opacity-100"
                  }`}
                />
              )}
              {item.iconNode && (
                <span
                  className={`transition-all duration-300 ${
                    active === i
                      ? "text-primary-600 opacity-100"
                      : "text-muted opacity-60 group-hover:text-foreground group-hover:opacity-100"
                  }`}
                >
                  {item.iconNode}
                </span>
              )}
              <span className="text-center leading-tight">{item.label}</span>
            </>
          );
          if (isAnchor) {
            return (
              <a key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
                {inner}
              </a>
            );
          }
          if (item.external) {
            return (
              <a
                key={i}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setActive(i)}
                className={cls}
              >
                {inner}
              </a>
            );
          }
          return (
            <Link key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>

      {/* Bottom navigation bar (mobile only)
          Layout: [หน้าแรก] [บริการ] [ออเดอร์] [📞 FAB] [ชำระ] [แชท] [เมนู]
          3 tabs | FAB | 3 tabs — per ปอน 2026-05-22 redesign */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-surface/95 backdrop-blur-md border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/*
          Separate the tab row into its own `relative` wrapper so the FAB uses
          `top-1/2` of the *content row only*, not the full nav height which
          includes safe-area padding — that was causing the FAB to be cut off.
        */}
        <div className="relative">
          <div className="grid grid-cols-[1fr_1fr_1fr_96px_1fr_1fr_1fr]">

            {/* 1 — หน้าแรก */}
            <Link href="/" onClick={() => setActive(0)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/pacred-home-main.png" alt={t("homeMain")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 0 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 0 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("homeMain")}</span>
            </Link>

            {/* 2 — บริการ (toggle bottom sheet เมนู) */}
            <button type="button" onClick={() => { setActive(1); window.dispatchEvent(new CustomEvent("toggle-mobile-menu")); }}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60 cursor-pointer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/services.png" alt={t("services")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 1 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 1 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("services")}</span>
            </button>

            {/* 3 — ออเดอร์ → customer dashboard */}
            <Link href="/dashboard" onClick={() => setActive(2)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/pcs-cart.png" alt={t("orders")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 2 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 2 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("orders")}</span>
            </Link>

            {/* Spacer — FAB sits here, positioned on the relative wrapper above */}
            <div aria-hidden />

            {/* 4 — ชำระ */}
            <Link href="/dashboard" onClick={() => setActive(3)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/pcs-payment.png" alt={t("pay")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 3 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 3 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("pay")}</span>
            </Link>

            {/* 5 — แชท LINE */}
            <a href="/line" target="_blank" rel="noopener noreferrer" onClick={() => setActive(4)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/home/iconfloating/pcs-line-notify.png" alt={t("chat")}
                className={`w-8 h-8 object-contain transition-all duration-300 ${active === 4 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"}`} />
              <span className={`text-[11px] leading-tight font-medium ${active === 4 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("chat")}</span>
            </a>

            {/* 6 — เมนู → mobile launchpad (/m/dashboard auto-redirects to
                /dashboard on desktop, so this href is safe on both viewports) */}
            <Link href="/m/dashboard" onClick={() => setActive(5)}
              className="group flex flex-col items-center justify-center gap-1 pt-2 pb-4 transition-colors active:bg-primary-50/60">
              <Menu className={`w-8 h-8 transition-all duration-300 ${active === 5 ? "text-primary-600 scale-110" : "text-muted opacity-75"}`} strokeWidth={2.2} />
              <span className={`text-[11px] leading-tight font-medium ${active === 5 ? "text-primary-600 font-bold" : "text-muted"}`}>{t("menu")}</span>
            </Link>

          </div>

          {/* Center call FAB — bottom-[10px] pushes it 20px above the nav border
              (row ~66px, FAB 76px → 10+76-66 = 20px protrusion) */}
          <a href={`tel:${OFFICE_PHONE}`} aria-label={t("callAria")}
            className="absolute left-1/2 -translate-x-1/2 bottom-[10px] w-[76px] h-[76px] rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-lg shadow-primary-600/35 ring-2 ring-white/40 dark:ring-primary-300/30 flex items-center justify-center active:scale-95 transition-transform">
            <span aria-hidden className="absolute -inset-1 rounded-full bg-primary-500/30 blur-[5px] animate-pulse [animation-duration:1.8s]" />
            <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-primary-200/50 dark:ring-primary-300/40 animate-pulse [animation-duration:1.8s] [animation-delay:0.45s]" />
            <Phone className="relative w-7 h-7" strokeWidth={2.4} fill="currentColor" />
          </a>
        </div>
      </nav>

      {/* Floating LINE bubble — sits above mobile bottom nav */}
      <div className="fixed bottom-[84px] right-3 md:bottom-6 md:right-6 z-[51] flex items-center gap-2 md:gap-3">
        <span className="hidden sm:block rounded-full bg-white dark:bg-surface shadow-md px-4 py-2 text-sm font-medium text-foreground border border-border">
          {t("askMore")}
        </span>
        <TrackedExternalLink
          href="/line"
          cta="line_consult"
          surface="floating_tabs"
          suppressHydrationWarning
          className="w-[52px] h-[52px] md:w-[70px] md:h-[70px] rounded-full bg-[#06C755] shadow-lg flex items-center justify-center hover:bg-[#05a548] transition-colors shrink-0 text-white"
          aria-label={t("chatAria")}
        >
          <LineIcon className="h-7 w-7 md:h-9 md:w-9" />
        </TrackedExternalLink>
      </div>
    </>
  );
}
