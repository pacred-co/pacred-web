import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { HeroSection } from "@/components/sections/hero-section";
import { Promotion } from "@/components/sections/promotion";
import { Service } from "@/components/sections/service";
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
        <HeroSection />
        <Promotion />
        <Service />
        <Sales />
        <Blog />
        <Partner />
      </main>
      <Footer />
    </>
  );
}
