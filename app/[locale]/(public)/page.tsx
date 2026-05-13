import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { MobileTrustRibbon } from "@/components/sections/mobile-trust-ribbon";
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
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <>
      <NavBar />
      <SearchBar />
      <main>
        <BookingCalculator />
        <MobileTrustRibbon />
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
        <Partner />
      </main>
      <Footer />
    </>
  );
}
