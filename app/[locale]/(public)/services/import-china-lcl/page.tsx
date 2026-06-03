import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Home, ChevronRight } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { Reviews } from "@/components/sections/reviews";
import { CustomsVideoClips } from "@/components/sections/customs-video-clips";
import { KnowledgeNewsBlock } from "@/components/sections/knowledge-news-block";
import { Footer } from "@/components/sections/footer";
import { LclHero } from "@/components/sections/lcl-hero";
import { PricingSection } from "@/components/sections/pricing-section";
import { LclSteps } from "@/components/sections/lcl-steps";
import { AddLineBanner } from "@/components/sections/add-line-banner";
import { LclWhyPacred } from "@/components/sections/lcl-why-pacred";
import { LclGuaranteeBanner } from "@/components/sections/lcl-guarantee-banner";
import { LclServicesProblems } from "@/components/sections/lcl-services-problems";
import { LclRelatedTags } from "@/components/sections/lcl-related-tags";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import {
  breadcrumbSchema,
  serviceSchema,
  faqPageSchema,
} from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

export const dynamic = "force-dynamic";

const PATH = "/services/import-china-lcl";
const NS = "seo.services.importChinaLcl";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

// FAQ content — kept for the FAQPage JSON-LD only (SEO). The visible FAQ
// accordion section was dropped to match the customs landing pattern.
const FAQ_ITEMS = [
  {
    q: "LCL เหมาะกับ order ขนาดไหน?",
    a: "LCL คุ้มที่สุดสำหรับสินค้าปริมาณ 1-15 CBM ถ้าเกิน 15 CBM แล้ว FCL จะคุ้มกว่า เพราะ FCL ค่าตู้เป็น flat-rate ส่วน LCL คิดตาม CBM (ปริมาตร) หรือ KG (น้ำหนัก) ที่สูงกว่า",
  },
  {
    q: "ราคา LCL จีน-ไทย คิดยังไง?",
    a: "LCL คิดตาม CBM หรือ KG ที่สูงกว่า (Volume Weight Conversion ทั่วไป 1 CBM ≈ 167 KG) ค่าขนส่งรวม Origin charges (จัดการที่โกดังจีน) + Sea freight (จีน-ไทย) + Destination charges (เคลียร์ + ส่งใน TH) ทีม Pacred quote Total Landed Cost ครบก่อนยืนยัน",
  },
  {
    q: "ส่งของยังไงถึงโกดังจีน?",
    a: "มี 3 วิธีหลัก — 1) Pacred ไปรับที่โรงงาน (มีค่าบริการ pickup) · 2) ซัพพลายเออร์ส่งเข้าโกดัง Pacred ที่กวางโจว/เซินเจิ้น/อี้อู ฟรี · 3) ลูกค้าจัดส่งทาง courier จีน (Yunda, ZTO, SF) ไปยังที่อยู่โกดังที่ Pacred แจ้ง",
  },
  {
    q: "ใช้เวลากี่วัน?",
    a: "LCL จีน-ไทย ใช้เวลา 15-20 วัน รวม pickup + รวมตู้ที่โกดังจีน (~3-5 วัน) + Sea freight (~10-12 วัน) + เคลียร์ + ส่งใน TH (~2-3 วัน) ทีมแจ้ง ETA ที่แม่นยำเมื่อ booking แล้ว",
  },
  {
    q: "พักของที่โกดังจีนได้นานเท่าไร?",
    a: "ฟรีค่าฝาก 14 วันแรก หลังจากนั้นคิดค่าฝากตามอัตรา (ปกติ 5-10 หยวน/CBM/วัน) เหมาะกับลูกค้าที่สั่งหลายร้านในเวลาห่างกัน รอรวมแล้วค่อยส่งครั้งเดียว",
  },
  {
    q: "ของแตก/สูญหายระหว่างขนส่งทำยังไง?",
    a: "Pacred ให้บริการ Cargo Insurance เสริม (~0.5-1% ของมูลค่าสินค้า) ครอบคลุมแตกหัก/สูญหายระหว่างขนส่ง ถ้าไม่ทำประกัน สายเรือชดเชยตามอัตราพื้นฐานเท่านั้น (~$2/kg) แนะนำให้ทำประกันสำหรับสินค้ามูลค่าสูง",
  },
  {
    q: "ทำไมต้องเลือก Pacred ไม่ใช้ freight forwarder อื่น?",
    a: "Pacred = ทีมหน้างานจริงที่จีน + ไทย ครบทั้งวงจร — มีโกดังตัวเองที่กวางโจว/เซินเจิ้น/อี้อู · มี shipping license ในไทย · มีทีมล่ามจีนช่วยปิดดีลโรงงาน · ออกใบกำกับภาษีได้ · มีระบบติดตามสถานะ real-time · ประสบการณ์ 15+ ปี",
  },
  {
    q: "สั่งจาก 1688 / Taobao / Alibaba ส่งเข้าโกดัง Pacred ได้มั้ย?",
    a: "ได้ — Pacred แจ้งที่อยู่โกดังจีน (เป็นภาษาจีน) ให้ลูกค้าหรือซัพพลายเออร์ส่งของเข้าโกดังตรง · ทีมรับของ ตรวจ-นับ-ถ่ายรูป แจ้งสถานะให้ทราบ ถ้าลูกค้าไม่ได้คุยจีนเอง ใช้บริการล่ามจีนได้ — ทีม Pacred ปิดดีลกับโรงงานในนามคุณ",
  },
];

export default async function ImportChinaLclPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel = typedLocale === "th" ? "บริการ" : "Services";
  const here = typedLocale === "th" ? "นำเข้าจีน LCL" : "LCL Import";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "นำเข้า LCL" : "LCL Import",
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: svcLabel, path: "/services" },
              { name: here, path: PATH },
            ],
            typedLocale,
          ),
          faqPageSchema(
            FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a })),
          ),
        ]}
      />
      <NavBar />
      <SearchBar hideOnMobile defaultCollapsed />
      <main>
        {/* 1 — Booking calculator (LCL is sea) */}
        <BookingCalculator landing="sea" />

        {/* 2 — Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-3 md:pt-4"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px]">
            <li>
              <Link href="/" className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors">
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>{homeLabel}</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li>
              <Link href="/services" className="text-muted hover:text-primary-600 transition-colors">
                {svcLabel}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li>
              <Link href="/services/import-china" className="text-muted hover:text-primary-600 transition-colors">
                {typedLocale === "th" ? "นำเข้าจีน" : "Import China"}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground truncate">
              {here}
            </li>
          </ol>
        </nav>

        {/* 3 — Hero intro (h1 + red LINE scope-banner + bullet card) */}
        <LclHero />

        {/* 4 — Pricing — home-page rates, LCL-only: Cargo-LCL + Freight-LCL
            stacked (no toggle, no FCL, no country picker) */}
        <PricingSection lclExpanded />

        {/* 5 — 5 STEPS */}
        <LclSteps />

        {/* 6 — Add-LINE banner #1 */}
        <AddLineBanner surface="lcl_addline_banner" />

        {/* 7 — Sales contact */}
        <ContactSales hideAssuranceStrip compact />

        {/* 8 — Reviews (import filter) */}
        <Reviews defaultFilter="import" />

        {/* 9 — Why Pacred (certs slideshow + why-list) */}
        <LclWhyPacred />

        {/* 10 — Add-LINE banner #2 */}
        <AddLineBanner surface="lcl_addline_banner_2" />

        {/* 11 — Video clips */}
        <CustomsVideoClips />

        {/* 12 — Knowledge + News */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <KnowledgeNewsBlock />
          </div>
        </section>

        {/* 13 — Sales contact #2 */}
        <ContactSales hideAssuranceStrip compact />

        {/* 14 — Pacred guarantee banner (focal price + 2 CTA banners) */}
        <LclGuaranteeBanner />

        {/* 15 — Detailed services + problems + closing banner */}
        <LclServicesProblems />

        {/* 16 — Related tags */}
        <LclRelatedTags />
      </main>
      <Footer />
    </>
  );
}
