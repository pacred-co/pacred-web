import type { Metadata } from "next";
import Image from "next/image";
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
  Radio,
  Award,
  FileCheck2,
  Receipt,
  FileBadge,
  AlertTriangle,
  FileWarning,
  PawPrint,
  Apple,
  Shirt,
  Gem,
  Warehouse,
  PackageSearch,
  Calculator,
  Stamp,
  Sparkles,
  ArrowRight,
  MessageCircle,
  Phone,
  ListChecks,
  BookOpen,
  Quote,
  Anchor,
  Globe2,
  Briefcase,
  RefreshCcw,
  ClipboardCheck,
  HandshakeIcon,
  LandPlot,
  Scale,
  CircleDollarSign,
  Building2,
  Headset,
  Tag,
  ShieldQuestion,
  Home,
  ChevronRight,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ClearanceCards } from "@/components/sections/clearance-cards";
import { ContactSales } from "@/components/sections/contact-sales";
import { PortPricingCarousel } from "@/components/sections/port-pricing-carousel";
import { KnowledgeNewsBlock } from "@/components/sections/knowledge-news-block";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/customs-clearance-shipping-suvarnabhumi";
const NS = "seo.services.customsClearance";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

// ────────────────────────── Content arrays ──────────────────────────

type Term = { code: string; name: string; desc: string; icon: typeof Globe2 };

const TERMS: Term[] = [
  {
    code: "CIF",
    name: "Cost, Insurance, Freight",
    desc: "ผู้ขายจ่ายค่าขนส่ง + ประกันถึง Port ปลายทาง — ผู้ซื้อรับผิดชอบเคลียร์ + ภาษี",
    icon: Anchor,
  },
  {
    code: "FOB",
    name: "Free On Board",
    desc: "ผู้ขายส่งของถึง Port ต้นทาง — ผู้ซื้อจ่ายค่าขนส่ง + ประกัน + เคลียร์ปลายทาง",
    icon: Ship,
  },
  {
    code: "EXW",
    name: "Ex Works",
    desc: "ผู้ซื้อรับของหน้าโรงงานต้นทาง — รับผิดชอบทุกอย่างจนถึงปลายทาง",
    icon: Warehouse,
  },
  {
    code: "DDP",
    name: "Delivered Duty Paid",
    desc: "ผู้ขายจัดการครบทุกขั้นถึงประตูปลายทาง รวมภาษีและเคลียร์ศุลกากร",
    icon: PackageSearch,
  },
];

type Step = { num: string; icon: typeof FileCheck2; title: string; desc: string };

const STEPS: Step[] = [
  { num: "01", icon: FileCheck2,    title: "ส่งเอกสารพื้นฐาน",       desc: "Invoice + Packing List (+ AWB / B/L หากมี)" },
  { num: "02", icon: MessageCircle, title: "ทักผ่าน LINE / Email / โทร", desc: "Forward อีเมล DHL/FedEx หรือถ่ายภาพให้ทีมเลย" },
  { num: "03", icon: Calculator,    title: "ประเมินราคา",            desc: "แจ้งค่าบริการ + แนวทางเคลียร์ โปร่งใส 100%" },
  { num: "04", icon: Stamp,         title: "เริ่มเคลียร์",            desc: "ดำเนินการตามขั้นตอนศุลกากรครบทุกขั้น" },
  { num: "05", icon: PackageSearch, title: "ปลดสินค้า + จัดส่งต่อ",   desc: "นัดรับ/จัดส่งทั่วประเทศ Door to Door" },
];

const WHY = [
  { icon: Zap,          title: "เคลียร์ด่วนภายในวันเดียว", desc: "เคสที่เอกสารพร้อม + เงื่อนไขครบ" },
  { icon: Wallet,       title: "ราคาชัดเจน",               desc: "ไม่บวกเพิ่ม ลดความกังวลปลายทาง" },
  { icon: ShieldCheck,  title: "ไม่โกงราคา",                desc: "ยึดตามข้อตกลง แจ้งล่วงหน้าทุกครั้ง" },
  { icon: Boxes,        title: "รองรับสินค้าทุกประเภท",     desc: "ทั้งทั่วไป + สินค้าควบคุม" },
  { icon: Users,        title: "ทีมงานหน้างานจริง",          desc: "ไม่ใช่แค่รับเรื่อง — มีคนประจำด่าน" },
  { icon: Radio,        title: "Tracking real-time",          desc: "อัปเดตสถานะให้ติดตามได้" },
  { icon: Award,        title: "ประสบการณ์ 15+ ปี",           desc: "เคสจริงหลากหลายรูปแบบ" },
  { icon: BadgePercent, title: "เริ่มต้น 2,800 บาท",          desc: "แจ้งราคา — ครบจบในใบเดียว" },
];

const TRUST_BADGES = [
  { icon: FileBadge, label: "หนังสือรับรองบริษัท", sub: "มีตัวตน ตรวจสอบได้จริง" },
  { icon: Receipt,   label: "ภพ.20",                sub: "ออกใบกำกับภาษีถูกต้อง" },
  { icon: Award,     label: "หนังสือสมาคมชิปปิ้ง",  sub: "Shipping License ตามกฎหมาย" },
];

const EXPERTISE = [
  {
    icon: HandshakeIcon,
    label: "รองรับ",
    title: "นำเข้า · ส่งออก · ทุก Term",
    items: ["CIF / FOB / EXW / DDP", "ให้คำแนะนำเอกสาร + ขั้นตอนตามแต่ละ Term"],
  },
  {
    icon: Briefcase,
    label: "บริการ",
    title: "Air · Sea · Truck",
    items: ["Booking Flights สำหรับงานเร่งด่วน", "เคลียร์สินค้าติดด่านทุกกรณี", "เคลียร์หน่วยงานราชการ"],
  },
  {
    icon: Scale,
    label: "เชี่ยวชาญ",
    title: "กฎหมายศุลกากร · HS Code",
    items: ["พิกัดอัตราศุลกากร", "ภาษีนำเข้า + การคืนภาษี", "ครบทุกTermการค้า"],
  },
  {
    icon: LandPlot,
    label: "พาร์ทเนอร์",
    title: "Port · สายเรือ · คลัง · สนามบิน",
    items: ["DHL · FedEx · TNT · UPS · BFS", "ICD · BKK · PAT", "คลังสุวรรณภูมิ · ดอนเมือง"],
  },
];

const ADDITIONAL_SERVICES = [
  {
    icon: CircleDollarSign,
    title: "ภาษีศุลกากร · ภาษีสนามบิน",
    desc: "จัดการภาษีนำเข้า ภาษีสนามบินสุวรรณภูมิ + ดอนเมือง ครบจบ",
  },
  {
    icon: RefreshCcw,
    title: "การคืนภาษี (Tax Refund)",
    desc: "ขอคืนภาษีสำหรับสินค้าที่มีสิทธิ์ลดหย่อน — เพิ่มกำไรให้ธุรกิจ",
  },
  {
    icon: ShieldQuestion,
    title: "ประกันสินค้า (Cargo Insurance)",
    desc: "บริการเสริมทำประกันสินค้าทุกประเภท ลดความเสี่ยงระหว่างขนส่ง",
  },
  {
    icon: ClipboardCheck,
    title: "ใช้สิทธิ Form E / D / AI",
    desc: "ลดหย่อนภาษีนำเข้าผ่าน FTA ASEAN-China และอื่น ๆ ตามสิทธิ",
  },
  {
    icon: Building2,
    title: "ติดต่อกรมศุลกากรโดยตรง",
    desc: "ประสานเจ้าหน้าที่กรมศุลกากร ลดเวลาและขั้นตอนซ้ำซ้อน",
  },
  {
    icon: Headset,
    title: "ปรึกษาฟรี ตอบไว 5 นาที",
    desc: "ทีม Pacred พร้อมตอบ LINE/โทร ทุกวัน 8:00–18:00",
  },
];

const PROBLEMS = [
  { icon: AlertTriangle, title: "พิกัดอัตราศุลกากร",     desc: "สินค้าโดนตีพิกัดผิด เสียภาษีเกินจริง", color: "rose"   },
  { icon: FileWarning,   title: "ใบอนุญาตนำเข้า",         desc: "มอก. · สมอ. · กสทช. · ขอแทนให้",       color: "amber"  },
  { icon: FileBadge,     title: "เอกสารผิด / ไม่ครบ",     desc: "Invoice · Packing · B/L แก้ทันที",     color: "blue"   },
  { icon: BadgePercent,  title: "ภาษีพิเศษ Form E/D/AI",  desc: "ลดหย่อนภาษีนำเข้าได้สูงสุด",            color: "emerald"},
  { icon: Wallet,        title: "ราคาสินค้าโดนตีเกิน",     desc: "เคลียร์ราคา-เอกสารให้ตรงกัน",          color: "violet" },
  { icon: PawPrint,      title: "นำเข้าสัตว์มีชีวิต",       desc: "แมว สุนัข + ใบอนุญาตปศุสัตว์",         color: "pink"   },
  { icon: Apple,         title: "อาหาร ผลไม้ ของสด",       desc: "ด่านอาหาร + กักกันพืช ครบ",             color: "orange" },
  { icon: Shirt,         title: "เสื้อผ้า เครื่องแต่งกาย",  desc: "เชิงพาณิชย์ + ของใช้ส่วนตัว",          color: "cyan"   },
  { icon: Gem,           title: "เครื่องประดับ ของส่วนตัว", desc: "ประเมินมูลค่า + พิธีการให้ถูกต้อง",    color: "fuchsia"},
  { icon: Warehouse,     title: "คลังสุวรรณภูมิ",          desc: "DHL · FedEx · UPS · TNT · BFS",        color: "indigo" },
];

const PROBLEM_COLOR_MAP: Record<string, string> = {
  rose:    "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-900",
  amber:   "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900",
  blue:    "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900",
  violet:  "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-900",
  pink:    "bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-900",
  orange:  "bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900",
  cyan:    "bg-cyan-50 text-cyan-600 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-900",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 dark:border-fuchsia-900",
  indigo:  "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-900",
};

const KEYWORDS = [
  "เคลียร์ของสนามบิน",
  "เร่งด่วน",
  "เปิดตรวจสินค้า",
  "ชิปปิ้งสุวรรณภูมิ",
  "เคลียร์ของสุวรรณภูมิ",
  "เคลียร์ของด่วน 1 ชั่วโมง",
  "ชิปปิ้งดอนเมือง",
  "เคลียร์ของดอนเมือง",
  "ไปรษณีย์หลักสี่",
  "เคลียร์พัสดุติดค้าง",
  "นำเข้าทางไปรษณีย์",
  "พัสดุต่างประเทศติดศุลกากร",
  "ชิปปิ้ง Port",
  "เคลียร์สินค้า Port",
  "LCL · FCL",
  "Sea Freight Import",
  "Port คลองเตย",
  "Port กรุงเทพ",
  "แหลมฉบัง",
  "ลาดกระบัง ICD",
  "โลจิสติกส์คลังสินค้า",
  "เคลียร์ของนำเข้า",
  "ของติดศุลกากร",
  "ติดพิกัด",
  "ติดใบอนุญาต",
  "ติดหน่วยงาน",
  "เคลียร์ของทั่วประเทศ",
  "ด่านชายแดน",
  "มุกดาหาร",
  "ขนส่งข้ามแดน",
  "Truck Transport",
  "หน่วยงานราชการ",
  "ตรวจเอกสารนำเข้า",
  "เตรียมเอกสารศุลกากร",
  "ขั้นตอนนำเข้า",
  "เคลียร์ของด่วน",
  "ปลดสินค้า",
  "เคลียร์จบใน 1 ชั่วโมง",
  "รับของภายใน 1 วัน",
  "ขนส่งต่อเนื่อง",
  "Door to Door Delivery",
];

const LINE_URL = "/line";
const HOTLINE = "066-125-3007";

export default async function CustomsClearancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel  = typedLocale === "th" ? "บริการ" : "Services";
  const here      = typedLocale === "th" ? "เคลียร์ศุลกากร" : "Customs clearance";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "เคลียร์ศุลกากร" : "Customs clearance",
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: svcLabel, path: "/services" },
              { name: here, path: PATH },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <BookingCalculator landing="customs" />

        {/* Breadcrumb — under booking tabs, links back to home.
            Trailing crumb stays on one line on every viewport: short
            label (no full sentence) + whitespace-nowrap, no truncate
            so the text never shows "...". */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-3 md:pt-4"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px] whitespace-nowrap">
            <li>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors"
              >
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>หน้าแรก</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground">
              เคลียร์ศุลกากร
            </li>
          </ol>
        </nav>

        {/* ═══════ 1. Hero intro ═══════ */}
        <section className="relative pt-1 md:pt-2 pb-1 md:pb-2">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <h1 className="text-[20px] md:text-[44px] leading-[1.25] md:leading-[1.2] font-black tracking-[-0.02em] text-[#111827] dark:text-white max-w-[980px]">
              บริการ <span className="text-primary-600">Customs Clearance</span> เคลียร์สินค้าติดด่าน สุวรรณภูมิ คลองเตย แหลมฉบัง <span className="hidden md:inline text-primary-600"> | Pacred Shipping</span>
            </h1>

            <h2 className="mt-1.5 md:mt-2 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px] md:max-w-none md:whitespace-nowrap">
              เคลียร์สินค้าติดด่านศุลกากรแบบครบวงจร ราคาชัดเจน <span className="text-primary-600/80 font-semibold">เริ่มต้น 2,800 บาท</span> รองรับ Air Freight, Sea Freight, Truck, LCL, FCL และด่านหลักทั่วไทย
            </h2>

            {/* Attention banner — fast clearance CTA, clicks through to LINE */}
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ติดต่อ Pacred Shipping ทาง LINE — เคลียร์ศุลกากรด่วน 1 ชม."
              className="group block mt-4 md:mt-6 relative pt-3 md:pt-4 pr-4 md:pr-8 max-w-[1100px] no-underline"
            >
              {/* Floating dark tag — pulses to draw attention, overflows banner top */}
              <span className="absolute top-0 left-3 md:left-5 z-20 inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-white text-[11.5px] md:text-[13px] font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.45)] tracking-tight transition-transform duration-300 group-hover:-translate-y-0.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                </span>
                สินค้าติดด่าน?
              </span>

              <div
                className="relative rounded-2xl text-white shadow-[0_12px_32px_rgba(6,199,85,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(6,199,85,0.5)] group-hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #00B900 0%, #06C755 45%, #02A340 100%)" }}
              >
                {/* Decorative diagonal sheen */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-50 mix-blend-overlay"
                  style={{ background: "radial-gradient(circle at 75% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
                />
                {/* Subtle dot pattern */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.08]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, white 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                />

                {/* Hour stamp — lifted up so it overflows the banner TOP edge for drama */}
                <div className="absolute right-[-22px] md:right-[-32px] top-[-18px] md:top-[-46px] z-10 transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-1">
                  {/* Radial glow behind the hour */}
                  <span
                    aria-hidden
                    className="absolute inset-0 -m-6 rounded-full bg-white/15 blur-2xl"
                  />
                  <p className="relative text-[48px] md:text-[120px] font-black text-white leading-none tracking-tight whitespace-nowrap [-webkit-text-stroke:2px_#013a14] md:[-webkit-text-stroke:4.5px_#013a14] [paint-order:stroke_fill] [text-shadow:0_8px_24px_rgba(0,0,0,0.55),0_0_44px_rgba(255,255,255,0.35)]">
                    1<span className="text-[26px] md:text-[64px] tracking-tight">ชม.</span>
                  </p>
                </div>

                <div className="relative grid grid-cols-[auto_1fr] items-center gap-2 md:gap-5 pl-3 md:pl-6 pr-3 md:pr-[80px] pt-7 md:pt-7 pb-4 md:pb-5">
                  {/* Brand block — yellow leading letter on each word */}
                  <div className="leading-none shrink-0">
                    <p className="text-[16px] md:text-[32px] font-black tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]">
                      <span className="text-yellow-300">P</span><span className="text-white">acred</span>
                    </p>
                    <p className="mt-0.5 text-[7.5px] md:text-[12px] font-bold tracking-[0.30em]">
                      <span className="text-yellow-300">S</span><span className="text-white">HIPPING</span>
                    </p>
                  </div>

                  {/* Center messages — quoted, single line, large on desktop.
                      Bold text-stroke + soft shadow keep the white headline
                      crisp on the LINE-green gradient (lighter background than
                      the old dark-red banner). */}
                  <div className="min-w-0">
                    <p className="text-[12px] md:text-[39px] font-bold text-white leading-snug whitespace-nowrap [-webkit-text-stroke:0.5px_#013a14] md:[-webkit-text-stroke:1px_#013a14] [paint-order:stroke_fill] [text-shadow:0_2px_6px_rgba(1,58,20,0.45),0_1px_2px_rgba(0,0,0,0.35)]">
                      เคลียร์ให้จบ รวดเร็ว ราคาคุ้มค่า ถูกต้อง รู้ผลใน
                    </p>
                    <p className="hidden md:block mt-1.5 text-[13px] text-white leading-snug [text-shadow:0_1px_2px_rgba(1,58,20,0.5)]">
                      ทีมผู้เชี่ยวชาญพิธีการศุลกากร ครบทุกขั้นตอน — เอกสาร เคลียร์ภาษี ปล่อยสินค้า รองรับ Air · Sea · Truck
                    </p>
                    {/* CTA hint — yellow accent matches the site theme (paired with red banner) */}
                    <p className="mt-1.5 md:mt-2 inline-flex items-center gap-1 text-[9.5px] md:text-[12px] font-bold tracking-wide">
                      <MessageCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300" strokeWidth={2.6} />
                      <span className="text-yellow-300">ทักไลน์</span>
                      <span className="text-white/85">ปรึกษาฟรี — ตอบไว 5 นาที</span>
                      <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300 transition-transform group-hover:translate-x-1" strokeWidth={2.6} />
                    </p>
                  </div>
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* ─── Per-port clearance cards (reused from home page) ─── */}
        <ClearanceCards />

        {/* ═══════ Per-port pricing carousel ═══════
             Per ปอน 2026-05-15: keep the eyebrow + h2 but drop the
             descriptive sub-paragraph — the in-carousel "เลื่อนหมุน
             ต่อกันไม่จบ" hint already communicates the swipe pattern. */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              PRICING BY PORT · ราคาตามด่าน / Port
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ราคาเริ่มต้น <span className="text-primary-600">แต่ละด่าน · แต่ละ Port</span>
            </h2>
          </div>

          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5 mt-6 md:mt-8">
            <PortPricingCarousel />
          </div>
        </section>

        {/* ─── Detailed service list — Pacred Shipping clearance scope ───
             Moved here from the hero (was directly under the LINE banner) per
             ปอน 2026-05-15 — sits better after the per-port pricing carousel. */}
        <section className="relative pt-1 md:pt-2 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px] mx-auto">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <span className="shrink-0">🚨</span>
                <span>บริการชิปปิ้งเคลียร์ของติดด่าน ศุลกากร ครบทุกด่าน ✈️🚢📦</span>
              </h3>

              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                สุวรรณภูมิ / ดอนเมือง / ไปรษณีย์หลักสี่ / คลองเตย / แหลมฉบัง / ลาดกระบัง (ICD) / ด่านชายแดน
              </p>

              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[12.5px] md:text-[14px] leading-snug text-foreground/85">
                {[
                  "เคลียร์สินค้านำเข้า–ส่งออก Air Cargo / Sea Freight / Truck ครบทุกช่องทาง",
                  "ลงทะเบียนผู้นำเข้า–ส่งออก จับคู่ (YY) กรมศุลกากร ภายใน 30 นาที",
                  "ดูแลเอกสารครบ — AWB / B/L / D/O / INVOICE + PACKING / ใบขนสินค้า / ใบเสร็จภาษี / ใบอนุญาตนำเข้า",
                  "แก้ปัญหาสินค้าติดด่าน ติดศุลกากร ภาษีเกิน พิกัดศุลกากรไม่ตรง เอกสารไม่ครบ หรือไม่มีใบอนุญาต",
                  "เคลียร์ใบอนุญาต อย. / มอก. / สมอ. / กสทช. / กรมเกษตร / กรมประมง / หน่วยงานราชการอื่นๆ",
                  "ผู้เชี่ยวชาญด้านเคลียร์พิธีการศุลกากร Shipping มากกว่า 15 ปี",
                  "ได้รับใบอนุญาตตัวแทนออกของ (Shipping License) ถูกต้องตามกฎหมาย",
                  "ดูแลครบ ได้ใบขนสินค้า ชำระภาษีและอากรถูกต้อง หมดปัญหา กรมศุล ตำรวจ สรรพากร 100%",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2
                      className="w-4 h-4 md:w-[18px] md:h-[18px] mt-0.5 shrink-0 text-primary-600"
                      strokeWidth={2.6}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ─── Sales contact (reused from home, with พลอย as the featured customs expert) ─── */}
        <ContactSales featuredName="พลอย" hideAssuranceStrip compact />

        {/* ═══════ 5. How to use ═══════
             Moved here from after Terms per ปอน 2026-05-15 — sits better
             right after the sales cards so users see "how easy" right after
             the contact CTA. */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ListChecks className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · ใช้ง่าย จบใน 1 ชม.
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ใช้บริการง่าย ๆ — <span className="text-primary-600">ครบจบใน 5 ขั้นตอน</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              วางขั้นตอนชัดเจน เริ่มได้ทันที — ไม่ต้องเดา ไม่ต้องวิ่งเอกสารหลายรอบ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {STEPS.map((s, idx) => {
                const Icon = s.icon;
                const isLast = idx === STEPS.length - 1;
                return (
                  <div key={s.num} className="relative">
                    <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white to-primary-50/40 dark:from-surface dark:to-primary-900/10 p-4 md:p-5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(179,0,0,0.12)] transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[34px] md:text-[40px] font-black text-primary-200/70 dark:text-primary-900/70 leading-none tracking-tight">
                          {s.num}
                        </span>
                        <span className="inline-flex w-10 h-10 md:w-11 md:h-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                          <Icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.4} />
                        </span>
                      </div>
                      <h3 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                        {s.title}
                      </h3>
                      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                        {s.desc}
                      </p>
                    </div>
                    {!isLast && (
                      <span aria-hidden className="hidden lg:flex pointer-events-none absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-surface border border-primary-200 dark:border-primary-900 items-center justify-center text-primary-500 shadow-[0_3px_8px_rgba(179,0,0,0.10)]">
                        <ArrowRight className="w-3 h-3" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 4. Terms supported ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
              INCOTERMS · ทุกเทอมการค้า
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              รองรับทุก Term — <span className="text-primary-600">CIF · FOB · EXW · DDP</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ทีม Pacred แนะนำเอกสาร + ขั้นตอนที่เหมาะกับแต่ละ Term — ลดความเสี่ยง + ต้นทุนซ่อนเร้น
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {TERMS.map((term) => {
                const Icon = term.icon;
                return (
                  <div
                    key={term.code}
                    className="relative rounded-2xl border border-border bg-white dark:bg-surface p-5 md:p-6 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_38px_rgba(179,0,0,0.12)] hover:border-primary-300 hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[24px] md:text-[28px] font-black text-primary-600 leading-none tracking-tight">
                        {term.code}
                      </span>
                      <span className="inline-flex w-10 h-10 md:w-11 md:h-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/40 dark:to-primary-900/20 text-primary-600">
                        <Icon className="w-5 h-5" strokeWidth={2.4} />
                      </span>
                    </div>
                    <h3 className="text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white leading-tight tracking-tight">
                      {term.name}
                    </h3>
                    <p className="mt-2 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                      {term.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 6. Why Pacred ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Award className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY PACRED · 15+ YEARS
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไมต้อง <span className="text-primary-600">Pacred Shipping</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ทีมงานหน้างานจริง ประสบการณ์ 15+ ปี · เคลียร์ทุกด่านในไทย · ราคาโปร่งใส
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5 md:gap-7 items-start">
              <div className="relative rounded-2xl md:rounded-3xl overflow-hidden border border-border shadow-[0_14px_36px_-10px_rgba(15,23,42,0.18)] aspect-[5/6] lg:aspect-auto lg:h-full lg:min-h-[520px]">
                <Image
                  src="/images/companyofficethai.png"
                  alt="ทีมงาน Pacred Shipping"
                  fill
                  sizes="(max-width: 1024px) 100vw, 480px"
                  quality={95}
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary-900/80 via-primary-800/30 to-transparent" />
                <Quote className="absolute top-4 left-4 w-10 h-10 text-white/30" strokeWidth={1.5} />
                <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6 text-white">
                  <p className="text-[14px] md:text-[18px] font-black leading-snug tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] mb-2">
                    “Pacred มุ่งเน้น <span className="text-yellow-300">เร็ว ไว ไม่มีคำว่าทำไม่ได้</span> ทุกขั้นตอน”
                  </p>
                  <div className="text-[11px] md:text-[12px] font-bold opacity-95">
                    ทีมประสบการณ์ 15+ ปี · เคลียร์ทุกด่านในไทย
                  </div>
                </div>
              </div>

              <div>
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  {WHY.map((w) => {
                    const Icon = w.icon;
                    return (
                      <div
                        key={w.title}
                        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_14px_28px_rgba(179,0,0,0.10)] hover:border-primary-200 hover:-translate-y-0.5 transition-all duration-300"
                      >
                        <span className="inline-flex w-10 h-10 md:w-11 md:h-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_5px_12px_rgba(179,0,0,0.20)]">
                          <Icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.4} />
                        </span>
                        <h3 className="mt-3 text-[13.5px] md:text-[14.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                          {w.title}
                        </h3>
                        <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.5] text-muted">
                          {w.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {TRUST_BADGES.map((b) => {
                    const Icon = b.icon;
                    return (
                      <div
                        key={b.label}
                        className="flex items-center gap-3 rounded-2xl border border-primary-100 dark:border-primary-900/40 bg-gradient-to-br from-primary-50/80 to-white dark:from-primary-900/20 dark:to-surface px-4 py-3"
                      >
                        <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-white dark:bg-surface-alt text-primary-600 border border-primary-200 dark:border-primary-900 shadow-[0_3px_8px_rgba(179,0,0,0.08)]">
                          <Icon className="w-4 h-4" strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[12.5px] md:text-[13px] font-black text-[#111827] dark:text-white leading-snug">
                            {b.label}
                          </div>
                          <div className="text-[10.5px] md:text-[11px] text-muted font-bold mt-0.5">
                            {b.sub}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ 7. Pacred Shipping expertise overview ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Briefcase className="w-3.5 h-3.5" strokeWidth={2.6} />
              EXPERTISE · ผู้เชี่ยวชาญ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              Pacred Shipping <span className="text-primary-600">ผู้เชี่ยวชาญด้านเคลียร์สินค้าติดด่าน</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ทีมงานด้าน Shipping และ Customs Clearance มากกว่า 15 ปี · ครอบคลุมทุก Port สนามบิน และด่านชายแดนทั่วประเทศ · รองรับทุก Term การค้าระหว่างประเทศ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {EXPERTISE.map((e) => {
                const Icon = e.icon;
                return (
                  <div
                    key={e.label}
                    className="flex flex-col rounded-2xl border border-border bg-white dark:bg-surface p-5 md:p-6 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_38px_rgba(179,0,0,0.10)] hover:border-primary-200 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <span className="inline-flex w-11 h-11 md:w-12 md:h-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_5px_12px_rgba(179,0,0,0.20)]">
                      <Icon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.4} />
                    </span>
                    <div className="mt-3 text-[10px] md:text-[10.5px] font-bold text-primary-600 tracking-[0.10em] uppercase">
                      {e.label}
                    </div>
                    <h3 className="text-[14.5px] md:text-[16px] font-black text-[#111827] dark:text-white leading-tight tracking-tight">
                      {e.title}
                    </h3>
                    <ul className="mt-3 space-y-1.5 flex-1">
                      {e.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[12px] md:text-[12.5px] leading-[1.5] text-muted">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-600 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 8. Additional services ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              ADDITIONAL SERVICES · บริการเสริม
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              บริการเสริม <span className="text-primary-600">ครบวงจร</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ไม่ใช่แค่เคลียร์ของ — Pacred ดูแลภาษี ประกัน + ทุกขั้นตอนของการนำเข้า-ส่งออก
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {ADDITIONAL_SERVICES.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.title}
                    className="flex items-start gap-3 md:gap-4 rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_14px_30px_rgba(179,0,0,0.10)] hover:border-primary-200 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <span className="inline-flex w-11 h-11 md:w-12 md:h-12 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 border border-primary-100 dark:border-primary-900/40 shrink-0">
                      <Icon className="w-5 h-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[14px] md:text-[15px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                        {s.title}
                      </h3>
                      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                        {s.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 9. Problems we handle ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.6} />
              PROBLEMS WE HANDLE · 10+
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ปัญหาที่ Pacred <span className="text-primary-600">รับจบ จัดการให้คุณ</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ครอบคลุมทุกประเด็นในนำเข้า-ส่งออก ตั้งแต่พิกัด · เอกสาร · ใบอนุญาต · ราคา จนถึงสินค้าพิเศษ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {PROBLEMS.map((p) => {
                const Icon = p.icon;
                const colorClass = PROBLEM_COLOR_MAP[p.color] ?? PROBLEM_COLOR_MAP.rose;
                return (
                  <div
                    key={p.title}
                    className="group flex items-start gap-3 rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-1 hover:shadow-[0_16px_32px_rgba(179,0,0,0.10)] transition-all duration-300"
                  >
                    <span className={`inline-flex w-11 h-11 md:w-12 md:h-12 items-center justify-center rounded-xl border shrink-0 ${colorClass} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-5 h-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[13.5px] md:text-[14.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                        {p.title}
                      </h3>
                      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.5] text-muted">
                        {p.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 10. Knowledge + News — shared tab carousel block ═══════
             Replaced the old 27-topic chip grid with the same tab-switcher +
             card carousel used on the home Blog section (per ปอน 2026-05-15
             — match home knowledge style on the customs landing too). */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <KnowledgeNewsBlock />
          </div>
        </section>

        {/* ═══════ 11. SEO keyword pills ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
              SERVICES TAGS · บริการที่ครอบคลุม
            </div>
            <h2 className="text-[20px] md:text-[28px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
              Pacred ดูแล <span className="text-primary-600">ทุกขอบเขต</span>การนำเข้า-ส่งออก
            </h2>

            <div className="mt-5 md:mt-6 flex flex-wrap gap-1.5 md:gap-2">
              {KEYWORDS.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center px-2.5 md:px-3 h-7 md:h-8 rounded-md bg-primary-50/60 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 text-[11px] md:text-[12px] font-bold text-primary-700 dark:text-primary-300"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ 12. Bottom CTA ═══════ */}
        <section className="relative pt-2 md:pt-3 pb-4 md:pb-6">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="relative overflow-hidden rounded-3xl md:rounded-[28px] border border-primary-200 dark:border-primary-900/60 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 dark:from-primary-700 dark:via-primary-800 dark:to-primary-900 shadow-[0_28px_60px_-20px_rgba(179,0,0,0.40)]">
              <span aria-hidden className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
              <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-12 w-56 h-56 rounded-full bg-white/10 blur-3xl" />

              <div className="relative p-6 md:p-10 lg:p-12 flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8">
                <div className="flex-1">
                  <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-white text-[10.5px] md:text-[11.5px] font-black tracking-[0.10em] uppercase">
                    <Sparkles className="w-3.5 h-3.5" strokeWidth={2.8} />
                    เริ่มต้น ฿2,800 · ตอบไว 5 นาที
                  </div>
                  <h2 className="text-[24px] md:text-[36px] leading-[1.16] font-black tracking-[-0.035em] text-white">
                    สินค้าติดด่านอยู่? ส่ง <span className="text-yellow-300">Invoice + Packing</span> มาทาง LINE
                  </h2>
                  <p className="mt-2 text-[13.5px] md:text-[15.5px] leading-[1.6] font-medium text-white/85 max-w-[600px]">
                    ทีม Pacred จะประเมินราคาภายในชั่วโมง · ปรึกษาฟรี · เคลียร์ภายในวันเดียวสำหรับเคสที่เอกสารพร้อม
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row md:flex-col xl:flex-row gap-2.5 w-full md:w-auto">
                  <a
                    href={LINE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-white text-primary-700 text-[13px] md:text-[14px] font-black shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:scale-[1.03] transition-transform"
                  >
                    <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                    ทักไลน์ทันที
                  </a>
                  <a
                    href={`tel:${HOTLINE.replace(/-/g, "")}`}
                    className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-white/10 backdrop-blur-sm text-white border border-white/40 text-[13px] md:text-[14px] font-black hover:bg-white/20 transition-colors"
                  >
                    <Phone className="w-4 h-4" strokeWidth={2.6} />
                    {HOTLINE}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
