import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Home,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  Phone,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { ContactSales } from "@/components/sections/contact-sales";
import { Footer } from "@/components/sections/footer";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { JsonLd } from "@/components/seo/json-ld";
import {
  breadcrumbSchema,
  serviceSchema,
} from "@/components/seo/schemas";
import { LINE_OA, CONTACT, STAFF } from "@/components/seo/site";
import {
  CUSTOMS_PORTS,
  TEMPLATES,
  findCustomsPortBySlug,
} from "@/components/sections/customs-port-data";

const PARENT_PATH = "/customs-clearance-shipping-suvarnabhumi";

// Contact values from the single SOT (components/seo/site.ts).
const PHONE_COMPANY = CONTACT.phoneCompanyDisplay; // "02-421-3325"
const PHONE_COMPANY_TEL = `tel:${PHONE_COMPANY.replace(/-/g, "")}`;
const PHONE_DOC = STAFF.doc[0].phone;              // "062-603-0456" (วิน)
const PHONE_DOC_TEL = `tel:${PHONE_DOC.replace(/-/g, "")}`;

// Dynamic render — the shared <NavBar> reads auth cookies (a dynamic API);
// static prerender would throw DYNAMIC_SERVER_USAGE in production.
export const dynamic = "force-dynamic";

// Public price masking — show only the first 2 digits of each number, the rest
// as "x" (1,500 → 1,5xx · 500-5,000 → 50x-5,0xx). Non-numeric values like
// "รอเช็ค" pass through. The one fee shown in FULL is "ค่าพิธีการศุลกากร".
function maskPrice(label: string, value: string): string {
  if (label.includes("ค่าพิธีการศุลกากร")) return value;
  return value.replace(/\d[\d,]*/g, (numStr) => {
    let n = 0;
    return numStr.replace(/\d/g, (d) => (++n <= 2 ? d : "x"));
  });
}

export function generateStaticParams() {
  return CUSTOMS_PORTS.map((port) => ({ port: port.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; port: string }>;
}): Promise<Metadata> {
  const { locale, port: portSlug } = await params;
  const port = findCustomsPortBySlug(portSlug);
  if (!port) return {};

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const path = `${PARENT_PATH}/${port.slug}`;
  // Root layout's title template appends " | Pacred" — don't duplicate it.
  const title =
    typedLocale === "th"
      ? `เคลียร์ศุลกากร ${port.name} · ค่าใช้จ่ายครบทุกหัว`
      : `Customs clearance ${port.name} · full fee breakdown`;
  const description =
    typedLocale === "th"
      ? `${port.shortDesc} ค่าพิธีการเริ่มต้น ${port.customsServiceFee} บาท + ค่าใช้จ่ายอื่นตามจริง — ขอใบเสนอราคาฟรีจากทีม Pacred Shipping`
      : `${port.shortDesc} Starting at ${port.customsServiceFee} THB + variable fees — request a free quote from Pacred Shipping.`;

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        "th-TH": path,
        "en-US": `/en${path}`,
        "x-default": path,
      },
    },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      locale: typedLocale === "en" ? "en_US" : "th_TH",
      alternateLocale: typedLocale === "en" ? ["th_TH"] : ["en_US"],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CustomsPortDetailPage({
  params,
}: {
  params: Promise<{ locale: string; port: string }>;
}) {
  const { locale, port: portSlug } = await params;
  const port = findCustomsPortBySlug(portSlug);
  if (!port) notFound();

  // Auth gate — the customs detail page is only available to signed-in members.
  // Guests are routed through `/login?next=<this-page>` so they land back here
  // after authenticating (same pattern as `/start-order`).
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) {
    redirect({
      href: { pathname: "/login", query: { next: `${PARENT_PATH}/${port.slug}` } },
      locale,
    });
  }

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const template = TEMPLATES[port.template];
  const t = await getTranslations("customsClearancePort");
  const homeLabel = t("breadcrumbHome");
  const customsLabel = t("breadcrumbCustoms");

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: `เคลียร์ศุลกากร ${port.name}`,
            description: port.shortDesc,
            slug: `${PARENT_PATH}/${port.slug}`,
            locale: typedLocale,
            serviceType: port.modeBadge,
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: customsLabel, path: PARENT_PATH },
              { name: port.name, path: `${PARENT_PATH}/${port.slug}` },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar hideOnMobile />
      <main>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1180px] px-4 md:px-5 pt-4 md:pt-5"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px] flex-wrap">
            <li>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors"
              >
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>{homeLabel}</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.2} />
            </li>
            <li>
              <Link
                href={PARENT_PATH}
                className="text-muted hover:text-primary-600 transition-colors"
              >
                {customsLabel}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground">
              {port.name}
            </li>
          </ol>
        </nav>

        {/* ─── Main 2-col layout ─── */}
        <section className="relative pt-4 md:pt-6 pb-8 md:pb-12">
          <div className="mx-auto w-full max-w-[1180px] px-4 md:px-5">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-10 items-start">
              {/* ═══ LEFT/CENTER content column ═══ */}
              <div className="min-w-0 lg:order-1 order-2">
                {/* Mode badge + title */}
                <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
                  <port.modeIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
                  {port.modeBadge}
                </div>
                <h1 className="text-[24px] md:text-[40px] leading-[1.15] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
                  {t("h1Prefix")} · <span className="text-primary-600">{port.name}</span>
                </h1>
                <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted">
                  {port.sub} · {t("h2FeePrefix")} <span className="text-primary-600 font-bold">{port.customsServiceFee} {t("baht")}</span> {t("h2FeeSuffix")}
                </h2>

                {/* Full pricing breakdown — moved right under the title
                    per ปอน: customers should see the per-line breakdown
                    immediately after they read "เคลียร์ที่ไหน". The
                    long-form Air/Sea/Truck template content sits below
                    the breakdown for users who want context. */}
                <div className="mt-6 md:mt-8">
                  <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
                    {t("pricingBadge")}
                  </div>
                  <h3 className="text-[20px] md:text-[26px] leading-[1.18] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
                    {t("pricingH3")}
                  </h3>
                  <p className="mt-2 text-[12.5px] md:text-[14px] leading-[1.6] font-medium text-muted">
                    {t("pricingDisclaimer")}
                  </p>

                  <div className="mt-5 md:mt-6 space-y-4 md:space-y-5">
                    {port.pricingSections.map((sec) => (
                      <div
                        key={sec.heading}
                        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5"
                      >
                        <div className="text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white mb-3 flex items-center gap-1.5">
                          {/* sec.icon is an emoji ("🚢"/"🚆") — render as text, NOT next/image
                              (incident: "Failed to parse src '🚢' on next/image"). */}
                          <span
                            aria-hidden
                            className="text-[18px] md:text-[20px] leading-none shrink-0"
                          >
                            {sec.icon}
                          </span>
                          <span>{sec.heading}</span>
                        </div>
                        <ul className="divide-y divide-border/70">
                          {sec.items.map((item) => (
                            <li
                              key={item.label}
                              className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0 text-[12.5px] md:text-[13.5px] leading-snug"
                            >
                              <span className="text-foreground/85 font-medium">
                                {item.label}
                              </span>
                              <span className="text-foreground font-bold whitespace-nowrap">
                                {maskPrice(item.label, item.value)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}

                    {/* Summary card */}
                    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 md:p-6 flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <div className="text-[11px] md:text-[12px] font-bold text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
                          📌 {port.summaryLabel}
                        </div>
                        <div className="mt-1.5 text-[22px] md:text-[28px] font-black text-primary-700 dark:text-primary-300 leading-tight">
                          {port.summaryPrice}
                        </div>
                        <p className="mt-1 text-[11.5px] md:text-[12.5px] text-muted font-medium">
                          {port.summaryNote}
                        </p>
                      </div>
                      <a
                        href={LINE_OA.shortUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-cta="quote-summary"
                        className="inline-flex items-center justify-center gap-2 h-12 px-5 md:px-6 rounded-xl bg-primary-600 text-white font-black text-[13.5px] md:text-[14.5px] hover:bg-primary-700 transition-colors shadow-[0_6px_18px_rgba(220,38,38,0.30)]"
                      >
                        {t("ctaFreeQuote")}
                        <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Template intro (now below the price breakdown) */}
                <div className="mt-8 md:mt-10">
                  <h3 className="text-[18px] md:text-[22px] font-black text-[#111827] dark:text-white tracking-tight">
                    {template.title}
                  </h3>
                  <p className="mt-3 text-[13px] md:text-[15px] leading-[1.7] text-foreground/85 font-medium">
                    {template.intro}
                  </p>
                </div>

                {/* Carriers */}
                <div className="mt-6 rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
                  <div className="text-[10.5px] md:text-[11px] font-bold text-muted tracking-[0.10em] uppercase mb-2.5">
                    {template.carriersLabel}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {template.carriers.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-2.5 h-7 rounded-md bg-primary-50/70 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 text-[11.5px] md:text-[12px] font-bold text-primary-700 dark:text-primary-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* เหมาะสำหรับ */}
                <div className="mt-5 rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
                  <div className="text-[10.5px] md:text-[11px] font-bold text-muted tracking-[0.10em] uppercase mb-2.5">
                    {template.forLabel}
                  </div>
                  <ul className="space-y-2">
                    {template.forItems.map((it) => (
                      <li
                        key={it}
                        className="flex items-start gap-2 text-[12.5px] md:text-[13.5px] leading-[1.6] text-foreground/85"
                      >
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-600 shrink-0" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* บริการหลัก */}
                <div className="mt-5 rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5">
                  <div className="text-[10.5px] md:text-[11px] font-bold text-muted tracking-[0.10em] uppercase mb-2.5">
                    {template.servicesLabel}
                  </div>
                  <ul className="space-y-2">
                    {template.services.map((s) => (
                      <li
                        key={s}
                        className="flex items-start gap-2 text-[12.5px] md:text-[13.5px] leading-[1.6] text-foreground/85"
                      >
                        <CheckCircle2 className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" strokeWidth={2.6} />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* รองรับสินค้า (air only) */}
                {template.goods && template.goodsLabel && (
                  <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-background/30 p-4 md:p-5">
                    <div className="text-[10.5px] md:text-[11px] font-bold text-muted tracking-[0.10em] uppercase mb-1.5">
                      {template.goodsLabel}
                    </div>
                    <p className="text-[12.5px] md:text-[13.5px] leading-[1.6] text-foreground/85 font-medium">
                      {template.goods}
                    </p>
                  </div>
                )}
              </div>

              {/* ═══ RIGHT aside: image + quote box (sticky on desktop) ═══ */}
              <aside className="lg:order-2 order-1 lg:sticky lg:top-24 self-start space-y-3 md:space-y-4">
                {/* Image */}
                <div className="relative aspect-[16/10] lg:aspect-[4/3] rounded-2xl md:rounded-3xl overflow-hidden">
                  <Image
                    src={port.heroImage ?? port.image}
                    alt={port.imageAlt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 360px"
                    className="object-cover"
                    priority
                  />
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${port.accent} mix-blend-multiply opacity-25`}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-primary-700 text-[10.5px] md:text-[11px] font-black tracking-[0.10em] shadow-md">
                      <port.modeIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
                      {port.modeBadge}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <h2 className="text-[18px] md:text-[22px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                      {port.name}
                    </h2>
                    <p className="mt-0.5 text-[11px] md:text-[12px] text-white/90 font-medium drop-shadow">
                      {port.sub}
                    </p>
                  </div>
                </div>

                {/* Quote box */}
                <div className="rounded-2xl md:rounded-3xl border border-primary-100 dark:border-primary-900/50 bg-white dark:bg-surface p-4 md:p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                  <div className="text-[10.5px] md:text-[11px] font-bold text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
                    {t("quoteBoxLabel")}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-[36px] md:text-[44px] font-black text-primary-600 dark:text-primary-300 leading-none tracking-tight">
                      {port.customsServiceFee}
                    </span>
                    <span className="text-[15px] md:text-[18px] font-black text-primary-700 dark:text-primary-300">
                      {t("baht")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] md:text-[12.5px] text-muted font-medium leading-[1.5]">
                    {t("quoteBoxSubNote")}{" "}
                    <span className="text-primary-700 dark:text-primary-300 font-bold">
                      {port.summaryPrice}
                    </span>
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <a
                      href={LINE_OA.shortUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-cta="quote-aside"
                      className="inline-flex w-full items-center justify-center gap-2 h-11 rounded-xl bg-primary-600 text-white font-black text-[13px] md:text-[13.5px] hover:bg-primary-700 transition-colors shadow-[0_6px_18px_rgba(220,38,38,0.30)]"
                    >
                      {t("ctaFreeQuoteFast")}
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                    </a>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <ContactSales hideAssuranceStrip />

        {/* ─── CLEARANCE GUARANTEE banner — anchored to ContactSales on detail pages per ปอน 2026-05-22 */}
        <section className="relative pt-2 md:pt-4 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            {/* Desktop — Trip.com-style FULL-BLEED banner with text overlay,
                LINE-QR + 2 tel: badges. Outer is a plain <div> (can't nest <a>
                inside <a>); the banner-wide LINE click target is layered via
                an absolute <TrackedExternalLink> behind the text overlay. */}
            <div className="hidden md:block relative w-screen left-1/2 -translate-x-1/2 mt-12 group">
              <Image
                src="/images/bannerdesktop/bannerbottom02.png"
                alt={t("bannerDesktopAlt")}
                width={3840}
                height={800}
                sizes="100vw"
                className="w-full h-auto block"
                quality={95}
                unoptimized
              />

              {/* Banner-wide click target (LINE) — sits behind the overlay so
                  clicks on the visual/empty areas still route to LINE. */}
              <TrackedExternalLink
                href="/line"
                cta="line_banner"
                surface="customs_clearance_detail_bottom_banner"
                className="absolute inset-0 z-0"
                aria-label={t("lineAriaLabel")}
              >
                <span className="sr-only">{t("lineAriaLabel")}</span>
              </TrackedExternalLink>

              {/* Text overlay (z-10) — pointer-events:none lets clicks through
                  to the banner-wide LINE target, except on the CTA row which
                  re-enables them so QR + phone badges are tappable. */}
              <div className="absolute inset-y-0 left-0 right-[45%] z-10 pointer-events-none flex flex-col justify-center px-[6%] lg:px-[8%] xl:px-[10%] py-2 lg:py-3">
                <div className="inline-flex items-center gap-1.5 mb-1 lg:mb-1.5 text-yellow-300 text-[11px] lg:text-[13px] xl:text-[15px] font-black tracking-[0.08em] uppercase drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)]">
                  <ShieldCheck className="w-3.5 h-3.5 lg:w-4 lg:h-4 xl:w-5 xl:h-5" strokeWidth={2.6} />
                  {t("guaranteeBadge")}
                </div>
                <h3 className="text-[20px] lg:text-[30px] xl:text-[40px] font-black text-white leading-[1.05] tracking-[-0.025em] drop-shadow-[0_3px_12px_rgba(0,0,0,0.6)]">
                  {t("guaranteeH3Line1")}
                  <br />
                  {t("guaranteeH3Line2Prefix")} <span className="text-yellow-300">Pacred Shipping</span>
                </h3>
                <p className="mt-1 lg:mt-1.5 text-[11.5px] lg:text-[13px] xl:text-[15px] leading-[1.4] font-medium text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                  {t("guaranteeParaPrefix")}{" "}
                  <strong className="text-yellow-200 font-black">{t("guaranteeParaStrong")}</strong>
                  {" "}{t("guaranteeParaSuffix")}
                </p>

                {/* CTA row — QR card + 2 phone tel: badges. */}
                <div className="mt-1.5 lg:mt-2 xl:mt-2.5 flex flex-wrap items-center gap-2 lg:gap-2.5 self-start ml-[5%] lg:ml-[8%] xl:ml-[11%] pointer-events-auto">
                  <TrackedExternalLink
                    href="/line"
                    cta="line_qr_banner"
                    surface="customs_clearance_detail_bottom_banner_qr"
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
                      <p className="text-[11px] lg:text-[10.5px] xl:text-[11.5px] font-bold text-primary-600 tracking-[0.05em] uppercase">
                        {t("qrScanLabel")}
                      </p>
                      <p className="text-[12.5px] lg:text-[15px] xl:text-[17px] font-black text-primary-700 leading-tight">
                        {t("qrLineCtaArrow")}
                      </p>
                    </div>
                  </TrackedExternalLink>

                  <div className="flex flex-col gap-1.5 lg:gap-2">
                    <a
                      href={PHONE_COMPANY_TEL}
                      className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
                    >
                      <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                      <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">{PHONE_COMPANY}</span>
                    </a>
                    <a
                      href={PHONE_DOC_TEL}
                      className="inline-flex items-center gap-1.5 lg:gap-2 bg-white/95 backdrop-blur-sm rounded-md lg:rounded-lg px-2.5 lg:px-3 py-1 lg:py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.22)] hover:scale-[1.04] hover:bg-white transition-all"
                    >
                      <Phone className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-primary-600" strokeWidth={2.7} />
                      <span className="text-[12px] lg:text-[14px] xl:text-[16px] font-black text-primary-700 tracking-tight">{PHONE_DOC}</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile — Trip-style full-bleed banner (1080×1080 source). */}
            <div className="md:hidden relative w-screen left-1/2 -translate-x-1/2 mt-8 group aspect-[6/5] overflow-hidden">
              <Image
                src="/images/bannermobile/pacredbannermobile01.png"
                alt={t("bannerMobileAlt")}
                fill
                sizes="100vw"
                className="object-cover object-top"
                quality={95}
                unoptimized
              />

              <TrackedExternalLink
                href="/line"
                cta="line_banner_mobile"
                surface="customs_clearance_detail_bottom_banner_mobile"
                className="absolute inset-0 z-0"
                aria-label={t("lineAriaLabel")}
              >
                <span className="sr-only">{t("lineAriaLabel")}</span>
              </TrackedExternalLink>

              <div className="absolute inset-0 z-10 pointer-events-none px-4 pt-3.5 pb-6 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col items-start gap-2.5">
                <div>
                  <div className="inline-flex items-center gap-1.5 mb-1.5 text-yellow-300 text-[11px] font-black tracking-[0.10em] uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]">
                    <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
                    {t("guaranteeBadge")}
                  </div>
                  <h3 className="text-[24px] font-black text-white leading-[1.1] tracking-[-0.02em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                    {t("guaranteeH3Line1")}
                    <br />
                    {t("guaranteeH3Line2Prefix")} <span className="text-yellow-300">Pacred Shipping</span>
                  </h3>
                  <p className="mt-2 text-[13.5px] leading-[1.45] font-medium text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]">
                    {t("guaranteeParaPrefix")}{" "}
                    <strong className="text-yellow-200 font-black">{t("guaranteeParaStrongMobile")}</strong>
                    {" "}{t("guaranteeParaSuffix")}
                  </p>
                </div>

                <TrackedExternalLink
                  href="/line"
                  cta="line_qr_banner_mobile"
                  surface="customs_clearance_detail_bottom_banner_mobile_qr"
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
                    href={PHONE_COMPANY_TEL}
                    className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
                  >
                    <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
                    <span className="text-[13px] font-black text-primary-700 tracking-tight">{PHONE_COMPANY}</span>
                  </a>
                  <a
                    href={PHONE_DOC_TEL}
                    className="inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
                  >
                    <Phone className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.8} />
                    <span className="text-[13px] font-black text-primary-700 tracking-tight">{PHONE_DOC}</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
