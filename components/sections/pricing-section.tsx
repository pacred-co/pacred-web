"use client";

import { useState } from "react";
import Image from "next/image";
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

const LINE_URL = "https://lin.ee/Yg3fU0I";
const HOTLINE = "066-125-3007";

type Mode = "cargo" | "freight";
type Term = "DDP" | "EXW" | "FOB";

// ───────────── Country ─────────────
type Country = {
  code: string;
  name: string;
  flag: string;
  active?: boolean;
  locked?: boolean;
  soon?: boolean;
};

const COUNTRIES: Country[] = [
  { code: "cn", name: "จีน",      flag: "🇨🇳", active: true, locked: true },
  { code: "jp", name: "ญี่ปุ่น",    flag: "🇯🇵", soon: true },
  { code: "kr", name: "เกาหลี",   flag: "🇰🇷", soon: true },
  { code: "vn", name: "เวียดนาม", flag: "🇻🇳", soon: true },
  { code: "us", name: "อเมริกา",  flag: "🇺🇸", soon: true },
];

// ───────────── China ports (Freight) ─────────────
const PORTS = [
  { code: "ningbo",    name: "หนิงโบว",  en: "Ningbo" },
  { code: "nansha",    name: "หนานชา",  en: "Nansha" },
  { code: "guangzhou", name: "กวางโจว", en: "Guangzhou" },
];

// ───────────── Mode (Cargo / Freight) ─────────────
const MODES: Record<Mode, {
  id: Mode;
  title: string;
  badge: string;
  icon: typeof Ship;
}> = {
  cargo:   { id: "cargo",   title: "Cargo",   badge: "Warehouse to Warehouse", icon: Warehouse },
  freight: { id: "freight", title: "Freight", badge: "Port to Port",           icon: Ship      },
};

// ───────────── Term ─────────────
const TERMS: { id: Term; label: string; desc: string; modes: Mode[] }[] = [
  { id: "DDP", label: "DDP", desc: "ดูแลครบ ขนส่ง + เคลียร์ด่าน + ภาษี ส่งถึงปลายทาง", modes: ["cargo", "freight"] },
  { id: "EXW", label: "EXW", desc: "เข้ารับจากโรงงาน / โกดังต้นทาง",                   modes: ["cargo", "freight"] },
  { id: "FOB", label: "FOB", desc: "รับช่วงต่อจากท่าเรือต้นทาง",                          modes: ["freight"] },
];

// ───────────── Cargo cards (dual price: รถ + เรือ) ─────────────
type CargoCard = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  prices: {
    mode: "รถ" | "เรือ";
    cbm: string;
    kg: string;
    transit: string;
  }[];
  note: string;
  popular?: boolean;
  comingSoon?: boolean;
  bgImages?: string[];
};

const CARGO_CARDS: CargoCard[] = [
  {
    id: "yiwu",
    badge: "อี้อู",
    title: "Yiwu",
    subtitle: "โกดังอี้อู → โกดังไทย",
    prices: [
      { mode: "รถ",  cbm: "5,200", kg: "18", transit: "5–7 วัน"  },
      { mode: "เรือ", cbm: "3,200", kg: "11", transit: "12–15 วัน" },
    ],
    note: "ตลาดส่งจิปาถะใหญ่สุดในจีน — ของชำร่วย ของขวัญ เครื่องเขียน ของเล่น ของแต่งบ้าน อุปกรณ์ปาร์ตี้ ของแม่และเด็ก",
    bgImages: [
      "/images/catagory/kidtoy.png",
      "/images/catagory/homeuse.png",
      "/images/catagory/pet.png",
    ],
  },
  {
    id: "guangzhou",
    badge: "ยอดนิยม",
    title: "Guangzhou",
    subtitle: "โกดังกวางโจว → โกดังไทย",
    prices: [
      { mode: "รถ",  cbm: "4,900", kg: "18", transit: "5–7 วัน"  },
      { mode: "เรือ", cbm: "2,900", kg: "11", transit: "12–15 วัน" },
    ],
    note: "แหล่งแฟชั่นใหญ่สุดในจีนใต้ — เสื้อผ้า รองเท้า กระเป๋า เครื่องหนัง เครื่องสำอาง เครื่องประดับ อะไหล่รถยนต์",
    popular: true,
    bgImages: [
      "/images/catagory/handbag.png",
      "/images/catagory/girlshoe.png",
      "/images/catagory/girlfashion.png",
    ],
  },
  {
    id: "shenzhen",
    badge: "เร็วๆนี้",
    title: "Shenzhen",
    subtitle: "โกดังเซินเจิ้น → โกดังไทย",
    prices: [
      { mode: "รถ",  cbm: "—", kg: "—", transit: "—" },
      { mode: "เรือ", cbm: "—", kg: "—", transit: "—" },
    ],
    note: "ศูนย์รวมเทคโนโลยีของจีน — มือถือ คอมพิวเตอร์ gadget โดรน กล้อง อะไหล่อิเล็กทรอนิกส์ IT",
    comingSoon: true,
    bgImages: [
      "/images/catagory/phone.png",
      "/images/catagory/camera.png",
      "/images/catagory/comlaptop.png",
    ],
  },
];

// ───────────── Freight cards (Term-varied) ─────────────
type FreightCard = {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  unit: string;
  price: Record<Term, string>;
  stats: { label: string; value: string }[];
  note: string;
  popular?: boolean;
};

const FREIGHT_CARDS: FreightCard[] = [
  {
    id: "lcl",
    badge: "ตู้รวม",
    title: "LCL Freight",
    subtitle: "Less than Container Load",
    unit: "บาท / CBM",
    price: { DDP: "5,500", EXW: "4,200", FOB: "3,500" },
    stats: [
      { label: "Transit", value: "12–18 วัน" },
      { label: "ขั้นต่ำ",  value: "1 CBM" },
    ],
    note: "เหมาะกับสินค้าน้อย ไม่ถึงตู้ จัดส่งรวมหลายเจ้า",
  },
  {
    id: "fcl20",
    badge: "ยอดนิยม",
    title: "FCL 20ft",
    subtitle: "ตู้คอนเทนเนอร์ 20 ฟุต",
    unit: "บาท / Container",
    price: { DDP: "72,000", EXW: "63,000", FOB: "55,000" },
    stats: [
      { label: "Transit", value: "10–14 วัน" },
      { label: "ความจุ",  value: "≈ 28 CBM" },
    ],
    note: "เหมาะกับสินค้าหนัก ปริมาณกลาง คุ้มสุดต่อ CBM",
    popular: true,
  },
  {
    id: "fcl40hq",
    badge: "ตู้ใหญ่",
    title: "FCL 40HQ",
    subtitle: "ตู้คอนเทนเนอร์ 40 High Cube",
    unit: "บาท / Container",
    price: { DDP: "98,000", EXW: "86,000", FOB: "75,000" },
    stats: [
      { label: "Transit", value: "10–14 วัน" },
      { label: "ความจุ",  value: "≈ 68 CBM" },
    ],
    note: "เหมาะกับสินค้าเยอะ จุเต็มที่ ต้นทุนต่อชิ้นต่ำสุด",
  },
];

export function PricingSection() {
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
            ราคาชัดเจน โปร่งใส ต้อง{" "}
            <span className="text-primary-600">Pacred Shipping</span>
          </h2>
        </div>

        {/* ─── Country picker ─── */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="text-[12px] font-bold text-muted uppercase tracking-[0.12em] mb-2">
            ประเทศต้นทาง
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
                  <span className="relative">{c.name}</span>
                  {selected && c.locked && (
                    <span className="relative inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/25 ml-0.5">
                      <Lock className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                  {c.soon && (
                    <span className="ml-1 inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                      COMING SOON
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
              ท่าเรือต้นทาง (จีน)
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
                    <span>{p.name}</span>
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
            Term การให้บริการ
          </div>
          <div className={`flex overflow-x-auto gap-2 pb-1 -mx-[10px] px-[10px] snap-x snap-mandatory md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid ${visibleTerms.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"} [&>*]:shrink-0 [&>*]:w-[78%] [&>*]:min-w-[240px] [&>*]:snap-start md:[&>*]:w-auto md:[&>*]:min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
            {visibleTerms.map((t) => {
              const active = term === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTerm(t.id)}
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
                      {t.label}
                    </span>
                    <span className="text-[14px] font-black">{t.label}</span>
                    {active && (
                      <span className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20">
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <p className={`relative text-[12px] mt-1.5 leading-[1.45] ${active ? "text-white/90" : "text-muted"}`}>
                    {t.desc}
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
                    เงื่อนไข Cargo
                  </span>
                  <span className="font-black text-[#111827] dark:text-white">เปิดใบขน / ใบกำกับ เท่านั้น</span>
                </div>
                <p className="text-muted mt-0.5">ทุก Shipment ออกเอกสารตามจริง ภาษีถูกต้อง โปร่งใส ตรวจสอบได้</p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Price cards (3 ใบ) — horizontal swipe on mobile ─── */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          {mode === "cargo" ? (
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-[10px] px-[10px] snap-x snap-mandatory md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:grid-cols-3 md:gap-4 [&>*]:shrink-0 [&>*]:w-[80%] [&>*]:min-w-[280px] [&>*]:snap-start md:[&>*]:w-auto md:[&>*]:min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {CARGO_CARDS.map((card) => (
                <CargoPriceCard key={card.id} card={card} />
              ))}
            </div>
          ) : (
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-[10px] px-[10px] snap-x snap-mandatory md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:grid-cols-3 md:gap-4 [&>*]:shrink-0 [&>*]:w-[80%] [&>*]:min-w-[280px] [&>*]:snap-start md:[&>*]:w-auto md:[&>*]:min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FREIGHT_CARDS.map((card) => (
                <FreightPriceCard key={card.id} card={card} term={term} />
              ))}
            </div>
          )}

          {/* Footnote */}
          <p className="mt-3 text-[11px] md:text-[12px] text-muted text-center leading-[1.5]">
            * ราคาเริ่มต้นต่อหน่วยและอาจปรับตามชนิดสินค้า ปริมาณ และฤดูกาล —
            ติดต่อสอบถาม อาจได้เรทที่ดีกว่าเรทดังกล่าว
          </p>
        </div>

      </div>
    </section>
  );
}

// ────────────────── Cargo card (dual price) ──────────────────
function CargoPriceCard({ card }: { card: CargoCard }) {
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
              ยอดนิยม · TOP #1
            </div>
          </div>
        )}
        {/* Coming Soon badge */}
        {comingSoon && (
          <div className="absolute top-4 right-4 z-[2] inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-600 text-white text-[10px] font-black tracking-[0.08em]">
            <Lock className="w-3 h-3" strokeWidth={3} />
            COMING SOON
          </div>
        )}

        <div className="relative p-5 md:p-6 pb-4 md:pb-5">
          {/* Badge */}
          {card.badge && !popular && !comingSoon && (
            <span className="inline-flex items-center text-[10px] font-black px-2 py-1 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 tracking-[0.08em] mb-2">
              {card.badge}
            </span>
          )}

          {/* Title */}
          <div className={popular ? "mt-3" : ""}>
            <h3 className={`text-[22px] md:text-[24px] font-black leading-tight ${popular ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : ""}`}>
              {card.title}
            </h3>
            <p className={`text-[12px] md:text-[13px] mt-0.5 leading-snug ${popular ? "text-white/85" : "text-muted"}`}>
              {card.subtitle}
            </p>
          </div>

          {/* Dual prices: รถ + เรือ */}
          <div className="mt-4 space-y-2">
            {card.prices.map((p) => {
              const isCar = p.mode === "รถ";
              const Icon = isCar ? Truck : Ship;
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
                      <span>{p.mode}</span>
                      <span className="opacity-50">·</span>
                      <span>{p.transit}</span>
                    </div>
                    <div className="flex items-baseline gap-2.5 flex-wrap mt-0.5">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-[22px] md:text-[24px] font-black leading-none tracking-tight tabular-nums ${popular ? "text-white" : comingSoon ? "text-muted" : "text-primary-600"}`}>
                          {p.cbm}
                        </span>
                        <span className={`text-[10px] font-bold ${popular ? "text-white/80" : "text-muted"}`}>
                          ฿/คิว
                        </span>
                      </div>
                      <span className={`w-px h-3 ${popular ? "bg-white/25" : "bg-border"}`} />
                      <div className="flex items-baseline gap-1">
                        <span className={`text-[17px] md:text-[19px] font-black leading-none tracking-tight tabular-nums ${popular ? "text-white/95" : comingSoon ? "text-muted" : "text-primary-600/90"}`}>
                          {p.kg}
                        </span>
                        <span className={`text-[10px] font-bold ${popular ? "text-white/80" : "text-muted"}`}>
                          ฿/กก.
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
            ดูแลครบ
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
            <span className="pt-0.5">{card.note}</span>
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
                ยังไม่เปิดให้บริการ
              </button>
            ) : (
              <>
                <a
                  href={LINE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
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
                  <span className="relative">ขอใบเสนอราคา</span>
                  <ArrowRight className="w-4 h-4 relative transition-transform duration-300 group-hover/cta:translate-x-1" strokeWidth={3} />
                </a>

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
                  โทร {HOTLINE}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────── Freight card (Term-varied) ──────────────────
function FreightPriceCard({ card, term }: { card: FreightCard; term: Term }) {
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
              ยอดนิยม · TOP #1
            </div>
          </div>
        )}

        <div className="relative p-5 md:p-6 pb-4 md:pb-5">
          {card.badge && !popular && (
            <span className="inline-flex items-center text-[10px] font-black px-2 py-1 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 tracking-[0.08em] mb-2">
              {card.badge}
            </span>
          )}

          <div className={popular ? "mt-3" : ""}>
            <h3 className={`text-[22px] md:text-[24px] font-black leading-tight ${popular ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : ""}`}>
              {card.title}
            </h3>
            <p className={`text-[12px] md:text-[13px] mt-0.5 leading-snug ${popular ? "text-white/85" : "text-muted"}`}>
              {card.subtitle}
            </p>
          </div>

          <div className="mt-4 flex items-baseline gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${popular ? "bg-white/20 text-white" : "bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300"}`}>
              <Star className="w-2.5 h-2.5" fill="currentColor" strokeWidth={0} />
              เริ่มต้น
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-[38px] md:text-[46px] font-black leading-none tracking-tight tabular-nums ${popular ? "text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)]" : "text-primary-600"}`}>
              {price}
            </span>
            <span className={`text-[12px] font-bold ${popular ? "text-white/85" : "text-muted"}`}>
              {card.unit}
            </span>
          </div>
          <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${popular ? "bg-white/15 text-white" : "bg-surface text-muted"}`}>
            Term: <span className={popular ? "text-yellow-200" : "text-primary-600 font-black"}>{term}</span>
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
            Port to Port
          </div>
        </div>

        <div className="relative p-5 md:p-6 pt-5 flex-1 flex flex-col">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {card.stats.map((s) => (
              <div
                key={s.label}
                className={[
                  "rounded-xl px-3 py-2 border",
                  popular
                    ? "bg-white/10 border-white/15 backdrop-blur-sm"
                    : "bg-gradient-to-br from-surface to-white dark:from-background dark:to-surface border-border/60",
                ].join(" ")}
              >
                <div className={`text-[10px] font-bold uppercase tracking-[0.08em] ${popular ? "text-white/75" : "text-muted"}`}>
                  {s.label}
                </div>
                <div className={`text-[13px] font-black mt-0.5 tabular-nums ${popular ? "text-white" : "text-[#111827] dark:text-white"}`}>
                  {s.value}
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
            <span className="pt-0.5">{card.note}</span>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
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
              <span className="relative">ขอใบเสนอราคา</span>
              <ArrowRight className="w-4 h-4 relative transition-transform duration-300 group-hover/cta:translate-x-1" strokeWidth={3} />
            </a>

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
              โทร {HOTLINE}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
