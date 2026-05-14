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
    <div className="relative overflow-hidden aspect-[768/360] md:aspect-auto md:h-[460px] flex flex-col items-center justify-center px-4 md:px-7 pb-[32px] md:pb-[48px] rounded-b-2xl md:rounded-b-3xl">
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
        <h1 className="text-[24px] sm:text-[28px] md:text-[clamp(40px,5vw,68px)] font-extrabold tracking-tight leading-[1.2] md:leading-tight mb-3 md:mb-5 text-white [text-shadow:0_3px_12px_rgba(0,0,0,0.6)] md:[text-shadow:0_4px_18px_rgba(0,0,0,0.45)]">
          {t.rich(keys.titleKey, {
            em: (chunks: ReactNode) => <em className="text-yellow-300 not-italic">{chunks}</em>,
            nowrap: (chunks: ReactNode) => <span className="md:whitespace-nowrap">{chunks}</span>,
          })}
        </h1>
        <p className="text-[18px] sm:text-[20px] md:text-[26px] font-bold text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.7)] md:[text-shadow:0_2px_10px_rgba(0,0,0,0.5)] leading-snug px-1">
          {t.rich(keys.subKey, {
            em: (chunks: ReactNode) => (
              <em className="not-italic text-white text-[32px] sm:text-[36px] md:text-[clamp(56px,7vw,92px)] font-black tracking-tight md:ml-3 relative top-[6px] md:top-[30px] md:[text-shadow:0_4px_20px_rgba(0,0,0,0.55),0_0_28px_rgba(255,255,255,0.35)]">
                {chunks}
              </em>
            ),
            hl: (chunks: ReactNode) => <span className="text-yellow-300">{chunks}</span>,
          })}
        </p>
      </div>
    </div>
  );
}
