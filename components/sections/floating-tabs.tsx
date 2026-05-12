"use client";

import { useState } from "react";
import { LineIcon } from "@/components/icons/social-icons";

const floatingTabs = [
  { label: "หน้าแรก",    icon: "/images/home/iconfloating/pacred-home-main.png", href: "#home" },
  { label: "บริการ",     icon: "/images/home/iconfloating/pcs-shop.png",         href: "#services" },
  { label: "โปรโมชั่น", icon: "/images/home/iconfloating/ranka.png",             href: "#promotions" },
  { label: "บทความ",    icon: "/images/home/iconfloating/checklistred.png",      href: "#blog" },
  { label: "พาร์ทเนอร์",icon: "/images/home/iconfloating/people.png",            href: "#partner" },
  { label: "ติดต่อ",    icon: "/images/home/iconfloating/pcs-call-center.png",   href: "#contact" },
];

export function FloatingTabs() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <>
      {/* Vertical floating tabs — right center */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col shadow-xl">
        {floatingTabs.map((item, i) => (
          <a
            key={i}
            href={item.href}
            onClick={() => setActive(i)}
            className="group w-[64px] xl:w-[72px] py-3 bg-white dark:bg-surface border border-border flex flex-col items-center justify-center gap-1.5 text-[10px] font-medium text-muted hover:text-foreground transition-colors first:rounded-tl-xl last:rounded-bl-xl"
          >
            {item.icon && (
              <img
                src={item.icon}
                alt={item.label}
                className={`w-7 h-7 object-contain transition-all duration-300 ${
                  active === i
                    ? "grayscale-0 brightness-100 opacity-100"
                    : "grayscale brightness-75 opacity-60 group-hover:grayscale-0 group-hover:brightness-100 group-hover:opacity-100"
                }`}
              />
            )}
            <span className="text-center leading-tight">{item.label}</span>
          </a>
        ))}
      </div>

      {/* Floating action button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        <span className="rounded-full bg-white dark:bg-surface shadow-md px-4 py-2 text-sm font-medium text-foreground border border-border">
          สอบถามเพิ่มเติม
        </span>
        <button
          suppressHydrationWarning
          className="w-[70px] h-[70px] rounded-full bg-[#06C755] shadow-lg flex items-center justify-center hover:bg-[#05a548] transition-colors shrink-0 text-white"
          aria-label="Chat on LINE"
        >
          <LineIcon className="h-9 w-9" />
        </button>
      </div>
    </>
  );
}
