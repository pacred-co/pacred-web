import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Boxes,
  Ship,
  CheckCircle2,
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
  PackageSearch,
  HandCoins,
  Sparkles,
  Award,
  Container,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { FaqAccordion } from "@/components/sections/faq-accordion";
import { Footer } from "@/components/sections/footer";
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

const SURFACE = "services_import_china_lcl";

const PATH = "/services/import-china-lcl";
const NS = "seo.services.importChinaLcl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

const LINE_URL = "/line";

const STEPS = [
  { num: "01", icon: MessageCircle, title: "แจ้งสเปก + ปริมาณ", desc: "ประเภทสินค้า · น้ำหนัก/CBM · ปลายทาง — ทีม quote ให้ก่อน" },
  { num: "02", icon: Warehouse, title: "ส่งของถึงโกดังจีน", desc: "Pacred รับที่กวางโจว/เซินเจิ้น/อี้อู — หรือซัพพลายเออร์ส่งเข้าโกดังเอง" },
  { num: "03", icon: PackageSearch, title: "ตรวจ-แพ็ค-รวมตู้", desc: "ตรวจสภาพ · ห่อกันกระแทก · รวมส่งกับลูกค้ารายอื่น" },
  { num: "04", icon: Ship, title: "ขนส่งทางเรือ", desc: "Sea Freight LCL ถึงท่าเรือไทย (คลองเตย/แหลมฉบัง)" },
  { num: "05", icon: Stamp, title: "เคลียร์ + ส่งต่อ", desc: "เคลียร์ภาษี + ส่งถึงประตู Door-to-Door ทั่วประเทศ" },
];

const WHY = [
  { icon: Boxes, title: "เริ่มต้นไม่กี่กล่อง", desc: "ไม่ต้องเหมาตู้ — เหมาะกับเริ่มต้นทดลองตลาด" },
  { icon: Wallet, title: "จ่ายตามที่ใช้จริง", desc: "คิดตาม CBM หรือ KG ที่สูงกว่า — ไม่ต้องจ่ายค่าตู้เต็ม" },
  { icon: ShieldCheck, title: "พักของที่โกดังจีน", desc: "รวมหลาย order เข้าตู้เดียวได้ — ค่าขนส่งคุ้มกว่า" },
  { icon: BadgePercent, title: "ใช้สิทธิ Form E", desc: "ลดภาษีนำเข้าผ่าน FTA จีน-ไทย" },
  { icon: Receipt, title: "ออกใบกำกับภาษีครบ", desc: "ภพ.20 · ใช้ลดหย่อนนิติบุคคล" },
  { icon: Award, title: "Door-to-Door", desc: "ส่งถึงประตูคุณทั่วประเทศ" },
];

const SCOPE = [
  "รับของที่โกดังกวางโจว/เซินเจิ้น/อี้อู — ฟรีค่าฝากในระยะเวลาที่กำหนด",
  "ตรวจสภาพสินค้า · ห่อกันกระแทก · นับชิ้น · ถ่ายรูป",
  "รวมส่งกับลูกค้ารายอื่นในตู้เดียว — ค่าขนส่งคุ้มสุด",
  "เคลียร์พิธีการศุลกากรขาเข้า + ชำระภาษี + อากร ครบจบ",
  "ใช้สิทธิ Form E ทุก order — ลดภาษีนำเข้าได้สูงสุด",
  "Door-to-Door — ส่งถึงโรงงาน/หน้าร้าน/บ้าน ทั่วประเทศ",
];

const COMPARISON = [
  { feature: "Volume", lcl: "<15 CBM", fcl: "15-67 CBM (ตู้เต็ม)" },
  { feature: "Pricing", lcl: "ตาม CBM/KG", fcl: "เหมาตู้" },
  { feature: "Lead time", lcl: "15-20 วัน", fcl: "12-18 วัน" },
  { feature: "Cost per unit", lcl: "สูงกว่าเล็กน้อย", fcl: "ต่ำสุด" },
  { feature: "เหมาะกับ", lcl: "เริ่มต้น · ทดลอง", fcl: "Order ใหญ่ · ขายแน่นอน" },
];

const FAQ_ITEMS = [
  {
    q: "LCL เหมาะกับ order ขนาดไหน?",
    a: "LCL คุ้มที่สุดสำหรับสินค้าปริมาณ 1-15 CBM ถ้าเกิน 15 CBM แล้ว FCL จะคุ้มกว่า เพราะ FCL ค่าตู้เป็น flat-rate ส่วน LCL คิดตาม CBM (ปริมาตร) หรือ KG (น้ำหนัก) ที่สูงกว่า",
  },
  {
    q: "ราคา LCL จีน-ไทย คิดยังไง?",
    a: "LCL คิดตาม CBM หรือ KG ที่สูงกว่า (Volume Weight Conversion ทั่วไป 1 CBM ≈ 167 KG) ค่าขนส่งรวม Origin charges (จัดการที่โกดังจีน) + Sea freight (จีน-ไทย) + Destination charges (เคลียร์ + ส่งใน TH) ทีม Pacred quote Total Landed Cost ครบก่อนยืนยัน",
  },
  {
    q: "ส่งของยังไงถึงโกดังจีน?",
    a: "มี 3 วิธีหลัก — 1) Pacred ไปรับที่โรงงาน (มีค่าบริการ pickup) · 2) ซัพพลายเออร์ส่งเข้าโกดัง Pacred ที่กวางโจว/เซินเจิ้น/อี้อู ฟรี · 3) ลูกค้าจัดส่งทาง courier จีน (Yunda, ZTO, SF) ไปยังที่อยู่โกดังที่ Pacred แจ้ง",
  },
  {
    q: "ใช้เวลากี่วัน?",
    a: "LCL จีน-ไทย ใช้เวลา 15-20 วัน รวม pickup + รวมตู้ที่โกดังจีน (~3-5 วัน) + Sea freight (~10-12 วัน) + เคลียร์ + ส่งใน TH (~2-3 วัน) ทีมแจ้ง ETA ที่แม่นยำเมื่อ booking แล้ว",
  },
  {
    q: "พักของที่โกดังจีนได้นานเท่าไร?",
    a: "ฟรีค่าฝาก 14 วันแรก หลังจากนั้นคิดค่าฝากตามอัตรา (ปกติ 5-10 หยวน/CBM/วัน) เหมาะกับลูกค้าที่สั่งหลายร้านในเวลาห่างกัน รอรวมแล้วค่อยส่งครั้งเดียว",
  },
  {
    q: "ของแตก/สูญหายระหว่างขนส่งทำยังไง?",
    a: "Pacred ให้บริการ Cargo Insurance เสริม (~0.5-1% ของมูลค่าสินค้า) ครอบคลุมแตกหัก/สูญหายระหว่างขนส่ง ถ้าไม่ทำประกัน สายเรือชดเชยตามอัตราพื้นฐานเท่านั้น (~$2/kg) แนะนำให้ทำประกันสำหรับสินค้ามูลค่าสูง",
  },
  {
    q: "ทำไมต้องเลือก Pacred ไม่ใช้ freight forwarder อื่น?",
    a: "Pacred = ทีมหน้างานจริงที่จีน + ไทย ครบทั้งวงจร — มีโกดังตัวเองที่กวางโจว/เซินเจิ้น/อี้อู · มี shipping license ในไทย · มีทีมล่ามจีนช่วยปิดดีลโรงงาน · ออกใบกำกับภาษีได้ · มีระบบติดตามสถานะ real-time · ประสบการณ์ 15+ ปี",
  },
];

export default async function ImportChinaLclPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel = typedLocale === "th" ? "บริการ" : "Services";
  const here = typedLocale === "th" ? "นำเข้าจีน LCL" : "LCL Import";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "นำเข้า LCL" : "LCL Import",
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
            <li>
              <Link href="/services/import-china" className="text-muted hover:text-primary-600 transition-colors">
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
              <Boxes className="w-3.5 h-3.5" strokeWidth={2.6} />
              LCL · LESS CONTAINER LOAD
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              นำเข้าทางเรือ <span className="text-primary-600">LCL รวมตู้</span> จากจีน
              <span className="hidden md:inline"> เริ่มต้นไม่กี่กล่อง</span>
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              จ่ายตาม CBM/KG ที่ใช้จริง · ไม่ต้องเหมาตู้ · เหมาะกับ order เริ่มต้น 1-15 CBM · ขนส่ง 15-20 วัน · เคลียร์ภาษีครบ · <span className="text-primary-600/80 font-bold">Door-to-Door ทั่วประเทศ</span>
            </h2>

            <TrackedExternalLink
              href={LINE_URL}
              cta="line_cta"
              surface={SURFACE}
              ctaProps={{ position: "hero_banner" }}
              aria-label="ทักไลน์ Pacred — ปรึกษานำเข้าจีน LCL ฟรี"
              className="group block mt-4 md:mt-6 relative pt-3 md:pt-4 pr-4 md:pr-8 max-w-[1100px] no-underline"
            >
              <span className="absolute top-0 left-3 md:left-5 z-20 inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-white text-[11.5px] md:text-[13px] font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.45)] tracking-tight">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                </span>
                ขอ Quote LCL ฟรี
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
                      LCL · เริ่มต้นไม่กี่กล่อง · ไม่ต้องเหมาตู้
                    </p>
                    <p className="hidden md:block mt-1.5 text-[13px] text-white/75 leading-snug">
                      จ่ายตาม CBM/KG · พักของฟรี 14 วันที่โกดังจีน
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

            <div className="mt-5 md:mt-7 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <span className="shrink-0">📦</span>
                <span>บริการ LCL ครบวงจร — รับของจีน รวมส่ง เคลียร์ไทย ส่งถึงประตู</span>
              </h3>
              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                กวางโจว · เซินเจิ้น · อี้อู · เซี่ยงไฮ้ · หางโจว · เทียนจิน
              </p>
              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[12.5px] md:text-[14px] leading-snug text-foreground/85">
                {SCOPE.map((item) => (
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
                  โทร {CONTACT.phoneDisplay}
                </TrackedPhoneLink>
                <TrackedExternalLink
                  href={LINE_OA.shortUrl}
                  cta="line_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                  แอด LINE Pacred
                </TrackedExternalLink>
              </div>
            </div>
          </div>
        </section>

        <ContactSales hideAssuranceStrip />

        {/* Comparison */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Container className="w-3.5 h-3.5" strokeWidth={2.6} />
              LCL vs FCL · เปรียบเทียบ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ควรใช้ <span className="text-primary-600">LCL หรือ FCL</span>?
            </h2>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface">
              <table className="w-full text-[12.5px] md:text-[14px]">
                <thead>
                  <tr className="bg-primary-50 dark:bg-primary-900/30 border-b border-border">
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3">เปรียบเทียบ</th>
                    <th className="text-left font-black text-primary-700 dark:text-primary-300 px-3 md:px-4 py-3">LCL</th>
                    <th className="text-left font-black text-foreground/80 px-3 md:px-4 py-3">FCL</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, i) => (
                    <tr key={row.feature} className={i % 2 ? "bg-surface/40" : ""}>
                      <td className="font-bold text-[#111827] dark:text-white px-3 md:px-4 py-2.5 align-top">
                        {row.feature}
                      </td>
                      <td className="font-medium text-primary-700 dark:text-primary-300 px-3 md:px-4 py-2.5 align-top">
                        {row.lcl}
                      </td>
                      <td className="font-medium text-muted px-3 md:px-4 py-2.5 align-top">
                        {row.fcl}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 rounded-2xl border border-primary-100 bg-primary-50/40 p-4 md:p-5 dark:bg-primary-900/15 dark:border-primary-800 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[12.5px] md:text-[13.5px] font-black text-[#111827] dark:text-white">
                  Order มากกว่า 15 CBM?
                </div>
                <p className="text-[11.5px] md:text-[12.5px] text-muted font-medium mt-0.5">
                  FCL เหมาตู้คุ้มกว่า — ต้นทุนต่อหน่วยต่ำสุด
                </p>
              </div>
              <Link
                href="/services/import-china-fcl"
                data-cta="cross-fcl"
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-white border border-primary-200 text-primary-700 font-black text-[12.5px] md:text-[13px] hover:bg-primary-50 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-300"
              >
                ดู FCL
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
              </Link>
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
              LCL จีน-ไทย <span className="text-primary-600">5 ขั้นจบ</span>
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
              WHY LCL · ทำไม LCL ต้อง Pacred
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไม <span className="text-primary-600">มือใหม่</span> เลือก LCL Pacred
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
              คำถามเกี่ยวกับ <span className="text-primary-600">LCL จีน-ไทย</span>
            </h2>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "import-china-lcl",
                    label: "LCL · พื้นฐาน",
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
