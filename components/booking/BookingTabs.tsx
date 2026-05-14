"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { TabMode } from "@/types/booking";

interface BookingTabsProps {
  active: TabMode | null;
  onChange: (mode: TabMode) => void;
}

export function BookingTabs({ active, onChange }: BookingTabsProps) {
  const t = useTranslations("bookingCalc");
  const scrollerRef = useRef<HTMLDivElement>(null);

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

      {/* Mobile scroll affordance: subtle chevron on the right edge */}
      <span
        aria-hidden
        className="pointer-events-none md:hidden absolute top-1/2 right-1 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-white/90 shadow-[0_2px_6px_rgba(0,0,0,0.10)] animate-pulse"
      >
        <ChevronRight className="w-3.5 h-3.5 text-primary-500" strokeWidth={3} />
      </span>
    </div>
  );
}
