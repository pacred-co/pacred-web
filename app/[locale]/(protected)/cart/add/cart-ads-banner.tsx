"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { LINE_OA } from "@/components/seo/site";

/**
 * CartAdsBanner — the right-side rotating promo banner on /cart/add (desktop).
 *
 * Owner 2026-07-30: "เอาแบนเนอร์ที่ขึ้นตรงหน้าสมัครมาขึ้นเลย แล้วให้มันเปลี่ยนเองอัตโนมัติ" —
 * reuse the SAME auto-rotating ad set as the /register page (RegisterAdsBanner).
 * The ads are 1080×1920 (9:16) = exactly the box ratio, so object-cover fills the
 * fixed 400px × 9:16 box edge-to-edge with no crop. Crossfades every 4.5s and has
 * clickable dots. Desktop-only (the aside is `hidden lg:block`).
 */
const ADS = [
  { src: "/images/registerads/custom02.png", alt: "บริการเคลียร์ภาษี พิธีการศุลกากร — Pacred" },
  { src: "/images/registerads/order01.png", alt: "ฝากสั่งซื้อสินค้าจากจีน 1688 · Taobao — Pacred" },
  { src: "/images/registerads/order02.png", alt: "ฝากสั่งซื้อ ฝากโอนชำระค่าสินค้า — Pacred" },
] as const;

const ROTATE_MS = 4500;

/**
 * `single` = โชว์ภาพเดียวนิ่งๆ ไม่หมุน ไม่มีจุดสไลด์ (owner 2026-08-04 "ใช้ภาพนี้แทน
 * เอาขึ้นมาเป็นภาพเดียวเลย") — ใช้ที่หน้า /cart/add/manual. ไม่ส่ง = ชุดหมุนเดิม
 * ของ /cart/add เหมือนเดิมทุกอย่าง.
 * ภาพต้องเป็นสัดส่วน 9:16 เท่ากรอบ ไม่งั้น object-cover จะครอป.
 */
export function CartAdsBanner({ single }: { single?: { src: string; alt: string } } = {}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (single) return; // ภาพเดียว = ไม่ต้องตั้งตัวจับเวลา
    const timer = setInterval(() => setActive((i) => (i + 1) % ADS.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [single]);

  if (single) {
    // ภาพนี้ชวนให้ "ส่งลิงก์ให้ทีมงาน" อยู่แล้ว → กดแล้วไป LINE OA เลย
    // (owner 2026-08-04 "ทำให้กดแล้วไป line เวลาเอาเมาส์ชี้แล้วให้ซูมด้วยเล็กน้อย").
    // ซูม "ตัวรูปข้างใน" ไม่ใช่ทั้งกล่อง — กล่อง overflow-hidden ครอบไว้ ภาพเลยขยาย
    // อยู่ในกรอบเดิม ไม่ดันของข้างๆ และไม่ทำให้หน้าขยับ.
    return (
      <a
        href={LINE_OA.shortUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="ส่งลิงก์สินค้าให้ทีมงานทางไลน์"
        aria-label="ส่งลิงก์สินค้าให้ทีมงานทางไลน์ (เปิดแท็บใหม่)"
        className="group relative block aspect-[9/16] w-full overflow-hidden rounded-2xl bg-primary-700 shadow-md transition-shadow duration-300 hover:shadow-lg"
      >
        <Image
          src={single.src}
          alt={single.alt}
          fill
          sizes="400px"
          priority
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      </a>
    );
  }

  return (
    <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl bg-primary-700 shadow-md">
      {ADS.map((ad, i) => (
        <Image
          key={ad.src}
          src={ad.src}
          alt={ad.alt}
          fill
          sizes="400px"
          priority={i === 0}
          className={`object-cover transition-opacity duration-700 ease-in-out ${
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* slide dots */}
      <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2">
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
    </div>
  );
}
