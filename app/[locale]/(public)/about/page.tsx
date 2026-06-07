import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight,
  Award,
  Clock,
  Boxes,
  ShieldCheck,
  MapPin,
  Phone,
  Navigation,
  ArrowRight,
  Warehouse,
  Building2,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { PacredExperience } from "@/components/sections/pacred-experience";
import { WhyPacred } from "@/components/sections/why-pacred";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { getTranslations } from "next-intl/server";

const PATH = "/about";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.about" });
}

const STAT_ICONS = [Award, Boxes, Clock, ShieldCheck];
const STAT_VALUES = ["14+", "50,000+", "1", "100%"];

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations("aboutPage");

  const STATS = [
    { icon: STAT_ICONS[0], value: STAT_VALUES[0], suffix: t("statSuffixYears"), label: t("statLabelExperience") },
    { icon: STAT_ICONS[1], value: STAT_VALUES[1], suffix: t("statSuffixContainers"), label: t("statLabelContainers") },
    { icon: STAT_ICONS[2], value: STAT_VALUES[2], suffix: t("statSuffixHours"), label: t("statLabelAssessment") },
    { icon: STAT_ICONS[3], value: STAT_VALUES[3], suffix: "", label: t("statLabelLegal") },
  ];

  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
            { name: typedLocale === "th" ? "เกี่ยวกับ Pacred" : "About Pacred", path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <SearchBar />
      <main>

        {/* Hero with Pacred Office image */}
        <section className="relative py-5 md:py-10">
          <div className="mx-auto w-full max-w-[1280px] px-3 md:px-4">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                {t("breadcrumbHome")}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white">{t("breadcrumbAbout")}</span>
            </nav>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 md:gap-8 items-stretch">

              {/* Left — text intro */}
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                  <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                  ABOUT US
                </div>
                <h1 className="text-[26px] md:text-[44px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                  {t("heroHeading")}
                  <span className="text-primary-600"> Pacred Shipping</span>
                </h1>
                <p className="mt-2 md:mt-3 text-[13.5px] md:text-[16px] leading-[1.65] font-medium text-muted">
                  {t("heroDescription")}
                </p>

                {/* Stats grid */}
                <div className="mt-5 md:mt-7 grid grid-cols-2 gap-2.5 md:gap-3">
                  {STATS.map(({ icon: Icon, value, suffix, label }) => (
                    <div
                      key={label}
                      className="group relative overflow-hidden rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-3 md:p-4 shadow-[0_4px_15px_rgba(15,23,42,0.04)] hover:shadow-[0_10px_24px_rgba(220,38,38,0.10)] hover:border-primary-200 dark:hover:border-primary-900 hover:-translate-y-0.5 transition-all"
                    >
                      <div className="inline-flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_4px_10px_rgba(220,38,38,0.20)]">
                        <Icon className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2.4} />
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-[22px] md:text-[30px] leading-none font-black text-[#111827] dark:text-white tracking-[-0.03em]">
                          {value}
                        </span>
                        {suffix && (
                          <span className="text-[12px] md:text-[14px] font-extrabold text-primary-600">{suffix}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11.5px] md:text-[12.5px] font-bold text-muted">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — Pacred Office image */}
              <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[420px] overflow-hidden rounded-2xl md:rounded-3xl border border-border shadow-[0_14px_34px_rgba(15,23,42,0.10)]">
                <Image
                  src="/images/companyofficethai.png"
                  alt={t("officeImageAlt")}
                  fill
                  sizes="(max-width: 1024px) 100vw, 620px"
                  quality={95}
                  className="object-cover"
                  priority
                />
                {/* Pacred logo watermark */}
                <div className="absolute top-3 left-3 md:top-4 md:left-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 dark:bg-surface/95 backdrop-blur-sm shadow-md">
                  <Image
                    src="/images/pacred-logo-red.png"
                    alt="Pacred"
                    width={20}
                    height={20}
                    className="h-4 w-4 object-contain"
                  />
                  <span className="text-[11px] md:text-[12px] font-black text-primary-600 tracking-wide">
                    PACRED HQ
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Open Experience — text blocks */}
        <PacredExperience />

        {/* Office Info — Address + Google Map + Photos */}
        <section className="py-8 md:py-14">
          <div className="mx-auto w-full max-w-[1280px] px-3 md:px-4">

            {/* Heading */}
            <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              OFFICE · HEADQUARTERS
            </div>
            <h2 className="text-[22px] md:text-[36px] leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
              {t("officeHeading")}
              <span className="text-primary-600"> Pacred Shipping</span>
            </h2>
            <p className="mt-1.5 text-[13px] md:text-[15px] leading-[1.65] font-medium text-muted max-w-[760px]">
              {t("officeDescription")}
            </p>

            <div className="mt-5 md:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 md:gap-6 items-stretch">

              {/* Left — Address card + photo grid */}
              <div className="flex flex-col gap-3 md:gap-4">

                {/* Address card */}
                <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_22px_rgba(0,0,0,0.05)]">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shrink-0 shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                      <Building2 className="w-5 h-5 md:w-5.5 md:h-5.5" strokeWidth={2.4} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] md:text-[11px] font-black text-primary-600 tracking-[0.14em] uppercase">
                        HEADQUARTERS
                      </div>
                      <h3 className="text-[16px] md:text-[19px] font-black text-[#111827] dark:text-white leading-snug mt-0.5">
                        {t("officeCardHeading")}
                      </h3>
                      <div className="mt-2 flex items-start gap-2 text-[12.5px] md:text-[13.5px] leading-[1.7] text-muted">
                        <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                        <p>
                          {t.rich("officeAddress", {
                            br: () => <br />,
                          })}
                        </p>
                      </div>
                      <div className="mt-3 md:mt-4 flex flex-wrap items-center gap-2">
                        <a
                          href="https://www.google.com/maps/search/?api=1&query=Siri+Avenue+Petchkasem+81+Nong+Khaem+Bangkok+10160"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3 md:px-3.5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[11.5px] md:text-[12px] font-black hover:shadow-[0_8px_18px_rgba(179,0,0,0.30)] transition-shadow"
                        >
                          <Navigation className="w-3.5 h-3.5" strokeWidth={2.6} />
                          {t("openInGoogleMaps")}
                        </a>
                        <a
                          href="tel:0661310253"
                          className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3 md:px-3.5 rounded-full bg-white dark:bg-background text-[#111827] dark:text-white border border-border text-[11.5px] md:text-[12px] font-black hover:border-primary-400 hover:text-primary-700 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
                          066-131-0253
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Hours strip */}
                  <div className="mt-4 pt-3 border-t border-dashed border-border flex items-center gap-2 text-[11.5px] md:text-[12.5px]">
                    <Clock className="w-3.5 h-3.5 text-primary-600 shrink-0" strokeWidth={2.6} />
                    <span className="font-bold text-[#111827] dark:text-white">{t("businessHoursLabel")}</span>
                    <span className="text-muted">{t("businessHoursValue")}</span>
                  </div>
                </div>

                {/* Photo grid */}
                <div className="grid grid-cols-2 gap-2.5 md:gap-3">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="group relative aspect-[4/3] rounded-xl md:rounded-2xl overflow-hidden border border-border shadow-[0_6px_16px_rgba(15,23,42,0.06)]"
                    >
                      <Image
                        src={`/images/officethai/${n}.png`}
                        alt={t("officePhotoAlt", { n })}
                        fill
                        sizes="(max-width: 1024px) 50vw, 300px"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                      />
                      <div className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 dark:bg-surface/90 backdrop-blur-sm text-[9.5px] md:text-[10px] font-black text-primary-600">
                        OFFICE {n}/2
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — Google Map embed */}
              <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[460px] overflow-hidden rounded-2xl md:rounded-3xl border border-border shadow-[0_10px_28px_rgba(15,23,42,0.08)] bg-surface">
                <iframe
                  src="https://www.google.com/maps?q=Siri+Avenue+Petchkasem+81+Nong+Khaem+Bangkok+10160&hl=th&z=16&output=embed"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={t("mapIframeTitle")}
                  className="absolute inset-0 w-full h-full border-0"
                />
                {/* Floating pin badge */}
                <div className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 dark:bg-surface/95 backdrop-blur-sm shadow-md border border-border">
                  <MapPin className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.6} />
                  <span className="text-[11px] md:text-[12px] font-black text-primary-600 tracking-wide">
                    PACRED HQ
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Our Warehouses CTA */}
        <section className="py-8 md:py-12 bg-gradient-to-b from-surface/40 via-background to-background">
          <div className="mx-auto w-full max-w-[1280px] px-3 md:px-4">

            <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              {t("warehousesBadge")}
            </div>
            <h2 className="text-[22px] md:text-[36px] leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
              {t("warehousesHeading")}
              <span className="text-primary-600"> {t("warehousesHeadingAccent")}</span>
            </h2>
            <p className="mt-1.5 text-[13px] md:text-[15px] leading-[1.65] font-medium text-muted max-w-[760px]">
              {t("warehousesDescription")}
            </p>

            <div className="mt-5 md:mt-8 grid grid-cols-1 md:grid-cols-3 gap-3.5 md:gap-5">

              {/* Thai warehouse */}
              <Link
                href="/warehouses/thailand"
                className="group relative overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.15)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                  <Image
                    src="/images/warehousethai118/1.png"
                    alt={t("thaiWarehouseImageAlt")}
                    fill
                    sizes="(max-width: 768px) 100vw, 380px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                    unoptimized
                  />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-surface/95 text-primary-600 text-[10.5px] md:text-[11.5px] font-black shadow-[0_4px_10px_rgba(0,0,0,0.10)] backdrop-blur-sm">
                    🇹🇭 THAILAND HUB
                  </div>
                  <div className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 text-primary-800 text-[9.5px] md:text-[10px] font-black tracking-wider shadow-md">
                    MAIN
                  </div>
                </div>
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-1.5 text-[10.5px] md:text-[11px] font-bold text-muted mb-1 uppercase tracking-wider">
                    <MapPin className="w-3 h-3 text-primary-600" strokeWidth={2.6} />
                    {t("thaiWarehouseLocation")}
                  </div>
                  <h3 className="text-[17px] md:text-[20px] font-black tracking-[-0.02em] text-[#111827] dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                    {t("thaiWarehouseName")}
                  </h3>
                  <p className="mt-1 text-[12px] md:text-[13px] leading-[1.55] text-muted">
                    {t("thaiWarehouseDesc")}
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-dashed border-border flex items-center justify-between">
                    <span className="text-[11.5px] md:text-[12px] font-black text-primary-600 inline-flex items-center gap-1">
                      {t("thaiWarehouseLink")}
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" strokeWidth={3} />
                    </span>
                  </div>
                </div>
              </Link>

              {/* Guangzhou */}
              <Link
                href="/warehouses/guangzhou"
                className="group relative overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.15)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                  <Image
                    src="/images/gwanzhou.png"
                    alt={t("guangzhouImageAlt")}
                    fill
                    sizes="(max-width: 768px) 100vw, 380px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                    unoptimized
                  />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-surface/95 text-primary-600 text-[10.5px] md:text-[11.5px] font-black shadow-[0_4px_10px_rgba(0,0,0,0.10)] backdrop-blur-sm">
                    🇨🇳 GUANGZHOU
                  </div>
                </div>
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-1.5 text-[10.5px] md:text-[11px] font-bold text-muted mb-1 uppercase tracking-wider">
                    <MapPin className="w-3 h-3 text-primary-600" strokeWidth={2.6} />
                    {t("guangzhouLocation")}
                  </div>
                  <h3 className="text-[17px] md:text-[20px] font-black tracking-[-0.02em] text-[#111827] dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                    {t("guangzhouName")}
                  </h3>
                  <p className="mt-1 text-[12px] md:text-[13px] leading-[1.55] text-muted">
                    {t("guangzhouDesc")}
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-dashed border-border flex items-center justify-between">
                    <span className="text-[11.5px] md:text-[12px] font-black text-primary-600 inline-flex items-center gap-1">
                      {t("warehouseShippingMarkLink")}
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" strokeWidth={3} />
                    </span>
                  </div>
                </div>
              </Link>

              {/* Yiwu */}
              <Link
                href="/warehouses/yiwu"
                className="group relative overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.15)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                  <Image
                    src="/images/pacredyiwu.png"
                    alt={t("yiwuImageAlt")}
                    fill
                    sizes="(max-width: 768px) 100vw, 380px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                    unoptimized
                  />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-surface/95 text-primary-600 text-[10.5px] md:text-[11.5px] font-black shadow-[0_4px_10px_rgba(0,0,0,0.10)] backdrop-blur-sm">
                    🇨🇳 YIWU
                  </div>
                </div>
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-1.5 text-[10.5px] md:text-[11px] font-bold text-muted mb-1 uppercase tracking-wider">
                    <MapPin className="w-3 h-3 text-primary-600" strokeWidth={2.6} />
                    {t("yiwuLocation")}
                  </div>
                  <h3 className="text-[17px] md:text-[20px] font-black tracking-[-0.02em] text-[#111827] dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                    {t("yiwuName")}
                  </h3>
                  <p className="mt-1 text-[12px] md:text-[13px] leading-[1.55] text-muted">
                    {t("yiwuDesc")}
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-dashed border-border flex items-center justify-between">
                    <span className="text-[11.5px] md:text-[12px] font-black text-primary-600 inline-flex items-center gap-1">
                      {t("warehouseShippingMarkLink")}
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" strokeWidth={3} />
                    </span>
                  </div>
                </div>
              </Link>
            </div>

            {/* "See all warehouses" link */}
            <div className="mt-5 md:mt-7 flex justify-center">
              <Link
                href="/warehouses/china"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[12.5px] md:text-[13px] font-black hover:border-primary-400 hover:text-primary-700 hover:-translate-y-0.5 transition-all"
              >
                <Warehouse className="w-4 h-4" strokeWidth={2.5} />
                {t("viewAllWarehouses")}
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
              </Link>
            </div>
          </div>
        </section>

        <WhyPacred />

        {/* Banner CTA */}
        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
