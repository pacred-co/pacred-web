/**
 * Shared customs-port data — used by both the landing carousel
 * (`components/sections/port-pricing-carousel.tsx`, client) and the
 * per-port detail pages
 * (`app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/[port]/page.tsx`,
 * server). No "use client" / "use server" directive so both can import.
 *
 * Pricing numbers are เบื้องต้น (ballpark) — every port surface flags
 * this so customers don't anchor on them. The customsServiceFee field
 * is the headline price ปอน wants prominent on the landing card.
 */

import {
  Plane,
  Ship,
  Truck,
  Mail,
  Container,
  type LucideIcon,
} from "lucide-react";

export type CustomsTemplate = "air" | "sea" | "truck";

export type PriceItem = { label: string; value: string };
export type PriceSection = {
  icon: string;
  heading: string;
  items: PriceItem[];
};

export type CustomsPortCode =
  | "bkk"
  | "dmk"
  | "laksi"
  | "klong"
  | "laem"
  | "icd"
  | "border";

export type CustomsPort = {
  code: CustomsPortCode;
  /** URL slug — full path is /customs-clearance-shipping-suvarnabhumi/<slug>. */
  slug: string;
  /** Display name on cards + detail hero. */
  name: string;
  /** Sub-label (e.g. "BKK · Air Cargo / Express"). */
  sub: string;
  /** Picks which long-form content (Air/Sea/Truck) to render on the detail. */
  template: CustomsTemplate;
  /** Pill badge on image (mirrors the BookingPortTabs sub label). */
  modeBadge: string;
  modeIcon: LucideIcon;
  /** Tailwind gradient tokens for the image multiply overlay. */
  accent: string;
  image: string;
  imageAlt: string;
  /**
   * Headline price shown big on the landing card. ปอน 2026-05-15:
   * air ports = 2,800 / everything else = 3,500.
   */
  customsServiceFee: string;
  /** Short blurb on the landing card — 1-2 lines, NOT the long template. */
  shortDesc: string;
  /** SEO sub-keywords surfaced on the detail page hero. */
  subKeywords: string[];
  /** Full price breakdown — only rendered on the detail page. */
  pricingSections: PriceSection[];
  summaryLabel: string;
  summaryPrice: string;
  summaryNote: string;
};

/* ────────────────────── Air / Sea / Truck templates ────────────────────── */

export const TEMPLATES: Record<
  CustomsTemplate,
  {
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
  }
> = {
  air: {
    title: "ทางอากาศ · Air Freight Clearance",
    intro:
      "สำหรับลูกค้าที่ต้องการความรวดเร็ว หรือมีสินค้าที่ต้องรีบใช้งาน/รีบจำหน่าย — การเคลียร์สินค้าทางอากาศเป็นตัวเลือกที่เหมาะมาก เราช่วยดูแลตั้งแต่เอกสารพื้นฐานไปจนถึงขั้นตอนนำเข้า (Import Clearance) เพื่อให้สินค้าผ่านด่านได้ไว ลดค่าฝากเก็บ และลดความเสี่ยงจากเอกสารผิดพลาด",
    carriersLabel: "รองรับผู้ให้บริการ / ช่องทางยอดนิยม",
    carriers: ["DHL", "FedEx", "UPS", "TNT", "Air Cargo"],
    forLabel: "เหมาะสำหรับ",
    forItems: [
      "สินค้าด่วน ที่ต้องการลดเวลาในระบบ",
      "สินค้าติดด่านสนามบิน เช่น โดนสุ่มตรวจหรือเอกสารไม่ครบ",
      "สินค้าควบคุม / สินค้าต้องใช้ใบอนุญาต — เครื่องสำอาง · อาหารเสริม · เครื่องมือแพทย์บางชนิด",
    ],
    servicesLabel: "บริการหลัก",
    services: [
      "ตรวจ Invoice / Packing List ให้ถูกต้องตามรายการจริง",
      "ตรวจ HS Code เพื่อจัดพิกัดให้เหมาะสม ลดโอกาสเสียภาษีเกินหรือโดนตีกลับ",
      "ชำระภาษีนำเข้า ตามขั้นตอนอย่างถูกต้อง",
      "ดำเนินการ Import Clearance ตั้งแต่ยื่นข้อมูลจนผ่านด่าน",
    ],
    goodsLabel: "รองรับสินค้า",
    goods:
      "เครื่องสำอาง · เครื่องใช้ไฟฟ้า · เสื้อผ้า · เครื่องจักร · สินค้าควบคุม · และสินค้าทุกชนิดตามเงื่อนไขด่าน",
  },
  sea: {
    title: "ทางเรือ · Sea Freight Clearance",
    intro:
      "งานนำเข้าทางเรือเหมาะกับสินค้าปริมาณมาก ต้นทุนขนส่งคุ้มค่า และรองรับทั้งแบบตู้เต็ม (FCL) และแบบรวมตู้ (LCL) — Pacred Shipping ช่วยประสานงานทั้งฝั่งศุลกากร สายเรือ Port และคลังสินค้า พร้อมดูแลประเด็นสำคัญ เช่น การสุ่มตรวจ การแก้ไขเอกสาร และการจัดส่งต่อ",
    carriersLabel: "รองรับสายเรือหลัก",
    carriers: [
      "Maersk",
      "MSC",
      "ONE",
      "CMA CGM",
      "Evergreen",
      "COSCO",
      "HMM",
      "PIL",
    ],
    forLabel: "รองรับ LCL / FCL",
    forItems: [
      "LCL · เริ่มต้นไม่กี่กล่อง จ่ายตาม CBM",
      "FCL · เหมาตู้ 20'/40'/40HQ คุ้มที่สุด",
      "Total Landed Cost คุมได้ง่าย — ทีมแนะนำตามปริมาณสินค้า + งบประมาณ",
    ],
    servicesLabel: "บริการ",
    services: [
      "ทำใบขนขาเข้า และเตรียมเอกสารประกอบให้ครบ",
      "แก้ปัญหาสินค้าสุ่มตรวจ ประสานงานและช่วยลดระยะเวลารอ",
      "ประสานงานศุลกากรและสายเรือ เพื่อให้ขั้นตอนเดินต่อไม่สะดุด",
      "จัดส่งต่อทั่วประเทศ ต่อรถ / ต่อคลัง / ส่งถึงปลายทางตามที่คุณกำหนด",
    ],
  },
  truck: {
    title: "ทางรถ · Truck / Cross-Border Clearance",
    intro:
      "การนำเข้าทางรถหรือข้ามแดน เหมาะกับการขนส่งจากประเทศเพื่อนบ้านหรือเส้นทางที่ต้องการความยืดหยุ่นด้านเวลาและจุดรับ-ส่ง — เราช่วยดูแลพิธีการศุลกากรที่ด่านชายแดน ตรวจเอกสาร จัดพิกัด และชำระภาษีแทนได้ เพื่อให้สินค้าผ่านด่านอย่างถูกต้อง",
    carriersLabel: "ด่านที่รองรับ",
    carriers: ["มุกดาหาร", "หนองคาย", "นครพนม", "อรัญประเทศ", "แม่สาย"],
    forLabel: "เหมาะสำหรับ",
    forItems: [
      "สินค้าจากทั่วโลกทุกประเภท ที่ต้องการเข้าไทยผ่านด่านรถ",
      "สินค้าอีคอมเมิร์ซ และงานที่ต้องการความเร็วในการหมุนสต๊อก",
      "สินค้าพรีออเดอร์ ที่ต้องคุมไทม์ไลน์ส่งมอบให้ลูกค้า",
    ],
    servicesLabel: "บริการ",
    services: [
      "เคลียร์สินค้าติดด่านทุกกรณี ตั้งแต่เอกสารไปจนถึงขั้นตอนปฏิบัติ",
      "ตรวจเอกสารนำเข้า ลดความเสี่ยงข้อมูลไม่ตรง",
      "จัดพิกัดภาษี ให้เหมาะกับลักษณะสินค้า",
      "ทำพิธีการศุลกากร จนผ่านด่าน",
      "ชำระภาษีแทน ตามยอดที่ประเมินและยืนยันกับลูกค้า",
    ],
  },
};

/* ────────────────────── 7 ports ────────────────────── */

const AIR_PRICE_SECTIONS_BKK: PriceSection[] = [
  {
    icon: "💰",
    heading: "ค่าบริการหลัก",
    items: [
      { label: "ลงทะเบียนกรมศุลกากร",      value: "1,500 บาท" },
      { label: "ค่าพิธีการศุลกากร",         value: "2,800 บาท" },
      { label: "อย / มอก / เกษตร อื่นๆ",  value: "1,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "📦",
    heading: "ค่าใช้จ่ายสายการบิน / Port",
    items: [
      { label: "D/O",                  value: "รอเช็ค" },
      { label: "ค่าแลก D/O",            value: "421 บาท" },
      { label: "ค่าผ่าน Port",            value: "500 บาท" },
      { label: "ค่าเช่าพื้นที่ (RENT)",  value: "รอเช็ค" },
      { label: "ยิงใบขนอิเล็กทรอนิกส์", value: "350 บาท" },
      { label: "ค่าธรรมเนียมกรมศุล",    value: "200 บาท" },
      { label: "ค่าล่วงเวลาศุลกากร",    value: "500 บาท" },
    ],
  },
  {
    icon: "🚚",
    heading: "ค่าขนส่งในไทย (ถ้ามี)",
    items: [
      { label: "รถ 4-6 ล้อ (BKK + ปริมณฑล)", value: "500-5,000 บาท" },
      { label: "แรงงานลงสินค้า",            value: "3,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "⚠️",
    heading: "เพิ่มเติม (ขึ้นกับสินค้า)",
    items: [
      { label: "ค่าบริการพิเศษศุลกากร", value: "รอเช็ค" },
      { label: "ภาษีนำเข้า + VAT 7%",   value: "ตามมูลค่าสินค้า" },
    ],
  },
];

const AIR_PRICE_SECTIONS_DMK: PriceSection[] = [
  {
    icon: "💰",
    heading: "ค่าบริการหลัก",
    items: [
      { label: "ลงทะเบียนกรมศุลกากร",      value: "1,500 บาท" },
      { label: "ค่าพิธีการศุลกากร",         value: "2,800 บาท" },
      { label: "อย / มอก / เกษตร อื่นๆ",  value: "1,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "📦",
    heading: "ค่าใช้จ่ายสายการบิน / Port",
    items: [
      { label: "D/O",                  value: "รอเช็ค" },
      { label: "ค่าแลก D/O",            value: "421 บาท" },
      { label: "ค่าผ่าน Port",            value: "450 บาท" },
      { label: "ยิงใบขนอิเล็กทรอนิกส์", value: "350 บาท" },
      { label: "ค่าธรรมเนียมกรมศุล",    value: "200 บาท" },
      { label: "ค่าล่วงเวลาศุลกากร",    value: "500 บาท" },
    ],
  },
  {
    icon: "🚚",
    heading: "ค่าขนส่งในไทย (ถ้ามี)",
    items: [
      { label: "รถ 4-6 ล้อ (BKK + ปริมณฑล)", value: "500-5,000 บาท" },
      { label: "แรงงานลงสินค้า",            value: "3,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "⚠️",
    heading: "เพิ่มเติม (ขึ้นกับสินค้า)",
    items: [
      { label: "ค่าบริการพิเศษศุลกากร", value: "รอเช็ค" },
      { label: "ภาษีนำเข้า + VAT 7%",   value: "ตามมูลค่าสินค้า" },
    ],
  },
];

const POSTAL_PRICE_SECTIONS: PriceSection[] = [
  {
    icon: "💰",
    heading: "ค่าบริการหลัก",
    items: [
      { label: "ลงทะเบียนกรมศุลกากร",      value: "1,500 บาท" },
      { label: "ค่าพิธีการศุลกากร",         value: "2,800 บาท" },
      { label: "อย / มอก / เกษตร อื่นๆ",  value: "1,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "📬",
    heading: "ค่าใช้จ่ายไปรษณีย์ / ด่าน",
    items: [
      { label: "ค่าตรวจไปรษณีย์",        value: "รอเช็ค" },
      { label: "ค่าผ่านศูนย์",           value: "300 บาท" },
      { label: "ยิงใบขนอิเล็กทรอนิกส์",  value: "350 บาท" },
      { label: "ค่าธรรมเนียมกรมศุล",     value: "200 บาท" },
      { label: "ค่าล่วงเวลา (ถ้ามี)",    value: "500 บาท" },
    ],
  },
  {
    icon: "🚚",
    heading: "ค่าจัดส่ง (ถ้ามี)",
    items: [
      { label: "Messenger / Lalamove", value: "180-1,200 บาท" },
      { label: "Kerry / Flash / SPX",  value: "ตามน้ำหนัก / ปลายทาง" },
    ],
  },
  {
    icon: "⚠️",
    heading: "เพิ่มเติม (ขึ้นกับสินค้า)",
    items: [
      { label: "ค่าบริการพิเศษศุลกากร", value: "รอเช็ค" },
      { label: "ภาษีนำเข้า + VAT 7%",   value: "ตามมูลค่าสินค้า" },
    ],
  },
];

const SEA_PRICE_SECTIONS_KLONG: PriceSection[] = [
  {
    icon: "💰",
    heading: "ค่าบริการหลัก",
    items: [
      { label: "ลงทะเบียนกรมศุลกากร",      value: "1,500 บาท" },
      { label: "ค่าพิธีการศุลกากร",         value: "3,500 บาท" },
      { label: "อย / มอก / เกษตร อื่นๆ",  value: "1,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "⚓",
    heading: "ค่าใช้จ่ายสายเรือ / Port",
    items: [
      { label: "D/O (สายเรือ)",          value: "2,500-3,500 บาท" },
      { label: "ค่าแลก D/O",             value: "500 บาท" },
      { label: "ค่าผ่าน Port PAT",         value: "1,500 บาท" },
      { label: "ค่าเช่าพื้นที่ (ถ้ามี)",   value: "คิดต่อวัน" },
      { label: "ยิงใบขนอิเล็กทรอนิกส์",   value: "350 บาท" },
      { label: "ค่าธรรมเนียมกรมศุล",     value: "200 บาท" },
      { label: "ค่าล่วงเวลา",             value: "500 บาท" },
    ],
  },
  {
    icon: "🚚",
    heading: "ค่าขนส่งในไทย (ถ้ามี)",
    items: [
      { label: "รถบรรทุก 10 ล้อ / ตู้",  value: "4,000-15,000 บาท" },
      { label: "แรงงานลงสินค้า",          value: "3,500-5,000 บาท" },
    ],
  },
  {
    icon: "⚠️",
    heading: "เพิ่มเติม (ขึ้นกับสินค้า)",
    items: [
      { label: "ค่าตู้สกปรก / ซ่อมตู้",     value: "ตามจริง" },
      { label: "ภาษีนำเข้า + VAT 7%",     value: "ตามมูลค่าสินค้า" },
    ],
  },
];

const SEA_PRICE_SECTIONS_LAEM: PriceSection[] = [
  {
    icon: "💰",
    heading: "ค่าบริการหลัก",
    items: [
      { label: "ลงทะเบียนกรมศุลกากร",      value: "1,500 บาท" },
      { label: "ค่าพิธีการศุลกากร",         value: "3,500 บาท" },
      { label: "อย / มอก / เกษตร อื่นๆ",  value: "1,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "🚢",
    heading: "ค่าใช้จ่ายสายเรือ / Port",
    items: [
      { label: "D/O (สายเรือ)",          value: "2,500-3,500 บาท" },
      { label: "ค่าแลก D/O",             value: "500 บาท" },
      { label: "ค่าผ่าน Port LCBT",        value: "1,800 บาท" },
      { label: "ค่าเช่าพื้นที่ (ถ้ามี)",   value: "คิดต่อวัน" },
      { label: "ยิงใบขนอิเล็กทรอนิกส์",   value: "350 บาท" },
      { label: "ค่าธรรมเนียมกรมศุล",     value: "200 บาท" },
      { label: "ค่าล่วงเวลา",             value: "500 บาท" },
    ],
  },
  {
    icon: "🚚",
    heading: "ค่าขนส่งในไทย (ถ้ามี)",
    items: [
      { label: "ค่ารถลาก (LCBT → BKK)", value: "3,500-6,500 บาท" },
      { label: "ขนส่งต่อ / แรงงาน",      value: "4,000-15,000 บาท" },
    ],
  },
  {
    icon: "⚠️",
    heading: "เพิ่มเติม (ขึ้นกับสินค้า)",
    items: [
      { label: "ค่าตู้สกปรก / ซ่อมตู้",     value: "ตามจริง" },
      { label: "ภาษีนำเข้า + VAT 7%",     value: "ตามมูลค่าสินค้า" },
    ],
  },
];

const SEA_PRICE_SECTIONS_ICD: PriceSection[] = [
  {
    icon: "💰",
    heading: "ค่าบริการหลัก",
    items: [
      { label: "ลงทะเบียนกรมศุลกากร",      value: "1,500 บาท" },
      { label: "ค่าพิธีการศุลกากร",         value: "3,500 บาท" },
      { label: "อย / มอก / เกษตร อื่นๆ",  value: "1,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "📦",
    heading: "ค่าใช้จ่ายสายเรือ / Port",
    items: [
      { label: "D/O (สายเรือ)",          value: "2,500-3,500 บาท" },
      { label: "ค่าแลก D/O",             value: "500 บาท" },
      { label: "ค่าผ่าน Port ICD",         value: "1,200 บาท" },
      { label: "ค่าเช่าพื้นที่ (ถ้ามี)",   value: "คิดต่อวัน" },
      { label: "ยิงใบขนอิเล็กทรอนิกส์",   value: "350 บาท" },
      { label: "ค่าธรรมเนียมกรมศุล",     value: "200 บาท" },
      { label: "ค่าล่วงเวลา",             value: "500 บาท" },
    ],
  },
  {
    icon: "🚚",
    heading: "ค่าขนส่งในไทย (ถ้ามี)",
    items: [
      { label: "รถบรรทุก (BKK metro)",   value: "4,500-12,000 บาท" },
      { label: "แรงงานลงสินค้า",          value: "3,500 บาท" },
    ],
  },
  {
    icon: "⚠️",
    heading: "เพิ่มเติม (ขึ้นกับสินค้า)",
    items: [
      { label: "ค่าตู้สกปรก / ซ่อมตู้",     value: "ตามจริง" },
      { label: "ภาษีนำเข้า + VAT 7%",     value: "ตามมูลค่าสินค้า" },
    ],
  },
];

const BORDER_PRICE_SECTIONS: PriceSection[] = [
  {
    icon: "💰",
    heading: "ค่าบริการหลัก",
    items: [
      { label: "ลงทะเบียนกรมศุลกากร",      value: "1,500 บาท" },
      { label: "ค่าพิธีการศุลกากร / ด่าน",  value: "3,500 บาท" },
      { label: "อย / มอก / เกษตร อื่นๆ",  value: "1,500 (ถ้ามี)" },
    ],
  },
  {
    icon: "🛂",
    heading: "ค่าใช้จ่ายด่าน",
    items: [
      { label: "ค่าธรรมเนียมด่าน",        value: "500-1,500 บาท" },
      { label: "ค่าฝ่ายปฏิบัติฯ",         value: "ตามด่าน" },
      { label: "ยิงใบขนอิเล็กทรอนิกส์",   value: "350 บาท" },
      { label: "ค่าธรรมเนียมกรมศุล",     value: "200 บาท" },
      { label: "ค่าล่วงเวลา",             value: "500 บาท" },
    ],
  },
  {
    icon: "🚛",
    heading: "ค่าขนส่งข้ามแดน",
    items: [
      { label: "รถบรรทุก (ตามด่าน + ปลายทาง)", value: "8,000-25,000 บาท" },
      { label: "แรงงานลงสินค้า",              value: "3,500-5,000 บาท" },
    ],
  },
  {
    icon: "⚠️",
    heading: "เพิ่มเติม (ขึ้นกับสินค้า)",
    items: [
      { label: "ค่าบริการพิเศษศุลกากร", value: "รอเช็ค" },
      { label: "ภาษีนำเข้า + VAT 7%",   value: "ตามมูลค่าสินค้า" },
    ],
  },
];

export const CUSTOMS_PORTS: CustomsPort[] = [
  {
    code: "bkk",
    slug: "bkk",
    name: "สุวรรณภูมิ",
    sub: "BKK · Air Cargo / Express",
    template: "air",
    modeBadge: "AIR FREIGHT",
    modeIcon: Plane,
    accent: "from-sky-500 to-sky-700",
    image: "/images/cardclearance/suwanboys.png",
    imageAlt: "เคลียร์สินค้า สุวรรณภูมิ Pacred",
    customsServiceFee: "2,800",
    shortDesc:
      "เคลียร์สินค้าด่วน / สินค้าติดด่านสุวรรณภูมิ — รองรับ Courier + Air Cargo เต็มรูป ผ่านด่านไว ลดค่าฝากเก็บ",
    subKeywords: [
      "เคลียร์สินค้าทางอากาศ",
      "เคลียร์ของติดด่านสุวรรณภูมิ",
      "เคลียร์ของ Air Cargo",
    ],
    pricingSections: AIR_PRICE_SECTIONS_BKK,
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "7,000+ บาท / บิล",
    summaryNote: "ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "dmk",
    slug: "dmk",
    name: "ดอนเมือง",
    sub: "DMK · Air Freight / Courier",
    template: "air",
    modeBadge: "AIR FREIGHT",
    modeIcon: Plane,
    accent: "from-sky-400 to-sky-600",
    image: "/images/cardclearance/donmueng.png",
    imageAlt: "เคลียร์สินค้า ดอนเมือง Pacred",
    customsServiceFee: "2,800",
    shortDesc:
      "เคลียร์ของติดด่านดอนเมือง · Courier + Air Freight ครบ — เอกสารพร้อม ผ่านด่านไว",
    subKeywords: [
      "เคลียร์สินค้าทางอากาศ",
      "เคลียร์ของติดด่านดอนเมือง",
      "เคลียร์ของ Air Freight",
    ],
    pricingSections: AIR_PRICE_SECTIONS_DMK,
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "6,800+ บาท / บิล",
    summaryNote: "ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "laksi",
    slug: "laksi",
    name: "ไปรษณีย์หลักสี่",
    sub: "Postal · พัสดุนำเข้า / EMS",
    template: "air",
    modeBadge: "POSTAL",
    modeIcon: Mail,
    accent: "from-rose-400 to-rose-600",
    image: "/images/cardclearance/praisaneelaksee.png",
    imageAlt: "เคลียร์พัสดุ ไปรษณีย์หลักสี่ Pacred",
    customsServiceFee: "2,800",
    shortDesc:
      "เคลียร์พัสดุไปรษณีย์ติดด่าน · EMS / Air Post — ปลดของผ่านศูนย์ไปรษณีย์ครบ ไม่มี D/O",
    subKeywords: [
      "เคลียร์พัสดุไปรษณีย์",
      "เคลียร์ของติดด่านหลักสี่",
      "เคลียร์ EMS / Air Post",
    ],
    pricingSections: POSTAL_PRICE_SECTIONS,
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "5,000+ บาท / บิล",
    summaryNote: "พัสดุไปรษณีย์ ไม่มี D/O",
  },
  {
    code: "klong",
    slug: "klong",
    name: "คลองเตย",
    sub: "PAT · Sea Port (LCL / FCL)",
    template: "sea",
    modeBadge: "SEA FREIGHT",
    modeIcon: Ship,
    accent: "from-blue-600 to-blue-800",
    image: "/images/cardclearance/klongtoey.png",
    imageAlt: "เคลียร์สินค้า คลองเตย Pacred",
    customsServiceFee: "3,500",
    shortDesc:
      "เคลียร์ของติดด่าน Port คลองเตย — FCL / LCL ครบ ประสานสายเรือ + ศุลกากรครบทุกขั้น",
    subKeywords: [
      "เคลียร์สินค้าทางเรือ",
      "เคลียร์ของติดด่านคลองเตย",
      "เคลียร์สินค้า Port PAT",
    ],
    pricingSections: SEA_PRICE_SECTIONS_KLONG,
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "14,000+ บาท / ตู้",
    summaryNote: "FCL · ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "laem",
    slug: "laem",
    name: "แหลมฉบัง",
    sub: "LCBT · Container Port (FCL)",
    template: "sea",
    modeBadge: "SEA FREIGHT",
    modeIcon: Container,
    accent: "from-blue-700 to-blue-900",
    image: "/images/cardclearance/laemport.png",
    imageAlt: "เคลียร์สินค้า แหลมฉบัง Pacred",
    customsServiceFee: "3,500",
    shortDesc:
      "เคลียร์ของติดด่าน Port แหลมฉบัง — FCL Container Port หลัก รองรับสายเรือยอดนิยม",
    subKeywords: [
      "เคลียร์สินค้าทางเรือ",
      "เคลียร์สินค้า Port แหลมฉบัง",
      "เคลียร์ของติดด่าน LCBT",
    ],
    pricingSections: SEA_PRICE_SECTIONS_LAEM,
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "16,000+ บาท / ตู้",
    summaryNote: "FCL · ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "icd",
    slug: "icd",
    name: "ICD ลาดกระบัง",
    sub: "Inland Depot · Sea (Drayed)",
    template: "sea",
    modeBadge: "INLAND DEPOT",
    modeIcon: Container,
    accent: "from-indigo-600 to-indigo-800",
    image: "/images/cardclearance/laemport.png",
    imageAlt: "เคลียร์สินค้า ICD ลาดกระบัง Pacred",
    customsServiceFee: "3,500",
    shortDesc:
      "เคลียร์ของติดด่าน ICD ลาดกระบัง — Inland Depot รับตู้จาก LCBT ใกล้กรุงเทพประหยัดค่าลาก",
    subKeywords: [
      "เคลียร์สินค้า ICD ลาดกระบัง",
      "เคลียร์ของติดด่านลาดกระบัง",
      "เคลียร์ตู้สินค้า Inland Depot",
    ],
    pricingSections: SEA_PRICE_SECTIONS_ICD,
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "14,500+ บาท / ตู้",
    summaryNote: "FCL · ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "border",
    slug: "border",
    name: "ด่านชายแดน",
    sub: "Truck · มุก / หนอง / อรัญ / แม่",
    template: "truck",
    modeBadge: "TRUCK · CROSS-BORDER",
    modeIcon: Truck,
    accent: "from-primary-500 to-primary-700",
    image: "/images/cardclearance/mukdahanport.png",
    imageAlt: "เคลียร์สินค้า ด่านชายแดน Pacred",
    customsServiceFee: "3,500",
    shortDesc:
      "เคลียร์ของติดด่านชายแดน · ทุกด่านรถ — มุกดาหาร · หนองคาย · อรัญประเทศ · แม่สาย รวมขนส่งข้ามแดน",
    subKeywords: [
      "เคลียร์สินค้าทางรถ",
      "เคลียร์ของติดด่านชายแดน",
      "นำเข้าสินค้าข้ามแดน",
    ],
    pricingSections: BORDER_PRICE_SECTIONS,
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "12,000+ บาท / เที่ยว",
    summaryNote: "ตามด่าน + ระยะทาง · ไม่รวมภาษี",
  },
];

export function findCustomsPortBySlug(slug: string): CustomsPort | undefined {
  return CUSTOMS_PORTS.find((p) => p.slug === slug);
}
