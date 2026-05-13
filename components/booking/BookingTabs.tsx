"use client";

import { useTranslations } from "next-intl";
import type { TabMode } from "@/types/booking";

interface BookingTabsProps {
  active: TabMode | null;
  onChange: (mode: TabMode) => void;
}

export function BookingTabs({ active, onChange }: BookingTabsProps) {
  const t = useTranslations("bookingCalc");

  const tabs: { mode: TabMode; emoji: string; label: string; sub: string }[] = [
    { mode: "sea",      emoji: "🚢", label: t("tabSeaTitle"),      sub: t("tabSeaSub") },
    { mode: "truck",    emoji: "🚛", label: t("tabTruckTitle"),    sub: t("tabTruckSub") },
    { mode: "air",      emoji: "✈️", label: t("tabAirTitle"),      sub: t("tabAirSub") },
    { mode: "customs",  emoji: "👮", label: t("tabCustomsTitle"),  sub: t("tabCustomsSub") },
    { mode: "sourcing", emoji: "🛒", label: t("tabSourcingTitle"), sub: t("tabSourcingSub") },
    { mode: "remit",    emoji: "🏦", label: t("tabRemitTitle"),    sub: t("tabRemitSub") },
  ];

  return (
    <div className="flex overflow-x-auto border-b border-gray-200 px-2.5 justify-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map(tab => (
        <button
          key={tab.mode}
          type="button"
          role="tab"
          aria-selected={active === tab.mode}
          onClick={() => onChange(tab.mode)}
          className={`flex flex-col items-center gap-0.5 px-[22px] py-4 whitespace-nowrap shrink-0 border-b-[3px] -mb-px transition-all cursor-pointer ${
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
  );
}
