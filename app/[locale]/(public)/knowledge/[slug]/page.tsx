import fs from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { ArticleContent } from "@/components/knowledge/article-content";
import { ShareButton } from "@/components/knowledge/share-button";
import { ArticleStats } from "@/components/knowledge/article-stats";
import { RelatedServices } from "@/components/knowledge/related-services";
import { CategoryBanner } from "@/components/knowledge/category-banner";
import {
  KNOWLEDGE_ARTICLES,
  getArticleBySlug,
} from "@/lib/knowledge-articles";
import { getPublishedArticleBySlug, getPublishedArticles } from "@/lib/cms/articles";
import { JsonLd } from "@/components/seo/json-ld";
import { articleSchema, breadcrumbSchema } from "@/components/seo/schemas";
import { SITE_URL } from "@/components/seo/site";

const CATEGORY_BADGE: Record<string, string> = {
  นำเข้า:  "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-900/50",
  เคลียร์: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
  ส่งออก:  "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900/50",
};

// Dynamic render — the shared <NavBar> reads auth cookies (a dynamic API);
// static prerender would throw DYNAMIC_SERVER_USAGE in production.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return KNOWLEDGE_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // CMS-first (back-office editable) → fall back to the static article.
  const cms = await getPublishedArticleBySlug(slug);
  const staticArticle = getArticleBySlug(slug);
  if (!cms && !staticArticle) return { title: "ไม่พบบทความ · Pacred Shipping" };
  const article = {
    title: cms?.title || staticArticle!.title,
    excerpt: cms?.excerpt || staticArticle?.excerpt || "",
    image: cms?.coverUrl || staticArticle?.image || "",
  };
  const seoTitle = cms?.metaTitle?.trim() || article.title;
  const seoDesc = cms?.metaDescription?.trim() || article.excerpt;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const canonical = `${typedLocale === "th" ? "" : `/${typedLocale}`}/knowledge/${slug}`;
  const imageUrl = `${SITE_URL}${article.image}`;
  return {
    title: seoTitle,
    description: seoDesc,
    alternates: {
      canonical,
      languages: {
        "th-TH": `/knowledge/${slug}`,
        "en-US": `/en/knowledge/${slug}`,
        "x-default": `/knowledge/${slug}`,
      },
    },
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: "article",
      url: canonical,
      images: [{ url: imageUrl, alt: article.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: [imageUrl],
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  // CMS-first (back-office editable · Ultra-approved) → fall back to the static article.
  const cms = await getPublishedArticleBySlug(slug);
  const staticArticle = getArticleBySlug(slug);
  if (!cms && !staticArticle) notFound();

  const t = await getTranslations("knowledgeArticlePage");

  const article = cms
    ? {
        id: cms.id,
        slug: cms.slug,
        title: cms.title,
        excerpt: cms.excerpt,
        category: cms.subCategory || staticArticle?.category || "นำเข้า",
        image: cms.coverUrl || staticArticle?.image || "",
      }
    : {
        id: staticArticle!.id,
        slug: staticArticle!.slug,
        title: staticArticle!.title,
        excerpt: staticArticle!.excerpt,
        category: staticArticle!.category as string,
        image: staticArticle!.image,
      };

  // Body — the CMS body wins; fall back to the static .txt when the CMS body is
  // empty (or for a static-only article that isn't in CMS yet).
  let content = cms?.body?.trim() ?? "";
  if (!content && staticArticle) {
    try {
      content = await fs.readFile(
        path.join(process.cwd(), "public", "images", "knowledge", `${staticArticle.id}.txt`),
        "utf-8",
      );
    } catch {
      content = "";
    }
  }

  // Related — from the merged knowledge set (CMS-preferred), same category first.
  const dbKnowledge = await getPublishedArticles("knowledge");
  const dbKnowledgeSlugs = new Set(dbKnowledge.map((a) => a.slug));
  const merged = [
    ...dbKnowledge.map((a) => ({ id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, category: a.subCategory || "นำเข้า", image: a.coverUrl })),
    ...KNOWLEDGE_ARTICLES.filter((a) => !dbKnowledgeSlugs.has(a.slug)).map((a) => ({ id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, category: a.category as string, image: a.image })),
  ];
  const pool = merged.filter((a) => a.slug !== article.slug);
  const related = [
    ...pool.filter((a) => a.category === article.category),
    ...pool.filter((a) => a.category !== article.category),
  ].slice(0, 4);
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";

  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: article.title,
            description: article.excerpt,
            slug: `/knowledge/${article.slug}`,
            image: article.image,
            locale: typedLocale,
          }),
          breadcrumbSchema(
            [
              { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
              { name: typedLocale === "th" ? "สาระน่ารู้" : "Knowledge", path: "/knowledge" },
              { name: article.title, path: `/knowledge/${article.slug}` },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <article className="relative pt-4 md:pt-6 pb-10 md:pb-16">
          {/* lg:pr clears the floating right quick-nav rail (fixed to the viewport
              edge) so the sticky service sidebar never sits under it. */}
          <div className="mx-auto w-full max-w-[1240px] px-[10px] lg:pr-[84px] 2xl:pr-[10px]">
            {/* Full-width category banner — big readable ad, matched to the article
                (ปอน 2026-06-29 · uncropped · above the article · desktop + mobile). */}
            <div className="mb-5 md:mb-7">
              <CategoryBanner category={article.category} />
            </div>
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 xl:gap-10">
              {/* ── Article column ── */}
              <div className="min-w-0">

            {/* Breadcrumb */}
            <nav className="mx-auto w-full max-w-[920px] flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                {t("breadcrumbHome")}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <Link href="/knowledge" className="hover:text-primary-600 transition-colors font-bold">
                {t("breadcrumbKnowledge")}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white line-clamp-1">
                {article.category}
              </span>
            </nav>

            {/* Header */}
            <header className="mx-auto w-full max-w-[920px] mb-5 md:mb-7">
              <span
                className={[
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black tracking-wider border mb-3",
                  CATEGORY_BADGE[article.category],
                ].join(" ")}
              >
                {article.category}
              </span>
              <h1 className="text-[24px] md:text-[36px] leading-[1.22] md:leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                {article.title}
              </h1>
              <p className="mt-3 text-[14px] md:text-[16px] leading-[1.6] text-muted">
                {article.excerpt}
              </p>

              {/* Meta + stats + share */}
              <div className="mt-4 md:mt-5 flex flex-wrap items-center gap-2.5 md:gap-3 text-[11.5px] md:text-[12.5px] text-muted font-bold">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                  Pacred Shipping
                </span>
                <span className="text-muted/50">·</span>
                <span>{t("readingTime")}</span>
                <span className="text-muted/50">·</span>
                <ArticleStats statKey={`knowledge:${article.slug}`} countView />
                <span className="text-muted/50">·</span>
                <ShareButton title={article.title} text={article.excerpt} slug={article.slug} />
              </div>
            </header>

            {/* Hero image — portrait poster (3:4 natural), unoptimized for max sharpness */}
            <div className="mx-auto w-full max-w-[920px] mb-6 md:mb-8">
              <div className="relative mx-auto w-full max-w-[480px] aspect-[3/4] rounded-2xl md:rounded-3xl overflow-hidden border border-border shadow-[0_14px_36px_-12px_rgba(15,23,42,0.18)] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                {article.image ? (
                  <Image
                    src={article.image}
                    alt={article.title}
                    fill
                    sizes="(max-width: 640px) 100vw, 480px"
                    className="object-cover"
                    priority
                    unoptimized
                  />
                ) : null}
              </div>
            </div>

            {/* Article content */}
            <div className="mx-auto w-full max-w-[760px]">
              <ArticleContent text={content} title={article.title} />
            </div>

                {/* Related services — MOBILE inline block (desktop uses the sticky aside) */}
                <div className="mx-auto mt-8 w-full max-w-[760px] lg:hidden">
                  <RelatedServices max={4} />
                </div>
              </div>

              {/* ── Service sidebar — sticky on desktop, releases at the bottom banner.
                  top-[156px] clears the full sticky chrome (NavBar 56px + SearchBar/
                  category row ~85px = 141px) so the whole block sits nicely below it. ── */}
              <aside className="hidden lg:block">
                <div className="sticky top-[156px]">
                  <RelatedServices />
                </div>
              </aside>
            </div>
          </div>
        </article>

        {/* LINE banner — ใช้แบนเนอร์ไลน์จากหน้าแรก */}
        <HomeBottomBanner />

        <article className="relative pt-2 md:pt-4 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">

            {/* Related articles */}
            {related.length > 0 && (
              <div className="mx-auto mt-10 md:mt-14 w-full max-w-[1120px]">
                <div className="flex items-end justify-between gap-4 mb-4 md:mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                      <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                      Related
                    </div>
                    <h2 className="text-[20px] md:text-[26px] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                      {t("relatedArticles")}
                    </h2>
                  </div>
                  <Link
                    href="/knowledge"
                    className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[12px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
                  >
                    {t("viewAll")}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
                  </Link>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={`/knowledge/${r.slug}`}
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
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] md:text-[11px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
                              CATEGORY_BADGE[r.category],
                            ].join(" ")}
                          >
                            {r.category}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col p-3 md:p-4 gap-1.5 md:gap-2 flex-1">
                        <h3 className="text-[12.5px] md:text-[14.5px] font-black text-[#111827] dark:text-white leading-[1.3] tracking-tight line-clamp-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                          {r.title}
                        </h3>
                        <p className="text-[11px] md:text-[12.5px] text-muted leading-[1.5] line-clamp-2">
                          {r.excerpt}
                        </p>
                        <div className="mt-auto pt-1.5 md:pt-2 flex items-center gap-1 text-primary-600 text-[10.5px] md:text-[12px] font-black opacity-80 group-hover:opacity-100 transition-opacity">
                          {t("readArticle")}
                          <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Back to listing */}
            <div className="mx-auto mt-8 md:mt-10 w-full max-w-[760px] flex justify-center">
              <Link
                href="/knowledge"
                className="inline-flex items-center gap-1.5 h-10 md:h-11 px-4 md:px-5 rounded-xl bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[13px] md:text-[14px] font-black hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50/40 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={3} />
                {t("backToKnowledge")}
              </Link>
            </div>

          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
