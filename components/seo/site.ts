export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co"
).replace(/\/$/, "");

export const SITE_NAME = "Pacred";
export const SITE_LEGAL_NAME = "Pacred CO., LTD.";

export const SITE_LOCALES = ["th", "en"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];
export const DEFAULT_LOCALE: SiteLocale = "th";

export const CONTACT = {
  phone: "+66661310253",
  phoneDisplay: "066-131-0253",
  email: "contact@pacred.co",
} as const;

export const SOCIAL = {
  line:      "https://lin.ee/Yg3fU0I",
  facebook:  "https://www.facebook.com/PacredShippingCustomsClearanceImportExport/",
  youtube:   "https://www.youtube.com/@PacredShipping",
  tiktok:    "https://www.tiktok.com/@pacred.co",
  instagram: "https://www.instagram.com/pacred.co/",
} as const;

export const LOGO_PATH = "/images/pacred-logo-red.png";

export function absoluteUrl(path: string, locale: SiteLocale = DEFAULT_LOCALE): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return `${SITE_URL}${prefix}${clean === "/" ? "" : clean}` || SITE_URL;
}

export function localizedUrls(path: string): Record<SiteLocale, string> {
  return SITE_LOCALES.reduce(
    (acc, locale) => ({ ...acc, [locale]: absoluteUrl(path, locale) }),
    {} as Record<SiteLocale, string>,
  );
}
