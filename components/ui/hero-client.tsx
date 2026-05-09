"use client";

import { useState } from "react";
import Image from "next/image";
import { HeroTabs } from "@/components/ui/hero-tabs";

const Y = "#FDE047";

const TABS_CONTENT = [
  {
    image: "/images/hero-section/banner/shipbanner.png",
    title: ["นำเข้าสินค้าจากจีนทางเรือ LCL ", "แชร์ตู้"],
    subtitle: "FOB · EXW · DDP · โกดัง Pacred กวางโจว + อี้อู",
  },
  {
    image: "/images/hero-section/banner/leac.png",
    title: ["ขนส่งสินค้าจากจีนทางรถ ", "DDP ส่งถึงบ้าน 5–7 วัน"],
    subtitle: "จ่ายครั้งเดียว รวมขนส่ง ภาษี ศุลกากร ส่งถึงหน้าบ้าน — ไม่มีค่าแอบแฝง",
  },
  {
    image: "/images/hero-section/banner/airbanner.png",
    title: ["ขนส่งทางอากาศ นำเข้า-ส่งออก ", "เร็วสุด 3–5 วัน"],
    subtitle: "AWB Real-time · เคลียร์ศุลกากร · รับ-ส่งทุกสนามบิน · ทั้งนำเข้าและส่งออก",
  },
  {
    image: "/images/hero-section/banner/sulakabanner.png",
    title: ["เคลียร์สินค้าติดด่าน ศุลกากร ", "ทุกด่านทั่วไทย"],
    subtitle: "บริการเคลียร์สินค้าติดด่านแบบครบวงจร ราคาชัดเจน พร้อมให้คำปรึกษา",
  },
  {
    image: "/images/hero-section/banner/saofire.png",
    title: ["ฝากสั่งซื้อสินค้าจากจีน ", "1688 · Taobao · โรงงาน"],
    subtitle: "เรทหยวนพิเศษ · ตรวจสินค้าก่อนส่ง · ขนส่งครบวงจร",
  },
  {
    image: "/images/hero-section/banner/heropay.png",
    title: ["โอนชำระค่าสินค้าต่างประเทศ ", "T/T Wire Transfer"],
    subtitle: "ไม่ต้องมีบัญชีธนาคารจีน · เงินถึงโรงงาน 1–2 วันทำการ · มีสัญญารับรอง",
  },
];

export function HeroClient() {
  const [activeTab, setActiveTab] = useState<number>(0);

  const { image, title, subtitle } = TABS_CONTENT[activeTab];

  return (
    <div className="mx-auto w-full max-w-[1120px]">
      {/* Banner */}
      <div className="relative h-[280px] w-full overflow-hidden rounded-2xl">
        <Image
          src={image}
          alt=""
          fill
          className="object-cover transition-opacity duration-500"
          priority
        />
        {/* Text overlay */}
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 text-center px-10">
          <h1 className="text-3xl font-bold leading-snug text-white md:text-4xl">
            {title[0]}
            <span style={{ color: Y }}>{title[1]}</span>
          </h1>
          <p
            className="text-base leading-relaxed text-white"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)" }}
          >
            {subtitle}
          </p>
        </div>
      </div>

      {/* Tabs — overlaps bottom of banner */}
      <div className="relative z-20 mx-6 -mt-9">
        <HeroTabs onActiveChange={(i) => setActiveTab(i ?? 0)} />
      </div>
    </div>
  );
}
