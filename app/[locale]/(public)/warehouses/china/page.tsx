import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ChevronRight, MapPin, ArrowRight } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/warehouses/china";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.warehouses.china" });
}

const WAREHOUSES = [
  {
    slug: "guangzhou",
    city: "กวางโจว",
    cityEn: "Guangzhou",
    province: "มณฑลกวางตุ้ง (Guangdong)",
    description: "ศูนย์กลางการค้าใต้สุดของจีน — รองรับสินค้าจากโรงงานและร้านค้าออนไลน์ทุกแพลตฟอร์ม",
    tags: ["1688", "Taobao", "Tmall", "Alibaba", "โรงงานจีน"],
    image: "/images/gwanzhou.png",
  },
  {
    slug: "yiwu",
    city: "อี้อู",
    cityEn: "Yiwu",
    province: "มณฑลเจ้อเจียง (Zhejiang)",
    description: "ตลาดค้าส่งจิปาถะใหญ่ที่สุดในจีน — ของชำร่วย ของขวัญ ของเล่น เครื่องเขียน เครื่องแต่งบ้าน",
    tags: ["1688", "Taobao", "Yiwu Market", "Tmall"],
    image: "/images/pacredyiwu.png",
  },
];

export default async function ChinaWarehousesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
            { name: typedLocale === "th" ? "โกดัง" : "Warehouses", path: "/warehouses/china" },
            { name: typedLocale === "th" ? "ที่อยู่โกดังจีน" : "China warehouses", path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative py-5 md:py-10">
          <div className="mx-auto w-full max-w-[1140px] px-3 md:px-4">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                หน้าหลัก
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white">ที่อยู่โกดังจีน</span>
            </nav>

            {/* Header */}
            <div className="mb-7 md:mb-9">
              <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                WAREHOUSE · CHINA
              </div>
              <h1 className="text-[24px] md:text-[40px] leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                ที่อยู่โกดัง<span className="text-primary-600"> จีน 🇨🇳</span>
              </h1>
              <p className="mt-2 md:mt-3 text-[13px] md:text-[15.5px] leading-[1.6] font-medium text-muted max-w-[820px]">
                Pacred Shipping มีโกดังรับสินค้าในประเทศจีน 2 แห่ง — รองรับสินค้าจากซัพพลายเออร์ทุกแพลตฟอร์ม
                พร้อมบริการรวมสินค้า ตรวจสอบสินค้า และจัดส่งกลับไทยครบวงจร
              </p>
            </div>

            {/* Warehouse cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {WAREHOUSES.map((w) => (
                <Link
                  key={w.slug}
                  href={`/warehouses/${w.slug}`}
                  className="group relative bg-white dark:bg-surface rounded-2xl border border-border overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.15)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
                >
                  {/* Image */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                    <Image
                      src={w.image}
                      alt={`โกดัง${w.city}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 540px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      unoptimized
                    />
                    {/* Flag badge */}
                    <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 dark:bg-surface/95 text-primary-600 text-[11px] md:text-[12px] font-black shadow-[0_4px_10px_rgba(0,0,0,0.08)] backdrop-blur-sm">
                      🇨🇳 {w.cityEn}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4 md:p-5">
                    <div className="flex items-center gap-1.5 text-[11px] md:text-[12px] font-bold text-muted mb-1">
                      <MapPin className="h-3.5 w-3.5 text-primary-600" strokeWidth={2.6} />
                      {w.province}
                    </div>
                    <h2 className="text-[18px] md:text-[22px] font-black tracking-[-0.02em] text-[#111827] dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                      โกดัง{w.city}
                    </h2>
                    <p className="mt-1.5 text-[12.5px] md:text-[13.5px] leading-[1.55] text-muted">
                      {w.description}
                    </p>

                    {/* Tags */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {w.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-md bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 text-[10.5px] md:text-[11px] font-black"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    {/* CTA */}
                    <div className="mt-4 pt-3 border-t border-dashed border-border flex items-center justify-between">
                      <span className="text-[12px] md:text-[12.5px] font-black text-primary-600 inline-flex items-center gap-1">
                        ดูที่อยู่ + Shipping Mark
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={3} />
                      </span>
                      <span className="text-[10.5px] md:text-[11px] font-bold text-muted">
                        เปิดทุกวัน
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Thai warehouse hint */}
            <div className="mt-6 md:mt-8 rounded-2xl border border-dashed border-border bg-surface/50 dark:bg-surface-alt/40 p-4 md:p-5 flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600">
                <MapPin className="h-4 w-4" strokeWidth={2.5} />
              </span>
              <div className="flex-1">
                <div className="text-[13px] md:text-[14px] font-black text-[#111827] dark:text-white">
                  กำลังหาที่อยู่โกดังในไทย?
                </div>
                <p className="text-[11.5px] md:text-[12.5px] text-muted mt-0.5">
                  ดูที่อยู่โกดังในไทยและขั้นตอนรับสินค้าได้ที่หน้าโกดังไทย
                </p>
              </div>
              <Link
                href="/warehouses/thailand"
                className="shrink-0 inline-flex items-center gap-1 h-9 px-3.5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[11.5px] md:text-[12px] font-black hover:border-primary-400 hover:text-primary-700 transition-colors"
              >
                ดูโกดังไทย
                <ArrowRight className="h-3 w-3" strokeWidth={3} />
              </Link>
            </div>
          </div>
        </section>

        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
