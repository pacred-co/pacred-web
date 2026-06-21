"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Truck,
  Ship,
  Plane,
  ArrowRight,
  FileText,
  Phone,
  Clock,
  Package,
  Headphones,
  Sparkles,
  Lock,
  ChevronDown,
  Send,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

type Translator = ReturnType<typeof useTranslations<"lclPriceCards">>;

const LINE_URL = "/line";
const HOTLINE = "062-603-0456";

// Thai destination receiving warehouse (Bangkok pickup point). Hardcoded Thai —
// consistent with the rest of the LCL page sections (lcl-hero / lcl-services-problems
// / lcl-why-pacred are all hardcoded Thai).
const TERMS_SUPPORTED = "DDP เอาเอกสาร · EXW · FOB";

type RateMode = "road" | "sea" | "air";
const MODE_ICON: Record<RateMode, typeof Truck> = { road: Truck, sea: Ship, air: Plane };
const MODE_IMAGE: Record<RateMode, string> = {
  road: "/images/LCLDETAILED/CAR.png",
  sea: "/images/LCLDETAILED/SHIP.png",
  air: "/images/LCLDETAILED/AIR.png",
};

// ─────────────────────────────────────────────────────────────────────
//  Shared "active card" behaviour — ported from CustomsModeCards:
//  desktop = red follows hover · mobile = red follows the swiped-to card.
// ─────────────────────────────────────────────────────────────────────
function useActiveCard(initialIdx: number) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(initialIdx);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const isMobile = () => !window.matchMedia("(min-width: 768px)").matches;
    const updateActive = () => {
      if (!isMobile()) return;
      const centre = scroller.scrollLeft + scroller.clientWidth / 2;
      const cards = Array.from(scroller.children) as HTMLElement[];
      let idx = 0;
      let best = Infinity;
      cards.forEach((c, i) => {
        const cc = c.offsetLeft + c.clientWidth / 2;
        const d = Math.abs(cc - centre);
        if (d < best) { best = d; idx = i; }
      });
      setActiveIdx(idx);
    };
    requestAnimationFrame(updateActive);
    scroller.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      scroller.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
  }, []);

  return { scrollRef, activeIdx, setActiveIdx };
}

// Shared cover (photo + accent + black gradient + badge pill + title/sub overlay).
function CardCover({
  image, imageAlt, accent, badge, badgeIcon: BadgeIcon, term, title, sub, h, isFeatured, soon = false, subNowrap = false, cleanImage = false,
}: {
  image: string; imageAlt: string; accent: string;
  badge: string; badgeIcon: typeof Truck; term?: string; title: string; sub: string;
  h: string; isFeatured: boolean; soon?: boolean; subNowrap?: boolean; cleanImage?: boolean;
}) {
  return (
    <div className={`relative ${h} overflow-hidden`}>
      <Image
        src={image}
        alt={imageAlt}
        fill
        sizes="(max-width: 768px) 88vw, 440px"
        className={`object-cover ${soon ? "grayscale" : ""}`}
      />
      {soon ? (
        <div aria-hidden className="absolute inset-0 bg-slate-600/45 mix-blend-multiply" />
      ) : cleanImage ? null : (
        <div aria-hidden className={`absolute inset-0 bg-gradient-to-br ${accent} mix-blend-multiply`} />
      )}
      <div aria-hidden className={`absolute inset-0 bg-gradient-to-t to-transparent ${cleanImage ? "from-black/65 via-black/5" : "from-black/80 via-black/30"}`} />
      <div className="absolute top-3 left-3 z-[2]">
        <span className={[
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-sm text-[10.5px] md:text-[11.5px] font-black tracking-[0.08em] shadow-md",
          isFeatured ? "bg-yellow-300/95 text-primary-800" : "bg-white/95 text-primary-700",
        ].join(" ")}>
          <BadgeIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
          {badge}
        </span>
      </div>
      {term && (
        <div className="absolute top-3 right-3 z-[2]">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full backdrop-blur-sm text-[10.5px] md:text-[11.5px] font-black tracking-[0.08em] shadow-md bg-white/95 text-primary-700">
            {term}
          </span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 right-3 z-[2]">
        <h4 className="text-[20px] md:text-[24px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
          {title}
        </h4>
        <p className={`mt-0.5 font-bold text-white/95 drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)] ${subNowrap ? "whitespace-nowrap text-[11px] md:text-[12px]" : "text-[12px] md:text-[13px]"}`}>
          {sub}
        </p>
      </div>
    </div>
  );
}

// Shared CTA footer (primary ขอราคา + LINE secondary).
function CardFooter({ isFeatured, surface, id, ctaLabel, soon = false, hideHotline = false, t }: { isFeatured: boolean; surface: string; id: string; ctaLabel: string; soon?: boolean; hideHotline?: boolean; t: Translator }) {
  if (soon) {
    return (
      <div className="relative z-10 px-3.5 md:px-4 py-2.5 md:py-3 border-t border-border bg-surface/60 dark:bg-background/60">
        <span className="inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-lg font-black text-[13px] md:text-[13.5px] bg-surface-alt dark:bg-background/60 text-muted border border-dashed border-border cursor-not-allowed">
          <Lock className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("comingSoon")}
        </span>
      </div>
    );
  }
  return (
    <div className={[
      "relative z-10 px-3.5 md:px-4 py-2.5 md:py-3 space-y-1.5 border-t",
      isFeatured ? "border-white/15 bg-black/15 backdrop-blur-sm" : "border-border bg-surface/60 dark:bg-background/60",
    ].join(" ")}>
      <TrackedExternalLink
        href={LINE_URL}
        cta="line_consult"
        surface={surface}
        ctaProps={{ card: id }}
        className={[
          "inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-lg font-black text-[13px] md:text-[13.5px] transition-all duration-300 shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:scale-[1.02]",
          isFeatured
            ? "bg-yellow-300 text-primary-800 hover:bg-yellow-200 shadow-[0_6px_18px_rgba(255,213,0,0.45)]"
            : "bg-primary-600 text-white hover:bg-primary-700",
        ].join(" ")}
      >
        {ctaLabel}
        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
      </TrackedExternalLink>
      {!hideHotline && (
        <a
          href={`tel:${HOTLINE.replace(/-/g, "")}`}
          className={[
            "inline-flex w-full items-center justify-center gap-1.5 h-10 rounded-lg font-bold text-[12px] md:text-[12.5px] transition-colors",
            isFeatured
              ? "bg-white/15 text-white border border-white/25 hover:bg-white/25"
              : "bg-white border border-primary-200 text-primary-700 hover:bg-primary-50 hover:border-primary-300 dark:bg-surface dark:border-primary-800 dark:text-primary-200",
          ].join(" ")}
        >
          <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("hotlineLine", { phone: HOTLINE })}
        </a>
      )}
    </div>
  );
}

const FEATURED_CLASS =
  "bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white border-2 border-primary-700 shadow-[0_18px_42px_rgba(179,0,0,0.32)] md:scale-[1.03] md:-translate-y-1";
const SIDE_CLASS =
  "bg-white dark:bg-surface text-foreground border border-border shadow-[0_8px_22px_rgba(15,23,42,0.06)]";

// ════════════════════════════════════════════════════════════════════
//  GROUP 1 — โกดังรับสินค้า Cargo / LCL · destination-warehouse rate cards
//  Full-bleed photo + overlaid rates, modelled on the owner's mockup
//  (/images/mainpage/cargo/china/*PacredF.png) but built clean in the
//  Pacred theme over the plain cover photos. Shenzhen = coming soon.
// ════════════════════════════════════════════════════════════════════

type WarehouseRate = { mode: RateMode; cbm?: string; kg?: string; inquire?: boolean };
type WarehouseCard = { id: string; image: string; accent: string; rates: WarehouseRate[]; soon?: boolean };

// rate-row mode → short i18n label key (รถ/เรือ/แอร์ · Road/Sea/Air)
const WH_MODE_KEY: Record<RateMode, string> = { road: "whMode_road", sea: "whMode_sea", air: "whMode_air" };

const WAREHOUSE_CARDS: WarehouseCard[] = [
  {
    id: "guangzhou",
    image: "/images/mainpage/cargo/china/gwangzhou.png",
    accent: "from-red-600/25 to-orange-700/25",
    rates: [
      { mode: "road", cbm: "4,900", kg: "17" },
      { mode: "sea", cbm: "2,900", kg: "10" },
      { mode: "air", inquire: true },
    ],
  },
  {
    id: "yiwu",
    image: "/images/mainpage/cargo/china/yiwu.png",
    accent: "from-sky-600/25 to-blue-700/25",
    rates: [
      { mode: "road", cbm: "5,500", kg: "18" },
      { mode: "sea", cbm: "2,900", kg: "11" },
      { mode: "air", inquire: true },
    ],
  },
  {
    id: "shenzhen",
    image: "/images/mainpage/cargo/china/zenshen.png",
    accent: "from-slate-700/35 to-slate-900/35", rates: [], soon: true,
  },
];

function WarehouseCardView({ card, active, onHover, t }: { card: WarehouseCard; active: boolean; onHover: () => void; t: Translator }) {
  const city = t(`warehouseOrigin_${card.id}`);
  const [showTerms, setShowTerms] = useState(false);
  return (
    <article
      onMouseEnter={onHover}
      className={[
        // freight-card style: photo on top + white body below (owner 2026-06-18: "ทำการ์ดโกดังให้เป็นแบบการ์ด freight")
        "group relative flex-col rounded-2xl overflow-hidden border border-border bg-white dark:bg-surface transition-all duration-300 shadow-[0_4px_14px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.14)]",
        card.soon ? "hidden md:flex" : "flex", // Shenzhen (coming soon) is hidden on mobile
        active ? "md:shadow-[0_16px_36px_rgba(15,23,42,0.16)]" : "",
      ].join(" ")}
    >
      {/* cover photo + Term badge — 3:2 like the freight port cards */}
      <div className="relative aspect-[3/2] overflow-hidden bg-surface">
        <Image
          src={card.image}
          alt={city}
          fill
          sizes="(max-width: 768px) 46vw, 380px"
          className={`object-cover transition-transform duration-500 group-hover:scale-[1.05] ${card.soon ? "grayscale" : ""}`}
        />
        <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center gap-1.5">
          {card.soon ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full backdrop-blur-sm bg-white/95 text-slate-700 text-[9px] md:text-[11px] font-black tracking-[0.06em] md:tracking-[0.08em] shadow-md">
              <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" strokeWidth={2.6} />
              {t("badgeSoon")}
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 md:px-2.5 md:py-1 rounded-full backdrop-blur-sm bg-white/95 text-primary-700 text-[9px] md:text-[11px] font-black tracking-[0.06em] md:tracking-[0.08em] shadow-md">
              Term: FOB
            </span>
          )}
        </div>
      </div>

      {/* white body — city + rate table + terms + CTA. NO z-index so the mobile
          "เพิ่มเติม" toggle (z-30) can escape above the full-card LINE link (z-20) */}
      <div className="relative flex flex-col gap-2 md:gap-2.5 p-3 md:p-3.5">
        <h4 className="text-[15px] md:text-[19px] font-black leading-tight tracking-tight text-[#111827] dark:text-white">{city}</h4>

        {card.soon ? (
          <>
            {/* rate skeleton — SAME shape as the live cards, "เร็วๆนี้" instead of prices so the soon card matches the pattern */}
            <div className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/10 overflow-hidden bg-slate-50/60 dark:bg-white/5">
              {(["road", "sea", "air"] as RateMode[]).map((m) => {
                const RIcon = MODE_ICON[m];
                return (
                  <div key={m} className="flex items-center gap-1 px-2 py-1.5 md:gap-2 md:px-2.5">
                    <RIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-300 dark:text-white/25 shrink-0" strokeWidth={2.6} />
                    <span className="text-[11px] md:text-[12.5px] font-bold text-slate-400 dark:text-white/50 min-w-[1.6rem] md:min-w-[2.25rem] shrink-0">{t(WH_MODE_KEY[m])}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] md:text-[12px] font-bold text-slate-400 dark:text-white/45">
                      <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" strokeWidth={2.6} />
                      {t("badgeSoon")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* note — mirrors the เงื่อนไข block position */}
            <p className="text-[11px] md:text-[12px] font-semibold text-muted leading-snug">{t("warehouseSoonNote")}</p>
          </>
        ) : (
          <>
            {/* rate table — white-body version: dark labels, RED prices stand out */}
            <div className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/10 overflow-hidden bg-slate-50/60 dark:bg-white/5">
              {card.rates.map((r) => {
                const RIcon = MODE_ICON[r.mode];
                return (
                  <div key={r.mode} className="flex items-center gap-1 px-2 py-1.5 md:gap-2 md:px-2.5">
                    <RIcon className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary-600 dark:text-primary-300 shrink-0" strokeWidth={2.6} />
                    <span className="text-[11px] md:text-[12.5px] font-bold text-slate-600 dark:text-white/80 min-w-[1.6rem] md:min-w-[2.25rem] shrink-0">{t(WH_MODE_KEY[r.mode])}</span>
                    {r.inquire ? (
                      <span className="ml-auto text-[10.5px] md:text-[13px] font-bold text-slate-500 dark:text-white/60">{t("priceInquire")}</span>
                    ) : (
                      <span className="ml-auto flex items-baseline gap-1.5 md:gap-3">
                        <span className="flex items-baseline gap-0.5">
                          <span className="text-[13px] md:text-[19px] font-black text-primary-600 dark:text-primary-300 leading-none tabular-nums tracking-tight">{r.cbm}</span>
                          <span className="text-[8px] md:text-[9.5px] font-bold text-slate-400 dark:text-white/45">CBM</span>
                        </span>
                        <span className="flex items-baseline gap-0.5">
                          <span className="text-[13px] md:text-[19px] font-black text-primary-600 dark:text-primary-300 leading-none tabular-nums tracking-tight">{r.kg}</span>
                          <span className="text-[8px] md:text-[9.5px] font-bold text-slate-400 dark:text-white/45">KG</span>
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* เงื่อนไข — mobile: collapsed behind "เพิ่มเติม" · desktop: always shown */}
            <div className={showTerms ? "block" : "hidden md:block"}>
              <div className="text-[10px] font-black tracking-[0.10em] uppercase text-primary-600 dark:text-primary-300 mb-1">{t("termsLabel")}</div>
              <ul className="flex flex-col gap-0.5">
                {[t("termNote1"), t("termNote2"), t("termNote3")].map((term) => (
                  <li key={term} className="flex items-start gap-1.5 text-[11px] md:text-[11.5px] leading-snug text-slate-600 dark:text-white/75">
                    <span className="mt-1.5 inline-block w-1 h-1 rounded-full bg-primary-500 shrink-0" />
                    <span>{term}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* toggle "เงื่อนไข เพิ่มเติม / ย่อ" — mobile only · slim text · z-30 above the full-card LINE link (z-20) */}
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTerms((v) => !v); }}
              aria-expanded={showTerms}
              className="md:hidden relative z-30 self-start inline-flex items-center gap-0.5 py-0.5 text-[11px] font-bold text-slate-500 dark:text-white/70 active:opacity-70 transition-opacity"
            >
              {showTerms ? "ย่อ" : "เพิ่มเติม"}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTerms ? "rotate-180" : ""}`} strokeWidth={2.6} />
            </button>
          </>
        )}
      </div>

      {/* whole card → LINE (live = free quote · soon = follow for rate updates) */}
      <TrackedExternalLink
        href={LINE_URL}
        cta="line_consult"
        surface="lcl_warehouse_rate"
        ctaProps={{ card: card.id }}
        aria-label={`${card.soon ? t("ctaFollowSoon") : t("ctaQuoteFree")} · ${city}`}
        className="absolute inset-0 z-20"
      >
        <span className="sr-only">{card.soon ? t("ctaFollowSoon") : t("ctaQuoteFree")} · {city}</span>
      </TrackedExternalLink>
    </article>
  );
}

export function WarehouseRateGroup() {
  const t = useTranslations("lclPriceCards");
  const { scrollRef, activeIdx, setActiveIdx } = useActiveCard(0);
  return (
    <section aria-label={t("warehouseSectionAria")}>
      <header className="mb-3 md:mb-4">
        <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
          {t("warehouseEyebrow")}
        </div>
        <h3 className="text-[19px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
          {t("warehouseHeading")}
        </h3>
      </header>

      {/* Warehouse banner (โกดังจีน-ไทย · text baked into image) — clickable → LINE · hover-zoom */}
      <TrackedExternalLink
        href={LINE_URL}
        cta="line_consult"
        surface="lcl_warehouse_rate"
        ctaProps={{ position: "warehouse_banner" }}
        aria-label="โกดังรับสินค้า จีน-ไทย Pacred — ติดต่อทาง LINE"
        className="group relative block mb-3 md:mb-4 overflow-hidden rounded-xl md:rounded-2xl shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
      >
        <Image
          src="/images/mainpage/banner/import-export/warehousec3.png"
          alt="โกดังรับสินค้า จีน-ไทย Pacred — Cargo / LCL นำเข้า-ส่งออก"
          width={2280}
          height={440}
          unoptimized
          sizes="(max-width: 768px) 100vw, 1120px"
          className="w-full h-auto transition-transform duration-500 ease-out group-hover:scale-[1.05]"
        />
      </TrackedExternalLink>

      <div
        ref={scrollRef}
        className="grid grid-cols-2 gap-2.5 pt-2 pb-3 md:grid-cols-3 md:gap-4 md:pt-3 md:pb-2 md:items-stretch"
      >
        {WAREHOUSE_CARDS.map((card, i) => (
          <WarehouseCardView
            key={card.id}
            card={card}
            active={i === activeIdx}
            onHover={() => { if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) setActiveIdx(i); }}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
//  GROUP 2 — นำเข้าในชื่อลูกค้า พร้อมใบขนสินค้า · clearance-style route cards
// ════════════════════════════════════════════════════════════════════

type Stat = { icon: typeof Clock; label: string; value: string };
type Carrier = { name: string; logo: string; url: string };

type RouteCard = {
  id: RateMode; title: string; badge: string; sub: string;
  image: string; imageAlt: string; accent: string;
  priceText: string; recommended?: boolean;
  stats: Stat[]; services: string[]; carriers: Carrier[];
};

const ROUTE_CARDS: RouteCard[] = [
  {
    id: "road", title: "ทางรถ", badge: "LCL · TRUCK", sub: "โหย่วอี้กวน · ด่านตงชิน → มุกดาหาร",
    image: "/images/LCLDETAILED/CAR.png", imageAlt: "นำเข้าทางรถจากจีน Pacred",
    accent: "from-red-500/35 to-orange-700/35", priceText: "ประเมินตามงาน",
    stats: [
      { icon: Clock, label: "ทรานสิต", value: "5–7 วัน" },
      { icon: Package, label: "รองรับ", value: "LCL" },
      { icon: Headphones, label: "ตอบไว", value: "24 ชม." },
    ],
    services: ["นำเข้าในชื่อลูกค้า · ใบขนสินค้า", "ต้นทางจีน: โหย่วอี้กวน · ด่านตงชิน", "ปลายทางไทย: ด่านมุกดาหาร", `Term ${TERMS_SUPPORTED}`],
    carriers: [
      { name: "FedEx", logo: "/images/partners/fedexpartner.png", url: "https://www.fedex.com" },
      { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com" },
      { name: "Alibaba", logo: "/images/partners/alibabapartner.png", url: "https://www.alibaba.com" },
      { name: "e-Tracking", logo: "/images/partners/etracking.png", url: "https://www.etracking.com" },
    ],
  },
  {
    id: "sea", title: "ทางเรือ", badge: "LCL · SEA", sub: "หนานชา · กวางโจว · หนิงโบ → แหลมฉบัง · คลองเตย",
    image: "/images/LCLDETAILED/SHIP.png", imageAlt: "นำเข้าทางเรือจากจีน Pacred",
    accent: "from-sky-500/35 to-blue-700/35", priceText: "ประเมินตาม Port", recommended: true,
    stats: [
      { icon: Clock, label: "ทรานสิต", value: "12–15 วัน" },
      { icon: Package, label: "รองรับ", value: "LCL" },
      { icon: Headphones, label: "ตอบไว", value: "24 ชม." },
    ],
    services: ["นำเข้าในชื่อลูกค้า · ใบขนสินค้า", "ต้นทางจีน: หนานชา · กวางโจว · หนิงโบ · เซี่ยงไฮ้ · เซินเจิ้น", "ปลายทางไทย: แหลมฉบัง · คลองเตย", `Term ${TERMS_SUPPORTED}`],
    carriers: [
      { name: "COSCO", logo: "/images/partners/coscopartner.png", url: "https://lines.coscoshipping.com" },
      { name: "Maersk", logo: "/images/partners/maerskpartner.png", url: "https://www.maersk.com" },
      { name: "Laem Chabang", logo: "/images/partners/laemchabangpartner.png", url: "https://www.laemchabangport.com" },
      { name: "BKP", logo: "/images/partners/bkp.png", url: "https://www.port.co.th/cs/bkp" },
    ],
  },
  {
    id: "air", title: "ทางแอร์", badge: "LCL · AIR", sub: "กว่างโจว · เซินเจิ้น · เซี่ยงไฮ้ → สุวรรณภูมิ · ดอนเมือง",
    image: "/images/LCLDETAILED/AIR.png", imageAlt: "นำเข้าทางอากาศจากจีน Pacred",
    accent: "from-amber-400/35 to-orange-600/35", priceText: "ประเมินตามงาน",
    stats: [
      { icon: Clock, label: "ทรานสิต", value: "3–5 วัน" },
      { icon: Package, label: "รองรับ", value: "Air Cargo" },
      { icon: Headphones, label: "ตอบไว", value: "24 ชม." },
    ],
    services: ["นำเข้าในชื่อลูกค้า · ใบขนสินค้า", "ต้นทางจีน: กว่างโจว · เซินเจิ้น · เซี่ยงไฮ้", "ปลายทางไทย: สุวรรณภูมิ · ดอนเมือง", `Term ${TERMS_SUPPORTED}`],
    carriers: [
      { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com" },
      { name: "Thai Cargo", logo: "/images/partners/thaicargo.png", url: "https://www.thaicargo.com" },
      { name: "UPS", logo: "/images/partners/upspartner.png", url: "https://www.ups.com" },
      { name: "TNT", logo: "/images/partners/tntpartner.png", url: "https://www.tnt.com" },
    ],
  },
];

function RouteCardView({ card, isFeatured, isRecommended, onHover, t }: {
  card: RouteCard; isFeatured: boolean; isRecommended: boolean; onHover: () => void; t: Translator;
}) {
  const Icon = MODE_ICON[card.id];
  return (
    <article
      onMouseEnter={onHover}
      className={[
        "group relative flex flex-col shrink-0 w-[85%] sm:w-[400px] md:w-auto snap-center md:snap-none rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-400",
        isFeatured ? FEATURED_CLASS : SIDE_CLASS,
      ].join(" ")}
    >
      {isRecommended && (
        <div className="absolute top-3 right-3 z-20">
          <span className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-300 text-primary-800 text-[10px] md:text-[11px] font-black tracking-[0.10em] uppercase shadow-[0_4px_12px_rgba(255,213,0,0.45)]">
            <Sparkles className="w-3 h-3" strokeWidth={2.8} />
            {t("recommendedBadge")}
            <span aria-hidden className="absolute inset-0 rounded-full bg-yellow-300 animate-ping opacity-60" />
          </span>
        </div>
      )}
      {isFeatured && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }} />
      )}

      <CardCover
        image={card.image} imageAlt={t(`routeImageAlt_${card.id}`)} accent={card.accent}
        badge={card.badge} badgeIcon={Icon}
        title={t(`routeTitle_${card.id}`)} sub={t(`routeSub_${card.id}`)}
        h="h-32 md:h-40" isFeatured={isFeatured} subNowrap={card.id === "sea"}
      />

      <div className="relative z-10 flex-1 flex flex-col gap-2.5 p-3.5 md:p-4">
        {/* Price block */}
        <div className={[
          "rounded-xl px-3.5 py-2.5 border",
          isFeatured ? "bg-white/12 border-white/20 backdrop-blur-sm" : "bg-primary-50/60 border-primary-100 dark:bg-primary-900/20 dark:border-primary-800",
        ].join(" ")}>
          <div className={`text-[10px] md:text-[10.5px] font-bold tracking-[0.08em] uppercase leading-none ${isFeatured ? "text-yellow-200/90" : "text-primary-700/80 dark:text-primary-300/80"}`}>
            {t("priceLabel")}
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-[22px] md:text-[26px] font-black leading-none tracking-tight ${isFeatured ? "text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" : "text-primary-600 dark:text-primary-300"}`}>
              {t(`routePriceText_${card.id}`)}
            </span>
            <span className={[
              "ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black shrink-0",
              isFeatured ? "bg-white/15 text-white border border-white/20" : "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300",
            ].join(" ")}>
              <FileText className="w-3 h-3" strokeWidth={2.6} />
              {t("customsDocBadge")}
            </span>
          </div>
        </div>

        {/* 3 stat mini-cards */}
        <div className="grid grid-cols-3 gap-1.5 md:gap-2">
          {card.stats.map((s, i) => {
            const SIcon = s.icon;
            return (
              <div key={s.label} className={[
                "rounded-lg px-1.5 py-1.5 text-center",
                isFeatured ? "bg-white/10 border border-white/15" : "bg-surface/60 dark:bg-background/60 border border-border",
              ].join(" ")}>
                <SIcon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${isFeatured ? "text-yellow-300" : "text-primary-600"}`} strokeWidth={2.6} />
                <div className={`text-[10px] font-bold tracking-tight uppercase ${isFeatured ? "text-white/70" : "text-muted"}`}>{t(`statLabel${i}`)}</div>
                <div className={`text-[11.5px] md:text-[12px] font-black leading-tight ${isFeatured ? "text-white" : "text-foreground"}`}>{t(`routeStatValue_${card.id}_${i}`)}</div>
              </div>
            );
          })}
        </div>

        {/* Services */}
        <ul className={`flex flex-col gap-1 text-[11.5px] md:text-[12px] leading-snug ${isFeatured ? "text-white/95" : "text-foreground/90"}`}>
          {card.services.map((s, i) => (
            <li key={s} className="flex items-start gap-1.5">
              <span className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isFeatured ? "bg-yellow-300" : "bg-primary-600"}`} />
              <span>{t(`routeService_${card.id}_${i}`)}</span>
            </li>
          ))}
        </ul>

        {/* Partners */}
        <div className="mt-auto pt-1">
          <div className={`text-[10px] font-bold tracking-[0.10em] uppercase mb-1.5 ${isFeatured ? "text-white/65" : "text-foreground/55"}`}>
            {t("partnersLabel")}
          </div>
          <div className="grid grid-cols-4 gap-1.5 items-center">
            {card.carriers.map((carrier) => (
              <a key={carrier.name} href={carrier.url} target="_blank" rel="noopener noreferrer"
                aria-label={t("partnerOpenSiteAria", { name: carrier.name })} title={carrier.name}
                className={[
                  "relative h-7 md:h-8 rounded-md flex items-center justify-center transition-all hover:scale-110",
                  isFeatured ? "bg-white/95 hover:bg-white" : "bg-white border border-border/50 hover:border-primary-300 hover:shadow-md",
                ].join(" ")}>
                <Image src={carrier.logo} alt={carrier.name} fill sizes="80px" className="object-contain p-1" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <CardFooter isFeatured={isFeatured} surface="lcl_route_import" id={card.id} ctaLabel={t(`routeCtaQuote_${card.id}`)} t={t} />
    </article>
  );
}

export function RouteImportGroup() {
  const t = useTranslations("lclPriceCards");
  const recommendedIdx = Math.max(0, ROUTE_CARDS.findIndex((c) => c.recommended));
  const { scrollRef, activeIdx, setActiveIdx } = useActiveCard(recommendedIdx);
  return (
    <section aria-label={t("routeSectionAria")}>
      <header className="mb-3 md:mb-4">
        <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
          {t("routeEyebrow")}
        </div>
        <h3 className="text-[19px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
          {t("routeHeading")}
        </h3>
      </header>
      <div ref={scrollRef}
        className="flex overflow-x-auto gap-3 -mx-4 px-[8%] pt-2 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pt-3 md:pb-2 md:snap-none md:items-stretch">
        {ROUTE_CARDS.map((card, i) => (
          <RouteCardView
            key={card.id} card={card}
            isFeatured={i === activeIdx} isRecommended={!!card.recommended}
            onHover={() => { if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) setActiveIdx(i); }}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════
//  GROUP 3 — นำเข้า-ส่งออก เฟรท · Trip.com-style cards (mode → type · owner 2026-06-17)
//  Homepage "FREIGHT IMPORT-EXPORT" section. Structure (owner spec):
//    เรือ → FCL · แอร์ → AIR CARGO · รถ → FCL   (the "FCL" label is hidden in UI)
//  Each type shows TWO card-rows: นำเข้า + ส่งออก (export = the นำเข้า routes
//  with origin/dest swapped — "แค่สลับต้นทางกับปลายทาง"). FREIGHT_MODES stores
//  the นำเข้า routes only; ส่งออก is derived at render via swapRoute().
//  = 3 types × 2 directions = 6 card-rows × 4 cards = 24 cards. Trip.com cards
//  (cover photo + route + "เริ่มต้น" price): 2-up grid on mobile · 4-up on
//  desktop. Routes/prices/photos = placeholders (owner fills later).
// ════════════════════════════════════════════════════════════════════

type FreightCard = {
  route: string;     // "ต้นทาง → ปลายทาง" — placeholder, owner fills
  freight?: string;  // FOB freight-only price · omit = "สอบถามเรท"
  unit?: string;     // "฿/ตู้" | "฿/CBM" | "฿/กก."
  size?: string;     // container-size tag — "20'" | "40'" (sea FCL, from the rate sheet)
  carrier?: { name: string; logo: string; url: string }; // shipping line — tag shows the brand logo + links to its website
  image?: string;        // นำเข้า cover photo (China port) · defaults to MODE_IMAGE
  exportImage?: string;  // ส่งออก cover photo (Thai port = the export origin)
};
type FreightType = { type: string; cards: FreightCard[] };          // FCL | LCL | AIR CARGO
type FreightMode = { mode: RateMode; heading: string; types: FreightType[] };

const FREIGHT_MODES: FreightMode[] = [
  { mode: "sea", heading: "เรือ", types: [
    // FOB sea-freight (40HQ · เริ่มต้น/ถูกสุด) from "Pricing - FRE IM SEA FCL" (owner 2026-06-17)
    { type: "SEA FREIGHT", cards: [
      { route: "เซินเจิ้น → แหลมฉบัง", freight: "13,825", unit: "฿/ตู้", size: "40'", carrier: { name: "KMTC", logo: "/images/partners/kmtc.svg", url: "https://www.ekmtc.com" },   image: "/images/mainpage/card/freight/Zenshen.png", exportImage: "/images/mainpage/card/freight/LaemChabang.png" },
      { route: "หนิงโบ → คลองเตย",     freight: "10,500", unit: "฿/ตู้", size: "40'", carrier: { name: "CNC", logo: "/images/partners/cnc.svg", url: "https://www.cnc-line.com" }, image: "/images/mainpage/card/freight/Ningbou.png", exportImage: "/images/mainpage/card/freight/Klongtoey.png" },
      { route: "เซี่ยงไฮ้ → ลาดกระบัง", freight: "15,400", unit: "฿/ตู้", size: "40'", carrier: { name: "OOCL", logo: "/images/partners/oocl.png", url: "https://www.oocl.com" },   image: "/images/mainpage/card/freight/Xianghai.png", exportImage: "/images/mainpage/card/freight/ICDLADKRABANG.png" },
      { route: "กวางโจว → แหลมฉบัง",  freight: "9,100",  unit: "฿/ตู้", size: "40'", carrier: { name: "CUL", logo: "/images/partners/culines.svg", url: "https://www.culines.com" },  image: "/images/mainpage/card/freight/GwangZhou.png", exportImage: "/images/mainpage/card/freight/Laemchabang2.png" },
    ] },
  ] },
  { mode: "air", heading: "แอร์", types: [
    // AIR CARGO rates — บาท/กก. + min-weight tier (owner 2026-06-18). UPS = Shenzhen/Guangzhou, China Cargo = Shanghai/Beijing · ส่งออก = swapRoute ย้อนทาง
    { type: "AIR CARGO", cards: [
      { route: "กว่างโจว → สุวรรณภูมิ", freight: "114", unit: "฿/กก.", size: "100kg+", carrier: { name: "UPS", logo: "/images/partners/upspartner.png", url: "https://www.ups.com" },        image: "/images/mainpage/card/freight/air/gwangzhouairport.png" },
      { route: "เซินเจิ้น → สุวรรณภูมิ", freight: "131", unit: "฿/กก.", size: "100kg+", carrier: { name: "UPS", logo: "/images/partners/upspartner.png", url: "https://www.ups.com" },        image: "/images/mainpage/card/freight/air/zenshenairport.png" },
      { route: "เซี่ยงไฮ้ → ดอนเมือง", freight: "229", unit: "฿/กก.", size: "45kg+",  carrier: { name: "China Cargo", logo: "/images/partners/chinacargo.png", url: "https://www.ckair.com" }, image: "/images/mainpage/card/freight/air/Xianghaiairport.png" },
      { route: "ปักกิ่ง → สุวรรณภูมิ", freight: "213", unit: "฿/กก.", size: "300kg+", carrier: { name: "China Cargo", logo: "/images/partners/chinacargo.png", url: "https://www.ckair.com" }, image: "/images/mainpage/card/freight/air/beijingairport.png" },
    ] },
  ] },
  { mode: "road", heading: "รถ", types: [
    // Truck = overland border freight → the Thai-side destination is the
    // มุกดาหาร land border, never Bangkok (ปอน 2026-06-20: "รถ ไม่มีกรุงเทพ มีแต่มุกดาหาร").
    { type: "TRUCK FREIGHT", cards: [
      // China border → Thai border — overland checkpoints (ปอน 2026-06-20 · "เอา
      // ด่าน ออก มันล้น"). Thai = สะเดา/มุกดาหาร/เบตง/นครพนม · จีน = โหย่วอี้กวน/ตงซิง/โม่ฮาน.
      { route: "โหย่วอี้กวน → สะเดา", image: "/images/mainpage/card/freight/truck/yoiguan.png", exportImage: "/images/mainpage/card/freight/truck/sadao.png" },
      { route: "ตงซิง → มุกดาหาร", image: "/images/mainpage/card/freight/truck/tongsin.png", exportImage: "/images/mainpage/card/freight/truck/mukdahan.png" },
      { route: "โม่ฮาน → เบตง", image: "/images/mainpage/card/freight/truck/mohan1.png", exportImage: "/images/mainpage/card/freight/truck/betong.png" },
      { route: "โม่ฮาน → นครพนม", image: "/images/mainpage/card/freight/truck/mohan2.png", exportImage: "/images/mainpage/card/freight/truck/nakhonpanom.png" },
    ] },
  ] },
];

// ส่งออก = นำเข้า route with origin ↔ destination swapped ("แค่สลับต้นทางกับปลายทาง")
function swapRoute(route: string): string {
  const [origin, dest] = route.split("→").map((s) => s.trim());
  return `${dest} → ${origin}`;
}

function FreightRouteCard({ mode, card, index, total }: {
  mode: RateMode; card: FreightCard; index: number; total: number;
}) {
  const Icon = MODE_ICON[mode];
  const inquire = !card.freight;
  const [origin, dest] = card.route.split("→").map((s) => s.trim());
  const carrier = card.carrier; // shipping line (const → TS narrows it inside the click handler)
  // Mobile masonry (ปอน 2026-06-20 · "เหลื่อมๆแบบ trip"): the FIRST + LAST card in
  // each 4-card row get a TALL cover (3:4), the middle two get the normal SHORT
  // cover (3:2). With `columns-2`, col1=[0,1] col2=[2,3] → tops align (0,2),
  // the middle staggers (1 sits below tall-0, 3 below short-2), bottoms align.
  // Desktop keeps the uniform 3:2 grid card (md:aspect-[3/2]).
  const tall = index === 0 || index === total - 1;

  // Price-expiry tag (ปอน 2026-06-20 · "exp ราคา สุ่มๆ") — a near-future date
  // seeded deterministically by the route so it varies per card yet is stable,
  // and computed client-side (useEffect) so it's always in the FUTURE without an
  // SSR/CSR hydration mismatch. Only priced cards get it (inquire cards stay clean).
  const [exp, setExp] = useState<string | null>(null);
  useEffect(() => {
    if (inquire) return;
    // Defer the setState to a rAF (not synchronous in the effect body · matches
    // useActiveCard's pattern in this file). Client-only → no SSR hydration clash.
    const raf = requestAnimationFrame(() => {
      let h = 0;
      for (let i = 0; i < card.route.length; i++) h = (h * 31 + card.route.charCodeAt(i)) >>> 0;
      const d = new Date();
      d.setDate(d.getDate() + 7 + (h % 36)); // 7–42 days ahead
      setExp(`${d.getDate()}/${d.getMonth() + 1}/${String((d.getFullYear() + 543) % 100).padStart(2, "0")}`);
    });
    return () => cancelAnimationFrame(raf);
  }, [card.route, inquire]);

  return (
    <TrackedExternalLink
      href={LINE_URL}
      cta="line_consult"
      surface="freight_port_card"
      ctaProps={{ position: `freight_${mode}`, route: card.route }}
      aria-label={`เส้นทาง ${card.route} — สอบถามเรทเฟรท Pacred ทาง LINE`}
      className="group mb-2.5 break-inside-avoid flex flex-col rounded-2xl overflow-hidden border border-border bg-white dark:bg-surface shadow-[0_4px_14px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.14)] md:mb-0"
    >
      {/* cover photo + FOB badge — mobile masonry: tall (3:4) for the edge cards,
          short (3:2) for the middle · desktop uniform 3:2 */}
      <div className={`relative ${tall ? "aspect-[4/5]" : "aspect-square"} overflow-hidden bg-surface md:aspect-[3/2]`}>
        <Image
          src={card.image ?? MODE_IMAGE[mode]}
          alt={card.route}
          fill
          sizes="(max-width: 768px) 46vw, 260px"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
        {/* top-left tags — shipping-line (clickable) + FOB, grouped together (owner 2026-06-18) */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
          {carrier && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(carrier.url, "_blank", "noopener,noreferrer"); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); window.open(carrier.url, "_blank", "noopener,noreferrer"); } }}
              aria-label={`เปิดเว็บไซต์สายเรือ ${carrier.name}`}
              title={`สายเรือ ${carrier.name} — เปิดเว็บไซต์`}
              className="cursor-pointer inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-1 shadow-[0_2px_6px_rgba(0,0,0,0.18)] transition-all hover:shadow-[0_3px_11px_rgba(0,0,0,0.28)] hover:scale-[1.06]"
            >
              {/* carrier BRAND LOGO in the tag (ปอน 2026-06-21 · "เอาโลโก้สายเรือ/ups มาเป็นไอคอนใน tag").
                  Mixed PNG/SVG sources → a plain <img> (next/image can't optimise a local SVG without
                  the global dangerouslyAllowSVG flag); the logos are tiny + already crisp here. The pill
                  stays white on hover so the coloured logos never wash out. A plain <img> (not
                  next/image) keeps PNG+SVG uniform; lint's no-img-element warning is accepted here. */}
              <img src={carrier.logo} alt={`สายเรือ ${carrier.name}`} loading="lazy" className="h-4 w-auto max-w-[78px] object-contain" />
              <ArrowRight className="w-2.5 h-2.5 shrink-0 -rotate-45 text-primary-600" strokeWidth={2.6} />
            </span>
          )}
          {/* FOB = sea incoterm — not shown on air cards (rate is ฿/กก., owner 2026-06-18) */}
          {mode !== "air" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/95 text-primary-700 text-[9.5px] font-black tracking-[0.06em] shadow-[0_2px_6px_rgba(0,0,0,0.15)]">
              FOB
            </span>
          )}
        </div>
      </div>

      {/* body — route + price (trip.com style) */}
      <div className="flex flex-col gap-2 p-3 md:p-3.5">
        <div className="flex items-center gap-1 text-[11.5px] md:text-[14px] font-black leading-tight text-[#111827] dark:text-white">
          <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 text-primary-600 dark:text-primary-300" strokeWidth={2.4} />
          <span className="flex-1 min-w-0 line-clamp-2 leading-tight">
            {origin} <span className="font-bold text-muted">→</span> {dest}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          {inquire ? (
            <span className="text-[13px] font-black text-primary-600 dark:text-primary-300">สอบถามเรท</span>
          ) : (
            <>
              <span className="text-[10.5px] font-bold text-muted">เริ่มต้น</span>
              <span className="text-[16px] md:text-[18px] font-black leading-none tabular-nums tracking-tight text-primary-600 dark:text-primary-300">{card.freight}</span>
              <span className="text-[10px] font-bold text-muted">{card.unit}</span>
              {card.size && <span className="text-[10px] font-black text-primary-600 dark:text-primary-300">· {card.size}</span>}
            </>
          )}
        </div>
        {/* Exp — price-valid-until date (only on priced cards · subtle, no clutter).
            min-h reserves the line on SSR so the client fill-in causes no shift. */}
        {!inquire && (
          <span className="-mt-1 min-h-[13px] text-[10px] font-bold leading-none text-muted/80">
            {exp ? `Exp: ${exp}` : ""}
          </span>
        )}
        {/* Book Now CTA — follows the price (owner: not over the photo). Thin full-width
            button so it adds minimal height. Whole card already links to LINE (no nested <a>). */}
        <span className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary-600 px-2 py-1.5 text-white text-[10.5px] font-black tracking-tight leading-none transition-colors duration-200 group-hover:bg-primary-700">
          Booking Now
          <Send className="w-3 h-3 shrink-0" strokeWidth={2.8} />
        </span>
      </div>
    </TrackedExternalLink>
  );
}

export function FreightPortCards() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      {FREIGHT_MODES.map((m) => {
        const Icon = MODE_ICON[m.mode];
        return (
          <div key={m.mode}>
            {/* ── mode heading (เรือ / แอร์ / รถ) · single non-FCL type (e.g. AIR CARGO) shown inline ── */}
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex w-8 h-8 rounded-lg items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_4px_10px_rgba(179,0,0,0.25)]">
                <Icon className="w-[18px] h-[18px]" strokeWidth={2.6} />
              </span>
              <h4 className="text-[17px] md:text-[19px] font-black tracking-[-0.02em] text-[#111827] dark:text-white">{m.heading}</h4>
              {m.types.length === 1 && m.types[0].type !== "FCL" && (
                <>
                  <span className="inline-flex items-center shrink-0 px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-[11px] font-black tracking-[0.06em]">
                    {m.types[0].type}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </>
              )}
            </div>

            {/* ── type sub-rows (FCL / LCL / AIR CARGO) ── */}
            <div className="flex flex-col gap-4 md:gap-5">
              {m.types.map((group) => (
                <div key={group.type}>
                  {/* type label + divider — only when a mode has >1 type (a single non-FCL type sits in the mode heading) */}
                  {m.types.length > 1 && group.type !== "FCL" && (
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="inline-flex items-center shrink-0 px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-[11px] font-black tracking-[0.06em]">
                        {group.type}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  {/* นำเข้า + ส่งออก (export = origin/dest swapped) */}
                  <div className="flex flex-col gap-3.5">
                    {[
                      { dir: "นำเข้า", cards: group.cards },
                      // ส่งออก order reversed so prices don't line up column-for-column with นำเข้า (owner 2026-06-17)
                      { dir: "ส่งออก", cards: group.cards.map((c) => ({ ...c, route: swapRoute(c.route), image: c.exportImage ?? c.image })).reverse() },
                    ].map((sub) => (
                      <div key={sub.dir}>
                        {/* 4 route cards — mobile = Trip-style masonry (2 columns,
                            staggered via per-card cover height) · 4-up grid on desktop */}
                        <div className="columns-2 gap-2.5 md:grid md:grid-cols-4 md:gap-3 md:items-stretch">
                          {sub.cards.map((card, i) => (
                            <FreightRouteCard key={i} mode={m.mode} card={card} index={i} total={sub.cards.length} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
