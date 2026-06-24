import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Star,
  BadgeCheck,
  HelpCircle,
  Tag,
  Sparkles,
  MapPin,
  Package,
  Phone,
  Award,
  Truck,
  Clock,
  Users,
  FileText,
  Ship,
  Anchor,
  type LucideIcon,
} from "lucide-react";
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
import { SITE_URL, CONTACT } from "@/components/seo/site";
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
  reviewProductLabel,
  reviewHsCode,
  reviewRoute,
  reviewGalleryImages,
  reviewLogisticsFacts,
  type ServiceType,
} from "@/lib/reviews/catalog";
import { getReviewContent } from "@/lib/reviews/content";
import { CaseGallery } from "./case-gallery";
import { CaseTabs } from "./case-tabs";

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

// Icon per logistics-fact key (the "ข้อมูลขนส่ง" grid · owner 2026-06-24).
const FACT_ICON: Record<string, LucideIcon> = {
  service: Ship,
  term: FileText,
  port: Anchor,
  zone: MapPin,
  truck: Truck,
  labor: Users,
  product: Package,
  duration: Clock,
  hs: Tag,
};

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
  const review = getReviewBySlugOrId(id);
  if (!review) return { title: locale === "en" ? "Case not found" : "ไม่พบผลงาน" };

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
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
  const review = getReviewBySlugOrId(id);
  if (!review) notFound();

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: "reviews" });
  const content = getReviewContent(review, typedLocale);
  const related = getRelatedReviews(review.id, 6);

  const serviceTitle = t(review.titleKey);
  // Breadcrumb leaf uses the URL-pattern as a natural (space-separated) heading
  // — ปอน "แพทเทิร์นแบบ url แต่ไม่มี - ทุกหน้า".
  const heading = reviewHeading(review, typedLocale);
  const typeLabel = t(TYPE_LABEL_KEY[review.type]);
  // Trip.com-style word for the score (5→ยอดเยี่ยม) — display only.
  const ratingWord =
    typedLocale === "en"
      ? review.rating >= 5 ? "Excellent" : review.rating >= 4 ? "Very good" : "Good"
      : review.rating >= 5 ? "ยอดเยี่ยม" : review.rating >= 4 ? "ดีมาก" : "ดี";
  // Trip.com-style gallery set — own cover + same-type real Pacred work photos.
  const galleryImages = reviewGalleryImages(review);
  const logisticsFacts = reviewLogisticsFacts(review, typedLocale);
  // product / HS-code / route dimension (ปอน 2026-06-11 · owner ".csv pattern + HS code")
  const localeSlug = reviewSlug(review, typedLocale);
  const productLabel = reviewProductLabel(review, typedLocale);
  const hsCode = reviewHsCode(review);
  const routeLabel = reviewRoute(review, typedLocale);

  const ui =
    typedLocale === "th"
      ? {
          home: "หน้าหลัก",
          reviews: "ผลงานของเรา",
          overview: "ภาพรวม",
          logistics: "ข้อมูลขนส่ง",
          keywords: "คีย์เวิร์ดที่เกี่ยวข้อง",
          faq: "คำถามที่พบบ่อย",
          related: "ผลงานอื่นๆ",
          relatedEyebrow: "Our Case Studies",
          viewAll: "ดูผลงานทั้งหมด",
          back: "กลับไปดูผลงานทั้งหมด",
          verified: "ผลงานจริงของ Pacred",
          readMore: "ดูผลงาน",
        }
      : {
          home: "Home",
          reviews: "Our work",
          overview: "Overview",
          logistics: "Shipping details",
          keywords: "Related keywords",
          faq: "Frequently asked questions",
          related: "More cases",
          relatedEyebrow: "Our Case Studies",
          viewAll: "View all cases",
          back: "Back to all cases",
          verified: "Real Pacred case",
          readMore: "View case",
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
          <div className="mx-auto w-full max-w-[1140px] px-[10px]">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-3 md:mb-4 flex-wrap">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                {ui.home}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <Link href={ourWorkPath(typedLocale)} prefetch={false} className="hover:text-primary-600 transition-colors font-bold">
                {ui.reviews}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white line-clamp-1">{heading}</span>
            </nav>

            {/* Hero card — gallery band + facts/CTA (draft pattern · Pacred theme · dynamic) */}
            <div className="overflow-hidden rounded-2xl md:rounded-3xl border border-border bg-white shadow-[0_18px_44px_-16px_rgba(15,23,42,0.3)] dark:bg-surface">
              {/* Gallery — Trip.com-style mosaic + lightbox (real Pacred work photos) */}
              <CaseGallery images={galleryImages} alt={content.h1} verifiedLabel={ui.verified} />

              {/* Hero content — facts (left) + CTA side-card (right) */}
              <div className="grid gap-6 p-5 md:grid-cols-[1fr_minmax(0,340px)] md:gap-8 md:p-7">
                {/* Left — badges, headline, rating, dynamic facts */}
                <header>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={["inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] font-black tracking-wider", TYPE_BADGE[review.type]].join(" ")}>
                      {typeLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10.5px] font-black tracking-wider text-muted">
                      {content.code}
                    </span>
                    {/* product + HS code (ปอน 2026-06-11 · owner "ติด hs code ให้เหมาะกับสินค้า") */}
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-gray-100 px-2.5 py-1 text-[10.5px] font-black tracking-wider text-[#111827] dark:bg-surface dark:text-white">
                      {productLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary-600 bg-primary-600 px-2.5 py-1 text-[10.5px] font-black tracking-wider tabular-nums text-white">
                      HS {hsCode}
                    </span>
                  </div>

                  <h1 className="text-[24px] md:text-[32px] leading-[1.2] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                    {content.h1}
                  </h1>

                  {/* Rating block — Trip.com-style: bold score chip + word + stars */}
                  <div className="mt-3.5 flex flex-wrap items-center gap-3">
                    <span className="grid h-12 w-12 flex-none place-items-center rounded-xl rounded-bl-sm bg-primary-600 text-[20px] font-black leading-none text-white tabular-nums shadow-[0_6px_14px_rgba(179,0,0,0.28)]">
                      {review.rating}.0
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] font-black text-[#111827] dark:text-white">{ratingWord}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={["w-3.5 h-3.5", i < review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300 fill-gray-200 dark:text-surface-alt dark:fill-surface"].join(" ")}
                              strokeWidth={1.8}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-bold text-primary-600">
                        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.8} />
                        {ui.verified}
                      </p>
                    </div>
                  </div>

                  {/* Distinction line (Trip.com "award badge" slot) */}
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11.5px] font-black text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      <Award className="h-3.5 w-3.5" strokeWidth={2.6} />
                      ดูแลครบวงจร · ต้นทางจีน → ส่งถึงปลายทางในไทย
                    </span>
                  </div>

                  {/* Tag chips — route (ต้นทาง → ปลายทาง) leads, then mode/term tags */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md border border-primary-100 bg-primary-50 px-2 py-1 text-[11px] font-black text-primary-700 dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-300">
                      {routeLabel}
                    </span>
                    {review.tagKeys.map((tagKey) => (
                      <span key={tagKey} className="inline-flex items-center rounded-md border border-border bg-gray-100 px-2 py-1 text-[11px] font-black text-[#111827] dark:bg-surface dark:text-white">
                        {t(tagKey)}
                      </span>
                    ))}
                  </div>

                  <p className="mt-4 text-[14px] md:text-[15.5px] leading-[1.7] text-muted">
                    {content.intro}
                  </p>

                  {/* Quick facts — dynamic per case (เส้นทาง · บริการ · HS · ติดต่อ) */}
                  <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30">
                        <MapPin className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      <div className="text-[13.5px] leading-snug">
                        <dt className="font-black text-[#111827] dark:text-white">เส้นทางขนส่ง</dt>
                        <dd className="text-muted">{routeLabel}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30">
                        <Package className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      <div className="text-[13.5px] leading-snug">
                        <dt className="font-black text-[#111827] dark:text-white">ประเภทบริการ</dt>
                        <dd className="text-muted">{typeLabel}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30">
                        <Tag className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      <div className="text-[13.5px] leading-snug">
                        <dt className="font-black text-[#111827] dark:text-white">พิกัดศุลกากร (HS)</dt>
                        <dd className="text-muted">HS {hsCode} · {productLabel}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30">
                        <Phone className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </span>
                      <div className="text-[13.5px] leading-snug">
                        <dt className="font-black text-[#111827] dark:text-white">ติดต่อทีม Pacred</dt>
                        <dd className="text-muted">
                          <a href={`tel:${CONTACT.phone}`} className="font-bold text-primary-600 hover:underline">{CONTACT.phoneDisplay}</a>
                          {" · "}
                          <Link href="/line" className="font-bold text-primary-600 hover:underline">LINE OA</Link>
                        </dd>
                      </div>
                    </div>
                  </dl>
                </header>

                {/* Right — CTA side-card (real CTA + contact · no fake price) */}
                <aside className="self-start rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5 dark:border-primary-900/50 dark:from-primary-900/20 dark:to-surface">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-primary-600">สนใจบริการนี้?</p>
                  <p className="mt-1 text-[17px] font-black leading-snug text-[#111827] dark:text-white">{content.cta.label}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{content.cta.description}</p>
                  <Link
                    href={content.cta.href}
                    className="mt-3.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-600 text-[14px] font-black text-white shadow-[0_8px_18px_rgba(179,0,0,0.28)] transition-all duration-300 hover:bg-primary-700 hover:scale-[1.02] active:scale-95"
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
                  <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                    ราคาประเมินตามประเภทสินค้า น้ำหนัก/ปริมาตร เอกสาร และเงื่อนไขศุลกากร — ทีมงานช่วยตรวจให้ก่อนเริ่มงาน
                  </p>
                </aside>
              </div>
            </div>

            {/* Sticky section tabs (Trip.com-style scroll-spy) */}
            <CaseTabs
              tabs={[
                { id: "overview", label: ui.overview },
                ...(content.faq.length > 0 ? [{ id: "faq", label: ui.faq }] : []),
                ...(related.length > 0 ? [{ id: "related", label: ui.related }] : []),
              ]}
            />

            {/* Body sections */}
            <div className="mx-auto mt-9 md:mt-12 w-full max-w-[820px] space-y-7 md:space-y-9">
              {/* ข้อมูลขนส่ง — logistics fact grid (owner 2026-06-24) */}
              <section id="overview" className="scroll-mt-[195px]">
                <h2 className="mb-3 text-[18px] md:text-[22px] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                  {ui.logistics}
                </h2>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
                  {logisticsFacts.map((f) => {
                    const Icon = FACT_ICON[f.key] ?? Tag;
                    return (
                      <div key={f.key} className="rounded-xl border border-border bg-white p-3.5 dark:bg-surface">
                        <div className="mb-1 flex items-center gap-1.5 text-[11.5px] text-muted">
                          <Icon className="h-3.5 w-3.5 text-primary-600" strokeWidth={2.4} />
                          {f.label}
                        </div>
                        <div className="text-[13.5px] md:text-[14px] font-black leading-snug text-[#111827] dark:text-white">
                          {f.value}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {content.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-[18px] md:text-[22px] font-black tracking-[-0.03em] text-[#111827] dark:text-white mb-2.5">
                    {section.heading}
                  </h2>
                  <div className="space-y-3">
                    {section.paragraphs.map((p, i) => (
                      <p key={i} className="text-[14px] md:text-[15.5px] leading-[1.75] text-muted">
                        {p}
                      </p>
                    ))}
                  </div>
                </section>
              ))}

              {/* Keyword chips */}
              <section>
                <div className="flex items-center gap-2 mb-3 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.06em] uppercase">
                  <Tag className="w-3.5 h-3.5" strokeWidth={2.8} />
                  {ui.keywords}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {content.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-[11.5px] md:text-[12.5px] font-bold border border-primary-100 dark:border-primary-900/40"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </section>

              {/* FAQ */}
              {content.faq.length > 0 && (
                <section id="faq" className="scroll-mt-[195px]">
                  <div className="flex items-center gap-2 mb-3.5 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.06em] uppercase">
                    <HelpCircle className="w-3.5 h-3.5" strokeWidth={2.8} />
                    {ui.faq}
                  </div>
                  <div className="space-y-2.5">
                    {content.faq.map((item) => (
                      <details
                        key={item.question}
                        className="group rounded-2xl border border-border bg-white dark:bg-surface px-4 py-3.5 [&_summary::-webkit-details-marker]:hidden"
                      >
                        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-[13.5px] md:text-[15px] font-black text-[#111827] dark:text-white">
                          {item.question}
                          <ChevronRight className="w-4 h-4 shrink-0 text-primary-600 transition-transform duration-300 group-open:rotate-90" strokeWidth={2.8} />
                        </summary>
                        <p className="mt-2.5 text-[13px] md:text-[14.5px] leading-[1.7] text-muted">
                          {item.answer}
                        </p>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              {/* CTA card → matching service */}
              <section className="rounded-3xl border border-primary-200 dark:border-primary-900/50 bg-gradient-to-br from-primary-50 to-white dark:from-primary-900/20 dark:to-surface p-5 md:p-7">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-11 h-11 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                    <Sparkles className="w-5 h-5" strokeWidth={2.4} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[17px] md:text-[20px] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                      {content.cta.label}
                    </h2>
                    <p className="mt-1 text-[13px] md:text-[14.5px] leading-[1.6] text-muted">
                      {content.cta.description}
                    </p>
                    <Link
                      href={content.cta.href}
                      className="mt-3.5 inline-flex items-center gap-2 h-10 px-4.5 rounded-full bg-primary-600 text-white text-[12.5px] md:text-[13.5px] font-black hover:bg-primary-700 hover:scale-[1.02] active:scale-95 transition-all duration-300"
                    >
                      {content.cta.label}
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
                    </Link>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </article>

        <HomeBottomBanner />

        {/* Related reviews */}
        {related.length > 0 && (
          <article id="related" className="relative pt-2 md:pt-4 pb-10 md:pb-16 scroll-mt-[195px]">
            <div className="mx-auto w-full max-w-[1140px] px-[10px]">
              <div className="mx-auto w-full max-w-[1080px]">
                <div className="flex items-end justify-between gap-4 mb-4 md:mb-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                      <Star className="w-3.5 h-3.5 fill-primary-600" strokeWidth={2.6} />
                      {ui.relatedEyebrow}
                    </div>
                    <h2 className="text-[20px] md:text-[26px] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                      {ui.related}
                    </h2>
                  </div>
                  <Link
                    href={ourWorkPath(typedLocale)}
                    prefetch={false}
                    className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[12px] font-black hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
                  >
                    {ui.viewAll}
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={3} />
                  </Link>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 md:gap-4">
                  {related.map((r) => (
                    <Link
                      key={r.id}
                      href={reviewUrl(reviewSlug(r, typedLocale), typedLocale)}
                      prefetch={false}
                      className="group relative flex flex-col bg-white dark:bg-surface rounded-xl md:rounded-2xl border border-border overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_16px_32px_rgba(179,0,0,0.10)] hover:border-primary-200 dark:hover:border-primary-900 hover:-translate-y-1 transition-all duration-300"
                    >
                      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-gray-200 via-gray-400 to-gray-700 dark:from-surface-alt dark:via-surface dark:to-background">
                        {r.image && (
                          <Image
                            src={r.image}
                            alt={t(r.titleKey)}
                            fill
                            sizes="(max-width: 1024px) 50vw, 340px"
                            quality={92}
                            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
                        <div className="absolute bottom-2 left-2.5 flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={[
                                "w-3 h-3",
                                i < r.rating ? "text-yellow-400 fill-yellow-400" : "text-white/40 fill-white/20",
                              ].join(" ")}
                              strokeWidth={1.8}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col p-3 md:p-4 gap-1.5 flex-1">
                        <h3 className="text-[12.5px] md:text-[14px] font-black text-[#111827] dark:text-white leading-[1.3] tracking-tight line-clamp-2 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                          {t(r.titleKey)}
                        </h3>
                        <div className="mt-auto pt-1.5 flex items-center gap-1 text-primary-600 text-[10.5px] md:text-[11.5px] font-black opacity-80 group-hover:opacity-100 transition-opacity">
                          {ui.readMore}
                          <ArrowRight className="w-3 h-3 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Back to listing */}
              <div className="mx-auto mt-10 md:mt-12 w-full max-w-[1080px]">
                <Link
                  href={ourWorkPath(typedLocale)}
                  prefetch={false}
                  className="inline-flex items-center gap-1.5 text-[12.5px] md:text-[14px] font-black text-primary-600 hover:text-primary-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" strokeWidth={2.6} />
                  {ui.back}
                </Link>
              </div>
            </div>
          </article>
        )}
      </main>
      <Footer />
    </>
  );
}
