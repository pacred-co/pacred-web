"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

function FlagTH({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 9 6" className={className} aria-hidden="true">
      <rect width="9" height="6" fill="#A51931" />
      <rect y="1" width="9" height="4" fill="#F4F5F8" />
      <rect y="2" width="9" height="2" fill="#2D2A4A" />
    </svg>
  );
}

function FlagGB({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} aria-hidden="true">
      <clipPath id="lsw-uk-t">
        <path d="M30,15 h30 v15 z v-15 h-30 z h-30 v15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        clipPath="url(#lsw-uk-t)"
        stroke="#C8102E"
        strokeWidth="4"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

export function LocaleSwitcher({ variant = "default" }: { variant?: "default" | "on-primary" }) {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();

  const nextLocale = locale === "th" ? "en" : "th";

  function handleSwitch() {
    router.replace(pathname, { locale: nextLocale });
  }

  const styles =
    variant === "on-primary"
      ? "border-white/30 text-white hover:bg-white/20"
      : "border-border bg-surface hover:bg-surface-alt";

  const Flag = nextLocale === "th" ? FlagTH : FlagGB;

  return (
    <button
      onClick={handleSwitch}
      suppressHydrationWarning
      aria-label={`Switch to ${routing.locales.find((l) => l !== locale)}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${styles}`}
    >
      <Flag className="h-3.5 w-5 rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" />
      {t("language")}
    </button>
  );
}
