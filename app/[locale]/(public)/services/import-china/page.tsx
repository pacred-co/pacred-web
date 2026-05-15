import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  Plane,
  Ship,
  Truck,
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
  MapPin,
  Home,
  ChevronRight,
  ArrowRight,
  Anchor,
  Warehouse,
  Globe2,
  Container,
  ScanLine,
  Languages,
  HandCoins,
  ShoppingBag,
  Sparkles,
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

const SURFACE = "services_import_china";

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

type Mode = {
  id: "fcl" | "lcl" | "cargo";
  icon: typeof Ship;
  badge: string;
  title: string;
  subtitle: string;
  intro: string;
  image: string;
  imageAlt: string;
  accent: string;
  forItems: string[];
  highlights: string[];
  href: string;
  cta: string;
};

const MODES: Mode[] = [
  {
    id: "fcl",
    icon: Container,
    badge: "FCL · เหมาตู้",
    title: "FCL — Full Container Load",
    subtitle: "เหมาตู้ 20'/40'/40HQ จากโรงงานจีน",
    intro:
      "สำหรับคำสั่งซื้อปริมาณมาก เหมาตู้คุ้มที่สุด รับสินค้าหน้าโรงงาน · ลำเลียงตู้ตรงสู่ท่าเรือไทย · เคลียร์ภาษีครบ Term EXW / FOB / CIF / DDP",
    image: "/images/hero-section/banner/ship.png",
    imageAlt: "นำเข้า FCL จากจีน Pacred",
    accent: "from-blue-600 to-blue-800",
    forItems: [
      "สั่งโรงงานจีนปริมาณเต็มตู้ — ต้นทุนต่อหน่วยถูกที่สุด",
      "Cross-dock 20' / 40' / 40HQ · รับโรงงาน ปลายทางคลังไทย",
      "ครบทุก Incoterm — EXW / FOB / CIF / DDP",
    ],
    highlights: ["20'/40'/40HQ", "Door-to-Door", "ทุก Term"],
    href: "/services/import-china-fcl",
    cta: "ดูรายละเอียด FCL",
  },
  {
    id: "lcl",
    icon: Boxes,
    badge: "LCL · รวมตู้",
    title: "LCL — Less Container Load",
    subtitle: "รวมตู้ จ่ายตาม CBM · เหมาะกับงานเริ่มต้น",
    intro:
      "รวมตู้กับลูกค้ารายอื่น — จ่ายตามปริมาตร CBM หรือ KG ที่สูงกว่า เริ่มไม่กี่กล่องก็ได้ ระบบจัดการที่โกดังกวางโจว/เซินเจิ้น/อี้อู ครบจบ",
    image: "/images/hero-section/banner/airbanner.png",
    imageAlt: "นำเข้า LCL จากจีน Pacred",
    accent: "from-emerald-600 to-emerald-800",
    forItems: [
      "เริ่มต้นไม่กี่กล่อง — ไม่ต้องเหมาตู้",
      "พักของที่โกดังจีนรอรวมส่ง",
      "Total Landed Cost คุมได้ง่าย — แจ้งราคาก่อนยืนยัน",
    ],
    highlights: ["จ่ายตาม CBM/KG", "Door-to-Door", "เริ่มไม่กี่กล่อง"],
    href: "/services/import-china-lcl",
    cta: "ดูรายละเอียด LCL",
  },
  {
    id: "cargo",
    icon: Truck,
    badge: "CARGO · จีน-ไทย",
    title: "Cargo จีน-ไทย — รถ/เรือ/แอร์",
    subtitle: "ขนส่งทุกรูปแบบ · เลือกตามไทม์ไลน์",
    intro:
      "ฝากนำเข้าสินค้าจากจีนทุกประเภท — เลือกได้ทั้งทางรถ (ด่านชายแดน), ทางเรือ (LCL/FCL คลองเตย/แหลมฉบัง), หรือทางอากาศ (สุวรรณภูมิ/ดอนเมือง) ตามความเร่งด่วน",
    image: "/images/hero-section/banner/car.png",
    imageAlt: "Cargo จีน-ไทย Pacred",
    accent: "from-primary-500 to-primary-700",
    forItems: [
      "รถ 5-7 วัน · เรือ 12-15 วัน · แอร์ 3-5 วัน",
      "เคลียร์ภาษีครบ — Form E ลดภาษีนำเข้าได้",
      "ติดตามสถานะแบบ real-time",
    ],
    highlights: ["รถ/เรือ/แอร์", "ติดตามเรียลไทม์", "Form E"],
    href: "/services/import-china-fcl",
    cta: "ปรึกษาฟรี",
  },
];

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
    desc: "แอร์ 3-5 วัน · LCL 12-15 วัน · FCL 15-20 วัน — ลดสต๊อกแขวน",
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
    desc: "เลือกได้ — รถ/เรือ/แอร์ ตามงบ + ไทม์ไลน์ที่ต้องการ",
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
    desc: "ผู้ขายส่งถึงท่าเรือต้นทาง · ผู้ซื้อจ่ายขนส่ง+ภาษี+เคลียร์ปลายทาง",
    icon: Anchor,
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
    desc: "ผู้ขายจ่ายขนส่ง+ประกันถึงท่าเรือปลายทาง · ผู้ซื้อเคลียร์+ภาษี",
    icon: Ship,
  },
];

const FAQ_ITEMS = [
  {
    q: "นำเข้าจากจีน Pacred ใช้เวลากี่วัน?",
    a: "ขึ้นกับช่องทาง — ทางอากาศ (Air Freight) 3-5 วัน · ทางเรือ LCL 12-15 วัน · ทางเรือ FCL 15-20 วัน · ทางรถข้ามแดน 5-7 วัน เวลาที่บอกนับจากของเข้าโกดังจีน ถึงปลายทางในไทย (ก่อนเคลียร์ศุลกากร)",
  },
  {
    q: "ราคาขนส่งจากจีนคิดยังไง?",
    a: "LCL ทางเรือคิดตาม CBM (ปริมาตร) หรือ KG (น้ำหนัก) ที่สูงกว่า · FCL คิดเป็นต่อตู้ 20'/40' · ทางอากาศคิดตาม Volume Weight หรือ Actual Weight ที่สูงกว่า ทีมแจ้ง Total Landed Cost ครบ (ค่าขนส่ง + ภาษีนำเข้า + VAT + เคลียร์) ในใบเดียวก่อนยืนยัน",
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
    a: "ใช้บริการ ฝากสั่งซื้อสินค้าจากจีน (China Shopping) — ทีมล่ามจีน Pacred ปิดดีลกับโรงงาน ตรวจสเปก ตรวจคุณภาพ ในนามคุณ — แค่ส่งลิงก์สินค้า (1688/Taobao/Tmall/Alibaba) มาให้ ดูเพิ่มที่หน้า /services/china-shopping",
  },
  {
    q: "สินค้าควบคุม เช่น เครื่องสำอาง อาหารเสริม เข้าได้มั้ย?",
    a: "ได้ — แต่ต้องมีใบอนุญาต อย. ก่อนนำเข้า ทีม Pacred ช่วยจัดทำเอกสาร · ประสานกับ อย./มอก./สมอ./กสทช./กรมเกษตร · ตรวจ HS Code · เตรียมข้อมูลสำหรับยื่นขอใบอนุญาต ใช้เวลาเตรียมประมาณ 7-30 วัน ขึ้นอยู่กับประเภทสินค้า",
  },
  {
    q: "ค่าบริการ Pacred รวมอะไรบ้าง?",
    a: "ค่าบริการมาตรฐานครอบคลุม — รับของจากโรงงาน + พัก-ตรวจ-แพ็คที่โกดังจีน + ขนส่งจีน-ไทย + เคลียร์ภาษีศุลกากร + ออกใบขนสินค้า + ใบกำกับภาษี + จัดส่งถึงปลายทางในไทย ไม่มีค่าบริการแฝง — แจ้ง quote ครบทุกหัวก่อนยืนยัน",
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
              <span className="text-primary-600">นำเข้าสินค้าจากจีน</span> ครบวงจร FCL · LCL · Cargo
              <span className="hidden md:inline"> ทุก Term ทุก Port</span>
            </h1>

            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              บริการนำเข้าสินค้าจากจีนแบบมืออาชีพ — รับสินค้าหน้าโรงงาน · ขนส่งจีน-ไทย รถ/เรือ/แอร์ · เคลียร์ภาษีศุลกากร · ใช้สิทธิ Form E · Door-to-Door ทั่วประเทศ <span className="text-primary-600/80 font-bold">ทีมล่ามจีนปิดดีลในนามคุณ</span>
            </h2>

            {/* LINE attention banner — primary CTA above the fold */}
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_cta"
              surface={SURFACE}
              ctaProps={{ position: "hero_banner" }}
              aria-label="ทักไลน์ Pacred — ปรึกษานำเข้าจีนฟรี"
              className="group block mt-4 md:mt-6 relative pt-3 md:pt-4 pr-4 md:pr-8 max-w-[1100px] no-underline"
            >
              <span className="absolute top-0 left-3 md:left-5 z-20 inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-white text-[11.5px] md:text-[13px] font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.45)] tracking-tight transition-transform duration-300 group-hover:-translate-y-0.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                </span>
                ฝากนำเข้าจีน?
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
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.08]"
                  style={{
                    backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
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
                      เริ่มต้นไม่กี่กล่อง · ราคาชัดเจน · ไม่ต้องคุยจีนเอง
                    </p>
                    <p className="hidden md:block mt-1.5 text-[13px] text-white/75 leading-snug">
                      ทีมล่ามจีน + เคลียร์ภาษีครบ · ขนส่งจีน-ไทย รถ/เรือ/แอร์ · Door-to-Door
                    </p>
                    <p className="mt-1.5 md:mt-2 inline-flex items-center gap-1 text-[10px] md:text-[12px] font-bold tracking-wide">
                      <MessageCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300" strokeWidth={2.6} />
                      <span className="text-yellow-300">ทักไลน์</span>
                      <span className="text-white/85">ปรึกษาฟรี — ตอบไว 5 นาที</span>
                      <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300 transition-transform group-hover:translate-x-1" strokeWidth={2.6} />
                    </p>
                  </div>
                </div>
              </div>
            </TrackedExternalLink>

            {/* Service scope card — checklist */}
            <div className="mt-5 md:mt-7 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <span className="shrink-0">🇨🇳</span>
                <span>บริการนำเข้าจากจีนครบวงจร — รับของจีน เคลียร์ไทย ส่งถึงประตู ✈️🚢🚛</span>
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

        {/* ─── Sales contact ─── */}
        <ContactSales hideAssuranceStrip />

        {/* ═══════ 2. Modes ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              3 MODES · 3 รูปแบบ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เลือกแบบ <span className="text-primary-600">FCL · LCL · Cargo</span> ที่เหมาะกับคุณ
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ปริมาณมาก = FCL · เริ่มต้นไม่กี่กล่อง = LCL · ต้องการความเร่งด่วน = Cargo ทางอากาศ/รถ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <article
                    key={m.id}
                    className="group relative flex flex-col rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
                  >
                    <div className="relative h-32 md:h-40 overflow-hidden">
                      <Image
                        src={m.image}
                        alt={m.imageAlt}
                        fill
                        sizes="(max-width: 1024px) 100vw, 380px"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                      />
                      <div className={`absolute inset-0 bg-gradient-to-br ${m.accent} mix-blend-multiply opacity-30`} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                      <div className="absolute top-3 left-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-primary-700 text-[10px] md:text-[11px] font-black tracking-[0.10em] shadow-md">
                          <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
                          {m.badge}
                        </span>
                      </div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <h3 className="text-[18px] md:text-[20px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                          {m.title}
                        </h3>
                        <p className="mt-0.5 text-[11px] md:text-[12.5px] text-white/85 font-medium drop-shadow">
                          {m.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 p-5 md:p-6 space-y-4">
                      <p className="text-[12.5px] md:text-[13.5px] leading-[1.6] text-muted font-medium">
                        {m.intro}
                      </p>

                      <div>
                        <div className="text-[10px] md:text-[10.5px] font-bold text-muted tracking-[0.10em] uppercase mb-2">
                          เหมาะสำหรับ
                        </div>
                        <ul className="space-y-1.5">
                          {m.forItems.map((it) => (
                            <li key={it} className="flex items-start gap-2 text-[12px] md:text-[13px] text-foreground/85 font-medium leading-snug">
                              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                              <span>{it}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.highlights.map((h) => (
                          <span
                            key={h}
                            className="inline-flex items-center px-2 h-6 rounded-md bg-primary-50/70 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 text-[10.5px] md:text-[11px] font-bold text-primary-700 dark:text-primary-300"
                          >
                            {h}
                          </span>
                        ))}
                      </div>

                      <Link
                        href={m.href}
                        data-cta={`mode-${m.id}`}
                        className="inline-flex items-center justify-center gap-1.5 h-10 mt-1 rounded-xl border border-primary-200 text-primary-700 font-black text-[12.5px] md:text-[13.5px] hover:bg-primary-50 transition-colors dark:border-primary-800 dark:text-primary-300 dark:hover:bg-primary-900/20"
                      >
                        {m.cta}
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 3. Why Pacred ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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

        {/* ═══════ 6. FAQ ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-12 md:pb-16">
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
      </main>
      <ImportExportBanner />
      <Footer />
    </>
  );
}
