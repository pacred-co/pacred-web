"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { LineIcon } from "@/components/icons/social-icons";

const floatingTabs = [
  { label: "หน้าแรก",    icon: "/images/home/iconfloating/pacred-home-main.png", href: "#home" },
  { label: "บริการ",     icon: "/images/home/iconfloating/pcs-shop.png",         href: "#services" },
  { label: "โปรโมชั่น", icon: "/images/home/iconfloating/ranka.png",             href: "#promotions" },
  { label: "บทความ",    icon: "/images/home/iconfloating/checklistred.png",      href: "/knowledge" },
  { label: "พาร์ทเนอร์",icon: "/images/home/iconfloating/people.png",            href: "#partner" },
  { label: "ติดต่อ",    icon: "/images/home/iconfloating/pcs-call-center.png",   href: "#contact" },
];

export function FloatingTabs() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <>
      {/* Vertical floating tabs — right center (desktop only) */}
      <div className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-50 flex-col shadow-xl">
        {floatingTabs.map((item, i) => {
          const isAnchor = item.href.startsWith("#");
          const cls = "group w-[64px] xl:w-[72px] py-3 bg-white dark:bg-surface border border-border flex flex-col items-center justify-center gap-1.5 text-[10px] font-medium text-muted hover:text-foreground transition-colors first:rounded-tl-xl last:rounded-bl-xl";
          const inner = (
            <>
              {item.icon && (
                // eslint-disable-next-line @next/next/no-img-element
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
            </>
          );
          return isAnchor ? (
            <a key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
              {inner}
            </Link>
          );
        })}
      </div>

      {/* Bottom navigation bar (mobile only) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-surface/95 backdrop-blur-md border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-6">
          {floatingTabs.map((item, i) => {
            const isAnchor = item.href.startsWith("#");
            const isActive = active === i;
            const cls = "group flex flex-col items-center justify-center gap-0.5 py-2 transition-colors active:bg-primary-50/60 dark:active:bg-primary-900/20";
            const inner = (
              <>
                {item.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.icon}
                    alt={item.label}
                    className={`w-6 h-6 object-contain transition-all duration-300 ${
                      isActive
                        ? "grayscale-0 brightness-100 opacity-100 scale-110"
                        : "grayscale brightness-75 opacity-70"
                    }`}
                  />
                )}
                <span className={`text-[9.5px] leading-tight font-medium ${
                  isActive ? "text-primary-600 font-bold" : "text-muted"
                }`}>
                  {item.label}
                </span>
              </>
            );
            return isAnchor ? (
              <a key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
                {inner}
              </a>
            ) : (
              <Link key={i} href={item.href} onClick={() => setActive(i)} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Floating LINE bubble — sits above mobile bottom nav */}
      <div className="fixed bottom-[78px] right-3 md:bottom-6 md:right-6 z-[51] flex items-center gap-2 md:gap-3">
        <span className="hidden sm:block rounded-full bg-white dark:bg-surface shadow-md px-4 py-2 text-sm font-medium text-foreground border border-border">
          สอบถามเพิ่มเติม
        </span>
        <a
          href="https://lin.ee/Yg3fU0I"
          target="_blank"
          rel="noopener noreferrer"
          suppressHydrationWarning
          className="w-[52px] h-[52px] md:w-[70px] md:h-[70px] rounded-full bg-[#06C755] shadow-lg flex items-center justify-center hover:bg-[#05a548] transition-colors shrink-0 text-white"
          aria-label="Chat on LINE"
        >
          <LineIcon className="h-7 w-7 md:h-9 md:w-9" />
        </a>
      </div>
    </>
  );
}
