"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Plane,
  Anchor,
  Truck,
  Mail,
  Ship,
  Container,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Phone,
} from "lucide-react";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import { trackCtaClick } from "@/lib/analytics";

/**
 * Per-port pricing carousel for the customs-clearance landing.
 *
 * Replaces the old "3 Channels (Air/Sea/Truck)" section: ปอน asked for
 * location-based cards instead, each with a price breakdown the customer
 * can glance at before tapping LINE. 7 ports total (matches the
 * BookingPortTabs order). Snap-scroll carousel on both mobile and
 * desktop; on desktop mount we scroll-center สุวรรณภูมิ so it lands as
 * the default "main" card.
 *
 * Pricing is ballpark / "เริ่มต้น" — the canonical numbers ปอน gave for
 * สุวรรณภูมิ were used verbatim, the other 6 ports follow the same shape
 * with realistic delta (sea D/O > air D/O · postal has no D/O · border
 * inland transport dominates). Marked `noteSummary` so customers
 * understand the figure is an estimate and won't anchor on it.
 */

type PriceItem = { label: string; value: string };
type PriceSection = { icon: string; heading: string; items: PriceItem[] };

type Port = {
  code: "bkk" | "dmk" | "laksi" | "klong" | "laem" | "icd" | "border";
  name: string;
  sub: string;
  modeBadge: string;
  modeIcon: typeof Plane;
  accent: string;
  image: string;
  imageAlt: string;
  serviceTitle: string;
  sections: PriceSection[];
  summaryLabel: string;
  summaryPrice: string;
  summaryNote: string;
};

const PORTS: Port[] = [
  {
    code: "bkk",
    name: "สุวรรณภูมิ",
    sub: "BKK · Air Cargo / Express",
    modeBadge: "AIR FREIGHT",
    modeIcon: Plane,
    accent: "from-sky-500 to-sky-700",
    image: "/images/cardclearance/suwanboys.png",
    imageAlt: "เคลียร์สินค้า สุวรรณภูมิ Pacred",
    serviceTitle: "นำเข้าสินค้าทาง AIR · สุวรรณภูมิ",
    sections: [
      {
        icon: "💰",
        heading: "ค่าบริการหลัก",
        items: [
          { label: "ลงทะเบียนกรมศุลกากร",     value: "1,500 บาท" },
          { label: "ค่าพิธีการศุลกากร",        value: "3,500 บาท" },
          { label: "อย / มอก / เกษตร อื่นๆ", value: "1,500 (ถ้ามี)" },
        ],
      },
      {
        icon: "📦",
        heading: "ค่าใช้จ่ายสายการบิน / ท่า",
        items: [
          { label: "D/O",                  value: "รอเช็ค" },
          { label: "ค่าแลก D/O",            value: "421 บาท" },
          { label: "ค่าผ่านท่า",            value: "500 บาท" },
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
    ],
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "7,000+ บาท / บิล",
    summaryNote: "ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "dmk",
    name: "ดอนเมือง",
    sub: "DMK · Air Freight / Courier",
    modeBadge: "AIR FREIGHT",
    modeIcon: Plane,
    accent: "from-sky-400 to-sky-600",
    image: "/images/cardclearance/donmueng.png",
    imageAlt: "เคลียร์สินค้า ดอนเมือง Pacred",
    serviceTitle: "นำเข้าสินค้าทาง AIR · ดอนเมือง",
    sections: [
      {
        icon: "💰",
        heading: "ค่าบริการหลัก",
        items: [
          { label: "ลงทะเบียนกรมศุลกากร",     value: "1,500 บาท" },
          { label: "ค่าพิธีการศุลกากร",        value: "3,500 บาท" },
          { label: "อย / มอก / เกษตร อื่นๆ", value: "1,500 (ถ้ามี)" },
        ],
      },
      {
        icon: "📦",
        heading: "ค่าใช้จ่ายสายการบิน / ท่า",
        items: [
          { label: "D/O",                  value: "รอเช็ค" },
          { label: "ค่าแลก D/O",            value: "421 บาท" },
          { label: "ค่าผ่านท่า",            value: "450 บาท" },
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
    ],
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "6,800+ บาท / บิล",
    summaryNote: "ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "laksi",
    name: "ไปรษณีย์หลักสี่",
    sub: "Postal · พัสดุนำเข้า / EMS",
    modeBadge: "POSTAL",
    modeIcon: Mail,
    accent: "from-rose-400 to-rose-600",
    image: "/images/cardclearance/praisaneelaksee.png",
    imageAlt: "เคลียร์พัสดุ ไปรษณีย์หลักสี่ Pacred",
    serviceTitle: "เคลียร์พัสดุนำเข้า · ไปรษณีย์หลักสี่",
    sections: [
      {
        icon: "💰",
        heading: "ค่าบริการหลัก",
        items: [
          { label: "ลงทะเบียนกรมศุลกากร",     value: "1,500 บาท" },
          { label: "ค่าพิธีการศุลกากร",        value: "2,500 บาท" },
          { label: "อย / มอก / เกษตร อื่นๆ", value: "1,500 (ถ้ามี)" },
        ],
      },
      {
        icon: "📬",
        heading: "ค่าใช้จ่ายไปรษณีย์ / ด่าน",
        items: [
          { label: "ค่าตรวจไปรษณีย์",         value: "รอเช็ค" },
          { label: "ค่าผ่านศูนย์",            value: "300 บาท" },
          { label: "ยิงใบขนอิเล็กทรอนิกส์",   value: "350 บาท" },
          { label: "ค่าธรรมเนียมกรมศุล",     value: "200 บาท" },
          { label: "ค่าล่วงเวลา (ถ้ามี)",      value: "500 บาท" },
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
    ],
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "5,000+ บาท / บิล",
    summaryNote: "พัสดุไปรษณีย์ ไม่มี D/O",
  },
  {
    code: "klong",
    name: "คลองเตย",
    sub: "PAT · Sea Port (LCL / FCL)",
    modeBadge: "SEA FREIGHT",
    modeIcon: Ship,
    accent: "from-blue-600 to-blue-800",
    image: "/images/cardclearance/klongtoey.png",
    imageAlt: "เคลียร์สินค้า คลองเตย Pacred",
    serviceTitle: "นำเข้าสินค้าทางเรือ · คลองเตย",
    sections: [
      {
        icon: "💰",
        heading: "ค่าบริการหลัก",
        items: [
          { label: "ลงทะเบียนกรมศุลกากร",     value: "1,500 บาท" },
          { label: "ค่าพิธีการศุลกากร",        value: "3,500 บาท" },
          { label: "อย / มอก / เกษตร อื่นๆ", value: "1,500 (ถ้ามี)" },
        ],
      },
      {
        icon: "⚓",
        heading: "ค่าใช้จ่ายสายเรือ / ท่า",
        items: [
          { label: "D/O (สายเรือ)",          value: "2,500-3,500 บาท" },
          { label: "ค่าแลก D/O",             value: "500 บาท" },
          { label: "ค่าผ่านท่า PAT",         value: "1,500 บาท" },
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
    ],
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "14,000+ บาท / ตู้",
    summaryNote: "FCL · ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "laem",
    name: "แหลมฉบัง",
    sub: "LCBT · Container Port (FCL)",
    modeBadge: "SEA FREIGHT",
    modeIcon: Container,
    accent: "from-blue-700 to-blue-900",
    image: "/images/cardclearance/laemport.png",
    imageAlt: "เคลียร์สินค้า แหลมฉบัง Pacred",
    serviceTitle: "นำเข้าสินค้าทางเรือ · แหลมฉบัง",
    sections: [
      {
        icon: "💰",
        heading: "ค่าบริการหลัก",
        items: [
          { label: "ลงทะเบียนกรมศุลกากร",     value: "1,500 บาท" },
          { label: "ค่าพิธีการศุลกากร",        value: "3,500 บาท" },
          { label: "อย / มอก / เกษตร อื่นๆ", value: "1,500 (ถ้ามี)" },
        ],
      },
      {
        icon: "🚢",
        heading: "ค่าใช้จ่ายสายเรือ / ท่า",
        items: [
          { label: "D/O (สายเรือ)",          value: "2,500-3,500 บาท" },
          { label: "ค่าแลก D/O",             value: "500 บาท" },
          { label: "ค่าผ่านท่า LCBT",        value: "1,800 บาท" },
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
    ],
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "16,000+ บาท / ตู้",
    summaryNote: "FCL · ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "icd",
    name: "ICD ลาดกระบัง",
    sub: "Inland Depot · Sea (Drayed)",
    modeBadge: "INLAND DEPOT",
    modeIcon: Container,
    accent: "from-indigo-600 to-indigo-800",
    image: "/images/cardclearance/laemport.png",
    imageAlt: "เคลียร์สินค้า ICD ลาดกระบัง Pacred",
    serviceTitle: "นำเข้าสินค้าทางเรือ · ICD ลาดกระบัง",
    sections: [
      {
        icon: "💰",
        heading: "ค่าบริการหลัก",
        items: [
          { label: "ลงทะเบียนกรมศุลกากร",     value: "1,500 บาท" },
          { label: "ค่าพิธีการศุลกากร",        value: "3,500 บาท" },
          { label: "อย / มอก / เกษตร อื่นๆ", value: "1,500 (ถ้ามี)" },
        ],
      },
      {
        icon: "📦",
        heading: "ค่าใช้จ่ายสายเรือ / ท่า",
        items: [
          { label: "D/O (สายเรือ)",          value: "2,500-3,500 บาท" },
          { label: "ค่าแลก D/O",             value: "500 บาท" },
          { label: "ค่าผ่านท่า ICD",         value: "1,200 บาท" },
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
    ],
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "14,500+ บาท / ตู้",
    summaryNote: "FCL · ไม่รวมภาษี + ค่าใช้จ่ายแปรผัน",
  },
  {
    code: "border",
    name: "ด่านชายแดน",
    sub: "Truck · มุก / หนอง / อรัญ / แม่",
    modeBadge: "TRUCK · CROSS-BORDER",
    modeIcon: Truck,
    accent: "from-primary-500 to-primary-700",
    image: "/images/cardclearance/mukdahanport.png",
    imageAlt: "เคลียร์สินค้า ด่านชายแดน Pacred",
    serviceTitle: "นำเข้าสินค้าทางรถ · ด่านชายแดน",
    sections: [
      {
        icon: "💰",
        heading: "ค่าบริการหลัก",
        items: [
          { label: "ลงทะเบียนกรมศุลกากร",     value: "1,500 บาท" },
          { label: "ค่าพิธีการศุลกากร / ด่าน", value: "3,500 บาท" },
          { label: "อย / มอก / เกษตร อื่นๆ", value: "1,500 (ถ้ามี)" },
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
    ],
    summaryLabel: "สรุปเบื้องต้น",
    summaryPrice: "12,000+ บาท / เที่ยว",
    summaryNote: "ตามด่าน + ระยะทาง · ไม่รวมภาษี",
  },
];

export function PortPricingCarousel() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(true);

  // On desktop mount, scroll-center สุวรรณภูมิ so it lands as the default
  // hero card; on mobile it's already index 0 = first card so no shift
  // is needed.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      const bkk = el.querySelector<HTMLDivElement>('[data-port="bkk"]');
      if (bkk) {
        const offset =
          bkk.offsetLeft - el.clientWidth / 2 + bkk.offsetWidth / 2;
        el.scrollTo({ left: offset, behavior: "instant" });
      }
    }
  }, []);

  // Track scroll affordances on both edges
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const buttons = Array.from(el.querySelectorAll<HTMLElement>("[data-port]"));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (!first || !last) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === first) setCanLeft(!e.isIntersecting);
          if (e.target === last) setCanRight(!e.isIntersecting);
        }
      },
      { root: el, threshold: 0.85 },
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, []);

  function scrollByCard(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLDivElement>("[data-port]");
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.9;
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex gap-3 md:gap-4 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 md:-mx-5 px-4 md:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Invisible left spacer — only on lg+ — gives enough room for
            สุวรรณภูมิ (the first real card) to scroll to viewport
            center on desktop mount. Mobile keeps bkk flush as first. */}
        <div
          aria-hidden
          className="hidden lg:block shrink-0 snap-none w-[calc(50%-200px)]"
        />
        {PORTS.map((port) => (
          <PortCard key={port.code} port={port} />
        ))}
        {/* Matching right spacer so the last card can also scroll to
            viewport center on desktop. */}
        <div
          aria-hidden
          className="hidden lg:block shrink-0 snap-none w-[calc(50%-200px)]"
        />
      </div>

      {/* Desktop scroll buttons */}
      <button
        type="button"
        aria-label="เลื่อนซ้าย"
        onClick={() => scrollByCard(-1)}
        className={`hidden md:flex absolute left-[-18px] top-[42%] -translate-y-1/2 z-10 items-center justify-center w-11 h-11 rounded-full bg-white border border-border shadow-[0_8px_24px_rgba(15,23,42,0.12)] hover:border-primary-300 hover:text-primary-600 transition-all ${canLeft ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2.6} />
      </button>
      <button
        type="button"
        aria-label="เลื่อนขวา"
        onClick={() => scrollByCard(1)}
        className={`hidden md:flex absolute right-[-18px] top-[42%] -translate-y-1/2 z-10 items-center justify-center w-11 h-11 rounded-full bg-white border border-border shadow-[0_8px_24px_rgba(15,23,42,0.12)] hover:border-primary-300 hover:text-primary-600 transition-all ${canRight ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <ChevronRight className="w-5 h-5" strokeWidth={2.6} />
      </button>

      {/* Mobile pulsing chevrons */}
      <span
        aria-hidden
        className={`pointer-events-none md:hidden absolute top-[42%] left-1 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-primary-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.40)] ring-2 ring-white animate-pulse transition-opacity duration-200 ${canLeft ? "opacity-100" : "opacity-0"}`}
      >
        <ChevronLeft className="w-4 h-4" strokeWidth={3.2} />
      </span>
      <span
        aria-hidden
        className={`pointer-events-none md:hidden absolute top-[42%] right-1 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-primary-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.40)] ring-2 ring-white animate-pulse transition-opacity duration-200 ${canRight ? "opacity-100" : "opacity-0"}`}
      >
        <ChevronRight className="w-4 h-4" strokeWidth={3.2} />
      </span>
    </div>
  );
}

function PortCard({ port }: { port: Port }) {
  const Icon = port.modeIcon;
  return (
    <article
      data-port={port.code}
      className="snap-start lg:snap-center shrink-0 w-[88%] sm:w-[400px] lg:w-[400px] flex flex-col rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800 transition-all duration-400"
    >
      {/* Image header */}
      <div className="relative h-32 md:h-36 overflow-hidden">
        <Image
          src={port.image}
          alt={port.imageAlt}
          fill
          sizes="(max-width: 640px) 88vw, 400px"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
        />
        <div
          className={`absolute inset-0 bg-gradient-to-br ${port.accent} mix-blend-multiply opacity-25`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-primary-700 text-[10px] md:text-[11px] font-black tracking-[0.10em] shadow-md">
            <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
            {port.modeBadge}
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-[18px] md:text-[20px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            {port.name}
          </h3>
          <p className="mt-0.5 text-[11px] md:text-[12px] text-white/85 font-medium drop-shadow">
            {port.sub}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-4 md:p-5 gap-4">
        <p className="text-[12px] md:text-[12.5px] font-bold text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
          {port.serviceTitle}
        </p>

        {port.sections.map((sec) => (
          <div key={sec.heading}>
            <div className="text-[11.5px] md:text-[12px] font-black text-[#111827] dark:text-white mb-2 flex items-center gap-1.5">
              <span aria-hidden>{sec.icon}</span>
              <span>{sec.heading}</span>
            </div>
            <ul className="space-y-1.5">
              {sec.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-baseline justify-between gap-3 text-[11.5px] md:text-[12.5px] leading-snug"
                >
                  <span className="text-muted font-medium">{item.label}</span>
                  <span className="text-foreground font-bold whitespace-nowrap">
                    {item.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Footer — summary + CTA */}
      <div className="border-t border-border bg-primary-50/40 dark:bg-primary-900/15 px-4 md:px-5 py-3.5 md:py-4">
        <div className="flex items-center gap-2 mb-2.5">
          <span aria-hidden className="text-[18px]">📌</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] md:text-[11px] font-bold text-muted tracking-[0.08em] uppercase leading-none">
              {port.summaryLabel}
            </div>
            <div className="mt-0.5 text-[15px] md:text-[16px] font-black text-primary-700 dark:text-primary-300 leading-tight">
              {port.summaryPrice}
            </div>
            <div className="text-[10.5px] md:text-[11px] text-muted font-medium mt-0.5">
              {port.summaryNote}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={LINE_OA.shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackCtaClick("line_cta", "customs_port_pricing", {
                port: port.code,
              })
            }
            className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg bg-[#06C755] text-white font-black text-[12.5px] md:text-[13px] hover:bg-[#05B04C] transition-colors shadow-[0_4px_12px_rgba(6,199,85,0.30)]"
          >
            <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.6} />
            ทักไลน์
          </a>
          <a
            href={`tel:${CONTACT.phone}`}
            onClick={() =>
              trackCtaClick("phone_cta", "customs_port_pricing", {
                port: port.code,
              })
            }
            className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border border-primary-200 bg-white text-primary-700 font-black text-[12.5px] md:text-[13px] hover:bg-primary-50 hover:border-primary-300 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-200"
          >
            <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
            โทรเลย
          </a>
        </div>
      </div>
    </article>
  );
}
