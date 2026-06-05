export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co"
).replace(/\/$/, "");

export const SITE_NAME = "Pacred";
export const SITE_LEGAL_NAME = "Pacred (Thailand) Co., Ltd.";
export const SITE_LEGAL_NAME_TH = "บริษัท แพคเรด (ประเทศไทย) จำกัด";
/** Company registration number (13 digits) — used by tax invoice + DBD juristic lookup. */
export const TAX_ID = "0105564077716";
/** Brand voice slogan — surfaces in JSON-LD `slogan`, footer, hero subtitle. */
export const SLOGAN = "เร็ว ไว ไม่มีคำว่าทำไม่ได้";

export const SITE_LOCALES = ["th", "en"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];
export const DEFAULT_LOCALE: SiteLocale = "th";

/**
 * Pacred contact information — single source of truth.
 *
 * Authoritative info from เดฟ 2026-05-25 (post-org-shift roster — see
 * `docs/pacred-info.md` for the full per-department directory + `STAFF`
 * constant below). Replace any hardcoded phone numbers / addresses across
 * the codebase by importing from here — see grep `066-090-1217` /
 * `099-444-9978` / `066-125-3007` / `02-444-7046` (legacy values from the
 * pre-2026-05-25 roster + PCS Cargo holdovers) for residual hardcoded
 * references that should migrate to CONTACT / STAFF / ADDRESSES.
 *
 * Note: `066-131-0253` is **NOT** a legacy default — it's แนท's new sales
 * line (correction 2026-05-25). Existing hardcodes of that number across
 * the codebase are still valid (they happen to display แนท's line); they
 * just need to migrate to `STAFF.sales[…].phone` for consistency.
 */
export const CONTACT = {
  /** Default phone shown to customers (= Sales primary = พี). Back-compat alias for old `phone`/`phoneDisplay`. */
  phone:               "+66617799299",
  phoneDisplay:        "061-779-9299",
  /** Company main line — for footer / receipts / official invoices. */
  phoneCompany:        "+6624213325",
  phoneCompanyDisplay: "02-421-3325",
  /** Customer Service (CS) — routed to พลอย (new line as of 2026-05-25; old `066-090-1217` retired). */
  phoneCs:             "+66626034456",
  phoneCsDisplay:      "062-603-4456",
  /** Sales reps — used by booking-data + sales-carousel + cards. 4 named reps; a 5th rep `099-234-5196` is in the org but unnamed pending HR confirm. */
  phoneSalesDisplay:   ["061-779-9299", "099-253-1415", "066-125-3006", "066-131-0253"],
  /**
   * Customer-facing default — shown in footer / JSON-LD ContactPoint / signup
   * confirmation. Per เดฟ 2026-05-15: pair `sales` + `docs` side-by-side on
   * customer surfaces so urgent inquiries have a second channel (specialist
   * feel). `email` aliases the primary; `emailContactPair` is the pair tuple
   * for footer rendering.
   */
  email:               "sales@pacred.co",
  emailContactPair:    ["sales@pacred.co", "docs@pacred.co"] as readonly string[],

  /** Sales — marketing, customer inquiries, new business intake. */
  emailSales:          "sales@pacred.co",
  /** Docs — CS + DOCS shared central ops hub (talks freight/carriers/customs/sales/pricing/acc). */
  emailDocs:           "docs@pacred.co",
  /** Accounting — receipts, transactions, payments, tax invoice queries. Used on receipt + invoice PDFs. */
  emailAcc:            "acc@pacred.co",
  /** Pricing — rate quotes, partner/supplier deals, multimodal freight pricing. */
  emailPricing:        "pricing@pacred.co",
  /** HR — recruitment, onboarding. */
  emailHr:             "hr@pacred.co",
  /** Dev + marketing — website dev, ads, social analytics, partner integrations. */
  emailDevMkt:         "devmkt@pacred.co",
  /** Top-level org admin (เดฟ holds) — internal control, not customer-facing. */
  emailAdmin:          "admin@pacred.co",
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
  /** Bangkok-area receiving warehouse — Samut Sakhon.
   *
   *  Canonical address (= ปอน's podeng SOT): `48/3 หมู่ 12 ตำบลอ้อมน้อย
   *  อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130`. The visible signage at the
   *  gate reads "S&T WAREHOUSE219" — surfaced as `warehouseName` so
   *  customers can find the entrance when shipping cargo. GPS coords +
   *  Google-Maps URLs let landing pages embed the map without
   *  re-querying.
   */
  warehouseTh: {
    line:          "48/3 หมู่ 12",
    warehouseName: "S&T WAREHOUSE219",
    subDistrict:   "อ้อมน้อย",
    district:      "กระทุ่มแบน",
    province:      "สมุทรสาคร",
    postcode:      "74130",
    full:          "48/3 หมู่ 12 ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130",
    lat:           13.710939,
    lng:           100.324049,
    mapUrl:        "https://maps.app.goo.gl/iAfY8MNXrW1Wa9iE8",
    mapEmbedUrl:   "https://www.google.com/maps/embed?pb=!1m16!1m12!1m3!1d410.7037162530852!2d100.32392984361519!3d13.710919092991068!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!2m1!1zNDgvMyDguKvguKHguLnguYggMTIg4LiV4Liz4Lia4Lil4Lit4LmJ4Lit4Lih4LiZ4LmJ4Lit4LiiIOC4reC4s-C5gOC4oOC4reC4geC4o-C4sOC4l-C4uOC5iOC4oeC5geC4muC4mSDguIjguLHguIfguKvguKfguLHguJTguKrguKHguLjguJfguKPguKrguLLguITguKMgNzQxMzAg4LiE4LmI4Liw!5e1!3m2!1sth!2sth!4v1779612609948!5m2!1sth!2sth",
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
 * Pacred company bank account — primary current account (`current`) for
 * day-to-day biz transactions. Printed on receipt + tax-invoice PDFs as an
 * alternative payment channel (paired with PromptPay QR).
 *
 * Authoritative info from พี่ป๊อป via ลูกพี่ 2026-05-17.
 * PROMPTPAY_ID env var (= TAX_ID `0105564077716`, linked to this account) is
 * set separately in Vercel — see lib/promptpay.ts for QR generation.
 *
 * **Note (2026-05-17):** Pacred ยังมี **บัญชีออมทรัพย์** (savings) อีกบัญชี ที่
 * พี่ป๊อป จะส่งให้ทีหลัง — เพิ่ม `BANK.savings` constant + wire ใน receipt PDFs
 * เมื่อข้อมูลครบ.
 */
export const BANK = {
  /** Bank name (TH). */
  name:           "ธนาคารกสิกรไทย",
  /** Bank name (EN) — for English receipt PDFs. */
  nameEn:         "Kasikornbank",
  /** Account number (display format with dashes). */
  accountNumber:  "225-2-91144-0",
  /** Account holder name (matches DBD registration). */
  accountName:    "บจก. แพคเรด (ประเทศไทย)",
  /** Account holder name (EN). */
  accountNameEn:  "Pacred (Thailand) Co., Ltd.",
  /** Account type — Pacred's primary biz account is "กระแสรายวัน" (current). */
  accountType:    "กระแสรายวัน",
  /** Account type (EN). */
  accountTypeEn:  "Current Account",
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

/**
 * Pacred staff directory — full org by department (snapshot 2026-05-25 from เดฟ).
 *
 * Use this for internal admin / "ติดต่อทีม" surfaces that need dept granularity.
 * The customer-facing sales carousel curates a subset via
 * `components/sections/contact-sales.tsx` — keep it in sync when reps churn.
 *
 * `phone` = display format (with dashes, Thai mobile style).
 * `phoneIntl` = E.164 format for `tel:` hrefs and SMS gateways.
 * `phone: null` = role exists but no direct line yet (e.g. เดฟ — DM only).
 *
 * Pending HR confirm (omitted from this directory until name is known):
 *   - Sales rep `099-234-5196`
 *   - Pricing rep `080-030-4257`
 *
 * Recently retired numbers (do not reuse):
 *   - `066-090-1217` (พลอย CS, retired 2026-05-25)
 *   - `099-444-9978` (เรด้าห์ Sales, retired 2026-05-25)
 *   - `066-125-3007` (legacy "Sales primary", not in new roster)
 *   - `02-421-3325` ← still company main, but no longer แนท's personal line
 */
export const STAFF = {
  sales: [
    { name: "พี",       phone: "061-779-9299", phoneIntl: "+66617799299" },
    { name: "เตย",       phone: "099-253-1415", phoneIntl: "+66992531415" },
    { name: "เมย์",      phone: "066-125-3006", phoneIntl: "+66661253006" },
    { name: "แนท",      phone: "066-131-0253", phoneIntl: "+66661310253" },
  ],
  pricing: [
    { name: "เว็บ", phone: "062-602-8456", phoneIntl: "+66626028456" },
  ],
  doc: [
    { name: "วิน",   phone: "062-603-0456", phoneIntl: "+66626030456" },
    { name: "กริ้ง", phone: "080-058-8746", phoneIntl: "+66800588746" },
    { name: "เวฟ",   phone: "062-603-8456", phoneIntl: "+66626038456" },
  ],
  cs: [
    { name: "พลอย", phone: "062-603-4456", phoneIntl: "+66626034456" },
    { name: "อ้อน", phone: "099-435-9535", phoneIntl: "+66994359535" },
  ],
  acc: [
    { name: "เจน", phone: "081-160-9304", phoneIntl: "+66811609304" },
    { name: "ออม", phone: "063-210-2537", phoneIntl: "+66632102537" },
  ],
  mkt: [
    { name: "เดฟ",   phone: null,           phoneIntl: null           },
    { name: "ภูมิ",  phone: "092-131-3786", phoneIntl: "+66921313786" },
    { name: "ปอนด์", phone: "092-131-3788", phoneIntl: "+66921313788" },
  ],
  hr: [
    { name: "แวม", phone: "066-131-4733", phoneIntl: "+66661314733" },
  ],
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
