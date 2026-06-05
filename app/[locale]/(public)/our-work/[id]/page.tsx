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
import { SITE_URL } from "@/components/seo/site";
import {
  REVIEWS,
  getReviewById,
  getRelatedReviews,
  type ServiceType,
} from "@/lib/reviews/catalog";
import { getReviewContent } from "@/lib/reviews/content";

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

export function generateStaticParams() {
  return REVIEWS.map((r) => ({ id: r.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const review = getReviewById(id);
  if (!review) return { title: locale === "en" ? "Case not found" : "ไม่พบผลงาน" };

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const content = getReviewContent(review, typedLocale);
  const canonical = `${typedLocale === "th" ? "" : `/${typedLocale}`}/our-work/${id}`;
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
        "th-TH": `/our-work/${id}`,
        "en-US": `/en/our-work/${id}`,
        "x-default": `/our-work/${id}`,
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
  const review = getReviewById(id);
  if (!review) notFound();

  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: "reviews" });
  const content = getReviewContent(review, typedLocale);
  const related = getRelatedReviews(id, 6);

  const serviceTitle = t(review.titleKey);
  const typeLabel = t(TYPE_LABEL_KEY[review.type]);

  const ui =
    typedLocale === "th"
      ? {
          home: "หน้าหลัก",
          reviews: "ผลงานของเรา",
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
              { name: ui.reviews, path: "/our-work" },
              { name: serviceTitle, path: `/our-work/${id}` },
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
            <nav className="mx-auto w-full max-w-[1080px] flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                {ui.home}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <Link href="/our-work" className="hover:text-primary-600 transition-colors font-bold">
                {ui.reviews}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white line-clamp-1">
                {serviceTitle}
              </span>
            </nav>

            {/* Hero — cover + headline side by side on desktop */}
            <div className="mx-auto w-full max-w-[1080px] grid md:grid-cols-[minmax(0,360px)_1fr] gap-5 md:gap-8 items-start">
              {/* Cover */}
              <figure className="relative w-full max-w-[360px] mx-auto md:mx-0 aspect-[3/4] rounded-2xl md:rounded-3xl overflow-hidden border border-border shadow-[0_14px_36px_-12px_rgba(15,23,42,0.22)] bg-gradient-to-br from-gray-200 via-gray-400 to-gray-700 dark:from-surface-alt dark:via-surface dark:to-background">
                {review.image && (
                  <Image
                    src={review.image}
                    alt={content.h1}
                    fill
                    sizes="(max-width: 767px) 100vw, 360px"
                    quality={92}
                    className="object-cover"
                    priority
                  />
                )}
              </figure>

              {/* Headline block */}
              <header>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span
                    className={[
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black tracking-wider border",
                      TYPE_BADGE[review.type],
                    ].join(" ")}
                  >
                    {typeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-black tracking-wider px-2.5 py-1 rounded-full border border-border text-muted">
                    {content.code}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] md:text-[12px] text-primary-600 font-black">
                    <BadgeCheck className="w-3.5 h-3.5" strokeWidth={2.8} />
                    {ui.verified}
                  </span>
                </div>

                <h1 className="text-[24px] md:text-[34px] leading-[1.2] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                  {content.h1}
                </h1>

                {/* Stars */}
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={[
                          "w-4.5 h-4.5",
                          i < review.rating
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-gray-300 fill-gray-200 dark:text-surface-alt dark:fill-surface",
                        ].join(" ")}
                        strokeWidth={1.8}
                      />
                    ))}
                  </div>
                  <span className="text-[#111827] dark:text-white text-[13px] font-black tabular-nums">
                    {review.rating}.0
                  </span>
                </div>

                {/* Tag chips */}
                <div className="mt-3.5 flex items-center gap-1.5 flex-wrap">
                  {review.tagKeys.map((tagKey) => (
                    <span
                      key={tagKey}
                      className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 dark:bg-surface text-[#111827] dark:text-white text-[11px] font-black border border-border"
                    >
                      {t(tagKey)}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-[14px] md:text-[16px] leading-[1.7] text-muted">
                  {content.intro}
                </p>

                {/* Primary CTA → matching service landing page */}
                <Link
                  href={content.cta.href}
                  className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-primary-600 text-white text-[13px] md:text-[14px] font-black shadow-[0_8px_18px_rgba(179,0,0,0.28)] hover:bg-primary-700 hover:scale-[1.02] active:scale-95 transition-all duration-300"
                >
                  {content.cta.label}
                  <ArrowRight className="w-4 h-4" strokeWidth={3} />
                </Link>
              </header>
            </div>

            {/* Body sections */}
            <div className="mx-auto mt-9 md:mt-12 w-full max-w-[820px] space-y-7 md:space-y-9">
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
                <section>
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
          <article className="relative pt-2 md:pt-4 pb-10 md:pb-16">
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
                    href="/our-work"
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
                      href={`/our-work/${r.id}`}
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
                  href="/our-work"
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
