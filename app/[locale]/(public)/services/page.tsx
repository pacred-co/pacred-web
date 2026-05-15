import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Ship,
  Container,
  Boxes,
  Plane,
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
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

const LINE_URL = "/line";

type ServiceCard = {
  icon: typeof Ship;
  title: string;
  sub: string;
  href: string;
  group: "cargo" | "freight" | "shopping" | "customs";
  status?: "live" | "soon";
};

const SERVICES: ServiceCard[] = [
  {
    icon: Container,
    title: "นำเข้าจีน — FCL เหมาตู้",
    sub: "20' · 40' · 40HQ · ครบทุก Term",
    href: "/services/import-china-fcl",
    group: "cargo",
    status: "live",
  },
  {
    icon: Boxes,
    title: "นำเข้าจีน — LCL รวมตู้",
    sub: "เริ่มไม่กี่กล่อง · จ่ายตาม CBM/KG",
    href: "/services/import-china-lcl",
    group: "cargo",
    status: "live",
  },
  {
    icon: Truck,
    title: "นำเข้าจีน — ครบทุกช่องทาง",
    sub: "Cargo รถ/เรือ/แอร์ · Door-to-Door",
    href: "/services/import-china",
    group: "cargo",
    status: "live",
  },
  {
    icon: ShoppingBag,
    title: "ฝากสั่งซื้อสินค้าจีน",
    sub: "1688 · Taobao · Tmall · Alibaba",
    href: "/services/china-shopping",
    group: "shopping",
    status: "live",
  },
  {
    icon: HandCoins,
    title: "ฝากโอนหยวน · Alipay",
    sub: "เรทดี · ไม่ต้องเปิดบัญชีจีน",
    href: "/payment/alipay",
    group: "shopping",
    status: "live",
  },
  {
    icon: Stamp,
    title: "เคลียร์ศุลกากร · สินค้าติดด่าน",
    sub: "สุวรรณภูมิ · คลองเตย · แหลมฉบัง",
    href: "/customs-clearance-shipping-suvarnabhumi",
    group: "customs",
    status: "live",
  },
  {
    icon: Globe2,
    title: "ส่งออกสินค้าทั่วโลก",
    sub: "Air · Sea · Express · ทุก Incoterm",
    href: "/services/export-worldwide",
    group: "freight",
    status: "live",
  },
  {
    icon: FileCheck2,
    title: "ออกใบกำกับภาษี",
    sub: "ภพ.20 · เอกสารครบนิติบุคคล",
    href: "/services",
    group: "freight",
    status: "soon",
  },
  {
    icon: HandshakeIcon,
    title: "จับคู่ตัวแทนออกของ (YY)",
    sub: "ลงทะเบียนกรมศุล · 30 นาที",
    href: "/services",
    group: "freight",
    status: "soon",
  },
  {
    icon: RefreshCcw,
    title: "ขอคืนภาษี (Tax Refund)",
    sub: "เพิ่มกำไรสินค้าที่มีสิทธิ์",
    href: "/services",
    group: "freight",
    status: "soon",
  },
  {
    icon: PawPrint,
    title: "บริการฟูมิเกชัน",
    sub: "Fumigation Certificate · ISPM-15",
    href: "/services",
    group: "freight",
    status: "soon",
  },
  {
    icon: Warehouse,
    title: "ขนส่งภายในประเทศ + แมสเซ็นเจอร์",
    sub: "Door-to-Door · ทั่วประเทศ",
    href: "/services",
    group: "cargo",
    status: "soon",
  },
];

const GROUPS = [
  {
    id: "cargo",
    label: "Cargo จีน-ไทย",
    desc: "นำเข้าสินค้าจากจีน · 1688 · Taobao · เคลียร์ภาษีครบ · ทุกช่องทาง",
    accent: "from-primary-500 to-primary-700",
  },
  {
    id: "customs",
    label: "เคลียร์ศุลกากร",
    desc: "สินค้าติดด่าน · เคลียร์ Air/Sea/Truck · ทุกท่าทุกด่าน",
    accent: "from-rose-500 to-rose-700",
  },
  {
    id: "shopping",
    label: "ฝากซื้อ · ฝากโอน",
    desc: "ทีมล่ามจีนปิดดีลให้ · ฝากโอนหยวนเรทดี",
    accent: "from-amber-500 to-orange-600",
  },
  {
    id: "freight",
    label: "Freight · ส่งออก",
    desc: "ส่งออกทั่วโลก · ใบกำกับภาษี · ฟูมิเกชัน · ใบขนสินค้า",
    accent: "from-blue-500 to-indigo-700",
  },
] as const;

export default async function ServicesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const here = typedLocale === "th" ? "บริการ" : "Services";

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
              OUR SERVICES · บริการของเรา
            </div>
            <h1 className="text-[24px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">ครบทุกบริการ</span> นำเข้า · ส่งออก · ชิปปิ้ง · เคลียร์ศุลกากร
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              Pacred Shipping ดูแลครบในที่เดียว — Cargo · Freight · เคลียร์พิธีการ · ฝากซื้อ-ฝากโอน · ใบกำกับภาษี · ฟูมิเกชัน — <span className="text-primary-600/80 font-bold">ครบวงจรในผู้ให้บริการเดียว</span>
            </h2>

            {/* LINE attention banner */}
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_cta"
              surface={SURFACE}
              ctaProps={{ position: "hero_banner" }}
              aria-label="ทักไลน์ Pacred — ปรึกษาบริการฟรี"
              className="group block mt-4 md:mt-6 relative pt-3 md:pt-4 pr-4 md:pr-8 max-w-[1100px] no-underline"
            >
              <span className="absolute top-0 left-3 md:left-5 z-20 inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-white text-[11.5px] md:text-[13px] font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.45)] tracking-tight transition-transform duration-300 group-hover:-translate-y-0.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                </span>
                ไม่แน่ใจเลือกบริการไหน?
              </span>
              <div
                className="relative rounded-2xl text-white shadow-[0_12px_32px_rgba(120,0,0,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(160,0,0,0.5)] group-hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #5b0c0c 0%, #7a0a0a 45%, #3b0707 100%)" }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-50 mix-blend-overlay"
                  style={{ background: "radial-gradient(circle at 75% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
                />
                <div className="relative grid grid-cols-[auto_1fr] items-center gap-2 md:gap-5 pl-3 md:pl-6 pr-3 md:pr-6 pt-7 md:pt-7 pb-4 md:pb-5">
                  <div className="leading-none shrink-0">
                    <p className="text-[16px] md:text-[32px] font-black tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]">
                      <span className="text-yellow-300">P</span>
                      <span className="text-white">acred</span>
                    </p>
                    <p className="mt-0.5 text-[7.5px] md:text-[12px] font-bold tracking-[0.30em]">
                      <span className="text-yellow-300">S</span>
                      <span className="text-white">HIPPING</span>
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] md:text-[28px] font-bold text-white leading-snug">
                      ปรึกษาฟรี · แจ้งความต้องการ · ทีมเลือกบริการให้
                    </p>
                    <p className="hidden md:block mt-1.5 text-[13px] text-white/75 leading-snug">
                      ทุกบริการในผู้ให้บริการเดียว · ทีมประจำคุณตั้งแต่ต้นจนจบ
                    </p>
                    <p className="mt-1.5 md:mt-2 inline-flex items-center gap-1 text-[10px] md:text-[12px] font-bold tracking-wide">
                      <MessageCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300" strokeWidth={2.6} />
                      <span className="text-yellow-300">ทักไลน์</span>
                      <span className="text-white/85">ตอบไว 5 นาที</span>
                      <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300 transition-transform group-hover:translate-x-1" strokeWidth={2.6} />
                    </p>
                  </div>
                </div>
              </div>
            </TrackedExternalLink>

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
                โทร {CONTACT.phoneDisplay}
              </TrackedPhoneLink>
              <TrackedExternalLink
                href={LINE_OA.shortUrl}
                cta="line_cta"
                surface={SURFACE}
                ctaProps={{ position: "hero" }}
                className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                แอด LINE Pacred
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
                  {cards.map((card) => {
                    const Icon = card.icon;
                    const isLive = card.status === "live";
                    const cardClass = [
                      "group relative flex items-start gap-3 rounded-2xl border bg-white dark:bg-surface p-4 md:p-5 transition-all duration-300",
                      isLive
                        ? "border-border hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_14px_30px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 cursor-pointer"
                        : "border-dashed border-border opacity-70 cursor-default",
                    ].join(" ");
                    const inner = (
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
                                เร็วๆ นี้
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
                    return isLive ? (
                      <Link
                        key={card.title}
                        href={card.href}
                        data-cta={`service-${card.href}`}
                        className={cardClass}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div
                        key={card.title}
                        aria-disabled="true"
                        className={cardClass}
                      >
                        {inner}
                      </div>
                    );
                  })}
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
                ไม่แน่ใจเลือก<span className="text-primary-600">บริการไหน</span>?
              </h2>
              <p className="mt-2 text-[13px] md:text-[15px] text-muted font-medium max-w-[640px] mx-auto leading-[1.65]">
                ทักไลน์/โทรหาทีม — เล่าความต้องการให้ฟัง ทีม Pacred แนะนำบริการ + Quote + เส้นทางที่เหมาะกับธุรกิจคุณภายใน 5 นาที
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
                  แอด LINE Pacred
                </TrackedExternalLink>
                <TrackedPhoneLink
                  phone={CONTACT.phone}
                  cta="phone_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "help_choose" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-primary-200 bg-white text-primary-700 font-black text-[14px] md:text-[15px] hover:bg-primary-50 hover:border-primary-300 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-200"
                >
                  <Phone className="w-4 h-4" strokeWidth={2.6} />
                  โทร {CONTACT.phoneDisplay}
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
