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
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
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

const PORTS = [
  { name: "สุวรรณภูมิ",       sub: "Air Cargo · Express",   image: "/images/cardclearance/suwanboys.png" },
  { name: "ดอนเมือง",         sub: "Air Freight · Courier", image: "/images/cardclearance/donmueng.png" },
  { name: "ไปรษณีย์หลักสี่",  sub: "พัสดุนำเข้า · EMS",     image: "/images/cardclearance/praisaneelaksee.png" },
  { name: "คลองเตย",          sub: "Sea Port · LCL/FCL",    image: "/images/cardclearance/klongtoey.png" },
  { name: "แหลมฉบัง",         sub: "Container Port · FCL",  image: "/images/cardclearance/laemport.png" },
  { name: "ICD ลาดกระบัง",    sub: "Inland Depot · Sea",    image: "/images/cardclearance/laemport.png" },
  { name: "ด่านชายแดน",       sub: "Truck · มุก/หนอง/แม่",  image: "/images/cardclearance/mukdahanport.png" },
];

const HERO_TICKS = [
  "เคลียร์สินค้านำเข้า–ส่งออก Air Cargo / Sea Freight / Truck ครบทุกช่องทาง",
  "ลงทะเบียนผู้นำเข้า–ส่งออก จับคู่ (YY) กรมศุลกากร ภายใน 30 นาที",
  "ดูแลเอกสารครบ AWB / B/L · D/O · INVOICE + PACKING · ใบขนสินค้า · ใบเสร็จภาษี · ใบอนุญาตนำเข้า",
  "แก้ปัญหาสินค้าติดด่าน · ภาษีเกิน · พิกัดศุลกากรไม่ตรง · เอกสารไม่ครบ · ไม่มีใบอนุญาต",
  "เคลียร์ใบอนุญาต มอก. / สมอ. / กสทช. / กรมเกษตร / กรมประมง / หน่วยงานราชการอื่น ๆ",
  "ผู้เชี่ยวชาญพิธีการศุลกากร Shipping ประสบการณ์ 15+ ปี",
  "ได้รับใบอนุญาตตัวแทนออกของ (Shipping License) ถูกต้องตามกฎหมาย",
  "ชำระภาษีและอากรถูกต้อง 100% — หมดปัญหากรมศุล / ตำรวจ / สรรพากร",
];

type Channel = {
  id: "air" | "sea" | "truck";
  icon: typeof Plane;
  badge: string;
  title: string;
  intro: string;
  image: string;
  imageAlt: string;
  accent: string;
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
      "สำหรับสินค้าด่วน · สินค้ารีบใช้งาน · สินค้ารีบจำหน่าย — ดูแลตั้งแต่เอกสารพื้นฐานจนถึง Import Clearance ผ่านด่านได้ไว ลดค่าฝากเก็บ ลดความเสี่ยงเอกสารผิด",
    image: "/images/hero-section/banner/airbanner.png",
    imageAlt: "เคลียร์สินค้าทางอากาศ Pacred Shipping",
    accent: "from-sky-500 to-sky-700",
    carriersLabel: "รองรับผู้ให้บริการยอดนิยม",
    carriers: ["DHL", "FedEx", "UPS", "TNT", "Air Cargo"],
    forLabel: "เหมาะสำหรับ",
    forItems: [
      "สินค้าด่วน · ลดเวลาในระบบ",
      "สินค้าติดด่านสนามบิน (สุ่มตรวจ/เอกสารไม่ครบ)",
      "สินค้าควบคุม/ต้องใช้ใบอนุญาต — เครื่องสำอาง อาหารเสริม เครื่องมือแพทย์",
    ],
    servicesLabel: "บริการหลัก",
    services: [
      "ตรวจ Invoice / Packing List ตรงตามรายการจริง",
      "ตรวจ HS Code จัดพิกัด ลดเสียภาษีเกิน",
      "ชำระภาษีนำเข้าตามขั้นตอนถูกต้อง",
      "Import Clearance ยื่นข้อมูลจนผ่านด่าน",
    ],
    goodsLabel: "รองรับสินค้า",
    goods: "เครื่องสำอาง · เครื่องใช้ไฟฟ้า · เสื้อผ้า · เครื่องจักร · สินค้าควบคุม และอื่น ๆ ตามเงื่อนไขด่าน",
  },
  {
    id: "sea",
    icon: Ship,
    badge: "SEA FREIGHT",
    title: "เคลียร์สินค้าทางเรือ",
    intro:
      "นำเข้าทางเรือเหมาะกับสินค้าปริมาณมาก ต้นทุนคุ้ม รองรับทั้ง FCL เหมาตู้ + LCL รวมตู้ — ประสานศุลกากร · สายเรือ · ท่าเรือ · คลังสินค้า ดูแลครบรวมสุ่มตรวจ แก้เอกสาร จัดส่งต่อ",
    image: "/images/hero-section/banner/ship.png",
    imageAlt: "เคลียร์สินค้าทางเรือ Pacred Shipping",
    accent: "from-blue-600 to-blue-800",
    carriersLabel: "รองรับสายเรือหลัก",
    carriers: ["Maersk", "MSC", "ONE", "CMA CGM", "Evergreen", "COSCO", "HMM", "PIL"],
    forLabel: "รองรับ LCL / FCL",
    forItems: [
      "LCL · เริ่มต้นไม่กี่กล่อง จ่ายตาม CBM",
      "FCL · เหมาตู้ 20'/40'/40HQ คุ้มที่สุด",
      "Total Landed Cost คุมได้ง่าย",
    ],
    servicesLabel: "บริการ",
    services: [
      "ทำใบขนขาเข้า + เอกสารประกอบครบ",
      "แก้ปัญหาสุ่มตรวจ ลดระยะเวลารอ",
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
      "นำเข้าทางรถ/ข้ามแดนเหมาะกับการขนส่งจากประเทศเพื่อนบ้าน · เส้นทางที่ต้องการความยืดหยุ่นด้านเวลา + จุดรับ-ส่ง — ดูแลพิธีการศุลกากรที่ด่านชายแดน ตรวจเอกสาร จัดพิกัด ชำระภาษีแทน",
    image: "/images/hero-section/banner/car.png",
    imageAlt: "เคลียร์สินค้าทางรถ ข้ามแดน Pacred Shipping",
    accent: "from-primary-500 to-primary-700",
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
      "ทำพิธีการศุลกากร + ชำระภาษีแทน",
    ],
  },
];

type Term = { code: string; name: string; desc: string; icon: typeof Globe2 };

const TERMS: Term[] = [
  {
    code: "CIF",
    name: "Cost, Insurance, Freight",
    desc: "ผู้ขายจ่ายค่าขนส่ง + ประกันถึงท่าเรือปลายทาง — ผู้ซื้อรับผิดชอบเคลียร์ + ภาษี",
    icon: Anchor,
  },
  {
    code: "FOB",
    name: "Free On Board",
    desc: "ผู้ขายส่งของถึงท่าเรือต้นทาง — ผู้ซื้อจ่ายค่าขนส่ง + ประกัน + เคลียร์ปลายทาง",
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

const STATS = [
  { value: "15+",   label: "ปี · เคสจริง" },
  { value: "50K+",  label: "ตู้/บิลที่ดูแล" },
  { value: "1 ชม.", label: "รู้ผลภายใน" },
  { value: "100%",  label: "ถูกกฎหมาย" },
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
    items: ["พิกัดอัตราศุลกากร", "ภาษีนำเข้า + การคืนภาษี", "ครบทุกเทิร์มการค้า"],
  },
  {
    icon: LandPlot,
    label: "พาร์ทเนอร์",
    title: "ท่าเรือ · สายเรือ · คลัง · สนามบิน",
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

const KNOWLEDGE_TOPICS = [
  "HS Code คืออะไร และทำไมมีผลต่อภาษี",
  "วิธีคำนวณภาษีนำเข้า (อากร + VAT + ค่าใช้จ่ายเกี่ยวข้อง)",
  "ของติดด่านศุลกากรเกิดจากอะไร (เอกสาร/พิกัด/สุ่มตรวจ/ใบอนุญาต)",
  "เคลียร์สินค้าติดด่านทำยังไง ขั้นตอนที่ควรรู้ก่อนเริ่ม",
  "เคลียร์ของติดด่านใช้เวลากี่วัน · ปัจจัยที่ทำให้เร็ว/ช้า",
  "Term CIF / FOB / EXW / DDP คืออะไร",
  "ค่าบริการเคลียร์สินค้าติดด่านราคาเท่าไหร่ คิดจากอะไร",
  "ชิปปิ้งคืออะไร · บทบาทในงานนำเข้า-ส่งออก",
  "ชิปปิ้งเคลียร์ของสุวรรณภูมิ เหมาะกับเคสไหน",
  "พิธีการศุลกากรขาเข้า ทำไมต้องมีใบขน",
  "LCL คืออะไร เหมาะกับสินค้าปริมาณเท่าไร",
  "FCL คืออะไร · ข้อดีของตู้เต็ม",
  "Air Freight คืออะไร · ข้อดี-ข้อจำกัด",
  "Sea Freight วางแผนนำเข้าทางเรืออย่างไรให้คุ้ม",
  "Freezone คืออะไร เหมาะกับธุรกิจแบบไหน",
  "Import Clearance คืออะไร ต้องใช้อะไรบ้าง",
  "Customs Clearance ต่างจากชิปปิ้งอย่างไร",
  "ATA CARNET คืออะไร",
  "เช็ควันเรือเข้าแหลมฉบังดูยังไง",
  "Import Customs Clearance Procedure คืออะไร",
  "ของติดท่าเรือคลองเตยทำยังไงดี",
  "ขั้นตอนการนำเข้าสินค้าทางเรืออย่างถูกหลัก",
  "ของติดท่าเรือแหลมฉบัง ปลดยังไง",
  "Customs House คืออะไร",
  "ของต้องห้าม / ต้องกำกัด ต่างกันยังไง",
  "Customs Procedures กับ Customs Clearance ต่างกันยังไง",
  "โดนสนามบินสุวรรณภูมิกักของต้องทำยังไง",
];

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
  "ชิปปิ้งท่าเรือ",
  "เคลียร์สินค้าท่าเรือ",
  "LCL · FCL",
  "Sea Freight Import",
  "ท่าเรือคลองเตย",
  "ท่าเรือกรุงเทพ",
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
        {/* Mobile-only banner above the booking calculator */}
        <div className="md:hidden relative aspect-[768/360] overflow-hidden">
          <Image
            src="/images/bannermobile/clearacnebanner.png"
            alt="Pacred Shipping · เคลียร์สินค้าติดด่านศุลกากร"
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        </div>

        <BookingCalculator landing="customs" />

        {/* ═══════ 1. Hero intro ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          {/* Desktop-only faded customs bg */}
          <div aria-hidden className="hidden md:block absolute inset-x-0 top-0 h-[560px] overflow-hidden pointer-events-none">
            <Image
              src="/images/hero-section/banner/customs.png"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-[0.12] dark:opacity-[0.18]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />
          </div>

          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-[11.5px] md:text-[12.5px] font-black tracking-[0.10em] uppercase shadow-[0_4px_12px_rgba(179,0,0,0.10)]">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.8} />
              CUSTOMS CLEARANCE · ทุกด่าน ทุก Term
            </div>
            <h1 className="text-[32px] md:text-[56px] leading-[1.05] font-black tracking-[-0.04em] text-[#111827] dark:text-white max-w-[920px]">
              <span className="text-yellow-500 dark:text-yellow-400 drop-shadow-[0_2px_8px_rgba(234,179,8,0.30)]">เคลียร์</span>
              <span>จบใน </span>
              <span className="text-primary-600">1 ชั่วโมง</span>
              <span className="text-[20px] md:text-[28px] align-top text-primary-600">*</span>
              <span className="block mt-2 md:mt-3 text-[17px] md:text-[26px] text-muted font-bold tracking-tight">
                เร็ว ไว ไม่มีคำว่าทำไม่ได้ · ทุกด่านทั่วไทย
              </span>
            </h1>

            {/* Prominent price line */}
            <div className="mt-4 md:mt-6 inline-flex items-center gap-2.5 md:gap-3 px-4 md:px-5 py-2.5 md:py-3 rounded-2xl bg-gradient-to-br from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-900/10 border-2 border-yellow-400 dark:border-yellow-700/70 shadow-[0_8px_22px_rgba(234,179,8,0.22)]">
              <span className="inline-flex w-8 h-8 md:w-9 md:h-9 items-center justify-center rounded-xl bg-yellow-400 text-yellow-900 shadow-[0_3px_8px_rgba(234,179,8,0.40)]">
                <BadgePercent className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.6} />
              </span>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[16px] md:text-[22px] font-black text-yellow-900 dark:text-yellow-100 leading-none tracking-tight">
                  เริ่มต้น 2,800 บาท
                </span>
                <span className="text-[11px] md:text-[13px] font-bold text-yellow-700 dark:text-yellow-300/90">
                  ครบจบในใบเดียว · ไม่บวกแอบแฝง
                </span>
              </div>
            </div>

            <p className="mt-4 md:mt-5 text-[14px] md:text-[17px] leading-[1.65] font-medium text-muted max-w-[820px]">
              บริการ Customs Clearance เคลียร์สินค้าติดด่านศุลกากรแบบครบวงจร · รองรับ Air Freight · Sea Freight · Truck · LCL · FCL และด่านหลักทั่วไทย
            </p>

            <div className="mt-6 md:mt-8 flex flex-wrap gap-3">
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-12 md:h-[52px] px-6 md:px-7 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13.5px] md:text-[15px] font-black shadow-[0_12px_30px_rgba(179,0,0,0.32)] hover:scale-[1.03] transition-transform"
              >
                <MessageCircle className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.6} />
                ทักไลน์ปรึกษาฟรี · ตอบไว 5 นาที
              </a>
              <a
                href={`tel:${HOTLINE.replace(/-/g, "")}`}
                className="inline-flex items-center justify-center gap-2 h-12 md:h-[52px] px-6 md:px-7 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[13.5px] md:text-[15px] font-black hover:border-primary-400 hover:text-primary-700 transition-colors shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
              >
                <Phone className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.6} />
                {HOTLINE}
              </a>
            </div>

            {/* Stats banner */}
            <div className="mt-7 md:mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-primary-100 dark:border-primary-900/40 bg-gradient-to-br from-white via-primary-50/30 to-white dark:from-surface dark:via-primary-900/10 dark:to-surface px-4 py-3 md:py-4 text-center shadow-[0_6px_16px_rgba(179,0,0,0.06)]"
                >
                  <div className="text-[22px] md:text-[32px] font-black text-primary-600 leading-none tracking-tight">
                    {s.value}
                  </div>
                  <div className="mt-1 text-[10.5px] md:text-[11.5px] font-bold text-muted tracking-wider uppercase">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

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

            {/* Guarantee strip */}
            <div className="mt-7 md:mt-10 flex items-center gap-3 rounded-2xl border border-primary-200 dark:border-primary-900/60 bg-gradient-to-r from-primary-50 via-white to-primary-50/40 dark:from-primary-950/30 dark:via-surface dark:to-primary-950/10 px-4 md:px-5 py-3 md:py-4 shadow-[0_8px_22px_rgba(179,0,0,0.08)]">
              <span className="text-[22px] md:text-[28px] leading-none">💰</span>
              <p className="text-[13px] md:text-[15px] font-bold text-[#111827] dark:text-white leading-snug">
                การันตี <span className="text-primary-600">ราคาคุ้มค่า · จริงใจ · ชัดเจน</span> ต้อง POP Pacred Shipping
              </p>
            </div>
          </div>
        </section>

        {/* ═══════ 2. Ports we serve ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <MapPin className="w-3.5 h-3.5" strokeWidth={2.6} />
              ALL THAI PORTS · ทุกด่าน
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เคลียร์ครบ <span className="text-primary-600">ทุกด่าน-ทุกท่า</span> ในไทย
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              สนามบิน · ท่าเรือ · ICD · ไปรษณีย์ · ด่านชายแดน — ทีมเรามีหน้างานจริงที่ทุกด่าน
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {PORTS.map((p) => (
                <div
                  key={p.name}
                  className="group relative aspect-[5/4] rounded-2xl overflow-hidden border border-border shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_40px_rgba(179,0,0,0.14)] hover:-translate-y-1 transition-all duration-400"
                >
                  <Image
                    src={p.image}
                    alt={`ด่าน ${p.name}`}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.08]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4">
                    <div className="inline-flex items-center gap-1 mb-1 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-[9px] md:text-[10px] font-black tracking-[0.10em]">
                      <MapPin className="w-2.5 h-2.5" strokeWidth={3} />
                      {p.sub}
                    </div>
                    <div className="text-[14px] md:text-[18px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
                      {p.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ 3. Channels ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              3 CHANNELS · ครบทุกช่องทาง
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              <span className="text-primary-600">ทางอากาศ · ทางเรือ · ทางรถ</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ดูแลตั้งแต่เอกสารพื้นฐานจนปลายทาง · เลือกช่องทางที่เหมาะกับสินค้า + ไทม์ไลน์ของคุณ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                return (
                  <article
                    key={c.id}
                    className="group relative flex flex-col rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
                  >
                    <div className="relative h-32 md:h-40 overflow-hidden">
                      <Image
                        src={c.image}
                        alt={c.imageAlt}
                        fill
                        sizes="(max-width: 1024px) 100vw, 380px"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                      />
                      <div className={`absolute inset-0 bg-gradient-to-br ${c.accent} mix-blend-multiply opacity-30`} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                      <div className="absolute top-3 left-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-primary-700 text-[10px] md:text-[11px] font-black tracking-[0.10em] shadow-md">
                          <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
                          {c.badge}
                        </span>
                      </div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <h3 className="text-[20px] md:text-[22px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                          {c.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex-1 p-5 md:p-6 space-y-4">
                      <p className="text-[12.5px] md:text-[13.5px] leading-[1.6] text-muted font-medium">
                        {c.intro}
                      </p>

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

        {/* ═══════ 4. Terms supported ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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

        {/* ═══════ 5. How to use ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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

        {/* ═══════ 6. Why Pacred ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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
                  src="/images/pacredoffice.jpg"
                  alt="ทีมงาน Pacred Shipping"
                  fill
                  sizes="(max-width: 1024px) 100vw, 480px"
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

        {/* ═══════ 7. PCS Shipping expertise overview ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Briefcase className="w-3.5 h-3.5" strokeWidth={2.6} />
              EXPERTISE · ผู้เชี่ยวชาญ
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              Pacred Shipping <span className="text-primary-600">ผู้เชี่ยวชาญด้านเคลียร์สินค้าติดด่าน</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ทีมงานด้าน Shipping และ Customs Clearance มากกว่า 15 ปี · ครอบคลุมทุกท่าเรือ สนามบิน และด่านชายแดนทั่วประเทศ · รองรับทุก Term การค้าระหว่างประเทศ
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
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
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

        {/* ═══════ 10. Knowledge — 27 topics ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="flex items-end justify-between gap-4 mb-6 md:mb-8 flex-wrap">
              <div>
                <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
                  <BookOpen className="w-3.5 h-3.5" strokeWidth={2.6} />
                  KNOWLEDGE · 27 TOPICS
                </div>
                <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
                  สาระน่ารู้ <span className="text-primary-600">เรื่องเคลียร์ของ-ภาษีนำเข้า</span>
                </h2>
                <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
                  บทความเจาะลึกจากทีม Pacred — รู้ก่อนนำเข้า ลดความเสี่ยงและต้นทุนได้จริง
                </p>
              </div>
              <Link
                href="/knowledge"
                className="hidden sm:inline-flex items-center gap-1.5 h-10 md:h-11 px-4 md:px-5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[12.5px] md:text-[13.5px] font-black hover:border-primary-400 hover:text-primary-700 transition-colors"
              >
                ดูทั้งหมด
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
              </Link>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-2.5">
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

            <div className="mt-6 md:mt-8 sm:hidden flex justify-center">
              <Link
                href="/knowledge"
                className="inline-flex items-center gap-1.5 h-11 px-5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] font-black shadow-[0_8px_20px_rgba(179,0,0,0.25)]"
              >
                ดูบทความทั้งหมด
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════ 11. SEO keyword pills ═══════ */}
        <section className="relative pt-12 md:pt-16 pb-6 md:pb-8">
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
        <section className="relative pt-6 md:pt-12 pb-12 md:pb-20">
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
