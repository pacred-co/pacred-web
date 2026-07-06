import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { ExperimentBeacon } from "@/components/analytics/experiment-beacon";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { StatsBar } from "@/components/sections/stats-bar";
import { Promotion } from "@/components/sections/promotion";
import { OurService } from "@/components/sections/our-service";
import { CountrySwitcher } from "@/components/sections/country-switcher";
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
import { getPublicYuanRate } from "@/lib/public/yuan-rate";

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
  const tc = await getTranslations({ locale, namespace: "customsClearancePage" });
  // Live ฝากสั่ง rate (tb_settings.rsdefault) — the same value /cart charges.
  // Passed to the stats strip so the homepage stays in sync with the daily rate.
  const yuanRate = await getPublicYuanRate();

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
        {/* Mobile-only search bar — placed right after the บริการ so it starts BELOW
            the services, then sticks to the top on scroll (ปอน 2026-06-21). Must be a
            DIRECT child of <main> (not wrapped in a short div) so `position: sticky`
            can span the whole page rather than being clipped to a tiny wrapper. */}
        <SearchBar mobileOnly />
        {/* Stats strip — hidden on mobile (ปอน 2026-06-19), shown on desktop.
            Promotion stays visible on BOTH (ปอน asked to bring it back on mobile). */}
        <div className="hidden md:block">
          <StatsBar yuanRate={yuanRate} />
        </div>
        <Promotion />
        <OurService />
        {/* Country switcher — moved up to lead the สั่งซื้อ / browse-order flow
            (ปอน 2026-07-06 "เอาสลับประเทศเลื่อนขึ้นไปไว้ข้างบนสั่งซื้อ"). */}
        <CountrySwitcher />
        <ProductCategories />
        <PricingSection />
        {/* เคลียร์ของติดด่าน heading — lifted from the customs page so the home
            clearance block (banner + mode cards) gets a proper intro
            (ปอน 2026-06-21 "เอาหัวข้อหน้าเคลียร์มาขึ้นก่อนแบนเนอร์"). */}
        <section className="relative pt-3 md:pt-6 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              {tc("modeEyebrow")}
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {tc("modeH2Before")} <span className="text-primary-600">{tc("modeH2Highlight")}</span> {tc("modeH2After")}<span className="md:hidden"> {tc("modeH2Mobile")}</span>
            </h2>
          </div>
        </section>
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
