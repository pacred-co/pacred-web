"use client";

/**
 * IO-1 — per-locale error boundary (design doc §2.8 + §6.3).
 *
 * Catches a render error anywhere under app/[locale]/ — the COMMON
 * case (the public site, the customer portal, the admin back-office
 * all live here). The root app/global-error.tsx only fires if the
 * root layout itself crashes.
 *
 * Unlike global-error.tsx this sits INSIDE the locale segment, so the
 * root layout (and next-intl) is still mounted — it renders just the
 * page content (no <html>/<body>) and uses proper i18n via the
 * `error` message namespace (messages/{th,en}.json).
 *
 * The "no submit button" mechanic: on mount it auto-POSTs the error
 * to /api/observability/incident — the user never clicks "report".
 * Then a clean, branded, MOBILE-FIRST fallback with a retry button.
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { reportClientIncident } from "@/lib/observability/client-report";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  // Auto-capture on mount — the button-less report.
  useEffect(() => {
    void reportClientIncident(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-5 py-12 text-center">
      <div className="w-full max-w-sm space-y-5">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600/10"
          aria-hidden
        >
          <span className="text-3xl">⚠️</span>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-xl font-bold leading-snug text-foreground">
            {t("title")}
          </h1>
          <p className="text-base text-muted">{t("subtitle")}</p>
        </div>

        {/* The owner's "ส่งเรื่องแล้ว" promise, made visible. */}
        <p className="text-sm leading-relaxed text-muted">{t("logged")}</p>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => reset()}
            className="min-h-[48px] w-full rounded-xl bg-primary-600 px-5 text-base font-semibold text-white transition-colors hover:bg-primary-700 active:bg-primary-800"
          >
            {t("retry")}
          </button>
          <Link
            href="/"
            className="min-h-[48px] w-full rounded-xl border border-border px-5 text-base font-medium leading-[46px] text-foreground transition-colors hover:bg-surface-alt"
          >
            {t("home")}
          </Link>
        </div>

        {error.digest && (
          <p className="pt-1 text-xs text-muted">
            {t("ref")}: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
