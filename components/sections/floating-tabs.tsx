"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
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

// Pacred main office line — single number for mobile FAB (per ปอน 2026-05-17,
// no random sales-rep rotation).
const OFFICE_PHONE = "024213325";

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

  const desktopTabs = [
    { label: t("home"),       icon: "/images/home/iconfloating/pacred-home-main.png", href: "#home" },
    { label: t("services"),   icon: "/images/home/iconfloating/pcs-shop.png",         href: "#services" },
    { label: t("promotions"), icon: "/images/home/iconfloating/ranka.png",            href: "#promotions" },
    { label: t("blog"),       icon: "/images/home/iconfloating/checklistred.png",     href: "/knowledge" },
    // Per ปอน 2026-05-15: partner tab swapped out for Pacred News.
    { label: t("news"),       icon: "/images/home/iconfloating/pcs-line-notify.png",  href: "/news" },
    { label: t("contact"),    icon: "/images/home/iconfloating/pcs-call-center.png",  href: "#contact" },
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

      {/* Bottom navigation bar (mobile only) — per ปอน 2026-05-18 v2:
          [หน้าหลัก] [บทความ] [📞 call FAB] [ข่าวสาร] [ล็อคอิน/ล็อคเอาท์]
          The last tab flips between login/logout depending on session.
          Icons sourced from /images/home/iconfloating/* (login state uses
          the logout door icon mirrored via scaleX(-1)). */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-surface/95 backdrop-blur-md border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Symmetric 2|FAB|2 layout — original grid */}
        <div className="grid grid-cols-[1fr_1fr_88px_1fr_1fr]">
          {/* Tab 1 — หน้าหลัก → / */}
          <Link
            href="/"
            onClick={() => setActive(0)}
            className="group flex flex-col items-center justify-center gap-1 py-3 transition-colors active:bg-primary-50/60 dark:active:bg-primary-900/20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MOBILE_ICON.home}
              alt={t("homeMain")}
              className={`w-7 h-7 object-contain transition-all duration-300 ${
                active === 0 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"
              }`}
            />
            <span className={`text-[11px] leading-tight font-medium ${
              active === 0 ? "text-primary-600 font-bold" : "text-muted"
            }`}>
              {t("homeMain")}
            </span>
          </Link>

          {/* Tab 2 — บทความ → /knowledge */}
          <Link
            href="/knowledge"
            onClick={() => setActive(1)}
            className="group flex flex-col items-center justify-center gap-1 py-3 transition-colors active:bg-primary-50/60 dark:active:bg-primary-900/20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MOBILE_ICON.blog}
              alt={t("blog")}
              className={`w-7 h-7 object-contain transition-all duration-300 ${
                active === 1 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"
              }`}
            />
            <span className={`text-[11px] leading-tight font-medium ${
              active === 1 ? "text-primary-600 font-bold" : "text-muted"
            }`}>
              {t("blog")}
            </span>
          </Link>

          {/* Spacer — leaves room for the absolutely-positioned call FAB */}
          <div aria-hidden />

          {/* Tab 4 — ข่าวสาร → /news */}
          <Link
            href="/news"
            onClick={() => setActive(2)}
            className="group flex flex-col items-center justify-center gap-1 py-3 transition-colors active:bg-primary-50/60 dark:active:bg-primary-900/20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={MOBILE_ICON.news}
              alt={t("news")}
              className={`w-7 h-7 object-contain transition-all duration-300 ${
                active === 2 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"
              }`}
            />
            <span className={`text-[11px] leading-tight font-medium ${
              active === 2 ? "text-primary-600 font-bold" : "text-muted"
            }`}>
              {t("news")}
            </span>
          </Link>

          {/* Tab 5 — ล็อคอิน / ล็อคเอาท์ (dynamic on session) */}
          {user ? (
            <form
              action="/auth/signout"
              method="post"
              onSubmit={() => trackSignOut()}
              className="contents"
            >
              <button
                type="submit"
                className="group flex flex-col items-center justify-center gap-1 py-3 transition-colors active:bg-primary-50/60 dark:active:bg-primary-900/20"
                aria-label={t("logout")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={MOBILE_ICON.logout}
                  alt={t("logout")}
                  className="w-7 h-7 object-contain grayscale brightness-75 opacity-75 transition-all duration-300"
                />
                <span className="text-[11px] leading-tight font-medium text-muted">
                  {t("logout")}
                </span>
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              onClick={() => setActive(3)}
              className="group flex flex-col items-center justify-center gap-1 py-3 transition-colors active:bg-primary-50/60 dark:active:bg-primary-900/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={MOBILE_ICON.logout}
                alt={t("login")}
                className={`w-7 h-7 object-contain transition-all duration-300 [transform:scaleX(-1)] ${
                  active === 3 ? "grayscale-0 brightness-100 opacity-100 scale-110" : "grayscale brightness-75 opacity-75"
                }`}
              />
              <span className={`text-[11px] leading-tight font-medium ${
                active === 3 ? "text-primary-600 font-bold" : "text-muted"
              }`}>
                {t("login")}
              </span>
            </Link>
          )}
        </div>

        {/* Center call FAB — lifts above the bar with a subtle pulsing red aura */}
        <a
          href={`tel:${OFFICE_PHONE}`}
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
        </a>
      </nav>

      {/* Floating LINE bubble — sits above mobile bottom nav */}
      <div className="fixed bottom-[78px] right-3 md:bottom-6 md:right-6 z-[51] flex items-center gap-2 md:gap-3">
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
