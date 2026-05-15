import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  Home,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Phone,
  Sparkles,
  Search,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { ContactSales } from "@/components/sections/contact-sales";
import { ClearanceBanner } from "@/components/sections/clearance-banner";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import {
  breadcrumbSchema,
  serviceSchema,
} from "@/components/seo/schemas";
import { absoluteUrl, CONTACT, LINE_OA, SITE_URL } from "@/components/seo/site";
import {
  CUSTOMS_PORTS,
  TEMPLATES,
  findCustomsPortBySlug,
} from "@/components/sections/customs-port-data";

const PARENT_PATH = "/customs-clearance-shipping-suvarnabhumi";

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
  // Root layout's title.template appends " | Pacred" already — don't
  // duplicate the brand here.
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

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const template = TEMPLATES[port.template];
  const homeLabel = typedLocale === "th" ? "หน้าแรก" : "Home";
  const customsLabel = typedLocale === "th" ? "เคลียร์ศุลกากร" : "Customs";

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
      <SearchBar />
      <main>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-4 md:pt-5"
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
            <li
              aria-current="page"
              className="font-bold text-foreground"
            >
              {port.name}
            </li>
          </ol>
        </nav>

        {/* ─── Hero ─── */}
        <section className="relative pt-4 md:pt-6 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8 items-stretch">
              {/* Image header */}
              <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[340px] rounded-2xl md:rounded-3xl overflow-hidden">
                <Image
                  src={port.image}
                  alt={port.imageAlt}
                  fill
                  sizes="(max-width: 768px) 100vw, 520px"
                  className="object-cover"
                  priority
                />
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${port.accent} mix-blend-multiply opacity-30`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-sm text-primary-700 text-[11px] md:text-[12px] font-black tracking-[0.10em] shadow-md">
                    <port.modeIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
                    {port.modeBadge}
                  </span>
                </div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h1 className="text-[26px] md:text-[36px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                    {port.name}
                  </h1>
                  <p className="mt-0.5 text-[12.5px] md:text-[14px] text-white/90 font-medium drop-shadow">
                    {port.sub}
                  </p>
                </div>
              </div>

              {/* Quote box */}
              <div className="flex flex-col rounded-2xl md:rounded-3xl border border-primary-100 dark:border-primary-900/50 bg-white dark:bg-surface p-5 md:p-7 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
                <div className="text-[11px] md:text-[12px] font-bold text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
                  ค่าพิธีการศุลกากร · เริ่มต้น
                </div>
                <div className="mt-2 flex items-baseline gap-2 flex-wrap">
                  <span className="text-[44px] md:text-[58px] font-black text-primary-600 dark:text-primary-300 leading-none tracking-tight">
                    {port.customsServiceFee}
                  </span>
                  <span className="text-[18px] md:text-[22px] font-black text-primary-700 dark:text-primary-300">
                    บาท
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] md:text-[13.5px] text-muted font-medium leading-[1.55]">
                  + ค่าใช้จ่ายอื่นตามจริง (สายการบิน · ท่า · ขนส่งในไทย · ภาษีนำเข้า) — ดูค่าใช้จ่ายเต็มด้านล่าง
                </p>

                <div className="mt-5 grid grid-cols-1 gap-2.5">
                  <Link
                    href="/register"
                    data-cta="quote-hero"
                    className="inline-flex w-full items-center justify-center gap-2 h-12 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[15px] hover:bg-primary-700 transition-colors shadow-[0_6px_18px_rgba(220,38,38,0.30)]"
                  >
                    ขอใบเสนอราคา ฟรี · ตอบไว 5 นาที
                    <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
                  </Link>
                  <div className="grid grid-cols-2 gap-2.5">
                    <a
                      href={LINE_OA.shortUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-cta="line-hero"
                      className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-[#06C755] text-white font-bold text-[12.5px] md:text-[13.5px] hover:bg-[#05B04C] transition-colors shadow-[0_4px_12px_rgba(6,199,85,0.30)]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.6} />
                      ทักไลน์
                    </a>
                    <a
                      href={`tel:${CONTACT.phone}`}
                      data-cta="phone-hero"
                      className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl border border-primary-200 bg-white text-primary-700 font-bold text-[12.5px] md:text-[13.5px] hover:bg-primary-50 hover:border-primary-300 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-200"
                    >
                      <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
                      โทร {CONTACT.phoneDisplay}
                    </a>
                  </div>
                </div>

                {/* SEO sub-keywords as inline chips */}
                <div className="mt-5 pt-4 border-t border-border">
                  <div className="text-[10px] md:text-[10.5px] font-bold text-muted tracking-[0.10em] uppercase mb-2">
                    <Search className="inline w-3 h-3 mr-1" strokeWidth={2.6} />
                    คำที่ใช้ค้นหาบริการนี้
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {port.subKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="inline-flex items-center px-2 h-6 rounded-md bg-primary-50/70 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 text-[10.5px] md:text-[11px] font-bold text-primary-700 dark:text-primary-300"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Full pricing breakdown ─── */}
        <section className="relative pt-8 md:pt-12 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              FULL PRICING · ค่าใช้จ่ายทุกหัว
            </div>
            <h2 className="text-[22px] md:text-[30px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ค่าใช้จ่ายเต็ม · <span className="text-primary-600">{port.name}</span>
            </h2>
            <p className="mt-2 text-[12.5px] md:text-[14px] leading-[1.6] font-medium text-muted">
              ราคาเบื้องต้น — ทีม Pacred Shipping ออก Quote ตามสินค้าจริงก่อนยืนยันทุกครั้ง ไม่มีค่าใช้จ่ายแอบ
            </p>

            <div className="mt-6 md:mt-8 space-y-5 md:space-y-6">
              {port.pricingSections.map((sec) => (
                <div
                  key={sec.heading}
                  className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5"
                >
                  <div className="text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white mb-3 flex items-center gap-1.5">
                    <span aria-hidden className="text-[18px]">{sec.icon}</span>
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
                          {item.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Summary card */}
              <div className="rounded-2xl border border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800 p-5 md:p-6 flex items-center justify-between gap-4 flex-wrap">
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
                <Link
                  href="/register"
                  data-cta="quote-summary"
                  className="inline-flex items-center justify-center gap-2 h-12 px-5 md:px-6 rounded-xl bg-primary-600 text-white font-black text-[13.5px] md:text-[14.5px] hover:bg-primary-700 transition-colors shadow-[0_6px_18px_rgba(220,38,38,0.30)]"
                >
                  ขอใบเสนอราคา ฟรี
                  <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Template content (Air / Sea / Truck) ─── */}
        <section className="relative pt-8 md:pt-12 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <port.modeIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
              {port.modeBadge}
            </div>
            <h2 className="text-[22px] md:text-[30px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {template.title}
            </h2>
            <p className="mt-3 text-[13px] md:text-[15px] leading-[1.7] text-foreground/85 font-medium">
              {template.intro}
            </p>

            {/* Carriers / ด่านที่รองรับ */}
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
        </section>

        <ContactSales hideAssuranceStrip />

        {/* ─── Final CTA card ─── */}
        <section className="relative pt-8 md:pt-12 pb-12 md:pb-16">
          <div className="mx-auto w-full max-w-[820px] px-4 md:px-5">
            <div className="rounded-3xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-surface dark:border-primary-800 p-6 md:p-10 text-center">
              <h2 className="text-[22px] md:text-[30px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                พร้อมเคลียร์ที่ <span className="text-primary-600">{port.name}</span>?
              </h2>
              <p className="mt-2 text-[13px] md:text-[15px] text-muted font-medium max-w-[640px] mx-auto leading-[1.65]">
                ส่งสินค้า + เอกสารคร่าวๆ ให้ทีม Pacred — เราออกใบเสนอราคาครบทุกหัวให้ภายใน 5 นาที ราคาแจ้งก่อนเริ่มงาน
              </p>
              <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[480px] mx-auto">
                <Link
                  href="/register"
                  data-cta="quote-final"
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[15px] hover:bg-primary-700 transition-colors shadow-[0_6px_18px_rgba(220,38,38,0.30)]"
                >
                  ขอใบเสนอราคา ฟรี
                  <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
                </Link>
                <a
                  href={LINE_OA.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-cta="line-final"
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_4px_12px_rgba(6,199,85,0.30)]"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                  ทักไลน์ปรึกษาฟรี
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <ClearanceBanner />
      <Footer />
    </>
  );
}
