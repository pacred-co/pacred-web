"use client";

import { useMessages, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HERO_IMGS, HERO_CONTENT_KEYS } from "@/lib/booking-data";
import type { TabMode, SeaMode } from "@/types/booking";

interface BookingHeroProps {
  activeTab: TabMode | null;
  seaMode: SeaMode;
  /** Force the default (main/home) banner + content regardless of the active tab.
   *  Used by import-china-lcl to show the standard site banner instead of the
   *  per-tab one. */
  forceDefault?: boolean;
  /** Page-specific headline shown over the (default) banner — overrides the
   *  i18n hero content. e.g. import-china-lcl: "นำเข้าสินค้าจากจีน" + "LCL แชร์ตู้". */
  customTitle?: string;
  customHighlight?: string;
  /** Page-specific banner image overrides (used with the custom-title variant). */
  customBgMobile?: string;
  customBgDesktop?: string;
}

// Per-tab background overrides — mobile/desktop pair for landing pages that
// need a richer hero than the shared `HERO_IMGS` registry in `lib/booking-data.ts`.
const BG_OVERRIDES_MOBILE: Record<string, string> = {
  default: "/images/bannermobile/bannermainmobilde04.png",
  customs: "/images/bannermobile/clearancebanne13.png",
};
const BG_OVERRIDES_DESKTOP: Record<string, string> = {
  default: "/images/bannerdesktop/maindesktop01.png",
  customs: "/images/bannerdesktop/cleardesktop004.png",
  truck:   "/images/bannerdesktop/truckdesktop01.png",
  lcl:     "/images/bannerdesktop/bannershipdesktop01.png",
  fcl:     "/images/bannerdesktop/bannershipdesktop01.png",
};

export function BookingHero({ activeTab, seaMode, forceDefault = false, customTitle, customHighlight, customBgMobile, customBgDesktop }: BookingHeroProps) {
  const t = useTranslations("bookingCalc.hero");
  // Raw messages for the sub-line emptiness guard below. A plain t(subKey) on a
  // message containing rich tags (<hl>/<em>, e.g. customsSub) throws
  // FORMATTING_ERROR ("variable hl was not provided") — so read the raw string
  // (no ICU/tag parsing) to decide whether the <p> renders. The actual render
  // uses t.rich(...) with the hl/em handlers.
  const rawMessages = useMessages() as {
    bookingCalc?: { hero?: Record<string, string> };
  };

  const isDefault = forceDefault || activeTab === null;

  const imgKey = isDefault
    ? "default"
    : activeTab === "sea"
    ? seaMode
    : activeTab;

  const contentKey = isDefault
    ? "default"
    : activeTab === "sea"
    ? seaMode
    : activeTab;

  const fallbackBg = HERO_IMGS[imgKey] ?? HERO_IMGS.default;
  const bgMobile = BG_OVERRIDES_MOBILE[imgKey] ?? fallbackBg;
  const bgDesktop = BG_OVERRIDES_DESKTOP[imgKey] ?? fallbackBg;
  const keys = HERO_CONTENT_KEYS[contentKey] ?? HERO_CONTENT_KEYS.default;
  const rawSub = rawMessages.bookingCalc?.hero?.[keys.subKey] ?? "";

  // Default (home):
  //   mobile  → text left-aligned (left 50%) so it sits over the containers, not the person
  //   desktop → text centred but pushed high so it clears the person in maindesktop.png
  const outerAlign  = "items-center";
  const outerPad    = isDefault ? "px-3 md:px-7" : "px-4 md:px-7";
  const desktopPb   = isDefault ? "md:pb-[180px]" : "md:pb-[96px]";
  // Non-default tabs (customs / sea / truck etc.) have more text (h1 + price sub) so need less
  // bottom padding on mobile to avoid cramping the 160px aspect-ratio banner at 360px.
  const mobilePb    = isDefault ? "pb-[64px]" : "pb-[28px]";
  // Both mobile + desktop: centred container, flex row splits เคลียร์ภาษี|พิธีศุลกากร around the person
  const contentCls  = isDefault
    ? "relative z-10 w-full max-w-[1000px] mx-auto text-center text-white"
    : "relative z-10 max-w-[1000px] mx-auto text-center text-white";

  // Custom headline variant — default banner image + a page-specific title
  // (overrides the i18n hero text). Used by import-china-lcl.
  if (customTitle) {
    return (
      <div className="relative overflow-hidden aspect-[768/340] md:aspect-auto md:h-[400px] flex flex-col items-center justify-center px-3 md:px-7 pb-[64px] md:pb-[180px] rounded-b-2xl md:rounded-b-3xl">
        <div aria-hidden className="md:hidden absolute inset-0" style={{ background: `url('${customBgMobile ?? bgMobile}') center/cover no-repeat` }} />
        <div aria-hidden className="hidden md:block absolute inset-0" style={{ background: `url('${customBgDesktop ?? bgDesktop}') center/cover no-repeat` }} />
        <div className="relative z-10 w-full max-w-[1000px] mx-auto text-center text-white">
          <h1 className="relative -top-8 md:-top-10 text-[clamp(26px,7.3vw,28px)] md:text-[clamp(34px,4.2vw,56px)] font-black tracking-tight leading-[1.1] md:leading-[1.1] text-white [-webkit-text-stroke:1px_#7f1d1d] sm:[-webkit-text-stroke:2px_#7f1d1d] md:[-webkit-text-stroke:8px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_3px_8px_rgba(0,0,0,0.85),0_6px_18px_rgba(0,0,0,0.6)]">
            {customTitle}
            {customHighlight && (
              <> <span className="text-yellow-300 whitespace-nowrap">{customHighlight}</span></>
            )}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden aspect-[768/340] md:aspect-auto md:h-[400px] flex flex-col ${outerAlign} justify-center ${outerPad} ${mobilePb} ${desktopPb} rounded-b-2xl md:rounded-b-3xl`}>
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
      <div className={contentCls}>
        <h1 className="relative top-2 md:top-4 text-[clamp(26px,7.3vw,28px)] md:text-[clamp(34px,4.2vw,56px)] font-black tracking-tight leading-[1.1] md:leading-[1.1] mb-1.5 md:mb-4 text-white [-webkit-text-stroke:1px_#7f1d1d] sm:[-webkit-text-stroke:2px_#7f1d1d] md:[-webkit-text-stroke:8px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_3px_8px_rgba(0,0,0,0.85),0_6px_18px_rgba(0,0,0,0.6)]">
          {t.rich(keys.titleKey, {
            em: (chunks: ReactNode) => (
              <em className="text-yellow-300 not-italic text-[clamp(35px,9.7vw,38px)] sm:text-[42px] md:text-[clamp(50px,6.2vw,78px)] [-webkit-text-stroke:1.5px_#7f1d1d] sm:[-webkit-text-stroke:2.5px_#7f1d1d] md:[-webkit-text-stroke:11px_#7f1d1d]">
                {chunks}
              </em>
            ),
            // nw = always whitespace-nowrap (prevents mid-syllable Thai breaks)
            nw: (chunks: ReactNode) => <span className="whitespace-nowrap">{chunks}</span>,
            // nowrap = whitespace-nowrap but hidden in isDefault (เคลียร์ภาษี lives in flex row)
            nowrap: (chunks: ReactNode) => (
              <span className={`${isDefault ? "hidden " : ""}whitespace-nowrap`}>{chunks}</span>
            ),
            mbr: () => <br aria-hidden className={isDefault ? "hidden" : undefined} />,
          })}
        </h1>
        {rawSub.trim() !== "" && (
          <p className={`${isDefault ? "hidden" : ""} mt-1 md:mt-6 text-[14px] sm:text-[18px] md:text-[22px] font-extrabold text-white [-webkit-text-stroke:0.5px_#7f1d1d] sm:[-webkit-text-stroke:1px_#7f1d1d] md:[-webkit-text-stroke:4px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_2px_6px_rgba(0,0,0,0.8),0_4px_12px_rgba(0,0,0,0.55)] leading-tight md:leading-snug px-1`}>
            {t.rich(keys.subKey, {
              em: (chunks: ReactNode) => (
                <em className="not-italic text-white text-[22px] sm:text-[34px] md:text-[clamp(44px,5vw,66px)] font-black tracking-tight md:ml-2 sm:relative sm:top-[24px] md:top-[40px] [-webkit-text-stroke:1px_#7f1d1d] sm:[-webkit-text-stroke:1.5px_#7f1d1d] md:[-webkit-text-stroke:8px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_3px_10px_rgba(0,0,0,0.85),0_6px_18px_rgba(0,0,0,0.55)]">
                  {chunks}
                </em>
              ),
              hl: (chunks: ReactNode) => <span className="text-yellow-300 sm:relative sm:top-[8px] md:top-[40px] [em_&]:!top-0">{chunks}</span>,
            })}
          </p>
        )}
        {/* Desktop default: เคลียร์ภาษี (left) | พิธีการศุลกากร (right) — avoids person's head in centre */}
        {isDefault && (
          <div className="flex justify-between items-baseline mt-2 md:mt-3">
            <span className="text-[clamp(26px,7.3vw,28px)] md:text-[clamp(34px,4.2vw,56px)] font-black text-white [-webkit-text-stroke:1px_#7f1d1d] md:[-webkit-text-stroke:8px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_3px_8px_rgba(0,0,0,0.85),0_6px_18px_rgba(0,0,0,0.6)] tracking-tight leading-[1.1]">
              เคลียร์ภาษี
            </span>
            <span className="text-[clamp(26px,7.3vw,28px)] md:text-[clamp(34px,4.2vw,56px)] font-black text-white [-webkit-text-stroke:1px_#7f1d1d] md:[-webkit-text-stroke:8px_#7f1d1d] [paint-order:stroke_fill] [text-shadow:0_3px_8px_rgba(0,0,0,0.85),0_6px_18px_rgba(0,0,0,0.6)] tracking-tight leading-[1.1]">
              {t("defaultSub")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
