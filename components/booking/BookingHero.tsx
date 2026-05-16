"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HERO_IMGS, HERO_CONTENT_KEYS } from "@/lib/booking-data";
import type { TabMode, SeaMode } from "@/types/booking";

interface BookingHeroProps {
  activeTab: TabMode | null;
  seaMode: SeaMode;
}

// Per-tab background overrides — mobile/desktop pair for landing pages that
// need a richer hero than the shared `HERO_IMGS` registry in `lib/booking-data.ts`.
const BG_OVERRIDES_MOBILE: Record<string, string> = {
  customs: "/images/bannermobile/clearacnebanner.png",
};
const BG_OVERRIDES_DESKTOP: Record<string, string> = {
  customs: "/images/bannerdesktop/clearancedesktop.png",
};

export function BookingHero({ activeTab, seaMode }: BookingHeroProps) {
  const t = useTranslations("bookingCalc.hero");

  const imgKey = activeTab === null
    ? "default"
    : activeTab === "sea"
    ? seaMode
    : activeTab;

  const contentKey = activeTab === null
    ? "default"
    : activeTab === "sea"
    ? seaMode
    : activeTab;

  const fallbackBg = HERO_IMGS[imgKey] ?? HERO_IMGS.default;
  const bgMobile = BG_OVERRIDES_MOBILE[imgKey] ?? fallbackBg;
  const bgDesktop = BG_OVERRIDES_DESKTOP[imgKey] ?? fallbackBg;
  const keys = HERO_CONTENT_KEYS[contentKey] ?? HERO_CONTENT_KEYS.default;

  return (
    <div className="relative overflow-hidden aspect-[768/430] md:aspect-auto md:h-[400px] flex flex-col items-center justify-center px-4 md:px-7 pt-6 pb-[64px] md:pt-0 md:pb-[96px] rounded-b-2xl md:rounded-b-3xl">
      {/* Mobile background */}
      <div
        aria-hidden
        className="md:hidden absolute inset-0"
        style={{ background: `url('${bgMobile}') center/cover no-repeat` }}
      />
      {/* Desktop background */}
      <div
        aria-hidden
        className="hidden md:block absolute inset-0"
        style={{ background: `url('${bgDesktop}') center/cover no-repeat` }}
      />
      <div className="relative z-10 max-w-[1000px] mx-auto text-center text-white">
        <h1 className="text-[22px] sm:text-[26px] md:text-[clamp(36px,4.5vw,60px)] font-black tracking-tight leading-[1.18] md:leading-[1.1] mb-2 md:mb-4 text-white [-webkit-text-stroke:1.5px_#7f1d1d] md:[-webkit-text-stroke:2.5px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_3px_8px_rgba(0,0,0,0.85),0_6px_18px_rgba(0,0,0,0.6)]">
          {t.rich(keys.titleKey, {
            em: (chunks: ReactNode) => <em className="text-yellow-300 not-italic">{chunks}</em>,
            nowrap: (chunks: ReactNode) => <span className="whitespace-nowrap">{chunks}</span>,
          })}
        </h1>
        <p className="mt-3 md:mt-6 text-[16px] sm:text-[18px] md:text-[22px] font-extrabold text-white [-webkit-text-stroke:1px_#7f1d1d] md:[-webkit-text-stroke:1.5px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_6px_rgba(0,0,0,0.8),0_4px_12px_rgba(0,0,0,0.55)] leading-snug px-1">
          {t.rich(keys.subKey, {
            em: (chunks: ReactNode) => (
              <em className="not-italic text-white text-[28px] sm:text-[34px] md:text-[clamp(44px,5vw,66px)] font-black tracking-tight md:ml-2 relative top-[28px] md:top-[60px] [-webkit-text-stroke:1.5px_#7f1d1d] md:[-webkit-text-stroke:2.5px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_3px_10px_rgba(0,0,0,0.85),0_6px_18px_rgba(0,0,0,0.55)]">
                {chunks}
              </em>
            ),
            hl: (chunks: ReactNode) => <span className="text-yellow-300 relative top-[28px] md:top-[60px] [em_&]:!top-0">{chunks}</span>,
          })}
        </p>
      </div>
    </div>
  );
}
