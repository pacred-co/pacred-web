"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Phone, Check, MousePointerClick } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

type SalesCardLocal = {
  personKey: "win" | "nat" | "ploy";
  name: string;
  phone: string;
  image: string;
  useContain: boolean;
};

const SALES_DATA: SalesCardLocal[] = [
  { personKey: "win",  name: "วิน",  phone: "062-603-0456", image: "/images/Character_Icon/win01.png",  useContain: false },
  { personKey: "nat",  name: "แนท",  phone: "02-421-3325",  image: "/images/pacred-logo-red.png",     useContain: true  },
  { personKey: "ploy", name: "พลอย", phone: "066-090-1217", image: "/images/Character_Icon/ploy01.png", useContain: false },
];

export function PurchaseBanner() {
  const t = useTranslations("purchaseBanner");
  const tSales = useTranslations("salesTeam");
  const [open, setOpen] = useState(false);

  const features = [t("feature1"), t("feature2"), t("feature3")];
  const sales = SALES_DATA.map((c) => ({
    ...c,
    slogan: tSales(`${c.personKey}.slogan`),
    alt:    tSales(`${c.personKey}.alt`),
    button: tSales(`${c.personKey}.button`),
  }));

  return (
    <>
      <section className="py-3 md:py-5">
        <div className="mx-auto w-full max-w-[1140px] px-[10px]">

          {/* ── MOBILE — clean gradient card (like GuaranteeBanner) ── */}
          <div
            className="md:hidden relative overflow-hidden rounded-[14px] text-white shadow-[0_12px_32px_rgba(6,199,85,0.30)] transition-all duration-300 group hover:shadow-[0_18px_44px_rgba(6,199,85,0.45)] hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg, #07D55F 0%, #06C755 45%, #059944 100%)" }}
          >
            {/* Dot pattern */}
            <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.10]"
              style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1.4px)", backgroundSize: "16px 16px" }} />
            {/* Sheen */}
            <span aria-hidden className="pointer-events-none absolute inset-0 opacity-35 mix-blend-overlay"
              style={{ background: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.35) 0%, transparent 60%)" }} />

            {/* Full-banner LINE click overlay */}
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface="purchase_banner"
              ctaProps={{ position: "banner_mobile" }}
              aria-label={t("lineAria")}
              className="absolute inset-0 z-10"
            >
              <span className="sr-only">{t("lineAria")}</span>
            </TrackedExternalLink>

            <div className="relative pointer-events-none grid grid-cols-[1fr_auto] items-center gap-1.5 pl-3.5 pr-1 min-h-[92px]">
              {/* Left: title row + brand pill + icon-only phone CTA (LINE button dropped — whole card is the LINE click) */}
              <div className="py-1.5 min-w-0">
                <p className="text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.3)] whitespace-nowrap overflow-hidden">
                  <span className="text-[clamp(13px,3.6vw,15px)] font-black leading-tight tracking-tight">{t("titlePart1")} {t("titlePart2")}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-white text-[#059944] text-[14px] font-black tracking-tight shadow-[0_2px_8px_rgba(0,0,0,0.16)] whitespace-nowrap">
                    {t("titleBrand")}
                  </span>
                  {/* Icon-only phone CTA — arrow dropped because "คลิ๊กเลย!" badge top-right already cues the LINE tap */}
                  <a
                    href="tel:0661310253"
                    onClick={() => trackCtaClick("banner_phone", "home_purchase_banner", { surface: "mobile_cta" })}
                    aria-label="โทร 066-131-0253"
                    className="pointer-events-auto relative z-20 inline-flex items-center justify-center w-[24px] h-[24px] shrink-0 rounded-full bg-white text-[#059944] shadow-[0_2px_6px_rgba(0,0,0,0.14)]"
                  >
                    <Phone className="w-3.5 h-3.5" strokeWidth={2.8} />
                  </a>
                </p>
              </div>

              {/* Right: character photo — taller box so body is visible (object-contain anchored bottom) */}
              <div className="relative w-[108px] h-[104px] shrink-0">
                <Image
                  src="/images/Character_Icon/visitmobileshop02.png"
                  alt="เซลล์ Pacred"
                  fill
                  sizes="108px"
                  className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(0,0,0,0.25)]"
                />
              </div>
            </div>

            {/* "คลิ๊กเลย!" badge */}
            <div className="pointer-events-none absolute top-1 right-1 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
              <span className="text-white text-[11px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] whitespace-nowrap">คลิ๊กเลย!</span>
              <MousePointerClick className="mt-0.5 w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" strokeWidth={2.6} />
            </div>
          </div>

          {/* ── DESKTOP — image card with overlay (unchanged) ── */}
          <div className="hidden md:block relative w-full min-h-[220px] rounded-[28px] overflow-hidden bg-[#06c755] shadow-[0_14px_34px_rgba(0,0,0,0.08)] group">
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface="purchase_banner"
              ctaProps={{ position: "banner_image" }}
              aria-label={t("lineAria")}
              className="absolute inset-0 z-[1] block"
            >
              <Image
                src="/images/bannerdesktop/shoppingbanner02.png"
                alt="Order Worldwide Pacred Shipping"
                fill
                sizes="(min-width: 1200px) 1140px, 100vw"
                quality={100}
                className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.035]"
                priority
              />
            </TrackedExternalLink>
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[2]"
              style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.40) 40%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,0) 95%)" }} />
            <div className="relative z-[3] flex min-h-[220px] w-[64%] flex-col justify-center px-[34px] py-[32px]">
              <h2 className="text-[clamp(30px,3.1vw,44px)] font-black text-white leading-[1.15] tracking-[-0.04em] mb-[10px] [-webkit-text-stroke:2px_#7f1d1d] [paint-order:stroke_fill]"
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.25)" }}>
                <span className="text-yellow-300 [-webkit-text-stroke:2.5px_#7f1d1d] [paint-order:stroke_fill]"
                  style={{ textShadow: "0 3px 10px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.3)" }}>
                  {t("titlePart1Yellow")}
                </span>
                {t("titlePart1Rest")}{" "}
                <span className="text-white">{t("titleBrandDesktop")}</span>{" "}
                {t("titlePart2")}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mb-[14px]">
                {features.map((f) => (
                  <div key={f} className="flex items-center gap-[7px] text-white text-[13px] font-bold"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                    <Check className="w-4 h-4 shrink-0" strokeWidth={3} />
                    {f}
                  </div>
                ))}
              </div>
              <a href="tel:0661310253"
                onClick={() => trackCtaClick("banner_phone", "home_purchase_banner", { surface: "inline_phone" })}
                className="inline-flex items-center gap-1.5 text-white text-[13px] font-extrabold leading-[1.25] mb-3 hover:text-yellow-200 transition-colors w-fit"
                style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.28)" }}>
                <Phone className="w-4 h-4 shrink-0" strokeWidth={3} style={{ filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))" }} />
                {t("contactPrefix")}: 066-131-0253
              </a>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button"
                  onClick={() => { trackCtaClick("banner_select_sales", "home_purchase_banner", { surface: "primary_cta" }); setOpen(true); }}
                  suppressHydrationWarning
                  className="inline-flex items-center gap-[7px] h-[42px] px-5 rounded-[11px] text-[14px] font-black text-white cursor-pointer border-0 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)", boxShadow: "0 8px 18px rgba(185,28,28,0.25)" }}>
                  <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  {t("ctaSales")}
                </button>
                <Link href="/register"
                  onClick={() => trackCtaClick("banner_register", "home_purchase_banner", { surface: "secondary_cta" })}
                  className="inline-flex items-center gap-[7px] h-[42px] px-5 rounded-[11px] text-[14px] font-black text-[#06C755] bg-white border border-white/70 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
                  style={{ boxShadow: "0 8px 18px rgba(0,0,0,0.14)" }}>
                  <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                  {t("ctaRegister")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-5"
          style={{ background: "rgba(17,24,39,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-[24px] w-full max-w-[900px] max-h-[90vh] overflow-y-auto relative px-[18px] py-[30px] md:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">

            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("closeAria")}
              className="absolute top-5 right-5 w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-500 flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="text-center mb-7">
              <h3 className="text-[22px] md:text-[28px] font-black text-[#111827]">{t("modalTitle")}</h3>
              <p className="text-[14px] md:text-[15px] text-gray-500 mt-1">{t("modalSubtitle")}</p>
            </div>

            {/* Sales grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              {sales.map((card) => (
                <div
                  key={card.name}
                  className="relative flex flex-col items-center text-center rounded-[20px] px-4 py-5 border border-gray-100 shadow-[0_4px_15px_rgba(0,0,0,0.04)] overflow-hidden"
                >
                  {/* Red header strip */}
                  <div className="absolute top-0 left-0 right-0 h-[70px] bg-gradient-to-br from-red-600 to-red-800 z-0" />

                  {/* Avatar */}
                  <div className="relative z-[1] w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-[0_6px_15px_rgba(0,0,0,0.1)] bg-white mt-[10px] mb-3">
                    <Image src={card.image} alt={card.alt} fill className={card.useContain ? "object-contain p-3" : "object-cover"} />
                  </div>

                  <p className="relative z-[1] text-[18px] font-black text-[#111827] mb-1">{card.name}</p>
                  <p className="text-[12px] text-gray-500 leading-[1.4] mb-3 line-clamp-2 min-h-[34px]">{card.slogan}</p>

                  <a
                    href={`tel:${card.phone.replace(/-/g, "")}`}
                    className="inline-flex items-center gap-1.5 text-[13px] text-red-600 font-bold bg-red-50 border border-red-200 rounded-full px-3 py-1 mb-3 hover:bg-red-100 transition-colors"
                  >
                    <Phone className="w-[14px] h-[14px]" />
                    {card.phone}
                  </a>

                  <TrackedExternalLink
                    href={LINE_URL}
                    cta="line_consult"
                    surface="purchase_banner"
                    ctaProps={{ position: "sales_modal", rep: card.name }}
                    className="w-full flex items-center justify-center gap-1.5 min-h-[38px] rounded-[10px] bg-gray-100 text-[#111827] text-[13px] font-bold mt-auto hover:bg-red-600 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3c-4.97 0-9 3.185-9 7.108 0 2.115 1.155 4.025 3.09 5.303-.234.996-1.127 2.378-1.218 2.518-.088.183.056.36.24.316.593-.14 2.875-.726 4.35-1.928 1.48.566 3.14.898 4.908.898 4.97 0 9-3.184 9-7.107S16.97 3 12 3z" />
                    </svg>
                    {card.button}
                  </TrackedExternalLink>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
