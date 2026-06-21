import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Ship,
  Container,
  Boxes,
  ShoppingBag,
  HandCoins,
  Stamp,
  FileCheck2,
  Globe2,
  Truck,
  Warehouse,
  RefreshCcw,
  HandshakeIcon,
  Headset,
  PawPrint,
  Tags,
  Receipt,
  MessageCircle,
  Phone,
  Home,
  ChevronRight,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { ContactSales } from "@/components/sections/contact-sales";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import {
  TrackedExternalLink,
  TrackedPhoneLink,
} from "@/components/analytics/tracked-link";

const PATH = "/services";
const NS = "seo.services.index";
const SURFACE = "services_index";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS, ogKey: "services" });
}

type ServiceCard = {
  icon: typeof Ship;
  title: string;
  sub: string;
  /** Only navigable "live" cards carry an href; "soon" cards are non-navigating. */
  href?: string;
  group: "cargo" | "freight" | "shopping" | "customs";
  status?: "live" | "soon";
};

function ServiceCard({ card, soonLabel }: { card: ServiceCard; soonLabel: string }) {
  const Icon = card.icon;
  const isLive = card.status === "live";
  const cardClass = [
    "group relative flex items-start gap-3 rounded-2xl border bg-white dark:bg-surface p-4 md:p-5 transition-all duration-300",
    isLive
      ? "border-border hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_14px_30px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 cursor-pointer"
      : "border-dashed border-border opacity-70 cursor-default",
  ].join(" ");

  const body = (
    <>
      <div className="inline-flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl bg-primary-50 text-primary-600 shrink-0 dark:bg-primary-900/30 dark:text-primary-300">
        <Icon className="w-5 h-5 md:w-5.5 md:h-5.5" strokeWidth={2.4} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h3 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
            {card.title}
          </h3>
          {!isLive && (
            <span className="inline-flex items-center px-1.5 h-[18px] rounded-md bg-amber-100 text-amber-800 text-[9.5px] font-black tracking-wide dark:bg-amber-900/40 dark:text-amber-200">
              {soonLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.5] text-muted font-medium">
          {card.sub}
        </p>
      </div>
      {isLive && (
        <ArrowRight
          className="w-4 h-4 text-muted shrink-0 mt-1 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all"
          strokeWidth={2.6}
        />
      )}
    </>
  );

  if (isLive && card.href) {
    return (
      <Link href={card.href} data-cta={`service-${card.href}`} className={cardClass}>
        {body}
      </Link>
    );
  }
  return (
    <div aria-disabled="true" className={cardClass}>
      {body}
    </div>
  );
}

export default async function ServicesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations("servicesIndex");

  const SERVICES: ServiceCard[] = [
    {
      icon: Container,
      title: t("svcFclTitle"),
      sub: t("svcFclSub"),
      href: "/services/import-china-fcl",
      group: "cargo",
      status: "live",
    },
    {
      icon: Boxes,
      title: t("svcLclTitle"),
      sub: t("svcLclSub"),
      href: "/services/import-china-lcl",
      group: "cargo",
      status: "live",
    },
    {
      icon: Truck,
      title: t("svcAllModeTitle"),
      sub: t("svcAllModeSub"),
      href: "/services/import-china",
      group: "cargo",
      status: "live",
    },
    {
      icon: ShoppingBag,
      title: t("svcShoppingTitle"),
      sub: t("svcShoppingSub"),
      href: "/services/china-shopping",
      group: "shopping",
      status: "live",
    },
    {
      icon: HandCoins,
      title: t("svcYuanTitle"),
      sub: t("svcYuanSub"),
      href: "/payment/alipay",
      group: "shopping",
      status: "live",
    },
    {
      icon: Stamp,
      title: t("svcCustomsTitle"),
      sub: t("svcCustomsSub"),
      href: "/customs-clearance-shipping-suvarnabhumi",
      group: "customs",
      status: "live",
    },
    {
      icon: Globe2,
      title: t("svcExportTitle"),
      sub: t("svcExportSub"),
      group: "freight",
      status: "soon",
    },
    {
      icon: FileCheck2,
      title: t("svcTaxInvoiceTitle"),
      sub: t("svcTaxInvoiceSub"),
      group: "freight",
      status: "soon",
    },
    {
      icon: HandshakeIcon,
      title: t("svcBrokerTitle"),
      sub: t("svcBrokerSub"),
      group: "freight",
      status: "soon",
    },
    {
      icon: RefreshCcw,
      title: t("svcTaxRefundTitle"),
      sub: t("svcTaxRefundSub"),
      group: "freight",
      status: "soon",
    },
    {
      icon: PawPrint,
      title: t("svcFumigationTitle"),
      sub: t("svcFumigationSub"),
      group: "freight",
      status: "soon",
    },
    {
      icon: Tags,
      title: t("svcConsignmentTitle"),
      sub: t("svcConsignmentSub"),
      group: "shopping",
      status: "soon",
    },
    {
      icon: Receipt,
      title: t("svcBillPaymentTitle"),
      sub: t("svcBillPaymentSub"),
      group: "shopping",
      status: "soon",
    },
    {
      icon: Warehouse,
      title: t("svcDomesticTitle"),
      sub: t("svcDomesticSub"),
      group: "cargo",
      status: "soon",
    },
  ];

  const GROUPS = [
    {
      id: "cargo",
      label: t("groupCargoLabel"),
      desc: t("groupCargoDesc"),
      accent: "from-primary-500 to-primary-700",
    },
    {
      id: "customs",
      label: t("groupCustomsLabel"),
      desc: t("groupCustomsDesc"),
      accent: "from-rose-500 to-rose-700",
    },
    {
      id: "shopping",
      label: t("groupShoppingLabel"),
      desc: t("groupShoppingDesc"),
      accent: "from-amber-500 to-orange-600",
    },
    {
      id: "freight",
      label: t("groupFreightLabel"),
      desc: t("groupFreightDesc"),
      accent: "from-blue-500 to-indigo-700",
    },
  ] as const;

  const homeLabel = t("breadcrumbHome");
  const here = t("breadcrumbServices");

  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: homeLabel, path: "/" },
            { name: here, path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <SearchBar />
      <main>
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
            <li aria-current="page" className="font-bold text-foreground">
              {here}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="relative pt-3 md:pt-5 pb-2 md:pb-4">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              {t("heroEyebrow")}
            </div>
            <h1 className="text-[24px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">{t("heroTitleHighlight")}</span>{t("heroTitleRest")}
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              {t("heroSubtitleMain")}<span className="text-primary-600/80 font-bold">{t("heroSubtitleHighlight")}</span>
            </h2>

            {/* Rotating v3 service banner — replaced the dark-red "ปรึกษาฟรี"
                CTA card with banner set3 (ปอน 2026-06-21 · same as site-wide). */}
            <div className="mt-4 md:mt-6">
              <ImportExportBanner />
            </div>

            {/* Phone + LINE row */}
            <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
              <TrackedPhoneLink
                phone={CONTACT.phone}
                cta="phone_cta"
                surface={SURFACE}
                ctaProps={{ position: "hero" }}
                className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 font-black text-[14px] md:text-[15px] hover:bg-primary-100 hover:border-primary-300 transition-colors dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-200"
              >
                <Phone className="w-4 h-4" strokeWidth={2.6} />
                {t("phoneBtn", { phone: CONTACT.phoneDisplay })}
              </TrackedPhoneLink>
              <TrackedExternalLink
                href={LINE_OA.shortUrl}
                cta="line_cta"
                surface={SURFACE}
                ctaProps={{ position: "hero" }}
                className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                {t("lineBtn")}
              </TrackedExternalLink>
            </div>
          </div>
        </section>

        <ContactSales hideAssuranceStrip />

        {/* Service grid grouped */}
        {GROUPS.map((group) => {
          const cards = SERVICES.filter((s) => s.group === group.id);
          if (cards.length === 0) return null;
          return (
            <section
              key={group.id}
              className="relative pt-12 md:pt-20 pb-6 md:pb-8"
            >
              <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
                <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
                  <span className={`inline-block w-2 h-2 rounded-full bg-gradient-to-br ${group.accent}`} />
                  {group.label}
                </div>
                <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
                  {group.label}
                </h2>
                <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
                  {group.desc}
                </p>

                <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {cards.map((card) => (
                    <ServiceCard key={card.title} card={card} soonLabel={t("soonBadge")} />
                  ))}
                </div>
              </div>
            </section>
          );
        })}

        {/* Help-choose CTA */}
        <section className="relative pt-12 md:pt-20 pb-12 md:pb-16">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-surface dark:border-primary-800 p-6 md:p-10 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-primary-600 text-white shadow-[0_10px_24px_rgba(179,0,0,0.30)] mb-4">
                <Headset className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2.4} />
              </div>
              <h2 className="text-[22px] md:text-[30px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                {t("helpChooseTitlePre")}<span className="text-primary-600">{t("helpChooseTitleHighlight")}</span>{t("helpChooseTitlePost")}
              </h2>
              <p className="mt-2 text-[13px] md:text-[15px] text-muted font-medium max-w-[640px] mx-auto leading-[1.65]">
                {t("helpChooseDesc")}
              </p>
              <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[480px] mx-auto">
                <TrackedExternalLink
                  href={LINE_OA.shortUrl}
                  cta="line_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "help_choose" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                  {t("lineBtn")}
                </TrackedExternalLink>
                <TrackedPhoneLink
                  phone={CONTACT.phone}
                  cta="phone_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "help_choose" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-primary-200 bg-white text-primary-700 font-black text-[14px] md:text-[15px] hover:bg-primary-50 hover:border-primary-300 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-200"
                >
                  <Phone className="w-4 h-4" strokeWidth={2.6} />
                  {t("phoneBtn", { phone: CONTACT.phoneDisplay })}
                </TrackedPhoneLink>
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
