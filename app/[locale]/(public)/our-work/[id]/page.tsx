import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight, ChevronRight, Star, BadgeCheck } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { HomeBottomBanner } from "@/components/sections/home-bottom-banner";
import { JsonLd } from "@/components/seo/json-ld";
import {
  breadcrumbSchema,
  faqPageSchema,
  serviceSchema,
} from "@/components/seo/schemas";
import { SITE_URL } from "@/components/seo/site";
import {
  REVIEWS,
  getReviewBySlugOrId,
  getRelatedReviews,
  reviewSlug,
  reviewHeading,
  reviewUrl,
  ourWorkPath,
  reviewMetaPath,
  reviewCanonicalSlug,
  reviewHsCode,
  reviewRoute,
  reviewGalleryImages,
  reviewLogisticsFacts,
  type ServiceType,
} from "@/lib/reviews/catalog";
import { getReviewContent } from "@/lib/reviews/content";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { listCaseComments } from "@/actions/case-comments";
import { getPublishedArticleBySlug } from "@/lib/cms/articles";
import { ArticleContent } from "@/components/knowledge/article-content";
import { CaseGallery } from "./case-gallery";
import { CaseComments } from "./case-comments";

// Dynamic render — the shared <NavBar> reads auth cookies (a dynamic API);
// static prerender would throw DYNAMIC_SERVER_USAGE in production.
export const dynamic = "force-dynamic";

const TYPE_BADGE: Record<ServiceType, string> = {
  import: "bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-900/50",
  export: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900/50",
  clearance: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50",
};

const TYPE_LABEL_KEY: Record<ServiceType, "labelImport" | "labelExport" | "labelClearance"> = {
  import: "labelImport",
  export: "labelExport",
  clearance: "labelClearance",
};

// Minimal content (ปอน 2026-06-25): only the facts a customer needs — บริการ ·
// สินค้า · พอร์ทต้นทาง→ปลายทาง · ระยะเวลา · เขตในไทย+รถ · พิกัด HS. (term/labor dropped.)
const FACT_ORDER = ["service", "product", "port", "duration", "zone", "truck"];

// Weave the logistics facts into one readable prose line under "ข้อมูลขนส่ง"
// (ปอน 2026-06-25 "เอาข้อมูลขนส่งเข้าไปเขียนข้างในเนื้อหา · เก็บการ์ดไว้"). Each fact is
// optional — a review missing one just drops that clause. Values come already
// localized from reviewLogisticsFacts, so we only add connective words.
function buildLogisticsProse(facts: { key: string; value: string }[], locale: "th" | "en"): string {
  const v: Record<string, string> = {};
  for (const f of facts) v[f.key] = f.value;
  const hs = (v.hs ?? "").replace(/^HS\s*/i, "").trim();
  if (locale === "en") {
    const dur = (v.duration ?? "").replace(/^~/, "");
    return [
      `Pacred handled this ${(v.product ?? "goods").toLowerCase()} import from China`,
      v.service ? ` via ${v.service}` : "",
      v.port ? `, route ${v.port}` : "",
      dur ? `, taking about ${dur}` : "",
      v.truck ? `, shipped by ${v.truck}` : "",
      v.zone ? ` to ${v.zone}` : "",
      hs ? ` (HS code ${hs})` : "",
      " — end-to-end from booking the container in China through freight, customs clearance, to the destination warehouse in Thailand.",
    ].join("");
  }
  return [
    `ผลงานนี้ Pacred รับดูแลการนำเข้า${v.product ?? "สินค้า"}จากจีน`,
    v.service ? `แบบ${v.service}` : "",
    v.port ? ` เส้นทาง${v.port}` : "",
    v.duration ? ` ใช้เวลา${v.duration}` : "",
    v.truck ? ` ขนส่งด้วย${v.truck}` : "",
    v.zone ? ` จัดส่งถึง${v.zone}` : "",
    hs ? ` (พิกัดศุลกากร HS ${hs})` : "",
    " — ครบวงจรตั้งแต่จองตู้ที่จีน ขนส่ง เคลียร์พิธีศุลกากร จนส่งถึงโกดังปลายทางในไทย",
  ].join("");
}

// One section-heading scale for the whole page (audit 2026-06-25 · §0h hierarchy).
const H2 = "text-[18px] md:text-[22px] font-black tracking-[-0.03em] text-[#111827] dark:text-white";
const EYEBROW = "flex items-center gap-1.5 mb-1 text-primary-600 text-[12px] font-black tracking-[0.06em] uppercase";

// Booking-card price pulled from the linked service page's OWN published rate
// (ปอน 2026-06-25 "ดึงราคาจากในหน้าเว็บมาเลย"). Only services that publish a price
// get an entry — the rest fall back to "ขอใบเสนอราคาฟรี". Read live from that
// page's i18n (no duplicated number), so it never drifts from the service page.
const SERVICE_PUBLISHED_PRICE: Record<string, { ns: string; key: string }> = {
  "/services/import-china-fcl": { ns: "svcImportChinaFcl", key: "pricing0Price" },
};

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function generateStaticParams() {
  // SEO-pattern slug is the canonical URL; legacy short ids still resolve
  // at request time via getReviewBySlugOrId (no 404 for old links).
  return REVIEWS.map((r) => ({ id: reviewCanonicalSlug(r) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const review = getReviewBySlugOrId(id);

  // CMS-FIRST (Stage 2) — the case page's SEO (title · description · keywords · OG ·
  // canonical) comes from the EDITABLE CMS article so the WHOLE page is back-office
  // editable. Matched by URL slug or the catalog review's canonical slug (TH/EN/
  // legacy-id all resolve). Keywords = the article's tags (HS code · product · mode).
  const cmsBySlug = await getPublishedArticleBySlug(id);
  const cmsArticle =
    cmsBySlug?.category === "our_work"
      ? cmsBySlug
      : review
        ? await getPublishedArticleBySlug(reviewCanonicalSlug(review))
        : null;

  if (cmsArticle && cmsArticle.category === "our_work") {
    const metaTitle = cmsArticle.metaTitle || cmsArticle.title;
    const metaDesc = cmsArticle.metaDescription || cmsArticle.excerpt || cmsArticle.title;
    const canonical = reviewMetaPath(cmsArticle.slug, typedLocale);
    const ogImage = cmsArticle.coverUrl
      ? cmsArticle.coverUrl.startsWith("http")
        ? cmsArticle.coverUrl
        : `${SITE_URL}${cmsArticle.coverUrl}`
      : undefined;
    return {
      title: { absolute: `${metaTitle} | Pacred Shipping` },
      description: metaDesc,
      keywords: cmsArticle.tags.length ? cmsArticle.tags : undefined,
      alternates: {
        canonical,
        languages: {
          "th-TH": reviewMetaPath(cmsArticle.slug, "th"),
          "en-US": reviewMetaPath(cmsArticle.slug, "en"),
          "x-default": reviewMetaPath(cmsArticle.slug, "th"),
        },
      },
      openGraph: {
        title: metaTitle,
        description: metaDesc,
        type: "article",
        url: canonical,
        images: ogImage ? [{ url: ogImage, alt: cmsArticle.title }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: metaTitle,
        description: metaDesc,
        images: ogImage ? [ogImage] : undefined,
      },
    };
  }

  // catalog fallback — only for a case not in CMS
  if (!review) return { title: locale === "en" ? "Case not found" : "ไม่พบผลงาน" };
  const content = getReviewContent(review, typedLocale);
  // Canonical = the locale-correct SEO slug (not the raw param, which may be a
  // legacy id or the other locale's slug) so duplicate URLs dedupe cleanly.
  const thSlug = reviewSlug(review, "th");
  const enSlug = reviewSlug(review, "en");
  const localeSlug = typedLocale === "en" ? enSlug : thSlug;
  const canonical = reviewMetaPath(localeSlug, typedLocale);
  const imageUrl = review.image ? `${SITE_URL}${review.image}` : undefined;

  return {
    // metaTitle already carries the " | Pacred" suffix, so bypass the layout
    // title template (which would append a second one).
    title: { absolute: content.metaTitle },
    description: content.metaDescription,
    keywords: content.keywords,
    alternates: {
      canonical,
      languages: {
        "th-TH": reviewMetaPath(thSlug, "th"),
        "en-US": reviewMetaPath(enSlug, "en"),
        "x-default": reviewMetaPath(thSlug, "th"),
      },
    },
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      type: "article",
      url: canonical,
      images: imageUrl ? [{ url: imageUrl, alt: content.h1 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: content.metaTitle,
      description: content.metaDescription,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function ReviewLandingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const review = getReviewBySlugOrId(id);

  // ── CMS-FIRST (Stage 2) — the catalog cases are migrated to cms_articles and are
  // back-office editable. Resolve the editable CMS version by the URL slug, or by the
  // matched catalog review's canonical (TH) slug — so every URL form (TH slug · EN
  // slug · legacy short-id) renders the editable CMS case. The catalog branch below
  // is the fallback only for a case not (yet) in CMS. ──
  const cmsBySlug = await getPublishedArticleBySlug(id);
  const cmsArticle =
    cmsBySlug?.category === "our_work"
      ? cmsBySlug
      : review
        ? await getPublishedArticleBySlug(reviewCanonicalSlug(review))
        : null;

  if (cmsArticle && cmsArticle.category === "our_work") {
    const cmsSession = await getCurrentUserWithProfile();
    const t = await getTranslations({ locale, namespace: "reviews" });
    const cmsSlug = `cms-${cmsArticle.id}`;
    const cmsInitialComments = await listCaseComments(cmsSlug);
    const cmsCommenterName =
      [cmsSession?.profile?.first_name, cmsSession?.profile?.last_name].filter(Boolean).join(" ").trim() ||
      cmsSession?.profile?.member_code ||
      null;

    const galleryImages = [
      ...(cmsArticle.coverUrl ? [cmsArticle.coverUrl] : []),
      ...(cmsArticle.galleryImages ?? []),
    ];
    const ytId = extractYouTubeId(cmsArticle.videoUrl ?? "");
    const relatedCases = REVIEWS.slice(0, 4);

    // Rating: average of rated comments → else the editor's caseRating → else 5.0.
    const cmsRated = cmsInitialComments.filter((c) => typeof c.rating === "number" && (c.rating ?? 0) > 0);
    const cmsRating = cmsRated.length
      ? cmsRated.reduce((s, c) => s + (c.rating ?? 0), 0) / cmsRated.length
      : (cmsArticle.caseRating ?? 5);
    const cmsRatingWord = typedLocale === "en"
      ? cmsRating >= 4.5 ? "Excellent" : cmsRating >= 3.5 ? "Very good" : "Good"
      : cmsRating >= 4.5 ? "ยอดเยี่ยม" : cmsRating >= 3.5 ? "ดีมาก" : "ดี";

    const cmsUi = typedLocale === "th"
      ? { home: "หน้าหลัก", reviews: "ผลงานของเรา", quoteFree: "ขอใบเสนอราคาฟรี", priceLead: "ราคาประเมินตามงาน", fastReply: "ปรึกษาฟรี · ทีมงานตอบกลับเร็ว", verified: "ผลงานจริงของ Pacred", relatedEyebrow: "Our Case Studies", related: "ผลงานอื่นๆ", viewAll: "ดูผลงานทั้งหมด", readMore: "ดูผลงาน" }
      : { home: "Home", reviews: "Our work", quoteFree: "Get a free quote", priceLead: "Quote based on the job", fastReply: "Free consult · fast reply", verified: "Real Pacred case", relatedEyebrow: "Our Case Studies", related: "More cases", viewAll: "View all cases", readMore: "View case" };

    const cmsCommentsUi = typedLocale === "th"
      ? { title: "ความคิดเห็น", placeholder: "เขียนความคิดเห็นของคุณเกี่ยวกับงานนี้...", submit: "ส่งความคิดเห็น", posting: "กำลังส่ง...", loginPrompt: "เข้าสู่ระบบเพื่อแสดงความคิดเห็น", loginCta: "เข้าสู่ระบบ", empty: "ยังไม่มีความคิดเห็น — เป็นคนแรกที่แสดงความคิดเห็น!", tooShort: "พิมพ์ความคิดเห็นอย่างน้อย 2 ตัวอักษร", asYou: "คุณ" }
      : { title: "Comments", placeholder: "Write your comment about this case...", submit: "Post comment", posting: "Posting...", loginPrompt: "Log in to leave a comment", loginCta: "Log in", empty: "No comments yet — be the first to comment!", tooShort: "Please write at least 2 characters", asYou: "You" };

    return (
      <>
        <JsonLd data={[breadcrumbSchema([{ name: cmsUi.home, path: "/" }, { name: cmsUi.reviews, path: ourWorkPath(typedLocale) }, { name: cmsArticle.title, path: `/our-work/${cmsArticle.slug}` }], typedLocale)]} />
        <NavBar />
        <SearchBar />
        <main>
          <article className="relative pb-10 pt-4 md:pb-16 md:pt-6">
            <div className="mx-auto w-full max-w-[1140px] px-4 md:px-6">
              {/* Breadcrumb */}
              <nav className="mb-3 flex flex-wrap items-center gap-1 text-[11.5px] text-muted md:mb-4 md:text-[12.5px]">
                <Link href="/" className="font-bold transition-colors hover:text-primary-600">{cmsUi.home}</Link>
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                <Link href={ourWorkPath(typedLocale)} prefetch={false} className="font-bold transition-colors hover:text-primary-600">{cmsUi.reviews}</Link>
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className="line-clamp-1 font-bold text-[#111827] dark:text-white">{cmsArticle.title}</span>
              </nav>

              {/* Hero card */}
              <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_44px_-16px_rgba(15,23,42,0.3)] dark:bg-surface md:rounded-3xl">
                {galleryImages.length > 0 ? (
                  <CaseGallery images={galleryImages} alt={cmsArticle.title} />
                ) : null}

                {/* Video embed */}
                {cmsArticle.videoUrl ? (
                  ytId ? (
                    <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${ytId}`}
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="วิดีโอผลงาน"
                      />
                    </div>
                  ) : (
                    <div className="p-4">
                      <video src={cmsArticle.videoUrl} controls preload="metadata" className="w-full rounded-xl" />
                    </div>
                  )
                ) : null}

                {/* Info + booking sidebar */}
                <div className="grid gap-6 p-5 md:grid-cols-[1fr_minmax(0,340px)] md:gap-8 md:p-6">
                  <header>
                    <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.6} />
                      {cmsUi.verified}
                    </span>
                    <h1 className="mt-2.5 text-[24px] font-black leading-[1.2] tracking-[-0.03em] text-[#111827] dark:text-white md:text-[30px]">
                      {cmsArticle.title}
                    </h1>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[14px] font-black text-primary-700 dark:text-primary-300">{cmsRatingWord}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={["h-3.5 w-3.5", i < Math.round(cmsRating) ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-300 dark:fill-surface dark:text-surface-alt"].join(" ")} strokeWidth={1.8} />
                          ))}
                        </div>
                        {cmsRated.length > 0 ? (
                          <span className="text-[12.5px] font-bold text-muted tabular-nums">({cmsRated.length} {typedLocale === "en" ? "reviews" : "รีวิว"})</span>
                        ) : null}
                      </div>
                      {cmsArticle.caseRoute ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-alt/60 px-2.5 py-0.5 text-[12.5px] font-bold text-foreground">
                          {cmsArticle.caseRoute}
                        </span>
                      ) : null}
                    </div>
                    {cmsArticle.excerpt ? (
                      <p className="mt-3 text-[14px] leading-relaxed text-muted">{cmsArticle.excerpt}</p>
                    ) : null}
                    {cmsArticle.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cmsArticle.tags.map((tg) => (
                          <Link key={tg} href={`/our-work?tag=${encodeURIComponent(tg)}`} className="rounded-full border border-primary-100 bg-primary-50 px-2.5 py-0.5 text-[12px] font-semibold text-primary-700 transition hover:bg-primary-100 dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-300">
                            #{tg}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </header>

                  <aside className="self-start rounded-2xl border border-border bg-white p-5 shadow-[0_12px_32px_-14px_rgba(15,23,42,0.22)] dark:bg-surface">
                    <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{cmsArticle.casePrice ? (typedLocale === "en" ? "Starting price" : "ราคาเริ่มต้น") : cmsUi.priceLead}</p>
                    <p className="mt-0.5 text-[26px] font-black leading-tight tracking-[-0.02em] text-primary-600">{cmsArticle.casePrice || cmsUi.quoteFree}</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                      {typedLocale === "th" ? "ทีมงาน Pacred พร้อมให้คำปรึกษาฟรี ตั้งแต่นำเข้าจีน เคลียร์ศุลกากร ถึงปลายทาง" : "Pacred team offers free consultation for China import, customs clearance and last-mile delivery"}
                    </p>
                    <Link href="/line" className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-[14px] font-black text-white shadow-[0_8px_18px_rgba(179,0,0,0.28)] transition-all duration-300 hover:scale-[1.02] hover:bg-primary-700 active:scale-95">
                      ทักไลน์ Pacred <ArrowRight className="h-4 w-4" strokeWidth={3} />
                    </Link>
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.8} />
                      {cmsUi.fastReply}
                    </p>
                  </aside>
                </div>
              </div>

              <div className="mt-8 space-y-8 md:mt-10 md:space-y-10">
                {/* ข้อมูลขนส่ง — case facts grid */}
                {cmsArticle.caseFacts.length > 0 ? (
                  <section>
                    <div className={EYEBROW}>
                      <Star className="h-3.5 w-3.5 fill-primary-600" strokeWidth={2.6} />
                      {typedLocale === "en" ? "Shipment details" : "ข้อมูลขนส่ง"}
                    </div>
                    <h2 className={H2}>{typedLocale === "en" ? "Shipment details" : "ข้อมูลขนส่ง"}</h2>
                    <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3">
                      {cmsArticle.caseFacts.map((f, i) => (
                        <div key={i} className="rounded-xl border border-border bg-white p-3 dark:bg-surface">
                          <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">{f.label}</p>
                          <p className="mt-0.5 text-[14px] font-black text-foreground">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Body content */}
                {cmsArticle.body.trim() ? (
                  <section>
                    <div className="mx-auto w-full max-w-[760px]">
                      <ArticleContent text={cmsArticle.body} title={cmsArticle.title} />
                    </div>
                  </section>
                ) : null}

                {/* Comments — ABOVE ผลงานอื่นๆ · full-width left-aligned with ข้อมูลขนส่ง per ปอน 2026-06-25 */}
                <div className="w-full">
                  <CaseComments
                    caseSlug={cmsSlug}
                    initialComments={cmsInitialComments}
                    isLoggedIn={!!cmsSession?.user}
                    currentUserName={cmsCommenterName}
                    currentUserAvatar={cmsSession?.profile?.avatar_url ?? null}
                    locale={typedLocale}
                    ui={cmsCommentsUi}
                  />
                </div>

                {/* Related catalog cases */}
                {relatedCases.length > 0 ? (
                  <section>
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <div className={EYEBROW}>
                          <Star className="h-3.5 w-3.5 fill-primary-600" strokeWidth={2.6} />
                          {cmsUi.relatedEyebrow}
                        </div>
                        <h2 className={H2}>{cmsUi.related}</h2>
                      </div>
                      <Link href={ourWorkPath(typedLocale)} prefetch={false} className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-[12px] font-black text-[#111827] transition-all duration-300 hover:border-primary-600 hover:bg-primary-600 hover:text-white sm:inline-flex dark:bg-surface dark:text-white">
                        {cmsUi.viewAll} <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {relatedCases.map((r) => (
                        <Link key={r.id} href={reviewUrl(reviewSlug(r, typedLocale), typedLocale)} prefetch={false} className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_16px_32px_rgba(179,0,0,0.10)] dark:bg-surface dark:hover:border-primary-900">
                          <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-surface-alt">
                            {r.image && <Image src={r.image} alt={t(r.titleKey)} fill sizes="(max-width: 1024px) 50vw, 260px" quality={92} className="object-cover transition-transform duration-500 group-hover:scale-[1.05]" />}
                          </div>
                          <div className="flex flex-1 flex-col gap-1.5 p-3">
                            <h3 className="line-clamp-2 text-[13px] font-black leading-snug tracking-tight text-[#111827] transition-colors group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-300">{t(r.titleKey)}</h3>
                            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[11.5px] font-black text-primary-600 opacity-80 transition-opacity group-hover:opacity-100">
                              {cmsUi.readMore} <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

              </div>
            </div>
          </article>
          <HomeBottomBanner />
        </main>
        <Footer />
      </>
    );
  }
  // ── catalog fallback — only reached for a case not in CMS ──
  if (!review) notFound();
  const t = await getTranslations({ locale, namespace: "reviews" });
  const content = getReviewContent(review, typedLocale);
  const related = getRelatedReviews(review.id, 6);

  const serviceTitle = t(review.titleKey);
  const heading = reviewHeading(review, typedLocale);
  const typeLabel = t(TYPE_LABEL_KEY[review.type]);
  const galleryImages = reviewGalleryImages(review);
  const logisticsFacts = reviewLogisticsFacts(review, typedLocale);
  const localeSlug = reviewSlug(review, typedLocale);
  const hsCode = reviewHsCode(review);
  const routeLabel = reviewRoute(review, typedLocale);

  // The minimal fact set, in ปอน's order, always ending with พิกัด HS.
  const keyFacts = [
    ...FACT_ORDER.flatMap((k) => {
      const f = logisticsFacts.find((x) => x.key === k);
      return f ? [f] : [];
    }),
    logisticsFacts.find((f) => f.key === "hs") ?? {
      key: "hs",
      label: typedLocale === "th" ? "พิกัดศุลกากร (HS)" : "HS code",
      value: `HS ${hsCode}`,
    },
  ];
  const logisticsProse = buildLogisticsProse(keyFacts, typedLocale);

  // Comments (login-gated · ปอน 2026-06-25) — keyed by the stable review id so
  // th + en share one thread. Fails soft to [] until migration 0210 is applied.
  const commentCaseSlug = String(review.id);
  const session = await getCurrentUserWithProfile();
  const initialComments = await listCaseComments(commentCaseSlug);

  // Hero score = AVERAGE of the comment star-ratings (ปอน 2026-06-25 "คะแนนดาว
  // โชว์เป็นค่าเฉลี่ยจากคอมเมนต์"). Falls back to the curated review.rating when
  // no rated comment exists yet, so a brand-new case never shows 0.0.
  const ratedComments = initialComments.filter((c) => typeof c.rating === "number" && (c.rating ?? 0) > 0);
  const reviewCount = ratedComments.length;
  const displayRating = reviewCount
    ? ratedComments.reduce((s, c) => s + (c.rating ?? 0), 0) / reviewCount
    : review.rating;
  const ratingWord =
    typedLocale === "en"
      ? displayRating >= 4.5 ? "Excellent" : displayRating >= 3.5 ? "Very good" : "Good"
      : displayRating >= 4.5 ? "ยอดเยี่ยม" : displayRating >= 3.5 ? "ดีมาก" : "ดี";

  // Real starting price pulled from the linked service page's i18n (ปอน "ดึงราคา
  // จากในหน้าเว็บ"); null when that service publishes no price → quote fallback.
  // (`ui` is defined further down, so the label is composed inline in the JSX.)
  const priceSrc = SERVICE_PUBLISHED_PRICE[content.cta.href];
  let realPriceFrom: string | null = null;
  if (priceSrc) {
    const tp = await getTranslations({ locale, namespace: priceSrc.ns });
    realPriceFrom = tp(priceSrc.key);
  }

  // Starting price for each "ผลงานอื่นๆ" card — same source as the hero booking
  // card (ปอน "ดึงราคาจากในหน้าเว็บ"): the linked service page's published i18n
  // price. Only services that publish a price get a number; the rest stay
  // price-less (no fake number). Namespaces resolved once each (deduped).
  const relatedPriceSrc = related.map((r) => SERVICE_PUBLISHED_PRICE[getReviewContent(r, typedLocale).cta.href] ?? null);
  const relatedPriceTranslators = new Map(
    await Promise.all(
      [...new Set(relatedPriceSrc.filter(Boolean).map((s) => s!.ns))].map(
        async (ns) => [ns, await getTranslations({ locale, namespace: ns })] as const,
      ),
    ),
  );
  const relatedPrices = relatedPriceSrc.map((s) => (s ? relatedPriceTranslators.get(s.ns)!(s.key) : null));

  const commenterName =
    [session?.profile?.first_name, session?.profile?.last_name].filter(Boolean).join(" ").trim() ||
    session?.profile?.member_code ||
    null;
  const commentsUi =
    typedLocale === "th"
      ? {
          title: "ความคิดเห็น",
          placeholder: "เขียนความคิดเห็นของคุณเกี่ยวกับงานนี้...",
          submit: "ส่งความคิดเห็น",
          posting: "กำลังส่ง...",
          loginPrompt: "เข้าสู่ระบบเพื่อแสดงความคิดเห็น",
          loginCta: "เข้าสู่ระบบ",
          empty: "ยังไม่มีความคิดเห็น — เป็นคนแรกที่แสดงความคิดเห็น!",
          tooShort: "พิมพ์ความคิดเห็นอย่างน้อย 2 ตัวอักษร",
          asYou: "คุณ",
        }
      : {
          title: "Comments",
          placeholder: "Write your comment about this case...",
          submit: "Post comment",
          posting: "Posting...",
          loginPrompt: "Log in to leave a comment",
          loginCta: "Log in",
          empty: "No comments yet — be the first to comment!",
          tooShort: "Please write at least 2 characters",
          asYou: "You",
        };

  const ui =
    typedLocale === "th"
      ? {
          home: "หน้าหลัก",
          reviews: "ผลงานของเรา",
          logistics: "ข้อมูลขนส่ง",
          related: "ผลงานอื่นๆ",
          relatedEyebrow: "Our Case Studies",
          viewAll: "ดูผลงานทั้งหมด",
          verified: "ผลงานจริงของ Pacred",
          readMore: "ดูผลงาน",
          quoteFree: "ขอใบเสนอราคาฟรี",
          priceLead: "ราคาประเมินตามงาน",
          fastReply: "ปรึกษาฟรี · ทีมงานตอบกลับเร็ว",
        }
      : {
          home: "Home",
          reviews: "Our work",
          logistics: "Shipping details",
          related: "More cases",
          relatedEyebrow: "Our Case Studies",
          viewAll: "View all cases",
          verified: "Real Pacred case",
          readMore: "View case",
          quoteFree: "Get a free quote",
          priceLead: "Quote based on the job",
          fastReply: "Free consult · fast reply",
        };

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: serviceTitle,
            description: content.metaDescription,
            slug: content.cta.href,
            serviceType: content.serviceLabel,
            areaServed: ["TH", "CN"],
            locale: typedLocale,
          }),
          faqPageSchema(content.faq),
          breadcrumbSchema(
            [
              { name: ui.home, path: "/" },
              { name: ui.reviews, path: ourWorkPath(typedLocale) },
              { name: heading, path: reviewUrl(localeSlug, typedLocale) },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <article className="relative pt-4 md:pt-6 pb-10 md:pb-16">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-6">
            {/* Breadcrumb */}
            <nav className="mb-3 flex flex-wrap items-center gap-1 text-[11.5px] text-muted md:mb-4 md:text-[12.5px]">
              <Link href="/" className="font-bold transition-colors hover:text-primary-600">
                {ui.home}
              </Link>
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              <Link href={ourWorkPath(typedLocale)} prefetch={false} className="font-bold transition-colors hover:text-primary-600">
                {ui.reviews}
              </Link>
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="line-clamp-1 font-bold text-[#111827] dark:text-white">{heading}</span>
            </nav>

            {/* HERO — gallery + a light title/score/intro on the left, booking on the right */}
            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_18px_44px_-16px_rgba(15,23,42,0.3)] dark:bg-surface md:rounded-3xl">
              <CaseGallery images={galleryImages} alt={content.h1} verifiedLabel={ui.verified} />

              <div className="grid gap-6 p-5 md:grid-cols-[1fr_minmax(0,340px)] md:gap-8 md:p-6">
                <header>
                  {/* Meta — type + route only (at-a-glance) */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black tracking-wider", TYPE_BADGE[review.type]].join(" ")}>
                      {typeLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-gray-100 px-2.5 py-1 text-[11px] font-bold tracking-wider text-[#455873] dark:bg-surface dark:text-white">
                      {routeLabel}
                    </span>
                  </div>

                  <h1 className="mt-2.5 text-[24px] font-black leading-[1.2] tracking-[-0.03em] text-[#111827] dark:text-white md:text-[30px]">
                    {content.h1}
                  </h1>

                  {/* Score row — avg pill + word + stars + review count + verified */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-baseline gap-0.5 rounded-md rounded-tr-none bg-primary-700 px-2 py-0.5 text-white">
                      <span className="text-[15px] font-black leading-none tabular-nums">{displayRating.toFixed(1)}</span>
                      <span className="text-[11px] font-bold text-white/70">/5</span>
                    </span>
                    <span className="text-[14px] font-black text-primary-700 dark:text-primary-300">{ratingWord}</span>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={["h-3.5 w-3.5", i < Math.round(displayRating) ? "fill-yellow-400 text-yellow-400" : "fill-gray-200 text-gray-300 dark:fill-surface dark:text-surface-alt"].join(" ")}
                          strokeWidth={1.8}
                        />
                      ))}
                    </div>
                    {reviewCount > 0 ? (
                      <span className="text-[12.5px] font-bold text-muted tabular-nums">
                        ({reviewCount} {typedLocale === "en" ? "reviews" : "รีวิว"})
                      </span>
                    ) : null}
                    <span className="hidden h-3 w-px bg-border sm:block" />
                    <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.6} />
                      {ui.verified}
                    </span>
                  </div>

                  <p className="mt-3 text-[14px] leading-relaxed text-muted">{logisticsProse}</p>
                </header>

                {/* Booking card — quote-based (no fake price) */}
                <aside className="self-start rounded-2xl border border-border bg-white p-5 shadow-[0_12px_32px_-14px_rgba(15,23,42,0.22)] dark:bg-surface">
                  <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted">
                    {realPriceFrom ? (typedLocale === "en" ? "Starting price" : "ราคาเริ่มต้น") : ui.priceLead}
                  </p>
                  <p className="mt-0.5 text-[26px] font-black leading-tight tracking-[-0.02em] text-primary-600">
                    {realPriceFrom ?? ui.quoteFree}
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{content.cta.description}</p>
                  <Link
                    href={content.cta.href}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-[14px] font-black text-white shadow-[0_8px_18px_rgba(179,0,0,0.28)] transition-all duration-300 hover:scale-[1.02] hover:bg-primary-700 active:scale-95"
                  >
                    {content.cta.label}
                    <ArrowRight className="h-4 w-4" strokeWidth={3} />
                  </Link>
                  <Link
                    href="/line"
                    className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-white text-[13.5px] font-black text-[#111827] transition-colors hover:border-primary-300 hover:text-primary-700 dark:bg-surface dark:text-white"
                  >
                    ทักไลน์ Pacred
                  </Link>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.8} />
                    {ui.fastReply}
                  </p>
                </aside>
              </div>
            </div>

            {/* Stacked sections — one consistent rhythm (32 / 40) */}
            <div className="mt-8 space-y-8 md:mt-10 md:space-y-10">
              {/* ความคิดเห็น — comments (login-gated · ABOVE ผลงานอื่นๆ · full-width left-aligned with ข้อมูลขนส่ง per ปอน 2026-06-25) */}
              <div className="w-full">
                <CaseComments
                  caseSlug={commentCaseSlug}
                  initialComments={initialComments}
                  isLoggedIn={!!session?.user}
                  currentUserName={commenterName}
                  currentUserAvatar={session?.profile?.avatar_url ?? null}
                  locale={typedLocale}
                  ui={commentsUi}
                />
              </div>

              {/* ผลงานอื่นๆ — related cases (full-frame, Trip-style cards) */}
              {related.length > 0 && (
                <section>
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <div className={EYEBROW}>
                        <Star className="h-3.5 w-3.5 fill-primary-600" strokeWidth={2.6} />
                        {ui.relatedEyebrow}
                      </div>
                      <h2 className={H2}>{ui.related}</h2>
                    </div>
                    <Link
                      href={ourWorkPath(typedLocale)}
                      prefetch={false}
                      className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-[12px] font-black text-[#111827] transition-all duration-300 hover:border-primary-600 hover:bg-primary-600 hover:text-white sm:inline-flex dark:bg-surface dark:text-white"
                    >
                      {ui.viewAll}
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
                    </Link>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {related.map((r, i) => (
                      <Link
                        key={r.id}
                        href={reviewUrl(reviewSlug(r, typedLocale), typedLocale)}
                        prefetch={false}
                        className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-[0_16px_32px_rgba(179,0,0,0.10)] dark:bg-surface dark:hover:border-primary-900"
                      >
                        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-surface-alt">
                          {r.image && (
                            <Image
                              src={r.image}
                              alt={t(r.titleKey)}
                              fill
                              sizes="(max-width: 1024px) 50vw, 260px"
                              quality={92}
                              className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                            />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5 p-3">
                          <h3 className="line-clamp-2 text-[13px] font-black leading-snug tracking-tight text-[#111827] transition-colors group-hover:text-primary-700 dark:text-white dark:group-hover:text-primary-300">
                            {t(r.titleKey)}
                          </h3>
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-baseline gap-0.5 rounded rounded-tr-none bg-primary-700 px-1.5 py-0.5 text-white">
                              <span className="text-[11.5px] font-black leading-none tabular-nums">{r.rating}.0</span>
                              <span className="text-[11px] font-bold text-white/70">/5</span>
                            </span>
                            <span className="text-[11px] font-bold text-muted">{t(TYPE_LABEL_KEY[r.type])}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {r.tagKeys.slice(0, 2).map((tk) => (
                              <span key={tk} className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-[#455873] dark:bg-surface-alt dark:text-white">
                                {t(tk)}
                              </span>
                            ))}
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-1.5 pt-1.5">
                            {relatedPrices[i] ? (
                              <span className="text-[14px] font-black leading-none tracking-[-0.02em] text-primary-600">
                                {relatedPrices[i]}
                              </span>
                            ) : null}
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-black text-primary-600 opacity-80 transition-opacity group-hover:opacity-100">
                              {ui.readMore}
                              <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

            </div>
          </div>
        </article>

        <HomeBottomBanner />
      </main>
      <Footer />
    </>
  );
}
