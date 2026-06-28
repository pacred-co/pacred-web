import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Star, Sparkles, BadgeCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getPublishedArticles, getPublishedArticleTags } from "@/lib/cms/articles";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { ArticleListTabs } from "@/components/sections/article-list-tabs";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { SITE_URL } from "@/components/seo/site";
import {
  REVIEWS,
  reviewSlug,
  reviewMetaPath,
  ourWorkMetaPath,
} from "@/lib/reviews/catalog";

// Dynamic render — the shared <NavBar> reads auth cookies (a dynamic API);
// static prerender would throw DYNAMIC_SERVER_USAGE in production.
export const dynamic = "force-dynamic";

const PATH = "/our-work";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const base = await buildPageMetadata({
    locale,
    path: PATH,
    namespace: "seo.reviews.index",
  });
  // Localized canonical/alternates: th = /ผลงานของเรา, en = /en/our-work.
  return {
    ...base,
    alternates: {
      canonical: ourWorkMetaPath(typedLocale),
      languages: {
        "th-TH": ourWorkMetaPath("th"),
        "en-US": ourWorkMetaPath("en"),
        "x-default": ourWorkMetaPath("th"),
      },
    },
    openGraph: { ...base.openGraph, url: ourWorkMetaPath(typedLocale) },
  };
}

export default async function ReviewsListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: "reviews" });
  // Owner 2026-06-23: published CMS "ผลงานของเรา" articles append below the carousel,
  // filterable by tag (HS code · product category). The tag bar = all distinct tags.
  const activeTag = (((await searchParams).tag) ?? "").trim();
  const [dbArticles, allTags] = await Promise.all([
    getPublishedArticles("our_work", { tag: activeTag }),
    getPublishedArticleTags("our_work"),
  ]);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name:
      typedLocale === "th"
        ? "ผลงาน Pacred — นำเข้าจีน + เคลียร์ศุลกากร"
        : "Pacred case studies — China import + customs clearance",
    itemListElement: REVIEWS.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${reviewMetaPath(reviewSlug(r, typedLocale), typedLocale)}`,
      name: t(r.titleKey),
    })),
  };

  const ui =
    typedLocale === "th"
      ? {
          eyebrow: "PACRED CASE STUDIES · ผลงานของเรา",
          titleA: "ผลงาน",
          titleBrand: "Pacred",
          titleB: "— นำเข้าจีน · เคลียร์ศุลกากร",
          subtitle:
            "ผลงานจริงของ Pacred Shipping — นำเข้า FCL เหมาตู้ / LCL เปิดใบขนจากจีน และเคลียร์สินค้าติดด่านทางรถ เรือ แอร์ ครบทุกเทอม DDP/CIF กดการ์ดไหนก็ได้เพื่อดูรายละเอียดแต่ละเคส",
          statReviews: `${REVIEWS.length} เคสงานจริง`,
          statRating: "5.0 คะแนนเฉลี่ย",
          statVerified: "ผลงานจริงของ Pacred",
        }
      : {
          eyebrow: "PACRED CASE STUDIES · Our work",
          titleA: "Pacred",
          titleBrand: "case studies",
          titleB: "— China import & customs clearance",
          subtitle:
            "Real Pacred Shipping projects — China FCL full-container and LCL consolidated imports, plus customs clearance by road, sea, and air across DDP/CIF terms. Tap any card to see the full case.",
          statReviews: `${REVIEWS.length} real cases`,
          statRating: "5.0 average rating",
          statVerified: "Real Pacred work",
        };

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema(
            [
              { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
              {
                name: typedLocale === "th" ? "ผลงานของเรา" : "Our work",
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
        <section className="relative pt-6 md:pt-10 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">
            <div className="mx-auto w-full max-w-[1120px] text-center md:text-left">
              <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
                <Star className="w-3.5 h-3.5 fill-primary-600" strokeWidth={2.8} />
                {ui.eyebrow}
              </div>
              <h1 className="text-[28px] md:text-[42px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                {ui.titleA}{" "}
                <span className="text-primary-600">{ui.titleBrand}</span>{" "}
                {ui.titleB}
              </h1>
              <p className="mt-3 text-[14px] md:text-[16px] leading-[1.6] text-muted max-w-[820px] md:mx-0 mx-auto">
                {ui.subtitle}
              </p>

              {/* Tab switcher — สาระน่ารู้ ↔ ข่าวสาร ↔ ผลงานของเรา (owner 2026-06-23) */}
              <div className="mt-5 md:mt-6 flex justify-center md:justify-start">
                <ArticleListTabs active="our-work" />
              </div>

              {/* Stat pills */}
              <div className="mt-5 md:mt-6 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-[12px] md:text-[12.5px] font-black border border-primary-100 dark:border-primary-900/40">
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
                  {ui.statReviews}
                </span>
                <span className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3.5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white text-[12px] md:text-[12.5px] font-black border border-border">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" strokeWidth={1.8} />
                  {ui.statRating}
                </span>
                <span className="inline-flex items-center gap-1.5 h-8 md:h-9 px-3.5 rounded-full bg-white dark:bg-surface text-primary-600 text-[12px] md:text-[12.5px] font-black border border-border">
                  <BadgeCheck className="w-3.5 h-3.5" strokeWidth={2.8} />
                  {ui.statVerified}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ผลงานของเรา — now CMS-sourced (Stage 2 · ปอน 2026-06-26: catalog cases
            migrated to cms_articles · every card is back-office editable · the homepage
            still uses <Reviews /> with the catalog). Tag-filterable. */}
        {allTags.length > 0 || dbArticles.length > 0 ? (
          <section className="relative pb-10 md:pb-16">
            <div className="mx-auto w-full max-w-[1140px] px-[10px]">
              <h2 className="mb-3 md:mb-4 text-[20px] md:text-[28px] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                เคสงานจริงทั้งหมด
              </h2>

              {/* Tag filter bar — กดแท็กเพื่อดูผลงานในหมวดนั้น (HS code · ประเภทสินค้า) */}
              {allTags.length > 0 ? (
                <div className="mb-5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[12px] font-bold text-muted">กรองตามแท็ก:</span>
                  <Link
                    href="/our-work"
                    className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${!activeTag ? "border-primary-500 bg-primary-600 text-white" : "border-border bg-white text-foreground hover:bg-surface-alt dark:bg-surface"}`}
                  >
                    ทั้งหมด
                  </Link>
                  {allTags.map((tg) => {
                    const on = tg === activeTag;
                    return (
                      <Link
                        key={tg}
                        href={`/our-work?tag=${encodeURIComponent(tg)}`}
                        className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${on ? "border-primary-500 bg-primary-600 text-white" : "border-border bg-white text-foreground hover:bg-surface-alt dark:bg-surface"}`}
                      >
                        #{tg}
                      </Link>
                    );
                  })}
                </div>
              ) : null}

              {dbArticles.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3">
                  {dbArticles.map((a) => (
                    <Link
                      key={`db-${a.id}`}
                      href={`/our-work/${a.slug}`}
                      className="group relative bg-white dark:bg-surface rounded-2xl overflow-hidden border border-border shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_36px_rgba(179,0,0,0.12)] hover:border-primary-200 hover:-translate-y-1 transition-all duration-300"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                        {a.coverUrl ? (
                          <Image src={a.coverUrl} alt={a.title} fill sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 240px" quality={92} className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                        ) : null}
                      </div>
                      <div className="p-3 md:p-3.5">
                        <h3 className="text-[12.5px] md:text-[13px] font-black text-[#111827] dark:text-white leading-[1.3] line-clamp-2 group-hover:text-primary-700 transition-colors">
                          {a.title}
                        </h3>
                        {a.caseRating != null ? (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="inline-flex items-baseline gap-0.5 rounded rounded-tr-none bg-primary-700 px-1.5 py-0.5 text-white">
                              <span className="text-[11px] font-black leading-none tabular-nums">{a.caseRating.toFixed(1)}</span>
                              <span className="text-[11px] font-bold text-white/70">/5</span>
                            </span>
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" strokeWidth={1.8} />
                          </div>
                        ) : null}
                        {a.caseRoute ? (
                          <p className="mt-1 text-[11px] font-bold text-muted">{a.caseRoute}</p>
                        ) : a.excerpt ? (
                          <p className="mt-1 text-[11px] md:text-[12px] text-muted line-clamp-2">{a.excerpt}</p>
                        ) : null}
                        {a.tags.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {a.tags.slice(0, 3).map((tg) => (
                              <span key={tg} className="inline-block rounded-full border border-primary-100 bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700 dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-300">
                                #{tg}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {a.casePrice ? (
                          <p className="mt-1.5 text-[13px] font-black leading-none tracking-[-0.02em] text-primary-600">{a.casePrice}</p>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-surface-alt/40 px-4 py-10 text-center text-sm text-muted">
                  ไม่พบผลงานในแท็ก <b className="text-foreground">#{activeTag}</b> ·{" "}
                  <Link href="/our-work" className="text-primary-600 hover:underline">ดูทั้งหมด</Link>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <HomeBottomBanner />
      </main>
      <Footer />
    </>
  );
}
