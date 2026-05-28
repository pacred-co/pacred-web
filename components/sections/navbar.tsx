"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, LayoutDashboard, LogOut, User as UserIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { trackSignOut } from "@/lib/analytics";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/notification-bell";
import { CartBadge } from "@/components/cart-badge";
import { TopMenu, TopMenuMobile } from "@/components/sections/top-menu";

type ProfileLite = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
};

/**
 * Auth-state-aware Link prefetch gate.
 *
 * The `(protected)` customer-portal layout loads a 25+ stylesheet legacy-PCS
 * CSS bundle via React-19 `<link rel="stylesheet">` hoisting (see
 * `app/[locale]/(protected)/layout.tsx` CSS_BUNDLE). When NavBar renders on
 * a non-protected route (auth pages like /register, public marketing like /)
 * for an authenticated user, Next.js's default viewport-prefetch on its
 * `<Link href="/dashboard">` / `<Link href="/profile">` etc. fetches the
 * protected layout's RSC payload — React 19 then hoists every CSS URL in it
 * as a `<link rel="preload">` on the CURRENT page. The browser then logs
 * ~126 "preloaded but not used" warnings per page load on /register / /login
 * / / and friends because nothing on these auth/public pages actually uses
 * that CSS.
 *
 * Fix: when NavBar is rendered OUTSIDE the (protected) route group, disable
 * prefetch on the protected-target Links. Navigation still works (it just
 * triggers a normal request on click); inside (protected) the prefetch
 * stays on so the back-office nav remains snappy. See
 * docs/learnings/nextjs-16-quirks.md.
 */
function useProtectedLinkPrefetch(): false | undefined {
  const pathname = usePathname();
  // The (protected) route group renders at paths like /dashboard, /profile,
  // /service-order/*, /service-import/*, /wallet, /cart, /notifications,
  // /shipments, /sales, /refunds, /pay, /search, /map, /addresses,
  // /china-address, /freight/*, /account-settings, /wallet-credit,
  // /wallet-shop, /line-settings, /m/dashboard, etc. Locale prefix may
  // precede them. The list mirrors the directories under
  // `app/[locale]/(protected)/`. When pathname is OUTSIDE this set, we're
  // on auth/public/admin — disable prefetch on protected Links so the
  // protected layout's CSS bundle doesn't leak via prefetch.
  if (!pathname) return false;
  return /^(?:\/[a-z]{2})?\/(?:dashboard|profile|service-order|service-import|service-payment|wallet|wallet-credit|wallet-shop|cart|notifications|shipments|sales|refunds|pay|search|map|addresses|china-address|freight|account-settings|line-settings|m\/dashboard)(?:\/|$)/.test(
    pathname,
  )
    ? undefined
    : false;
}

export function NavBar() {
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const protectedPrefetch = useProtectedLinkPrefetch();

  // Listen for open / toggle events fired by FloatingTabs
  useEffect(() => {
    const openHandler   = () => setMenuOpen(true);
    const toggleHandler = () => setMenuOpen((v) => !v);
    window.addEventListener("open-mobile-menu",   openHandler);
    window.addEventListener("toggle-mobile-menu", toggleHandler);
    return () => {
      window.removeEventListener("open-mobile-menu",   openHandler);
      window.removeEventListener("toggle-mobile-menu", toggleHandler);
    };
  }, []);

  // Sync chevron state when SearchBar on a page starts collapsed by default
  useEffect(() => {
    const handler = () => setSearchOpen(false);
    window.addEventListener("search-bar-default-collapsed", handler);
    return () => window.removeEventListener("search-bar-default-collapsed", handler);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfile(u: User) {
      const { data } = await supabase
        .from("profiles")
        .select("member_code, first_name, last_name, email, status")
        .eq("id", u.id)
        .maybeSingle<ProfileLite>();
      setProfile(data ?? null);
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthReady(true);
      if (data.user) loadProfile(data.user);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) loadProfile(u);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full shadow-lg">

      {/* ── Main navbar ── */}
      <div className="bg-[#B91C1C]">
        <div className="mx-auto flex h-[56px] max-w-[1440px] items-center justify-between gap-4 px-4 xl:pl-2 xl:pr-6">

          {/* Logo — clicks back to home (replaces former social cluster, per ปอน 2026-05-22) */}
          <Link
            href="/"
            aria-label="Pacred Shipping — กลับหน้าแรก"
            className="shrink-0 flex items-center hover:opacity-90 transition-opacity"
          >
            <Image
              src="/images/iconfloattabs/pacgrey.png"
              alt="Pacred Shipping"
              width={400}
              height={160}
              priority
              className="h-10 md:h-12 w-auto object-contain"
            />
          </Link>

          {/* Desktop nav — TopMenu with dropdowns */}
          <div className="hidden xl:flex flex-1 justify-center">
            <TopMenu />
          </div>

          {/* Right: auth + lang + theme */}
          <div className="hidden xl:flex items-center gap-2 shrink-0">
            {authReady && user ? (
              <>
                <CartBadge prefetch={protectedPrefetch} />
                <NotificationBell prefetch={protectedPrefetch} />
                <UserMenu user={user} profile={profile} prefetch={protectedPrefetch} />
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost-primary" size="sm">{t("login")}</Button>
                </Link>
                <Link href="/register">
                  <Button variant="white" size="sm">{t("register")}</Button>
                </Link>
              </>
            )}
            <LocaleSwitcher variant="on-primary" />
            <ThemeToggle variant="on-primary" />
          </div>

          {/* Mobile: controls only — hamburger moved to FloatingTabs "เมนู" */}
          <div className="flex xl:hidden items-center gap-2">
            <LocaleSwitcher variant="on-primary" />
            <ThemeToggle variant="on-primary" />
            <button
              type="button"
              onClick={() => { setSearchOpen((v) => !v); window.dispatchEvent(new CustomEvent("toggle-search-bar")); }}
              aria-label="Toggle search"
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/30 text-white hover:bg-white/15 transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${searchOpen ? "" : "rotate-180"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile menu — bottom sheet (slides up from bottom) ── */}
      {/* Backdrop */}
      <div
        className={`xl:hidden fixed inset-0 z-[59] bg-black/50 transition-opacity duration-300 ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setMenuOpen(false)}
      />
      {/* Sheet */}
      <div
        className={`xl:hidden fixed inset-x-0 bottom-0 z-[60] transition-transform duration-300 ease-out ${menuOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="bg-[#991b1b] rounded-t-2xl max-h-[75vh] overflow-y-auto"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 78px)" }}>
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/30" />
          </div>
          <nav className="flex w-full flex-col px-4 py-3 gap-0.5">
            <TopMenuMobile onClose={() => setMenuOpen(false)} />
            <div className="my-2 border-t border-white/20" />
            {authReady && user ? (
              <MobileUserMenu profile={profile} onClose={() => setMenuOpen(false)} prefetch={protectedPrefetch} />
            ) : (
              <div className="flex gap-2 px-1 pb-1">
                <Link href="/login" className="flex-1" onClick={() => setMenuOpen(false)}>
                  <Button variant="ghost-primary" fullWidth>{t("login")}</Button>
                </Link>
                <Link href="/register" className="flex-1" onClick={() => setMenuOpen(false)}>
                  <Button variant="white" fullWidth>{t("register")}</Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

/* ─────────── User Menu (Desktop) ─────────── */
function UserMenu({ user, profile, prefetch }: { user: User; profile: ProfileLite | null; prefetch?: false }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayName =
    profile?.first_name || profile?.last_name
      ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
      : (profile?.email ?? user.email ?? user.phone ?? "Member");
  const initial = (displayName?.[0] ?? "U").toUpperCase();
  const isIncomplete = profile?.status === "incomplete";

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/30 bg-white/10 pl-1 pr-2.5 py-1 text-white transition hover:bg-white/20"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-primary-600">
          {initial}
        </span>
        <span className="text-sm font-medium">{profile?.member_code ?? "..."}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-border bg-white dark:bg-surface shadow-xl z-50">
          <Link href="/profile" prefetch={prefetch} onClick={() => setOpen(false)}
            className="block border-b border-border px-4 py-3 transition hover:bg-surface dark:hover:bg-surface-alt">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            {profile?.member_code && (
              <p className="mt-0.5 font-mono text-xs text-primary-600">{profile.member_code}</p>
            )}
          </Link>
          {isIncomplete && (
            <Link href="/complete-profile" onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-b border-border bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2.5 text-sm font-medium text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30">
              <UserIcon className="h-4 w-4" />
              {t("completeProfile")}
            </Link>
          )}
          <Link href="/dashboard" prefetch={prefetch} onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-surface dark:hover:bg-surface-alt">
            <LayoutDashboard className="h-4 w-4 text-muted" />
            {t("dashboard")}
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit"
              className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-foreground hover:bg-surface dark:hover:bg-surface-alt">
              <LogOut className="h-4 w-4 text-muted" />
              {t("logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─────────── User Menu (Mobile) ─────────── */
function MobileUserMenu({ profile, onClose, prefetch }: { profile: ProfileLite | null; onClose: () => void; prefetch?: false }) {
  const t = useTranslations("nav");
  return (
    <div className="px-1 pb-1">
      {profile?.member_code && (
        <p className="px-3 pb-2 font-mono text-xs text-white/70">{profile.member_code}</p>
      )}
      <Link href="/dashboard" prefetch={prefetch} onClick={onClose}
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10">
        <LayoutDashboard className="h-4 w-4" />
        {t("dashboard")}
      </Link>
      {profile?.status === "incomplete" && (
        <Link href="/complete-profile" onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10">
          <UserIcon className="h-4 w-4" />
          {t("completeProfile")}
        </Link>
      )}
      <form action="/auth/signout" method="post" onSubmit={() => trackSignOut()}>
        <button type="submit"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10">
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </button>
      </form>
    </div>
  );
}
