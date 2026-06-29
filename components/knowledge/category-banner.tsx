import Image from "next/image";
import { Link } from "@/i18n/navigation";

/**
 * Full-width SERVICE banner matched to a knowledge article's category
 * (ปอน 2026-06-29) — a big, uncropped, ad-style banner shown above the article
 * (desktop + mobile). Replaces the cramped sidebar banner so the whole 2280×440
 * v3 banner is visible + readable. Links to LINE consult.
 *
 *   เคลียร์ → clearance3 · นำเข้า → warehousec3 · ส่งออก → freight3
 */
const CATEGORY_BANNER: Record<string, { src: string; alt: string }> = {
  เคลียร์: { src: "/images/mainpage/banner/import-export/clearance3.png",  alt: "เคลียร์สินค้าติดด่าน เริ่มต้น 2,800 บาท — Pacred Shipping พิธีการศุลกากร" },
  นำเข้า:  { src: "/images/mainpage/banner/import-export/warehousec3.png", alt: "โกดังรับสินค้า จีน-ไทย Pacred — Cargo / LCL นำเข้า-ส่งออก" },
  ส่งออก:  { src: "/images/mainpage/banner/import-export/freight3.png",    alt: "บริการนำเข้า-ส่งออก เอกสารถูกต้อง Pacred — Freight FCL / LCL" },
};

export function CategoryBanner({ category }: { category?: string }) {
  const banner = (category && CATEGORY_BANNER[category]) || CATEGORY_BANNER["นำเข้า"];
  return (
    <Link
      href="/line"
      aria-label={`${banner.alt} · ทักไลน์ Pacred ปรึกษาฟรี`}
      className="group block overflow-hidden rounded-2xl md:rounded-3xl border border-border shadow-[0_10px_28px_-12px_rgba(15,23,42,0.25)] transition-transform duration-300 hover:-translate-y-0.5"
    >
      <Image
        src={banner.src}
        alt={banner.alt}
        width={2280}
        height={440}
        quality={95}
        sizes="(max-width: 1024px) 100vw, 1146px"
        className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.02]"
        priority
      />
    </Link>
  );
}
