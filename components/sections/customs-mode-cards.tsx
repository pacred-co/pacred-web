"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Ship,
  Plane,
  Truck,
  Clock,
  Package,
  Headphones,
  Sparkles,
  ArrowRight,
  Lock,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const PATH = "/customs-clearance-shipping-suvarnabhumi";

// Mobile 2-row grid placement (ปอน 2026-06-21): AIR full-width on top, then
// TRUCK + SEA on the second row. `order-*` reorders within the grid (DOM order
// is SEA, AIR, TRUCK); reset to DOM order + single-col on desktop (md+).
const MOBILE_GRID: Record<string, string> = {
  แอร์: "order-1 col-span-2 md:order-none md:col-span-1",
  รถ: "order-2 md:order-none",
  เรือ: "order-3 md:order-none",
};

type Stat = { icon: typeof Clock; label: string; value: string };

export function CustomsModeCards() {
  const t = useTranslations("customsModeCards");

  // Display order = SEA (left) · AIR (middle, FEATURED) · TRUCK (right).
  // Middle card is the recommended option — dark red gradient with yellow
  // accents, "แนะนำ" badge + promo banner — so the eye lands on it first.
  const MODES = [
    {
      mode: "เรือ",
      slug: "laem",
      badge: "SEA FREIGHT",
      badgeIcon: Ship,
      title: t("seaTitle"),
      ports: t("seaPorts"),
      image: "/images/countryport/laemchabanglong.png",
      imageAlt: t("seaImageAlt"),
      accent: "from-sky-500/35 to-blue-700/35",
      price: "2,800",
      featured: false,
      stats: [
        { icon: Clock, label: t("statClearIn"), value: t("statOneDay") },
        { icon: Package, label: t("statSupports"), value: "LCL / FCL" },
        { icon: Headphones, label: t("statFastReply"), value: t("statTwentyFourHr") },
      ] as Stat[],
      services: [
        t("seaService1"),
        t("seaService2"),
        t("seaService3"),
      ],
      carriers: [
        { name: "COSCO", logo: "/images/partners/coscopartner.png", url: "https://lines.coscoshipping.com" },
        { name: "Maersk", logo: "/images/partners/maerskpartner.png", url: "https://www.maersk.com" },
        { name: "Laem Chabang", logo: "/images/partners/laemchabangpartner.png", url: "https://www.laemchabangport.com" },
        { name: "BKP", logo: "/images/partners/bkp.png", url: "https://www.port.co.th/cs/bkp" },
      ],
    },
    {
      mode: "แอร์",
      slug: "bkk",
      badge: "AIR FREIGHT",
      badgeIcon: Plane,
      title: t("airTitle"),
      ports: t("airPorts"),
      image: "/images/countryport/suvannapoomlong.png",
      imageAlt: t("airImageAlt"),
      accent: "from-amber-400/35 to-orange-600/35",
      price: "2,800",
      featured: true,
      stats: [
        { icon: Clock, label: t("statClearIn"), value: t("statOneDay") },
        { icon: Package, label: t("statSupports"), value: "Air Cargo" },
        { icon: Headphones, label: t("statFastReply"), value: t("statTwentyFourHr") },
      ] as Stat[],
      services: [
        t("airService1"),
        t("airService2"),
        t("airService3"),
      ],
      carriers: [
        { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com" },
        { name: "Thai Cargo", logo: "/images/partners/thaicargo.png", url: "https://www.thaicargo.com" },
        { name: "UPS", logo: "/images/partners/upspartner.png", url: "https://www.ups.com" },
        { name: "TNT", logo: "/images/partners/tntpartner.png", url: "https://www.tnt.com" },
      ],
    },
    {
      mode: "รถ",
      slug: "border",
      badge: "TRUCK · LAND",
      badgeIcon: Truck,
      title: t("truckTitle"),
      ports: t("truckPorts"),
      image: "/images/countryport/mukdahanlong.png",
      imageAlt: t("truckImageAlt"),
      accent: "from-red-500/35 to-orange-700/35",
      price: "2,500",
      featured: false,
      stats: [
        { icon: Clock, label: t("statClearIn"), value: t("statOneDay") },
        { icon: Package, label: t("statSupports"), value: "Cross-Border" },
        { icon: Headphones, label: t("statFastReply"), value: t("statTwentyFourHr") },
      ] as Stat[],
      services: [
        t("truckService1"),
        t("truckService2"),
        t("truckService3"),
      ],
      carriers: [
        { name: "FedEx", logo: "/images/partners/fedexpartner.png", url: "https://www.fedex.com" },
        { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com" },
        { name: "Alibaba", logo: "/images/partners/alibabapartner.png", url: "https://www.alibaba.com" },
        { name: "e-Tracking", logo: "/images/partners/etracking.png", url: "https://www.etracking.com" },
      ],
    },
  ];

  // Mobile layout (ปอน 2026-06-21): a 2-row grid — AIR full-width on top, then
  // TRUCK + SEA side-by-side below (see MOBILE_GRID order/span classes). No more
  // swipe carousel. `activeIdx` now drives the DESKTOP hover-zoom only; it starts
  // on the AIR (featured) card so AIR is emphasised on first desktop paint.
  const initialActiveIdx = Math.max(0, MODES.findIndex((m) => m.featured));
  const [activeIdx, setActiveIdx] = useState(initialActiveIdx);

  // Per-card "เงื่อนไข เพิ่มเติม" collapse state (mobile only · keyed by mode).
  // Like the warehouse cards: the details (services + partners) hide behind a
  // toggle on mobile so the 2-up cards stay compact; always shown on desktop.
  const [openTerms, setOpenTerms] = useState<Record<string, boolean>>({});

  return (
    <div className="relative">
      <div className="grid grid-cols-2 gap-3 pt-2 pb-3 md:grid-cols-3 md:gap-4 md:pt-3 md:pb-2 md:items-stretch">
        {MODES.map((c, i) => {
          const Icon = c.badgeIcon;
          // `isRecommended` = the card flagged in MODES data (AIR) — controls
          // the "แนะนำ" badge + promo banner (content-meaningful, stays put).
          // `isFeatured` = the card the user is currently looking at (active)
          // — controls the red gradient styling. Updates on swipe / hover.
          const isRecommended = c.featured;
          // Cards stay white — the active card (hover desktop) gets a slight zoom
          // instead of turning red (owner 2026-06-16).
          const active        = i === activeIdx;
          const isFeatured    = false;
          const showTerms     = !!openTerms[c.mode];
          return (
            <article
              key={c.mode}
              onMouseEnter={() => {
                // Desktop hover drives the active-card zoom (mobile = static grid)
                if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
                  setActiveIdx(i);
                }
              }}
              className={[
                "group relative flex flex-col rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-400",
                MOBILE_GRID[c.mode] ?? "",
                "bg-white dark:bg-surface text-foreground border border-border shadow-[0_8px_22px_rgba(15,23,42,0.06)]",
                // active card (desktop hover) zooms slightly — desktop only
                active ? "md:scale-[1.03] md:z-10" : "",
              ].join(" ")}
            >
              {/* "แนะนำ" tag — content-meaningful, stays only on the AIR card.
                  Not driven by the active-card state. */}
              {isRecommended && (
                <div className="absolute top-3 right-3 z-20">
                  <span className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-300 text-primary-800 text-[10px] md:text-[11px] font-black tracking-[0.10em] uppercase shadow-[0_4px_12px_rgba(255,213,0,0.45)]">
                    <Sparkles className="w-3 h-3" strokeWidth={2.8} />
                    {t("recommended")}
                    <span aria-hidden className="absolute inset-0 rounded-full bg-yellow-300 animate-ping opacity-60" />
                  </span>
                </div>
              )}

              {/* Soft decorative dot pattern (featured) */}
              {isFeatured && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.08]"
                  style={{
                    backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                    backgroundSize: "18px 18px",
                  }}
                />
              )}

              {/* Banner image — MOBILE = clean, sharp photo (FreightCard pattern ·
                  ปอน 2026-06-21 "รูปชัดๆ ไม่เบลอ เฉพาะมือถือ") with the title + price
                  in the white body below · DESKTOP = the original overlay design. */}
              <div className="relative h-32 md:h-40 overflow-hidden">
                <Image
                  src={c.image}
                  alt={c.imageAlt}
                  fill
                  sizes="(max-width: 768px) 92vw, 440px"
                  className="object-cover"
                />
                {/* Dark gradients — DESKTOP only; the mobile photo stays clean & sharp. */}
                <div className={`absolute inset-0 hidden md:block bg-gradient-to-br ${c.accent} mix-blend-multiply`} />
                <div className="absolute inset-0 hidden md:block bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute top-3 left-3">
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-sm text-[10.5px] md:text-[11.5px] font-black tracking-[0.10em] shadow-md",
                      isFeatured
                        ? "bg-yellow-300/95 text-primary-800"
                        : "bg-white/95 text-primary-700",
                    ].join(" ")}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
                    {c.badge}
                  </span>
                </div>
                {/* Title + price OVERLAY — DESKTOP only (mobile shows them in the
                    white body below, over the clean image · ปอน 2026-06-21). */}
                <div className="absolute bottom-3 left-3 right-3 hidden md:block">
                  {/* Title is smaller on the narrow (TRUCK/SEA) cards so it never
                      overflows the banner; the full-width AIR hero keeps it big. */}
                  <h3 className={`${isRecommended ? "text-[18px]" : "text-[14px]"} md:text-[23px] font-black text-white leading-[1.1] tracking-tight line-clamp-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]`}>
                    {c.title}
                  </h3>
                  {/* Price — white strip on the banner, right with the title
                      (ปอน 2026-06-21: "เอาราคาไปอยู่ข้างๆ ทางรถ/เรือ/แอร์ · แถบขาว").
                      The ports list moved into the เงื่อนไข details below so the banner
                      stays clean. The pill holds the number only; "+ ค่าใช้จ่ายอื่น"
                      sits beside it as a white caption (nowrap → never char-wraps). */}
                  <div className="mt-2 flex items-end gap-1.5 flex-wrap">
                    <span className="inline-flex items-baseline gap-1 rounded-lg bg-white px-2.5 py-1 shadow-[0_3px_10px_rgba(0,0,0,0.32)]">
                      <span className="text-[18px] md:text-[21px] font-black leading-none tracking-tight text-primary-600">{c.price}</span>
                      <span className="text-[10px] font-black text-primary-600">{t("baht")}</span>
                    </span>
                    <span className="pb-1 text-[8.5px] font-bold leading-none text-white/85 whitespace-nowrap drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">{t("plusOtherFees")}</span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex-1 flex flex-col gap-2 md:gap-2.5 p-3 md:p-4">
                {/* MOBILE title + price — one row below the clean image (ปอน 2026-06-21
                    "ชื่อ กับ ราคา 2,800 อยู่บรรทัดเดียวกัน"). Desktop renders these on
                    the image overlay instead, so this row is md:hidden. */}
                <div className="md:hidden flex items-center justify-between gap-2">
                  <h3 className="flex-1 min-w-0 text-[12px] font-black leading-[1.15] tracking-tight text-[#111827] dark:text-white line-clamp-2">
                    {c.title}
                  </h3>
                  <div className="shrink-0 text-right leading-none">
                    <span className="inline-flex items-baseline gap-0.5">
                      <span className="text-[17px] font-black tracking-tight leading-none text-primary-600">{c.price}</span>
                      <span className="text-[8.5px] font-black text-primary-600">{t("baht")}</span>
                    </span>
                    <div className="mt-0.5 text-[7px] font-medium text-muted leading-none">{t("plusOtherFees")}</div>
                  </div>
                </div>

                {/* "เงื่อนไข เพิ่มเติม / ย่อ" — plain light text, NO border (ปอน
                    2026-06-21 "ไม่ต้องตีกรอบ · ตัวอักษรบางๆ"), mobile only. Reveals the
                    details below; desktop shows everything so the toggle is hidden there. */}
                <button
                  type="button"
                  onClick={() => setOpenTerms((prev) => ({ ...prev, [c.mode]: !prev[c.mode] }))}
                  aria-expanded={showTerms}
                  className="md:hidden w-full inline-flex items-center justify-start gap-1 py-1 text-[11.5px] font-normal text-slate-500 dark:text-white/55 active:opacity-60 transition-opacity"
                >
                  {showTerms ? "ย่อ" : "เงื่อนไข เพิ่มเติม"}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTerms ? "rotate-180" : ""}`} strokeWidth={2} />
                </button>

                {/* Ports / จุดให้บริการ — moved here from the banner (ปอน 2026-06-21
                    "เอาพวกนี้เข้ามาใส่ในเงื่อนไข"). Collapsed on mobile · always desktop. */}
                <div className={`items-start gap-1.5 text-[11.5px] md:text-[12px] leading-snug text-foreground/85 ${showTerms ? "flex" : "hidden md:flex"}`}>
                  <MapPin className="w-3.5 h-3.5 mt-px shrink-0 text-primary-600" strokeWidth={2.5} />
                  <span>{c.ports}</span>
                </div>

                {/* Spec row — 3 mini cards · hidden on collapsed mobile (folds in
                    with the details so the card stays short), always on desktop. */}
                <div className={`grid grid-cols-3 gap-1.5 md:gap-2 ${showTerms ? "" : "hidden md:grid"}`}>
                  {c.stats.map((s) => {
                    const SIcon = s.icon;
                    return (
                      <div
                        key={s.label}
                        className={[
                          "rounded-lg px-1.5 py-1.5 text-center",
                          isFeatured ? "bg-white/10 border border-white/15" : "bg-surface/60 dark:bg-background/60 border border-border",
                        ].join(" ")}
                      >
                        <SIcon
                          className={[
                            "w-3.5 h-3.5 mx-auto mb-0.5",
                            isFeatured ? "text-yellow-300" : "text-primary-600",
                          ].join(" ")}
                          strokeWidth={2.6}
                        />
                        <div
                          className={[
                            "text-[9px] md:text-[9.5px] font-bold tracking-tight uppercase",
                            isFeatured ? "text-white/70" : "text-muted",
                          ].join(" ")}
                        >
                          {s.label}
                        </div>
                        <div
                          className={[
                            "text-[11.5px] md:text-[12px] font-black leading-tight",
                            isFeatured ? "text-white" : "text-foreground",
                          ].join(" ")}
                        >
                          {s.value}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Details (services + partners) — mobile: collapsed behind the
                    "เงื่อนไข เพิ่มเติม" toggle · desktop: always shown. `contents`
                    is layout-transparent, so desktop renders exactly as before. */}
                <div className={showTerms ? "contents" : "hidden md:contents"}>
                  {/* Services — compact 3 bullets */}
                  <ul
                    className={[
                      "flex flex-col gap-1 text-[11.5px] md:text-[12px] leading-snug",
                      isFeatured ? "text-white/95" : "text-foreground/90",
                    ].join(" ")}
                  >
                    {c.services.map((s) => (
                      <li key={s} className="flex items-start gap-1.5">
                        <span
                          className={[
                            "mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0",
                            isFeatured ? "bg-yellow-300" : "bg-primary-600",
                          ].join(" ")}
                        />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Partner logos — kept compact */}
                  <div className="mt-auto pt-1">
                    <div
                      className={[
                        "text-[9.5px] md:text-[10px] font-bold tracking-[0.10em] uppercase mb-1.5",
                        isFeatured ? "text-white/65" : "text-foreground/55",
                      ].join(" ")}
                    >
                      {t("partners")}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 items-center">
                      {c.carriers.map((carrier) => (
                        <a
                          key={carrier.name}
                          href={carrier.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("openWebsite", { name: carrier.name })}
                          title={carrier.name}
                          className={[
                            "relative h-7 md:h-8 rounded-md flex items-center justify-center p-1 transition-all hover:scale-110",
                            isFeatured ? "bg-white/95 hover:bg-white" : "bg-white border border-border/50 hover:border-primary-300 hover:shadow-md",
                          ].join(" ")}
                        >
                          <Image
                            src={carrier.logo}
                            alt={carrier.name}
                            fill
                            sizes="80px"
                            className="object-contain p-1"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* CTA footer — featured gets yellow CTA, side cards get red */}
              <div
                className={[
                  "relative z-10 px-3.5 md:px-4 py-2.5 md:py-3 border-t",
                  isFeatured ? "border-white/15 bg-black/15 backdrop-blur-sm" : "border-border bg-surface/60 dark:bg-background/60",
                ].join(" ")}
              >
                <Link
                  href={`${PATH}/${c.slug}`}
                  className={[
                    "inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-lg font-black text-[13px] md:text-[13.5px] transition-all duration-300 shadow-[0_4px_14px_rgba(0,0,0,0.15)] hover:scale-[1.02]",
                    isFeatured
                      ? "bg-yellow-300 text-primary-800 hover:bg-yellow-200 shadow-[0_6px_18px_rgba(255,213,0,0.45)]"
                      : "bg-primary-600 text-white hover:bg-primary-700",
                  ].join(" ")}
                >
                  <Lock className="w-3.5 h-3.5" strokeWidth={2.6} />
                  {t("requestPrice", { mode: t(`mode_${c.slug}`) })}
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
