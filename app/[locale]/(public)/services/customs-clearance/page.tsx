import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ClearanceBanner } from "@/components/sections/clearance-banner";
import { ClearancePromo } from "@/components/sections/clearance-promo";
import { ClearanceProcess } from "@/components/sections/clearance-process";
import { ClearanceDocuments } from "@/components/sections/clearance-documents";
import { ClearancePermits } from "@/components/sections/clearance-permits";
import { ClearanceCards } from "@/components/sections/clearance-cards";
import { WhyPacred } from "@/components/sections/why-pacred";
import { ClearanceFAQ } from "@/components/sections/clearance-faq";
import { Reviews } from "@/components/sections/reviews";
import { Sales } from "@/components/sections/sales";
import { Blog } from "@/components/sections/blog";
import { Partner } from "@/components/sections/partner";
import { Footer } from "@/components/sections/footer";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/services/customs-clearance";
const NS = "seo.services.customsClearance";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

export default async function CustomsClearancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel  = typedLocale === "th" ? "บริการ" : "Services";
  const here      = typedLocale === "th" ? "เคลียร์ศุลกากร" : "Customs clearance";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "เคลียร์ศุลกากร" : "Customs clearance",
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: svcLabel, path: "/services" },
              { name: here, path: PATH },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <BookingCalculator landing="customs" />
        <ClearancePromo />
        <ClearanceCards />
        <ClearanceProcess />
        <ClearanceDocuments />
        <ClearancePermits />
        <ClearanceBanner />
        <WhyPacred />
        <Reviews />
        <Sales />
        <Blog />
        <ClearanceFAQ />
        <Partner />
      </main>
      <Footer />
    </>
  );
}
