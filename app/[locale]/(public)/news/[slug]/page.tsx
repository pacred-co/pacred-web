import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Calendar,
  Newspaper,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { ArticleContent } from "@/components/knowledge/article-content";
import { ShareButton } from "@/components/knowledge/share-button";
import { ArticleStats } from "@/components/knowledge/article-stats";
import {
  ALL_NEWS as PACRED_NEWS,
  getNewsBySlug as getPacredNewsBySlug,
  getRelatedNews,
} from "@/lib/news/all";
import { JsonLd } from "@/components/seo/json-ld";
import { articleSchema, breadcrumbSchema } from "@/components/seo/schemas";
import { SITE_URL } from "@/components/seo/site";

const CATEGORY_BADGE: Record<string, string> = {
  "ข่าวด่วน":    "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-900/50",
  "อัปเดตบริการ": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
  "กิจกรรม":     "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900/50",
};

function formatThaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  return `${d} ${months[m - 1]} ${y + 543}`;
}

// Dynamic render — the shared <NavBar> reads auth cookies (a dynamic API);
// static prerender would throw DYNAMIC_SERVER_USAGE in production.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return PACRED_NEWS.map((n) => ({ slug: n.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const news = getPacredNewsBySlug(slug);
  if (!news) return { title: "ไม่พบประกาศ" };
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const canonical = `${typedLocale === "th" ? "" : `/${typedLocale}`}/news/${slug}`;
  const imageUrl = `${SITE_URL}${news.image}`;
  return {
    title: news.title,
    description: news.excerpt,
    alternates: {
      canonical,
      languages: {
        "th-TH": `/news/${slug}`,
        "en-US": `/en/news/${slug}`,
        "x-default": `/news/${slug}`,
      },
    },
    openGraph: {
      title: news.title,
      description: news.excerpt,
      type: "article",
      url: canonical,
      images: [{ url: imageUrl, alt: news.title }],
      publishedTime: news.publishedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: news.title,
      description: news.excerpt,
      images: [imageUrl],
    },
  };
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const news = getPacredNewsBySlug(slug);
  if (!news) notFound();

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const related = getRelatedNews(news.slug, 4);

  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: news.title,
            description: news.excerpt,
            slug: `/news/${news.slug}`,
            image: news.image,
            locale: typedLocale,
            datePublished: news.publishedAt,
          }),
          breadcrumbSchema(
            [
              { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
              {
                name: typedLocale === "th" ? "ข่าวสาร Pacred" : "Pacred News",
                path: "/news",
              },
              { name: news.title, path: `/news/${news.slug}` },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <article className="relative pt-4 md:pt-6 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">
            {/* Breadcrumb */}
            <nav className="mx-auto w-full max-w-[920px] flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                หน้าหลัก
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <Link href="/news" className="hover:text-primary-600 transition-colors font-bold">
                ข่าวสาร Pacred
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white line-clamp-1">
                {news.category}
              </span>
            </nav>

            {/* Header */}
            <header className="mx-auto w-full max-w-[920px] mb-5 md:mb-7">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span
                  className={[
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black tracking-wider border",
                    CATEGORY_BADGE[news.category] ?? CATEGORY_BADGE["ข่าวด่วน"],
                  ].join(" ")}
                >
                  {news.category}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] md:text-[12px] text-muted font-bold">
                  <Calendar className="w-3 h-3" strokeWidth={2.8} />
                  {formatThaiDate(news.publishedAt)}
                </span>
              </div>
              <h1 className="text-[24px] md:text-[36px] leading-[1.22] md:leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                {news.title}
              </h1>
              <p className="mt-3 text-[14px] md:text-[16px] leading-[1.6] text-muted">
                {news.excerpt}
              </p>

              {/* Meta + stats + share */}
              <div className="mt-4 md:mt-5 flex flex-wrap items-center gap-2.5 md:gap-3 text-[11.5px] md:text-[12.5px] text-muted font-bold">
                <span className="inline-flex items-center gap-1.5">
                  <Newspaper className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.6} />
                  Pacred Shipping
                </span>
                <span className="text-muted/50">·</span>
                <span>อ่าน 2 นาที</span>
                <span className="text-muted/50">·</span>
                {/* Offset newsIds into 1000+ so they don't collide with knowledge ids in localStorage */}
                <ArticleStats articleId={1000 + news.id} />
                <span className="text-muted/50">·</span>
                <ShareButton title={news.title} text={news.excerpt} slug={`news/${news.slug}`} />
              </div>
            </header>

            {/* Hero cover — landscape, fitted to the article width so the
                full image shows without edge-cropping (this detail page only). */}
            <figure className="mx-auto w-full max-w-[760px] mb-6 md:mb-8">
              <div className="relative aspect-[1280/580] rounded-2xl md:rounded-3xl overflow-hidden border border-border shadow-[0_14px_36px_-12px_rgba(15,23,42,0.18)] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                <Image
                  src={news.heroImage ?? news.image}
                  alt={news.title}
                  fill
                  sizes="(max-width: 760px) 100vw, 760px"
                  quality={92}
                  className="object-cover"
                  priority
                />
              </div>
            </figure>

            {/* Article content */}
            <div className="mx-auto w-full max-w-[760px]">
              <ArticleContent text={news.content} title={news.title} />
            </div>
          </div>
        </article>

        <HomeBottomBanner />

        <article className="relative pt-2 md:pt-4 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">
            {related.length > 0 && (
              <div className="mx-auto mt-10 md:mt-14 w-full max-w-[1120px]">
                <div className="flex items-end justify-between gap-4 mb-4 md:mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                      <Newspaper className="w-3.5 h-3.5" strokeWidth={2.6} />
                      ข่าวสารอื่น
                    </div>
                    <h2 className="text-[20px] md:text-[26px] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                      ประกาศ Pacred อื่นๆ
                    </h2>
                  </div>
                  <Link
                    href="/news"
                    className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[12px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
                  >
                    ดูทั้งหมด
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
                  </Link>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/news/${r.slug}`}
                      className="group relative flex flex-col bg-white dark:bg-surface rounded-xl md:rounded-2xl border border-border overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_16px_32px_rgba(179,0,0,0.10)] hover:border-primary-200 dark:hover:border-primary-900 hover:-translate-y-1 transition-all duration-300"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                        <Image
                          src={r.image}
                          alt={r.title}
                          fill
                          sizes="(max-width: 1024px) 50vw, 280px"
                          quality={92}
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                        <div className="absolute top-2 left-2 md:top-2.5 md:left-2.5">
                          <span
                            className={[
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
                              CATEGORY_BADGE[r.category] ?? CATEGORY_BADGE["ข่าวด่วน"],
                            ].join(" ")}
                          >
                            {r.category}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col p-3 md:p-4 gap-1.5 flex-1">
                        <h3 className="text-[12.5px] md:text-[14px] font-black text-[#111827] dark:text-white leading-[1.3] tracking-tight line-clamp-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                          {r.title}
                        </h3>
                        <div className="mt-auto pt-1.5 flex items-center gap-1 text-primary-600 text-[10.5px] md:text-[11.5px] font-black opacity-80 group-hover:opacity-100 transition-opacity">
                          อ่านข่าวด่วน
                          <ArrowRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back to listing */}
            <div className="mx-auto mt-10 md:mt-12 w-full max-w-[920px]">
              <Link
                href="/news"
                className="inline-flex items-center gap-1.5 text-[12.5px] md:text-[14px] font-black text-primary-600 hover:text-primary-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={2.6} />
                กลับไปยังข่าวสาร Pacred ทั้งหมด
              </Link>
            </div>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
