"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * RegisterAdsBanner — the LEFT half of the split-screen /register layout.
 *
 * Owner directive (2026-06-02): split the register page in half like the
 * reference — a promotional banner on the left, the (unchanged) signup form
 * on the right. Auto-rotates the four portrait (1080×1920) ad PNGs in
 * `public/images/registerads/` with clickable dots.
 *
 * Desktop-only (`hidden md:block`): on mobile the form stays full-width +
 * thumb-reachable (most Pacred customers sign up on a phone — AGENTS.md §6),
 * so the banner is suppressed below `md`.
 */
const ADS = [
  { src: "/images/registerads/custom01.png", alt: "บริการเคลียร์ภาษี พิธีการศุลกากร — Pacred" },
  { src: "/images/registerads/order01.png", alt: "ฝากสั่งซื้อสินค้าจากจีน 1688 · Taobao — Pacred" },
  { src: "/images/registerads/order02.png", alt: "ฝากสั่งซื้อ ฝากโอนชำระค่าสินค้า — Pacred" },
] as const;

const ROTATE_MS = 4500;

export function RegisterAdsBanner() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setActive((i) => (i + 1) % ADS.length),
      ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <aside
      aria-label="โปรโมชั่นและบริการของ Pacred"
      className="relative hidden w-1/2 overflow-hidden bg-primary-700 md:block"
    >
      {ADS.map((ad, i) => (
        <div
          key={ad.src}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        >
          {/* Blurred fill — the 9:16 portrait ad is taller than the half-column,
              so a zoomed, blurred copy fills the space behind (no empty side bars)
              while the sharp ad below is never cropped. */}
          <Image
            src={ad.src}
            alt=""
            aria-hidden
            fill
            sizes="50vw"
            priority={i === 0}
            className="scale-110 object-cover blur-2xl"
          />
          {/* The full ad — object-contain so the top is never cut by the navbar. */}
          <Image
            src={ad.src}
            alt={ad.alt}
            fill
            sizes="50vw"
            priority={i === 0}
            className="object-contain"
          />
        </div>
      ))}

      {/* slide dots */}
      <div className="absolute inset-x-0 bottom-5 z-10 flex justify-center gap-2">
        {ADS.map((ad, i) => (
          <button
            key={ad.src}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`สไลด์ที่ ${i + 1}`}
            aria-current={i === active || undefined}
            className={`h-2 rounded-full transition-all ${
              i === active ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </aside>
  );
}
