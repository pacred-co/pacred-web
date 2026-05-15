import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Calendar, Newspaper } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { ArticleListTabs } from "@/components/sections/article-list-tabs";
import { PACRED_NEWS } from "@/components/sections/pacred-news-data";
import { ArticleStats } from "@/components/knowledge/article-stats";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { SITE_URL } from "@/components/seo/site";

const PATH = "/news";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    path: PATH,
    namespace: "seo.news.index",
  });
}

const CATEGORY_BADGE: Record<string, string> = {
  "ประกาศ":      "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-900/50",
  "อัปเดตบริการ": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
  "กิจกรรม":     "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900/50",
};

function formatThaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

export default async function NewsListingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name:
      typedLocale === "th"
        ? "ข่าวสาร Pacred — ประกาศ + อัปเดตบริการ"
        : "Pacred News — announcements + service updates",
    itemListElement: PACRED_NEWS.map((n, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${typedLocale === "en" ? "/en" : ""}/news/${n.slug}`,
      name: n.title,
    })),
  };

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema(
            [
              { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
              {
                name: typedLocale === "th" ? "ข่าวสาร Pacred" : "Pacred News",
                path: PATH,
              },
            ],
            typedLocale,
          ),
          itemList,
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative pt-6 md:pt-10 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">
            {/* Header */}
            <div className="mx-auto w-full max-w-[1120px] text-center md:text-left">
              <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
                <Newspaper className="w-3.5 h-3.5" strokeWidth={2.8} />
                PACRED NEWS · ข่าวสาร
              </div>
              <h1 className="text-[28px] md:text-[42px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                ข่าวสาร{" "}
                <span className="text-primary-600">Pacred</span>{" "}
                — ประกาศ + อัปเดต
              </h1>
              <p className="mt-3 text-[14px] md:text-[16px] leading-[1.6] text-muted max-w-[760px] md:mx-0 mx-auto">
                ติดตามประกาศจาก Pacred Shipping — มาตรการขนส่ง / อัปเดตบริการ / กิจกรรม
              </p>

              <div className="mt-5 md:mt-6 flex justify-center md:justify-start">
                <ArticleListTabs active="news" />
              </div>
            </div>

            {/* News grid */}
            <div className="mx-auto mt-6 md:mt-10 w-full max-w-[1120px] grid grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-4">
              {PACRED_NEWS.map((news) => (
                <Link
                  key={news.id}
                  href={`/news/${news.slug}`}
                  className="group relative flex flex-col bg-white dark:bg-surface rounded-xl md:rounded-2xl border border-border overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_20px_40px_rgba(179,0,0,0.12)] hover:border-primary-200 dark:hover:border-primary-900 hover:-translate-y-1 transition-all duration-400"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                    <Image
                      src={news.image}
                      alt={news.title}
                      fill
                      sizes="(max-width: 1024px) 50vw, 360px"
                      quality={92}
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    {/* Category badge */}
                    <div className="absolute top-2 left-2 md:top-3 md:left-3">
                      <span
                        className={[
                          "inline-flex items-center gap-1 px-2 md:px-2.5 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10.5px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
                          CATEGORY_BADGE[news.category] ?? CATEGORY_BADGE["ประกาศ"],
                        ].join(" ")}
                      >
                        {news.category}
                      </span>
                    </div>
                    {/* Date stamp */}
                    <div className="absolute top-2 right-2 md:top-3 md:right-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[9px] md:text-[10.5px] font-bold tracking-wide">
                        <Calendar className="w-2.5 h-2.5" strokeWidth={3} />
                        {formatThaiDate(news.publishedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col p-3 md:p-5 gap-1.5 md:gap-2 flex-1">
                    <h3 className="text-[12.5px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-[1.3] tracking-tight line-clamp-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                      {news.title}
                    </h3>
                    <p className="text-[11px] md:text-[13px] text-muted leading-[1.5] md:leading-[1.55] line-clamp-2 md:line-clamp-3">
                      {news.excerpt}
                    </p>

                    {/* Stats row */}
                    <div className="mt-1.5 md:mt-2 flex items-center gap-1.5 text-[10.5px] md:text-[11.5px] text-muted font-bold">
                      <ArticleStats articleId={1000 + news.id} />
                    </div>

                    {/* Read more */}
                    <div className="mt-auto pt-1.5 md:pt-2 flex items-center gap-1 text-primary-600 text-[10.5px] md:text-[12px] font-black opacity-80 group-hover:opacity-100 transition-opacity">
                      อ่านประกาศ
                      <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}
