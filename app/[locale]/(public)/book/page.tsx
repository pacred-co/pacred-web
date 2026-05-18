/**
 * BK-1 — /book hub.
 *
 * Per `docs/research/booking-flow-system-2026-05-18.md` §3.2 — the
 * top-level grid of bookable services. Each card links to
 * `/book/[service]` where the customer picks options + sees a live
 * quotation panel.
 *
 * Reuses the service-card pattern from `/services` (the proven public
 * landing layout) to stay visually consistent.
 */

import type { Metadata } from "next";
import {
  Home,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Ship,
  Truck,
  Plane,
  Stamp,
  ShoppingBag,
  HandCoins,
  Globe2,
  Container,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { listBookableServices } from "@/lib/booking/service-config";
import type { BookingServiceSlug } from "@/types/booking";

const PATH = "/book";

// Render dynamically — <NavBar> reads auth cookies (a dynamic API).
// Static prerender would throw DYNAMIC_SERVER_USAGE in production
// (AGENTS.md §11).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";
  const title = isEn
    ? "Book a Pacred service — pick options + see a live estimate"
    : "จองบริการ Pacred ออนไลน์ · เลือกตัวเลือก + เห็นราคาประมาณการสด";
  const description = isEn
    ? "Pick a Pacred service, assemble your booking, watch an itemised estimate update live. A rep confirms the real price after."
    : "เลือกบริการ Pacred · เลือกตัวเลือกบริการของคุณ · ดูราคาประมาณการแบบรายการสด ทีมขายยืนยันราคาจริงให้ครับ";
  return {
    title,
    description,
    alternates: {
      canonical: PATH,
      languages: {
        "th-TH": PATH,
        "en-US": `/en${PATH}`,
        "x-default": PATH,
      },
    },
    openGraph: {
      title,
      description,
      url: PATH,
      type: "website",
      locale: isEn ? "en_US" : "th_TH",
    },
  };
}

const ICON_BY_SLUG: Record<BookingServiceSlug, typeof Ship> = {
  "customs-clearance": Stamp,
  "import-china-lcl": Ship,
  "import-china-fcl": Container,
  "import-china-truck": Truck,
  "import-china-air": Plane,
  "china-shopping": ShoppingBag,
  "yuan-transfer": HandCoins,
  export: Globe2,
};

export default async function BookHubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const services = listBookableServices();
  const homeLabel = typedLocale === "th" ? "หน้าแรก" : "Home";
  const hereLabel = typedLocale === "th" ? "จองบริการ" : "Book";

  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: homeLabel, path: "/" },
            { name: hereLabel, path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <main>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1180px] px-4 md:px-5 pt-4 md:pt-5"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px] flex-wrap">
            <li>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors"
              >
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>{homeLabel}</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground">
              {hereLabel}
            </li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="relative pt-3 md:pt-5 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1180px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              จองออนไลน์ · BOOKING
            </div>
            <h1 className="text-[24px] md:text-[40px] leading-[1.15] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[920px]">
              เลือกบริการที่ต้องการจอง — <span className="text-primary-600">เห็นราคาประมาณการสด</span>
            </h1>
            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[820px]">
              เลือกตัวเลือกของคุณ · ดูใบเสนอราคาคร่าวๆ ก่อนกดจอง · ทีมขายติดต่อกลับเพื่อยืนยันราคาจริงหลังตรวจสินค้า
            </h2>
          </div>
        </section>

        {/* Service grid */}
        <section className="relative pt-6 md:pt-8 pb-12 md:pb-16">
          <div className="mx-auto w-full max-w-[1180px] px-4 md:px-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {services.map((svc) => {
                const Icon = ICON_BY_SLUG[svc.slug] ?? Sparkles;
                return (
                  <Link
                    key={svc.slug}
                    href={`/book/${svc.slug}`}
                    data-cta={`book-${svc.slug}`}
                    className="group relative flex items-start gap-3 rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 transition-all duration-300 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_14px_30px_rgba(179,0,0,0.10)] hover:-translate-y-0.5"
                  >
                    <div className="inline-flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl bg-primary-50 text-primary-600 shrink-0 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-5 h-5" strokeWidth={2.4} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                        {typedLocale === "en" ? svc.titleEn : svc.titleTh}
                      </h3>
                      <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.5] text-muted font-medium">
                        {typedLocale === "en" ? svc.subEn : svc.subTh}
                      </p>
                    </div>
                    <ArrowRight
                      className="w-4 h-4 text-muted shrink-0 mt-1 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all"
                      strokeWidth={2.6}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
