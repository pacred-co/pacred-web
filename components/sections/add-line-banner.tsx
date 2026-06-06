import Image from "next/image";
import { ArrowRight, Phone, MessageCircle, MousePointerClick } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

type AddLineBannerProps = {
  /** Analytics surface id — disambiguate the two instances on a page. */
  surface?: string;
};

/**
 * Reusable green LINE-CTA banner — extracted from the customs landing
 * (the slim "ทักไลน์ปรึกษาฟรี" green banner). Mirrors the customs markup
 * exactly; LCL copy hardcoded inside so the owner can refine in one place.
 * The whole banner is one clickable LINE link.
 */
export async function AddLineBanner({ surface = "lcl_addline_banner" }: AddLineBannerProps = {}) {
  const t = await getTranslations("addLineBanner");
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <TrackedExternalLink
          href={LINE_URL}
          cta="line_consult"
          surface={surface}
          aria-label={t("aria")}
          className="group block relative max-w-[1100px] mx-auto no-underline"
        >
          <div
            className="relative overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(6,199,85,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(6,199,85,0.5)] group-hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg, #00B900 0%, #06C755 45%, #02A340 100%)" }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay"
              style={{ background: "radial-gradient(circle at 25% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            />

            <div className="relative grid grid-cols-[1fr_auto] items-center gap-3 md:gap-6 pl-4 md:pl-8 pr-2 md:pr-4 min-h-[130px] md:min-h-[170px]">
              <div className="min-w-0 py-3 md:py-3">
                <p className="hidden md:block text-[44px] font-black text-white leading-[1.05] tracking-tight whitespace-nowrap [text-shadow:0_2px_6px_rgba(1,58,20,0.45)]">
                  {t("headlineDesktop")}
                  <ArrowRight className="inline-block ml-2 w-7 h-7 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                </p>
                <p className="hidden md:block mt-1.5 text-[15px] font-semibold text-white/90 leading-snug tracking-tight whitespace-nowrap [text-shadow:0_1px_3px_rgba(1,58,20,0.4)]">
                  {t("subtitleDesktop")}
                </p>
                <p className="hidden md:flex mt-1.5 text-[18px] font-bold text-white/95 items-center gap-3 [text-shadow:0_1px_3px_rgba(1,58,20,0.45)]">
                  <Phone className="w-5 h-5 shrink-0" strokeWidth={2.6} />
                  <span>062-603-0456</span>
                  <span className="text-white/60">·</span>
                  <MessageCircle className="w-5 h-5 shrink-0" strokeWidth={2.6} />
                  <span>{t.rich("lineHandle", { b: (chunks) => <span className="font-black">{chunks}</span> })}</span>
                </p>

                <p className="md:hidden text-[32px] font-black text-white leading-[1.0] tracking-tight [text-shadow:0_2px_6px_rgba(1,58,20,0.45)]">
                  {t("headlineMobile")}
                </p>
                <p className="md:hidden mt-1.5 text-[14.5px] font-extrabold text-white leading-snug tracking-tight [text-shadow:0_1px_4px_rgba(1,58,20,0.45)]">
                  {t("subtitleMobile")}
                  <ArrowRight className="inline-block ml-1 w-4 h-4 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                </p>
                <p className="md:hidden mt-1 text-[11px] font-medium text-white/85 leading-snug tracking-tight [text-shadow:0_1px_3px_rgba(1,58,20,0.4)]">
                  {t("noteMobile")}
                </p>
              </div>

              <div className="relative w-[110px] md:w-[180px] h-[130px] md:h-[170px] self-stretch shrink-0">
                <Image
                  src="/images/visit/visit01.png"
                  alt={t("photoAlt")}
                  fill
                  sizes="(max-width: 768px) 110px, 180px"
                  className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(1,58,20,0.35)]"
                />
              </div>

              <div className="pointer-events-none absolute top-1 md:top-2 right-2 md:right-4 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
                <span className="text-white text-[10.5px] md:text-[14px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(1,58,20,0.55)] whitespace-nowrap">
                  {t("clickBadge")}
                </span>
                <MousePointerClick className="mt-0.5 w-3.5 h-3.5 md:w-[18px] md:h-[18px] text-white drop-shadow-[0_1px_2px_rgba(1,58,20,0.5)]" strokeWidth={2.6} />
              </div>
            </div>
          </div>
        </TrackedExternalLink>
      </div>
    </section>
  );
}
