import { Award } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CertsSlideshow } from "@/components/sections/certs-slideshow";
import { LclScopeBullets } from "@/components/sections/lcl-hero";

/**
 * LCL "Why Pacred" — mirrors the customs landing block:
 * eyebrow + h2 + p + <CertsSlideshow /> + the LCL scope-bullets card
 * (moved down here from the hero per owner 2026-06-05).
 */
export async function LclWhyPacred() {
  const t = await getTranslations("lclWhyPacred");
  const highlight = (chunks: React.ReactNode) => (
    <span className="text-primary-600">{chunks}</span>
  );
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Award className="w-3.5 h-3.5" strokeWidth={2.6} />
          WHY LCL WITH PACRED · 15+ YEARS
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          {t.rich("title", { highlight })}
        </h2>
        <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
          {t("intro")}
        </p>

        <div className="mt-6 md:mt-8 flex flex-col gap-6 md:gap-8 items-stretch">
          <CertsSlideshow />

          {/* LCL scope-bullets card (moved down from the hero) */}
          <div>
            <h3 className="text-[22px] md:text-[30px] font-black text-[#111827] dark:text-white leading-[1.25] mb-3 md:mb-4 tracking-tight">
              {t("cardTitlePrefix")} <span className="text-primary-600">Pacred Shipping</span>
              <span className="block mt-1.5 md:mt-2 text-[17px] md:text-[20px] font-bold text-foreground/85 leading-snug">
                {t("cardSubPrefix")} <span className="text-primary-600">{t("cardSubHighlight")}</span>
              </span>
            </h3>
            <LclScopeBullets />
          </div>
        </div>
      </div>
    </section>
  );
}
