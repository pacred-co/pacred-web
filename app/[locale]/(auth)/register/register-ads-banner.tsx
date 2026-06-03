"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * RegisterAdsBanner — the LEFT panel of the /register layout (desktop only).
 *
 * Owner directive (2026-06-02): full-bleed banner flush to the left edge of the
 * screen, full height (object-cover). The white form panel beside it curves over
 * this banner's right edge (see register-client.tsx md:-ml-12 + md:rounded-l).
 * Auto-rotates the ad PNGs in public/images/registerads/ with clickable dots.
 *
 * Hidden < md so mobile keeps the form full-width + thumb-reachable (AGENTS.md §6).
 */
const ADS = [
  { src: "/images/registerads/custom02.png", alt: "บริการเคลียร์ภาษี พิธีการศุลกากร — Pacred" },
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
      className="relative hidden w-2/5 shrink-0 overflow-hidden bg-primary-700 md:block"
    >
      {ADS.map((ad, i) => (
        <Image
          key={ad.src}
          src={ad.src}
          alt={ad.alt}
          fill
          sizes="40vw"
          priority={i === 0}
          className={`object-cover object-top transition-opacity duration-700 ease-in-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
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
