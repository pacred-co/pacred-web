"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TabMode } from "@/types/booking";

interface BookingTabsProps {
  active: TabMode | null;
  onChange: (mode: TabMode) => void;
  /** Restrict which tabs render (in order). Import-only pages pass
   *  e.g. ["sea","truck","air","customs"] to hide ฝากสั่งซื้อ + ฝากโอน. */
  only?: TabMode[];
}

type TabItem = {
  /** "domestic" = placeholder service (no calculator mode yet → disabled). */
  mode: TabMode | "domestic";
  emoji: string;
  label: string;
  /** short label shown in the 2-row mobile grid (full `label` on desktop). */
  short: string;
  sub: string;
  /** mobile 2-row grouping: transport = row 1 (3-up), service = row 2 (4-up). */
  group: "transport" | "service";
  disabled?: boolean;
};

export function BookingTabs({ active, onChange, only }: BookingTabsProps) {
  const t = useTranslations("bookingCalc");
  const scrollerRef = useRef<HTMLDivElement>(null);

  // The full homepage strip uses the 2-row mobile layout; import-only pages
  // (`only`) keep the original single-row horizontal-scroll strip untouched.
  const twoRow = !only;

  // Scroll-affordance state: show arrows only when there's overflow on that side
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  useEffect(() => {
    if (twoRow) return; // no horizontal scroll in the 2-row layout → no arrows
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
  }, [twoRow]);

  const allTabs: TabItem[] = [
    // row 1 — transport modes
    { mode: "sea",      emoji: "🚢", label: t("tabSeaTitle"),      short: t("tabSeaShort"),      sub: t("tabSeaSub"),      group: "transport" },
    { mode: "truck",    emoji: "🚛", label: t("tabTruckTitle"),    short: t("tabTruckShort"),    sub: t("tabTruckSub"),    group: "transport" },
    { mode: "air",      emoji: "✈️", label: t("tabAirTitle"),      short: t("tabAirShort"),      sub: t("tabAirSub"),      group: "transport" },
    // row 2 — services
    { mode: "sourcing", emoji: "🛒", label: t("tabSourcingTitle"), short: t("tabSourcingShort"), sub: t("tabSourcingSub"), group: "service" },
    { mode: "remit",    emoji: "🏦", label: t("tabRemitTitle"),    short: t("tabRemitShort"),    sub: t("tabRemitSub"),    group: "service" },
    { mode: "customs",  emoji: "👮", label: t("tabCustomsTitle"),  short: t("tabCustomsShort"),  sub: t("tabCustomsSub"),  group: "service" },
    // ขนส่งในประเทศ — not built yet → greyed-out disabled placeholder
    { mode: "domestic", emoji: "🛵", label: t("tabDomesticTitle"), short: t("tabDomesticShort"), sub: t("tabDomesticSub"), group: "service", disabled: true },
  ];
  // Optional allow-list (preserves the `only` array's order).
  const tabs = only
    ? only.map((m) => allTabs.find((tab) => tab.mode === m)).filter((tab): tab is TabItem => Boolean(tab))
    : allTabs;

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
        className={
          twoRow
            // Mobile: 2-row wrap (transport row + services row). Desktop: single centered row.
            ? "flex flex-wrap gap-1 px-2.5 py-1.5 md:flex-nowrap md:overflow-x-auto md:gap-0 md:py-0 md:justify-center md:border-b md:border-gray-200 md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden"
            : "flex overflow-x-auto px-2.5 py-2 md:py-0 gap-1.5 md:gap-0 md:border-b md:border-gray-200 md:justify-center snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_18px,black_calc(100%-18px),transparent)] md:[mask-image:none]"
        }
      >
        {tabs.map(tab => {
          const isActive = !tab.disabled && active === tab.mode;
          // mobile 2-row sizing: transport = 3-up, service = 4-up; flat on desktop
          const basis = twoRow
            ? (tab.group === "transport"
                ? "basis-[31%] grow md:basis-auto md:grow-0"
                : "basis-[22%] grow md:basis-auto md:grow-0")
            : "shrink-0";
          return (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              data-tab={tab.mode}
              aria-selected={isActive}
              disabled={tab.disabled}
              suppressHydrationWarning
              onClick={tab.disabled ? undefined : () => onChange(tab.mode as TabMode)}
              className={[
                "snap-start transition-all whitespace-nowrap",
                basis,
                // shared shell · desktop column-tab with bottom-border indicator (unchanged)
                "inline-flex flex-col items-center rounded-xl border md:flex md:gap-0.5 md:px-[22px] md:py-4 md:rounded-none md:border-0 md:border-b-[3px] md:-mb-px",
                // mobile padding/gap: lean 2-row grid (room for the long "ขนส่งในประเทศ" label on 1 line); original for the single-row strip
                twoRow ? "px-1 py-1 gap-0.5" : "px-3.5 py-2 gap-0",
                tab.disabled
                  ? // Greyed-out placeholder (ขนส่งในประเทศ — not built yet)
                    "cursor-not-allowed bg-gray-50 text-gray-400 border-gray-200 md:bg-transparent md:text-gray-300 md:border-transparent"
                  : isActive
                    ? [
                        "cursor-pointer",
                        // Mobile active: red pill with shadow
                        "bg-red-50 text-red-600 border-red-300 shadow-[0_4px_10px_rgba(220,38,38,0.12)]",
                        // Desktop active: just bottom border + red text
                        "md:bg-transparent md:border-red-600 md:shadow-none",
                      ].join(" ")
                    : [
                        "cursor-pointer",
                        "bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600",
                        "md:bg-transparent md:border-transparent md:border-b-[3px] md:hover:bg-transparent md:hover:text-red-600",
                      ].join(" "),
              ].join(" ")}
            >
              <span
                className={[
                  "font-bold items-center leading-none md:text-sm",
                  // 2-row mobile: emoji stacked over the (short) label. Single-row: emoji beside the full label.
                  twoRow ? "text-[11px] flex flex-col md:flex-row gap-0.5 md:gap-1.5" : "text-[12.5px] flex gap-1.5",
                ].join(" ")}
              >
                <span
                  className={`${twoRow ? "text-[15px]" : "text-[16px]"} md:text-[20px] leading-none transition-all duration-200`}
                  style={{
                    filter: isActive
                      ? "grayscale(1) sepia(1) saturate(10) hue-rotate(320deg) brightness(0.85)"
                      : "grayscale(1) brightness(0.45)",
                  }}
                >{tab.emoji}</span>
                {twoRow ? (
                  <>
                    {/* short label on mobile · full label on desktop */}
                    <span className="md:hidden">{tab.short}</span>
                    <span className="hidden md:inline">{tab.label}</span>
                  </>
                ) : tab.label}
              </span>
              <span className={`hidden md:inline text-[11px] font-medium mt-0.5 ${isActive ? "text-red-500/70" : tab.disabled ? "text-gray-300" : "text-gray-400"}`}>
                {tab.sub}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile scroll affordances — only for the single-row (import-only) layout */}
      {!twoRow && (
        <>
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
        </>
      )}
    </div>
  );
}
