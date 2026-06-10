import Image from "next/image";
import { Phone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import { CONTACT, STAFF } from "@/components/seo/site";

// Contact values from the single SOT (components/seo/site.ts).
const PHONE_COMPANY = CONTACT.phoneCompanyDisplay; // "02-421-3325"
const PHONE_COMPANY_TEL = `tel:${PHONE_COMPANY.replace(/-/g, "")}`;
const PHONE_DOC = STAFF.doc[0].phone;              // "062-603-0456" (วิน)
const PHONE_DOC_TEL = `tel:${PHONE_DOC.replace(/-/g, "")}`;

/**
 * HomeBottomBanner — full-bleed slogan + LINE CTA banner.
 *
 * Mirrors the bottom banner on customs-clearance-shipping-suvarnabhumi but
 * carries the company slogan + service catalogue (per ปอน 2026-05-23).
 * Same image assets as the customs banner to keep the visual identical.
 *
 * Layout: image bg + banner-wide LINE click (z-0) + text/QR/phones overlay (z-10).
 */
export async function HomeBottomBanner() {
  const t = await getTranslations("homeBottomBanner");
  return (
    <>
      {/* ── Desktop · full-bleed banner ── */}
      <div className="hidden md:block relative w-screen left-1/2 -translate-x-1/2 mt-12 group">
        <Image
          src="/images/bannerdesktop/bannerbottom02.png"
          alt={t("imageAlt")}
          width={3840}
          height={800}
          sizes="100vw"
          className="w-full h-auto block"
          quality={95}
          unoptimized
        />

        {/* Banner-wide LINE click target (sits behind overlay) */}
        <TrackedExternalLink
          href="/line"
          cta="line_banner"
          surface="home_bottom_banner"
          className="absolute inset-0 z-0"
          aria-label={t("lineAria")}
        >
          <span className="sr-only">{t("lineAria")}</span>
        </TrackedExternalLink>

        {/* Text overlay (z-10) — left column · gradient mask handled by the image itself */}
        <div className="absolute inset-y-0 left-0 right-[45%] z-10 pointer-events-none flex flex-col justify-center px-[6%] lg:px-[8%] xl:px-[10%] py-2 lg:py-3">
          <h3 className="text-[20px] lg:text-[30px] xl:text-[40px] font-black text-white leading-[1.05] tracking-[-0.025em] drop-shadow-[0_3px_12px_rgba(0,0,0,0.6)]">
            <span className="text-yellow-300">{t("slogan")}</span>
            <br />
            {t("chooseLabel")} <span className="text-yellow-300">Pacred Shipping</span>
          </h3>
          <p className="mt-1 lg:mt-1.5 text-[11.5px] lg:text-[13px] xl:text-[15px] leading-[1.4] font-medium text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
            {t("services")}{" "}
            <strong className="text-yellow-200 font-black">{t("consultFree")}</strong>
          </p>

          {/* CTA row — QR + 2 phone tel: badges */}
          <div className="mt-1.5 lg:mt-2 xl:mt-2.5 flex flex-wrap items-center gap-2 lg:gap-2.5 self-start ml-[5%] lg:ml-[8%] xl:ml-[11%] pointer-events-auto">
            <TrackedExternalLink
              href="/line"
              cta="line_qr_banner"
              surface="home_bottom_banner_qr"
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
                  {t("scanQr")}
                </p>
                <p className="text-[12.5px] lg:text-[15px] xl:text-[17px] font-black text-primary-700 leading-tight">
                  {t("chatLineFree")}
                </p>
              </div>
            </TrackedExternalLink>

            <div className="flex flex-col gap-1.5 lg:gap-2">
              <a
                href={PHONE_COMPANY_TEL}
                className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
              >
                <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">
                  {PHONE_COMPANY}
                </span>
              </a>
              <a
                href={PHONE_DOC_TEL}
                className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
              >
                <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">
                  {PHONE_DOC}
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile · full-bleed banner (aspect 6:5, text on left over dark gradient) ── */}
      <div className="md:hidden relative w-screen left-1/2 -translate-x-1/2 mt-8 group aspect-[6/5] overflow-hidden">
        <Image
          src="/images/bannermobile/pacredbannermobile01.png"
          alt={t("imageAlt")}
          fill
          sizes="100vw"
          className="object-cover object-top"
          quality={95}
          unoptimized
        />

        <TrackedExternalLink
          href="/line"
          cta="line_banner_mobile"
          surface="home_bottom_banner_mobile"
          className="absolute inset-0 z-0"
          aria-label={t("lineAria")}
        >
          <span className="sr-only">{t("lineAria")}</span>
        </TrackedExternalLink>

        <div className="absolute inset-0 z-10 pointer-events-none px-4 pt-3.5 pb-6 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col items-start gap-2.5">
          <div>
            <h3 className="text-[24px] font-black text-white leading-[1.1] tracking-[-0.02em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
              <span className="text-yellow-300">{t("slogan")}</span>
              <br />
              {t("chooseLabel")} <span className="text-yellow-300">Pacred Shipping</span>
            </h3>
            <p className="mt-2 text-[13.5px] leading-[1.45] font-medium text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
              {t("services")}{" "}
              <strong className="text-yellow-200 font-black">{t("consultFree")}</strong>
            </p>
          </div>

          {/* QR (clickable) */}
          <TrackedExternalLink
            href="/line"
            cta="line_qr_banner_mobile"
            surface="home_bottom_banner_mobile_qr"
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

          {/* Phones (tap to call) */}
          <div className="flex flex-col gap-1.5 pointer-events-auto">
            <a
              href={PHONE_COMPANY_TEL}
              className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
            >
              <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
              <span className="text-[13px] font-black text-primary-700 tracking-tight">
                {PHONE_COMPANY}
              </span>
            </a>
            <a
              href={PHONE_DOC_TEL}
              className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
            >
              <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
              <span className="text-[13px] font-black text-primary-700 tracking-tight">
                {PHONE_DOC}
              </span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
