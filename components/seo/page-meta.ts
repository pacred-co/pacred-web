import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, SITE_LOCALES, ogImageUrl, type SiteLocale } from "./site";

function pathForLocale(path: string, locale: SiteLocale): string {
  if (locale === DEFAULT_LOCALE) return path;
  return `/${locale}${path}`;
}

function languageMap(path: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of SITE_LOCALES) {
    map[l === "en" ? "en-US" : "th-TH"] = pathForLocale(path, l);
  }
  map["x-default"] = path;
  return map;
}

export type PageMetaInput = {
  locale: string;
  path: string;
  namespace: string;
  /** Explicit absolute image URL. Overrides `ogKey`. */
  imagePath?: string;
  /** Key into the /api/og branded-card registry. Falls back to the default card. */
  ogKey?: string;
};

export async function buildPageMetadata({
  locale,
  path,
  namespace,
  imagePath,
  ogKey,
}: PageMetaInput): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  const title = t("title");
  const description = t("description");
  const typedLocale = (locale === "en" ? "en" : "th") as SiteLocale;
  const canonical = pathForLocale(path, typedLocale);

  // Every page gets an og:image: an explicit override, the keyed branded
  // card, or the default branded card. (The Next file-convention
  // opengraph-image does not attach under the [locale] root segment, so we
  // reference the /api/og card explicitly — see ogImageUrl.)
  const image = imagePath ?? ogImageUrl(ogKey ?? "default");

  const og: NonNullable<Metadata["openGraph"]> = {
    title,
    description,
    url: canonical,
    type: "website",
    locale: typedLocale === "en" ? "en_US" : "th_TH",
    alternateLocale: typedLocale === "en" ? ["th_TH"] : ["en_US"],
    images: [{ url: image, width: 1200, height: 630, alt: title }],
  };

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: languageMap(path),
    },
    openGraph: og,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
