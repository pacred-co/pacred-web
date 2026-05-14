import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { StatsBar } from "@/components/sections/stats-bar";
import { Promotion } from "@/components/sections/promotion";
import { OurService } from "@/components/sections/our-service";
import { ProductCategories } from "@/components/sections/product-categories";
import { PurchaseBanner } from "@/components/sections/purchase-banner";
import { PricingSection } from "@/components/sections/pricing-section";
import { ClearanceBanner } from "@/components/sections/clearance-banner";
import { ClearanceCards } from "@/components/sections/clearance-cards";
import { WhyPacred } from "@/components/sections/why-pacred";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { ContactSales } from "@/components/sections/contact-sales";
import { Reviews } from "@/components/sections/reviews";
import { Sales } from "@/components/sections/sales";
import { Blog } from "@/components/sections/blog";
import { Partner } from "@/components/sections/partner";
import { HomeArticle } from "@/components/sections/home-article";
import { Footer } from "@/components/sections/footer";
import { JsonLd } from "@/components/seo/json-ld";
import { serviceSchema } from "@/components/seo/schemas";

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
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
  };
}

const HOME_SERVICES: Array<{ name: string; slug: string; description: string }> = [
  {
    name: "นำเข้าสินค้าจากจีน FCL/LCL",
    slug: "/services/import-china",
    description: "บริการนำเข้าสินค้าจากจีน FCL · LCL · Door to Door ทุก Term ทุก Port",
  },
  {
    name: "ส่งออกสินค้าทั่วโลก",
    slug: "/services/export-worldwide",
    description: "ส่งออกสินค้าจากไทยทั่วโลก ทั้ง Air Freight · Sea Freight ครบเอกสาร",
  },
  {
    name: "เคลียร์ศุลกากร · สินค้าติดด่าน",
    slug: "/customs-clearance-shipping-suvarnabhumi",
    description: "ชิปปิ้งเคลียร์ภาษีและสินค้าติดด่าน รถ/เรือ/อากาศ",
  },
  {
    name: "ฝากสั่งซื้อสินค้าจีน",
    slug: "/services/china-shopping",
    description: "ฝากสั่ง 1688 · Taobao · Tmall · Alibaba พร้อมล่ามจีนปิดดีล",
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
      locale: localeTyped,
    }),
  );

  return (
    <>
      <JsonLd data={services} />
      <NavBar />
      <SearchBar />
      <main>
        <BookingCalculator />
        <StatsBar />
        <Promotion />
        <OurService />
        <ProductCategories />
        <PurchaseBanner />
        <PricingSection />
        <ClearanceBanner />
        <ClearanceCards />
        <WhyPacred />
        <ContactSales />
        <ImportExportBanner />
        <Reviews />
        <Sales />
        <Blog />
        <HomeArticle locale={localeTyped} />
        <Partner />
      </main>
      <Footer />
    </>
  );
}
