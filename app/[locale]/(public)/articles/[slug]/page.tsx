import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { ArticleContent } from "@/components/knowledge/article-content";
import { getPublishedArticleBySlug } from "@/lib/cms/articles";
import { CMS_CATEGORY_META } from "@/lib/validators/cms-article";
import { JsonLd } from "@/components/seo/json-ld";
import { articleSchema, breadcrumbSchema } from "@/components/seo/schemas";

// Reads the DB (+ <NavBar> reads auth cookies) → must be dynamic.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublishedArticleBySlug(slug);
  if (!a) return { title: "ไม่พบบทความ · Pacred Shipping" };
  // SEO overrides (owner 2026-06-23) — fall back to title / excerpt when blank.
  const metaTitle = a.metaTitle || a.title;
  const metaDesc = a.metaDescription || a.excerpt || a.title;
  return {
    title: `${metaTitle} · Pacred Shipping`,
    description: metaDesc,
    openGraph: {
      title: metaTitle,
      description: metaDesc,
      images: a.coverUrl ? [{ url: a.coverUrl }] : undefined,
    },
  };
}

export default async function CmsArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const a = await getPublishedArticleBySlug(slug);
  if (!a) notFound();

  // our_work articles render at /our-work/[slug] (Trip.com layout) — redirect.
  if (a.category === "our_work") redirect(`/our-work/${a.slug}`);

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const cat = CMS_CATEGORY_META[a.category];

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema(
            [
              { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
              { name: cat.label, path: cat.path },
              { name: a.title, path: `/articles/${a.slug}` },
            ],
            typedLocale,
          ),
          articleSchema({
            title: a.metaTitle || a.title,
            description: a.metaDescription || a.excerpt || a.title,
            slug: `/articles/${a.slug}`,
            image: a.coverUrl || "/images/pacred-logo-red.png",
            datePublished: a.publishedAt || undefined,
            locale: typedLocale,
          }),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <article className="relative pt-5 md:pt-8 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[820px] px-[14px]">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-[12px] md:text-[13px] text-muted">
              <Link href="/" className="hover:text-primary-600">หน้าหลัก</Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              <Link href={cat.path} className="hover:text-primary-600">{cat.label}</Link>
            </nav>

            {/* Badge */}
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-[12px] font-black text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                {a.subCategory || cat.label}
              </span>
            </div>

            {/* Title */}
            <h1 className="mt-3 text-[26px] md:text-[38px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
              {a.title}
            </h1>
            {a.excerpt ? (
              <p className="mt-3 text-[15px] md:text-[17px] leading-[1.6] text-muted">{a.excerpt}</p>
            ) : null}

            {/* Tags — our_work tags link back to the /our-work filter; others display-only */}
            {a.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {a.tags.map((tg) =>
                  a.category === "our_work" ? (
                    <Link key={tg} href={`/our-work?tag=${encodeURIComponent(tg)}`} className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-[12px] font-semibold text-primary-700 transition hover:bg-primary-100 dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-300">
                      #{tg}
                    </Link>
                  ) : (
                    <span key={tg} className="rounded-full border border-border bg-surface-alt px-2.5 py-0.5 text-[12px] font-semibold text-muted">
                      #{tg}
                    </span>
                  ),
                )}
              </div>
            ) : null}

            {/* Cover */}
            {a.coverUrl ? (
              <div className="relative mt-5 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border bg-surface-alt">
                <Image src={a.coverUrl} alt={a.title} fill sizes="(max-width: 820px) 100vw, 820px" className="object-cover" priority />
              </div>
            ) : null}

            {/* Body */}
            <div className="mt-6 md:mt-8">
              <ArticleContent text={a.body} title={a.title} />
            </div>

            {/* Back */}
            <div className="mt-10 border-t border-border pt-6">
              <Link href={cat.path} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-4 py-2 text-sm font-bold text-foreground hover:bg-surface-alt dark:bg-surface">
                ← ดู{cat.label}ทั้งหมด
              </Link>
            </div>
          </div>
        </article>
        <HomeBottomBanner />
      </main>
      <Footer />
    </>
  );
}
