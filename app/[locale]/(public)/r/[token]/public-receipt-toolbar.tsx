"use client";

/**
 * PublicReceiptToolbar (ภูม flag round 8 · point 4) — the floating
 * "จัดการเอกสาร" control on the login-free public receipt page (`/r/[token]`),
 * modelled on Peak's public-document toolbar.
 *
 * Layout:
 *   - desktop (sm+): a fixed panel anchored bottom-right; a single FAB toggles it.
 *   - mobile (<sm):  a full-width bottom bar; the panel slides up above it.
 *
 * Actions:
 *   - เต็มจอ / กระดาษ  — toggles `.receipt-fit` on the receipt wrapper so the
 *                        210mm A4 paper scales to a narrow viewport instead of
 *                        overflowing (mobile defaults to fit · desktop to paper).
 *   - เข้าสู่ระบบ        — plain anchor to /login (cross-area nav).
 *   - พิมพ์             — window.print().
 *   - ดาวน์โหลด PDF     — window.print() too — the tuned A4 print CSS yields a
 *                        perfect vector PDF via the browser's "Save as PDF"
 *                        destination (a raster client lib would look worse for a
 *                        money doc). A caption tells the user which destination.
 *   - English / ไทย     — locale toggle (pushes the same path under the other
 *                        locale via @/i18n/navigation).
 *
 * The whole bar is `print:hidden` — it never appears in the printout/PDF.
 * Tap targets ≥44px, body text ≥16px on mobile. Nothing here MUTATES data
 * (it's a viewing toolbar), so §0f confirm-before-mutate does not apply.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter, Link } from "@/i18n/navigation";
import {
  FileText,
  Printer,
  Download,
  LogIn,
  Globe,
  Maximize2,
  FileStack,
  X,
} from "lucide-react";

/** Toggle the `.receipt-fit` class on the receipt wrapper container. */
const FIT_TARGET_ID = "publicReceiptDoc";

export default function PublicReceiptToolbar() {
  const t = useTranslations("publicReceipt");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  // Default to "fit" so the 210mm A4 paper scales to a narrow phone viewport
  // with no horizontal scroll. The public page wrapper ships WITH `.receipt-fit`
  // server-side, so mobile fits on first paint (no flash, no hydration gap) and
  // this initial state matches it. On desktop, fit caps at 210mm inside the
  // max-w container, so it looks identical to paper. The toggle just lets the
  // user switch to true "paper" (กระดาษ) on demand. We NEVER setState inside an
  // effect (the mobile default lives in the server-rendered class, not JS) —
  // only on user click — so there's no cascading-render lint hit.
  const [fit, setFit] = useState(true);

  useEffect(() => {
    const el = document.getElementById(FIT_TARGET_ID);
    if (!el) return;
    el.classList.toggle("receipt-fit", fit);
  }, [fit]);

  const otherLocale = locale === "th" ? "en" : "th";

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const switchLocale = useCallback(() => {
    // Push the SAME path under the other locale; `token` is already in pathname.
    router.replace(pathname, { locale: otherLocale });
  }, [router, pathname, otherLocale]);

  return (
    <div className="no-print print:hidden">
      {/* Backdrop (mobile) — tap to close the panel */}
      {open && (
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent"
        />
      )}

      {/* The action panel */}
      {open && (
        <div
          role="dialog"
          aria-label={t("manageDoc")}
          className="fixed z-50 bottom-[64px] left-0 right-0 mx-auto w-full max-w-md rounded-t-2xl border border-border bg-white p-3 shadow-2xl sm:bottom-20 sm:left-auto sm:right-4 sm:w-72 sm:rounded-2xl dark:bg-surface"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-base font-semibold text-foreground">{t("manageDoc")}</span>
            <button
              type="button"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {/* เต็มจอ / กระดาษ toggle */}
            <button
              type="button"
              onClick={() => setFit((v) => !v)}
              className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left text-base text-foreground hover:bg-slate-100 dark:hover:bg-white/5"
            >
              {fit ? <FileStack className="h-5 w-5 text-primary-600" /> : <Maximize2 className="h-5 w-5 text-primary-600" />}
              <span>{fit ? t("paperView") : t("fullScreen")}</span>
            </button>

            {/* พิมพ์ */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left text-base text-foreground hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <Printer className="h-5 w-5 text-primary-600" />
              <span>{t("print")}</span>
            </button>

            {/* ดาวน์โหลด PDF (+ hint) */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex min-h-[44px] flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <span className="flex items-center gap-3 text-base text-foreground">
                <Download className="h-5 w-5 text-primary-600" />
                {t("downloadPdf")}
              </span>
              <span className="pl-8 text-xs leading-snug text-muted">{t("downloadPdfHint")}</span>
            </button>

            {/* English / ไทย */}
            <button
              type="button"
              onClick={switchLocale}
              className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left text-base text-foreground hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <Globe className="h-5 w-5 text-primary-600" />
              <span>{locale === "th" ? t("englishVersion") : t("thaiVersion")}</span>
            </button>

            <div className="my-1 h-px bg-border" />

            {/* เข้าสู่ระบบ — locale-aware Link (the customer's own portal login) */}
            <Link
              href="/login"
              className="flex min-h-[44px] items-center gap-3 rounded-xl bg-primary-600 px-3 py-2 text-left text-base font-semibold text-white hover:bg-primary-700"
            >
              <LogIn className="h-5 w-5" />
              <span>{t("login")}</span>
            </Link>
          </div>
        </div>
      )}

      {/* TRIGGER:
          - desktop: a rounded FAB pinned bottom-right.
          - mobile: a full-width bottom bar. */}
      {/* Desktop FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-4 z-50 hidden min-h-[44px] items-center gap-2 rounded-full bg-primary-600 px-5 py-3 text-base font-semibold text-white shadow-lg hover:bg-primary-700 sm:inline-flex"
      >
        <FileText className="h-5 w-5" />
        {t("manageDoc")}
      </button>

      {/* Mobile bottom bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed inset-x-0 bottom-0 z-50 flex min-h-[56px] items-center justify-center gap-2 border-t border-primary-700 bg-primary-600 px-4 py-3 text-base font-semibold text-white shadow-[0_-2px_12px_rgba(0,0,0,0.12)] sm:hidden"
      >
        <FileText className="h-5 w-5" />
        {t("manageDoc")}
      </button>
    </div>
  );
}
