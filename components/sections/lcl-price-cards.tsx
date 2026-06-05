"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Truck,
  Ship,
  Plane,
  ArrowRight,
  FileText,
  Warehouse,
  Phone,
  Clock,
  Package,
  Headphones,
  Sparkles,
  Lock,
} from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";
const HOTLINE = "062-603-0456";

// Thai destination receiving warehouse (Bangkok pickup point). Hardcoded Thai —
// consistent with the rest of the LCL page sections (lcl-hero / lcl-services-problems
// / lcl-why-pacred are all hardcoded Thai).
const DEST_WAREHOUSE = "โกดังเพชรเกษม 118";
const TERMS_SUPPORTED = "DDP เอาเอกสาร · EXW · FOB";

type RateMode = "road" | "sea" | "air";
const MODE_ICON: Record<RateMode, typeof Truck> = { road: Truck, sea: Ship, air: Plane };

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
  image, imageAlt, accent, badge, badgeIcon: BadgeIcon, title, sub, h, isFeatured, soon = false, subNowrap = false,
}: {
  image: string; imageAlt: string; accent: string;
  badge: string; badgeIcon: typeof Truck; title: string; sub: string;
  h: string; isFeatured: boolean; soon?: boolean; subNowrap?: boolean;
}) {
  return (
    <div className={`relative ${h} overflow-hidden`}>
      <Image
        src={image}
        alt={imageAlt}
        fill
        sizes="(max-width: 768px) 88vw, 440px"
        className={`object-cover transition-transform duration-500 ${soon ? "grayscale" : "group-hover:scale-[1.08]"}`}
      />
      <div aria-hidden className={`absolute inset-0 ${soon ? "bg-slate-600/45 mix-blend-multiply" : `bg-gradient-to-br ${accent} mix-blend-multiply`}`} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div className="absolute top-3 left-3 z-[2]">
        <span className={[
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-sm text-[10.5px] md:text-[11.5px] font-black tracking-[0.08em] shadow-md",
          isFeatured ? "bg-yellow-300/95 text-primary-800" : "bg-white/95 text-primary-700",
        ].join(" ")}>
          <BadgeIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
          {badge}
        </span>
      </div>
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
function CardFooter({ isFeatured, surface, id, ctaLabel, soon = false }: { isFeatured: boolean; surface: string; id: string; ctaLabel: string; soon?: boolean }) {
  if (soon) {
    return (
      <div className="relative z-10 px-3.5 md:px-4 py-2.5 md:py-3 border-t border-border bg-surface/60 dark:bg-background/60">
        <span className="inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-lg font-black text-[13px] md:text-[13.5px] bg-surface-alt dark:bg-background/60 text-muted border border-dashed border-border cursor-not-allowed">
          <Lock className="w-3.5 h-3.5" strokeWidth={2.6} />
          เปิดให้บริการเร็วๆนี้
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
        {HOTLINE} · ปรึกษา LINE
      </a>
    </div>
  );
}

const FEATURED_CLASS =
  "bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white border-2 border-primary-700 shadow-[0_18px_42px_rgba(179,0,0,0.32)] hover:shadow-[0_28px_60px_rgba(179,0,0,0.45)] md:scale-[1.03] md:-translate-y-1 hover:md:-translate-y-2";
const SIDE_CLASS =
  "bg-white dark:bg-surface text-foreground border border-border shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_42px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1";
const COMING_SOON_CLASS =
  "bg-white dark:bg-surface text-foreground border border-dashed border-border shadow-[0_8px_22px_rgba(15,23,42,0.05)] opacity-95";

// ════════════════════════════════════════════════════════════════════
//  GROUP 1 — ส่งเข้าโกดังจีน (ชื่อชิปปิ้ง) · clearance-style warehouse cards
// ════════════════════════════════════════════════════════════════════

type WarehouseRate = { mode: RateMode; label: string; code: string; price: string; unit: string; kgRate?: string };
type WarehouseCard = {
  id: string; city: string; originName: string; image: string; accent: string;
  rates: WarehouseRate[]; recommended?: boolean; comingSoon?: boolean;
};

const WAREHOUSE_CARDS: WarehouseCard[] = [
  {
    id: "yiwu", city: "อี้อู", originName: "โกดังอี้อู",
    image: "/images/main/importcard/wiwu.png", accent: "from-amber-400/30 to-orange-700/40",
    rates: [
      { mode: "road", label: "ทางรถ",  code: "LCL · TRUCK", price: "฿5,300", unit: "/CBM", kgRate: "฿18/kg" },
      { mode: "sea",  label: "ทางเรือ", code: "LCL · SEA",   price: "฿3,300", unit: "/CBM", kgRate: "฿11/kg" },
      { mode: "air",  label: "ทางแอร์", code: "LCL · AIR",   price: "สอบถาม", unit: "/kg" },
    ],
  },
  {
    id: "guangzhou", city: "กวางโจว", originName: "โกดังกวางโจว",
    image: "/images/main/importcard/gwangzhou.png", accent: "from-primary-500/30 to-primary-800/40",
    recommended: true,
    rates: [
      { mode: "road", label: "ทางรถ",  code: "LCL · TRUCK", price: "฿4,900", unit: "/CBM", kgRate: "฿17/kg" },
      { mode: "sea",  label: "ทางเรือ", code: "LCL · SEA",   price: "฿2,900", unit: "/CBM", kgRate: "฿10/kg" },
      { mode: "air",  label: "ทางแอร์", code: "LCL · AIR",   price: "สอบถาม", unit: "/kg" },
    ],
  },
  {
    id: "shenzhen", city: "เซินเจิ้น", originName: "โกดังเซินเจิ้น",
    image: "/images/main/importcard/senzhen.png", accent: "from-slate-400/30 to-slate-700/40",
    comingSoon: true,
    rates: [
      { mode: "road", label: "ทางรถ",  code: "LCL · TRUCK", price: "—", unit: "" },
      { mode: "sea",  label: "ทางเรือ", code: "LCL · SEA",   price: "—", unit: "" },
      { mode: "air",  label: "ทางแอร์", code: "LCL · AIR",   price: "—", unit: "" },
    ],
  },
];

// Extra terms revealed on hover (desktop) / tap (mobile) over the "Term : EXW" line.
const TERM_NOTES = [
  "ออกใบกำกับ/ใบขน เสีย VAT 7% เท่านั้น",
  "โอนค่าชำระสินค้าผ่านบริษัท",
];

function TermInfo({ feat }: { feat: boolean }) {
  return (
    <div className="mt-auto">
      <div className={`text-[10.5px] font-bold leading-snug ${feat ? "text-white/75" : "text-muted"}`}>
        Term : <span className={feat ? "text-white" : "text-foreground"}>EXW</span>
      </div>
      <ul className={`mt-1.5 space-y-1 rounded-lg border p-2 ${feat ? "bg-white/10 border-white/20" : "bg-surface/60 dark:bg-background/60 border-border"}`}>
        {TERM_NOTES.map((note) => (
          <li key={note} className={`flex items-start gap-1.5 text-[10.5px] font-semibold leading-snug ${feat ? "text-white" : "text-foreground"}`}>
            <span aria-hidden className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${feat ? "bg-yellow-300" : "bg-primary-500"}`} />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WarehouseCardView({ card, isFeatured, isRecommended, onHover }: {
  card: WarehouseCard; isFeatured: boolean; isRecommended: boolean; onHover: () => void;
}) {
  const soon = !!card.comingSoon;
  const feat = isFeatured && !soon;
  return (
    <article
      onMouseEnter={onHover}
      className={[
        "group relative flex flex-col shrink-0 w-[85%] sm:w-[400px] md:w-auto snap-center md:snap-none rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-400",
        soon ? COMING_SOON_CLASS : feat ? FEATURED_CLASS : SIDE_CLASS,
      ].join(" ")}
    >
      {isRecommended && !soon && (
        <div className="absolute top-3 right-3 z-20">
          <span className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-300 text-primary-800 text-[10px] md:text-[11px] font-black tracking-[0.10em] uppercase shadow-[0_4px_12px_rgba(255,213,0,0.45)]">
            <Sparkles className="w-3 h-3" strokeWidth={2.8} />
            แนะนำ
            <span aria-hidden className="absolute inset-0 rounded-full bg-yellow-300 animate-ping opacity-60" />
          </span>
        </div>
      )}
      {feat && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }} />
      )}

      <CardCover
        image={card.image} imageAlt={card.originName} accent={card.accent}
        badge={soon ? "เร็วๆนี้" : "WAREHOUSE RATE"} badgeIcon={soon ? Lock : Warehouse}
        title={card.originName} sub={soon ? "เปิดให้บริการเร็วๆนี้" : `${card.city} → ${DEST_WAREHOUSE}`}
        h="h-32 md:h-40" isFeatured={feat} soon={soon}
      />

      <div className="relative z-10 flex-1 flex flex-col gap-2.5 p-3.5 md:p-4">
        {/* 3 rate rows */}
        <div className="flex flex-col gap-1.5">
          {card.rates.map((r) => {
            const Icon = MODE_ICON[r.mode];
            const quote = soon || r.price === "สอบถาม";
            return (
              <div key={r.mode} className={[
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 border",
                feat ? "bg-white/10 border-white/15" : "bg-surface/60 dark:bg-background/60 border-border",
              ].join(" ")}>
                <div className={[
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  feat ? "bg-white/15 text-yellow-300" : soon ? "bg-border text-muted" : "bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_4px_10px_rgba(179,0,0,0.22)]",
                ].join(" ")}>
                  <Icon className="w-[18px] h-[18px]" strokeWidth={2.4} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-black leading-none ${feat ? "text-white" : "text-foreground"}`}>{r.label}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-[0.06em] mt-1 ${feat ? "text-white/65" : "text-muted"}`}>{r.code}</div>
                </div>
                <div className="shrink-0 flex items-baseline justify-end gap-1 text-right">
                  <span className={[
                    "text-[14px] md:text-[18px] font-black leading-none tabular-nums",
                    quote ? (feat ? "text-white/80" : "text-muted") : (feat ? "text-yellow-300" : "text-primary-600"),
                  ].join(" ")}>
                    {r.price}
                    {r.unit && <span className={`text-[8px] font-bold ${feat ? "text-white/65" : "text-muted"}`}>{r.unit}</span>}
                  </span>
                  {r.kgRate && (
                    <span className={`text-[12px] md:text-[14px] font-black tabular-nums ${feat ? "text-yellow-300" : "text-primary-600"}`}>{r.kgRate}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Term + info tooltip (hover desktop · tap mobile) */}
        <TermInfo feat={feat} />
      </div>

      <CardFooter isFeatured={feat} surface="lcl_warehouse_rate" id={card.id} ctaLabel="ขอใบเสนอราคา ฟรี!" soon={soon} />
    </article>
  );
}

export function WarehouseRateGroup() {
  const recommendedIdx = Math.max(0, WAREHOUSE_CARDS.findIndex((c) => c.recommended));
  const { scrollRef, activeIdx, setActiveIdx } = useActiveCard(recommendedIdx);
  return (
    <section aria-label="ส่งสินค้าเข้าโกดังจีน">
      <header className="mb-3 md:mb-4">
        <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
          WAREHOUSE · ชื่อชิปปิ้ง
        </div>
        <h3 className="text-[19px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
          นำเข้าสินค้าส่งของเข้าโกดัง Cargo
        </h3>
      </header>
      <div ref={scrollRef}
        className="flex overflow-x-auto gap-3 -mx-4 px-[8%] pt-2 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pt-3 md:pb-2 md:snap-none md:items-stretch">
        {WAREHOUSE_CARDS.map((card, i) => (
          <WarehouseCardView
            key={card.id} card={card}
            isFeatured={i === activeIdx && !card.comingSoon} isRecommended={!!card.recommended}
            onHover={() => { if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) setActiveIdx(i); }}
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

function RouteCardView({ card, isFeatured, isRecommended, onHover }: {
  card: RouteCard; isFeatured: boolean; isRecommended: boolean; onHover: () => void;
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
            แนะนำ
            <span aria-hidden className="absolute inset-0 rounded-full bg-yellow-300 animate-ping opacity-60" />
          </span>
        </div>
      )}
      {isFeatured && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "18px 18px" }} />
      )}

      <CardCover
        image={card.image} imageAlt={card.imageAlt} accent={card.accent}
        badge={card.badge} badgeIcon={Icon}
        title={card.title} sub={card.sub}
        h="h-32 md:h-40" isFeatured={isFeatured} subNowrap={card.id === "sea"}
      />

      <div className="relative z-10 flex-1 flex flex-col gap-2.5 p-3.5 md:p-4">
        {/* Price block */}
        <div className={[
          "rounded-xl px-3.5 py-2.5 border",
          isFeatured ? "bg-white/12 border-white/20 backdrop-blur-sm" : "bg-primary-50/60 border-primary-100 dark:bg-primary-900/20 dark:border-primary-800",
        ].join(" ")}>
          <div className={`text-[10px] md:text-[10.5px] font-bold tracking-[0.08em] uppercase leading-none ${isFeatured ? "text-yellow-200/90" : "text-primary-700/80 dark:text-primary-300/80"}`}>
            ค่าบริการ · เริ่มต้น
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`text-[22px] md:text-[26px] font-black leading-none tracking-tight ${isFeatured ? "text-yellow-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" : "text-primary-600 dark:text-primary-300"}`}>
              {card.priceText}
            </span>
            <span className={[
              "ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black shrink-0",
              isFeatured ? "bg-white/15 text-white border border-white/20" : "bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300",
            ].join(" ")}>
              <FileText className="w-3 h-3" strokeWidth={2.6} />
              ใบขนสินค้า
            </span>
          </div>
        </div>

        {/* 3 stat mini-cards */}
        <div className="grid grid-cols-3 gap-1.5 md:gap-2">
          {card.stats.map((s) => {
            const SIcon = s.icon;
            return (
              <div key={s.label} className={[
                "rounded-lg px-1.5 py-1.5 text-center",
                isFeatured ? "bg-white/10 border border-white/15" : "bg-surface/60 dark:bg-background/60 border border-border",
              ].join(" ")}>
                <SIcon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${isFeatured ? "text-yellow-300" : "text-primary-600"}`} strokeWidth={2.6} />
                <div className={`text-[10px] font-bold tracking-tight uppercase ${isFeatured ? "text-white/70" : "text-muted"}`}>{s.label}</div>
                <div className={`text-[11.5px] md:text-[12px] font-black leading-tight ${isFeatured ? "text-white" : "text-foreground"}`}>{s.value}</div>
              </div>
            );
          })}
        </div>

        {/* Services */}
        <ul className={`flex flex-col gap-1 text-[11.5px] md:text-[12px] leading-snug ${isFeatured ? "text-white/95" : "text-foreground/90"}`}>
          {card.services.map((s) => (
            <li key={s} className="flex items-start gap-1.5">
              <span className={`mt-1 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${isFeatured ? "bg-yellow-300" : "bg-primary-600"}`} />
              <span>{s}</span>
            </li>
          ))}
        </ul>

        {/* Partners */}
        <div className="mt-auto pt-1">
          <div className={`text-[10px] font-bold tracking-[0.10em] uppercase mb-1.5 ${isFeatured ? "text-white/65" : "text-foreground/55"}`}>
            พาร์ทเนอร์
          </div>
          <div className="grid grid-cols-4 gap-1.5 items-center">
            {card.carriers.map((carrier) => (
              <a key={carrier.name} href={carrier.url} target="_blank" rel="noopener noreferrer"
                aria-label={`เปิดเว็บไซต์ ${carrier.name}`} title={carrier.name}
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

      <CardFooter isFeatured={isFeatured} surface="lcl_route_import" id={card.id} ctaLabel={`ขอราคา ${card.title} ฟรี`} />
    </article>
  );
}

export function RouteImportGroup() {
  const recommendedIdx = Math.max(0, ROUTE_CARDS.findIndex((c) => c.recommended));
  const { scrollRef, activeIdx, setActiveIdx } = useActiveCard(recommendedIdx);
  return (
    <section aria-label="นำเข้าในชื่อลูกค้า พร้อมใบขนสินค้า">
      <header className="mb-3 md:mb-4">
        <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
          CUSTOMS · ชื่อลูกค้า
        </div>
        <h3 className="text-[19px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
          นำเข้าสินค้า Freight Forwarder
        </h3>
      </header>
      <div ref={scrollRef}
        className="flex overflow-x-auto gap-3 -mx-4 px-[8%] pt-2 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pt-3 md:pb-2 md:snap-none md:items-stretch">
        {ROUTE_CARDS.map((card, i) => (
          <RouteCardView
            key={card.id} card={card}
            isFeatured={i === activeIdx} isRecommended={!!card.recommended}
            onHover={() => { if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) setActiveIdx(i); }}
          />
        ))}
      </div>
    </section>
  );
}
