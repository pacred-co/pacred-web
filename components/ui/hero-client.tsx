"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { HeroTabs } from "@/components/ui/hero-tabs";

const Y = "#FDE047";

const TAB_IMAGES = [
  "/images/hero-section/banner/shipbanner.png",
  "/images/hero-section/banner/leac.png",
  "/images/hero-section/banner/airbanner.png",
  "/images/hero-section/banner/sulakabanner.png",
  "/images/hero-section/banner/saofire.png",
  "/images/hero-section/banner/heropay.png",
];

const TAB_KEYS: { title1: string; title2: string; sub: string }[] = [
  { title1: "tab1Title1", title2: "tab1Title2", sub: "tab1Sub" },
  { title1: "tab2Title1", title2: "tab2Title2", sub: "tab2Sub" },
  { title1: "tab3Title1", title2: "tab3Title2", sub: "tab3Sub" },
  { title1: "tab4Title1", title2: "tab4Title2", sub: "tab4Sub" },
  { title1: "tab5Title1", title2: "tab5Title2", sub: "tab5Sub" },
  { title1: "tab6Title1", title2: "tab6Title2", sub: "tab6Sub" },
];

export function HeroClient() {
  const t = useTranslations("heroBanner");
  const [activeTab, setActiveTab] = useState<number>(0);

  const image = TAB_IMAGES[activeTab];
  const k = TAB_KEYS[activeTab];

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
            {t(k.title1)}
            <span style={{ color: Y }}>{t(k.title2)}</span>
          </h1>
          <p
            className="text-base leading-relaxed text-white"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.5)" }}
          >
            {t(k.sub)}
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
