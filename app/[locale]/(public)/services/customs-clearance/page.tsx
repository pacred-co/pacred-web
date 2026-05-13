import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { MobileTrustRibbon } from "@/components/sections/mobile-trust-ribbon";
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

export const metadata = {
  title: "ชิปปิ้งเคลียร์พิธีการศุลกากร · เคลียร์สินค้าติดด่าน Pacred Shipping",
  description:
    "บริการชิปปิ้งเคลียร์สินค้าติดด่าน พิธีการศุลกากร ครบทุกด่าน — สุวรรณภูมิ · แหลมฉบัง · คลองเตย · ดอนเมือง · มุกดาหาร · ICD ลาดกระบัง · ไปรษณีย์หลักสี่ พร้อม อย./มอก./เกษตร/ประมง ครบจบในที่เดียว",
};

export default function CustomsClearancePage() {
  return (
    <>
      <NavBar />
      <SearchBar />
      <main>
        <BookingCalculator landing="customs" />
        <MobileTrustRibbon variant="customs" />
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
