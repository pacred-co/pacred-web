import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Plane,
  Ship,
  CheckCircle2,
  ShieldCheck,
  Wallet,
  Receipt,
  Calculator,
  Stamp,
  Warehouse,
  MessageCircle,
  Phone,
  Home,
  ChevronRight,
  ArrowRight,
  Globe2,
  FileCheck2,
  PackageSearch,
  HandCoins,
  Sparkles,
  Award,
  Anchor,
  Container,
  ShieldQuestion,
  ScanLine,
  MapPin,
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

const SURFACE = "services_export_worldwide";

const PATH = "/services/export-worldwide";
const NS = "seo.services.exportWorldwide";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

const LINE_URL = "/line";

const MODES = [
  {
    id: "air",
    icon: Plane,
    badge: "AIR FREIGHT",
    title: "ส่งออกทางอากาศ",
    desc: "Air Freight สุวรรณภูมิ/ดอนเมือง · 3-7 วันถึงปลายทาง · เหมาะกับสินค้ามีค่า/รีบใช้/อาหารสด",
    accent: "from-sky-500 to-sky-700",
  },
  {
    id: "sea",
    icon: Ship,
    badge: "SEA FREIGHT",
    title: "ส่งออกทางเรือ",
    desc: "FCL/LCL จากแหลมฉบัง/คลองเตย · 15-45 วันตามปลายทาง · เหมาะกับสินค้าปริมาณมาก",
    accent: "from-blue-600 to-blue-800",
  },
  {
    id: "express",
    icon: Container,
    badge: "EXPRESS",
    title: "Express Courier",
    desc: "DHL · FedEx · UPS · TNT — 2-5 วันถึงปลายทาง · เหมาะกับเอกสาร/ตัวอย่าง/พัสดุเล็ก",
    accent: "from-rose-500 to-rose-700",
  },
];

const REGIONS = [
  { name: "เอเชีย", sub: "Japan · Korea · China · ASEAN · India" },
  { name: "ยุโรป", sub: "EU 27 · UK · Switzerland · Norway" },
  { name: "อเมริกา", sub: "USA · Canada · Mexico · LATAM" },
  { name: "ตะวันออกกลาง", sub: "UAE · Saudi · Qatar · Israel" },
  { name: "ออสเตรเลีย-นิวซีแลนด์", sub: "Sydney · Melbourne · Auckland" },
  { name: "แอฟริกา", sub: "South Africa · Nigeria · Egypt · Kenya" },
];

const SCOPE = [
  "Pickup สินค้าจากโรงงาน/โกดังในไทย — รถ 4 ล้อ/6 ล้อ/10 ล้อ",
  "บรรจุภัณฑ์มาตรฐานส่งออก — Wooden crate · Pallet · Shrink wrap",
  "ตรวจ HS Code · พิกัดอัตราอากร · จัดเอกสารส่งออก",
  "Booking สายเรือ/สายการบิน · ยื่นใบขนส่งออก",
  "เคลียร์พิธีการศุลกากรขาออก + ภาษี + อากร",
  "ขอ Form A · Form D · Form E · CO ทั่วไป",
  "ฟูมิเกชัน + ใบรับรองสุขอนามัยพืช (Phytosanitary)",
  "ติดตามสถานะจนปลายทาง + เคลียร์ปลายทาง (ถ้าต้องการ DDP)",
];

const TERMS = [
  { code: "EXW", name: "Ex Works", desc: "ผู้ขายเตรียมของพร้อมที่โรงงาน · ผู้ซื้อรับผิดชอบทุกขั้นจากต้นทาง" },
  { code: "FOB", name: "Free On Board", desc: "ผู้ขายส่งของถึง Port ต้นทาง · ผู้ซื้อจ่ายค่าขนส่ง+เคลียร์ปลายทาง" },
  { code: "CFR", name: "Cost & Freight", desc: "ผู้ขายจ่ายค่าขนส่งถึง Port ปลายทาง · ผู้ซื้อรับผิดชอบประกัน+เคลียร์" },
  { code: "CIF", name: "Cost · Insurance · Freight", desc: "ผู้ขายจ่ายขนส่ง+ประกันถึง Port ปลายทาง · ผู้ซื้อเคลียร์ปลายทาง" },
  { code: "DAP", name: "Delivered At Place", desc: "ผู้ขายส่งถึงสถานที่ปลายทาง · ผู้ซื้อรับผิดชอบเคลียร์+ภาษี" },
  { code: "DDP", name: "Delivered Duty Paid", desc: "ผู้ขายส่งถึงประตูปลายทางพร้อมเสียภาษี · ผู้ซื้อรับของอย่างเดียว" },
];

const STEPS = [
  { num: "01", icon: MessageCircle, title: "แจ้งสเปก + ปลายทาง", desc: "ประเทศปลายทาง · ประเภทสินค้า · ปริมาณ · Incoterm" },
  { num: "02", icon: Calculator, title: "Quote ค่าใช้จ่าย", desc: "ค่าขนส่ง + เอกสาร + เคลียร์ + ประกัน (option) ครบในใบเดียว" },
  { num: "03", icon: FileCheck2, title: "จัดเตรียมเอกสาร", desc: "Invoice · Packing · Form A/D/E · CO · ใบขนส่งออก" },
  { num: "04", icon: PackageSearch, title: "Pickup + บรรจุ", desc: "รับของจากโรงงาน · บรรจุมาตรฐานส่งออก · ลำเลียงสู่ Port" },
  { num: "05", icon: Stamp, title: "เคลียร์ + ส่ง", desc: "เคลียร์ขาออก · Booking · ติดตามจนถึงปลายทาง" },
];

const WHY = [
  { icon: Globe2, title: "ส่งได้ทั่วโลก", desc: "200+ ประเทศปลายทาง · พาร์ทเนอร์ครบทุกทวีป" },
  { icon: ShieldCheck, title: "Shipping License ครบ", desc: "ตัวแทนออกของถูกกฎหมาย · ออกใบขนสินค้าได้" },
  { icon: FileCheck2, title: "เอกสารครบทุกประเภท", desc: "Form A/D/E · CO · Phytosanitary · Fumigation" },
  { icon: Wallet, title: "Total Cost ชัดเจน", desc: "Quote ครบ ไม่บวกแอบ — แจ้งก่อนยืนยัน" },
  { icon: ShieldQuestion, title: "Cargo Insurance", desc: "ประกันสินค้าระหว่างขนส่ง · เคลมได้จริง" },
  { icon: Award, title: "ประสบการณ์ 15+ ปี", desc: "เคสจริงทั้ง FCL/LCL/Air/Express ครบทุกตลาด" },
];

const FAQ_ITEMS = [
  {
    q: "ส่งออกได้ประเทศไหนบ้าง?",
    a: "Pacred ส่งออกได้ทั่วโลก 200+ ประเทศปลายทาง — ครอบคลุมเอเชีย (จีน/ญี่ปุ่น/เกาหลี/ASEAN/อินเดีย) · ยุโรป (EU/UK/Switzerland) · อเมริกา (USA/Canada/LATAM) · ตะวันออกกลาง (UAE/Saudi) · ออสเตรเลีย-นิวซีแลนด์ · แอฟริกา ทีมแนะนำเส้นทาง + Incoterm ที่เหมาะกับลูกค้าปลายทางและประเภทสินค้า",
  },
  {
    q: "ใช้ Incoterm ไหนดี?",
    a: "ขึ้นกับข้อตกลงกับลูกค้าปลายทาง — FOB / CFR / CIF ยอดนิยมสำหรับ Sea Freight เพราะแยกความรับผิดชอบที่Port ต้นทาง · DDP เหมาะสำหรับลูกค้าปลายทางที่ต้องการรับของถึงประตูไม่ยุ่งภาษี · EXW ใช้เมื่อผู้ซื้อต้องการคุมการขนส่งทั้งหมดเอง ทีม Pacred ให้คำปรึกษาเลือก Incoterm ตามเงื่อนไขจริง",
  },
  {
    q: "ราคาส่งออกเริ่มต้นเท่าไร?",
    a: "ขึ้นกับช่องทาง (Air/Sea/Express) · ปริมาณ · ปลายทาง · Incoterm — Express courier เริ่ม ~300-500 บาท/kg สำหรับเอกสาร · Sea LCL ~$150-300/CBM · FCL 20' เริ่ม ~$500-1,500 ต่อตู้ตามปลายทาง · Air Freight ~$3-8/kg ทีม quote ให้ก่อนยืนยันเสมอ",
  },
  {
    q: "ใช้เวลากี่วัน?",
    a: "Air Freight: 3-7 วัน · Express courier: 2-5 วัน · Sea Freight (ขึ้นกับปลายทาง) — เอเชีย 7-14 วัน · ออสเตรเลีย 12-18 วัน · ยุโรป 25-35 วัน · อเมริกา 25-40 วัน · แอฟริกา 30-45 วัน รวมเวลา pickup + เคลียร์ + ขนส่ง + เคลียร์ปลายทาง (ถ้า DDP)",
  },
  {
    q: "เอกสารส่งออกที่ต้องเตรียมมีอะไรบ้าง?",
    a: "เอกสารพื้นฐาน — Commercial Invoice + Packing List + B/L หรือ AWB · ใบขนสินค้าขาออก · เอกสารส่งเสริมการส่งออก (Form A/D/E สำหรับลดภาษีปลายทาง) · CO (Certificate of Origin) · กรณีสินค้าเฉพาะ — Phytosanitary (พืช) · Health Certificate (อาหาร) · Fumigation Certificate (สินค้าไม้) ทีม Pacred จัดทำให้ครบ",
  },
  {
    q: "ส่งออกอาหารหรือพืชต้องการใบรับรองอะไร?",
    a: "ส่งออกอาหาร — Health Certificate จาก อย. + Halal (ถ้าตลาดมุสลิม) + Health/Phytosanitary จากกรมประมง (ของทะเล) · ส่งออกพืช-ดอกไม้ — Phytosanitary Certificate จากกรมวิชาการเกษตร · ส่งออกของไม้ — Fumigation Certificate ตามมาตรฐาน ISPM-15 ทีม Pacred ประสานทุกหน่วยงานให้",
  },
  {
    q: "ขอ Form E ลดภาษีนำเข้าในจีนได้มั้ย?",
    a: "ได้ — Pacred ขอ Form E (CO Form E) ภายใต้ FTA ASEAN-China ให้ลูกค้าส่งออกไปจีน Form E ทำให้ลูกค้าปลายทางในจีนได้ลดภาษีนำเข้าตามอัตรา ASEAN-China · ใช้เวลาขอประมาณ 3-5 วันทำการ (ขึ้นกับหน่วยงานออก)",
  },
];

export default async function ExportWorldwidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel = typedLocale === "th" ? "บริการ" : "Services";
  const here = typedLocale === "th" ? "ส่งออกสินค้าทั่วโลก" : "Export worldwide";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            areaServed: ["Worldwide"],
            serviceType: typedLocale === "th" ? "ส่งออก" : "Export",
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
            <li aria-current="page" className="font-bold text-foreground truncate">
              {here}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="relative pt-3 md:pt-5 pb-2 md:pb-4">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
              EXPORT WORLDWIDE · ส่งออกทั่วโลก
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">ส่งออกสินค้าไปทั่วโลก</span> Air · Sea · Express
              <span className="hidden md:inline"> ครบทุก Incoterm</span>
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              บริการส่งออกจากไทยไปทั่วโลก — Air Freight · Sea Freight · Express courier · เอกสารส่งออกครบ (Form A/D/E · CO · Phytosanitary · Fumigation) · เคลียร์พิธีการศุลกากรขาออก · <span className="text-primary-600/80 font-bold">DDP ถึงประตูปลายทาง</span>
            </h2>

            <TrackedExternalLink
              href={LINE_URL}
              cta="line_cta"
              surface={SURFACE}
              ctaProps={{ position: "hero_banner" }}
              aria-label="ทักไลน์ Pacred — ปรึกษาส่งออกฟรี"
              className="group block mt-4 md:mt-6 relative pt-3 md:pt-4 pr-4 md:pr-8 max-w-[1100px] no-underline"
            >
              <span className="absolute top-0 left-3 md:left-5 z-20 inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-white text-[11.5px] md:text-[13px] font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.45)] tracking-tight">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                </span>
                ขอ Quote Export ฟรี
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
                      200+ ประเทศปลายทาง · เอกสารครบ · DDP
                    </p>
                    <p className="hidden md:block mt-1.5 text-[13px] text-white/75 leading-snug">
                      Air · Sea · Express · ทุก Incoterm · เคลียร์ปลายทาง
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
                <span className="shrink-0">🌏</span>
                <span>ส่งออกครบวงจร — Pickup ไทย เคลียร์ขาออก จัดส่งปลายทาง 🇹🇭➡️🌍</span>
              </h3>
              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                Air Freight · Sea Freight FCL/LCL · Express Courier · DDP/DAP/CIF/CFR/FOB/EXW
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

        {/* Modes */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Plane className="w-3.5 h-3.5" strokeWidth={2.6} />
              3 MODES · เลือกได้ตามไทม์ไลน์
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              <span className="text-primary-600">Air · Sea · Express</span> เลือกได้
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.id}
                    className="group relative rounded-2xl border border-border bg-white dark:bg-surface p-5 md:p-6 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_18px_40px_rgba(179,0,0,0.12)] hover:-translate-y-1 transition-all duration-400 overflow-hidden"
                  >
                    <div
                      aria-hidden
                      className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${m.accent} opacity-15 group-hover:opacity-25 transition-opacity duration-400`}
                    />
                    <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-[10px] md:text-[11px] font-black tracking-[0.10em] dark:bg-primary-900/30 dark:text-primary-200">
                      <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
                      {m.badge}
                    </div>
                    <h3 className="relative mt-3 text-[18px] md:text-[20px] font-black text-[#111827] dark:text-white tracking-tight">
                      {m.title}
                    </h3>
                    <p className="relative mt-1.5 text-[12.5px] md:text-[13.5px] leading-[1.6] text-muted font-medium">
                      {m.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Regions */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <MapPin className="w-3.5 h-3.5" strokeWidth={2.6} />
              ALL REGIONS · 200+ ประเทศ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ส่งออกได้ <span className="text-primary-600">ทุกทวีป ทุกตลาด</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
              {REGIONS.map((r) => (
                <div
                  key={r.name}
                  className="rounded-xl border border-border bg-white dark:bg-surface p-3 md:p-4 hover:border-primary-300 dark:hover:border-primary-800 transition-colors"
                >
                  <div className="text-[14px] md:text-[16px] font-black text-[#111827] dark:text-white tracking-tight">
                    {r.name}
                  </div>
                  <p className="mt-1 text-[11px] md:text-[12px] text-muted font-medium leading-snug">
                    {r.sub}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Incoterms */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Anchor className="w-3.5 h-3.5" strokeWidth={2.6} />
              INCOTERMS · ครบทุก Term
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ใช้ได้ <span className="text-primary-600">ทุก Incoterm</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              จาก EXW (ผู้ซื้อรับผิดชอบทุกอย่าง) ถึง DDP (ผู้ขายรับผิดชอบครบถึงประตูปลายทาง)
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {TERMS.map((term) => (
                <div
                  key={term.code}
                  className="rounded-xl border border-border bg-white dark:bg-surface p-4 hover:border-primary-300 dark:hover:border-primary-800 transition-colors"
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center px-2 h-6 rounded-md bg-primary-50 text-primary-700 font-black text-[12.5px] dark:bg-primary-900/30 dark:text-primary-200">
                      {term.code}
                    </span>
                    <span className="text-[11.5px] md:text-[12.5px] text-muted font-bold">
                      {term.name}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] md:text-[13px] text-muted font-medium leading-snug">
                    {term.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Process */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ScanLine className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · ขั้นตอน
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ขั้นตอน <span className="text-primary-600">ส่งออก</span> ง่ายๆ
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
              WHY EXPORT · ทำไม Pacred
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไมเลือก <span className="text-primary-600">Pacred Export</span>
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
              คำถามเกี่ยวกับ <span className="text-primary-600">การส่งออก</span>
            </h2>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "export-worldwide",
                    label: "ส่งออก · พื้นฐาน",
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
