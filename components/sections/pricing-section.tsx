"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Lock,
  Phone,
  Check,
  Ship,
  Star,
  Sparkles,
  Truck,
  Anchor,
  Crown,
  ArrowRight,
  BadgePercent,
  ShieldCheck,
} from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import { WarehouseRateGroup, RouteImportGroup } from "@/components/sections/lcl-price-cards";

const LINE_URL = "/line";
const HOTLINE = "062-603-0456";

type Mode = "cargo" | "freight";
type Term = "DDP" | "EXW" | "FOB";

// ───────────── Country (data — labels resolved via i18n) ─────────────
type Country = {
  code: string;
  nameKey: string;
  flag: string;
  active?: boolean;
  locked?: boolean;
  soon?: boolean;
};

const COUNTRIES: Country[] = [
  { code: "cn", nameKey: "countryCn", flag: "🇨🇳", active: true, locked: true },
  { code: "jp", nameKey: "countryJp", flag: "🇯🇵", soon: true },
  { code: "kr", nameKey: "countryKr", flag: "🇰🇷", soon: true },
  { code: "vn", nameKey: "countryVn", flag: "🇻🇳", soon: true },
  { code: "us", nameKey: "countryUs", flag: "🇺🇸", soon: true },
];

// ───────────── China ports (Freight) ─────────────
const PORTS = [
  { code: "ningbo",    nameKey: "portNingboName",    en: "Ningbo" },
  { code: "nansha",    nameKey: "portNanshaName",    en: "Nansha" },
  { code: "guangzhou", nameKey: "portGuangzhouName", en: "Guangzhou" },
];

// ───────────── Term ─────────────
const TERMS: { id: Term; label: string; descKey: string; modes: Mode[] }[] = [
  { id: "DDP", label: "DDP", descKey: "termDdpDesc", modes: ["cargo", "freight"] },
  { id: "EXW", label: "EXW", descKey: "termExwDesc", modes: ["freight"] }, // FCL only — cargo + LCL are DDP-inclusive
  { id: "FOB", label: "FOB", descKey: "termFobDesc", modes: ["freight"] },
];

// ───────────── Cargo cards (dual price: รถ + เรือ) ─────────────
type CargoPriceMode = "road" | "sea";

type CargoCard = {
  id: string;
  badgeKey?: string;
  comingBadgeKey?: string;
  title: string;
  subtitleKey: string;
  prices: {
    mode: CargoPriceMode;
    cbm: string;    // LCL: ฿/CBM  |  FCL: ฿/ตู้
    kg: string;     // LCL: ฿/กก.  |  FCL: capacity string e.g. "≤ 25 CBM"
    transitKey: string;
  }[];
  noteKey: string;
  popular?: boolean;
  comingSoon?: boolean;
  fclMode?: boolean;   // true = FCL card — changes unit labels
  bgImages?: string[];
  // Banner-style warehouse photo — replaces gradient + silhouettes when set.
  // Source: 1280×580 px landscape (2.2:1). subject กลาง/บน · ขอบล่างโดน gradient ดำทับ.
  heroImage?: string;
};

// ปอน 2026-06-06: หน้าแรกกลุ่ม Cargo-LCL (การ์ดโกดัง 3 ใบ) เปลี่ยนไปใช้
// <WarehouseRateGroup /> (ดีไซน์เดียวกับหน้านำเข้า) → CARGO_CARDS เดิมเลิกใช้แล้ว
// (ดูใน git history ถ้าต้องการ data ชุดเก่า 5,200/3,200 road+sea กลับมา)

// ───────────── Cargo FCL cards (full container, road + sea) ─────────────
const CARGO_FCL_CARDS: CargoCard[] = [
  {
    id: "cargo-fcl-20ft",
    title: "FCL 20ft",
    subtitleKey: "cargoFcl20Subtitle",
    // Per ปอน 2026-05-23: Cargo FCL = door-to-door inclusive → same flat price for road/sea (matches Freight DDP)
    prices: [
      { mode: "road", cbm: "135,000", kg: "≤ 25 CBM", transitKey: "transit5to7"   },
      { mode: "sea",  cbm: "135,000", kg: "≤ 25 CBM", transitKey: "transit12to15" },
    ],
    noteKey: "cargoFcl20Note",
    fclMode: true,
    bgImages: ["/images/catagory/comlaptop.png"],
  },
  {
    id: "cargo-fcl-40hq",
    badgeKey: "cargoFcl40Badge",
    title: "FCL 40HQ",
    subtitleKey: "cargoFcl40Subtitle",
    // Per ปอน 2026-05-23: same flat price for road/sea (matches Freight DDP)
    prices: [
      { mode: "road", cbm: "155,000", kg: "≤ 65 CBM", transitKey: "transit5to7"   },
      { mode: "sea",  cbm: "155,000", kg: "≤ 65 CBM", transitKey: "transit12to15" },
    ],
    noteKey: "cargoFcl40Note",
    fclMode: true,
    popular: true,
    bgImages: ["/images/catagory/camera.png"],
  },
];

// ───────────── Freight cards (Term-varied, split into LCL / FCL rows) ─────────────
type FreightGroup = "lcl" | "fcl";

type FreightCard = {
  id: string;
  group: FreightGroup;
  badgeKey?: string;
  title: string;
  subtitleKey: string;
  unitKey: string;
  price: Record<Term, string>;
  stats: { labelKey: string; valueKey: string }[];
  noteKey: string;
  popular?: boolean;
};

const FREIGHT_CARDS: FreightCard[] = [
  // ── LCL row (ทางรถ + ทางเรือ) — prices per Google Doc rate sheet ──
  {
    id: "lcl-truck",
    group: "lcl",
    badgeKey: "lclTruckBadge",
    title: "LCL ทางรถ",
    subtitleKey: "lclTruckSubtitle",
    unitKey: "lclUnit",
    price: { DDP: "5,500", EXW: "4,900", FOB: "4,200" },
    stats: [
      { labelKey: "statTransit", valueKey: "lclTruckTransit" },
      { labelKey: "statMin",     valueKey: "lclMin" },
    ],
    noteKey: "lclTruckNote",
  },
  {
    id: "lcl-sea",
    group: "lcl",
    badgeKey: "lclSeaBadge",
    title: "LCL ทางเรือ",
    subtitleKey: "lclSeaSubtitle",
    unitKey: "lclUnit",
    price: { DDP: "3,500", EXW: "2,900", FOB: "2,500" },
    stats: [
      { labelKey: "statTransit", valueKey: "lclSeaTransit" },
      { labelKey: "statMin",     valueKey: "lclMin" },
    ],
    noteKey: "lclSeaNote",
    popular: true,
  },
  // ── FCL row (ตู้ 20ft + 40HQ) — DDP/EXW/FOB per Google Doc ──
  {
    id: "fcl20",
    group: "fcl",
    title: "FCL 20ft",
    subtitleKey: "fcl20Subtitle",
    unitKey: "fcl20Unit",
    price: { DDP: "135,000", EXW: "95,000", FOB: "55,000" },
    stats: [
      { labelKey: "statTransit",  valueKey: "fcl20Transit" },
      { labelKey: "statCapacity", valueKey: "fcl20Capacity" },
    ],
    noteKey: "fcl20Note",
  },
  {
    id: "fcl40hq",
    group: "fcl",
    badgeKey: "fcl40Badge",
    title: "FCL 40HQ",
    subtitleKey: "fcl40Subtitle",
    unitKey: "fcl40Unit",
    price: { DDP: "155,000", EXW: "115,000", FOB: "75,000" },
    stats: [
      { labelKey: "statTransit",  valueKey: "fcl40Transit" },
      { labelKey: "statCapacity", valueKey: "fcl40Capacity" },
    ],
    noteKey: "fcl40Note",
    popular: true,
  },
];

const LCL_CARDS = FREIGHT_CARDS.filter((c) => c.group === "lcl");
const FCL_CARDS = FREIGHT_CARDS.filter((c) => c.group === "fcl");

export function PricingSection({
  lclExpanded = false,
}: {
  /** LCL-landing variant: hide the country picker + Cargo/Freight toggle +
   *  port/term toggles, and show BOTH the Cargo-LCL and Freight-LCL sections
   *  stacked (no FCL). Default false = the full home-page pricing. */
  lclExpanded?: boolean;
} = {}) {
  const t = useTranslations("pricing");
  const [mode] = useState<Mode>("cargo");
  const [term, setTerm] = useState<Term>("DDP");
  const [country, setCountry] = useState<string>("cn");
  const [port, setPort] = useState<string>("ningbo");

  const visibleTerms = TERMS.filter((t) => t.modes.includes(mode));

  return (
    <section id="pricing" className="relative pt-2 md:pt-4 pb-10 md:pb-14">
      <div className="relative mx-auto w-full max-w-[1140px] px-[10px]">

        {/* ─── Heading (hidden on the LCL-landing variant · owner 2026-06-05) ─── */}
        {!lclExpanded && (
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            PRICING
          </div>
          <h2 className="text-[28px] md:text-[38px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
            {t("titlePrefix")}
            <span className="text-primary-600">{t("titleHighlight")}</span>
          </h2>
        </div>
        )}

        {/* ─── Country picker (hidden in the lclExpanded variant) ─── */}
        {!lclExpanded && (
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="text-[12px] font-bold text-muted uppercase tracking-[0.12em] mb-2">
            {t("originCountry")}
          </div>
          {/* Country chips — clean modern pill selector */}
          <div className="flex overflow-x-auto gap-2 pb-1 -mx-[10px] px-[10px] md:mx-0 md:px-0 md:pb-0 md:flex-wrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
            {COUNTRIES.map((c) => {
              const selected = country === c.code && c.active;
              const disabled = c.soon || !c.active;
              return (
                <button
                  key={c.code}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setCountry(c.code)}
                  suppressHydrationWarning
                  className={[
                    "inline-flex items-center gap-2 h-[42px] pl-3 pr-4 rounded-full border text-[13.5px] font-semibold transition-all duration-200 focus:outline-none whitespace-nowrap",
                    selected
                      ? "bg-primary-600 border-primary-600 text-white shadow-[0_4px_14px_rgba(179,0,0,0.35)]"
                      : disabled
                        ? "bg-surface dark:bg-surface border-border/60 text-muted opacity-55 cursor-not-allowed"
                        : "bg-white dark:bg-surface border-border hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 text-[#111827] dark:text-foreground cursor-pointer",
                  ].join(" ")}
                >
                  <span className="text-[18px] leading-none">{c.flag}</span>
                  <span>{t(c.nameKey)}</span>
                  {c.soon && (
                    <span className="ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/8 dark:bg-white/10 text-muted leading-none">
                      เร็วๆนี้
                    </span>
                  )}
                  {selected && (
                    <Check className="w-[14px] h-[14px] ml-0.5 shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Cargo / Freight mode toggle removed (owner 2026-06-16) — the homepage
            pricing now shows Cargo (Warehouse-to-Warehouse) only. `mode` is pinned
            to "cargo", so the Freight (Port-to-Port) port picker + render branch
            below stay in the file but are intentionally unreachable here. */}

        {/* ─── Port picker (Freight only) — hidden in the lclExpanded variant ─── */}
        {mode === "freight" && !lclExpanded && (
          <div className="mx-auto mt-4 w-full max-w-[1120px]">
            <div className="text-[12px] font-bold text-muted uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5">
              <Anchor className="w-3.5 h-3.5" strokeWidth={2.5} />
              {t("portOriginLabel")}
            </div>
            <div className="flex overflow-x-auto md:flex-wrap gap-2 pb-1 md:pb-0 -mx-[10px] px-[10px] md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
              {PORTS.map((p) => {
                const selected = port === p.code;
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setPort(p.code)}
                    suppressHydrationWarning
                    className={[
                      "inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-[13px] font-bold transition-all border",
                      selected
                        ? "bg-primary-600 text-white border-primary-600 shadow-[0_6px_14px_rgba(179,0,0,0.25)]"
                        : "bg-white dark:bg-surface text-[#111827] dark:text-white border-border hover:border-primary-300 cursor-pointer",
                    ].join(" ")}
                  >
                    <Anchor className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <span>{t(p.nameKey)}</span>
                    <span className={`text-[10px] font-bold ${selected ? "text-white/80" : "text-muted/80"}`}>
                      {p.en}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Term toggle — hidden when one term only, or in the lclExpanded variant ─── */}
        {visibleTerms.length > 1 && !lclExpanded && (
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="text-[12px] font-bold text-muted uppercase tracking-[0.12em] mb-2">
            {t("termLabel")}
          </div>
          <div className={`flex overflow-x-auto gap-2 pb-1 -mx-[10px] px-[10px] snap-x snap-mandatory md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid ${visibleTerms.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"} [&>*]:shrink-0 [&>*]:w-[78%] [&>*]:min-w-[240px] [&>*]:snap-start md:[&>*]:w-auto md:[&>*]:min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
            {visibleTerms.map((termItem) => {
              const active = term === termItem.id;
              return (
                <button
                  key={termItem.id}
                  type="button"
                  onClick={() => setTerm(termItem.id)}
                  suppressHydrationWarning
                  className={[
                    "group relative text-left p-3 md:p-3.5 rounded-2xl border transition-all duration-300 overflow-hidden",
                    active
                      ? "bg-gradient-to-br from-primary-500 to-primary-700 border-primary-600 text-white shadow-[0_12px_28px_rgba(179,0,0,0.30)] -translate-y-0.5"
                      : "bg-white dark:bg-surface border-border text-[#111827] dark:text-white hover:border-primary-400 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(179,0,0,0.10)] cursor-pointer",
                  ].join(" ")}
                >
                  {active && (
                    <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_3s_infinite]" />
                  )}
                  <div className="relative flex items-center gap-2">
                    <span
                      className={[
                        "inline-flex items-center justify-center w-8 h-8 rounded-lg text-[11px] font-black transition-transform group-hover:scale-110",
                        active
                          ? "bg-white text-primary-600 shadow-[0_4px_10px_rgba(0,0,0,0.15)]"
                          : "bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600 dark:from-primary-900/40 dark:to-primary-900/20",
                      ].join(" ")}
                    >
                      {termItem.label}
                    </span>
                    <span className="text-[14px] font-black">{termItem.label}</span>
                    {active && (
                      <span className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <p className={`relative text-[12px] mt-1.5 leading-[1.45] ${active ? "text-white/90" : "text-muted"}`}>
                    {t(termItem.descKey)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        )}


        {/* ─── Price cards — horizontal swipe on mobile ─── */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          {lclExpanded ? (
            <div className="flex flex-col gap-7 md:gap-10">
              {/* ═════ Group 1 — Warehouse rate cards (ชื่อชิปปิ้ง · รถ/เรือ/แอร์) ═════ */}
              <WarehouseRateGroup />
              {/* ═════ Group 2 — Customer-name import + ใบขนสินค้า (รถ/เรือ/แอร์) ═════ */}
              <RouteImportGroup />
            </div>
          ) : mode === "cargo" ? (
            <div className="flex flex-col gap-7 md:gap-10">
              {/* ═════ Cargo LCL Section — โกดังรับสินค้า (full-card graphic) ═════ */}
              <WarehouseRateGroup />
              {/* ═════ Freight Import-Export Section (heading only — cards TBD) ═════ */}
              <section>
                <header>
                  <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
                    <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
                    {t("cargoFclSectionEyebrow")}
                  </div>
                  <h3 className="text-[19px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                    {t("cargoFclSectionTitle")}
                  </h3>
                </header>
              </section>
            </div>
          ) : (
            <div className="flex flex-col gap-7 md:gap-10">
              {/* ═════ LCL Section ═════ */}
              <FreightGroupRow
                eyebrow={t("lclSectionEyebrow")}
                title={t("lclSectionTitle")}
                sub={t("lclSectionSub")}
                cards={LCL_CARDS}
                term={term}
                t={t}
              />

              {/* ═════ FCL Section ═════ */}
              <FreightGroupRow
                eyebrow={t("fclSectionEyebrow")}
                title={t("fclSectionTitle")}
                sub={t("fclSectionSub")}
                cards={FCL_CARDS}
                term={term}
                t={t}
              />
            </div>
          )}

          {/* Footnote */}
          <p className="mt-5 md:mt-6 text-[11px] md:text-[12px] text-muted text-center leading-[1.5]">
            {t("footnote")}
          </p>
        </div>

      </div>
    </section>
  );
}

// ────────────────── Cargo group row (LCL or FCL with section header) ──────────────────
type PricingT = ReturnType<typeof useTranslations<"pricing">>;

function CargoGroupRow({
  eyebrow, title, sub, cards, cols, t,
}: {
  eyebrow: string; title: string; sub: string;
  cards: CargoCard[]; cols: 2 | 3; t: PricingT;
}) {
  return (
    <section aria-label={title}>
      <header className="mb-3 md:mb-4">
        <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
          {eyebrow}
        </div>
        <h3 className="text-[19px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
          {title}
        </h3>
        <p className="mt-1 text-[12.5px] md:text-[14px] leading-[1.55] font-medium text-muted max-w-[820px]">
          {sub}
        </p>
      </header>
      <div className={`flex overflow-x-auto gap-3 pb-2 -mx-[10px] px-[10px] snap-x snap-mandatory md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:gap-4 [&>*]:shrink-0 [&>*]:w-[80%] [&>*]:min-w-[280px] [&>*]:snap-start md:[&>*]:w-auto md:[&>*]:min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${cols === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {cards.map((card) => (
          <CargoPriceCard key={card.id} card={card} t={t} />
        ))}
      </div>
    </section>
  );
}

// ────────────────── Cargo card (clearance-style header + dual price) ──────────────────

function CargoPriceCard({ card, t }: { card: CargoCard; t: PricingT }) {
  const popular = card.popular;
  const comingSoon = card.comingSoon;
  const isFcl = !!card.fclMode;

  return (
    <div className={`group relative ${popular ? "md:scale-[1.04] z-[1]" : ""}`}>
      {/* Popular glow halo */}
      {popular && (
        <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-br from-primary-400/50 via-primary-600/40 to-primary-800/50 blur-2xl animate-[glow-pulse_3s_ease-in-out_infinite]" />
      )}

      <div className={[
        "relative flex flex-col rounded-3xl overflow-hidden transition-all duration-300 border",
        comingSoon
          ? "border-border/60 shadow-[0_4px_14px_rgba(0,0,0,0.05)]"
          : popular
            ? "border-primary-700 shadow-[0_16px_44px_rgba(179,0,0,0.28)] group-hover:-translate-y-1 group-hover:shadow-[0_28px_56px_rgba(179,0,0,0.38)]"
            : "border-border shadow-[0_8px_22px_rgba(0,0,0,0.07)] group-hover:-translate-y-1 group-hover:shadow-[0_18px_36px_rgba(179,0,0,0.13)] group-hover:border-primary-200",
      ].join(" ")}>

        {/* ── Gradient image header (clearance-card style) ── */}
        <div className={[
          "relative overflow-hidden flex-shrink-0",
          isFcl ? "h-[110px] md:h-[120px]" : "h-[128px] md:h-[140px]",
          comingSoon
            ? "bg-gradient-to-br from-[#94a3b8] via-[#64748b] to-[#475569] bg-[length:200%_200%]"
            : popular
              ? "bg-gradient-to-br from-primary-500 via-primary-600 to-primary-900 bg-[length:200%_200%] animate-[gradient-pan_6s_ease-in-out_infinite]"
              : "bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 bg-[length:200%_200%] animate-[gradient-pan_9s_ease-in-out_infinite]",
        ].join(" ")}>

          {/* Hero warehouse photo — branded tint via mix-blend-multiply.
              When set, replaces the silhouette decorations entirely. */}
          {card.heroImage && (
            <>
              <Image
                src={card.heroImage}
                alt={card.title}
                fill
                sizes="(max-width: 768px) 88vw, 440px"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
              />
              <div
                aria-hidden
                className={[
                  "absolute inset-0 mix-blend-multiply",
                  popular
                    ? "bg-gradient-to-br from-primary-500/30 via-primary-700/25 to-primary-900/45"
                    : "bg-gradient-to-br from-primary-600/25 via-primary-700/20 to-primary-800/35",
                ].join(" ")}
              />
            </>
          )}

          {/* Dot grid — only when no hero photo */}
          {!card.heroImage && (
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "14px 14px" }}
            />
          )}

          {/* Shimmer sweep on hover */}
          <div aria-hidden className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-[1200ms]" />

          {/* Product silhouettes — only when no hero photo */}
          {!card.heroImage && card.bgImages && card.bgImages[0] && (
            <div className="absolute -bottom-5 -right-5 w-[130px] h-[130px] md:w-[148px] md:h-[148px]"
              style={{ filter: "brightness(0) invert(1)" }}>
              <Image src={card.bgImages[0]} alt="" fill sizes="148px" className="object-contain opacity-25" />
            </div>
          )}
          {!card.heroImage && card.bgImages && card.bgImages[1] && (
            <div className="absolute top-3 right-[88px] md:right-[104px] w-[52px] h-[52px] rotate-[14deg]"
              style={{ filter: "brightness(0) invert(1)" }}>
              <Image src={card.bgImages[1]} alt="" fill sizes="52px" className="object-contain opacity-15" />
            </div>
          )}
          {!card.heroImage && card.bgImages && card.bgImages[2] && (
            <div className="absolute -top-2 right-[140px] md:right-[158px] w-[44px] h-[44px] -rotate-[8deg]"
              style={{ filter: "brightness(0) invert(1)" }}>
              <Image src={card.bgImages[2]} alt="" fill sizes="44px" className="object-contain opacity-10" />
            </div>
          )}

          {/* Top badges */}
          {popular && (
            <div className="absolute top-3 left-3 z-[2]">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-br from-yellow-300 to-amber-400 text-primary-800 text-[10px] font-black tracking-[0.08em] rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.22)]">
                <Crown className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                {t("popularBadge")}
              </div>
            </div>
          )}
          {comingSoon && (
            <div className="absolute top-3 right-3 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/20 text-white text-[10px] font-black tracking-[0.08em]">
              <Lock className="w-3 h-3" strokeWidth={3} />
              {t("comingSoon")}
            </div>
          )}
          {card.badgeKey && !popular && !comingSoon && (
            <div className="absolute top-3 left-3 z-[2]">
              <span className="inline-flex items-center text-[10px] font-black px-2.5 py-1 rounded-full bg-white/20 text-white tracking-[0.08em]">
                {t(card.badgeKey)}
              </span>
            </div>
          )}

          {/* Title overlay — bottom of header */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8 bg-gradient-to-t from-black/45 via-black/10 to-transparent">
            <h3 className="text-[22px] md:text-[24px] font-black text-white leading-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
              {card.title}
            </h3>
            <p className="text-[11px] text-white/80 font-medium mt-0.5 leading-snug">
              {t(card.subtitleKey)}
            </p>
          </div>
        </div>

        {/* ── Body (price rows + CTAs) ── */}
        <div className={[
          "flex flex-col flex-1",
          comingSoon
            ? "bg-gradient-to-b from-surface to-surface-alt dark:from-surface dark:to-background"
            : "bg-white dark:bg-surface",
        ].join(" ")}>

          {/* Price block — FCL: single big price (road = sea, แบบ Freight) · LCL: dual rows (รถ + เรือ ราคาต่าง) */}
          {isFcl ? (
            <div className="px-4 md:px-5 pt-4">
              {/* Capacity badge */}
              <div className={[
                "inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full tracking-[0.08em]",
                comingSoon
                  ? "bg-surface text-muted border border-border"
                  : "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300",
              ].join(" ")}>
                {card.prices[0].kg}
              </div>

              {/* Big single price */}
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className={`text-[38px] md:text-[46px] font-black leading-none tracking-tight tabular-nums ${comingSoon ? "text-muted" : "text-primary-600"}`}>
                  {card.prices[0].cbm}
                </span>
                <span className="text-[12px] font-bold text-muted">{t("perContainer")}</span>
              </div>

              {/* Transit row — รถ + เรือ as supporting info */}
              <div className="mt-3 flex items-center gap-x-4 gap-y-1.5 flex-wrap text-[11.5px] font-bold text-muted">
                {card.prices.map((p) => {
                  const isCar = p.mode === "road";
                  const Icon = isCar ? Truck : Ship;
                  return (
                    <span key={p.mode} className="inline-flex items-center gap-1.5">
                      <span className={[
                        "inline-flex w-5 h-5 rounded-md items-center justify-center shrink-0",
                        comingSoon
                          ? "bg-border text-muted"
                          : "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300",
                      ].join(" ")}>
                        <Icon className="w-3 h-3" strokeWidth={2.5} />
                      </span>
                      <span>{isCar ? t("modeRoad") : t("modeSea")}</span>
                      <span className="opacity-50">·</span>
                      <span>{t(p.transitKey)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-4 md:px-5 pt-4 space-y-2">
              {card.prices.map((p) => {
                const isCar = p.mode === "road";
                const Icon = isCar ? Truck : Ship;
                const modeLabel = isCar ? t("modeRoad") : t("modeSea");
                return (
                  <div
                    key={p.mode}
                    className={[
                      "relative flex items-center gap-2.5 rounded-2xl px-3 py-2.5",
                      comingSoon
                        ? "bg-white/40 dark:bg-background/40 border border-dashed border-border"
                        : "bg-gradient-to-br from-surface to-white dark:from-background dark:to-surface border border-border/60",
                    ].join(" ")}
                  >
                    <div className={[
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      comingSoon
                        ? "bg-border text-muted"
                        : "bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_4px_10px_rgba(179,0,0,0.25)]",
                    ].join(" ")}>
                      <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
                        <span>{modeLabel}</span>
                        <span className="opacity-50">·</span>
                        <span>{t(p.transitKey)}</span>
                      </div>
                      <div className="flex items-baseline gap-2.5 flex-wrap mt-0.5">
                        <div className="flex items-baseline gap-1">
                          <span className={`text-[22px] md:text-[24px] font-black leading-none tracking-tight tabular-nums ${comingSoon ? "text-muted" : "text-primary-600"}`}>
                            {p.cbm}
                          </span>
                          <span className="text-[10px] font-bold text-muted">{t("perCbm")}</span>
                        </div>
                        <span className="w-px h-3 bg-border" />
                        <div className="flex items-baseline gap-1">
                          <span className={`text-[17px] md:text-[19px] font-black leading-none tracking-tight tabular-nums ${comingSoon ? "text-muted" : "text-primary-600/90"}`}>
                            {p.kg}
                          </span>
                          <span className="text-[10px] font-bold text-muted">{t("perKg")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Divider with pill */}
          <div className="relative mx-4 md:mx-5 mt-4">
            <div className="border-t border-dashed border-border" />
            <div className={[
              "absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-[0.12em]",
              comingSoon
                ? "bg-surface text-muted border border-border"
                : "bg-white dark:bg-surface text-primary-600 border border-primary-200 dark:border-primary-900",
            ].join(" ")}>
              <BadgePercent className="w-2.5 h-2.5" strokeWidth={2.5} />
              {t("carePill")}
            </div>
          </div>

          <div className="px-4 md:px-5 pb-4 md:pb-5 pt-5 flex-1 flex flex-col">
            {/* Note */}
            <div className={[
              "flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-[11.5px] md:text-[12px] leading-[1.5]",
              comingSoon
                ? "bg-white/40 dark:bg-background/40 text-muted border border-dashed border-border"
                : "bg-gradient-to-br from-primary-50/80 to-primary-50/40 text-[#111827] dark:from-primary-900/20 dark:to-primary-900/5 dark:text-white/85 border border-primary-100 dark:border-primary-900/40",
            ].join(" ")}>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${comingSoon ? "bg-border text-muted" : "bg-primary-600 text-white"}`}>
                <Sparkles className="w-3 h-3" strokeWidth={2.5} />
              </div>
              <span className="pt-0.5">{t(card.noteKey)}</span>
            </div>

            {/* Compliance note */}
            {!comingSoon && (
              <div className="flex items-center gap-1.5 mb-3 text-[10px] font-bold leading-snug text-muted">
                <ShieldCheck className="w-3 h-3 shrink-0" strokeWidth={2.5} />
                <span>{t("cargoNoticeBadge")} · {t("cargoNoticeTitle")}</span>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-auto flex flex-col gap-2">
              {comingSoon ? (
                <button type="button" disabled suppressHydrationWarning
                  className="w-full inline-flex items-center justify-center gap-1.5 h-[44px] rounded-xl text-[13px] font-black bg-surface-alt dark:bg-background/60 text-muted border border-dashed border-border cursor-not-allowed">
                  <Lock className="w-4 h-4" strokeWidth={2.5} />
                  {t("notServingYet")}
                </button>
              ) : (
                <>
                  <TrackedExternalLink
                    href={LINE_URL}
                    cta="line_consult"
                    surface="pricing_cargo"
                    ctaProps={{ card: card.id }}
                    className="relative w-full inline-flex items-center justify-center gap-1.5 h-[44px] rounded-xl text-[13px] font-black transition-all duration-300 overflow-hidden group/cta bg-gradient-to-br from-primary-500 to-primary-700 text-white hover:shadow-[0_10px_22px_rgba(179,0,0,0.35)]"
                  >
                    <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover/cta:translate-x-full transition-transform duration-700" />
                    <svg className="w-4 h-4 shrink-0 relative" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3c-4.97 0-9 3.185-9 7.108 0 2.115 1.155 4.025 3.09 5.303-.234.996-1.127 2.378-1.218 2.518-.088.183.056.36.24.316.593-.14 2.875-.726 4.35-1.928 1.48.566 3.14.898 4.908.898 4.97 0 9-3.184 9-7.107S16.97 3 12 3z" />
                    </svg>
                    <span className="relative">{t("ctaQuote")}</span>
                    <ArrowRight className="w-4 h-4 relative transition-transform duration-300 group-hover/cta:translate-x-1" strokeWidth={3} />
                </TrackedExternalLink>

                <a
                  href={`tel:${HOTLINE.replace(/-/g, "")}`}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-[40px] rounded-xl text-[12.5px] font-bold border border-border text-[#111827] dark:text-white hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-all duration-300"
                >
                  <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {t("ctaCallPrefix")} {HOTLINE}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}

// ────────────────── Freight group row (LCL or FCL with header) ──────────────────
function FreightGroupRow({
  eyebrow,
  title,
  sub,
  cards,
  term,
  t,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  cards: FreightCard[];
  term: Term;
  t: PricingT;
}) {
  return (
    <section aria-label={title}>
      <header className="mb-3 md:mb-4">
        <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
          {eyebrow}
        </div>
        <h3 className="text-[19px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
          {title}
        </h3>
        <p className="mt-1 text-[12.5px] md:text-[14px] leading-[1.55] font-medium text-muted max-w-[820px]">
          {sub}
        </p>
      </header>

      <div className="flex overflow-x-auto gap-3 pb-2 -mx-[10px] px-[10px] snap-x snap-mandatory sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 sm:gap-4 [&>*]:shrink-0 [&>*]:w-[84%] [&>*]:min-w-[280px] [&>*]:snap-start sm:[&>*]:w-auto sm:[&>*]:min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((card) => (
          <FreightPriceCard key={card.id} card={card} term={term} t={t} />
        ))}
      </div>
    </section>
  );
}

// ────────────────── Freight card (Term-varied / LCL clearance-style) ──────────────────
function FreightPriceCard({ card, term, t }: { card: FreightCard; term: Term; t: PricingT }) {
  const isLcl = card.group === "lcl";

  // ── LCL cards: clearance-page card style (image-top, always DDP) ──
  if (isLcl) {
    const displayPrice = card.price.DDP; // LCL is always DDP-inclusive
    const popular = card.popular;
    const Icon = card.id === "lcl-truck" ? Truck : Ship;

    return (
      <div className={`group relative ${popular ? "md:scale-[1.03] z-[1]" : ""}`}>
        {popular && (
          <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-br from-primary-400/50 via-primary-600/40 to-primary-800/50 blur-2xl animate-[glow-pulse_3s_ease-in-out_infinite]" />
        )}

        <div className="relative flex flex-col bg-white dark:bg-surface rounded-2xl md:rounded-3xl overflow-hidden border border-[rgba(229,231,235,0.95)] dark:border-border shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition-all duration-300 group-hover:shadow-[0_18px_42px_rgba(15,23,42,0.15)] group-hover:border-primary-300 group-hover:-translate-y-0.5">

          {/* Popular crown badge */}
          {popular && (
            <div className="absolute -top-px left-5 z-[5]">
              <div className="relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-yellow-300 to-amber-400 text-primary-800 text-[10px] font-black tracking-[0.08em] rounded-b-xl shadow-[0_6px_14px_rgba(0,0,0,0.18)]">
                <Crown className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                {t("popularBadge")}
              </div>
            </div>
          )}

          {/* Gradient header — replaces image (no photo available) */}
          <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900">
            {/* Dot-pattern overlay */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "14px 14px",
              }}
            />
            {/* Watermark icon */}
            <div aria-hidden className="absolute -right-5 -bottom-5 opacity-[0.13] text-white pointer-events-none">
              <Icon className="w-40 h-40" strokeWidth={0.8} />
            </div>

            {/* Top-left icon badge (clearance card style) */}
            <div
              className="absolute left-3 top-3 w-11 h-11 md:w-[52px] md:h-[52px] rounded-full border-[3px] border-white flex items-center justify-center overflow-hidden z-[4]"
              style={{
                background: "linear-gradient(135deg,#ff3030,#b8002e)",
                boxShadow: "0 8px 18px rgba(185,28,28,0.42)",
              }}
            >
              <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" strokeWidth={2.5} />
            </div>

            {/* Bottom tags */}
            <div className="absolute left-2.5 right-2.5 bottom-2.5 flex gap-1.5 flex-wrap z-[3]">
              {card.badgeKey && (
                <span className="flex-none px-2 py-1 rounded-full bg-white/95 text-[#b91c1c] border border-white/80 text-[9px] md:text-[10px] font-black shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                  {t(card.badgeKey)}
                </span>
              )}
              <span className="flex-none px-2 py-1 rounded-full bg-white/95 text-[#b91c1c] border border-white/80 text-[9px] md:text-[10px] font-black shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                DDP รวมภาษี
              </span>
            </div>
          </div>

          {/* Info section */}
          <div className="p-4 md:p-5 flex flex-col flex-1">
            <h3 className="text-[16px] md:text-[19px] font-black leading-tight text-[#111827] dark:text-white mb-0.5">
              {card.title}
            </h3>
            <p className="text-[11px] md:text-[12.5px] text-muted mb-3 leading-snug">{t(card.subtitleKey)}</p>

            {/* Price — clearance style: "เริ่มต้น X,XXX ฿/CBM" */}
            <p className="text-[15px] md:text-[18px] font-black text-[#dc2626] mb-3 leading-tight whitespace-nowrap">
              เริ่มต้น {displayPrice} {t(card.unitKey)}
            </p>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {card.stats.map((s) => (
                <div
                  key={s.labelKey}
                  className="rounded-xl px-3 py-2 border border-border/60 bg-gradient-to-br from-surface to-white dark:from-background dark:to-surface"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">{t(s.labelKey)}</div>
                  <div className="text-[13px] font-black mt-0.5 tabular-nums text-[#111827] dark:text-white">{t(s.valueKey)}</div>
                </div>
              ))}
            </div>

            {/* Note box */}
            <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-[11.5px] md:text-[12px] leading-[1.5] bg-gradient-to-br from-primary-50/80 to-primary-50/40 dark:from-primary-900/20 dark:to-primary-900/5 text-[#111827] dark:text-white/85 border border-primary-100 dark:border-primary-900/40">
              <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-primary-600 text-white">
                <Sparkles className="w-3 h-3" strokeWidth={2.5} />
              </div>
              <span className="pt-0.5">{t(card.noteKey)}</span>
            </div>

            {/* CTAs */}
            <div className="mt-auto flex flex-col gap-2">
              <TrackedExternalLink
                href={LINE_URL}
                cta="line_consult"
                surface="pricing_freight"
                ctaProps={{ card: card.id, term: "DDP" }}
                className="relative w-full inline-flex items-center justify-center gap-1.5 h-[44px] rounded-xl text-[13px] font-black transition-all duration-300 overflow-hidden group/cta bg-gradient-to-br from-primary-500 to-primary-700 text-white hover:shadow-[0_10px_22px_rgba(179,0,0,0.35)]"
              >
                <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover/cta:translate-x-full transition-transform duration-700" />
                <svg className="w-4 h-4 shrink-0 relative" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3c-4.97 0-9 3.185-9 7.108 0 2.115 1.155 4.025 3.09 5.303-.234.996-1.127 2.378-1.218 2.518-.088.183.056.36.24.316.593-.14 2.875-.726 4.35-1.928 1.48.566 3.14.898 4.908.898 4.97 0 9-3.184 9-7.107S16.97 3 12 3z" />
                </svg>
                <span className="relative">{t("ctaQuote")}</span>
                <ArrowRight className="w-4 h-4 relative transition-transform duration-300 group-hover/cta:translate-x-1" strokeWidth={3} />
              </TrackedExternalLink>
              <a
                href={`tel:${HOTLINE.replace(/-/g, "")}`}
                className="w-full inline-flex items-center justify-center gap-1.5 h-[40px] rounded-xl text-[12.5px] font-bold border transition-all duration-300 border-border text-[#111827] dark:text-white hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700"
              >
                <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
                {t("ctaCallPrefix")} {HOTLINE}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── FCL cards: existing term-varied style ──
  const popular = card.popular;
  const price = card.price[term];

  return (
    <div className={`group relative ${popular ? "md:scale-[1.04] z-[1]" : ""}`}>
      {popular && (
        <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-br from-primary-400/50 via-primary-600/40 to-primary-800/50 blur-2xl animate-[glow-pulse_3s_ease-in-out_infinite]" />
      )}

      <div
        className={[
          "relative flex flex-col rounded-3xl overflow-hidden transition-all duration-300",
          popular
            ? "bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 bg-[length:200%_200%] text-white shadow-[0_20px_50px_rgba(179,0,0,0.35)] border border-primary-700 group-hover:-translate-y-1 group-hover:shadow-[0_30px_60px_rgba(179,0,0,0.45)] animate-[gradient-pan_8s_ease-in-out_infinite]"
            : "bg-white dark:bg-surface text-[#111827] dark:text-white border border-border shadow-[0_8px_22px_rgba(0,0,0,0.06)] group-hover:-translate-y-1 group-hover:shadow-[0_18px_36px_rgba(179,0,0,0.12)] group-hover:border-primary-300",
        ].join(" ")}
      >
        {popular && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "14px 14px",
            }}
          />
        )}

        {popular && (
          <div className="absolute -top-px left-5 z-[2]">
            <div className="relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-yellow-300 to-amber-400 text-primary-800 text-[10px] font-black tracking-[0.08em] rounded-b-xl shadow-[0_6px_14px_rgba(0,0,0,0.18)]">
              <Crown className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
              {t("popularBadge")}
            </div>
          </div>
        )}

        <div className="relative p-5 md:p-6 pb-4 md:pb-5">
          {card.badgeKey && !popular && (
            <span className="inline-flex items-center text-[10px] font-black px-2 py-1 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 tracking-[0.08em] mb-2">
              {t(card.badgeKey)}
            </span>
          )}

          <div className={popular ? "mt-3" : ""}>
            <h3 className={`text-[22px] md:text-[24px] font-black leading-tight ${popular ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : ""}`}>
              {card.title}
            </h3>
            <p className={`text-[12px] md:text-[13px] mt-0.5 leading-snug ${popular ? "text-white/85" : "text-muted"}`}>
              {t(card.subtitleKey)}
            </p>
          </div>

          <div className="mt-4 flex items-baseline gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${popular ? "bg-white/20 text-white" : "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300"}`}>
              <Star className="w-2.5 h-2.5" fill="currentColor" strokeWidth={0} />
              {t("startsFrom")}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-[38px] md:text-[46px] font-black leading-none tracking-tight tabular-nums ${popular ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : "text-primary-600"}`}>
              {price}
            </span>
            <span className={`text-[12px] font-bold ${popular ? "text-white/85" : "text-muted"}`}>
              {t(card.unitKey)}
            </span>
          </div>
          <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${popular ? "bg-white/15 text-white" : "bg-surface text-muted"}`}>
            {t("termPrefix")} <span className={popular ? "text-yellow-200" : "text-primary-600 font-black"}>{term}</span>
          </div>
        </div>

        {/* Decorative divider with center pill */}
        <div className="relative mx-5 md:mx-6">
          <div className={`border-t border-dashed ${popular ? "border-white/30" : "border-border"}`} />
          <div className={[
            "absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-[0.12em]",
            popular
              ? "bg-primary-800 text-yellow-200 border border-white/20"
              : "bg-white dark:bg-surface text-primary-600 border border-primary-200 dark:border-primary-900",
          ].join(" ")}>
            <Ship className="w-2.5 h-2.5" strokeWidth={2.5} />
            {t("portToPort")}
          </div>
        </div>

        <div className="relative p-5 md:p-6 pt-5 flex-1 flex flex-col">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {card.stats.map((s) => (
              <div
                key={s.labelKey}
                className={[
                  "rounded-xl px-3 py-2 border",
                  popular
                    ? "bg-white/10 border-white/15 backdrop-blur-sm"
                    : "bg-gradient-to-br from-surface to-white dark:from-background dark:to-surface border-border/60",
                ].join(" ")}
              >
                <div className={`text-[10px] font-bold uppercase tracking-[0.08em] ${popular ? "text-white/75" : "text-muted"}`}>
                  {t(s.labelKey)}
                </div>
                <div className={`text-[13px] font-black mt-0.5 tabular-nums ${popular ? "text-white" : "text-[#111827] dark:text-white"}`}>
                  {t(s.valueKey)}
                </div>
              </div>
            ))}
          </div>

          <div
            className={[
              "flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-[11.5px] md:text-[12px] leading-[1.5]",
              popular
                ? "bg-white/10 text-white/95 border border-white/15"
                : "bg-gradient-to-br from-primary-50/80 to-primary-50/40 text-[#111827] dark:from-primary-900/20 dark:to-primary-900/5 dark:text-white/85 border border-primary-100 dark:border-primary-900/40",
            ].join(" ")}
          >
            <div className={[
              "w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5",
              popular ? "bg-yellow-300/20 text-yellow-300" : "bg-primary-600 text-white",
            ].join(" ")}>
              <Sparkles className="w-3 h-3" strokeWidth={2.5} />
            </div>
            <span className="pt-0.5">{t(card.noteKey)}</span>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface="pricing_freight"
              ctaProps={{ card: card.id, term }}
              className={[
                "relative w-full inline-flex items-center justify-center gap-1.5 h-[44px] rounded-xl text-[13px] font-black transition-all duration-300 overflow-hidden group/cta",
                popular
                  ? "bg-white text-primary-700 hover:bg-yellow-50 shadow-[0_8px_20px_rgba(255,255,255,0.15)]"
                  : "bg-gradient-to-br from-primary-500 to-primary-700 text-white hover:shadow-[0_10px_22px_rgba(179,0,0,0.35)]",
              ].join(" ")}
            >
              <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover/cta:translate-x-full transition-transform duration-700" />
              <svg className="w-4 h-4 shrink-0 relative" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 3.185-9 7.108 0 2.115 1.155 4.025 3.09 5.303-.234.996-1.127 2.378-1.218 2.518-.088.183.056.36.24.316.593-.14 2.875-.726 4.35-1.928 1.48.566 3.14.898 4.908.898 4.97 0 9-3.184 9-7.107S16.97 3 12 3z" />
              </svg>
              <span className="relative">{t("ctaQuote")}</span>
              <ArrowRight className="w-4 h-4 relative transition-transform duration-300 group-hover/cta:translate-x-1" strokeWidth={3} />
            </TrackedExternalLink>

            <a
              href={`tel:${HOTLINE.replace(/-/g, "")}`}
              className={[
                "w-full inline-flex items-center justify-center gap-1.5 h-[40px] rounded-xl text-[12.5px] font-bold border transition-all duration-300",
                popular
                  ? "border-white/40 text-white hover:bg-white/10 hover:border-white/60"
                  : "border-border text-[#111827] dark:text-white hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700",
              ].join(" ")}
            >
              <Phone className="w-3.5 h-3.5" strokeWidth={2.5} />
              {t("ctaCallPrefix")} {HOTLINE}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
