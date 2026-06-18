"use client";

import Image from "next/image";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

/**
 * ฝากสั่งซื้อ banner — image-only (text baked into the artwork), clickable → LINE,
 * hover-zoom. Same pattern as the warehouse banner (WarehouseRateGroup):
 * full-width responsive image at q=100 inside a rounded card. The previous
 * green-card + sales-picker-modal design was retired per owner 2026-06-17
 * ("เอาตัวอักษรออก · ทำรูปแบบเดียวกับภาพโกดัง").
 *
 * Shared component — also rendered on /service-payment (yuan-transfer),
 * /services/china-shopping, the home ProductCategories block, and the
 * RotatingServiceBanner. The image carries Pacred's own LINE + phone CTA.
 */
export function PurchaseBanner() {
  return (
    <section className="py-3 md:py-5">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        <TrackedExternalLink
          href={LINE_URL}
          cta="line_consult"
          surface="purchase_banner"
          ctaProps={{ position: "purchase_banner" }}
          aria-label="ฝากสั่งซื้อสินค้าจากจีน 1688 Taobao Alibaba — ติดต่อ Pacred ทาง LINE"
          className="group relative block overflow-hidden rounded-xl md:rounded-2xl shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
        >
          <Image
            src="/images/mainpage/banner/import-export/purchase2.png"
            alt="ฝากสั่งซื้อสินค้าจากจีน 1688 Taobao Tmall Alibaba กับ Pacred Shipping"
            width={2280}
            height={440}
            unoptimized
            sizes="(max-width: 768px) 100vw, 1120px"
            className="w-full h-auto transition-transform duration-500 ease-out group-hover:scale-[1.05]"
          />
        </TrackedExternalLink>
      </div>
    </section>
  );
}
