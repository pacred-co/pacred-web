import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Star, Sparkles, BadgeCheck } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { Reviews } from "@/components/sections/reviews";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { SITE_URL } from "@/components/seo/site";
import { REVIEWS, reviewSlug } from "@/lib/reviews/catalog";

// Dynamic render — the shared <NavBar> reads auth cookies (a dynamic API);
// static prerender would throw DYNAMIC_SERVER_USAGE in production.
export const dynamic = "force-dynamic";

const PATH = "/our-work";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    path: PATH,
    namespace: "seo.reviews.index",
  });
}

export default async function ReviewsListingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: "reviews" });

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name:
      typedLocale === "th"
        ? "ผลงาน Pacred — นำเข้าจีน + เคลียร์ศุลกากร"
        : "Pacred case studies — China import + customs clearance",
    itemListElement: REVIEWS.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${typedLocale === "en" ? "/en" : ""}/our-work/${reviewSlug(r, typedLocale)}`,
      name: t(r.titleKey),
    })),
  };

  const ui =
    typedLocale === "th"
      ? {
          eyebrow: "PACRED CASE STUDIES · ผลงานของเรา",
          titleA: "ผลงาน",
          titleBrand: "Pacred",
          titleB: "— นำเข้าจีน · เคลียร์ศุลกากร",
          subtitle:
            "ผลงานจริงของ Pacred Shipping — นำเข้า FCL เหมาตู้ / LCL เปิดใบขนจากจีน และเคลียร์สินค้าติดด่านทางรถ เรือ แอร์ ครบทุกเทอม DDP/CIF กดการ์ดไหนก็ได้เพื่อดูรายละเอียดแต่ละเคส",
          statReviews: `${REVIEWS.length} เคสงานจริง`,
          statRating: "5.0 คะแนนเฉลี่ย",
          statVerified: "ผลงานจริงของ Pacred",
        }
      : {
          eyebrow: "PACRED CASE STUDIES · Our work",
          titleA: "Pacred",
          titleBrand: "case studies",
          titleB: "— China import & customs clearance",
          subtitle:
            "Real Pacred Shipping projects — China FCL full-container and LCL consolidated imports, plus customs clearance by road, sea, and air across DDP/CIF terms. Tap any card to see the full case.",
          statReviews: `${REVIEWS.length} real cases`,
          statRating: "5.0 average rating",
          statVerified: "Real Pacred work",
        };

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema(
            [
              { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
              {
                name: typedLocale === "th" ? "ผลงานของเรา" : "Our work",
                path: PATH,
              },
            ],
            typedLocale,
          ),
          itemList,
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative pt-6 md:pt-10 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">
            <div className="mx-auto w-full max-w-[1120px] text-center md:text-left">
              <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
                <Star className="w-3.5 h-3.5 fill-primary-600" strokeWidth={2.8} />
                {ui.eyebrow}
              </div>
              <h1 className="text-[28px] md:text-[42px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                {ui.titleA}{" "}
                <span className="text-primary-600">{ui.titleBrand}</span>{" "}
                {ui.titleB}
              </h1>
              <p className="mt-3 text-[14px] md:text-[16px] leading-[1.6] text-muted max-w-[820px] md:mx-0 mx-auto">
                {ui.subtitle}
              </p>

              {/* Stat pills */}
              <div className="mt-5 md:mt-6 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-[12px] md:text-[12.5px] font-black border border-primary-100 dark:border-primary-900/40">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
                  {ui.statReviews}
                </span>
                <span className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3.5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white text-[12px] md:text-[12.5px] font-black border border-border">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" strokeWidth={1.8} />
                  {ui.statRating}
                </span>
                <span className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3.5 rounded-full bg-white dark:bg-surface text-primary-600 text-[12px] md:text-[12.5px] font-black border border-border">
                  <BadgeCheck className="w-3.5 h-3.5" strokeWidth={2.8} />
                  {ui.statVerified}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Carousel + filters (the homepage reviews section, reused) */}
        <Reviews />

        <HomeBottomBanner />
      </main>
      <Footer />
    </>
  );
}
