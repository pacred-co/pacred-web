"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics";
import type { QuoteCarry } from "@/types/booking";

/**
 * G-F-2 — the "เปิดออเดอร์ราคานี้" CTA.
 *
 * Bridges a priced booking-calculator result into the matching protected
 * order flow. It renders directly under the price in `ResultBox` and links
 * to the public `/start-order` route, which resolves auth state and routes
 * the visitor on (signed-in → order form; guest → login → order form), the
 * calculated quote carried in the query string the whole way.
 *
 * Only shown for calculator modes that HAVE a self-serve order flow
 * (`sea` / `truck` / `air` → service-import, `sourcing` → service-order);
 * `ResultBox` passes no `quote` for the others, so the CTA simply doesn't
 * render and the existing phone/LINE escalation stays the only path.
 */

const ORDERABLE_MODES = new Set<QuoteCarry["mode"]>(["sea", "truck", "air", "sourcing"]);

export function QuoteCTA({ quote }: { quote: QuoteCarry }) {
  const t = useTranslations("bookingCalc.openOrder");

  if (!ORDERABLE_MODES.has(quote.mode)) return null;

  // Build the /start-order query — only non-empty values are carried.
  const params = new URLSearchParams();
  params.set("mode", quote.mode);
  if (quote.price > 0) params.set("price", String(quote.price));
  if (quote.weightKg && quote.weightKg > 0) params.set("weight", String(quote.weightKg));
  if (quote.volumeCbm && quote.volumeCbm > 0) params.set("volume", String(quote.volumeCbm));
  if (quote.term) params.set("term", quote.term);
  if (quote.size) params.set("size", quote.size);
  if (quote.sub) params.set("sub", quote.sub);
  if (quote.transport) params.set("transport", quote.transport);

  // BK-1 — wrapper chrome (px-5/py-4/border-t bg-white) is now owned by
  // `ResultBox` so this CTA can sit alongside `OpenBookingCTA` in a single
  // stack. This component renders the primary CTA + its hint only.
  return (
    <div>
      <Link
        href={{ pathname: "/start-order", query: Object.fromEntries(params) }}
        onClick={() =>
          trackCtaClick("open_order", "home_booking_result", { mode: quote.mode })
        }
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(220,38,38,0.25)] transition-all hover:bg-red-700 hover:-translate-y-0.5"
      >
        {t("cta")}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <p className="mt-2 text-center text-[12px] text-gray-500">{t("hint")}</p>
    </div>
  );
}
