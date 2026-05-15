"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type CustomsPortCode =
  | "bkk"
  | "dmk"
  | "laksi"
  | "klong"
  | "laem"
  | "icd"
  | "border";

export const CUSTOMS_PORT_TAB_ORDER: CustomsPortCode[] = [
  "bkk",
  "dmk",
  "laksi",
  "klong",
  "laem",
  "icd",
  "border",
];

interface BookingPortTabsProps {
  active: CustomsPortCode | null;
  onChange: (port: CustomsPortCode) => void;
}

/**
 * Tab strip variant for the customs-clearance landing — replaces the
 * default sea/truck/air/customs/sourcing/remit mode tabs with 7 port
 * tabs (Suvarnabhumi · Don Mueang · Lak Si Post · Khlong Toey · Laem
 * Chabang · ICD · Border). The selected port auto-populates
 * `customsForm.port`/`portLabel` in BookingCalculator, so the form
 * itself drops the redundant "Customs checkpoint / Port" dropdown.
 *
 * Visual + scroll affordances mirror BookingTabs.tsx so the two look
 * interchangeable when comparing the customs landing to home.
 */
export function BookingPortTabs({ active, onChange }: BookingPortTabsProps) {
  const t = useTranslations("bookingCalc.customs.portTabs");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("[data-port]"));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === first) setCanScrollLeft(!e.isIntersecting);
          if (e.target === last) setCanScrollRight(!e.isIntersecting);
        }
      },
      { root: el, threshold: 0.96 },
    );

    observer.observe(first);
    observer.observe(last);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !active) return;
    const btn = el.querySelector<HTMLButtonElement>(`[data-port="${active}"]`);
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  }, [active]);

  const tabs: { code: CustomsPortCode; emoji: string }[] = [
    { code: "bkk",    emoji: "✈️" },
    { code: "dmk",    emoji: "✈️" },
    { code: "laksi",  emoji: "📮" },
    { code: "klong",  emoji: "⚓" },
    { code: "laem",  emoji: "🚢" },
    { code: "icd",    emoji: "📦" },
    { code: "border", emoji: "🚛" },
  ];

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto px-2.5 py-2 md:py-0 gap-1.5 md:gap-0 md:border-b md:border-gray-200 md:justify-center snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_18px,black_calc(100%-18px),transparent)] md:[mask-image:none]"
      >
        {tabs.map((tab) => {
          const isActive = active === tab.code;
          return (
            <button
              key={tab.code}
              type="button"
              role="tab"
              data-port={tab.code}
              aria-selected={isActive}
              suppressHydrationWarning
              onClick={() => onChange(tab.code)}
              className={[
                "shrink-0 snap-start cursor-pointer transition-all whitespace-nowrap",
                "inline-flex flex-col items-center gap-0 px-3.5 py-2 rounded-xl border",
                "md:flex md:flex-col md:items-center md:gap-0.5 md:px-[18px] md:py-4 md:rounded-none md:border-0 md:border-b-[3px] md:-mb-px",
                isActive
                  ? [
                      "bg-red-50 text-red-600 border-red-300 shadow-[0_4px_10px_rgba(220,38,38,0.12)]",
                      "md:bg-transparent md:border-red-600 md:shadow-none",
                    ].join(" ")
                  : [
                      "bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600",
                      "md:bg-transparent md:border-transparent md:border-b-[3px] md:hover:bg-transparent md:hover:text-red-600",
                    ].join(" "),
              ].join(" ")}
            >
              <span className="text-[12.5px] md:text-[13.5px] font-bold flex items-center gap-1.5 leading-none">
                <span
                  className="text-[15px] md:text-[18px] leading-none transition-all duration-200"
                  style={{
                    filter: isActive
                      ? "grayscale(1) sepia(1) saturate(10) hue-rotate(320deg) brightness(0.85)"
                      : "grayscale(1) brightness(0.45)",
                  }}
                >
                  {tab.emoji}
                </span>
                {t(tab.code)}
              </span>
              <span
                className={`hidden md:inline text-[10.5px] font-medium mt-0.5 ${isActive ? "text-red-500/70" : "text-gray-400"}`}
              >
                {t(`${tab.code}Sub`)}
              </span>
            </button>
          );
        })}
      </div>

      <span
        aria-hidden
        className={`pointer-events-none md:hidden absolute top-1/2 left-0.5 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-red-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.40)] ring-2 ring-white animate-pulse transition-opacity duration-200 ${canScrollLeft ? "opacity-100" : "opacity-0"}`}
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={3.2} />
      </span>
      <span
        aria-hidden
        className={`pointer-events-none md:hidden absolute top-1/2 right-0.5 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-red-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.40)] ring-2 ring-white animate-pulse transition-opacity duration-200 ${canScrollRight ? "opacity-100" : "opacity-0"}`}
      >
        <ChevronRight className="w-4 h-4" strokeWidth={3.2} />
      </span>
    </div>
  );
}
