import {
  CONTACT,
  LOGO_PATH,
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  SOCIAL,
  absoluteUrl,
  type SiteLocale,
} from "./site";

const LOGO_URL = `${SITE_URL}${LOGO_PATH}`;

export function organizationSchema(locale: SiteLocale = "th") {
  const description =
    locale === "th"
      ? "Pacred — ผู้ให้บริการนำเข้า-ส่งออก ชิปปิ้ง เคลียร์พิธีการศุลกากร ฝากสั่งซื้อสินค้าจากจีน FCL/LCL ครบวงจร"
      : "Pacred — end-to-end import & export, customs clearance, and China shop-order. FCL/LCL by road, sea, and air.";

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}#organization`,
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: LOGO_URL,
    },
    image: LOGO_URL,
    description,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: CONTACT.phone,
        email: CONTACT.email,
        areaServed: ["TH", "CN", "Worldwide"],
        availableLanguage: ["th", "en", "zh"],
      },
    ],
    sameAs: [SOCIAL.facebook, SOCIAL.youtube, SOCIAL.tiktok, SOCIAL.instagram, SOCIAL.line],
  };
}

export function localBusinessSchema(locale: SiteLocale = "th") {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}#localbusiness`,
    name: SITE_NAME,
    image: LOGO_URL,
    url: SITE_URL,
    telephone: CONTACT.phone,
    email: CONTACT.email,
    priceRange: "฿฿",
    address: {
      "@type": "PostalAddress",
      addressCountry: "TH",
      addressLocality: locale === "th" ? "กรุงเทพมหานคร" : "Bangkok",
    },
    sameAs: [SOCIAL.facebook, SOCIAL.youtube, SOCIAL.tiktok, SOCIAL.instagram, SOCIAL.line],
  };
}

export function websiteSchema(locale: SiteLocale = "th") {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    name: SITE_NAME,
    url: locale === "th" ? SITE_URL : `${SITE_URL}/${locale}`,
    inLanguage: locale === "th" ? "th-TH" : "en-US",
    publisher: { "@id": `${SITE_URL}#organization` },
  };
}

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbSchema(items: BreadcrumbItem[], locale: SiteLocale = "th") {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, locale),
    })),
  };
}

export type ServiceSchemaInput = {
  name: string;
  description: string;
  slug: string;
  serviceType?: string;
  areaServed?: string[];
  /** Representative image (absolute or root-relative). Falls back to the brand logo. */
  image?: string;
  locale?: SiteLocale;
};

export function serviceSchema({
  name,
  description,
  slug,
  serviceType,
  areaServed = ["TH"],
  image,
  locale = "th",
}: ServiceSchemaInput) {
  const imageUrl = image
    ? image.startsWith("http")
      ? image
      : `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`
    : LOGO_URL;
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    serviceType: serviceType ?? name,
    url: absoluteUrl(slug, locale),
    image: imageUrl,
    provider: { "@id": `${SITE_URL}#organization` },
    areaServed: areaServed.map((country) => ({ "@type": "Country", name: country })),
  };
}

export type FaqItem = { question: string; answer: string };

export function faqPageSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export type ArticleSchemaInput = {
  title: string;
  description: string;
  slug: string;
  image: string;
  datePublished?: string;
  dateModified?: string;
  locale?: SiteLocale;
};

export function articleSchema({
  title,
  description,
  slug,
  image,
  datePublished,
  dateModified,
  locale = "th",
}: ArticleSchemaInput) {
  const url = absoluteUrl(slug, locale);
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    image: image.startsWith("http") ? image : `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@id": `${SITE_URL}#organization` },
    publisher: { "@id": `${SITE_URL}#organization` },
    inLanguage: locale === "th" ? "th-TH" : "en-US",
  };
  if (datePublished) base.datePublished = datePublished;
  if (dateModified ?? datePublished) base.dateModified = dateModified ?? datePublished;
  return base;
}

export type ReviewSchemaInput = {
  /** Review headline (the page H1). */
  name: string;
  /** Review body — the lead paragraph. */
  reviewBody: string;
  /** Star rating, 1–5. */
  ratingValue: number;
  /** Name of the service being reviewed (the `itemReviewed`). */
  itemName: string;
  itemServiceType?: string;
  /** Page slug, e.g. `/reviews/fcl-1`. */
  slug: string;
  image?: string;
  locale?: SiteLocale;
};

/**
 * Review JSON-LD for a `/reviews/[id]` landing page. `itemReviewed` is a
 * `Service` (NOT the Organization/LocalBusiness itself) — self-serving review
 * snippets pointed at your own business are ineligible for rich results and
 * risk a manual action, whereas a review of a specific Service is the
 * standard, compliant pattern.
 */
export function reviewSchema({
  name,
  reviewBody,
  ratingValue,
  itemName,
  itemServiceType,
  slug,
  image,
  locale = "th",
}: ReviewSchemaInput) {
  const url = absoluteUrl(slug, locale);
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Review",
    name,
    reviewBody,
    url,
    inLanguage: locale === "th" ? "th-TH" : "en-US",
    author: { "@type": "Person", name: locale === "th" ? "ลูกค้า Pacred" : "Pacred customer" },
    publisher: { "@id": `${SITE_URL}#organization` },
    reviewRating: {
      "@type": "Rating",
      ratingValue,
      bestRating: 5,
      worstRating: 1,
    },
    itemReviewed: {
      "@type": "Service",
      name: itemName,
      serviceType: itemServiceType ?? itemName,
      provider: { "@id": `${SITE_URL}#organization` },
    },
  };
  if (image) {
    base.image = image.startsWith("http")
      ? image
      : `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`;
  }
  return base;
}
