"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HERO_IMGS, HERO_CONTENT_KEYS } from "@/lib/booking-data";
import type { TabMode, SeaMode } from "@/types/booking";

interface BookingHeroProps {
  activeTab: TabMode | null;
  seaMode: SeaMode;
}

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

  const bg = HERO_IMGS[imgKey] ?? HERO_IMGS.default;
  const keys = HERO_CONTENT_KEYS[contentKey] ?? HERO_CONTENT_KEYS.default;

  return (
    <div
      className="relative overflow-hidden min-h-[200px] md:min-h-[280px] flex flex-col items-center justify-center px-4 md:px-7 pt-[26px] md:pt-[50px] pb-[64px] md:pb-[90px] rounded-b-2xl md:rounded-b-3xl"
      style={{ background: `url('${bg}') center/cover no-repeat` }}
    >
      {/* Subtle dark scrim for legibility on mobile */}
      <div
        aria-hidden
        className="md:hidden pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.32) 100%)" }}
      />
      <div className="relative z-10 max-w-[850px] mx-auto text-center text-white">
        <h1 className="text-[22px] sm:text-[26px] md:text-[clamp(28px,4vw,42px)] font-extrabold tracking-tight leading-[1.2] md:leading-tight mb-2 md:mb-3 text-white [text-shadow:0_3px_12px_rgba(0,0,0,0.5)] md:[text-shadow:0_4px_15px_rgba(0,0,0,0.4)]">
          {t.rich(keys.titleKey, {
            em: (chunks: ReactNode) => <em className="text-yellow-300 not-italic">{chunks}</em>,
          })}
        </h1>
        <p className="text-[12.5px] sm:text-[13px] md:text-base font-medium text-white/95 [text-shadow:0_2px_8px_rgba(0,0,0,0.55)] md:[text-shadow:0_2px_10px_rgba(0,0,0,0.5)] leading-snug px-1">
          {t(keys.subKey)}
        </p>
      </div>
    </div>
  );
}
