import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

/**
 * ของติดด่าน (clearance) promo banner — image-only: the headline + ฿2,800 price +
 * partner logos (DHL/FedEx/UPS/TNT) + ด่านศุลกากร + character are all baked into the
 * artwork. Clickable → LINE, hover-zoom. Same image pattern as PurchaseBanner /
 * WarehouseRateGroup (ปอน 2026-06-21: "เปลี่ยนแบนเนอร์เป็นเซ็ทใหม่ … เคลียร์ด้วย").
 * Replaced the old CSS-gradient build (separate headline + Visit photo + clickable
 * partner row) with the v3 image `clearance3.png` (2280×440). i18n kept for a11y.
 */
export async function GuaranteeBanner() {
  const t = await getTranslations("guaranteeBanner");
  return (
    <section className="py-1.5 md:py-5">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
        <TrackedExternalLink
          href={LINE_URL}
          cta="line_consult"
          surface="home_guarantee_banner"
          aria-label={t("bannerAria")}
          className="group relative block max-w-[1100px] mx-auto overflow-hidden rounded-xl md:rounded-2xl shadow-[0_6px_18px_rgba(15,23,42,0.08)]"
        >
          <Image
            src="/images/mainpage/banner/import-export/clearance3.png"
            alt="เคลียร์สินค้าติดด่าน เริ่มต้น 2,800 บาท — Pacred Shipping พิธีการศุลกากร"
            width={2280}
            height={440}
            unoptimized
            sizes="(max-width: 768px) 100vw, 1100px"
            className="w-full h-auto transition-transform duration-500 ease-out group-hover:scale-[1.05]"
          />
          <span className="sr-only">{t("bannerSrOnly")}</span>
        </TrackedExternalLink>
      </div>
    </section>
  );
}
