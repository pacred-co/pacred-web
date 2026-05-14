export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co"
).replace(/\/$/, "");

export const SITE_NAME = "Pacred";
export const SITE_LEGAL_NAME = "Pacred CO., LTD.";

export const SITE_LOCALES = ["th", "en"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];
export const DEFAULT_LOCALE: SiteLocale = "th";

/**
 * Pacred contact information — single source of truth.
 *
 * Authoritative info from เดฟ 2026-05-15 (`docs/pacred-info.md`).
 * Replace any hardcoded phone numbers / addresses across the codebase
 * by importing from here — see grep `066-131-0253` / `02-444-7046`
 * (PCS Cargo legacy values) for residual hardcoded references that
 * should migrate to CONTACT / ADDRESSES.
 */
export const CONTACT = {
  /** Default phone shown to customers (= sales primary). Back-compat alias for old `phone`/`phoneDisplay`. */
  phone:               "+66661253007",
  phoneDisplay:        "066-125-3007",
  /** Company main line — for footer / receipts / official invoices. */
  phoneCompany:        "+6624213325",
  phoneCompanyDisplay: "02-421-3325",
  /** Customer Service (CS) — currently routed to พลอย. */
  phoneCs:             "+66660901217",
  phoneCsDisplay:      "066-090-1217",
  /** Sales reps — used by booking-data + sales-carousel + cards. */
  phoneSalesDisplay:   ["066-125-3007", "066-125-3006"],
  /** General contact + sales-specific email. */
  email:               "contact@pacred.co",
  emailSales:          "sales@pacred.co",
} as const;

export const ADDRESSES = {
  /** Headquarters / mailing address — used in invoices, footer, JSON-LD PostalAddress. */
  office: {
    line:        "28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ",
    subDistrict: "หนองแขม",
    district:    "หนองแขม",
    province:    "กรุงเทพมหานคร",
    postcode:    "10160",
    full:        "28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160",
  },
  /** Bangkok-area receiving warehouse — Samut Sakhon. */
  warehouseTh: {
    line:        "48/3 หมู่ 12",
    subDistrict: "อ้อมน้อย",
    district:    "กระทุ่มแบน",
    province:    "สมุทรสาคร",
    postcode:    "74130",
    full:        "48/3 หมู่ 12 ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130",
  },
} as const;

export const SOCIAL = {
  line:      "https://lin.ee/Yg3fU0I",
  facebook:  "https://www.facebook.com/PacredShippingCustomsClearanceImportExport/",
  youtube:   "https://www.youtube.com/@PacredShipping",
  tiktok:    "https://www.tiktok.com/@pacred.co",
  instagram: "https://www.instagram.com/pacred.co/",
} as const;

/**
 * Pacred LINE OA — public IDs + add-friend URL forms.
 *
 * Two displayable handles exist (LINE OA tier):
 *   - basicId:   "@683wolja"  (auto-assigned random — kept as fallback)
 *   - premiumId: "@pacred"    (paid tier — preferred for branding)
 *
 * Three URL forms users can click to add the OA as friend:
 *   - shortUrl         — Pacred-controlled short link, brandable analytics in LINE console
 *   - premiumAddFriend — direct deep link via @pacred handle
 *   - basicAddFriend   — direct deep link via @683wolja (fallback if premium ID lapses)
 *
 * Channel-side identifiers (used by lib/notifications + LIFF):
 *   - LINE_CHANNEL_ID env var — `2009931373` (Messaging API channel)
 *   - LINE_CHANNEL_ACCESS_TOKEN env var — long-lived push token
 *   - NEXT_PUBLIC_LIFF_ID env var — LIFF app for D-1-LIFF customer linkage
 */
export const LINE_OA = {
  basicId:          "@683wolja",
  premiumId:        "@pacred",
  shortUrl:         "https://lin.ee/Yg3fU0I",
  premiumAddFriend: "https://line.me/R/ti/p/%40pacred",
  basicAddFriend:   "https://line.me/R/ti/p/%40683wolja",
  /** Default URL to use in CTAs — premium ID URL (most brandable). */
  addFriendUrl:     "https://line.me/R/ti/p/%40pacred",
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
