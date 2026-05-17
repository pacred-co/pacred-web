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
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
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

const SURFACE = "fcl_landing";

const PATH = "/services/import-china-fcl";
const NS = "seo.services.importChinaFcl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

const LINE_URL = "/line";

const SIZES = [
  {
    code: "20'",
    name: "20-foot Standard",
    cbm: "~28-33 CBM",
    payload: "~28 ตัน",
    desc: "เหมาะกับสินค้าหนัก/ปริมาณกลาง · ยาว 5.9m × กว้าง 2.35m × สูง 2.39m",
  },
  {
    code: "40'",
    name: "40-foot Standard",
    cbm: "~58-67 CBM",
    payload: "~28-30 ตัน",
    desc: "เหมาะกับสินค้าปริมาณเยอะแต่น้ำหนักไม่หนัก · 12m × 2.35m × 2.39m",
  },
  {
    code: "40' HQ",
    name: "40-foot High Cube",
    cbm: "~76 CBM",
    payload: "~28-30 ตัน",
    desc: "ตู้สูงพิเศษ ใช้กับของบาง/ไม่หนัก/ตู้ furniture · 12m × 2.35m × 2.70m",
  },
];

const TERMS = [
  {
    code: "DDP",
    name: "Delivered Duty Paid",
    desc: "ลูกค้าได้ของถึงประตู — Pacred จัดการขนส่ง · ภาษี · เคลียร์ ครบ ลูกค้ารับของอย่างเดียว",
    icon: Globe2,
    popular: true,
  },
  {
    code: "FOB",
    name: "Free On Board",
    desc: "ผู้ขายส่งของถึง Port ต้นทาง · ลูกค้าจ่ายค่าขนส่ง+ภาษี+เคลียร์ปลายทาง — Pacred ดูแลส่วนนี้ครบ",
    icon: Anchor,
  },
  {
    code: "EXW",
    name: "Ex Works",
    desc: "ลูกค้ารับของหน้าโรงงาน · Pacred ส่งรถไปรับ + ลำเลียงตู้ + ขนส่ง + เคลียร์ ครบ",
    icon: Warehouse,
  },
  {
    code: "CIF",
    name: "Cost · Insurance · Freight",
    desc: "ผู้ขายจ่ายขนส่ง+ประกันถึง Port ไทย · Pacred ดูแลเคลียร์ภาษี + ส่งต่อในประเทศ",
    icon: Ship,
  },
];

const STEPS = [
  { num: "01", icon: MessageCircle, title: "ส่งสเปก + ปริมาณ", desc: "แจ้งประเภทสินค้า · ปริมาณ · ปลายทาง — ทีมประเมินขนส่งให้" },
  { num: "02", icon: Calculator, title: "Quote Total Landed Cost", desc: "ค่าขนส่ง + ภาษี + เคลียร์ + ส่งใน TH — ครบในใบเดียว" },
  { num: "03", icon: PackageSearch, title: "Pickup จากโรงงาน", desc: "Pacred รับของจากโรงงาน · ตรวจ · ลำเลียงตู้" },
  { num: "04", icon: Ship, title: "ขนส่งทางเรือ", desc: "Booking สายเรือ · จัด container · ติดตามจนถึง Port ไทย" },
  { num: "05", icon: Stamp, title: "เคลียร์ + ส่งต่อ", desc: "เคลียร์ภาษี + ออกใบขน + ส่งถึงประตู Door-to-Door" },
];

const WHY = [
  { icon: Wallet, title: "ต้นทุนต่อหน่วยต่ำสุด", desc: "เหมาตู้คุ้มกว่ารวมตู้ — เหมาะกับ order ใหญ่" },
  { icon: ShieldCheck, title: "ไม่ต้องรอรวมตู้", desc: "Cross-dock ตรง · ลด lead time" },
  { icon: BadgePercent, title: "ใช้สิทธิ Form E", desc: "ลดภาษีนำเข้าผ่าน FTA ASEAN-China" },
  { icon: Receipt, title: "ออกใบกำกับภาษีครบ", desc: "ภพ.20 · ใช้ลดหย่อนนิติบุคคล" },
  { icon: Container, title: "ตู้ครบทุกขนาด", desc: "20' · 40' · 40HQ · Reefer (อาหารแช่เย็น)" },
  { icon: Award, title: "ทีมหน้างานจริง", desc: "ประจำ Port + คลัง + พิธีการ" },
];

const FAQ_ITEMS = [
  {
    q: "FCL เหมาะกับ order ขนาดไหน?",
    a: "FCL คุ้มเมื่อปริมาณสินค้าเกิน 15-20 CBM ขึ้นไป — สำหรับ order ที่เล็กกว่านี้ LCL คุ้มกว่า เพราะ FCL ต้องจ่ายค่าตู้ทั้งใบ ไม่ว่าจะใส่เต็มหรือไม่ ทีม Pacred ช่วยคำนวณให้ก่อนยืนยัน",
  },
  {
    q: "ราคา FCL จีน-ไทย เริ่มเท่าไร?",
    a: "ค่าขนส่งทางเรือ FCL จีน-ไทย ขึ้นกับ Port ต้นทาง (เซินเจิ้น/เซี่ยงไฮ้/หนิงโป/อี้อู) · Port ปลายทาง (แหลมฉบัง/คลองเตย) · ขนาดตู้ · ฤดูกาล (peak/off-peak) ทีม quote ให้ก่อนยืนยันทุกครั้ง รวม Total Landed Cost ครบ",
  },
  {
    q: "ใช้เวลากี่วัน?",
    a: "FCL จีน-ไทย ทางเรือ — Transit time 8-12 วัน (จาก Port ต้นทางถึงแหลมฉบัง) + 2-3 วันสำหรับขนส่งโรงงาน-Port + 2-3 วันสำหรับเคลียร์ภาษี + ส่งใน TH รวม ~15-20 วัน",
  },
  {
    q: "Term ไหนเหมาะกับ FCL?",
    a: "DDP ยอดนิยมที่สุด — Pacred จัดการทั้งหมด ลูกค้ารับของถึงประตู · FOB ก็ใช้ได้บ่อย ผู้ขายส่งถึง Port จีน Pacred ลำเลียงต่อ · EXW เหมาะกับลูกค้าที่ต้องการคุมจุดรับของจากโรงงาน · CIF เหมาะกับซัพพลายเออร์ที่จ่ายขนส่ง+ประกันถึงไทยอยู่แล้ว",
  },
  {
    q: "FCL ตู้เปล่าหายต้องทำยังไง?",
    a: "Pacred จัดการประกัน Container Damage ครบ — ถ้าตู้เสียหายระหว่างขนส่ง สายเรือเคลม Pacred ดูแล documentation ให้ ส่วนสินค้าในตู้แนะนำให้ทำประกัน Cargo Insurance เพิ่ม (มีบริการเสริม)",
  },
  {
    q: "เคลียร์ภาษีหลังจากตู้ถึงไทยใช้เวลากี่วัน?",
    a: "ถ้าเอกสารพร้อม — เคลียร์ + ปลดตู้ใช้เวลา 2-3 วัน ถ้ามีปัญหาเอกสาร/พิกัด/ใบอนุญาต อาจจะนานกว่า ทีม Pacred แก้เคสติดด่านได้ครบทุกประเภท",
  },
];

export default async function ImportChinaFclPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel = typedLocale === "th" ? "บริการ" : "Services";
  const here = typedLocale === "th" ? "นำเข้าจีน FCL" : "FCL Import";

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
                {typedLocale === "th" ? "นำเข้าจีน" : "Import China"}
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
              นำเข้าจีน <span className="text-primary-600">FCL เหมาตู้</span> 20{"'"} · 40{"'"} · 40HQ
              <span className="hidden md:inline"> Door-to-Door</span>
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              สำหรับ order ปริมาณมาก — เหมาตู้คุ้มที่สุด · รับของจากโรงงานจีน · ลำเลียงตู้ตรงสู่ Port ไทย · เคลียร์ภาษี · ส่งถึงประตู — <span className="text-primary-600/80 font-bold">ค่าตู้ FCL 20{"'"} เริ่ม $500 · รองรับ DDP / EXW / FOB / CIF</span>
            </h2>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            <TrackedExternalLink
              href={LINE_URL}
              cta="line_cta"
              surface={SURFACE}
              ctaProps={{ position: "hero_banner" }}
              aria-label="ทักไลน์ Pacred — ปรึกษานำเข้าจีน FCL ฟรี"
              className="group block mt-4 md:mt-6 relative pt-3 md:pt-4 pr-4 md:pr-8 max-w-[1100px] no-underline"
            >
              <span className="absolute top-0 left-3 md:left-5 z-20 inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-white text-[11.5px] md:text-[13px] font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.45)] tracking-tight transition-transform duration-300 group-hover:-translate-y-0.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                </span>
                ขอ Quote FCL ฟรี
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
                      FCL Door-to-Door · ครบทุก Term · ทุก Port
                    </p>
                    <p className="hidden md:block mt-1.5 text-[13px] text-white/75 leading-snug">
                      ลำเลียงตู้ตรง · เคลียร์ภาษีครบ · ใช้สิทธิ Form E
                    </p>
                    <p className="mt-1.5 md:mt-2 inline-flex items-center gap-1 text-[10px] md:text-[12px] font-bold tracking-wide">
                      <MessageCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300" strokeWidth={2.6} />
                      <span className="text-yellow-300">ทักไลน์</span>
                      <span className="text-white/85">ปรึกษาฟรี — ตอบไว 5 นาที</span>
                      <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300" strokeWidth={2.6} />
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

        {/* Container sizes */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Container className="w-3.5 h-3.5" strokeWidth={2.6} />
              CONTAINER SIZES · ขนาดตู้
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เลือก <span className="text-primary-600">ขนาดตู้</span> ที่เหมาะกับสินค้า
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              {SIZES.map((s) => (
                <div
                  key={s.code}
                  className="rounded-2xl border border-border bg-white dark:bg-surface p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_14px_32px_rgba(179,0,0,0.10)] hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="inline-flex items-center px-2.5 h-7 rounded-md bg-primary-50 border border-primary-200 text-primary-700 font-black text-[14px] dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-200">
                    {s.code}
                  </div>
                  <h3 className="mt-2 text-[16px] md:text-[18px] font-black text-[#111827] dark:text-white tracking-tight">
                    {s.name}
                  </h3>
                  <p className="mt-1 text-[12.5px] md:text-[13.5px] text-muted font-medium leading-snug">
                    {s.desc}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-surface dark:bg-background border border-border p-2">
                      <div className="text-[10px] md:text-[10.5px] font-bold tracking-[0.10em] text-muted uppercase">
                        CBM
                      </div>
                      <div className="text-[13px] md:text-[14px] font-black text-foreground mt-0.5">
                        {s.cbm}
                      </div>
                    </div>
                    <div className="rounded-lg bg-surface dark:bg-background border border-border p-2">
                      <div className="text-[10px] md:text-[10.5px] font-bold tracking-[0.10em] text-muted uppercase">
                        Payload
                      </div>
                      <div className="text-[13px] md:text-[14px] font-black text-foreground mt-0.5">
                        {s.payload}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Terms */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
              INCOTERMS · เทอมขนส่ง
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              รองรับ <span className="text-primary-600">ทุก Term</span>
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
                            ยอดนิยม
                          </span>
                        )}
                        <span className="text-[11px] md:text-[12px] text-muted font-bold">
                          {term.name}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] md:text-[13px] text-muted font-medium leading-snug">
                        {term.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Process */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Calculator className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · ขั้นตอน
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              FCL ขั้นตอน <span className="text-primary-600">5 ขั้น จบ</span>
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
                      {s.title}
                    </div>
                    <p className="relative mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {s.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY FCL · ทำไม FCL ต้อง Pacred
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เลือก Pacred <span className="text-primary-600">FCL Specialist</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
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

            {/* Cross-link to LCL */}
            <div className="mt-8 md:mt-10 rounded-2xl border border-primary-100 bg-primary-50/40 p-4 md:p-5 dark:bg-primary-900/15 dark:border-primary-800 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[12.5px] md:text-[13.5px] font-black text-[#111827] dark:text-white">
                  Order เล็กกว่า 15 CBM?
                </div>
                <p className="text-[11.5px] md:text-[12.5px] text-muted font-medium mt-0.5">
                  LCL รวมตู้คุ้มกว่า — จ่ายเฉพาะ CBM ที่ใช้
                </p>
              </div>
              <Link
                href="/services/import-china-lcl"
                data-cta="cross-lcl"
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white border border-primary-200 text-primary-700 font-black text-[12.5px] md:text-[13px] hover:bg-primary-50 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-300"
              >
                ดู LCL
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative pt-12 md:pt-20 pb-12 md:pb-16">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <HandCoins className="w-3.5 h-3.5" strokeWidth={2.6} />
              FAQ · คำถามที่พบบ่อย
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              คำถามเกี่ยวกับ <span className="text-primary-600">FCL จีน-ไทย</span>
            </h2>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "import-china-fcl",
                    label: "FCL · พื้นฐาน",
                    items: FAQ_ITEMS,
                  },
                ]}
              />
            </div>
          </div>
        </section>
      </main>
      <ImportExportBanner />
      <Footer />
    </>
  );
}
