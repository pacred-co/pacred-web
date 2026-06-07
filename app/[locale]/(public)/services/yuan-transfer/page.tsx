import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  HandCoins,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  MessageCircle,
  Phone,
  Home,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Award,
  Users,
  Globe2,
  ScanLine,
  CircleDollarSign,
  Banknote,
  Timer,
  TrendingUp,
  CreditCard,
  Building2,
  Send,
  ReceiptText,
  FileCheck2,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { Reviews } from "@/components/sections/reviews";
import { PurchaseBanner } from "@/components/sections/purchase-banner";
import { FaqAccordion } from "@/components/sections/faq-accordion";
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

const SURFACE = "yuan_transfer_landing";
const PATH = "/services/yuan-transfer";
const NS = "seo.services.yuanTransfer";
const LINE_URL = "/line";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

type Channel = {
  id: "alipay" | "wechat" | "bank" | "card";
  icon: typeof CreditCard;
  badge: string;
  title: string;
  desc: string;
  for: string;
  accent: string;
};

const CHANNEL_BASES = [
  { id: "alipay" as const, icon: CreditCard, badge: "ALIPAY · 支付宝", accent: "from-blue-500 to-blue-700" },
  { id: "wechat" as const, icon: MessageCircle, badge: "WECHAT PAY · 微信支付", accent: "from-emerald-500 to-green-700" },
  { id: "bank" as const, icon: Building2, badge: "CHINA BANK · 中国银行", accent: "from-red-500 to-rose-700" },
  { id: "card" as const, icon: Banknote, badge: "UNIONPAY · 银联", accent: "from-orange-500 to-amber-700" },
];

const SERVICE_SCOPE_KEYS = [
  "scopeAlipay",
  "scopeWechat",
  "scopeBank",
  "scopePlatforms",
  "scopeRate",
  "scopeSpeed",
  "scopeNoAccount",
  "scopeReceipt",
] as const;

const USE_CASE_BASES = [
  { icon: HandCoins, titleKey: "ucGoodsTitle", descKey: "ucGoodsDesc" },
  { icon: ReceiptText, titleKey: "ucDepositTitle", descKey: "ucDepositDesc" },
  { icon: Building2, titleKey: "ucFactoryTitle", descKey: "ucFactoryDesc" },
  { icon: TrendingUp, titleKey: "ucInvestTitle", descKey: "ucInvestDesc" },
  { icon: Send, titleKey: "ucFamilyTitle", descKey: "ucFamilyDesc" },
  { icon: CreditCard, titleKey: "ucUnionPayTitle", descKey: "ucUnionPayDesc" },
] as const;

const HOW_BASES = [
  { num: "01", icon: MessageCircle, titleKey: "howStep1Title", descKey: "howStep1Desc" },
  { num: "02", icon: TrendingUp, titleKey: "howStep2Title", descKey: "howStep2Desc" },
  { num: "03", icon: Wallet, titleKey: "howStep3Title", descKey: "howStep3Desc" },
  { num: "04", icon: Send, titleKey: "howStep4Title", descKey: "howStep4Desc" },
  { num: "05", icon: FileCheck2, titleKey: "howStep5Title", descKey: "howStep5Desc" },
] as const;

const WHY_BASES = [
  { icon: Timer, titleKey: "whyFastTitle", descKey: "whyFastDesc" },
  { icon: TrendingUp, titleKey: "whyRateTitle", descKey: "whyRateDesc" },
  { icon: ShieldCheck, titleKey: "whySafeTitle", descKey: "whySafeDesc" },
  { icon: Wallet, titleKey: "whyMinTitle", descKey: "whyMinDesc" },
  { icon: Globe2, titleKey: "whyChannelTitle", descKey: "whyChannelDesc" },
  { icon: ReceiptText, titleKey: "whyTaxTitle", descKey: "whyTaxDesc" },
  { icon: Users, titleKey: "whyTeamTitle", descKey: "whyTeamDesc" },
  { icon: Award, titleKey: "whyExpTitle", descKey: "whyExpDesc" },
] as const;

const FAQ_ITEM_KEYS = [
  { qKey: "faqQ1", aKey: "faqA1" },
  { qKey: "faqQ2", aKey: "faqA2" },
  { qKey: "faqQ3", aKey: "faqA3" },
  { qKey: "faqQ4", aKey: "faqA4" },
  { qKey: "faqQ5", aKey: "faqA5" },
  { qKey: "faqQ6", aKey: "faqA6" },
  { qKey: "faqQ7", aKey: "faqA7" },
  { qKey: "faqQ8", aKey: "faqA8" },
] as const;

export default async function YuanTransferPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const tp = await getTranslations({ locale, namespace: "svcYuanTransfer" });
  const homeLabel = tp("breadcrumbHome");
  const svcLabel = tp("breadcrumbServices");
  const here = tp("breadcrumbHere");

  const CHANNELS: Channel[] = CHANNEL_BASES.map((c) => ({
    ...c,
    title: tp(`channel_${c.id}_title`),
    desc: tp(`channel_${c.id}_desc`),
    for: tp(`channel_${c.id}_for`),
  }));

  const SERVICE_SCOPE = SERVICE_SCOPE_KEYS.map((key) => tp(key));

  const USE_CASES = USE_CASE_BASES.map((u) => ({
    icon: u.icon,
    title: tp(u.titleKey),
    desc: tp(u.descKey),
  }));

  const HOW = HOW_BASES.map((s) => ({
    num: s.num,
    icon: s.icon,
    title: tp(s.titleKey),
    desc: tp(s.descKey),
  }));

  const WHY = WHY_BASES.map((w) => ({
    icon: w.icon,
    title: tp(w.titleKey),
    desc: tp(w.descKey),
  }));

  const FAQ_ITEMS = FAQ_ITEM_KEYS.map((fk) => ({
    q: tp(fk.qKey),
    a: tp(fk.aKey),
  }));

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: here,
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
      <SearchBar hideOnMobile defaultCollapsed />
      <main>
        <BookingCalculator landing="remit" />

        {/* ─── Breadcrumb ─── */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-3 md:pt-4"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px] whitespace-nowrap">
            <li>
              <Link href="/" className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors">
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>{homeLabel}</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li>
              <Link href="/services" className="text-muted hover:text-primary-600 transition-colors">
                {svcLabel}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground">
              {here}
            </li>
          </ol>
        </nav>

        {/* ═══════ 1. Hero ═══════ */}
        <section className="relative pt-1 md:pt-2 pb-1 md:pb-2">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <HandCoins className="w-3.5 h-3.5" strokeWidth={2.6} />
              YUAN TRANSFER · {tp("heroBadge")}
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">{tp("heroH1Highlight")}</span> {tp("heroH1Main")}
              <span className="md:block md:mt-1"> {tp("heroH1Sub")}</span>
            </h1>
            <p className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              {tp("heroDesc")} <span className="text-primary-600/80 font-bold">{tp("heroDescHighlight")}</span>
            </p>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            {/* 2 primary CTAs */}
            <div className="mt-4 md:mt-5 grid grid-cols-2 gap-2 md:gap-3 max-w-[560px]">
              <Link
                href="/register"
                aria-label={tp("ctaRegisterAriaLabel")}
                className="inline-flex items-center justify-center gap-2 h-12 md:h-14 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[16px] hover:bg-primary-700 hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(179,0,0,0.30)]"
              >
                {tp("ctaRegister")}
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.8} />
              </Link>
              <TrackedExternalLink
                href={LINE_URL}
                cta="line_consult"
                surface={SURFACE}
                ctaProps={{ position: "hero_cta" }}
                aria-label={tp("ctaLineAriaLabel")}
                className="inline-flex items-center justify-center gap-2 h-12 md:h-14 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[16px] hover:bg-[#05B04C] hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(6,199,85,0.35)]"
              >
                <MessageCircle className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.6} />
                {tp("ctaLine")}
              </TrackedExternalLink>
            </div>

            {/* Service scope highlights — themed card */}
            <div className="mt-5 md:mt-7 rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-800/60 bg-gradient-to-br from-primary-50/60 via-white to-primary-50/30 dark:from-primary-900/15 dark:via-surface dark:to-primary-900/10 p-4 md:p-6 shadow-[0_8px_22px_rgba(179,0,0,0.06)]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <HandCoins className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" strokeWidth={2.6} />
                <span>{tp("heroCardTitle")}</span>
              </h3>
              <p className="mt-2 text-[12.5px] md:text-[14px] font-bold text-foreground/85 leading-relaxed">
                Alipay · WeChat Pay · ICBC · CCB · BOC · ABC · CMB · UnionPay
              </p>
              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[13px] md:text-[15px] leading-snug text-foreground/95">
                {SERVICE_SCOPE.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 md:w-[18px] md:h-[18px] mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
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

        {/* ═══════ 2. Channels — 4 transfer types ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
              4 CHANNELS · {tp("channelsBadge")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("channelsH2")} <span className="text-primary-600">Alipay · WeChat · Bank · Card</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("channelsDesc")}
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.id}
                    className="group relative rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_40px_rgba(179,0,0,0.12)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
                  >
                    <div className={`relative h-20 bg-gradient-to-br ${c.accent} flex items-center justify-center gap-2 px-3`}>
                      <Icon className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]" strokeWidth={2.2} />
                      <span className="text-[13px] md:text-[15px] font-black text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] text-center leading-tight">
                        {c.badge}
                      </span>
                      <span
                        aria-hidden
                        className="absolute inset-0 opacity-[0.10]"
                        style={{
                          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                          backgroundSize: "14px 14px",
                        }}
                      />
                    </div>
                    <div className="p-4 md:p-5 space-y-2.5">
                      <h3 className="text-[15px] md:text-[16px] font-black text-[#111827] dark:text-white tracking-tight">
                        {c.title}
                      </h3>
                      <p className="text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                        {c.desc}
                      </p>
                      <div className="pt-1 border-t border-border">
                        <div className="text-[9.5px] md:text-[10px] font-bold text-muted tracking-[0.10em] uppercase mb-1">
                          {tp("suitableFor")}
                        </div>
                        <p className="text-[12px] md:text-[12.5px] font-bold text-foreground/85 leading-snug">
                          {c.for}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Sales contact ─── */}
        <ContactSales hideAssuranceStrip compact />

        {/* ═══════ 3. Use cases ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              USE CASES · {tp("useCasesBadge")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("useCasesH2")} — <span className="text-primary-600">{tp("useCasesH2Highlight")}</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {USE_CASES.map((u) => {
                const Icon = u.icon;
                return (
                  <div
                    key={u.title}
                    className="rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_12px_28px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary-50 text-primary-600 mb-2.5 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" strokeWidth={2.4} />
                    </div>
                    <div className="text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                      {u.title}
                    </div>
                    <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {u.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 4. How it works — 5 steps ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ScanLine className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · {tp("howBadge")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("howH2")} — <span className="text-primary-600">{tp("howH2Highlight")}</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("howDesc")}
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {HOW.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.num}
                    className="relative rounded-2xl border border-border bg-gradient-to-br from-white to-primary-50/40 dark:from-surface dark:to-primary-900/10 p-4 md:p-5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(179,0,0,0.12)] transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[34px] md:text-[40px] font-black text-primary-200/70 dark:text-primary-900/70 leading-none tracking-tight">
                        {s.num}
                      </span>
                      <span className="inline-flex w-10 h-10 md:w-11 md:h-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                        <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" strokeWidth={2.4} />
                      </span>
                    </div>
                    <h3 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                      {s.title}
                    </h3>
                    <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                      {s.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Reviews — default to import filter (Yuan transfer falls under import flow) ─── */}
        <Reviews defaultFilter="import" />

        {/* ═══════ 5. Why Pacred ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY PACRED · {tp("whyBadge")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("whyH2")} <span className="text-primary-600">Pacred Yuan Transfer</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {WHY.map((w) => {
                const Icon = w.icon;
                return (
                  <div
                    key={w.title}
                    className="rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_12px_28px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary-50 text-primary-600 mb-2.5 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" strokeWidth={2.4} />
                    </div>
                    <div className="text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                      {w.title}
                    </div>
                    <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {w.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 6. FAQ ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-6 md:pb-10">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <CircleDollarSign className="w-3.5 h-3.5" strokeWidth={2.6} />
              FAQ · {tp("faqBadge")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("faqH2")} <span className="text-primary-600">{tp("faqH2Highlight")}</span>
            </h2>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "yuan-transfer",
                    label: tp("faqGroupLabel"),
                    items: FAQ_ITEMS,
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* ═══════ 7. Final CTA banner ═══════ */}
        <section className="relative pt-4 md:pt-8 pb-8 md:pb-12">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface={SURFACE}
              ctaProps={{ position: "final_cta" }}
              aria-label={tp("finalCtaAriaLabel")}
              className="group block relative max-w-[1100px] mx-auto no-underline"
            >
              <div
                className="relative overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(179,0,0,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(179,0,0,0.5)] group-hover:-translate-y-0.5"
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

                <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-3 md:gap-6 px-5 md:px-10 py-6 md:py-8">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 mb-2 text-yellow-300 text-[10.5px] md:text-[12px] font-black tracking-[0.10em] uppercase">
                      <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
                      TRANSFER GUARANTEE
                    </div>
                    <p className="text-[24px] md:text-[40px] font-black text-white leading-[1.05] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.45)]">
                      {tp("finalCtaHeadline")} <span className="text-yellow-300">{tp("finalCtaHighlight")}</span> {tp("finalCtaFree")}
                    </p>
                    <p className="hidden md:block mt-2 text-[14px] font-semibold text-white/90 leading-snug">
                      {tp("finalCtaSubline")}
                    </p>
                  </div>
                  <span className="inline-flex items-center justify-center gap-2 px-5 md:px-7 py-3 md:py-4 rounded-xl bg-white text-primary-700 font-black text-[15px] md:text-[18px] shadow-[0_8px_20px_rgba(0,0,0,0.25)] group-hover:scale-105 transition-transform whitespace-nowrap">
                    <MessageCircle className="w-5 h-5" strokeWidth={2.6} />
                    {tp("finalCtaButton")}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" strokeWidth={2.6} />
                  </span>
                </div>
              </div>
            </TrackedExternalLink>
          </div>
        </section>
      </main>
      <PurchaseBanner />
      <Footer />
    </>
  );
}
