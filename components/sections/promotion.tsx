import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PromoCarousel } from "@/components/ui/promo-carousel";

export function Promotion() {
  const t = useTranslations("promotion");
  const tExt = useTranslations("promotionExtras");

  const benefits = [
    {
      title: tExt("newUserTitle"),
      description: tExt("newUserDesc"),
      highlight: "",
      image: "/images/hero-section/icon-draf/people.png",
      href: "https://line.me/ti/p/@pacred",
      first: true,
    },
    {
      title: tExt("interpreterTitle"),
      description: tExt("interpreterDesc"),
      highlight: tExt("interpreterHighlight"),
      image: "/images/hero-section/icon-draf/pcs-sales.png",
      href: "https://line.me/ti/p/@pacred",
      first: false,
    },
    {
      title: tExt("rateTitle"),
      description: tExt("rateDesc"),
      highlight: tExt("rateHighlight"),
      image: "/images/hero-section/icon-draf/ongkorn.png",
      href: "https://line.me/ti/p/@pacred",
      first: false,
    },
    {
      title: tExt("shippingTitle"),
      description: tExt("shippingDesc"),
      highlight: tExt("shippingHighlight"),
      image: "/images/hero-section/icon-draf/caricon.png",
      href: "https://line.me/ti/p/@pacred",
      first: false,
    },
  ];

  return (
    <section id="promotion" className="pb-6 pt-2">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Container 1 — Section heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
            {t("sectionBadge").toUpperCase() === "PROMOTIONS" ? "PROMOTION" : t("sectionBadge")}
          </div>
          <h2 className="text-[19px] md:text-[38px] leading-[1.2] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            <span className="md:hidden">
              {t("title")}
              <span className="text-primary-600">{t("titleHighlight")}</span>
            </span>
            <span className="hidden md:inline">
              {t("title")}
              <span className="text-primary-600">{t("titleHighlight")}</span>
            </span>
          </h2>
        </div>

        {/* Container 2 — 4 ticket-style benefit cards (horizontal swipe on mobile) */}
        <div className="mx-auto mt-[18px] w-full max-w-[1120px] relative">
          <div className="flex overflow-x-auto gap-2.5 pb-2 -mx-[10px] px-[10px] snap-x snap-mandatory sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 lg:grid-cols-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {benefits.map((b, i) => (
              <div
                key={i}
                className={[
                  "group relative shrink-0 w-[78%] min-w-[260px] sm:w-auto sm:min-w-0 snap-start flex items-center min-h-[70px] rounded-xl border overflow-hidden px-3 py-2 transition-all duration-300 hover:-translate-y-[3px]",
                  b.first
                    ? "bg-primary-600 border-primary-600"
                    : "bg-white dark:bg-surface border-border hover:border-red-300 hover:shadow-[0_8px_20px_rgba(220,38,38,0.10)]",
                ].join(" ")}
              >
                {/* Notch circles (ticket tear effect) */}
                <span className="absolute top-[-6px] right-[75px] w-3 h-3 rounded-full bg-background z-[5]" />
                <span className="absolute bottom-[-6px] right-[75px] w-3 h-3 rounded-full bg-background z-[5]" />

                {/* Dashed divider */}
                <span className={`absolute right-[80px] top-2 bottom-2 z-[2] border-l border-dashed ${b.first ? "border-white/30" : "border-border"}`} />

                {/* Inner */}
                <div className="flex items-center w-full gap-2.5 z-[3]">

                  {/* Icon box */}
                  <div className={`w-[38px] h-[38px] rounded-lg flex items-center justify-center shrink-0 p-1 ${b.first ? "bg-white/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                    <Image
                      src={b.image}
                      alt={b.title}
                      width={30}
                      height={30}
                      className={`object-contain w-full h-full ${b.first ? "brightness-0 invert" : ""}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <div className="flex items-baseline gap-1">
                      {b.highlight && (
                        <span className={`text-[18px] font-black leading-none shrink-0 ${b.first ? "text-white" : "text-primary-600"}`}>
                          {b.highlight}
                        </span>
                      )}
                      <h3 className={`text-[13px] font-bold truncate ${b.first ? "text-white" : "text-[#111827] dark:text-white"}`}>
                        {b.title}
                      </h3>
                    </div>
                    <p className={`text-[10px] leading-[1.2] mt-0.5 ${b.first ? "text-white/80" : "text-muted"}`}>
                      {b.description}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="w-[65px] shrink-0 text-right">
                    <Link
                      href="/register"
                      className={[
                        "inline-block text-[10px] font-bold px-1.5 py-1 rounded transition-colors",
                        b.first
                          ? "bg-white text-primary-600"
                          : "bg-red-50 text-primary-600 group-hover:bg-primary-600 group-hover:text-white",
                      ].join(" ")}
                    >
                      {tExt("claim")}
                    </Link>
                  </div>

                </div>
              </div>
            ))}
          </div>
          {/* Swipe indicator — mobile only */}
          <div className="sm:hidden pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-background via-background/85 to-transparent flex items-center justify-end pr-1">
            <svg className="w-4 h-4 text-primary-600 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
          </div>
        </div>

        {/* Container 3 — Carousel */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <PromoCarousel />
        </div>

      </div>
    </section>
  );
}
