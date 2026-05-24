import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Ship,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Wallet,
  BadgePercent,
  Boxes,
  Users,
  Award,
  FileCheck2,
  Receipt,
  FileBadge,
  Calculator,
  Stamp,
  PackageSearch,
  MessageCircle,
  Phone,
  Home,
  ChevronRight,
  ArrowRight,
  Warehouse,
  Globe2,
  Container,
  ScanLine,
  Languages,
  HandCoins,
  ShoppingBag,
  Sparkles,
  Layers,
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

const SURFACE = "import_china_landing";

const PATH = "/services/import-china";
const NS = "seo.services.importChina";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

const LINE_URL = "/line";
const PHONE_DISPLAY = CONTACT.phoneDisplay;

const SERVICE_SCOPE = [
  "รับสินค้าหน้าโรงงานจีน — กวางโจว · เซินเจิ้น · อี้อู · เซี่ยงไฮ้ · หางโจว",
  "ตรวจ-นับ-แพ็ค-ห่อกันกระแทกที่โกดังจีน ก่อนส่งออก",
  "ขนส่งจีน-ไทย ทาง รถ/เรือ/อากาศ — เลือกตามงบ + ไทม์ไลน์",
  "เคลียร์พิธีการศุลกากรขาเข้า + ชำระภาษี + อากร ครบจบ",
  "ใช้สิทธิ Form E — ลดภาษีนำเข้าผ่าน FTA ASEAN-China",
  "ออกใบกำกับภาษี (ภพ.20) · ใบเสร็จครบทุกรายการ",
  "Door-to-Door — จัดส่งถึงโรงงาน/หน้าร้าน/บ้าน ทั่วประเทศ",
  "ทีมล่ามจีนปิดดีลกับโรงงาน-ซัพพลายเออร์ในนามคุณ",
];

const WHY = [
  {
    icon: Languages,
    title: "ทีมล่ามจีนของเรา",
    desc: "ปิดดีลกับโรงงาน · ต่อรอง · ตรวจสเปก · ไม่ต้องคุยจีนเอง",
  },
  {
    icon: ShieldCheck,
    title: "ตรวจสินค้าก่อนส่ง",
    desc: "นับชิ้น · ถ่ายรูป · ทดสอบเปิดเครื่อง — แจ้งก่อนของออกจากจีน",
  },
  {
    icon: Wallet,
    title: "ราคาชัดเจน ไม่มีบวกแอบ",
    desc: "แจ้ง Total Landed Cost ครบ — ค่าขนส่ง + ภาษี + เคลียร์ในใบเดียว",
  },
  {
    icon: Zap,
    title: "ขนส่งเร็ว ลด lead time",
    desc: "FCL 15-20 วัน · LCL 15-25 วัน · เลือก mode ที่เหมาะกับ order",
  },
  {
    icon: BadgePercent,
    title: "ใช้สิทธิ Form E ทุกครั้ง",
    desc: "ลดภาษีนำเข้าผ่าน FTA จีน-ไทย — ประหยัดได้สูงสุด",
  },
  {
    icon: Receipt,
    title: "ออกใบกำกับภาษีครบ",
    desc: "ภพ.20 · ใบเสร็จ · เอกสารใช้ลดหย่อนนิติบุคคล",
  },
  {
    icon: Users,
    title: "ทีมประจำคุณคนเดียว",
    desc: "ผู้ดูแลเฉพาะรายลูกค้า — ไม่ต้องเล่าใหม่ทุกครั้ง",
  },
  {
    icon: Award,
    title: "ประสบการณ์ 15+ ปี",
    desc: "เคสจริง — สินค้าควบคุม, เครื่องสำอาง, อะไหล่, เครื่องจักร, ผ้า",
  },
];

const STEPS = [
  {
    num: "01",
    icon: MessageCircle,
    title: "ทักไลน์/โทรปรึกษา",
    desc: "แจ้งประเภทสินค้า + ปลายทาง + ปริมาณ — ทีมประเมินขนส่ง + ภาษีให้ก่อน",
  },
  {
    num: "02",
    icon: ShoppingBag,
    title: "ส่ง Invoice + ลิงก์โรงงาน",
    desc: "ส่งให้ทีม — หรือใช้บริการล่ามจีนปิดดีลกับโรงงานในนามคุณ",
  },
  {
    num: "03",
    icon: Warehouse,
    title: "รับของที่โกดังจีน",
    desc: "ตรวจ-นับ-แพ็ค-ถ่ายรูป — แจ้งสถานะให้ทุกขั้น ก่อนส่งออก",
  },
  {
    num: "04",
    icon: Ship,
    title: "ขนส่งจีน-ไทย",
    desc: "เลือกได้ — FCL เหมาตู้ หรือ LCL รวมตู้ ตามปริมาณ + งบ",
  },
  {
    num: "05",
    icon: Stamp,
    title: "เคลียร์ + จัดส่ง",
    desc: "เคลียร์ภาษี + ออกใบขน + ปลดสินค้า + ส่งถึงประตูคุณทั่วประเทศ",
  },
];

const DOCS_NEEDED = [
  { icon: FileCheck2, label: "Invoice", sub: "ใบส่งของจากซัพพลายเออร์จีน" },
  { icon: PackageSearch, label: "Packing List", sub: "รายการบรรจุ · น้ำหนัก · CBM" },
  { icon: FileBadge, label: "ใบอนุญาต (ถ้ามี)", sub: "อย./มอก./สมอ./กสทช." },
  { icon: ScanLine, label: "ลิงก์สินค้า 1688/Taobao", sub: "URL สินค้า · spec · ภาพ" },
];

const TERMS_QUICK = [
  {
    code: "DDP",
    name: "Delivered Duty Paid",
    desc: "ผู้ขายส่งของถึงปลายทางพร้อมเสียภาษี — ลูกค้ารับของอย่างเดียว",
    icon: Globe2,
    popular: true,
  },
  {
    code: "FOB",
    name: "Free On Board",
    desc: "ผู้ขายส่งถึง Port ต้นทาง · ผู้ซื้อจ่ายขนส่ง+ภาษี+เคลียร์ปลายทาง",
    icon: Container,
  },
  {
    code: "EXW",
    name: "Ex Works",
    desc: "ผู้ซื้อรับของหน้าโรงงาน · จ่ายทุกอย่างจนถึงปลายทาง",
    icon: Warehouse,
  },
  {
    code: "CIF",
    name: "Cost · Insurance · Freight",
    desc: "ผู้ขายจ่ายขนส่ง+ประกันถึง Port ปลายทาง · ผู้ซื้อเคลียร์+ภาษี",
    icon: Ship,
  },
];

const FAQ_ITEMS = [
  {
    q: "นำเข้าจากจีน ควรเลือก FCL หรือ LCL?",
    a: "ดูที่ปริมาณสินค้า — ถ้ามากกว่า 15 CBM แนะนำ FCL (เหมาตู้) เพราะคุ้มกว่า · ถ้าน้อยกว่า 15 CBM ใช้ LCL (รวมตู้) จ่ายตาม CBM/KG ที่ใช้จริง · FCL ลด lead time + ต้นทุนต่อหน่วยต่ำสุด · LCL เหมาะกับเริ่มต้นและทดลองตลาด",
  },
  {
    q: "นำเข้าจากจีน Pacred ใช้เวลากี่วัน?",
    a: "ขึ้นกับ mode ที่เลือก — FCL ทางเรือ 15-20 วัน · LCL ทางเรือ 15-25 วัน · ทางอากาศ (Air Freight) 3-5 วัน · ทางรถข้ามแดน 5-7 วัน เวลาที่บอกนับจากของเข้าโกดังจีน ถึงปลายทางในไทย",
  },
  {
    q: "ราคาขนส่งจากจีนคิดยังไง?",
    a: "FCL คิดเป็นต่อตู้ 20'/40'/40HQ — flat rate ไม่ว่าจะใส่เต็มหรือไม่ · LCL คิดตาม CBM (ปริมาตร) หรือ KG (น้ำหนัก) ที่สูงกว่า ทีมแจ้ง Total Landed Cost ครบ (ค่าขนส่ง + ภาษีนำเข้า + VAT + เคลียร์) ในใบเดียวก่อนยืนยัน",
  },
  {
    q: "ต้องเสียภาษีนำเข้าเท่าไร?",
    a: "อัตราภาษีขึ้นกับพิกัด HS Code ของสินค้านั้นๆ — อยู่ในช่วง 0-30% ของมูลค่าสินค้า + ขนส่ง (CIF) ส่วนใหญ่ใช้สิทธิ Form E ภายใต้ FTA ASEAN-China ลดได้สูงสุด 0% สำหรับสินค้าหลายรายการ และ VAT 7% เก็บเพิ่มหลังบวกภาษีนำเข้า",
  },
  {
    q: "Form E คืออะไร · ขอใช้สิทธิยังไง?",
    a: "Form E (Certificate of Origin Form E) คือเอกสารยืนยันว่าสินค้าผลิตในจีน — ใช้ลดภาษีนำเข้าผ่านความตกลง FTA ASEAN-China ทีม Pacred ขอ Form E จากซัพพลายเออร์จีนให้ + ตรวจความถูกต้องก่อนใช้สิทธิ — ไม่เสียค่าใช้จ่ายเพิ่ม",
  },
  {
    q: "นำเข้าจากจีนต้องใช้เอกสารอะไรบ้าง?",
    a: "เอกสารพื้นฐาน — Invoice + Packing List (จากซัพพลายเออร์จีน) · ส่วนเอกสารต่อ Pacred ขอให้ — B/L หรือ AWB · Form E · ใบขนสินค้า · ใบอนุญาตเฉพาะสินค้าควบคุม (อย./มอก./สมอ./กสทช.) ถ้าเข้าข่าย",
  },
  {
    q: "ไม่รู้จีน · ไม่ได้คุยซัพพลายเออร์เอง?",
    a: "ใช้บริการ ฝากสั่งซื้อสินค้าจากจีน (China Shopping) — ทีมล่ามจีน Pacred ปิดดีลกับโรงงาน ตรวจสเปก ตรวจคุณภาพ ในนามคุณ — แค่ส่งลิงก์สินค้า (1688/Taobao/Tmall/Alibaba) มาให้",
  },
  {
    q: "สินค้าควบคุม เช่น เครื่องสำอาง อาหารเสริม เข้าได้มั้ย?",
    a: "ได้ — แต่ต้องมีใบอนุญาต อย. ก่อนนำเข้า ทีม Pacred ช่วยจัดทำเอกสาร · ประสานกับ อย./มอก./สมอ./กสทช./กรมเกษตร · ตรวจ HS Code · เตรียมข้อมูลสำหรับยื่นขอใบอนุญาต ใช้เวลาเตรียมประมาณ 7-30 วัน ขึ้นอยู่กับประเภทสินค้า",
  },
];

export default async function ImportChinaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel = typedLocale === "th" ? "บริการ" : "Services";
  const here = typedLocale === "th" ? "นำเข้าสินค้าจากจีน" : "Import from China";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType:
              typedLocale === "th" ? "นำเข้าสินค้าจากจีน" : "Import from China",
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

        {/* ─── Breadcrumb ─── */}
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
            <li aria-current="page" className="font-bold text-foreground truncate">
              {here}
            </li>
          </ol>
        </nav>

        {/* ═══════ 1. Hero ═══════ */}
        <section className="relative pt-3 md:pt-5 pb-2 md:pb-4">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              IMPORT FROM CHINA · นำเข้าสินค้าจากจีน
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">นำเข้าสินค้าจากจีน</span> ครบวงจร FCL · LCL
              <span className="hidden md:inline"> ทุก Term ทุก Port</span>
            </h1>

            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              บริการนำเข้าสินค้าจากจีนแบบมืออาชีพ — รับสินค้าหน้าโรงงาน · ขนส่งจีน-ไทย FCL/LCL · เคลียร์ภาษีศุลกากร · ใช้สิทธิ Form E · Door-to-Door ทั่วประเทศ — <span className="text-primary-600/80 font-bold">FCL เริ่ม $500/ตู้ · LCL เริ่ม $150/CBM · ทีมล่ามจีนปิดดีลในนามคุณ</span>
            </h2>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            {/* Primary CTA row — "ใช้บริการ" (register) + "ปรึกษาฟรี" (LINE) */}
            <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[640px]">
              <Link
                href="/register"
                aria-label="ใช้บริการนำเข้าจีน — สมัครฟรี"
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

            {/* Service scope card — checklist */}
            <div className="mt-5 md:mt-7 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <span className="shrink-0">🇨🇳</span>
                <span>บริการนำเข้าจากจีนครบวงจร — รับของจีน เคลียร์ไทย ส่งถึงประตู</span>
              </h3>
              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                กวางโจว · เซินเจิ้น · อี้อู · เซี่ยงไฮ้ · หางโจว · เทียนจิน · ชิงเต่า
              </p>
              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[12.5px] md:text-[14px] leading-snug text-foreground/85">
                {SERVICE_SCOPE.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2
                      className="w-4 h-4 md:w-[18px] md:h-[18px] mt-0.5 shrink-0 text-primary-600"
                      strokeWidth={2.6}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {/* Phone + LINE row */}
              <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TrackedPhoneLink
                  phone={CONTACT.phone}
                  cta="phone_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 font-black text-[14px] md:text-[15px] hover:bg-primary-100 hover:border-primary-300 transition-colors dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-200"
                >
                  <Phone className="w-4 h-4" strokeWidth={2.6} />
                  โทร {PHONE_DISPLAY}
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

        {/* ═══════ 2. MODE PICKER — FCL spotlight + LCL ═══════
             FCL = bigger card on the left (spotlight per ปอน — wants FCL ahead of LCL).
             OurService glossy 3D button style — chunky drop shadow + top sheen + edge rim.
             Each card links to the deep-dive sub-page. */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Layers className="w-3.5 h-3.5" strokeWidth={2.6} />
              เลือก MODE · FCL vs LCL
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เลือกแบบ <span className="text-primary-600">FCL เหมาตู้</span> หรือ <span className="text-primary-600">LCL รวมตู้</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ปริมาณมาก = FCL เหมาตู้คุ้มที่สุด · เริ่มต้นไม่กี่กล่อง = LCL จ่ายตาม CBM ที่ใช้
            </p>

            {/* 2-card grid — desktop: FCL spans 3, LCL spans 2 (glossy 3D button style from OurService) */}
            <div className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-5">
              {/* ── FCL — spotlight (bigger, left, gradient red) ── */}
              <Link
                href="/services/import-china-fcl"
                aria-label="ดูรายละเอียดบริการ FCL — Full Container Load จีน-ไทย"
                data-cta="mode-fcl"
                className={[
                  "group relative overflow-hidden isolate bg-white col-span-1 md:col-span-3",
                  "h-[260px] md:h-[340px] rounded-[18px] md:rounded-[26px]",
                  // Glossy 3D — same recipe as OurService
                  "shadow-[0_2px_3px_rgba(15,23,42,0.12),0_6px_14px_rgba(15,23,42,0.16),0_18px_38px_rgba(15,23,42,0.22),0_30px_60px_rgba(15,23,42,0.18),inset_0_1.5px_0_rgba(255,255,255,1),inset_0_-3px_0_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.35)]",
                  "border border-black/[0.14]",
                  "transition-[transform,box-shadow] duration-300 ease-out will-change-transform",
                  "hover:-translate-y-2.5 hover:shadow-[0_3px_5px_rgba(15,23,42,0.14),0_12px_24px_rgba(15,23,42,0.18),0_28px_54px_rgba(15,23,42,0.26),0_44px_80px_rgba(15,23,42,0.22),inset_0_2px_0_rgba(255,255,255,1),inset_0_-3px_0_rgba(0,0,0,0.22),inset_0_0_0_1px_rgba(255,255,255,0.5)]",
                  "active:translate-y-0.5 active:duration-75",
                ].join(" ")}
              >
                {/* Background image */}
                <div
                  className="absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat transition-transform duration-500 ease-out group-hover:scale-[1.035]"
                  style={{ backgroundImage: "url('/images/hero-section/banner/ship.png')" }}
                />
                {/* Red gradient overlay */}
                <div className="absolute inset-0 z-[2] bg-gradient-to-br from-primary-600/85 via-primary-700/75 to-primary-900/85" />
                {/* Glossy top sheen */}
                <div
                  className="absolute inset-x-0 top-0 z-[4] pointer-events-none rounded-t-[inherit]"
                  style={{
                    height: "58%",
                    background:
                      "linear-gradient(to bottom, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.04) 85%, transparent 100%)",
                  }}
                />
                {/* Shine sweep */}
                <div
                  className="absolute -inset-[45%] z-[3] pointer-events-none -translate-x-[65%] rotate-[8deg] transition-transform duration-[650ms] group-hover:translate-x-[65%]"
                  style={{ background: "linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.22) 50%, transparent 64%)" }}
                />

                {/* Content */}
                <div className="relative z-[5] h-full flex flex-col justify-between p-5 md:p-7">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-300 text-primary-800 text-[10.5px] md:text-[12px] font-black tracking-[0.10em] shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
                      <Container className="w-3.5 h-3.5" strokeWidth={2.8} />
                      ยอดนิยม · FCL
                    </div>
                    <h3 className="mt-3 md:mt-4 text-[26px] md:text-[42px] font-black text-white leading-[1.05] tracking-[-0.025em] drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
                      FCL <span className="text-yellow-300">เหมาตู้</span>
                    </h3>
                    <p className="mt-1 md:mt-2 text-[14px] md:text-[18px] font-extrabold text-white/95 leading-snug drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
                      20{"'"} · 40{"'"} · 40HQ · Door-to-Door ทุก Term
                    </p>
                    <ul className="mt-3 md:mt-4 hidden md:flex flex-col gap-1.5 text-[13.5px] font-bold text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
                      {[
                        "ต้นทุนต่อหน่วยต่ำสุด — Order ใหญ่คุ้มสุด",
                        "ลำเลียงตู้ตรง · ไม่ต้องรอรวมตู้",
                        "Cross-dock 20'/40'/40HQ · Reefer (อาหารแช่เย็น) ก็ได้",
                      ].map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-yellow-300" strokeWidth={2.8} />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-2 self-start px-4 py-2.5 rounded-xl bg-white text-primary-700 font-black text-[13px] md:text-[15px] shadow-[0_6px_16px_rgba(0,0,0,0.25)] group-hover:translate-x-1 transition-transform">
                    ดูรายละเอียด FCL
                    <ArrowRight className="w-4 h-4" strokeWidth={2.8} />
                  </div>
                </div>
              </Link>

              {/* ── LCL — smaller, right, secondary ── */}
              <Link
                href="/services/import-china-lcl"
                aria-label="ดูรายละเอียดบริการ LCL — Less Container Load จีน-ไทย"
                data-cta="mode-lcl"
                className={[
                  "group relative overflow-hidden isolate bg-white col-span-1 md:col-span-2",
                  "h-[220px] md:h-[340px] rounded-[18px] md:rounded-[26px]",
                  "shadow-[0_2px_3px_rgba(15,23,42,0.12),0_6px_14px_rgba(15,23,42,0.16),0_18px_38px_rgba(15,23,42,0.22),0_30px_60px_rgba(15,23,42,0.18),inset_0_1.5px_0_rgba(255,255,255,1),inset_0_-3px_0_rgba(0,0,0,0.18),inset_0_0_0_1px_rgba(255,255,255,0.35)]",
                  "border border-black/[0.14]",
                  "transition-[transform,box-shadow] duration-300 ease-out will-change-transform",
                  "hover:-translate-y-2.5 hover:shadow-[0_3px_5px_rgba(15,23,42,0.14),0_12px_24px_rgba(15,23,42,0.18),0_28px_54px_rgba(15,23,42,0.26),0_44px_80px_rgba(15,23,42,0.22),inset_0_2px_0_rgba(255,255,255,1),inset_0_-3px_0_rgba(0,0,0,0.22),inset_0_0_0_1px_rgba(255,255,255,0.5)]",
                  "active:translate-y-0.5 active:duration-75",
                ].join(" ")}
              >
                <div
                  className="absolute inset-0 z-[1] bg-cover bg-center bg-no-repeat transition-transform duration-500 ease-out group-hover:scale-[1.035]"
                  style={{ backgroundImage: "url('/images/hero-section/banner/airbanner.png')" }}
                />
                {/* Emerald gradient overlay — keeps it visually distinct from FCL red */}
                <div className="absolute inset-0 z-[2] bg-gradient-to-br from-emerald-700/85 via-emerald-800/75 to-slate-900/85" />
                <div
                  className="absolute inset-x-0 top-0 z-[4] pointer-events-none rounded-t-[inherit]"
                  style={{
                    height: "58%",
                    background:
                      "linear-gradient(to bottom, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.04) 85%, transparent 100%)",
                  }}
                />
                <div
                  className="absolute -inset-[45%] z-[3] pointer-events-none -translate-x-[65%] rotate-[8deg] transition-transform duration-[650ms] group-hover:translate-x-[65%]"
                  style={{ background: "linear-gradient(115deg, transparent 36%, rgba(255,255,255,0.22) 50%, transparent 64%)" }}
                />

                <div className="relative z-[5] h-full flex flex-col justify-between p-5 md:p-6">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 text-emerald-800 text-[10.5px] md:text-[12px] font-black tracking-[0.10em] shadow-[0_4px_12px_rgba(0,0,0,0.20)]">
                      <Boxes className="w-3.5 h-3.5" strokeWidth={2.8} />
                      เริ่มต้น · LCL
                    </div>
                    <h3 className="mt-3 md:mt-4 text-[22px] md:text-[34px] font-black text-white leading-[1.05] tracking-[-0.025em] drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]">
                      LCL <span className="text-yellow-300">รวมตู้</span>
                    </h3>
                    <p className="mt-1 md:mt-2 text-[13px] md:text-[16px] font-extrabold text-white/95 leading-snug drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
                      จ่ายตาม CBM/KG · เริ่มไม่กี่กล่อง
                    </p>
                    <ul className="mt-3 md:mt-4 hidden md:flex flex-col gap-1.5 text-[12.5px] font-bold text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
                      {[
                        "ไม่ต้องเหมาตู้ — Order เล็กก็เริ่มได้",
                        "พักของฟรี 14 วันที่โกดังจีน",
                      ].map((b) => (
                        <li key={b} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-yellow-300" strokeWidth={2.8} />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-2 self-start px-3.5 py-2.5 rounded-xl bg-white text-emerald-800 font-black text-[12.5px] md:text-[14px] shadow-[0_6px_16px_rgba(0,0,0,0.25)] group-hover:translate-x-1 transition-transform">
                    ดูรายละเอียด LCL
                    <ArrowRight className="w-4 h-4" strokeWidth={2.8} />
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Sales contact ─── */}
        <ContactSales hideAssuranceStrip />

        {/* ═══════ 3. Why Pacred ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY PACRED · ทำไมต้องเรา
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไม <span className="text-primary-600">ผู้นำเข้ามือใหม่</span> เลือก Pacred
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              เร็ว ไว ไม่มีคำว่าทำไม่ได้ — เริ่มจาก 0 ก็ปิดดีลโรงงานจีนได้ไม่ต้องคุยจีนเอง
            </p>

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

        {/* ═══════ 4. Process ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Calculator className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · 5 ขั้น จบ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ขั้นตอน <span className="text-primary-600">นำเข้าจากจีน</span> ง่ายๆ ใน 5 ขั้น
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

        {/* ═══════ 5. Documents needed + Terms ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5 grid md:grid-cols-2 gap-6 md:gap-8">
            {/* Documents */}
            <div>
              <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
                <FileCheck2 className="w-3.5 h-3.5" strokeWidth={2.6} />
                DOCS · เอกสาร
              </div>
              <h2 className="text-[20px] md:text-[28px] leading-[1.18] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
                เอกสารที่ต้องเตรียม
              </h2>
              <p className="mt-2 text-[12.5px] md:text-[14px] text-muted font-medium">
                ไม่มีเอกสารครบ? ไม่เป็นไร — Pacred ช่วยขอจากซัพพลายเออร์จีนให้
              </p>

              <ul className="mt-4 space-y-2.5">
                {DOCS_NEEDED.map((d) => {
                  const Icon = d.icon;
                  return (
                    <li
                      key={d.label}
                      className="flex items-center gap-3 rounded-xl border border-border bg-white dark:bg-surface p-3"
                    >
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600 shrink-0 dark:bg-primary-900/30 dark:text-primary-300">
                        <Icon className="w-4.5 h-4.5" strokeWidth={2.4} />
                      </span>
                      <div>
                        <div className="text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
                          {d.label}
                        </div>
                        <div className="text-[11.5px] md:text-[12.5px] text-muted font-medium leading-snug">
                          {d.sub}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Terms quick reference */}
            <div>
              <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
                <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
                INCOTERMS · เทอมขนส่ง
              </div>
              <h2 className="text-[20px] md:text-[28px] leading-[1.18] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
                Term ไหนเหมาะกับคุณ?
              </h2>
              <p className="mt-2 text-[12.5px] md:text-[14px] text-muted font-medium">
                DDP คือทางเลือกที่ลูกค้ามือใหม่ใช้บ่อยที่สุด — ลูกค้ารับของอย่างเดียว
              </p>

              <ul className="mt-4 space-y-2.5">
                {TERMS_QUICK.map((term) => {
                  const Icon = term.icon;
                  return (
                    <li
                      key={term.code}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${
                        term.popular
                          ? "border-primary-300 bg-primary-50/50 dark:bg-primary-900/15 dark:border-primary-800"
                          : "border-border bg-white dark:bg-surface"
                      }`}
                    >
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600 shrink-0 dark:bg-primary-900/30 dark:text-primary-300">
                        <Icon className="w-4.5 h-4.5" strokeWidth={2.4} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
                            {term.code}
                          </span>
                          {term.popular && (
                            <span className="inline-flex items-center px-1.5 h-[18px] rounded-md bg-primary-600 text-white text-[9.5px] font-black tracking-wide">
                              ยอดนิยม
                            </span>
                          )}
                          <span className="text-[10.5px] md:text-[11.5px] text-muted font-bold">
                            {term.name}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11.5px] md:text-[12.5px] text-muted font-medium leading-snug">
                          {term.desc}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* ─── Reviews — filtered to import service ─── */}
        <Reviews defaultFilter="import" />

        {/* ═══════ 6. FAQ ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <HandCoins className="w-3.5 h-3.5" strokeWidth={2.6} />
              FAQ · คำถามที่พบบ่อย
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              คำถามที่ <span className="text-primary-600">มือใหม่</span> ถามบ่อย
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted">
              ไม่เจอคำตอบ? ทักไลน์ Pacred — ทีมตอบไว 5 นาที
            </p>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "import-china",
                    label: "นำเข้าจากจีน · พื้นฐาน",
                    items: FAQ_ITEMS,
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* ═══════ Final CTA banner — "ใช้บริการ" + "ปรึกษาฟรี" ═══════ */}
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
                  พร้อมเริ่มนำเข้าจากจีน?
                </p>
                <h3 className="text-[24px] md:text-[40px] font-black leading-[1.1] tracking-tight drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]">
                  เร็ว ไว ไม่มีคำว่าทำไม่ได้ — ทีม Pacred พร้อมดูแลคุณ
                </h3>
                <p className="mt-2 md:mt-3 text-[14px] md:text-[16px] font-bold text-white/95 leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
                  สมัครฟรี ไม่มีเงื่อนไข — หรือทักไลน์ปรึกษาก่อนได้ ตอบไวใน 5 นาที
                </p>

                <div className="mt-5 md:mt-6 flex flex-col sm:flex-row gap-3 max-w-[640px]">
                  <Link
                    href="/register"
                    aria-label="ใช้บริการนำเข้าจีน — สมัครฟรี"
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
