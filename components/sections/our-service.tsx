import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function OurService() {
  const t = useTranslations("ourService");

  const services = [
    // ── Top row (span 3 — large) ──────────────────────────────────────
    {
      title: t("importTitle"),       sub: t("importSub"),
      titleMobile: t("importTitle"), subMobile: t("importSub"),
      href: "/register",
      bgDesktop:   "/images/ourservices/import.png",
      bgMobile:    "/images/ourservices/mobile/import.png",
      iconDesktop: "",
      iconMobile:  "",
      alt: t("importAlt"),
    },
    {
      title: t("exportTitle"),       sub: t("exportSub"),
      titleMobile: t("exportTitle"), subMobile: t("exportSub"),
      href: "/register",
      bgDesktop:   "/images/ourservices/export.png",
      bgMobile:    "/images/ourservices/mobile/export.png",
      iconDesktop: "",
      iconMobile:  "",
      alt: t("exportAlt"),
    },
    // ── Bottom row (span 2 — small) ────────────────────────────────────
    {
      title: t("transferTitle"),       sub: t("transferSub"),
      titleMobile: t("transferTitle"), subMobile: t("transferSub"),
      href: "/register",
      bgDesktop:   "/images/ourservices/exchange.png",
      bgMobile:    "/images/ourservices/mobile/exchange.png",
      iconDesktop: "",
      iconMobile:  "",
      alt: t("transferAlt"),
    },
    {
      title: t("orderTitle"),       sub: t("orderSub"),
      titleMobile: t("orderTitle"), subMobile: t("orderSubMobile"),
      href: "/register",
      bgDesktop:   "/images/ourservices/shop.png",
      bgMobile:    "/images/ourservices/mobile/shop.png",
      iconDesktop: "",
      iconMobile:  "",
      alt: t("orderAlt"),
    },
    {
      title: t("customsTitle"),         sub: t("customsSub"),
      titleMobile: t("customsTitleMobile"), subMobile: t("customsSub"),
      href: "/services/customs-clearance",
      bgDesktop:   "/images/ourservices/custom.png",
      bgMobile:    "/images/ourservices/mobile/custom.png",
      iconDesktop: "",
      iconMobile:  "",
      alt: t("customsAlt"),
    },
  ];

  return (
    <section className="relative z-[5] bg-transparent pt-3 md:pt-6 pb-4 md:pb-5">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Header */}
        <div className="mx-auto w-full max-w-[1120px] mb-4 md:mb-[30px]">
          {/* Eyebrow — both mobile + desktop now (smaller on mobile) */}
          <div className="flex md:flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-3 text-red-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase md:justify-start justify-center">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-red-600 shrink-0" />
            {t("eyebrow")}
          </div>

          {/* Desktop title */}
          <h2 className="hidden md:block text-[42px] leading-[1.22] font-black tracking-[-0.04em] text-[#111827]">
            {t("titlePrefix")}
            <span className="text-red-600">{t("titleHighlight")}</span>
          </h2>

          {/* Mobile title */}
          <div className="md:hidden text-center">
            <h2 className="text-[22px] leading-[1.12] font-black tracking-[-0.03em] text-[#111827]">
              {t("titleMobile")}
            </h2>
            <div className="w-[40px] h-[3px] rounded-full bg-red-600 mx-auto mt-2" />
          </div>

          {/* Subtitle */}
          <p className="mt-3 font-bold text-gray-500 hidden md:block text-[22px] leading-[1.45]">
            {t("subtitlePrefix")}
            <span className="text-red-600 font-black">{t("subtitleHighlight")}</span>
          </p>
          <p className="mt-1.5 font-bold text-gray-500 md:hidden text-[11.5px] leading-[1.3] text-center">
            {t("subtitlePrefix")}
            <span className="text-red-600 font-black">{t("subtitleMobile")}</span>
          </p>
        </div>

        {/* Card grid — 6 columns */}
        <div className="mx-auto w-full max-w-[1120px] grid grid-cols-6 gap-2 md:gap-[18px]">
          {services.map((s, i) => {
            const isTop = i < 2;
            return (
              <Link
                key={i}
                href={s.href}
                aria-label={s.alt}
                className={[
                  "group relative overflow-hidden isolate bg-white",
                  "shadow-[0_14px_34px_rgba(15,23,42,0.12)] border border-black/[0.08]",
                  "transition-[transform,box-shadow] duration-300",
                  "hover:-translate-y-1.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.18)]",
                  isTop
                    ? "col-span-3 h-[125px] md:h-[200px] rounded-[15px] md:rounded-[22px]"
                    : "col-span-2 h-[110px] md:h-[150px] rounded-[13px] md:rounded-[22px]",
                ].join(" ")}
              >
                {/* Background — desktop */}
                <div
                  className="absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat transition-transform duration-500 ease-out group-hover:scale-[1.035] hidden lg:block"
                  style={{ backgroundImage: `url('${s.bgDesktop}')` }}
                />
                {/* Background — mobile */}
                <div
                  className="absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat block lg:hidden"
                  style={{ backgroundImage: `url('${s.bgMobile}')` }}
                />

                {/* Red curved overlay */}
                <div
                  className="absolute -left-[8%] -right-[8%] z-[2] h-[76%] bg-gradient-to-br from-[#ff1717] via-[#e00000] to-[#b90000] shadow-[0_-10px_28px_rgba(220,38,38,0.16)]"
                  style={{ bottom: "-34%", borderRadius: "62% 62% 0 0 / 34% 34% 0 0" }}
                />

                {/* Shine sweep */}
                <div
                  className="absolute -inset-[45%] z-[3] pointer-events-none -translate-x-[65%] rotate-[8deg] transition-transform duration-[650ms] group-hover:translate-x-[65%]"
                  style={{ background: "linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.18) 50%, transparent 64%)" }}
                />

                {/* Icon — desktop */}
                {s.iconDesktop && (
                  <div
                    className="absolute z-[4] bg-contain bg-center bg-no-repeat hidden md:block"
                    style={{
                      backgroundImage: `url('${s.iconDesktop}')`,
                      filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.16))",
                      left:   isTop ? "34px" : "24px",
                      top:    isTop ? "28px" : "24px",
                      width:  isTop ? "38%"  : "33%",
                      height: isTop ? "58%"  : "54%",
                    }}
                  />
                )}

                {/* Icon — mobile */}
                {s.iconMobile && (
                  <div
                    className="absolute z-[4] bg-contain bg-center bg-no-repeat block md:hidden"
                    style={{
                      backgroundImage: `url('${s.iconMobile}')`,
                      left: "50%", top: "8px",
                      transform: "translateX(-50%)",
                      width: "62%", height: "44%",
                    }}
                  />
                )}

                {/* Text — desktop */}
                <div
                  className="absolute z-[5] hidden md:flex flex-col items-start justify-end text-left"
                  style={{
                    left: "40%", right: "26px",
                    bottom: isTop ? "50px" : "25px",
                  }}
                >
                  <span
                    className="text-[#111827] text-[36px] leading-[1] font-black tracking-[-0.04em] whitespace-nowrap"
                    style={{
                      textShadow:
                        "0 0 18px rgba(255,255,255,0.95), 0 0 10px rgba(255,255,255,0.85), 0 0 4px rgba(255,255,255,0.7), 0 2px 6px rgba(255,255,255,0.5)",
                    }}
                  >
                    {s.title}
                  </span>
                  <span
                    className="mt-[10px] text-white text-[20px] leading-[1.1] font-extrabold tracking-[-0.02em] whitespace-nowrap"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.28)" }}
                  >
                    {s.sub}
                  </span>
                </div>

                {/* Text — mobile */}
                <div
                  className="absolute z-[5] flex md:hidden flex-col items-center justify-end text-center"
                  style={{ left: "6px", right: "6px", bottom: "22px" }}
                >
                  <span
                    className="text-[#111827] text-[12px] leading-[1.05] font-black tracking-[-0.02em] truncate max-w-full"
                    style={{
                      textShadow:
                        "0 0 10px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.85), 0 0 3px rgba(255,255,255,0.7), 0 1px 3px rgba(255,255,255,0.5)",
                    }}
                  >
                    {s.titleMobile}
                  </span>
                  <span
                    className="mt-[3px] text-white text-[9.5px] leading-[1.1] font-extrabold truncate max-w-full"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.28)" }}
                  >
                    {s.subMobile}
                  </span>
                </div>

                {/* Arrow — desktop only */}
                <div className="absolute right-[18px] bottom-[18px] z-[6] w-[42px] h-[42px] rounded-full bg-white hidden md:flex items-center justify-center shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-transform duration-300 group-hover:translate-x-1">
                  <ChevronRight className="w-[21px] h-[21px] text-red-600" strokeWidth={3} />
                </div>
              </Link>
            );
          })}
        </div>

      </div>
    </section>
  );
}
