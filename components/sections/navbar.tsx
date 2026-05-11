"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { ChevronDown, LayoutDashboard, LogOut, User as UserIcon } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type ProfileLite = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
};

export function NavBar() {
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [authReady, setAuthReady] = useState(false);

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

  const navLinks = [
    { href: "#quick-service", label: t("quickService") },
    { href: "#import", label: t("import") },
    { href: "#order", label: t("order") },
    { href: "#how-to-use", label: t("howToUse") },
    { href: "#pricing", label: t("pricing") },
    { href: "#warehouse", label: t("warehouse") },
    { href: "#about", label: t("about") },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#B91C1C] shadow-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <Image
            src="/images/pacred-logo-white.png"
            alt="Pacred"
            width={240}
            height={78}
            className="h-[78px] w-auto object-contain translate-y-[2px]"
            priority
          />
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden xl:flex items-center gap-0.5 flex-1 justify-center">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium text-white/90 hover:bg-white/15 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right side: auth + controls */}
        <div className="hidden xl:flex items-center gap-2 shrink-0">
          {authReady && user ? (
            <UserMenu user={user} profile={profile} />
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

        {/* Mobile: controls + hamburger */}
        <div className="flex xl:hidden items-center gap-2">
          <LocaleSwitcher variant="on-primary" />
          <ThemeToggle variant="on-primary" />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/30 text-white hover:bg-white/15 transition-colors"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="xl:hidden border-t border-white/20 bg-[#991b1b]">
          <nav className="flex w-full flex-col px-4 py-3 gap-0.5">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="my-2 border-t border-white/20" />
            {authReady && user ? (
              <MobileUserMenu profile={profile} onClose={() => setMenuOpen(false)} />
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
      )}
    </header>
  );
}

/* ─────────── User Menu (Desktop) ─────────── */
function UserMenu({
  user,
  profile,
}: {
  user: User;
  profile: ProfileLite | null;
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
        <span className="text-sm font-medium">
          {profile?.member_code ?? "..."}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-border bg-white dark:bg-surface shadow-xl">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </p>
            {profile?.member_code && (
              <p className="mt-0.5 font-mono text-xs text-primary-600">
                {profile.member_code}
              </p>
            )}
          </div>

          {isIncomplete && (
            <Link
              href="/complete-profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-b border-border bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2.5 text-sm font-medium text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
            >
              <UserIcon className="h-4 w-4" />
              {t("completeProfile")}
            </Link>
          )}

          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-surface dark:hover:bg-surface-alt"
          >
            <LayoutDashboard className="h-4 w-4 text-muted" />
            {t("dashboard")}
          </Link>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-foreground hover:bg-surface dark:hover:bg-surface-alt"
            >
              <LogOut className="h-4 w-4 text-muted" />
              {t("logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─────────── User Menu (Mobile dropdown) ─────────── */
function MobileUserMenu({
  profile,
  onClose,
}: {
  profile: ProfileLite | null;
  onClose: () => void;
}) {
  const t = useTranslations("nav");
  return (
    <div className="px-1 pb-1">
      {profile?.member_code && (
        <p className="px-3 pb-2 font-mono text-xs text-white/70">
          {profile.member_code}
        </p>
      )}
      <Link
        href="/dashboard"
        onClick={onClose}
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10"
      >
        <LayoutDashboard className="h-4 w-4" />
        {t("dashboard")}
      </Link>
      {profile?.status === "incomplete" && (
        <Link
          href="/complete-profile"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          <UserIcon className="h-4 w-4" />
          {t("completeProfile")}
        </Link>
      )}
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </button>
      </form>
    </div>
  );
}
