"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TabMode } from "@/types/booking";

interface BookingTabsProps {
  active: TabMode | null;
  onChange: (mode: TabMode) => void;
}

export function BookingTabs({ active, onChange }: BookingTabsProps) {
  const t = useTranslations("bookingCalc");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Scroll-affordance state: show arrows only when there's overflow on that side
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // Use IntersectionObserver on first + last tabs so arrows reliably vanish
    // when either edge is fully visible (more accurate than scrollLeft math
    // when snap-scroll + mask-image are in play).
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>("[data-tab]"));
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

  const tabs: { mode: TabMode; emoji: string; label: string; sub: string }[] = [
    { mode: "sea",      emoji: "🚢", label: t("tabSeaTitle"),      sub: t("tabSeaSub") },
    { mode: "truck",    emoji: "🚛", label: t("tabTruckTitle"),    sub: t("tabTruckSub") },
    { mode: "air",      emoji: "✈️", label: t("tabAirTitle"),      sub: t("tabAirSub") },
    { mode: "customs",  emoji: "👮", label: t("tabCustomsTitle"),  sub: t("tabCustomsSub") },
    { mode: "sourcing", emoji: "🛒", label: t("tabSourcingTitle"), sub: t("tabSourcingSub") },
    { mode: "remit",    emoji: "🏦", label: t("tabRemitTitle"),    sub: t("tabRemitSub") },
  ];

  // Scroll the active tab into view (so users see it even after layout switch)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !active) return;
    const btn = el.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`);
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  }, [active]);

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto px-2.5 py-2 md:py-0 gap-1.5 md:gap-0 md:border-b md:border-gray-200 md:justify-center snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_18px,black_calc(100%-18px),transparent)] md:[mask-image:none]"
      >
        {tabs.map(tab => {
          const isActive = active === tab.mode;
          return (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              data-tab={tab.mode}
              aria-selected={isActive}
              suppressHydrationWarning
              onClick={() => onChange(tab.mode)}
              className={[
                "shrink-0 snap-start cursor-pointer transition-all whitespace-nowrap",
                // Mobile: pill style
                "inline-flex flex-col items-center gap-0 px-3.5 py-2 rounded-xl border",
                // Desktop reset: column tab with bottom-border indicator
                "md:flex md:flex-col md:items-center md:gap-0.5 md:px-[22px] md:py-4 md:rounded-none md:border-0 md:border-b-[3px] md:-mb-px",
                isActive
                  ? [
                      // Mobile active: red pill with shadow
                      "bg-red-50 text-red-600 border-red-300 shadow-[0_4px_10px_rgba(220,38,38,0.12)]",
                      // Desktop active: just bottom border + red text
                      "md:bg-transparent md:border-red-600 md:shadow-none",
                    ].join(" ")
                  : [
                      "bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600",
                      "md:bg-transparent md:border-transparent md:border-b-[3px] md:hover:bg-transparent md:hover:text-red-600",
                    ].join(" "),
              ].join(" ")}
            >
              <span className="text-[12.5px] md:text-sm font-bold flex items-center gap-1.5 leading-none">
                <span
                  className="text-[16px] md:text-[20px] leading-none transition-all duration-200"
                  style={{
                    filter: isActive
                      ? "grayscale(1) sepia(1) saturate(10) hue-rotate(320deg) brightness(0.85)"
                      : "grayscale(1) brightness(0.45)",
                  }}
                >{tab.emoji}</span>
                {tab.label}
              </span>
              <span className={`hidden md:inline text-[11px] font-medium mt-0.5 ${isActive ? "text-red-500/70" : "text-gray-400"}`}>
                {tab.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile scroll affordances: clear pulsing chevrons on both edges */}
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
