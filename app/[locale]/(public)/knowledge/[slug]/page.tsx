import fs from "node:fs/promises";
import path from "node:path";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { PurchaseBanner } from "@/components/sections/purchase-banner";
import { ClearanceBanner } from "@/components/sections/clearance-banner";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { ArticleContent } from "@/components/knowledge/article-content";
import { ShareButton } from "@/components/knowledge/share-button";
import { ArticleStats } from "@/components/knowledge/article-stats";
import {
  KNOWLEDGE_ARTICLES,
  getArticleBySlug,
  getRelatedArticles,
} from "@/lib/knowledge-articles";

const CATEGORY_BADGE: Record<string, string> = {
  นำเข้า:  "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-900/50",
  เคลียร์: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
  ส่งออก:  "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900/50",
};

export function generateStaticParams() {
  return KNOWLEDGE_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return { title: "ไม่พบบทความ · Pacred Shipping" };
  return {
    title: `${article.title} · Pacred Shipping`,
    description: article.excerpt,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const content = await fs.readFile(
    path.join(process.cwd(), "public", "images", "knowledge", `${article.id}.txt`),
    "utf-8",
  );

  const related = getRelatedArticles(article, 4);

  return (
    <>
      <NavBar />
      <SearchBar />
      <main>
        <article className="relative pt-4 md:pt-6 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">

            {/* Breadcrumb */}
            <nav className="mx-auto w-full max-w-[920px] flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                หน้าหลัก
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <Link href="/knowledge" className="hover:text-primary-600 transition-colors font-bold">
                สาระน่ารู้
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
                <span>อ่าน 5 นาที</span>
                <span className="text-muted/50">·</span>
                <ArticleStats articleId={article.id} />
                <span className="text-muted/50">·</span>
                <ShareButton title={article.title} text={article.excerpt} slug={article.slug} />
              </div>
            </header>

            {/* Hero image — portrait poster (3:4 natural), unoptimized for max sharpness */}
            <div className="mx-auto w-full max-w-[920px] mb-6 md:mb-8">
              <div className="relative mx-auto w-full max-w-[480px] aspect-[3/4] rounded-2xl md:rounded-3xl overflow-hidden border border-border shadow-[0_14px_36px_-12px_rgba(15,23,42,0.18)] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                <Image
                  src={article.image}
                  alt={article.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 480px"
                  className="object-cover"
                  priority
                  unoptimized
                />
              </div>
            </div>

            {/* Article content */}
            <div className="mx-auto w-full max-w-[760px]">
              <ArticleContent text={content} title={article.title} />
            </div>

          </div>
        </article>

        {/* Banner ตามหมวด — ใช้ banner เต็มของหน้าหลัก */}
        {article.category === "เคลียร์" ? (
          <ClearanceBanner />
        ) : article.category === "ส่งออก" ? (
          <ImportExportBanner />
        ) : (
          <PurchaseBanner />
        )}

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
                      บทความที่เกี่ยวข้อง
                    </h2>
                  </div>
                  <Link
                    href="/knowledge"
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
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-black tracking-wider border shadow-[0_2px_6px_rgba(0,0,0,0.10)]",
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
                          อ่านบทความ
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
                กลับสู่หน้าสาระน่ารู้ทั้งหมด
              </Link>
            </div>

          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
