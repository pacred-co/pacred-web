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
        className="flex overflow-x-auto border-b border-gray-200 px-2.5 md:justify-center snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_18px,black_calc(100%-18px),transparent)] md:[mask-image:none]"
      >
        {tabs.map(tab => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            data-tab={tab.mode}
            aria-selected={active === tab.mode}
            onClick={() => onChange(tab.mode)}
            className={`flex flex-col items-center gap-0.5 px-4 md:px-[22px] py-4 whitespace-nowrap shrink-0 snap-start border-b-[3px] -mb-px transition-all cursor-pointer ${
              active === tab.mode
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-red-600"
            }`}
          >
            <span className="text-sm font-bold flex items-center gap-1.5">
              <span
                className="text-[20px] leading-none transition-all duration-200"
                style={{
                  filter: active === tab.mode
                    ? "grayscale(1) sepia(1) saturate(10) hue-rotate(320deg) brightness(0.85)"
                    : "grayscale(1) brightness(0.45)"
                }}
              >{tab.emoji}</span>
              {tab.label}
            </span>
            <span className={`text-[11px] font-medium ${active === tab.mode ? "text-red-500/70" : "text-gray-400"}`}>
              {tab.sub}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile scroll affordance: subtle chevron on the right edge */}
      <span
        aria-hidden
        className="pointer-events-none md:hidden absolute top-1/2 right-1 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-white/85 dark:bg-surface/85 shadow-[0_2px_6px_rgba(0,0,0,0.08)] animate-pulse"
      >
        <ChevronRight className="w-3.5 h-3.5 text-primary-500" strokeWidth={3} />
      </span>
    </div>
  );
}
