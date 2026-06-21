import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { ExperimentBeacon } from "@/components/analytics/experiment-beacon";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { StatsBar } from "@/components/sections/stats-bar";
import { Promotion } from "@/components/sections/promotion";
import { OurService } from "@/components/sections/our-service";
import { ProductCategories } from "@/components/sections/product-categories";
import { PricingSection } from "@/components/sections/pricing-section";
import { GuaranteeBanner } from "@/components/sections/guarantee-banner";
import { CustomsModeCards } from "@/components/sections/customs-mode-cards";
import { WhyPacred } from "@/components/sections/why-pacred";
import { ContactSales } from "@/components/sections/contact-sales";
import { Reviews } from "@/components/sections/reviews";
import { Blog } from "@/components/sections/blog";
import { Partner } from "@/components/sections/partner";
import { HomeArticle } from "@/components/sections/home-article";
import { HomeRelatedTags } from "@/components/sections/home-related-tags";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { Footer } from "@/components/sections/footer";
import { JsonLd } from "@/components/seo/json-ld";
import { serviceSchema } from "@/components/seo/schemas";
import { ogImageUrl } from "@/components/seo/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.home" });
  const canonical = locale === "th" ? "/" : `/${locale}`;
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical,
      languages: { "th-TH": "/", "en-US": "/en", "x-default": "/" },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      type: "website",
      url: canonical,
      images: [{ url: ogImageUrl("home"), width: 1200, height: 630, alt: t("title") }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
      images: [ogImageUrl("home")],
    },
  };
}

const HOME_SERVICES: Array<{ name: string; slug: string; description: string; image: string }> = [
  {
    name: "นำเข้าสินค้าจากจีน FCL/LCL",
    slug: "/services/import-china",
    description: "บริการนำเข้าสินค้าจากจีน FCL · LCL · Door to Door ทุก Term ทุก Port",
    image: "/images/bannerdesktop/bannershipdesktop01.png",
  },
  {
    name: "ส่งออกสินค้าทั่วโลก",
    slug: "/services/export-worldwide",
    description: "ส่งออกสินค้าจากไทยทั่วโลก ทั้ง Air Freight · Sea Freight ครบเอกสาร",
    image: "/images/hero-section/banner/airbanner.png",
  },
  {
    name: "เคลียร์ศุลกากร · สินค้าติดด่าน",
    slug: "/customs-clearance-shipping-suvarnabhumi",
    description: "ชิปปิ้งเคลียร์ภาษีและสินค้าติดด่าน รถ/เรือ/อากาศ",
    image: "/images/bannerdesktop/clearancedesktop4.png",
  },
  {
    name: "ฝากสั่งซื้อสินค้าจีน",
    slug: "/services/china-shopping",
    description: "ฝากสั่ง 1688 · Taobao · Tmall · Alibaba พร้อมล่ามจีนปิดดีล",
    image: "/images/bannerdesktop/shoppingbanner02.png",
  },
];

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const localeTyped = (locale === "en" ? "en" : "th") as "th" | "en";

  const services = HOME_SERVICES.map((s) =>
    serviceSchema({
      name: s.name,
      description: s.description,
      slug: s.slug,
      image: s.image,
      locale: localeTyped,
    }),
  );

  return (
    <>
      <JsonLd data={services} />
      <ExperimentBeacon experimentKey="home_hero_cta" />
      <NavBar />
      {/* Search bar — DESKTOP = sticky at the top (unchanged). On MOBILE it moves
          below the บริการ (ปอน 2026-06-21: "เฉพาะมือถือ เอา search bar ไปถัดจากบริการ"):
          this top instance is desktop-only, the inline one below the BookingCalculator
          is mobile-only. */}
      <SearchBar hideOnMobile />
      <main>
        <BookingCalculator />
        {/* Mobile-only inline search bar, right after the บริการ (BookingTabs). */}
        <div className="md:hidden">
          <SearchBar inline />
        </div>
        {/* Stats strip — hidden on mobile (ปอน 2026-06-19), shown on desktop.
            Promotion stays visible on BOTH (ปอน asked to bring it back on mobile). */}
        <div className="hidden md:block">
          <StatsBar />
        </div>
        <Promotion />
        <OurService />
        <ProductCategories />
        <PricingSection />
        <GuaranteeBanner />
        <section className="relative pt-1.5 md:pt-5 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-[10px] md:px-5">
            <CustomsModeCards />
          </div>
        </section>
        <WhyPacred />
        <ContactSales />
        <Reviews />
        <Blog />
        <HomeArticle locale={localeTyped} />
        <HomeBottomBanner />
        <HomeRelatedTags />
        <Partner />
      </main>
      <Footer />
    </>
  );
}
