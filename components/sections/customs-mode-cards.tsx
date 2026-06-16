"use client";

import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const PATH = "/customs-clearance-shipping-suvarnabhumi";

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

  // On mobile (<768px), the carousel snaps to centre and locks the AIR
  // (recommended) card as the default — per ปอน 2026-05-20 night: AIR is the
  // recommended service, so on load AIR is centred and SEA + TRUCK peek
  // in from the sides. Swipes snap-center to whichever card is closest.
  // Desktop stays as a 3-col grid (no scroll).
  const scrollRef   = useRef<HTMLDivElement | null>(null);
  const featuredRef = useRef<HTMLElement   | null>(null);

  // Active card index — the one displayed in the red gradient style.
  // Updates on mobile swipe (closest to viewport centre) + desktop hover
  // (onMouseEnter). Initial value = the MODES index marked `featured: true`
  // (AIR) so first paint matches the previous static layout. Per ปอน
  // 2026-05-20: "ในคอมเป็นเอาเมาส์ไปชี้ สีจะย้ายไปที่ชี้, ในมือถือเลื่อนแล้ว
  // สีไปตกที่การ์ดที่เลื่อนไป".
  const initialActiveIdx = Math.max(0, MODES.findIndex((m) => m.featured));
  const [activeIdx, setActiveIdx] = useState(initialActiveIdx);

  useEffect(() => {
    const scroller = scrollRef.current;
    const card     = featuredRef.current;
    if (!scroller || !card) return;

    const isMobile = () => !window.matchMedia("(min-width: 768px)").matches;

    const centerAirCard = () => {
      if (!isMobile()) return;
      // Centre the featured card within the visible viewport. We avoid
      // scrollIntoView() because it scrolls the WHOLE PAGE Y — we only want
      // the horizontal scroller. scrollLeft= is the simplest reliable form
      // (no behavior arg → instant, no smooth-scroll → no visible jump on
      // first paint).
      const target = card.offsetLeft - (scroller.clientWidth - card.clientWidth) / 2;
      scroller.scrollLeft = Math.max(0, target);
    };

    const updateActive = () => {
      // Mobile only — on desktop the active card is driven by mouse hover.
      if (!isMobile()) return;
      const viewportCentre = scroller.scrollLeft + scroller.clientWidth / 2;
      const cards = Array.from(scroller.children) as HTMLElement[];
      let closestIdx = 0;
      let closestDist = Infinity;
      cards.forEach((c, idx) => {
        const cardCentre = c.offsetLeft + c.clientWidth / 2;
        const dist = Math.abs(cardCentre - viewportCentre);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });
      setActiveIdx(closestIdx);
    };

    // 1) First pass — after current layout. requestAnimationFrame ensures
    //    we run AFTER the browser has computed widths.
    requestAnimationFrame(centerAirCard);

    // 2) Re-run after the banner images load — Next/Image fills the 128px
    //    header on mount but card height + offsets can still shift a tick.
    const imgs = Array.from(card.querySelectorAll("img"));
    const onLoad = () => requestAnimationFrame(centerAirCard);
    imgs.forEach((img) => {
      if (!img.complete) img.addEventListener("load", onLoad, { once: true });
    });

    // 3) Mobile swipe → red follows the centred card.
    scroller.addEventListener("scroll", updateActive, { passive: true });

    // 4) Re-centre on viewport changes (rotation, browser chrome toggle).
    const onResize = () => requestAnimationFrame(centerAirCard);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      scroller.removeEventListener("scroll", updateActive);
      imgs.forEach((img) => img.removeEventListener("load", onLoad));
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-3 -mx-4 px-[8%] pt-2 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pt-3 md:pb-2 md:snap-none md:items-stretch"
      >
        {MODES.map((c, i) => {
          const Icon = c.badgeIcon;
          // `isRecommended` = the card flagged in MODES data (AIR) — controls
          // the "แนะนำ" badge + promo banner (content-meaningful, stays put).
          // `isFeatured` = the card the user is currently looking at (active)
          // — controls the red gradient styling. Updates on swipe / hover.
          const isRecommended = c.featured;
          // Cards stay white — the active card (hover desktop · scroll-centre mobile)
          // gets a slight zoom instead of turning red (owner 2026-06-16).
          const active        = i === activeIdx;
          const isFeatured    = false;
          return (
            <article
              key={c.mode}
              ref={isRecommended ? featuredRef : undefined}
              onMouseEnter={() => {
                // Desktop hover — mobile is driven by the scroll listener instead
                if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
                  setActiveIdx(i);
                }
              }}
              className={[
                "group relative flex flex-col shrink-0 w-[84%] sm:w-[400px] md:w-auto snap-center md:snap-none rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-400",
                "bg-white dark:bg-surface text-foreground border border-border shadow-[0_8px_22px_rgba(15,23,42,0.06)]",
                // active card (scroll-centred mobile · hover desktop) zooms — no red
                active ? "scale-[1.02] md:scale-[1.03] z-10" : "",
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

              {/* Banner image header with title overlay */}
              <div className="relative h-32 md:h-40 overflow-hidden">
                <Image
                  src={c.image}
                  alt={c.imageAlt}
                  fill
                  sizes="(max-width: 768px) 88vw, 440px"
                  className="object-cover"
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${c.accent} mix-blend-multiply`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
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
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="text-[20px] md:text-[24px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
                    {c.title}
                  </h3>
                  <p className="mt-0.5 text-[12px] md:text-[13px] text-white/95 font-bold drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                    {c.ports}
                  </p>
                </div>
              </div>

              <div className="relative z-10 flex-1 flex flex-col gap-2.5 p-3.5 md:p-4">
                {/* Price block — big bold number */}
                <div
                  className={[
                    "rounded-xl px-3.5 py-2.5 border",
                    isFeatured
                      ? "bg-white/12 border-white/20 backdrop-blur-sm"
                      : "bg-primary-50/60 border-primary-100 dark:bg-primary-900/20 dark:border-primary-800",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "text-[10px] md:text-[10.5px] font-bold tracking-[0.10em] uppercase leading-none",
                      isFeatured ? "text-yellow-200/90" : "text-primary-700/80 dark:text-primary-300/80",
                    ].join(" ")}
                  >
                    {t("priceLabel")}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span
                      className={[
                        "text-[30px] md:text-[34px] font-black leading-none tracking-tight",
                        isFeatured ? "text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" : "text-primary-600 dark:text-primary-300",
                      ].join(" ")}
                    >
                      {c.price}
                    </span>
                    <span
                      className={[
                        "text-[14px] md:text-[15px] font-bold",
                        isFeatured ? "text-yellow-200" : "text-primary-700 dark:text-primary-300",
                      ].join(" ")}
                    >
                      {t("baht")}
                    </span>
                    <span
                      className={[
                        "ml-auto text-[10px] md:text-[10.5px] font-medium",
                        isFeatured ? "text-white/70" : "text-muted",
                      ].join(" ")}
                    >
                      {t("plusOtherFees")}
                    </span>
                  </div>
                </div>

                {/* Spec row — 3 mini cards */}
                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
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
