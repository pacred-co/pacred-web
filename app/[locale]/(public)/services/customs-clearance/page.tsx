import type { Metadata } from "next";
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
  MapPin,
  BookOpen,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services/customs-clearance";
const NS = "seo.services.customsClearance";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

// ─── Content (Thai — primary; EN provided via short literal fallback) ───
const PORTS = [
  "สุวรรณภูมิ",
  "ดอนเมือง",
  "ไปรษณีย์หลักสี่",
  "คลองเตย",
  "แหลมฉบัง",
  "ICD ลาดกระบัง",
  "ด่านชายแดน",
];

const HERO_TICKS = [
  "เคลียร์สินค้านำเข้า–ส่งออก Air Cargo / Sea Freight / Truck ครบทุกช่องทาง",
  "ลงทะเบียนผู้นำเข้า–ส่งออก จับคู่ (YY) กรมศุลกากร ภายใน 30 นาที",
  "ดูแลเอกสารครบ AWB / B/L · D/O · INVOICE + PACKING · ใบขนสินค้า · ใบเสร็จภาษี · ใบอนุญาตนำเข้า",
  "แก้ปัญหาสินค้าติดด่าน · ภาษีเกิน · พิกัดศุลกากรไม่ตรง · เอกสารไม่ครบ · ไม่มีใบอนุญาต",
  "เคลียร์ใบอนุญาต มอก. / สมอ. / กสทช. / กรมเกษตร / กรมประมง / หน่วยงานราชการอื่น ๆ",
  "ผู้เชี่ยวชาญพิธีการศุลกากร Shipping ประสบการณ์ 15+ ปี",
  "ได้รับใบอนุญาตตัวแทนออกของ (Shipping License) ถูกต้องตามกฎหมาย",
  "ใบขนสินค้า · ชำระภาษีและอากรถูกต้อง หมดปัญหากรมศุล/ตำรวจ/สรรพากร 100%",
];

type Channel = {
  id: "air" | "sea" | "truck";
  icon: typeof Plane;
  badge: string;
  title: string;
  intro: string;
  carriersLabel: string;
  carriers: string[];
  forLabel: string;
  forItems: string[];
  servicesLabel: string;
  services: string[];
  goodsLabel?: string;
  goods?: string;
};

const CHANNELS: Channel[] = [
  {
    id: "air",
    icon: Plane,
    badge: "AIR FREIGHT",
    title: "เคลียร์สินค้าทางอากาศ",
    intro:
      "สำหรับสินค้าด่วน · สินค้ารีบขาย · สินค้ารีบใช้งาน — ดูแลตั้งแต่ตรวจเอกสารพื้นฐาน จนถึง Import Clearance ผ่านด่านได้ไว ลดค่าฝากเก็บ ลดความเสี่ยงเอกสารผิด",
    carriersLabel: "รองรับผู้ให้บริการยอดนิยม",
    carriers: ["DHL", "FedEx", "UPS", "TNT", "Air Cargo"],
    forLabel: "เหมาะสำหรับ",
    forItems: [
      "สินค้าด่วน ลดเวลาในระบบ",
      "สินค้าติดด่านสนามบิน (สุ่มตรวจ / เอกสารไม่ครบ)",
      "สินค้าควบคุม/ต้องใช้ใบอนุญาต — เครื่องสำอาง อาหารเสริม เครื่องมือแพทย์",
    ],
    servicesLabel: "บริการหลัก",
    services: [
      "ตรวจ Invoice / Packing List ตรงตามรายการจริง",
      "ตรวจ HS Code จัดพิกัด — ลดเสียภาษีเกิน",
      "ชำระภาษีนำเข้าตามขั้นตอนถูกต้อง",
      "Import Clearance ยื่นข้อมูลจนผ่านด่าน",
    ],
    goodsLabel: "รองรับสินค้า",
    goods: "เครื่องสำอาง · เครื่องใช้ไฟฟ้า · เสื้อผ้า · เครื่องจักร · สินค้าควบคุม และอื่น ๆ",
  },
  {
    id: "sea",
    icon: Ship,
    badge: "SEA FREIGHT",
    title: "เคลียร์สินค้าทางเรือ",
    intro:
      "นำเข้าทางเรือเหมาะกับสินค้าปริมาณมาก ต้นทุนคุ้ม รองรับทั้ง FCL เหมาตู้ + LCL รวมตู้ — ประสานศุลกากร สายเรือ ท่าเรือ คลังสินค้า ดูแลครบจบสุ่มตรวจ แก้เอกสาร จัดส่งต่อ",
    carriersLabel: "รองรับสายเรือหลัก",
    carriers: ["Maersk", "MSC", "ONE", "CMA CGM", "Evergreen", "COSCO", "HMM", "PIL"],
    forLabel: "รองรับ LCL / FCL",
    forItems: [
      "LCL · เริ่มต้นไม่กี่กล่อง จ่ายตาม CBM",
      "FCL · ตู้เต็ม 20'/40'/40HQ ต้นทุนต่อหน่วยถูก",
      "Total Landed Cost คุมได้ง่าย",
    ],
    servicesLabel: "บริการ",
    services: [
      "ทำใบขนขาเข้า + เอกสารประกอบครบ",
      "แก้สุ่มตรวจ ลดระยะเวลารอ",
      "ประสานศุลกากร + สายเรือ ไม่สะดุด",
      "จัดส่งต่อทั่วประเทศ Door to Door",
    ],
  },
  {
    id: "truck",
    icon: Truck,
    badge: "TRUCK · CROSS-BORDER",
    title: "เคลียร์สินค้าทางรถ · ข้ามแดน",
    intro:
      "นำเข้าทางรถ/ข้ามแดนเหมาะกับการขนส่งจากประเทศเพื่อนบ้าน หรือเส้นทางที่ต้องการความยืดหยุ่นด้านเวลา + จุดรับ-ส่ง — ดูแลพิธีการศุลกากรที่ด่านชายแดน ตรวจเอกสาร จัดพิกัด ชำระภาษีแทน",
    carriersLabel: "ด่านที่รองรับ",
    carriers: ["มุกดาหาร", "หนองคาย", "อรัญประเทศ", "แม่สาย", "และอื่น ๆ"],
    forLabel: "เหมาะสำหรับ",
    forItems: [
      "สินค้าทุกประเภทเข้าไทยผ่านด่านรถ",
      "อีคอมเมิร์ซ + งานหมุนสต๊อกเร็ว",
      "สินค้าพรีออเดอร์ คุมไทม์ไลน์",
    ],
    servicesLabel: "บริการ",
    services: [
      "เคลียร์สินค้าติดด่านทุกกรณี — เอกสาร + ปฏิบัติ",
      "ตรวจเอกสารนำเข้า ลดความเสี่ยงข้อมูลไม่ตรง",
      "จัดพิกัดภาษีเหมาะกับสินค้า",
      "ทำพิธีการศุลกากรจนผ่านด่าน + ชำระภาษีแทน",
    ],
  },
];

type Step = { num: string; icon: typeof FileCheck2; title: string; desc: string };

const STEPS: Step[] = [
  {
    num: "01",
    icon: FileCheck2,
    title: "ส่งเอกสารพื้นฐาน",
    desc: "Invoice + Packing List (+ เพิ่มเติม เช่น AWB / B/L หากมี)",
  },
  {
    num: "02",
    icon: MessageCircle,
    title: "ทักผ่าน LINE / Email / โทร",
    desc: "Forward อีเมล DHL/FedEx หรือถ่ายภาพให้ทีมเลย — แยกเรือ / แอร์ / รถ ตามที่ต้องการเคลียร์",
  },
  {
    num: "03",
    icon: Calculator,
    title: "ประเมินราคา",
    desc: "แจ้งค่าบริการ + แนวทางเคลียร์ โปร่งใส 100% — ก่อนเริ่มงานทุกครั้ง",
  },
  {
    num: "04",
    icon: Stamp,
    title: "เริ่มเคลียร์",
    desc: "ดำเนินการตามขั้นตอนศุลกากร + หน่วยงานที่เกี่ยวข้องครบทุกขั้น",
  },
  {
    num: "05",
    icon: PackageSearch,
    title: "ปลดสินค้า + จัดส่งต่อ",
    desc: "พร้อมนัดรับ/จัดส่งทั่วประเทศได้ทันที — Door to Door",
  },
];

const WHY = [
  { icon: Zap,          title: "เคลียร์ด่วนภายในวันเดียว", desc: "เคสที่เอกสารพร้อม + เงื่อนไขครบ" },
  { icon: Wallet,       title: "ราคาชัดเจน",               desc: "ไม่บวกเพิ่ม ลดความกังวลค่าใช้จ่ายปลายทาง" },
  { icon: ShieldCheck,  title: "ไม่โกงราคา",                desc: "ยึดตามข้อตกลง แจ้งล่วงหน้าทุกครั้ง" },
  { icon: Boxes,        title: "รองรับสินค้าทุกประเภท",     desc: "ทั้งทั่วไป + สินค้าควบคุมตามกฎหมาย" },
  { icon: Users,        title: "ทีมงานหน้างานจริง",          desc: "ไม่ใช่แค่รับเรื่อง — มีคนประจำด่านจริง" },
  { icon: Radio,        title: "Tracking real-time",          desc: "อัปเดตสถานะให้ติดตามได้ทุกขั้นตอน" },
  { icon: Award,        title: "ประสบการณ์ 15+ ปี",           desc: "ทำงานกับเคสจริงหลากหลายรูปแบบ" },
  { icon: BadgePercent, title: "เริ่มต้น 2,800 บาท",          desc: "แจ้งราคาชัดเจน — ครบจบในใบเดียว" },
];

const TRUST_BADGES = [
  { icon: FileBadge,   label: "หนังสือรับรองบริษัท",   sub: "มีตัวตน ตรวจสอบได้จริง" },
  { icon: Receipt,     label: "ภพ.20",                   sub: "ออกใบกำกับภาษีถูกต้อง" },
  { icon: Award,       label: "หนังสือสมาคมชิปปิ้ง",     sub: "Shipping License ตามกฎหมาย" },
];

const PROBLEMS = [
  { icon: AlertTriangle, title: "พิกัดอัตราศุลกากร",     desc: "สินค้าโดนตีพิกัดผิด เสียภาษีเกินจริง" },
  { icon: FileWarning,   title: "ใบอนุญาตนำเข้า",         desc: "มอก. · สมอ. · กสทช. · ขอแทนให้" },
  { icon: FileBadge,     title: "เอกสารผิด/ไม่ครบ",       desc: "Invoice · Packing · B/L แก้ทันที" },
  { icon: BadgePercent,  title: "ภาษีพิเศษ Form E/D/AI",  desc: "ลดหย่อนภาษีนำเข้าได้สูงสุด" },
  { icon: Wallet,        title: "ราคาสินค้าโดนตีเกินจริง", desc: "เคลียร์ราคา-เอกสารให้ตรงกัน" },
  { icon: PawPrint,      title: "นำเข้าสัตว์มีชีวิต",       desc: "แมว สุนัข + ใบอนุญาตปศุสัตว์" },
  { icon: Apple,         title: "อาหาร ผลไม้ ของสด",       desc: "ด่านอาหาร + กักกันพืช ครบ" },
  { icon: Shirt,         title: "เสื้อผ้า เครื่องแต่งกาย",  desc: "เชิงพาณิชย์ + ของใช้ส่วนตัว" },
  { icon: Gem,           title: "เครื่องประดับ ของส่วนตัว", desc: "ประเมินมูลค่า + พิธีการให้ถูกต้อง" },
  { icon: Warehouse,     title: "คลังสุวรรณภูมิ",          desc: "DHL · FedEx · UPS · TNT · BFS" },
];

const KNOWLEDGE_TOPICS = [
  "HS Code คืออะไร และทำไมมีผลต่อภาษี",
  "วิธีคำนวณภาษีนำเข้า (อากร + VAT + ค่าใช้จ่ายเกี่ยวข้อง)",
  "ของติดด่านศุลกากรเกิดจากอะไร",
  "เคลียร์สินค้าติดด่านทำยังไง",
  "เคลียร์ของติดด่านใช้เวลากี่วัน",
  "Term CIF / FOB / EXW / DDP คืออะไร",
  "ค่าบริการเคลียร์สินค้าติดด่านคิดจากอะไร",
  "ชิปปิ้งคืออะไร + บทบาทในงานนำเข้า-ส่งออก",
  "LCL คืออะไร เหมาะกับสินค้าปริมาณเท่าไร",
  "FCL คืออะไร ข้อดีของตู้เต็ม",
  "Air Freight คืออะไร ข้อดี-ข้อจำกัด",
  "Sea Freight วางแผนนำเข้าทางเรืออย่างไรให้คุ้ม",
  "Freezone คืออะไร เหมาะกับธุรกิจแบบไหน",
  "Import Clearance ต้องใช้อะไรบ้าง",
  "ATA CARNET คืออะไร",
  "เช็ควันเรือเข้าแหลมฉบังดูยังไง",
  "ของติดท่าเรือคลองเตย/แหลมฉบัง ปลดยังไง",
  "ของต้องห้าม/ต้องกำกัด คืออะไร",
  "โดนสนามบินสุวรรณภูมิกักของต้องทำยังไง",
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

        {/* ═══════ Hero intro — "เคลียร์ให้ เร็ว ไว ไม่มีคำว่าทำไม่ได้" ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-[11.5px] md:text-[12.5px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.8} />
              CUSTOMS CLEARANCE · ALL PORTS
            </div>
            <h2 className="text-[24px] md:text-[42px] leading-[1.15] font-black tracking-[-0.035em] text-[#111827] dark:text-white max-w-[920px]">
              สินค้าติดด่าน? Pacred เคลียร์ให้{" "}
              <span className="text-primary-600">เร็ว ไว ไม่มีคำว่าทำไม่ได้</span>
              <br className="hidden md:inline" />{" "}
              จบทุกเคส รู้ผลภายใน 1 ชั่วโมง
            </h2>
            <p className="mt-3 md:mt-4 text-[13.5px] md:text-[16px] leading-[1.65] font-medium text-muted max-w-[820px]">
              บริการชิปปิ้งเคลียร์สินค้าติดด่านศุลกากร · ครบทุกด่านในไทย ราคาเริ่มต้น 2,800 บาท · รองรับ Air Freight · Sea Freight · Truck · LCL · FCL
            </p>

            {/* Ports pills */}
            <div className="mt-5 md:mt-6 flex flex-wrap gap-1.5 md:gap-2">
              {PORTS.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1.5 px-3 md:px-3.5 h-8 md:h-9 rounded-lg bg-white dark:bg-surface border border-border text-[11.5px] md:text-[13px] font-bold text-[#111827] dark:text-white"
                >
                  <MapPin className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary-600" strokeWidth={2.6} />
                  {p}
                </span>
              ))}
            </div>

            {/* Benefits checklist */}
            <ul className="mt-7 md:mt-10 grid grid-cols-1 md:grid-cols-2 gap-x-6 md:gap-x-10 gap-y-2.5 md:gap-y-3">
              {HERO_TICKS.map((tick) => (
                <li key={tick} className="flex items-start gap-2.5 md:gap-3">
                  <span className="mt-0.5 inline-flex w-5 h-5 md:w-6 md:h-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-[0_3px_8px_rgba(179,0,0,0.25)]">
                    <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-[13px] md:text-[14.5px] leading-[1.5] text-[#111827] dark:text-white font-medium">
                    {tick}
                  </span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="mt-7 md:mt-10 flex flex-wrap gap-3">
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-11 md:h-12 px-5 md:px-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] md:text-[14px] font-black shadow-[0_10px_24px_rgba(179,0,0,0.30)] hover:scale-[1.02] transition-transform"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                ทักไลน์ปรึกษาฟรี — ตอบไว 5 นาที
              </a>
              <a
                href={`tel:${HOTLINE.replace(/-/g, "")}`}
                className="inline-flex items-center justify-center gap-2 h-11 md:h-12 px-5 md:px-6 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[13px] md:text-[14px] font-black hover:border-primary-400 hover:text-primary-700 transition-colors"
              >
                <Phone className="w-4 h-4" strokeWidth={2.6} />
                {HOTLINE}
              </a>
            </div>
          </div>
        </section>

        {/* ═══════ Channels: Air / Sea / Truck ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              SERVICES · 3 CHANNELS
            </div>
            <h3 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เคลียร์ครบทุกช่องทาง — <span className="text-primary-600">ทางอากาศ · ทางเรือ · ทางรถ</span>
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ดูแลตั้งแต่เอกสารพื้นฐานจนปลายทาง · เลือกช่องทางที่เหมาะกับสินค้า + ไทม์ไลน์ของคุณ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                return (
                  <article
                    key={c.id}
                    className="group relative flex flex-col rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_20px_44px_rgba(179,0,0,0.12)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
                  >
                    {/* Header tile */}
                    <div className="relative p-5 md:p-6 bg-gradient-to-br from-primary-50 to-primary-50/30 dark:from-primary-900/30 dark:to-primary-900/10 border-b border-border">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex w-11 h-11 md:w-12 md:h-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                          <Icon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.4} />
                        </span>
                        <div>
                          <div className="text-[10.5px] md:text-[11px] font-black text-primary-600 tracking-[0.10em]">
                            {c.badge}
                          </div>
                          <h4 className="text-[18px] md:text-[20px] font-black text-[#111827] dark:text-white leading-tight tracking-tight">
                            {c.title}
                          </h4>
                        </div>
                      </div>
                      <p className="mt-3 text-[12.5px] md:text-[13.5px] leading-[1.6] text-muted font-medium">
                        {c.intro}
                      </p>
                    </div>

                    {/* Body */}
                    <div className="flex-1 p-5 md:p-6 space-y-4">
                      {/* Carriers */}
                      <div>
                        <div className="text-[10px] md:text-[10.5px] font-bold text-muted tracking-[0.10em] uppercase mb-2">
                          {c.carriersLabel}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {c.carriers.map((car) => (
                            <span
                              key={car}
                              className="inline-flex items-center px-2.5 h-7 rounded-md bg-primary-50/70 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 text-[11px] md:text-[11.5px] font-bold text-primary-700 dark:text-primary-300"
                            >
                              {car}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* For */}
                      <div>
                        <div className="text-[10px] md:text-[10.5px] font-bold text-muted tracking-[0.10em] uppercase mb-2">
                          {c.forLabel}
                        </div>
                        <ul className="space-y-1.5">
                          {c.forItems.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-[12.5px] md:text-[13px] leading-[1.5] text-[#111827] dark:text-white/90">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-600 shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Services */}
                      <div>
                        <div className="text-[10px] md:text-[10.5px] font-bold text-muted tracking-[0.10em] uppercase mb-2">
                          {c.servicesLabel}
                        </div>
                        <ul className="space-y-1.5">
                          {c.services.map((s) => (
                            <li key={s} className="flex items-start gap-2 text-[12.5px] md:text-[13px] leading-[1.5] text-muted">
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary-600 mt-0.5 shrink-0" strokeWidth={2.6} />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {c.goods && c.goodsLabel && (
                        <div className="rounded-xl border border-dashed border-border bg-surface/50 px-3 py-2.5">
                          <div className="text-[10px] md:text-[10.5px] font-bold text-muted tracking-[0.10em] uppercase mb-1">
                            {c.goodsLabel}
                          </div>
                          <p className="text-[12px] md:text-[12.5px] leading-[1.55] text-[#111827] dark:text-white/90 font-medium">
                            {c.goods}
                          </p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ How to use — 5 steps ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ListChecks className="w-3.5 h-3.5" strokeWidth={2.6} />
              HOW TO USE · 5 STEPS
            </div>
            <h3 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ใช้บริการง่าย ๆ — <span className="text-primary-600">ครบจบ ปลดสินค้าใน 1 ชั่วโมง</span>
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              วางขั้นตอนชัดเจน เริ่มได้ทันที — ไม่ต้องเดา ไม่ต้องวิ่งเอกสารหลายรอบ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {STEPS.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.num}
                    className="relative rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[28px] md:text-[34px] font-black text-primary-100 dark:text-primary-900/60 leading-none tracking-tight">
                        {s.num}
                      </span>
                      <span className="inline-flex w-9 h-9 md:w-10 md:h-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_5px_12px_rgba(179,0,0,0.22)]">
                        <Icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.4} />
                      </span>
                    </div>
                    <h4 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                      {s.title}
                    </h4>
                    <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                      {s.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ Why Pacred — 8 reasons + trust badges ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Award className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY PACRED · 15+ YEARS
            </div>
            <h3 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไมต้อง <span className="text-primary-600">Pacred Shipping</span>
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ทีมงานหน้างานจริง ประสบการณ์ 15+ ปี · เคลียร์ทุกด่านในไทย · ราคาโปร่งใส
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
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
                    <h4 className="mt-3 text-[13.5px] md:text-[14.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                      {w.title}
                    </h4>
                    <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.5] text-muted">
                      {w.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Trust badges row */}
            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              {TRUST_BADGES.map((b) => {
                const Icon = b.icon;
                return (
                  <div
                    key={b.label}
                    className="flex items-center gap-3 rounded-2xl border border-primary-100 dark:border-primary-900/40 bg-gradient-to-br from-primary-50/80 to-white dark:from-primary-900/20 dark:to-surface px-4 py-3.5"
                  >
                    <span className="inline-flex w-11 h-11 items-center justify-center rounded-xl bg-white dark:bg-surface-alt text-primary-600 border border-primary-200 dark:border-primary-900 shadow-[0_3px_8px_rgba(179,0,0,0.08)]">
                      <Icon className="w-5 h-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white leading-snug">
                        {b.label}
                      </div>
                      <div className="text-[11px] md:text-[12px] text-muted font-bold mt-0.5">
                        {b.sub}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ Problems we handle ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.6} />
              PROBLEMS WE HANDLE
            </div>
            <h3 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ปัญหาที่ Pacred <span className="text-primary-600">รับจบ จัดการให้คุณ</span>
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ครอบคลุมทุกประเด็นในการนำเข้า-ส่งออก ตั้งแต่พิกัด-เอกสาร-ใบอนุญาต-ราคา จนถึงสินค้าพิเศษ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {PROBLEMS.map((p) => {
                const Icon = p.icon;
                return (
                  <div
                    key={p.title}
                    className="flex items-start gap-3 rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <span className="inline-flex w-10 h-10 md:w-11 md:h-11 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 shrink-0">
                      <Icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.4} />
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-[13.5px] md:text-[14.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                        {p.title}
                      </h4>
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

        {/* ═══════ Knowledge / Learn ═══════ */}
        <section className="relative pt-10 md:pt-16 pb-12 md:pb-20">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <BookOpen className="w-3.5 h-3.5" strokeWidth={2.6} />
              KNOWLEDGE
            </div>
            <h3 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              สาระน่ารู้ <span className="text-primary-600">เรื่องเคลียร์ของ-ภาษีนำเข้า</span>
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              บทความเจาะลึกจากทีม Pacred — รู้ก่อนนำเข้า ลดความเสี่ยงและต้นทุนได้จริง
            </p>

            <ul className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-2.5">
              {KNOWLEDGE_TOPICS.map((topic) => (
                <li key={topic}>
                  <Link
                    href="/knowledge"
                    className="group flex items-center gap-2.5 rounded-xl bg-white dark:bg-surface border border-border px-3.5 py-2.5 hover:border-primary-300 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <span className="inline-flex w-7 h-7 shrink-0 items-center justify-center rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-600 group-hover:bg-primary-600 group-hover:text-white transition-colors">
                      <BookOpen className="w-3.5 h-3.5" strokeWidth={2.6} />
                    </span>
                    <span className="text-[12.5px] md:text-[13px] font-bold text-[#111827] dark:text-white leading-snug line-clamp-2">
                      {topic}
                    </span>
                    <ArrowRight className="ml-auto w-3.5 h-3.5 text-muted shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-primary-600" strokeWidth={2.6} />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-6 md:mt-8 flex justify-center sm:justify-start">
              <Link
                href="/knowledge"
                className="inline-flex items-center gap-1.5 h-10 md:h-11 px-5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[12.5px] md:text-[13.5px] font-black shadow-[0_8px_20px_rgba(179,0,0,0.25)] hover:scale-[1.03] transition-transform"
              >
                ดูบทความทั้งหมด
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
