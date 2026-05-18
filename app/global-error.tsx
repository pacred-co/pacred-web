"use client";

/**
 * IO-1 — root global error boundary (design doc §2.8 + §6.3).
 *
 * The LAST-RESORT boundary: it catches an error in the root layout
 * itself, so it must render its OWN <html>/<body> (it replaces the
 * root layout entirely — a Next.js App Router requirement).
 *
 * The "no submit button" mechanic: on mount it auto-POSTs the error to
 * /api/observability/incident via reportClientIncident — the user
 * never clicks "report", the boundary reports for them. Then it shows
 * a clean, branded, MOBILE-FIRST fallback ("ขออภัย / something went
 * wrong" + a retry button).
 *
 * It sits OUTSIDE app/[locale]/, so next-intl translations are not
 * available here — the copy is inline bilingual (TH primary, EN
 * secondary). This is a deliberate, acceptable exception for the
 * root-crash screen; the per-locale app/[locale]/error.tsx covers
 * the common (non-root) case with proper i18n.
 *
 * Tailwind classes work (globals.css is imported); brand red is
 * primary-600 (#B30000) per the house theme.
 */

import { useEffect } from "react";
import Link from "next/link";
import { reportClientIncident } from "@/lib/observability/client-report";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Auto-capture on mount — the button-less report.
  useEffect(() => {
    void reportClientIncident(error);
  }, [error]);

  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full bg-white text-gray-900">
        <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10 text-center">
          <div className="w-full max-w-sm space-y-5">
            {/* Mark */}
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#B30000]/10"
              aria-hidden
            >
              <span className="text-3xl">⚠️</span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl font-bold leading-snug">
                ขออภัย เกิดข้อผิดพลาด
              </h1>
              <p className="text-base text-gray-600">Something went wrong</p>
            </div>

            {/* The owner's "ส่งเรื่องแล้ว" promise, made visible. */}
            <p className="text-sm leading-relaxed text-gray-600">
              ระบบบันทึกปัญหานี้ และส่งเรื่องให้ทีมงานแล้ว — กำลังตรวจสอบให้
              <br />
              <span className="text-gray-400">
                We&apos;ve logged this issue and our team is on it.
              </span>
            </p>

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => reset()}
                className="min-h-[48px] w-full rounded-xl bg-[#B30000] px-5 text-base font-semibold text-white transition-colors hover:bg-[#990000] active:bg-[#800000]"
              >
                ลองใหม่อีกครั้ง · Try again
              </button>
              <Link
                href="/"
                className="min-h-[48px] w-full rounded-xl border border-gray-300 px-5 text-base font-medium leading-[46px] text-gray-700 transition-colors hover:bg-gray-50"
              >
                กลับหน้าหลัก · Back to home
              </Link>
            </div>

            {error.digest && (
              <p className="pt-1 text-xs text-gray-400">
                อ้างอิง / ref: <code className="font-mono">{error.digest}</code>
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
