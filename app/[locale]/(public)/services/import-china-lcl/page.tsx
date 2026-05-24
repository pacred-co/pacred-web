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
  Tag,
  Zap,
  Truck,
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

const SURFACE = "lcl_landing";

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
  { num: "04", icon: Ship, title: "ขนส่งทางเรือ", desc: "Sea Freight LCL ถึง Port ไทย (คลองเตย/แหลมฉบัง)" },
  { num: "05", icon: Stamp, title: "เคลียร์ + ส่งต่อ", desc: "เคลียร์ภาษี + ส่งถึงประตู Door-to-Door ทั่วประเทศ" },
];

const WHY = [
  { icon: Boxes, title: "เริ่มต้นไม่กี่กล่อง", desc: "ไม่ต้องเหมาตู้ — เหมาะกับเริ่มต้นทดลองตลาด" },
  { icon: Wallet, title: "จ่ายตามที่ใช้จริง", desc: "คิดตาม CBM หรือ KG ที่สูงกว่า — ไม่ต้องจ่ายค่าตู้เต็ม" },
  { icon: ShieldCheck, title: "พักของฟรี 14 วันที่โกดังจีน", desc: "รวมหลาย order เข้าตู้เดียวได้ — ค่าขนส่งคุ้มกว่า" },
  { icon: BadgePercent, title: "ใช้สิทธิ Form E", desc: "ลดภาษีนำเข้าผ่าน FTA จีน-ไทย" },
  { icon: Receipt, title: "ออกใบกำกับภาษีครบ", desc: "ภพ.20 · ใช้ลดหย่อนนิติบุคคล" },
  { icon: Award, title: "Door-to-Door", desc: "ส่งถึงประตูคุณทั่วประเทศ" },
];

// 5 REASONS — featured WHY block, scannable + numbered
const REASONS = [
  {
    num: "01",
    icon: Boxes,
    title: "Order เล็กก็เริ่มได้",
    desc: "ไม่ต้องเหมาตู้ทั้งใบ — เริ่มจาก 1-2 กล่องก็ส่งได้ จ่ายตาม CBM/KG ที่ใช้จริง คุ้มที่สุดสำหรับ SME / ผู้นำเข้ามือใหม่",
  },
  {
    num: "02",
    icon: Warehouse,
    title: "โกดังจีนเอง 3 จุดหลัก",
    desc: "Pacred มีโกดังที่กวางโจว · เซินเจิ้น · อี้อู — รับของจากซัพพลายเออร์ฟรี ตรวจ-นับ-แพ็ค ก่อนรวมส่ง",
  },
  {
    num: "03",
    icon: BadgePercent,
    title: "Form E ทุก order — ลดภาษี",
    desc: "ขอ Form E จากซัพพลายเออร์จีนให้ · ใช้สิทธิ FTA ASEAN-China ลดภาษีนำเข้าบางสินค้าเหลือ 0%",
  },
  {
    num: "04",
    icon: ShieldCheck,
    title: "ตรวจสินค้าก่อนรวมตู้",
    desc: "นับชิ้น · ตรวจสภาพ · ถ่ายรูป · ห่อกันกระแทก — แจ้งสถานะให้ลูกค้ารับทราบก่อนออกจากจีน",
  },
  {
    num: "05",
    icon: Truck,
    title: "Door-to-Door ครบทั้งสาย",
    desc: "รับของในจีน → รวมตู้ → ขนส่งทางเรือ → เคลียร์ภาษี → ส่งถึงประตูในไทย — ไม่ต้องประสาน vendor หลายเจ้า",
  },
];

const SCOPE = [
  "รับของที่โกดังกวางโจว/เซินเจิ้น/อี้อู — ฟรีค่าฝาก 14 วัน",
  "ตรวจสภาพสินค้า · ห่อกันกระแทก · นับชิ้น · ถ่ายรูป",
  "รวมส่งกับลูกค้ารายอื่นในตู้เดียว — ค่าขนส่งคุ้มสุด",
  "เคลียร์พิธีการศุลกากรขาเข้า + ชำระภาษี + อากร ครบจบ",
  "ใช้สิทธิ Form E ทุก order — ลดภาษีนำเข้าได้สูงสุด",
  "Door-to-Door — ส่งถึงโรงงาน/หน้าร้าน/บ้าน ทั่วประเทศ",
  "ออกใบกำกับภาษี (ภพ.20) + ใบเสร็จครบ",
  "ทีมล่ามจีนช่วยปิดดีลกับโรงงาน (ถ้าต้องการ)",
];

const COMPARISON = [
  { feature: "Volume", lcl: "<15 CBM", fcl: "15-67 CBM (ตู้เต็ม)" },
  { feature: "Pricing", lcl: "ตาม CBM/KG", fcl: "เหมาตู้" },
  { feature: "Lead time", lcl: "15-20 วัน", fcl: "12-18 วัน" },
  { feature: "Cost per unit", lcl: "สูงกว่าเล็กน้อย", fcl: "ต่ำสุด" },
  { feature: "เหมาะกับ", lcl: "เริ่มต้น · ทดลอง", fcl: "Order ใหญ่ · ขายแน่นอน" },
];

// Pricing by CBM range — indicative LCL Sea Freight rates
const PRICING = [
  {
    tier: "Starter",
    range: "1-3 CBM",
    price: "$180/CBM",
    desc: "เหมาะกับมือใหม่ ทดลองตลาด · ไม่กี่กล่องแรก",
    inclusions: ["Origin charges จีน", "Sea Freight LCL", "พักของฟรี 14 วัน"],
    featured: false,
  },
  {
    tier: "Regular",
    range: "3-10 CBM",
    price: "$150/CBM",
    desc: "Order ขนาดกลาง — ยอดนิยมที่สุด · คุ้มที่สุดสำหรับ SME",
    inclusions: ["Origin charges จีน", "Sea Freight LCL", "พักของฟรี 14 วัน", "Cross-dock priority"],
    featured: true,
  },
  {
    tier: "Volume",
    range: "10-15 CBM",
    price: "$130/CBM",
    desc: "Order ใหญ่ใกล้ FCL · ยังคุ้ม LCL ถ้าน้ำหนักไม่เต็มตู้",
    inclusions: ["Origin charges จีน", "Sea Freight LCL", "พักของฟรี 14 วัน", "ส่วนลดตามปริมาณ"],
    featured: false,
  },
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
  {
    q: "สั่งจาก 1688 / Taobao / Alibaba ส่งเข้าโกดัง Pacred ได้มั้ย?",
    a: "ได้ — Pacred แจ้งที่อยู่โกดังจีน (เป็นภาษาจีน) ให้ลูกค้าหรือซัพพลายเออร์ส่งของเข้าโกดังตรง · ทีมรับของ ตรวจ-นับ-ถ่ายรูป แจ้งสถานะให้ทราบ ถ้าลูกค้าไม่ได้คุยจีนเอง ใช้บริการล่ามจีนได้ — ทีม Pacred ปิดดีลกับโรงงานในนามคุณ",
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
              นำเข้าจีน <span className="text-primary-600">LCL รวมตู้</span>
              <span className="hidden md:inline"> เริ่มต้นไม่กี่กล่อง · จ่ายตามที่ใช้</span>
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              จ่ายตาม CBM/KG ที่ใช้จริง · ไม่ต้องเหมาตู้ · เหมาะกับ order เริ่มต้น 1-15 CBM · ขนส่ง 15-20 วัน · เคลียร์ภาษีครบ — <span className="text-primary-600/80 font-bold">LCL เริ่ม $150/CBM · Door-to-Door ทั่วประเทศ · พักของฟรี 14 วันที่โกดังจีน</span>
            </h2>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            {/* Primary CTA row */}
            <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
              <Link
                href="/register"
                aria-label="ใช้บริการ LCL — สมัครฟรี"
                data-cta="register_hero"
                className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[15px] hover:bg-primary-700 transition-colors shadow-[0_8px_22px_rgba(179,0,0,0.30)]"
              >
                ใช้บริการ — สมัครฟรี
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
                ปรึกษาฟรี · ทักไลน์
              </TrackedExternalLink>
            </div>

            <div className="mt-5 md:mt-7 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <Boxes className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" strokeWidth={2.4} />
                <span>บริการ LCL ครบวงจร — รับของจีน รวมส่ง เคลียร์ไทย ส่งถึงประตู</span>
              </h3>
              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                กวางโจว · เซินเจิ้น · อี้อู · เซี่ยงไฮ้ · หางโจว · เทียนจิน → คลองเตย · แหลมฉบัง
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

        {/* ครบเครื่องเรื่อง LCL */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Zap className="w-3.5 h-3.5" strokeWidth={2.6} />
              ครบเครื่องเรื่อง LCL
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              บริการ <span className="text-primary-600">LCL ครบวงจร</span> เริ่มต้นง่ายสุด
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              4 จุดแข็งของ LCL ที่ตอบโจทย์ผู้นำเข้ามือใหม่ + SME
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {[
                { icon: Boxes, title: "ไม่กี่กล่องก็เริ่มได้", desc: "เริ่ม 1 CBM ก็ส่งได้" },
                { icon: Wallet, title: "จ่ายตามที่ใช้", desc: "ตาม CBM/KG ที่สูงกว่า" },
                { icon: Warehouse, title: "พักของฟรี 14 วัน", desc: "รวมหลาย order ในตู้เดียว" },
                { icon: ShieldCheck, title: "ตรวจก่อนรวมตู้", desc: "ห่อกันกระแทก ถ่ายรูปครบ" },
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

        {/* Pricing — by CBM range */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
              PRICING · ราคาตามปริมาณ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ราคา <span className="text-primary-600">LCL จีน-ไทย</span> ตาม CBM
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ยิ่งปริมาณมาก ค่าต่อ CBM ยิ่งถูก — ราคาเฉลี่ย Sea Freight (Origin → Port ไทย) ทีม quote Total Landed Cost ก่อนยืนยันทุกครั้ง
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
                      ยอดนิยม
                    </span>
                  )}
                  <div className="text-[13px] md:text-[14px] font-black text-primary-600 tracking-[0.05em] uppercase">
                    {p.tier}
                  </div>
                  <p className="mt-1 text-[12px] md:text-[13px] text-muted font-bold">
                    {p.range}
                  </p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[32px] md:text-[42px] font-black text-[#111827] dark:text-white leading-none tracking-tight">
                      {p.price}
                    </span>
                  </div>
                  <p className="mt-2 text-[12px] md:text-[13px] text-muted font-medium leading-snug">
                    {p.desc}
                  </p>

                  <ul className="mt-5 space-y-2">
                    {p.inclusions.map((inc) => (
                      <li key={inc} className="flex items-start gap-2 text-[12.5px] md:text-[13px] font-medium text-foreground/90">
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                        <span>{inc}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/register"
                    data-cta={`pricing-${p.tier.toLowerCase()}`}
                    className={`mt-6 inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl font-black text-[13px] md:text-[14px] transition-colors ${
                      p.featured
                        ? "bg-primary-600 text-white hover:bg-primary-700 shadow-[0_6px_18px_rgba(179,0,0,0.30)]"
                        : "border border-primary-200 text-primary-700 hover:bg-primary-50 dark:border-primary-800 dark:text-primary-300"
                    }`}
                  >
                    ใช้บริการ
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11.5px] md:text-[12.5px] text-muted text-center font-medium">
              * Volume Weight ใช้ 1 CBM ≈ 167 KG — คิดด้านสูงกว่า · เพิ่ม Destination charges + Form E + เคลียร์ภาษีคิดแยก · ราคาเปลี่ยนตามฤดูกาล
            </p>
          </div>
        </section>

        {/* Comparison */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
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
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
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

        {/* 5 REASONS */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 REASONS · 5 เหตุผลเลือก Pacred
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไม LCL จีน-ไทย ต้อง <span className="text-primary-600">Pacred Shipping</span>
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
                      {r.title}
                    </h3>
                    <p className="mt-1.5 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                      {r.desc}
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

        {/* Reviews — filtered to import */}
        <Reviews defaultFilter="import" />

        {/* FAQ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
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
                  พร้อมส่ง LCL จากจีน?
                </p>
                <h3 className="text-[24px] md:text-[40px] font-black leading-[1.1] tracking-tight drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]">
                  เร็ว ไว ไม่มีคำว่าทำไม่ได้ — ส่ง LCL กับ Pacred เริ่มต้นง่ายสุด
                </h3>
                <p className="mt-2 md:mt-3 text-[14px] md:text-[16px] font-bold text-white/95 leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
                  สมัครฟรี — ทีมแจ้งที่อยู่โกดังจีนให้เลย · หรือทักไลน์ปรึกษาก่อนได้ ตอบไว 5 นาที
                </p>

                <div className="mt-5 md:mt-6 flex flex-col sm:flex-row gap-3 max-w-[640px]">
                  <Link
                    href="/register"
                    aria-label="ใช้บริการ LCL — สมัครฟรี"
                    data-cta="register_footer"
                    className="inline-flex items-center justify-center gap-2 h-12 md:h-14 px-6 rounded-xl bg-white text-primary-700 font-black text-[14px] md:text-[16px] hover:bg-yellow-50 transition-colors shadow-[0_8px_22px_rgba(0,0,0,0.25)]"
                  >
                    ใช้บริการ — สมัครฟรี
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
                    ปรึกษาฟรี · ทักไลน์
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
