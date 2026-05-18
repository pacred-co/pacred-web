"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics";
import type { QuoteCarry } from "@/types/booking";
import { mapCalculatorModeToServiceSlug } from "@/lib/booking/service-config";

/**
 * BK-1 — the "เปิดบุ๊กกิ้ง / Open booking" secondary CTA.
 *
 * Renders beside `QuoteCTA` inside `ResultBox` whenever the calculator has
 * produced a priced result. Bridges into the Trip.com-style booking detail
 * page where the customer picks options + sees an itemised quote receipt
 * before they commit (per design docs/research/booking-flow-system-2026-05-18.md
 * §3.3 + §4).
 *
 * Stays an OUTLINE button so `QuoteCTA` keeps the primary visual weight —
 * `QuoteCTA` is the fast self-serve order path ("I know what I want"),
 * `OpenBookingCTA` is the considered booking path ("help me assemble +
 * price this job"). Two doors, one calculator.
 *
 * When the mode does not map cleanly to a bookable service slug (e.g. an
 * unknown future mode), it links to the `/book` hub instead so the click
 * is never a dead end.
 */

export function OpenBookingCTA({ quote }: { quote: QuoteCarry }) {
  const t = useTranslations("booking.openBooking");

  // QuoteCarry.size (e.g. '20ft' / '40ft') is the FCL signal — when present,
  // the sea mode is FCL; otherwise default to LCL. Mirrors the BookingCalculator
  // shape: FCL panels pass `size`, LCL panels do not.
  const seaMode = quote.size ? "fcl" : "lcl";
  const serviceSlug = mapCalculatorModeToServiceSlug(quote.mode, seaMode);

  // Build query params — only non-empty values are carried so the booking
  // page can pre-hydrate the estimate / selectors.
  const params = new URLSearchParams();
  params.set("mode", quote.mode);
  if (quote.price > 0) params.set("price", String(quote.price));
  if (quote.weightKg && quote.weightKg > 0) params.set("weight", String(quote.weightKg));
  if (quote.volumeCbm && quote.volumeCbm > 0) params.set("volume", String(quote.volumeCbm));
  if (quote.term) params.set("term", quote.term);
  if (quote.size) params.set("size", quote.size);
  if (quote.sub) params.set("sub", quote.sub);
  if (quote.transport) params.set("transport", quote.transport);

  // Fallback path: when no service slug resolves, drop the customer at the
  // /book hub with the carry so they can pick a service themselves.
  const href = serviceSlug
    ? { pathname: `/book/${serviceSlug}` as const, query: Object.fromEntries(params) }
    : { pathname: "/book" as const, query: Object.fromEntries(params) };

  return (
    <Link
      href={href}
      onClick={() =>
        trackCtaClick("open_booking", "home_booking_result", {
          mode: quote.mode,
          service: serviceSlug ?? "hub",
        })
      }
      className="group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-600 bg-white px-5 py-3.5 text-sm font-bold text-red-600 transition-all hover:bg-red-50 hover:-translate-y-0.5"
    >
      {t("cta")}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
