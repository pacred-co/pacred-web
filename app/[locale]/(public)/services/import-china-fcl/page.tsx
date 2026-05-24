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
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

const LINE_URL = "/line";

const SCOPE = [
  "เหมาตู้เต็มจากโรงงานจีน — Cross-dock 20'/40'/40HQ · Reefer ก็จัดได้",
  "รับของหน้าโรงงาน · ลำเลียงตู้ตรงสู่ Port ไทย (แหลมฉบัง/คลองเตย)",
  "Customs Bonded Warehouse + ICD ลาดกระบัง พร้อมรับตู้",
  "ครบทุก Incoterm — EXW · FOB · CIF · DDP",
  "เคลียร์พิธีการศุลกากร + ชำระภาษี + อากร ครบจบ",
  "ใช้สิทธิ Form E — ลดภาษีนำเข้าผ่าน FTA ASEAN-China",
  "ออกใบกำกับภาษี (ภพ.20) + ใบเสร็จครบทุกรายการ",
  "Door-to-Door ฟรี — ส่งถึงโรงงาน/หน้าร้าน/บ้าน ทั่วประเทศ",
];

const SIZES = [
  {
    code: "20'",
    name: "20-foot Standard",
    cbm: "~28-33 CBM",
    payload: "~28 ตัน",
    desc: "เหมาะกับสินค้าหนัก/ปริมาณกลาง · ยาว 5.9m × กว้าง 2.35m × สูง 2.39m",
    useCase: "อะไหล่ · เครื่องจักรกลาง · กระเบื้อง · เหล็ก",
    popular: false,
  },
  {
    code: "40'",
    name: "40-foot Standard",
    cbm: "~58-67 CBM",
    payload: "~28-30 ตัน",
    desc: "เหมาะกับสินค้าปริมาณเยอะแต่น้ำหนักไม่หนัก · 12m × 2.35m × 2.39m",
    useCase: "สินค้าทั่วไป · เครื่องใช้ไฟฟ้า · ของใช้ในบ้าน",
    popular: true,
  },
  {
    code: "40' HQ",
    name: "40-foot High Cube",
    cbm: "~76 CBM",
    payload: "~28-30 ตัน",
    desc: "ตู้สูงพิเศษ ใช้กับของบาง/ไม่หนัก/ตู้ furniture · 12m × 2.35m × 2.70m",
    useCase: "เฟอร์นิเจอร์ · พลาสติก · สินค้ากล่องใหญ่",
    popular: false,
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

const ROUTES = [
  {
    origin: "เซินเจิ้น / กวางโจว",
    port: "แหลมฉบัง",
    transit: "8-10 วัน",
    note: "รวมที่สุด · เรือออกทุกสัปดาห์",
  },
  {
    origin: "เซี่ยงไฮ้ / หนิงโป",
    port: "แหลมฉบัง · กรุงเทพ",
    transit: "10-12 วัน",
    note: "Direct call · ไม่ผ่านท่าเปลี่ยน",
  },
  {
    origin: "อี้อู / หางโจว",
    port: "แหลมฉบัง",
    transit: "12-14 วัน",
    note: "ผ่าน Ningbo · เหมาะกับสินค้าตลาดอี้อู",
  },
  {
    origin: "ชิงเต่า / เทียนจิน",
    port: "แหลมฉบัง",
    transit: "12-15 วัน",
    note: "จีนเหนือ · สินค้าหนัก/เครื่องจักร",
  },
  {
    origin: "คุนหมิง (ทางรถ)",
    port: "อรัญประเทศ · มุกดาหาร",
    transit: "5-7 วัน",
    note: "Cross-border truck · ลด lead time",
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
  { icon: ShieldCheck, title: "ไม่ต้องรอรวมตู้", desc: "Cross-dock ตรง · ลด lead time 3-7 วัน" },
  { icon: BadgePercent, title: "ใช้สิทธิ Form E", desc: "ลดภาษีนำเข้าผ่าน FTA ASEAN-China สูงสุด 0%" },
  { icon: Receipt, title: "ออกใบกำกับภาษีครบ", desc: "ภพ.20 · ใช้ลดหย่อนนิติบุคคล" },
  { icon: Container, title: "ตู้ครบทุกขนาด", desc: "20' · 40' · 40HQ · Reefer (อาหารแช่เย็น)" },
  { icon: Award, title: "ทีมหน้างานจริง", desc: "ประจำ Port + คลัง + พิธีการ ทุกขั้น" },
];

// 5 reasons — featured "WHY FCL ต้อง Pacred" section per ปอน — punchy + numbered
const REASONS = [
  {
    num: "01",
    icon: Truck,
    title: "Door-to-Door ครบทั้งสาย",
    desc: "รับของหน้าโรงงานจีน → ลำเลียงตู้ → เคลียร์ภาษี → ส่งถึงประตูคุณในไทย — ไม่ต้องสลับ vendor หลายเจ้า",
  },
  {
    num: "02",
    icon: Container,
    title: "Booking ตู้ก่อนใคร",
    desc: "เรามี Allocation กับสายเรือหลัก (Maersk · MSC · CMA-CGM · COSCO · ONE) — Peak season ก็มีตู้ให้",
  },
  {
    num: "03",
    icon: BadgePercent,
    title: "Form E ทุก order — ลดภาษี",
    desc: "ขอ Form E จากซัพพลายเออร์จีนให้ · ตรวจให้ถูก ใช้สิทธิ FTA ASEAN-China ลดภาษีนำเข้าบางสินค้าเหลือ 0%",
  },
  {
    num: "04",
    icon: ShieldCheck,
    title: "ประกัน Cargo + Container",
    desc: "Container Damage ครอบคลุมโดยสายเรือ · Cargo Insurance เสริมให้ตามมูลค่าสินค้า — ของแตก/หาย ได้คุ้ม",
  },
  {
    num: "05",
    icon: Award,
    title: "ทีมเคลียร์ 15+ ปี ทุก Port",
    desc: "ประจำที่แหลมฉบัง · คลองเตย · ICD ลาดกระบัง · BFS สุวรรณภูมิ — เคลียร์ตู้ใน 2-3 วันถ้าเอกสารพร้อม",
  },
];

// Pricing — indicative table by container size + route (FCL spec request from ปอน)
const PRICING = [
  {
    tier: "20' Standard",
    route: "เซินเจิ้น → แหลมฉบัง",
    price: "เริ่ม $500",
    inclusions: ["ค่าระวาง Sea Freight", "Port handling ต้นทาง+ปลายทาง", "Document fee"],
    note: "ราคาขึ้น/ลงตามฤดูกาล (peak/off-peak)",
    featured: false,
  },
  {
    tier: "40' Standard",
    route: "เซินเจิ้น → แหลมฉบัง",
    price: "เริ่ม $850",
    inclusions: ["ค่าระวาง Sea Freight", "Port handling ต้นทาง+ปลายทาง", "Document fee", "Booking priority"],
    note: "ราคาเฉลี่ยต่อ CBM ถูกที่สุด · ยอดนิยม",
    featured: true,
  },
  {
    tier: "40' High Cube",
    route: "เซินเจิ้น → แหลมฉบัง",
    price: "เริ่ม $900",
    inclusions: ["ค่าระวาง Sea Freight", "Port handling ต้นทาง+ปลายทาง", "Document fee", "Cube space +25%"],
    note: "เหมาะกับเฟอร์นิเจอร์ / สินค้ากล่องใหญ่",
    featured: false,
  },
];

const FAQ_ITEMS = [
  {
    q: "FCL เหมาะกับ order ขนาดไหน?",
    a: "FCL คุ้มเมื่อปริมาณสินค้าเกิน 15-20 CBM ขึ้นไป — สำหรับ order ที่เล็กกว่านี้ LCL คุ้มกว่า เพราะ FCL ต้องจ่ายค่าตู้ทั้งใบ ไม่ว่าจะใส่เต็มหรือไม่ ทีม Pacred ช่วยคำนวณให้ก่อนยืนยัน",
  },
  {
    q: "ราคา FCL จีน-ไทย เริ่มเท่าไร?",
    a: "ค่าขนส่งทางเรือ FCL จีน-ไทย ขึ้นกับ Port ต้นทาง (เซินเจิ้น/เซี่ยงไฮ้/หนิงโป/อี้อู) · Port ปลายทาง (แหลมฉบัง/คลองเตย) · ขนาดตู้ · ฤดูกาล (peak/off-peak) ราคาประมาณ — 20' เริ่ม $500 · 40' เริ่ม $850 · 40HQ เริ่ม $900 (ค่าระวางอย่างเดียว ไม่รวม Origin + Destination charges) ทีม quote ให้ก่อนยืนยันทุกครั้ง รวม Total Landed Cost ครบ",
  },
  {
    q: "ใช้เวลากี่วัน?",
    a: "FCL จีน-ไทย ทางเรือ — Transit time 8-12 วัน (จาก Port ต้นทางถึงแหลมฉบัง) + 2-3 วันสำหรับขนส่งโรงงาน-Port + 2-3 วันสำหรับเคลียร์ภาษี + ส่งใน TH รวม ~15-20 วัน",
  },
  {
    q: "Port ปลายทางมีให้เลือกอะไรบ้าง?",
    a: "Port ปลายทางหลักในไทย — แหลมฉบัง (Laem Chabang Port — ยอดนิยม, รองรับตู้ใหญ่สุด) · คลองเตย (Bangkok Port — เหมาะกับลูกค้าในเมือง) · ICD ลาดกระบัง (Inland Container Depot — ตู้ที่ขนต่อทางรถ) · ด่านอรัญประเทศ/มุกดาหาร (Cross-border truck สำหรับจีนตอนใต้)",
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
  {
    q: "Demurrage / Detention คืออะไร · มีค่าใช้จ่ายแฝงมั้ย?",
    a: "Demurrage = ค่าฝากตู้ที่ Port (ถ้าปลดตู้ช้า) · Detention = ค่าใช้ตู้นอกท่า (ถ้าคืนตู้เปล่าช้า) Pacred บริหารเวลาให้ตู้ออกใน Free Time ที่สายเรือให้ (ปกติ 7-14 วัน) เพื่อหลีกเลี่ยงค่าเหล่านี้ ถ้ายังเกิดขึ้น ทีมแจ้งล่วงหน้าและช่วยเจรจาให้",
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
              <span className="hidden md:inline"> Door-to-Door ฟรี</span>
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              สำหรับ order ปริมาณมาก — เหมาตู้คุ้มที่สุด · รับของจากโรงงานจีน · ลำเลียงตู้ตรงสู่ Port ไทย · เคลียร์ภาษี · ส่งถึงประตูฟรี — <span className="text-primary-600/80 font-bold">ค่าตู้ FCL 20{"'"} เริ่ม $500 · 40{"'"} เริ่ม $850 · รองรับ DDP / EXW / FOB / CIF · 15+ ปี ทุก Port</span>
            </h2>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            {/* Primary CTA row — "ใช้บริการ" (register) + "ปรึกษาฟรี" (LINE) */}
            <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
              <Link
                href="/register"
                aria-label="ใช้บริการ FCL — สมัครฟรี"
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

            {/* Service scope checklist */}
            <div className="mt-5 md:mt-7 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <Container className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" strokeWidth={2.4} />
                <span>บริการ FCL เหมาตู้จากจีน — รับโรงงาน เคลียร์ไทย ส่งถึงประตู ฟรี Door-to-Door</span>
              </h3>
              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                เซินเจิ้น · กวางโจว · เซี่ยงไฮ้ · หนิงโป · อี้อู · ชิงเต่า → แหลมฉบัง · คลองเตย · ICD ลาดกระบัง
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

        {/* ครบเครื่องเรื่องบริการ — 4 quick benefits */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Zap className="w-3.5 h-3.5" strokeWidth={2.6} />
              ครบเครื่องเรื่อง FCL
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              บริการ <span className="text-primary-600">FCL ครบทุกมิติ</span> ไม่ต้องสลับเจ้า
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              4 จุดแข็งหลักที่ทำให้ทีมโลจิสติกส์ทั่วประเทศเลือก Pacred ดูแล FCL ของเขา
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {[
                { icon: Container, title: "ตู้ครบทุกขนาด", desc: "20'/40'/40HQ + Reefer พร้อม Booking" },
                { icon: Wallet, title: "ราคาตรงไป", desc: "Quote Total Landed Cost ในใบเดียว" },
                { icon: Truck, title: "Door-to-Door ฟรี", desc: "ส่งถึงประตูทั่วประเทศ ไม่บวกเพิ่ม" },
                { icon: ShieldCheck, title: "เคลียร์ครบ ภาษีถูก", desc: "ใช้ Form E + ออก ภพ.20 ครบ" },
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
              CONTAINER SIZES · ขนาดตู้
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เลือก <span className="text-primary-600">ขนาดตู้</span> ที่เหมาะกับสินค้า
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
                      ยอดนิยม
                    </span>
                  )}
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
                  <div className="mt-3 rounded-lg bg-white dark:bg-background border border-primary-100 dark:border-primary-900/40 p-2.5">
                    <div className="text-[10px] font-bold tracking-[0.10em] text-primary-600 uppercase">
                      เหมาะกับ
                    </div>
                    <p className="text-[11.5px] md:text-[12.5px] font-medium text-foreground mt-0.5 leading-snug">
                      {s.useCase}
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
              PRICING · ราคาเริ่มต้น
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ราคา <span className="text-primary-600">FCL จีน-ไทย</span> โปร่งใส
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ราคาตัวอย่างค่าระวาง (Sea Freight) Port-to-Port — ราคา Total Landed Cost ขอ quote ก่อนยืนยันทุกครั้ง
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
                  <p className="mt-1 text-[12px] md:text-[13px] text-muted font-medium">
                    {p.route}
                  </p>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[32px] md:text-[42px] font-black text-[#111827] dark:text-white leading-none tracking-tight">
                      {p.price}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] md:text-[12px] font-bold text-primary-600/80">
                    {p.note}
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
                    data-cta={`pricing-${p.tier.replace(/\s+/g, "-").toLowerCase()}`}
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
              * ราคาเปลี่ยนตาม Port ต้นทาง · ฤดูกาล (peak/off-peak) · เพิ่ม Origin + Destination charges · Form E + เคลียร์ภาษีคิดแยก — ทีม quote Total Landed Cost ก่อนยืนยัน
            </p>
          </div>
        </section>

        {/* Routes table */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Ship className="w-3.5 h-3.5" strokeWidth={2.6} />
              ROUTES · เส้นทางเดินเรือ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เส้นทาง <span className="text-primary-600">FCL จีน-ไทย</span> ครอบคลุมทุก Port
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              จากจีนตอนใต้ → จีนตอนกลาง → จีนตอนเหนือ ทีม Pacred ขนตู้ให้ครบทุกเส้นทาง
            </p>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface">
              <table className="w-full text-[12.5px] md:text-[14px]">
                <thead>
                  <tr className="bg-primary-50 dark:bg-primary-900/30 border-b border-border">
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3">ต้นทาง (จีน)</th>
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3">ปลายทาง (ไทย)</th>
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3 hidden sm:table-cell">Transit</th>
                    <th className="text-left font-black text-[#111827] dark:text-white px-3 md:px-4 py-3 hidden md:table-cell">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {ROUTES.map((r, i) => (
                    <tr key={r.origin} className={i % 2 ? "bg-surface/40" : ""}>
                      <td className="font-bold text-[#111827] dark:text-white px-3 md:px-4 py-3 align-top">
                        {r.origin}
                      </td>
                      <td className="font-medium text-primary-700 dark:text-primary-300 px-3 md:px-4 py-3 align-top">
                        {r.port}
                      </td>
                      <td className="font-medium text-foreground/80 px-3 md:px-4 py-3 align-top hidden sm:table-cell">
                        {r.transit}
                      </td>
                      <td className="font-medium text-muted px-3 md:px-4 py-3 align-top hidden md:table-cell">
                        {r.note}
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
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
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

        {/* 5 REASONS — featured WHY section */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 REASONS · 5 เหตุผลเลือก Pacred
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไม FCL จีน-ไทย ต้อง <span className="text-primary-600">Pacred Shipping</span>
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
                  พร้อมเหมาตู้ FCL จากจีน?
                </p>
                <h3 className="text-[24px] md:text-[40px] font-black leading-[1.1] tracking-tight drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]">
                  เร็ว ไว ไม่มีคำว่าทำไม่ได้ — Pacred ดูแล FCL ของคุณครบทั้งสาย
                </h3>
                <p className="mt-2 md:mt-3 text-[14px] md:text-[16px] font-bold text-white/95 leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
                  สมัครฟรี เริ่มขอ quote ภายในวันเดียว — หรือทักไลน์คุย FCL กับทีมก่อนได้ ตอบไว 5 นาที
                </p>

                <div className="mt-5 md:mt-6 flex flex-col sm:flex-row gap-3 max-w-[640px]">
                  <Link
                    href="/register"
                    aria-label="ใช้บริการ FCL — สมัครฟรี"
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
