import type { Metadata } from "next";
import { Truck, Phone, Home, ChevronRight, MessageCircle } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import { FreightQuoteWizard } from "@/components/freight-quote/FreightQuoteWizard";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const PATH = "/freight-quote";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const th = locale !== "en";
  const title = th
    ? "ขอราคา Freight — นำเข้า/ส่งออก FCL · LCL · แอร์ · เคลียร์ศุลกากร | Pacred"
    : "Freight Quote — Import/Export FCL · LCL · Air · Customs | Pacred";
  const description = th
    ? "ขอใบเสนอราคาขนส่งระหว่างประเทศแบบครบทุกเทอม — FCL/LCL ทางเรือ · ทางอากาศ · รถข้ามแดน · เคลียร์พิธีการศุลกากร ใบขนชื่อคุณ. กรอกข้อมูลรับราคาประมาณการทันที ทีมเซลส์ติดต่อกลับ."
    : "Request an international freight quote — SEA FCL/LCL, AIR, cross-border truck, and Thai customs clearance. Get an instant estimate; our sales team follows up.";
  return {
    title,
    description,
    alternates: { canonical: PATH },
  };
}

/**
 * /freight-quote — the PUBLIC freight quote-request funnel.
 *
 * Opens the FREIGHT revenue line (the AXELRA freight side). A 5-step wizard
 * (ported from the "AX BOOKING" prototype — structure/logic, our Pacred
 * Tailwind design) captures a structured RFQ → `freight_quote` lead →
 * notifies sales. MVP = lead capture; the live pricing engine is a follow-on.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const th = typedLocale === "th";
  const t = await getTranslations("freightQuotePage");

  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: th ? "หน้าหลัก" : "Home", path: "/" },
            { name: th ? "ขอราคา Freight" : "Freight Quote", path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />

      <main className="min-h-screen bg-gradient-to-b from-primary-50/40 to-white dark:from-surface dark:to-background">
        {/* Breadcrumb */}
        <nav
          aria-label="breadcrumb"
          className="mx-auto max-w-[1000px] px-4 pt-4 md:pt-6 flex items-center gap-1.5 text-[12px] md:text-[13px] text-muted"
        >
          <Link href="/" className="inline-flex items-center gap-1 hover:text-primary-600 transition-colors">
            <Home className="w-3.5 h-3.5" /> {t("breadcrumbHome")}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          <span className="text-foreground font-semibold">{t("breadcrumbCurrent")}</span>
        </nav>

        {/* Hero */}
        <header className="mx-auto max-w-[1000px] px-4 pt-5 md:pt-8 pb-2 text-center">
          <div className="inline-flex items-center gap-2 mb-3 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0 animate-pulse" />
            {t("heroBadge")}
          </div>
          <h1 className="text-[26px] md:text-[42px] font-black tracking-tight leading-[1.1] text-foreground">
            {t("h1Before")} <span className="text-primary-600">Freight</span> {t("h1After")}
          </h1>
          <p className="mt-3 max-w-[620px] mx-auto text-[13px] md:text-[16px] font-semibold text-foreground/80 leading-relaxed">
            {t("heroDescription")}
          </p>

          {/* Quick channels */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href={`tel:${CONTACT.phone}`}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary-600 text-white font-bold text-[13px] hover:bg-primary-700 transition-colors shadow-[0_6px_18px_rgba(179,0,0,0.25)]"
            >
              <Phone className="w-4 h-4" strokeWidth={2.6} /> {t("callButton")} {CONTACT.phoneDisplay}
            </a>
            <a
              href={LINE_OA.addFriendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#06C755] text-white font-bold text-[13px] hover:bg-[#05B04C] transition-colors"
            >
              <MessageCircle className="w-4 h-4" strokeWidth={2.6} /> {t("lineButton")}
            </a>
          </div>
        </header>

        {/* The wizard (client) */}
        <FreightQuoteWizard
          phone={CONTACT.phone}
          phoneDisplay={CONTACT.phoneDisplay}
          lineUrl={LINE_OA.addFriendUrl}
        />

        {/* Trust footnote */}
        <div className="mx-auto max-w-[760px] px-4 pb-12 text-center text-[11.5px] md:text-[12.5px] text-muted leading-relaxed flex items-center justify-center gap-1.5">
          <Truck className="w-4 h-4 shrink-0 text-primary-600/70" />
          {t("trustNote")}
        </div>
      </main>

      <Footer />
    </>
  );
}
