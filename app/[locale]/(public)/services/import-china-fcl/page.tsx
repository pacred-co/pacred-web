import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Container,
  Ship,
  ShieldCheck,
  Wallet,
  BadgePercent,
  Receipt,
  Calculator,
  Stamp,
  Warehouse,
  MessageCircle,
  Phone,
  Home,
  ChevronRight,
  ArrowRight,
  Anchor,
  Globe2,
  HandCoins,
  Award,
  PackageSearch,
  Sparkles,
  CheckCircle2,
  Truck,
  Tag,
  Zap,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { FaqAccordion } from "@/components/sections/faq-accordion";
import { Reviews } from "@/components/sections/reviews";
import { Footer } from "@/components/sections/footer";
import { TrustStatsStrip } from "@/components/sections/trust-stats-strip";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import {
  breadcrumbSchema,
  serviceSchema,
  faqPageSchema,
} from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import {
  TrackedExternalLink,
  TrackedPhoneLink,
} from "@/components/analytics/tracked-link";

export const dynamic = "force-dynamic";

const SURFACE = "fcl_landing";

const PATH = "/services/import-china-fcl";
const NS = "seo.services.importChinaFcl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS, ogKey: "import-china-fcl" });
}

const LINE_URL = "/line";

const SCOPE_KEYS = [
  "scope0",
  "scope1",
  "scope2",
  "scope3",
  "scope4",
  "scope5",
  "scope6",
  "scope7",
];

const SIZES = [
  {
    code: "20'",
    name: "20-foot Standard",
    cbm: "~28-33 CBM",
    payloadKey: "size0Payload",
    descKey: "size0Desc",
    useCaseKey: "size0UseCase",
    popular: false,
  },
  {
    code: "40'",
    name: "40-foot Standard",
    cbm: "~58-67 CBM",
    payloadKey: "size1Payload",
    descKey: "size1Desc",
    useCaseKey: "size1UseCase",
    popular: true,
  },
  {
    code: "40' HQ",
    name: "40-foot High Cube",
    cbm: "~76 CBM",
    payloadKey: "size2Payload",
    descKey: "size2Desc",
    useCaseKey: "size2UseCase",
    popular: false,
  },
];

const TERMS = [
  {
    code: "DDP",
    name: "Delivered Duty Paid",
    descKey: "termsDDPDesc",
    icon: Globe2,
    popular: true,
  },
  {
    code: "FOB",
    name: "Free On Board",
    descKey: "termsFOBDesc",
    icon: Anchor,
  },
  {
    code: "EXW",
    name: "Ex Works",
    descKey: "termsEXWDesc",
    icon: Warehouse,
  },
  {
    code: "CIF",
    name: "Cost · Insurance · Freight",
    descKey: "termsCIFDesc",
    icon: Ship,
  },
];

const ROUTES = [
  {
    originKey: "route0Origin",
    portKey: "route0Port",
    transitKey: "route0Transit",
    noteKey: "route0Note",
  },
  {
    originKey: "route1Origin",
    portKey: "route1Port",
    transitKey: "route1Transit",
    noteKey: "route1Note",
  },
  {
    originKey: "route2Origin",
    portKey: "route2Port",
    transitKey: "route2Transit",
    noteKey: "route2Note",
  },
  {
    originKey: "route3Origin",
    portKey: "route3Port",
    transitKey: "route3Transit",
    noteKey: "route3Note",
  },
  {
    originKey: "route4Origin",
    portKey: "route4Port",
    transitKey: "route4Transit",
    noteKey: "route4Note",
  },
];

const STEPS = [
  { num: "01", icon: MessageCircle, titleKey: "step0Title", descKey: "step0Desc" },
  { num: "02", icon: Calculator, titleKey: "step1Title", descKey: "step1Desc" },
  { num: "03", icon: PackageSearch, titleKey: "step2Title", descKey: "step2Desc" },
  { num: "04", icon: Ship, titleKey: "step3Title", descKey: "step3Desc" },
  { num: "05", icon: Stamp, titleKey: "step4Title", descKey: "step4Desc" },
];

const WHY = [
  { icon: Wallet, titleKey: "why0Title", descKey: "why0Desc" },
  { icon: ShieldCheck, titleKey: "why1Title", descKey: "why1Desc" },
  { icon: BadgePercent, titleKey: "why2Title", descKey: "why2Desc" },
  { icon: Receipt, titleKey: "why3Title", descKey: "why3Desc" },
  { icon: Container, titleKey: "why4Title", descKey: "why4Desc" },
  { icon: Award, titleKey: "why5Title", descKey: "why5Desc" },
];

// 5 reasons — featured "WHY FCL ต้อง Pacred" section per ปอน — punchy + numbered
const REASONS = [
  { num: "01", icon: Truck, titleKey: "reason0Title", descKey: "reason0Desc" },
  { num: "02", icon: Container, titleKey: "reason1Title", descKey: "reason1Desc" },
  { num: "03", icon: BadgePercent, titleKey: "reason2Title", descKey: "reason2Desc" },
  { num: "04", icon: ShieldCheck, titleKey: "reason3Title", descKey: "reason3Desc" },
  { num: "05", icon: Award, titleKey: "reason4Title", descKey: "reason4Desc" },
];

// Pricing — indicative table by container size + route (FCL spec request from ปอน)
const PRICING = [
  {
    tier: "20' Standard",
    routeKey: "pricing0Route",
    priceKey: "pricing0Price",
    inclusionKeys: ["pricingIncSeaFreight", "pricingIncPortHandling", "pricingIncDocFee"],
    noteKey: "pricing0Note",
    featured: false,
  },
  {
    tier: "40' Standard",
    routeKey: "pricing1Route",
    priceKey: "pricing1Price",
    inclusionKeys: ["pricingIncSeaFreight", "pricingIncPortHandling", "pricingIncDocFee", "pricingIncBookingPriority"],
    noteKey: "pricing1Note",
    featured: true,
  },
  {
    tier: "40' High Cube",
    routeKey: "pricing2Route",
    priceKey: "pricing2Price",
    inclusionKeys: ["pricingIncSeaFreight", "pricingIncPortHandling", "pricingIncDocFee", "pricingIncCubeSpace"],
    noteKey: "pricing2Note",
    featured: false,
  },
];

const FAQ_ITEMS_KEYS = [
  { qKey: "faq0Q", aKey: "faq0A" },
  { qKey: "faq1Q", aKey: "faq1A" },
  { qKey: "faq2Q", aKey: "faq2A" },
  { qKey: "faq3Q", aKey: "faq3A" },
  { qKey: "faq4Q", aKey: "faq4A" },
  { qKey: "faq5Q", aKey: "faq5A" },
  { qKey: "faq6Q", aKey: "faq6A" },
  { qKey: "faq7Q", aKey: "faq7A" },
];

export default async function ImportChinaFclPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const tp = await getTranslations({ locale, namespace: "svcImportChinaFcl" });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel = typedLocale === "th" ? "บริการ" : "Services";
  const here = typedLocale === "th" ? "นำเข้าจีน FCL" : "FCL Import";
  const FAQ_ITEMS = FAQ_ITEMS_KEYS.map((k) => ({
    q: tp(k.qKey as Parameters<typeof tp>[0]),
    a: tp(k.aKey as Parameters<typeof tp>[0]),
  }));
  const SCOPE = SCOPE_KEYS.map((k) => tp(k as Parameters<typeof tp>[0]));

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "นำเข้า FCL" : "FCL Import",
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: svcLabel, path: "/services" },
              { name: here, path: PATH },
            ],
            typedLocale,
          ),
          faqPageSchema(
            FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a })),
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <BookingCalculator landing="sea" />

        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-3 md:pt-4"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px]">
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
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li>
              <Link
                href="/services"
                className="text-muted hover:text-primary-600 transition-colors"
              >
                {svcLabel}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li>
              <Link
                href="/services/import-china"
                className="text-muted hover:text-primary-600 transition-colors"
              >
                {tp("breadcrumbImportChina")}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground truncate">
              {here}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="relative pt-3 md:pt-5 pb-2 md:pb-4">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Container className="w-3.5 h-3.5" strokeWidth={2.6} />
              FCL · FULL CONTAINER LOAD
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              {tp("heroH1Prefix")} <span className="text-primary-600">{tp("heroH1Highlight")}</span> 20{"'"} · 40{"'"} · 40HQ
              <span className="hidden md:inline"> {tp("heroH1DoorToDoor")}</span>
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              {tp("heroH2Main")} <span className="text-primary-600/80 font-bold">{tp("heroH2Highlight")}</span>
            </h2>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            {/* Primary CTA row — "ใช้บริการ" (register) + "ปรึกษาฟรี" (LINE) */}
            <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
              <Link
                href="/register"
                aria-label={tp("ctaRegisterAriaLabel")}
                data-cta="register_hero"
                className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[15px] hover:bg-primary-700 transition-colors shadow-[0_8px_22px_rgba(179,0,0,0.30)]"
              >
                {tp("ctaRegister")}
                <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
              </Link>
              <TrackedExternalLink
                href={LINE_URL}
                cta="line_cta"
                surface={SURFACE}
                ctaProps={{ position: "hero_primary" }}
                className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                {tp("ctaLine")}
              </TrackedExternalLink>
            </div>

            {/* Service scope checklist */}
            <div className="mt-5 md:mt-7 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <Container className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" strokeWidth={2.4} />
                <span>{tp("scopeCardTitle")}</span>
              </h3>
              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                {tp("scopeCardSubtitle")}
              </p>
              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[12.5px] md:text-[14px] leading-snug text-foreground/85">
                {SCOPE.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2
                      className="w-4 h-4 md:w-[18px] md:h-[18px] mt-0.5 shrink-0 text-primary-600"
                      strokeWidth={2.6}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TrackedPhoneLink
                  phone={CONTACT.phone}
                  cta="phone_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 font-black text-[14px] md:text-[15px] hover:bg-primary-100 hover:border-primary-300 transition-colors dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-200"
                >
                  <Phone className="w-4 h-4" strokeWidth={2.6} />
                  {tp("ctaPhone", { phone: CONTACT.phoneDisplay })}
                </TrackedPhoneLink>
                <TrackedExternalLink
                  href={LINE_OA.shortUrl}
                  cta="line_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                  {tp("ctaAddLine")}
                </TrackedExternalLink>
              </div>
            </div>
          </div>
        </section>

        <ContactSales hideAssuranceStrip />

        {/* ครบเครื่องเรื่องบริการ — 4 quick benefits */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Zap className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("benefitsEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("benefitsH2Prefix")} <span className="text-primary-600">{tp("benefitsH2Highlight")}</span> {tp("benefitsH2Suffix")}
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("benefitsSubtitle")}
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {[
                { icon: Container, title: tp("quickBenefit1Title"), desc: tp("quickBenefit1Desc") },
                { icon: Wallet, title: tp("quickBenefit2Title"), desc: tp("quickBenefit2Desc") },
                { icon: Truck, title: tp("quickBenefit3Title"), desc: tp("quickBenefit3Desc") },
                { icon: ShieldCheck, title: tp("quickBenefit4Title"), desc: tp("quickBenefit4Desc") },
              ].map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.title}
                    className="relative rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_14px_32px_rgba(179,0,0,0.10)] hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="inline-flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white mb-3 shadow-[0_6px_16px_rgba(179,0,0,0.30)]">
                      <Icon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.4} />
                    </div>
                    <div className="text-[14px] md:text-[16px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                      {c.title}
                    </div>
                    <p className="mt-1 text-[12px] md:text-[13px] leading-[1.5] text-muted font-medium">
                      {c.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Container sizes — featured */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Container className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("sizesEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("sizesH2Prefix")} <span className="text-primary-600">{tp("sizesH2Highlight")}</span> {tp("sizesH2Suffix")}
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              {SIZES.map((s) => (
                <div
                  key={s.code}
                  className={`relative rounded-2xl border p-5 hover:shadow-[0_14px_32px_rgba(179,0,0,0.12)] hover:-translate-y-1 transition-all duration-300 ${
                    s.popular
                      ? "border-primary-400 bg-primary-50/40 dark:bg-primary-900/15 dark:border-primary-700"
                      : "border-border bg-white dark:bg-surface hover:border-primary-300 dark:hover:border-primary-800"
                  }`}
                >
                  {s.popular && (
                    <span className="absolute -top-2.5 right-4 inline-flex items-center px-2.5 h-6 rounded-md bg-primary-600 text-white text-[10.5px] font-black tracking-wide shadow-[0_4px_10px_rgba(179,0,0,0.30)]">
                      {tp("badgePopular")}
                    </span>
                  )}
                  <div className="inline-flex items-center px-2.5 h-7 rounded-md bg-primary-50 border border-primary-200 text-primary-700 font-black text-[14px] dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-200">
                    {s.code}
                  </div>
                  <h3 className="mt-2 text-[16px] md:text-[18px] font-black text-[#111827] dark:text-white tracking-tight">
                    {s.name}
                  </h3>
                  <p className="mt-1 text-[12.5px] md:text-[13.5px] text-muted font-medium leading-snug">
                    {tp(s.descKey as Parameters<typeof tp>[0])}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-surface dark:bg-background border border-border p-2">
                      <div className="text-[11px] md:text-[10.5px] font-bold tracking-[0.10em] text-muted uppercase">
                        CBM
                      </div>
                      <div className="text-[13px] md:text-[14px] font-black text-foreground mt-0.5">
                        {s.cbm}
                      </div>
                    </div>
                    <div className="rounded-lg bg-surface dark:bg-background border border-border p-2">
                      <div className="text-[11px] md:text-[10.5px] font-bold tracking-[0.10em] text-muted uppercase">
                        Payload
                      </div>
                      <div className="text-[13px] md:text-[14px] font-black text-foreground mt-0.5">
                        {tp(s.payloadKey as Parameters<typeof tp>[0])}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-white dark:bg-background border border-primary-100 dark:border-primary-900/40 p-2.5">
                    <div className="text-[11px] font-bold tracking-[0.10em] text-primary-600 uppercase">
                      {tp("labelSuitableFor")}
                    </div>
                    <p className="text-[11.5px] md:text-[12.5px] font-medium text-foreground mt-0.5 leading-snug">
                      {tp(s.useCaseKey as Parameters<typeof tp>[0])}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing — 3 tier glossy cards */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("pricingEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("pricingH2Prefix")} <span className="text-primary-600">{tp("pricingH2Highlight")}</span> {tp("pricingH2Suffix")}
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("pricingSubtitle")}
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
              {PRICING.map((p) => (
                <div
                  key={p.tier}
                  className={`relative rounded-2xl md:rounded-3xl p-5 md:p-6 transition-all duration-300 ${
                    p.featured
                      ? "border-2 border-primary-500 bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-900/30 dark:via-surface dark:to-primary-900/15 shadow-[0_18px_44px_rgba(179,0,0,0.20)] md:-translate-y-2"
                      : "border border-border bg-white dark:bg-surface shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] hover:-translate-y-1"
                  }`}
                >
                  {p.featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 h-7 rounded-full bg-primary-600 text-white text-[11px] font-black tracking-wide shadow-[0_6px_14px_rgba(179,0,0,0.35)]">
                      <Award className="w-3.5 h-3.5" strokeWidth={2.8} />
                      {tp("badgePopular")}
                    </span>
                  )}
                  <div className="text-[13px] md:text-[14px] font-black text-primary-600 tracking-[0.05em] uppercase">
                    {p.tier}
                  </div>
                  <p className="mt-1 text-[12px] md:text-[13px] text-muted font-medium">
                    {tp(p.routeKey as Parameters<typeof tp>[0])}
                  </p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[32px] md:text-[42px] font-black text-[#111827] dark:text-white leading-none tracking-tight">
                      {tp(p.priceKey as Parameters<typeof tp>[0])}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] md:text-[12px] font-bold text-primary-600/80">
                    {tp(p.noteKey as Parameters<typeof tp>[0])}
                  </p>

                  <ul className="mt-5 space-y-2">
                    {p.inclusionKeys.map((incKey) => (
                      <li key={incKey} className="flex items-start gap-2 text-[12.5px] md:text-[13px] font-medium text-foreground/90">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                        <span>{tp(incKey as Parameters<typeof tp>[0])}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/register"
                    data-cta={`pricing-${p.tier.replace(/\s+/g, "-").toLowerCase()}`}
                    className={`mt-6 inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl font-black text-[13px] md:text-[14px] transition-colors ${
                      p.featured
                        ? "bg-primary-600 text-white hover:bg-primary-700 shadow-[0_6px_18px_rgba(179,0,0,0.30)]"
                        : "border border-primary-200 text-primary-700 hover:bg-primary-50 dark:border-primary-800 dark:text-primary-300"
                    }`}
                  >
                    {tp("ctaUseService")}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11.5px] md:text-[12.5px] text-muted text-center font-medium">
              {tp("pricingFootnote")}
            </p>
          </div>
        </section>

        {/* Routes table */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Ship className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("routesEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("routesH2Prefix")} <span className="text-primary-600">{tp("routesH2Highlight")}</span> {tp("routesH2Suffix")}
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("routesSubtitle")}
            </p>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface">
              <table className="w-full text-[12.5px] md:text-[14px]">
                <thead>
                  <tr className="bg-primary-50 dark:bg-primary-900/30 border-b border-border">
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3">{tp("routeColOrigin")}</th>
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3">{tp("routeColDest")}</th>
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3 hidden sm:table-cell">Transit</th>
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3 hidden md:table-cell">{tp("routeColNote")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ROUTES.map((r, i) => (
                    <tr key={r.originKey} className={i % 2 ? "bg-surface/40" : ""}>
                      <td className="font-bold text-[#111827] dark:text-white px-3 md:px-4 py-3 align-top">
                        {tp(r.originKey as Parameters<typeof tp>[0])}
                      </td>
                      <td className="font-medium text-primary-700 dark:text-primary-300 px-3 md:px-4 py-3 align-top">
                        {tp(r.portKey as Parameters<typeof tp>[0])}
                      </td>
                      <td className="font-medium text-foreground/80 px-3 md:px-4 py-3 align-top hidden sm:table-cell">
                        {tp(r.transitKey as Parameters<typeof tp>[0])}
                      </td>
                      <td className="font-medium text-muted px-3 md:px-4 py-3 align-top hidden md:table-cell">
                        {tp(r.noteKey as Parameters<typeof tp>[0])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Terms */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("termsEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("termsH2Prefix")} <span className="text-primary-600">{tp("termsH2Highlight")}</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {TERMS.map((term) => {
                const Icon = term.icon;
                return (
                  <div
                    key={term.code}
                    className={`flex items-start gap-3 rounded-xl border p-4 transition-all ${
                      term.popular
                        ? "border-primary-300 bg-primary-50/50 dark:bg-primary-900/15 dark:border-primary-800"
                        : "border-border bg-white dark:bg-surface"
                    }`}
                  >
                    <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600 shrink-0 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-5 h-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[15px] md:text-[16px] font-black text-[#111827] dark:text-white">
                          {term.code}
                        </span>
                        {term.popular && (
                          <span className="inline-flex items-center px-1.5 h-[18px] rounded-md bg-primary-600 text-white text-[9.5px] font-black tracking-wide">
                            {tp("badgePopular")}
                          </span>
                        )}
                        <span className="text-[11px] md:text-[12px] text-muted font-bold">
                          {term.name}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] md:text-[13px] text-muted font-medium leading-snug">
                        {tp(term.descKey as Parameters<typeof tp>[0])}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Process */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Calculator className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("stepsEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("stepsH2Prefix")} <span className="text-primary-600">{tp("stepsH2Highlight")}</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {STEPS.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.num}
                    className="relative rounded-2xl border border-border bg-white dark:bg-surface p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_12px_28px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="absolute -top-3 left-4 text-[40px] md:text-[44px] font-black leading-none text-primary-600/10 dark:text-primary-300/15 tracking-tighter">
                      {s.num}
                    </div>
                    <div className="relative inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary-50 text-primary-600 mb-2.5 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" strokeWidth={2.4} />
                    </div>
                    <div className="relative text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white tracking-tight">
                      {tp(s.titleKey as Parameters<typeof tp>[0])}
                    </div>
                    <p className="relative mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {tp(s.descKey as Parameters<typeof tp>[0])}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 5 REASONS — featured WHY section */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("reasonsEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("reasonsH2Prefix")} <span className="text-primary-600">Pacred Shipping</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {REASONS.map((r) => {
                const Icon = r.icon;
                return (
                  <div
                    key={r.num}
                    className="relative rounded-2xl border border-border bg-gradient-to-br from-white to-primary-50/30 dark:from-surface dark:to-primary-900/10 p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_14px_30px_rgba(179,0,0,0.12)] hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[28px] md:text-[34px] font-black text-primary-200/70 dark:text-primary-900/70 leading-none tracking-tight">
                        {r.num}
                      </span>
                      <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                        <Icon className="w-5 h-5" strokeWidth={2.4} />
                      </span>
                    </div>
                    <h3 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                      {tp(r.titleKey as Parameters<typeof tp>[0])}
                    </h3>
                    <p className="mt-1.5 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                      {tp(r.descKey as Parameters<typeof tp>[0])}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why (extra benefits grid) */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("whyEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("whyH2Prefix")} <span className="text-primary-600">FCL Specialist</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {WHY.map((w) => {
                const Icon = w.icon;
                return (
                  <div
                    key={w.titleKey}
                    className="rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_12px_28px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary-50 text-primary-600 mb-2.5 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" strokeWidth={2.4} />
                    </div>
                    <div className="text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                      {tp(w.titleKey as Parameters<typeof tp>[0])}
                    </div>
                    <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {tp(w.descKey as Parameters<typeof tp>[0])}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Cross-link to LCL */}
            <div className="mt-8 md:mt-10 rounded-2xl border border-primary-100 bg-primary-50/40 p-4 md:p-5 dark:bg-primary-900/15 dark:border-primary-800 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[12.5px] md:text-[13.5px] font-black text-[#111827] dark:text-white">
                  {tp("crossLinkTitle")}
                </div>
                <p className="text-[11.5px] md:text-[12.5px] text-muted font-medium mt-0.5">
                  {tp("crossLinkDesc")}
                </p>
              </div>
              <Link
                href="/services/import-china-lcl"
                data-cta="cross-lcl"
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white border border-primary-200 text-primary-700 font-black text-[12.5px] md:text-[13px] hover:bg-primary-50 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-300"
              >
                {tp("crossLinkCta")}
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
              </Link>
            </div>
          </div>
        </section>

        {/* Reviews — filtered to import */}
        <Reviews defaultFilter="import" />

        {/* FAQ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <HandCoins className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("faqEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("faqH2Prefix")} <span className="text-primary-600">{tp("faqH2Highlight")}</span>
            </h2>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "import-china-fcl",
                    label: tp("faqGroupLabel"),
                    items: FAQ_ITEMS,
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* Final CTA banner */}
        <section className="relative pt-8 md:pt-12 pb-12 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div
              className="relative overflow-hidden rounded-2xl md:rounded-3xl text-white shadow-[0_18px_44px_rgba(179,0,0,0.35)] p-6 md:p-10"
              style={{ background: "linear-gradient(135deg, #DC1F1F 0%, #B30000 45%, #7F0000 100%)" }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
                style={{ background: "radial-gradient(circle at 25% 50%, rgba(255,200,100,0.30) 0%, transparent 55%)" }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.10]"
                style={{
                  backgroundImage: "radial-gradient(circle, white 1px, transparent 1.4px)",
                  backgroundSize: "16px 16px",
                }}
              />

              <div className="relative">
                <p className="text-yellow-300 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase mb-2">
                  {tp("ctaBannerEyebrow")}
                </p>
                <h3 className="text-[24px] md:text-[40px] font-black leading-[1.1] tracking-tight drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]">
                  {tp("ctaBannerH3")}
                </h3>
                <p className="mt-2 md:mt-3 text-[14px] md:text-[16px] font-bold text-white/95 leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
                  {tp("ctaBannerSubtitle")}
                </p>

                <div className="mt-5 md:mt-6 flex flex-col sm:flex-row gap-3 max-w-[640px]">
                  <Link
                    href="/register"
                    aria-label={tp("ctaRegisterAriaLabel")}
                    data-cta="register_footer"
                    className="inline-flex items-center justify-center gap-2 h-12 md:h-14 px-6 rounded-xl bg-white text-primary-700 font-black text-[14px] md:text-[16px] hover:bg-yellow-50 transition-colors shadow-[0_8px_22px_rgba(0,0,0,0.25)]"
                  >
                    {tp("ctaRegister")}
                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.8} />
                  </Link>
                  <TrackedExternalLink
                    href={LINE_URL}
                    cta="line_cta"
                    surface={SURFACE}
                    ctaProps={{ position: "footer_cta" }}
                    className="inline-flex items-center justify-center gap-2 h-12 md:h-14 px-6 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[16px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
                  >
                    <MessageCircle className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.6} />
                    {tp("ctaLine")}
                  </TrackedExternalLink>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <ImportExportBanner />
      <Footer />
    </>
  );
}
