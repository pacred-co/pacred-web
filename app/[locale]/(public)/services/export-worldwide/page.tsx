import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Plane,
  Ship,
  Container,
  CheckCircle2,
  ShieldCheck,
  Wallet,
  Calculator,
  Stamp,
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
  Anchor,
  ShieldQuestion,
  ScanLine,
  MapPin,
  Award,
  Briefcase,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { Reviews } from "@/components/sections/reviews";
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

export const dynamic = "force-dynamic";

const SURFACE = "export_worldwide_landing";
const PATH = "/services/export-worldwide";
const NS = "seo.services.exportWorldwide";
const LINE_URL = "/line";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS, ogKey: "export-worldwide" });
}

const MODES = [
  {
    id: "air",
    icon: Plane,
    badge: "AIR FREIGHT",
    title: "ส่งออกทางอากาศ",
    price: "เริ่ม $3-8 / kg",
    desc: "Air Freight สุวรรณภูมิ/ดอนเมือง · 3-7 วันถึงปลายทาง · เหมาะสินค้ามีค่า รีบใช้ อาหารสด",
    accent: "from-sky-500 to-sky-700",
  },
  {
    id: "sea",
    icon: Ship,
    badge: "SEA FREIGHT",
    title: "ส่งออกทางเรือ",
    price: "FCL $500-1,500 · LCL $150-300/CBM",
    desc: "FCL 20'/40' · LCL · จากแหลมฉบัง/คลองเตย · 15-45 วัน · เหมาะสินค้าปริมาณมาก",
    accent: "from-blue-600 to-blue-800",
  },
  {
    id: "express",
    icon: Container,
    badge: "EXPRESS COURIER",
    title: "ส่งด่วน DHL/FedEx/UPS",
    price: "เริ่ม 300 บาท/kg",
    desc: "DHL · FedEx · UPS · TNT · 2-5 วันถึงปลายทาง · เหมาะเอกสาร ตัวอย่าง พัสดุเล็ก",
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
  "Booking สายเรือ/สายการบิน · ยื่นใบขนสินค้าขาออก",
  "เคลียร์พิธีการศุลกากรขาออก ครบทุกใบ",
  "ขอ Form A · Form D · Form E · CO ทั่วไป (ลดภาษีปลายทาง)",
  "ฟูมิเกชัน + ใบรับรองสุขอนามัยพืช (Phytosanitary)",
  "Track ปลายทาง + เคลียร์ปลายทาง (ถ้าต้องการ DDP)",
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
  { num: "02", icon: Calculator, title: "Quote ค่าใช้จ่าย", desc: "ค่าขนส่ง + เอกสาร + เคลียร์ + ประกัน รวมในใบเดียว" },
  { num: "03", icon: FileCheck2, title: "จัดเตรียมเอกสาร", desc: "Invoice · Packing · Form A/D/E · CO · ใบขนสินค้าขาออก" },
  { num: "04", icon: PackageSearch, title: "Pickup + บรรจุ", desc: "รับของจากโรงงาน · บรรจุมาตรฐานส่งออก · ลำเลียงสู่ Port" },
  { num: "05", icon: Stamp, title: "เคลียร์ + ส่ง", desc: "เคลียร์ขาออก · Booking · Track จนถึงปลายทาง" },
];

const WHY = [
  { icon: Globe2, title: "ส่งได้ทั่วโลก", desc: "200+ ประเทศปลายทาง · พาร์ทเนอร์ครบทุกทวีป" },
  { icon: ShieldCheck, title: "Shipping License ครบ", desc: "ตัวแทนออกของถูกกฎหมาย · ออกใบขนสินค้าได้" },
  { icon: FileCheck2, title: "เอกสารครบทุกประเภท", desc: "Form A/D/E · CO · Phytosanitary · Fumigation" },
  { icon: Wallet, title: "Total Cost ชัดเจน", desc: "Quote ครบ ไม่บวกแอบ · แจ้งก่อนยืนยัน" },
  { icon: ShieldQuestion, title: "Cargo Insurance", desc: "ประกันสินค้าระหว่างขนส่ง · เคลมได้จริง" },
  { icon: Award, title: "ประสบการณ์ 15+ ปี", desc: "เคสจริง FCL/LCL/Air/Express ครบทุกตลาด" },
];

const FAQ_ITEMS = [
  {
    q: "ส่งออกได้ประเทศไหนบ้าง?",
    a: "Pacred ส่งออกได้ทั่วโลก 200+ ประเทศปลายทาง — ครอบคลุมเอเชีย (จีน/ญี่ปุ่น/เกาหลี/ASEAN/อินเดีย) · ยุโรป (EU/UK/Switzerland) · อเมริกา (USA/Canada/LATAM) · ตะวันออกกลาง (UAE/Saudi) · ออสเตรเลีย-นิวซีแลนด์ · แอฟริกา ทีมแนะนำเส้นทาง + Incoterm ที่เหมาะกับลูกค้าปลายทางและประเภทสินค้า",
  },
  {
    q: "ใช้ Incoterm ไหนดี?",
    a: "ขึ้นกับข้อตกลงกับลูกค้าปลายทาง — FOB / CFR / CIF ยอดนิยมสำหรับ Sea Freight · DDP เหมาะลูกค้าปลายทางที่ต้องการรับของถึงประตูไม่ยุ่งภาษี · EXW ใช้เมื่อผู้ซื้อต้องการคุมการขนส่งทั้งหมดเอง ทีม Pacred ให้คำปรึกษาเลือก Incoterm ตามเงื่อนไขจริง",
  },
  {
    q: "ราคาส่งออกเริ่มต้นเท่าไร?",
    a: "ขึ้นกับช่องทาง (Air/Sea/Express) · ปริมาณ · ปลายทาง · Incoterm — Express courier เริ่ม ~300-500 บาท/kg สำหรับเอกสาร · Sea LCL ~$150-300/CBM · FCL 20' เริ่ม ~$500-1,500 ต่อตู้ตามปลายทาง · Air Freight ~$3-8/kg ทีม Quote ให้ก่อนยืนยันเสมอ",
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
    a: "ได้ — Pacred ขอ Form E (CO Form E) ภายใต้ FTA ASEAN-China ให้ลูกค้าส่งออกไปจีน · ลูกค้าปลายทางในจีนได้ลดภาษีนำเข้าตามอัตรา ASEAN-China · ใช้เวลาขอประมาณ 3-5 วันทำการ",
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
  const tp = await getTranslations({ locale, namespace: "svcExportWorldwide" });
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
      <SearchBar hideOnMobile defaultCollapsed />
      <main>
        <BookingCalculator landing="sea" />

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
              <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
              EXPORT WORLDWIDE · {tp("heroEyebrow")}
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">{tp("heroH1Highlight")}</span> {tp("heroH1Rest")}
              <span className="md:block md:mt-1"> {tp("heroH1Sub")}</span>
            </h1>
            <p className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              {tp("heroDesc")} <span className="text-primary-600/80 font-bold">{tp("heroDescHighlight")}</span>
            </p>

            {/* 2 primary CTAs */}
            <div className="mt-4 md:mt-5 grid grid-cols-2 gap-2 md:gap-3 max-w-[560px]">
              <Link
                href="/register"
                aria-label={tp("ctaUseServiceAriaLabel")}
                className="inline-flex items-center justify-center gap-2 h-12 md:h-14 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[16px] hover:bg-primary-700 hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(179,0,0,0.30)]"
              >
                {tp("ctaUseService")}
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.8} />
              </Link>
              <TrackedExternalLink
                href={LINE_URL}
                cta="line_consult"
                surface={SURFACE}
                ctaProps={{ position: "hero_cta" }}
                aria-label={tp("ctaConsultAriaLabel")}
                className="inline-flex items-center justify-center gap-2 h-12 md:h-14 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[16px] hover:bg-[#05B04C] hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(6,199,85,0.35)]"
              >
                <MessageCircle className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.6} />
                {tp("ctaConsult")}
              </TrackedExternalLink>
            </div>

            {/* Service scope highlights — themed card */}
            <div className="mt-5 md:mt-7 rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-800/60 bg-gradient-to-br from-primary-50/60 via-white to-primary-50/30 dark:from-primary-900/15 dark:via-surface dark:to-primary-900/10 p-4 md:p-6 shadow-[0_8px_22px_rgba(179,0,0,0.06)]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <Globe2 className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" strokeWidth={2.6} />
                <span>{tp("scopeCardTitle")}</span>
              </h3>
              <p className="mt-2 text-[12.5px] md:text-[14px] font-bold text-foreground/85 leading-relaxed">
                Air Freight · Sea Freight FCL/LCL · Express Courier · DDP/DAP/CIF/CFR/FOB/EXW
              </p>
              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[13px] md:text-[15px] leading-snug text-foreground/95">
                {SCOPE.map((item, idx) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 md:w-[18px] md:h-[18px] mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                    <span>{tp(`scope${idx}` as Parameters<typeof tp>[0])}</span>
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
                  {tp("callPrefix")} {CONTACT.phoneDisplay}
                </TrackedPhoneLink>
                <TrackedExternalLink
                  href={LINE_OA.shortUrl}
                  cta="line_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                  {tp("addLine")}
                </TrackedExternalLink>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ 2. 3 modes — Air / Sea / Express ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Plane className="w-3.5 h-3.5" strokeWidth={2.6} />
              3 MODES · {tp("modesEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("modesH2")} <span className="text-primary-600">Air · Sea · Express</span> {tp("modesH2Suffix")}
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("modesDesc")}
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.id}
                    className="group relative rounded-2xl border border-border bg-gradient-to-br from-white to-primary-50/30 dark:from-surface dark:to-primary-900/10 p-5 md:p-6 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_18px_40px_rgba(179,0,0,0.12)] hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                  >
                    <div
                      aria-hidden
                      className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${m.accent} opacity-15 group-hover:opacity-25 transition-opacity duration-400`}
                    />
                    <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-[11px] md:text-[11px] font-black tracking-[0.10em] dark:bg-primary-900/30 dark:text-primary-200">
                      <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
                      {m.badge}
                    </div>
                    <h3 className="relative mt-3 text-[18px] md:text-[20px] font-black text-[#111827] dark:text-white tracking-tight">
                      {tp(`mode_${m.id}_title` as Parameters<typeof tp>[0])}
                    </h3>
                    <p className="relative mt-1 text-[13px] md:text-[14px] font-black text-primary-600">
                      {tp(`mode_${m.id}_price` as Parameters<typeof tp>[0])}
                    </p>
                    <p className="relative mt-1.5 text-[12.5px] md:text-[13.5px] leading-[1.6] text-muted font-medium">
                      {tp(`mode_${m.id}_desc` as Parameters<typeof tp>[0])}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 3. Regions ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <MapPin className="w-3.5 h-3.5" strokeWidth={2.6} />
              {tp("regionsEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("regionsH2")} <span className="text-primary-600">{tp("regionsH2Highlight")}</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
              {REGIONS.map((r, idx) => (
                <div
                  key={r.name}
                  className="rounded-xl border border-border bg-white dark:bg-surface p-3 md:p-4 hover:border-primary-300 dark:hover:border-primary-800 transition-colors"
                >
                  <div className="text-[14px] md:text-[16px] font-black text-[#111827] dark:text-white tracking-tight">
                    {tp(`region${idx}Name` as Parameters<typeof tp>[0])}
                  </div>
                  <p className="mt-1 text-[11.5px] md:text-[12.5px] text-muted font-medium leading-snug">
                    {r.sub}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ 4. Incoterms ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Anchor className="w-3.5 h-3.5" strokeWidth={2.6} />
              INCOTERMS · {tp("incotermsEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("incotermsH2")} <span className="text-primary-600">{tp("incotermsH2Highlight")}</span> {tp("incotermsH2Suffix")}
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("incotermsDesc")}
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
                    {tp(`term_${term.code}_desc` as Parameters<typeof tp>[0])}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Sales contact ─── */}
        <ContactSales hideAssuranceStrip compact />

        {/* ═══════ 5. Process — 5 steps ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ScanLine className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · {tp("stepsEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("stepsH2")} <span className="text-primary-600">{tp("stepsH2Highlight")}</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {tp("stepsDesc")}
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {STEPS.map((s) => {
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
                      {tp(`step_${s.num}_title` as Parameters<typeof tp>[0])}
                    </h3>
                    <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                      {tp(`step_${s.num}_desc` as Parameters<typeof tp>[0])}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Reviews — default to export filter ─── */}
        <Reviews defaultFilter="export" />

        {/* ═══════ 6. Why Pacred ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY EXPORT WITH PACRED · 15+ YEARS
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("whyH2")} <span className="text-primary-600">Pacred Export</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {WHY.map((w, idx) => {
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
                      {tp(`why_${idx}_title` as Parameters<typeof tp>[0])}
                    </div>
                    <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {tp(`why_${idx}_desc` as Parameters<typeof tp>[0])}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 7. FAQ ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-6 md:pb-10">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <HandCoins className="w-3.5 h-3.5" strokeWidth={2.6} />
              FAQ · {tp("faqEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tp("faqH2")} <span className="text-primary-600">{tp("faqH2Highlight")}</span>
            </h2>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "export-worldwide",
                    label: tp("faqGroupLabel"),
                    items: FAQ_ITEMS.map((item, idx) => ({
                      q: tp(`faq${idx}Q` as Parameters<typeof tp>[0]),
                      a: tp(`faq${idx}A` as Parameters<typeof tp>[0]),
                    })),
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* ═══════ 8. Final CTA banner ═══════ */}
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
                      EXPORT GUARANTEE
                    </div>
                    <p className="text-[24px] md:text-[40px] font-black text-white leading-[1.05] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.45)]">
                      {tp("finalCtaHeadline")} <span className="text-yellow-300">{tp("finalCtaHighlight")}</span> {tp("finalCtaHeadlineSuffix")}
                    </p>
                    <p className="hidden md:block mt-2 text-[14px] font-semibold text-white/90 leading-snug">
                      {tp("finalCtaSub")}
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

            {/* Hidden eyebrow icon for layout sanity */}
            <div className="hidden">
              <Briefcase />
            </div>
          </div>
        </section>
      </main>
      <ImportExportBanner />
      <Footer />
    </>
  );
}
