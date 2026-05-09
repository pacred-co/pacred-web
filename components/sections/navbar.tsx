"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Button } from "@/components/ui/button";

export function NavBar() {
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: "#quick-service", label: t("quickService") },
    { href: "#import", label: t("import") },
    // { href: "#export", label: t("export") },
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
          <Link href="/login">
            <Button variant="ghost-primary" size="sm">{t("login")}</Button>
          </Link>
          <Link href="/register">
            <Button variant="white" size="sm">{t("register")}</Button>
          </Link>
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
          <nav className="mx-auto max-w-7xl flex flex-col px-4 py-3 gap-0.5">
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
            <div className="flex gap-2 px-1 pb-1">
              <Link href="/login" className="flex-1" onClick={() => setMenuOpen(false)}>
                <Button variant="ghost-primary" fullWidth>{t("login")}</Button>
              </Link>
              <Link href="/register" className="flex-1" onClick={() => setMenuOpen(false)}>
                <Button variant="white" fullWidth>{t("register")}</Button>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
