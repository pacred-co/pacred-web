import Image from "next/image";
import {
  Briefcase,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Phone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

/**
 * LCL detailed services + problems block — mirrors the customs landing:
 * service bullets (CheckCircle2) → problem bullets (square) → closing
 * full-bleed desktop + mobile banner with QR + 2 tel: badges.
 */
export function LclServicesProblems() {
  const t = useTranslations("lclServicesProblems");
  const strong = (chunks: React.ReactNode) => (
    <strong className="font-black text-foreground">{chunks}</strong>
  );

  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        {/* ── Services intro ── */}
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Briefcase className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("servicesEyebrow")}
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          {t("servicesHeadingPrefix")} <span className="text-primary-600">{t("servicesHeadingHighlight")}</span> {t("servicesHeadingSuffix")}
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          {t.rich("servicesIntro", {
            b: (chunks) => <strong className="text-primary-600 font-black">{chunks}</strong>,
          })}
        </p>

        {/* Service bullets — CheckCircle2 + bolded keyword */}
        <ul className="mt-6 md:mt-8 flex flex-col gap-y-3 md:gap-y-3.5">
          {[
            t.rich("service1", { b: strong }),
            t.rich("service2", { b: strong }),
            t.rich("service3", { b: strong }),
            t.rich("service4", { b: strong }),
            t.rich("service5", { b: strong }),
            t.rich("service6", { b: strong }),
            t.rich("service7", { b: strong }),
            t.rich("service8", { b: strong }),
            t.rich("service9", { b: strong }),
          ].map((node, idx) => (
            <li key={idx} className="flex items-start gap-2.5 md:gap-3">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-primary-600 shrink-0 mt-[3px] md:mt-[4px]" strokeWidth={2.6} />
              <span className="text-[15px] md:text-[18px] leading-[1.55] text-foreground/95">
                {node}
              </span>
            </li>
          ))}
        </ul>

        {/* ── Problems we solve ── */}
        <div className="mt-8 md:mt-12 inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2.6} />
          {t("problemsEyebrow")}
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          {t("problemsHeadingPrefix")} <span className="text-primary-600">{t("problemsHeadingHighlight")}</span> {t("problemsHeadingSuffix")}
        </h2>
        <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
          {t("problemsIntro")}
        </p>

        <ul className="mt-6 md:mt-8 flex flex-col gap-y-2.5 md:gap-y-3">
          {[
            t.rich("problem1", { b: strong }),
            t.rich("problem2", { b: strong }),
            t.rich("problem3", { b: strong }),
            t.rich("problem4", { b: strong }),
            t.rich("problem5", { b: strong }),
            t.rich("problem6", { b: strong }),
            t.rich("problem7", { b: strong }),
            t.rich("problem8", { b: strong }),
            t.rich("problem9", { b: strong }),
            t.rich("problem10", { b: strong }),
          ].map((node, idx) => (
            <li key={idx} className="flex items-start gap-2.5 md:gap-3">
              <span aria-hidden className="w-2 h-2 md:w-2.5 md:h-2.5 bg-primary-600 mt-[8px] md:mt-[11px] shrink-0 rounded-[2px]" />
              <span className="text-[15px] md:text-[18px] leading-[1.55] text-foreground/95">
                {node}
              </span>
            </li>
          ))}
        </ul>

        {/* ── Closing confidence banner — full-bleed desktop ── */}
        <div className="hidden md:block relative w-screen left-1/2 -translate-x-1/2 mt-12 group">
          <Image
            src="/images/bannerdesktop/bannerbottom02.png"
            alt={t("bannerAlt")}
            width={3840}
            height={800}
            sizes="100vw"
            className="w-full h-auto block"
            quality={95}
            unoptimized
          />

          {/* Banner-wide click target (LINE) */}
          <TrackedExternalLink
            href="/line"
            cta="line_banner"
            surface="lcl_bottom_banner"
            className="absolute inset-0 z-0"
            aria-label={t("lineAria")}
          >
            <span className="sr-only">{t("lineAria")}</span>
          </TrackedExternalLink>

          {/* Text overlay */}
          <div className="absolute inset-y-0 left-0 right-[45%] z-10 pointer-events-none flex flex-col justify-center px-[6%] lg:px-[8%] xl:px-[10%] py-2 lg:py-3">
            <div className="inline-flex items-center gap-1.5 mb-1 lg:mb-1.5 text-yellow-300 text-[11px] lg:text-[13px] xl:text-[15px] font-black tracking-[0.08em] uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)]">
              <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4 xl:w-5 xl:h-5" strokeWidth={2.6} />
              {t("bannerEyebrow")}
            </div>
            <h3 className="text-[20px] lg:text-[30px] xl:text-[40px] font-black text-white leading-[1.05] tracking-[-0.025em] drop-shadow-[0_3px_12px_rgba(0,0,0,0.6)]">
              {t("bannerHeadingLine1")}
              <br />
              {t.rich("bannerHeadingLine2", {
                y: (chunks) => <span className="text-yellow-300">{chunks}</span>,
              })}
            </h3>
            <p className="mt-1 lg:mt-1.5 text-[11.5px] lg:text-[13px] xl:text-[15px] leading-[1.4] font-medium text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
              {t.rich("bannerDesc", {
                y: (chunks) => <strong className="text-yellow-200 font-black">{chunks}</strong>,
              })}
            </p>

            {/* CTA row — QR card + 2 phone tel: badges */}
            <div className="mt-1.5 lg:mt-2 xl:mt-2.5 flex flex-wrap items-center gap-2 lg:gap-2.5 self-start ml-[5%] lg:ml-[8%] xl:ml-[11%] pointer-events-auto">
              <TrackedExternalLink
                href="/line"
                cta="line_qr_banner"
                surface="lcl_bottom_banner_qr"
                className="inline-flex items-center gap-2 lg:gap-2.5 bg-white/95 backdrop-blur-sm rounded-lg lg:rounded-xl p-1.5 pr-2.5 lg:pr-3 shadow-[0_8px_20px_rgba(0,0,0,0.28)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)] hover:scale-[1.03] transition-all duration-200"
              >
                <Image
                  src="/images/qr-line-oa.png"
                  alt={t("qrAlt")}
                  width={140}
                  height={140}
                  className="w-[60px] lg:w-[74px] xl:w-[88px] h-auto block rounded-sm"
                />
                <div className="leading-tight">
                  <p className="text-[9px] lg:text-[10.5px] xl:text-[11.5px] font-bold text-primary-600 tracking-[0.05em] uppercase">
                    {t("qrScanLabel")}
                  </p>
                  <p className="text-[12.5px] lg:text-[15px] xl:text-[17px] font-black text-primary-700 leading-tight">
                    {t("qrLineFree")}
                  </p>
                </div>
              </TrackedExternalLink>

              <div className="flex flex-col gap-1.5 lg:gap-2">
                <a
                  href="tel:024213325"
                  className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
                >
                  <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                  <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">02-421-3325</span>
                </a>
                <a
                  href="tel:0626030456"
                  className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
                >
                  <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                  <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">062-603-0456</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Closing confidence banner — full-bleed mobile ── */}
        <div className="md:hidden relative w-screen left-1/2 -translate-x-1/2 mt-8 group aspect-[6/5] overflow-hidden">
          <Image
            src="/images/bannermobile/pacredbannermobile01.png"
            alt={t("bannerAlt")}
            fill
            sizes="100vw"
            className="object-cover object-top"
            quality={95}
            unoptimized
          />

          <TrackedExternalLink
            href="/line"
            cta="line_banner_mobile"
            surface="lcl_bottom_banner_mobile"
            className="absolute inset-0 z-0"
            aria-label={t("lineAria")}
          >
            <span className="sr-only">{t("lineAria")}</span>
          </TrackedExternalLink>

          <div className="absolute inset-0 z-10 pointer-events-none px-4 pt-3.5 pb-6 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col items-start gap-2.5">
            <div>
              <div className="inline-flex items-center gap-1.5 mb-1.5 text-yellow-300 text-[11px] font-black tracking-[0.10em] uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
                {t("bannerEyebrow")}
              </div>
              <h3 className="text-[24px] font-black text-white leading-[1.1] tracking-[-0.02em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                {t("bannerHeadingLine1")}
                <br />
                {t.rich("bannerHeadingLine2", {
                  y: (chunks) => <span className="text-yellow-300">{chunks}</span>,
                })}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.45] font-medium text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
                {t.rich("bannerDescMobile", {
                  y: (chunks) => <strong className="text-yellow-200 font-black">{chunks}</strong>,
                })}
              </p>
            </div>

            <TrackedExternalLink
              href="/line"
              cta="line_qr_banner_mobile"
              surface="lcl_bottom_banner_mobile_qr"
              className="inline-block bg-white rounded-xl p-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.32)] pointer-events-auto"
              aria-label={t("qrAlt")}
            >
              <Image
                src="/images/qr-line-oa.png"
                alt={t("qrAlt")}
                width={140}
                height={140}
                className="w-[80px] h-auto block rounded-sm"
              />
            </TrackedExternalLink>

            <div className="flex flex-col gap-1.5 pointer-events-auto">
              <a
                href="tel:024213325"
                className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
              >
                <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
                <span className="text-[13px] font-black text-primary-700 tracking-tight">02-421-3325</span>
              </a>
              <a
                href="tel:0626030456"
                className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
              >
                <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
                <span className="text-[13px] font-black text-primary-700 tracking-tight">062-603-0456</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
