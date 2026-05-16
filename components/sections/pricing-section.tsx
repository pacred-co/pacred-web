"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Lock,
  Phone,
  Check,
  Ship,
  Warehouse,
  Star,
  Sparkles,
  Truck,
  Anchor,
  FileCheck,
  Crown,
  ArrowRight,
  BadgePercent,
  ShieldCheck,
} from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";
const HOTLINE = "066-125-3007";

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
  { id: "EXW", label: "EXW", descKey: "termExwDesc", modes: ["cargo", "freight"] },
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
    cbm: string;
    kg: string;
    transitKey: string;
  }[];
  noteKey: string;
  popular?: boolean;
  comingSoon?: boolean;
  bgImages?: string[];
};

const CARGO_CARDS: CargoCard[] = [
  {
    id: "yiwu",
    badgeKey: "yiwuBadge",
    title: "Yiwu",
    subtitleKey: "yiwuSubtitle",
    prices: [
      { mode: "road", cbm: "5,200", kg: "18", transitKey: "transit5to7"  },
      { mode: "sea",  cbm: "3,200", kg: "11", transitKey: "transit12to15" },
    ],
    noteKey: "yiwuNote",
    bgImages: [
      "/images/catagory/kidtoy.png",
      "/images/catagory/homeuse.png",
      "/images/catagory/pet.png",
    ],
  },
  {
    id: "guangzhou",
    title: "Guangzhou",
    subtitleKey: "guangzhouSubtitle",
    prices: [
      { mode: "road", cbm: "4,900", kg: "18", transitKey: "transit5to7"  },
      { mode: "sea",  cbm: "2,900", kg: "11", transitKey: "transit12to15" },
    ],
    noteKey: "guangzhouNote",
    popular: true,
    bgImages: [
      "/images/catagory/handbag.png",
      "/images/catagory/girlshoe.png",
      "/images/catagory/girlfashion.png",
    ],
  },
  {
    id: "shenzhen",
    comingBadgeKey: "shenzhenComingBadge",
    title: "Shenzhen",
    subtitleKey: "shenzhenSubtitle",
    prices: [
      { mode: "road", cbm: "—", kg: "—", transitKey: "transitDash" },
      { mode: "sea",  cbm: "—", kg: "—", transitKey: "transitDash" },
    ],
    noteKey: "shenzhenNote",
    comingSoon: true,
    bgImages: [
      "/images/catagory/phone.png",
      "/images/catagory/camera.png",
      "/images/catagory/comlaptop.png",
    ],
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

export function PricingSection() {
  const t = useTranslations("pricing");
  const MODES: Record<Mode, { id: Mode; title: string; badge: string; icon: typeof Ship }> = {
    cargo:   { id: "cargo",   title: t("modeCargoTitle"),   badge: t("modeCargoBadge"),   icon: Warehouse },
    freight: { id: "freight", title: t("modeFreightTitle"), badge: t("modeFreightBadge"), icon: Ship      },
  };
  const [mode, setMode] = useState<Mode>("cargo");
  const [term, setTerm] = useState<Term>("DDP");
  const [country, setCountry] = useState<string>("cn");
  const [port, setPort] = useState<string>("ningbo");

  const visibleTerms = TERMS.filter((t) => t.modes.includes(mode));

  const changeMode = (m: Mode) => {
    setMode(m);
    const valid = TERMS.filter((t) => t.modes.includes(m));
    if (!valid.some((t) => t.id === term)) {
      setTerm(valid[0].id);
    }
  };

  return (
    <section id="pricing" className="relative pt-2 md:pt-4 pb-10 md:pb-14">
      <div className="relative mx-auto w-full max-w-[1140px] px-[10px]">

        {/* ─── Heading ─── */}
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

        {/* ─── Country picker ─── */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="text-[12px] font-bold text-muted uppercase tracking-[0.12em] mb-2">
            {t("originCountry")}
          </div>
          <div className="flex overflow-x-auto md:flex-wrap gap-2 pb-1 md:pb-0 -mx-[10px] px-[10px] md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
            {COUNTRIES.map((c) => {
              const selected = country === c.code && c.active;
              const disabled = c.soon || !c.active;
              return (
                <button
                  key={c.code}
                  type="button"
                  disabled={disabled || c.locked}
                  onClick={() => !disabled && setCountry(c.code)}
                  suppressHydrationWarning
                  className={[
                    "group relative inline-flex items-center gap-2 h-10 px-3.5 rounded-xl text-[13px] font-bold transition-all duration-300 border overflow-hidden",
                    selected
                      ? "bg-gradient-to-br from-primary-500 to-primary-700 text-white border-primary-600 shadow-[0_10px_22px_rgba(179,0,0,0.35)] scale-[1.02]"
                      : disabled
                        ? "bg-surface text-muted border-border opacity-70 cursor-not-allowed"
                        : "bg-white dark:bg-surface text-[#111827] dark:text-white border-border hover:border-primary-400 hover:-translate-y-0.5 hover:shadow-[0_6px_14px_rgba(179,0,0,0.10)] cursor-pointer",
                  ].join(" ")}
                >
                  {selected && (
                    <span aria-hidden className="absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2.5s_infinite]" />
                  )}
                  <span className="text-[18px] leading-none relative">{c.flag}</span>
                  <span className="relative">{t(c.nameKey)}</span>
                  {selected && c.locked && (
                    <span className="relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/25 ml-0.5">
                      <Lock className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                  {c.soon && (
                    <span className="ml-1 inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                      {t("comingSoon")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Mode toggle (Cargo / Freight) ─── */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="inline-flex p-1.5 rounded-2xl bg-gradient-to-br from-surface to-surface-alt dark:from-surface dark:to-background border border-border w-full md:w-auto shadow-[inset_0_2px_6px_rgba(0,0,0,0.04)]">
            {(Object.keys(MODES) as Mode[]).map((m) => {
              const data = MODES[m];
              const Icon = data.icon;
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeMode(m)}
                  suppressHydrationWarning
                  className={[
                    "relative flex-1 md:flex-initial inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl text-[14px] font-black transition-all duration-300 overflow-hidden",
                    active
                      ? "bg-gradient-to-br from-white to-white dark:from-background dark:to-surface text-primary-600 shadow-[0_6px_14px_rgba(179,0,0,0.10)] scale-[1.02]"
                      : "text-muted hover:text-primary-600 dark:hover:text-white",
                  ].join(" ")}
                >
                  {active && (
                    <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-primary-200/30 to-transparent dark:via-primary-700/20 animate-[shimmer_3.5s_infinite]" />
                  )}
                  <Icon className={`w-[18px] h-[18px] relative transition-transform ${active ? "scale-110" : ""}`} strokeWidth={2.5} />
                  <span className="relative">{data.title}</span>
                  <span className={`hidden md:inline relative text-[11px] font-bold ${active ? "text-primary-600/70" : "text-muted/70"}`}>
                    {data.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Port picker (Freight only) ─── */}
        {mode === "freight" && (
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

        {/* ─── Term toggle ─── */}
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

        {/* ─── Cargo terms notice ─── */}
        {mode === "cargo" && (
          <div className="mx-auto mt-4 w-full max-w-[1120px]">
            <div className="relative flex items-center gap-3 rounded-2xl border border-primary-200 dark:border-primary-900/60 bg-gradient-to-r from-primary-50 via-white to-primary-50/40 dark:from-primary-950/30 dark:via-surface dark:to-primary-950/10 px-4 py-3 overflow-hidden">
              {/* Decorative shimmer */}
              <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 bg-gradient-to-r from-transparent via-primary-200/40 to-transparent dark:via-primary-700/20 animate-[shimmer_4s_infinite]" />

              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shrink-0 shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                <FileCheck className="w-[18px] h-[18px]" strokeWidth={2.5} />
              </div>
              <div className="relative text-[12px] md:text-[13px] leading-[1.5] flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-600 text-white text-[10px] font-black tracking-[0.08em]">
                    <ShieldCheck className="w-3 h-3" strokeWidth={2.5} />
                    {t("cargoNoticeBadge")}
                  </span>
                  <span className="font-black text-[#111827] dark:text-white">{t("cargoNoticeTitle")}</span>
                </div>
                <p className="text-muted mt-0.5">{t("cargoNoticeDesc")}</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Price cards — horizontal swipe on mobile ─── */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          {mode === "cargo" ? (
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-[10px] px-[10px] snap-x snap-mandatory md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:grid-cols-3 md:gap-4 [&>*]:shrink-0 [&>*]:w-[80%] [&>*]:min-w-[280px] [&>*]:snap-start md:[&>*]:w-auto md:[&>*]:min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CARGO_CARDS.map((card) => (
                <CargoPriceCard key={card.id} card={card} t={t} />
              ))}
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

// ────────────────── Cargo card (dual price) ──────────────────
type PricingT = ReturnType<typeof useTranslations<"pricing">>;

function CargoPriceCard({ card, t }: { card: CargoCard; t: PricingT }) {
  const popular = card.popular;
  const comingSoon = card.comingSoon;

  return (
    <div className={`group relative ${popular ? "md:scale-[1.04] z-[1]" : ""}`}>
      {/* Popular glow halo */}
      {popular && (
        <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-br from-primary-400/50 via-primary-600/40 to-primary-800/50 blur-2xl animate-[glow-pulse_3s_ease-in-out_infinite]" />
      )}

      <div
        className={[
          "relative flex flex-col rounded-3xl overflow-hidden transition-all duration-300",
          comingSoon
            ? "bg-gradient-to-br from-surface to-surface-alt dark:from-surface dark:to-background text-muted border border-dashed border-border"
            : popular
              ? "bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 bg-[length:200%_200%] text-white shadow-[0_20px_50px_rgba(179,0,0,0.35)] border border-primary-700 group-hover:-translate-y-1 group-hover:shadow-[0_30px_60px_rgba(179,0,0,0.45)] animate-[gradient-pan_8s_ease-in-out_infinite]"
              : "bg-white dark:bg-surface text-[#111827] dark:text-white border border-border shadow-[0_8px_22px_rgba(0,0,0,0.06)] group-hover:-translate-y-1 group-hover:shadow-[0_18px_36px_rgba(179,0,0,0.12)] group-hover:border-primary-300",
        ].join(" ")}
      >
        {/* Pattern overlay — popular */}
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
        {/* Pattern overlay — coming soon */}
        {comingSoon && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.025) 10px, rgba(0,0,0,0.025) 20px)",
            }}
          />
        )}

        {/* Faint product watermark images */}
        {card.bgImages && card.bgImages.length > 0 && (
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* Main large image — bottom right */}
            <div
              className={[
                "absolute -bottom-6 -right-6 w-[180px] h-[180px]",
                popular ? "opacity-[0.14]" : comingSoon ? "opacity-[0.10]" : "opacity-[0.10]",
              ].join(" ")}
              style={popular ? { filter: "brightness(0) invert(1)" } : undefined}
            >
              <Image
                src={card.bgImages[0]}
                alt=""
                fill
                sizes="180px"
                className="object-contain"
              />
            </div>
            {/* Smaller accent image — top right */}
            {card.bgImages[1] && (
              <div
                className={[
                  "absolute top-12 -right-4 w-[90px] h-[90px] rotate-[12deg]",
                  popular ? "opacity-[0.10]" : comingSoon ? "opacity-[0.07]" : "opacity-[0.07]",
                ].join(" ")}
                style={popular ? { filter: "brightness(0) invert(1)" } : undefined}
              >
                <Image
                  src={card.bgImages[1]}
                  alt=""
                  fill
                  sizes="90px"
                  className="object-contain"
                />
              </div>
            )}
            {/* Smaller accent image — middle left */}
            {card.bgImages[2] && (
              <div
                className={[
                  "absolute top-1/2 -left-5 w-[80px] h-[80px] -rotate-[8deg]",
                  popular ? "opacity-[0.08]" : comingSoon ? "opacity-[0.06]" : "opacity-[0.06]",
                ].join(" ")}
                style={popular ? { filter: "brightness(0) invert(1)" } : undefined}
              >
                <Image
                  src={card.bgImages[2]}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-contain"
                />
              </div>
            )}
          </div>
        )}

        {/* Crown ribbon — popular */}
        {popular && (
          <div className="absolute -top-px left-5 z-[2]">
            <div className="relative inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-yellow-300 to-amber-400 text-primary-800 text-[10px] font-black tracking-[0.08em] rounded-b-xl shadow-[0_6px_14px_rgba(0,0,0,0.18)]">
              <Crown className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
              {t("popularBadge")}
            </div>
          </div>
        )}
        {/* Coming Soon badge */}
        {comingSoon && (
          <div className="absolute top-4 right-4 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-600 text-white text-[10px] font-black tracking-[0.08em]">
            <Lock className="w-3 h-3" strokeWidth={3} />
            {t("comingSoon")}
          </div>
        )}

        <div className="relative p-5 md:p-6 pb-4 md:pb-5">
          {/* Badge */}
          {card.badgeKey && !popular && !comingSoon && (
            <span className="inline-flex items-center text-[10px] font-black px-2 py-1 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 tracking-[0.08em] mb-2">
              {t(card.badgeKey)}
            </span>
          )}

          {/* Title */}
          <div className={popular ? "mt-3" : ""}>
            <h3 className={`text-[22px] md:text-[24px] font-black leading-tight ${popular ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : ""}`}>
              {card.title}
            </h3>
            <p className={`text-[12px] md:text-[13px] mt-0.5 leading-snug ${popular ? "text-white/85" : "text-muted"}`}>
              {t(card.subtitleKey)}
            </p>
          </div>

          {/* Dual prices: รถ + เรือ */}
          <div className="mt-4 space-y-2">
            {card.prices.map((p) => {
              const isCar = p.mode === "road";
              const Icon = isCar ? Truck : Ship;
              const modeLabel = isCar ? t("modeRoad") : t("modeSea");
              return (
                <div
                  key={p.mode}
                  className={[
                    "relative flex items-center gap-2.5 rounded-2xl px-3 py-2.5 transition-colors",
                    popular
                      ? "bg-white/10 hover:bg-white/15 backdrop-blur-sm border border-white/15"
                      : comingSoon
                        ? "bg-white/40 dark:bg-background/40 border border-dashed border-border"
                        : "bg-gradient-to-br from-surface to-white dark:from-background dark:to-surface border border-border/60",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                      popular
                        ? "bg-white/25 text-white shadow-inner"
                        : comingSoon
                          ? "bg-border text-muted"
                          : "bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_4px_10px_rgba(179,0,0,0.25)]",
                    ].join(" ")}
                  >
                    <Icon className="w-[18px] h-[18px]" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] ${popular ? "text-white/75" : "text-muted"}`}>
                      <span>{modeLabel}</span>
                      <span className="opacity-50">·</span>
                      <span>{t(p.transitKey)}</span>
                    </div>
                    <div className="flex items-baseline gap-2.5 flex-wrap mt-0.5">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-[22px] md:text-[24px] font-black leading-none tracking-tight tabular-nums ${popular ? "text-white" : comingSoon ? "text-muted" : "text-primary-600"}`}>
                          {p.cbm}
                        </span>
                        <span className={`text-[10px] font-bold ${popular ? "text-white/80" : "text-muted"}`}>
                          {t("perCbm")}
                        </span>
                      </div>
                      <span className={`w-px h-3 ${popular ? "bg-white/25" : "bg-border"}`} />
                      <div className="flex items-baseline gap-1">
                        <span className={`text-[17px] md:text-[19px] font-black leading-none tracking-tight tabular-nums ${popular ? "text-white/95" : comingSoon ? "text-muted" : "text-primary-600/90"}`}>
                          {p.kg}
                        </span>
                        <span className={`text-[10px] font-bold ${popular ? "text-white/80" : "text-muted"}`}>
                          {t("perKg")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Decorative divider with center pill */}
        <div className="relative mx-5 md:mx-6">
          <div className={`border-t border-dashed ${popular ? "border-white/30" : "border-border"}`} />
          <div className={[
            "absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-[0.12em]",
            popular
              ? "bg-primary-800 text-yellow-200 border border-white/20"
              : comingSoon
                ? "bg-surface text-muted border border-border"
                : "bg-white dark:bg-surface text-primary-600 border border-primary-200 dark:border-primary-900",
          ].join(" ")}>
            <BadgePercent className="w-2.5 h-2.5" strokeWidth={2.5} />
            {t("carePill")}
          </div>
        </div>

        <div className="relative p-5 md:p-6 pt-5 flex-1 flex flex-col">
          {/* Note */}
          <div
            className={[
              "flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-[11.5px] md:text-[12px] leading-[1.5]",
              popular
                ? "bg-white/10 text-white/95 border border-white/15"
                : comingSoon
                  ? "bg-white/40 dark:bg-background/40 text-muted border border-dashed border-border"
                  : "bg-gradient-to-br from-primary-50/80 to-primary-50/40 text-[#111827] dark:from-primary-900/20 dark:to-primary-900/5 dark:text-white/85 border border-primary-100 dark:border-primary-900/40",
            ].join(" ")}
          >
            <div className={[
              "w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5",
              popular ? "bg-yellow-300/20 text-yellow-300" : comingSoon ? "bg-border text-muted" : "bg-primary-600 text-white",
            ].join(" ")}>
              <Sparkles className="w-3 h-3" strokeWidth={2.5} />
            </div>
            <span className="pt-0.5">{t(card.noteKey)}</span>
          </div>

          {/* CTAs */}
          <div className="mt-auto flex flex-col gap-2">
            {comingSoon ? (
              <button
                type="button"
                disabled
                suppressHydrationWarning
                className="w-full inline-flex items-center justify-center gap-1.5 h-[44px] rounded-xl text-[13px] font-black bg-surface-alt dark:bg-background/60 text-muted border border-dashed border-border cursor-not-allowed"
              >
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
              </>
            )}
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

// ────────────────── Freight card (Term-varied) ──────────────────
function FreightPriceCard({ card, term, t }: { card: FreightCard; term: Term; t: PricingT }) {
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
