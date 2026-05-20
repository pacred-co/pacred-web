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
  Phone,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const PATH = "/customs-clearance-shipping-suvarnabhumi";
const LINE_URL = "/line";

type Stat = { icon: typeof Clock; label: string; value: string };

// Display order = SEA (left) · AIR (middle, FEATURED) · TRUCK (right).
// Middle card is the recommended option — dark red gradient with yellow
// accents, "แนะนำ" badge + promo banner — so the eye lands on it first.
const MODES = [
  {
    mode: "เรือ",
    slug: "laem",
    badge: "SEA FREIGHT",
    badgeIcon: Ship,
    title: "เคลียร์สินค้านำเข้าทางเรือ",
    ports: "ท่าเรือคลองเตย / แหลมฉบัง / ICD",
    image: "/images/countryport/laemchabanglong.png",
    imageAlt: "เคลียร์สินค้านำเข้า ท่าเรือแหลมฉบัง / คลองเตย Pacred",
    accent: "from-sky-500/35 to-blue-700/35",
    price: "2,800",
    featured: false,
    stats: [
      { icon: Clock, label: "เคลียร์ใน", value: "3-7 วัน" },
      { icon: Package, label: "รองรับ", value: "LCL / FCL" },
      { icon: Headphones, label: "ตอบไว", value: "24 ชม." },
    ] as Stat[],
    services: [
      "ใบขนสินค้าขาเข้า · ขาออก ครบ",
      "ประสาน สายเรือ · ท่าเรือ · กรมศุลกากร",
      "Door-to-Door ทั่วประเทศ",
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
    title: "เคลียร์สินค้านำเข้าทางอากาศ",
    ports: "สนามบินสุวรรณภูมิ / ไปรษณีย์หลักสี่",
    image: "/images/countryport/suvannapoomlong.png",
    imageAlt: "เคลียร์สินค้านำเข้า สนามบินสุวรรณภูมิ Pacred",
    accent: "from-amber-400/35 to-orange-600/35",
    price: "2,800",
    featured: true,
    promoText: "ยอดนิยม · เคลียร์เร็วที่สุด · เคลียร์ทันก่อนค่าฝากเก็บขึ้น",
    stats: [
      { icon: Clock, label: "เคลียร์ใน", value: "1-3 วัน" },
      { icon: Package, label: "รองรับ", value: "Air Cargo" },
      { icon: Headphones, label: "ตอบไว", value: "24 ชม." },
    ] as Stat[],
    services: [
      "Invoice · Packing List · ใบอนุญาต",
      "ตรวจสอบ HS Code แม่นยำ",
      "เคลียร์เขต Free Zone",
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
    title: "เคลียร์สินค้านำเข้าทางรถ",
    ports: "ด่านมุกดาหาร / นครพนม / แม่สอด",
    image: "/images/countryport/mukdahanlong.png",
    imageAlt: "เคลียร์สินค้านำเข้า ด่านมุกดาหาร / นครพนม Pacred",
    accent: "from-red-500/35 to-orange-700/35",
    price: "2,500",
    featured: false,
    stats: [
      { icon: Clock, label: "เคลียร์ใน", value: "5-14 วัน" },
      { icon: Package, label: "รองรับ", value: "Cross-Border" },
      { icon: Headphones, label: "ตอบไว", value: "24 ชม." },
    ] as Stat[],
    services: [
      "ขึ้นทะเบียน · จับคู่ (YY) ใน 30 นาที",
      "Form D / Form E ครบ",
      "Door-to-Door จากด่าน ถึงคลัง",
    ],
    carriers: [
      { name: "FedEx", logo: "/images/partners/fedexpartner.png", url: "https://www.fedex.com" },
      { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com" },
      { name: "Alibaba", logo: "/images/partners/alibabapartner.png", url: "https://www.alibaba.com" },
      { name: "e-Tracking", logo: "/images/partners/etracking.png", url: "https://www.etracking.com" },
    ],
  },
];

export function CustomsModeCards() {
  return (
    <div className="relative">
      <div
        className="flex overflow-x-auto gap-3 -mx-4 px-4 pt-2 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pt-3 md:pb-2 md:snap-none md:items-stretch"
      >
        {MODES.map((c) => {
          const Icon = c.badgeIcon;
          const isFeatured = c.featured;
          return (
            <article
              key={c.mode}
              className={[
                "group relative flex flex-col shrink-0 w-[88%] sm:w-[400px] md:w-auto snap-start md:snap-none rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-400",
                isFeatured
                  ? // Featured (middle): dark-red gradient bg, white text, slight scale-up
                    "bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white border-2 border-primary-700 shadow-[0_18px_42px_rgba(179,0,0,0.32)] hover:shadow-[0_28px_60px_rgba(179,0,0,0.45)] md:scale-[1.03] md:-translate-y-1 hover:md:-translate-y-2"
                  : // Side cards: light bg, red accents
                    "bg-white dark:bg-surface text-foreground border border-border shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_42px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1",
              ].join(" ")}
            >
              {/* "แนะนำ" tag — top-right corner on featured card only */}
              {isFeatured && (
                <div className="absolute top-3 right-3 z-20">
                  <span className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-300 text-primary-800 text-[10px] md:text-[11px] font-black tracking-[0.10em] uppercase shadow-[0_4px_12px_rgba(255,213,0,0.45)]">
                    <Sparkles className="w-3 h-3" strokeWidth={2.8} />
                    แนะนำ
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
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.08]"
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
                    ค่าพิธีการศุลกากร · เริ่มต้น
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
                      บาท
                    </span>
                    <span
                      className={[
                        "ml-auto text-[10px] md:text-[10.5px] font-medium",
                        isFeatured ? "text-white/70" : "text-muted",
                      ].join(" ")}
                    >
                      + ค่าใช้จ่ายอื่น
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

                {/* Featured promo banner — yellow accent strip */}
                {isFeatured && c.promoText && (
                  <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-yellow-300 via-yellow-200 to-yellow-300 px-3 py-2 shadow-[0_4px_14px_rgba(255,213,0,0.35)]">
                    <p className="text-[11px] md:text-[11.5px] font-black text-primary-800 leading-snug tracking-tight">
                      🔥 {c.promoText}
                    </p>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[shimmer_3s_ease-in-out_infinite]"
                    />
                  </div>
                )}

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
                    พาร์ทเนอร์
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 items-center">
                    {c.carriers.map((carrier) => (
                      <a
                        key={carrier.name}
                        href={carrier.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`เปิดเว็บไซต์ ${carrier.name}`}
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
                  "relative z-10 px-3.5 md:px-4 py-2.5 md:py-3 space-y-1.5 border-t",
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
                  ขอราคา {c.mode} ฟรี
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                </Link>
                <TrackedExternalLink
                  href={LINE_URL}
                  cta="line_consult"
                  surface="customs_mode_cards"
                  ctaProps={{ mode: c.slug }}
                  className={[
                    "inline-flex w-full items-center justify-center gap-1.5 h-9 md:h-10 rounded-lg font-bold text-[12px] md:text-[12.5px] transition-colors",
                    isFeatured
                      ? "bg-white/15 text-white border border-white/25 hover:bg-white/25"
                      : "bg-white border border-primary-200 text-primary-700 hover:bg-primary-50 hover:border-primary-300 dark:bg-surface dark:border-primary-800 dark:text-primary-200",
                  ].join(" ")}
                >
                  <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
                  062-603-0456 · ปรึกษา LINE
                </TrackedExternalLink>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
