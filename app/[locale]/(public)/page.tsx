import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { StatsBar } from "@/components/sections/stats-bar";
import { Promotion } from "@/components/sections/promotion";
import { OurService } from "@/components/sections/our-service";
import { ProductCategories } from "@/components/sections/product-categories";
import { PurchaseBanner } from "@/components/sections/purchase-banner";
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
        <StatsBar />
        <Promotion />
        <OurService />
        <ProductCategories />
        <PurchaseBanner />
        <Sales />
        <Blog />
        <Partner />
      </main>
      <Footer />
    </>
  );
}
