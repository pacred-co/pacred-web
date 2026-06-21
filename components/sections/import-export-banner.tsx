"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

/**
 * ImportExportBanner — rotating Pacred service-banner slot.
 *
 * ปอน 2026-06-21: the old popimportboded.png banner + "เลือกทีมขาย" modal was
 * retired site-wide and replaced with the v3 image-banner set (freight /
 * warehouse / ฝากสั่งซื้อ / เคลียร์), cycled ONE AT A TIME. The export name is
 * kept so all ~11 import sites (warehouses/*, services/*, about, faq, …) +
 * RotatingServiceBanner pick this up automatically.
 *
 * Behaviour (mirrors RotatingServiceBanner): random starting banner on mount,
 * advances every {INTERVAL_MS} with a soft cross-fade, never repeats the
 * current banner, respects prefers-reduced-motion. Each banner is a clean
 * image (text + price + CTA baked into the artwork) that links to LINE.
 * SSR-safe: server + first client render both use index 0 → no hydration clash.
 */

const V3_BANNERS = [
  { src: "/images/mainpage/banner/import-export/freight3.png",    alt: "บริการนำเข้า-ส่งออก เอกสารถูกต้อง Pacred — Freight FCL / LCL" },
  { src: "/images/mainpage/banner/import-export/warehousec3.png", alt: "โกดังรับสินค้า จีน-ไทย Pacred — Cargo / LCL นำเข้า-ส่งออก" },
  { src: "/images/mainpage/banner/import-export/purchase3.png",   alt: "ฝากสั่งซื้อสินค้าจากจีน 1688 Taobao Tmall Alibaba กับ Pacred Shipping" },
  { src: "/images/mainpage/banner/import-export/clearance3.png",  alt: "เคลียร์สินค้าติดด่าน เริ่มต้น 2,800 บาท — Pacred Shipping พิธีการศุลกากร" },
] as const;

const INTERVAL_MS = 7000;
const FADE_MS = 300; // keep in sync with the duration-300 class below

export function ImportExportBanner() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (V3_BANNERS.length < 2) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Pick the random starting banner on the NEXT tick (not synchronously in
    // the effect body — that trips the react-hooks set-state-in-effect rule).
    let current = 0;
    const kickoff = window.setTimeout(() => {
      current = Math.floor(Math.random() * V3_BANNERS.length);
      setIdx(current);
    }, 0);

    if (reduceMotion) return () => window.clearTimeout(kickoff); // no rotation

    const timer = window.setInterval(() => {
      setVisible(false); // fade out
      window.setTimeout(() => {
        let next = Math.floor(Math.random() * V3_BANNERS.length);
        while (next === current) next = Math.floor(Math.random() * V3_BANNERS.length);
        current = next;
        setIdx(next);
        setVisible(true); // fade the new one in
      }, FADE_MS);
    }, INTERVAL_MS);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  const b = V3_BANNERS[idx];
  return (
    <section className="py-3 md:py-5">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        <div className={`transition-opacity duration-300 ease-in-out ${visible ? "opacity-100" : "opacity-0"}`}>
          <TrackedExternalLink
            href={LINE_URL}
            cta="line_consult"
            surface="import_export_banner"
            ctaProps={{ position: "rotating_service_banner" }}
            aria-label={b.alt}
            className="group relative block overflow-hidden rounded-xl md:rounded-2xl shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
          >
            <Image
              src={b.src}
              alt={b.alt}
              width={2280}
              height={440}
              unoptimized
              sizes="(max-width: 768px) 100vw, 1120px"
              className="w-full h-auto transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            />
          </TrackedExternalLink>
        </div>
      </div>
    </section>
  );
}
