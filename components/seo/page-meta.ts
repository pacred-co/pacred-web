import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, SITE_LOCALES, type SiteLocale } from "./site";

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
  imagePath?: string;
};

export async function buildPageMetadata({
  locale,
  path,
  namespace,
  imagePath,
}: PageMetaInput): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  const title = t("title");
  const description = t("description");
  const typedLocale = (locale === "en" ? "en" : "th") as SiteLocale;
  const canonical = pathForLocale(path, typedLocale);

  const og: NonNullable<Metadata["openGraph"]> = {
    title,
    description,
    url: canonical,
    type: "website",
    locale: typedLocale === "en" ? "en_US" : "th_TH",
    alternateLocale: typedLocale === "en" ? ["th_TH"] : ["en_US"],
  };
  if (imagePath) {
    og.images = [{ url: imagePath, width: 1200, height: 630, alt: title }];
  }

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
      ...(imagePath ? { images: [imagePath] } : {}),
    },
  };
}
