/**
 * Pacred Services Reviews — shared catalog (data layer).
 *
 * **Client-safe + server-safe** — no `"use client"`, no React, no
 * `server-only`. Imported by:
 *   - `components/sections/reviews.tsx` (`"use client"` homepage carousel)
 *   - `app/[locale]/(public)/our-work/[id]/page.tsx` (server landing page)
 *   - `lib/reviews/content.ts` (server-only SEO prose generator)
 *
 * The card's **short** labels (title / tags / type) still come from the
 * `reviews` i18n namespace in `messages/{th,en}.json` — this file owns only
 * the **data** (which reviews exist, their type/mode/term, cover image) plus
 * the **product / route / HS-code** dimension added 2026-06-11 (ปอน · owner
 * "ติดแท็ก ติด hs code ให้เหมาะกับสินค้า + ใช้ url เป็น pattern ตาม .csv").
 * The **long-form, keyword-rich** SEO copy for each `/our-work/[id]` landing
 * page lives in `lib/reviews/content.ts` (`getReviewContent`).
 */

export type ServiceType = "import" | "export" | "clearance";

export type TitleKey =
  | "titleFcl"
  | "titleLcl"
  | "titleClearance"
  | "titleAirClearance";

export type TagKey =
  | "tagFcl"
  | "tagLcl"
  | "tagSea"
  | "tagRoad"
  | "tagAir"
  | "tagExpress"
  | "tagDdp"
  | "tagCif";

export type Review = {
  id: string;
  type: ServiceType;
  titleKey: TitleKey;
  rating: number;
  tagKeys: TagKey[];
  image?: string;
  // ── product / route / HS-code dimension (SEO slug source · 2026-06-11) ──
  // Keys into COUNTRY / ORIGIN / DEST / PRODUCT below. Optional with safe
  // fallbacks so the page never breaks if a row is missing one.
  country?: string; // → COUNTRY (default "cn")
  origin?: string;  // → ORIGIN  (China port/city · default "guangzhou")
  dest?: string;    // → DEST    (Thai port · default "laemchabang", air → "suvarnabhumi")
  product?: string; // → PRODUCT (default "machinery")
};

// ─────────────────────────── route / product dictionaries ───────────────────
// Bilingual DISPLAY labels. The URL slug is DERIVED from these via slugify()
// — one source of truth, no separate slug strings to keep in sync.

type Loc = "th" | "en";
type BL = { th: string; en: string };
export type ProductInfo = BL & { hs: string };

const COUNTRY: Record<string, BL> = {
  cn: { th: "จีน", en: "China" },
};

/** China origin ports / manufacturing cities. */
const ORIGIN: Record<string, BL> = {
  guangzhou: { th: "กวางโจว",  en: "Guangzhou" },
  shenzhen:  { th: "เซินเจิ้น", en: "Shenzhen"  },
  yiwu:      { th: "อี้อู",     en: "Yiwu"      },
  ningbo:    { th: "หนิงปัว",   en: "Ningbo"    },
  shanghai:  { th: "เซี่ยงไฮ้", en: "Shanghai"  },
  xiamen:    { th: "เซียะเหมิน", en: "Xiamen"   },
  foshan:    { th: "เฝอซาน",    en: "Foshan"    },
  dongguan:  { th: "ตงกวน",     en: "Dongguan"  },
  shantou:   { th: "ซัวเถา",    en: "Shantou"   },
  qingdao:   { th: "ชิงเต่า",   en: "Qingdao"   },
};

/** Thai destination ports (sea/road = Laem Chabang / Bangkok · air = Suvarnabhumi). */
const DEST: Record<string, BL> = {
  laemchabang:  { th: "แหลมฉบัง",  en: "Laem Chabang" },
  bangkok:      { th: "กรุงเทพ",   en: "Bangkok"      },
  suvarnabhumi: { th: "สุวรรณภูมิ", en: "Suvarnabhumi" },
};

/**
 * Product profiles + the matching HS-code heading (4-digit · the standard
 * granularity for a customs tariff heading). Used for the card tag, the
 * SEO slug "(สินค้า)" segment, and the landing-page HS section.
 */
const PRODUCT: Record<string, ProductInfo> = {
  autoparts:    { th: "อะไหล่รถยนต์",           en: "Auto parts",        hs: "8708" },
  furniture:    { th: "เฟอร์นิเจอร์",            en: "Furniture",         hs: "9403" },
  footwear:     { th: "รองเท้า",                en: "Footwear",          hs: "6403" },
  toys:         { th: "ของเล่น",                en: "Toys",              hs: "9503" },
  machinery:    { th: "เครื่องจักร",            en: "Machinery",         hs: "8479" },
  ledlight:     { th: "โคมไฟ LED",             en: "LED lighting",      hs: "9405" },
  apparel:      { th: "เสื้อผ้าแฟชั่น",          en: "Apparel",           hs: "6109" },
  electronics:  { th: "อุปกรณ์อิเล็กทรอนิกส์",   en: "Electronics",       hs: "8517" },
  kitchenware:  { th: "เครื่องครัวสแตนเลส",      en: "Kitchenware",       hs: "7323" },
  tools:        { th: "เครื่องมือช่าง",          en: "Hand tools",        hs: "8205" },
  tiles:        { th: "กระเบื้อง",              en: "Ceramic tiles",     hs: "6907" },
  plastics:     { th: "ชิ้นส่วนพลาสติก",         en: "Plastic parts",     hs: "3926" },
  ebike:        { th: "จักรยานไฟฟ้า",           en: "E-bike",            hs: "8711" },
  sporting:     { th: "อุปกรณ์กีฬา",            en: "Sporting goods",    hs: "9506" },
  cosmetics:    { th: "เครื่องสำอาง",           en: "Cosmetics",         hs: "3304" },
  textile:      { th: "ผ้าและสิ่งทอ",           en: "Textiles",          hs: "5407" },
  solar:        { th: "แผงโซลาร์เซลล์",         en: "Solar panels",      hs: "8541" },
  acparts:      { th: "อะไหล่แอร์",             en: "AC parts",          hs: "8415" },
  bag:          { th: "กระเป๋า",                en: "Bags",              hs: "4202" },
  homeappliance:{ th: "เครื่องใช้ไฟฟ้าในบ้าน",   en: "Home appliances",   hs: "8509" },
};

// ─────────────────────────── reviews data ───────────────────────────
// Each import row carries a distinct product (so its SEO slug is unique);
// clearance rows reuse products but vary origin/dest so their slugs stay
// distinct too. mode (เหมาตู้/แชร์ตู้) is derived from the FCL/LCL tag.

export const REVIEWS: Review[] = [
  // ─── FCL (Import) ──────────────────────────────────────
  { id: "fcl-1",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/1.jpg",  origin: "guangzhou", dest: "laemchabang", product: "autoparts"    },
  { id: "fcl-2",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagRoad", "tagDdp"], image: "/images/review/fcl/2.jpg",  origin: "foshan",    dest: "bangkok",     product: "furniture"    },
  { id: "fcl-3",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/3.jpg",  origin: "ningbo",    dest: "laemchabang", product: "machinery"    },
  { id: "fcl-4",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/4.jpg",  origin: "xiamen",    dest: "laemchabang", product: "tiles"        },
  { id: "fcl-5",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/5.jpg",  origin: "shantou",   dest: "laemchabang", product: "kitchenware"  },
  { id: "fcl-6",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/6.jpg",  origin: "shanghai",  dest: "laemchabang", product: "solar"        },
  { id: "fcl-7",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/7.jpg",  origin: "shenzhen",  dest: "laemchabang", product: "ebike"        },
  { id: "fcl-8",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/8.jpg",  origin: "ningbo",    dest: "laemchabang", product: "homeappliance"},
  { id: "fcl-9",  type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/9.jpg",  origin: "guangzhou", dest: "laemchabang", product: "acparts"      },
  { id: "fcl-10", type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/10.jpg", origin: "dongguan",  dest: "laemchabang", product: "tools"        },
  { id: "fcl-11", type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagDdp"],  image: "/images/review/fcl/11.jpg", origin: "dongguan",  dest: "bangkok",     product: "plastics"     },
  { id: "fcl-12", type: "import", titleKey: "titleFcl", rating: 5, tagKeys: ["tagFcl", "tagSea", "tagCif"],  image: "/images/review/fcl/12.jpg", origin: "shanghai",  dest: "laemchabang", product: "textile"      },

  // ─── LCL (Import) ──────────────────────────────────────
  { id: "lcl-1",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagCif"],  image: "/images/review/lcl/1.jpg",  origin: "guangzhou", dest: "laemchabang", product: "apparel"     },
  { id: "lcl-2",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagDdp"],  image: "/images/review/lcl/2.jpg",  origin: "foshan",    dest: "bangkok",     product: "footwear"    },
  { id: "lcl-3",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagCif"],  image: "/images/review/lcl/3.jpg",  origin: "shantou",   dest: "laemchabang", product: "toys"        },
  { id: "lcl-4",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagDdp"],  image: "/images/review/lcl/4.jpg",  origin: "ningbo",    dest: "laemchabang", product: "ledlight"    },
  { id: "lcl-5",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagRoad", "tagCif"], image: "/images/review/lcl/5.jpg",  origin: "shenzhen",  dest: "bangkok",     product: "electronics" },
  { id: "lcl-6",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagRoad", "tagDdp"], image: "/images/review/lcl/6.jpg",  origin: "guangzhou", dest: "bangkok",     product: "cosmetics"   },
  { id: "lcl-7",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagCif"],  image: "/images/review/lcl/7.jpg",  origin: "xiamen",    dest: "laemchabang", product: "sporting"    },
  { id: "lcl-8",  type: "import", titleKey: "titleLcl", rating: 5, tagKeys: ["tagLcl", "tagSea", "tagDdp"],  image: "/images/review/lcl/8.jpg",  origin: "yiwu",      dest: "laemchabang", product: "bag"         },

  // ─── Clearance ────────────────────
  { id: "clr-1",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad", "tagCif"], image: "/images/review/clearance/1.jpg",  origin: "shenzhen",  dest: "bangkok",     product: "autoparts"     },
  { id: "clr-2",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad"],            image: "/images/review/clearance/2.jpg",  origin: "guangzhou", dest: "bangkok",     product: "electronics"   },
  { id: "clr-3",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea", "tagCif"],   image: "/images/review/clearance/3.jpg",  origin: "ningbo",    dest: "laemchabang", product: "machinery"     },
  { id: "clr-4",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea", "tagCif"],   image: "/images/review/clearance/4.jpg",  origin: "foshan",    dest: "laemchabang", product: "furniture"     },
  { id: "clr-5",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad"],            image: "/images/review/clearance/5.jpg",  origin: "guangzhou", dest: "bangkok",     product: "apparel"       },
  { id: "clr-7",  type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad"],            image: "/images/review/clearance/7.jpg",  origin: "shantou",   dest: "bangkok",     product: "footwear"      },
  { id: "clr-10", type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea", "tagCif"],   image: "/images/review/clearance/10.jpg", origin: "xiamen",    dest: "laemchabang", product: "tiles"         },
  { id: "clr-11", type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagRoad", "tagCif"],  image: "/images/review/clearance/11.jpg", origin: "dongguan",  dest: "bangkok",     product: "tools"         },
  { id: "clr-12", type: "clearance", titleKey: "titleClearance", rating: 5, tagKeys: ["tagDdp", "tagSea"],             image: "/images/review/clearance/12.jpg", origin: "ningbo",    dest: "laemchabang", product: "homeappliance" },

  // ─── Air Clearance ───
  { id: "clr-air-6", type: "clearance", titleKey: "titleAirClearance", rating: 5, tagKeys: ["tagAir", "tagExpress", "tagDdp"], image: "/images/review/clearance/6.jpg", origin: "shenzhen",  dest: "suvarnabhumi", product: "electronics" },
  { id: "clr-air-8", type: "clearance", titleKey: "titleAirClearance", rating: 5, tagKeys: ["tagAir", "tagExpress", "tagDdp"], image: "/images/review/clearance/8.jpg", origin: "shanghai",  dest: "suvarnabhumi", product: "cosmetics"   },
  { id: "clr-air-9", type: "clearance", titleKey: "titleAirClearance", rating: 5, tagKeys: ["tagAir", "tagExpress", "tagDdp"], image: "/images/review/clearance/9.jpg", origin: "guangzhou", dest: "suvarnabhumi", product: "ledlight"    },
];

// ─────────────────────────── accessors ───────────────────────────

const bl = (x: BL, locale: Loc) => (locale === "en" ? x.en : x.th);

/** Container mode for the URL "(เหมาตู้,แชร์ตู้)" segment — from the FCL/LCL tag. */
function containerModeLabel(r: Review, locale: Loc): string | null {
  if (r.tagKeys.includes("tagLcl")) return locale === "en" ? "LCL" : "แชร์ตู้";
  if (r.tagKeys.includes("tagFcl")) return locale === "en" ? "FCL" : "เหมาตู้";
  return null;
}

export function reviewCountry(r: Review): BL {
  return COUNTRY[r.country ?? ""] ?? COUNTRY.cn;
}
export function reviewOrigin(r: Review): BL {
  return ORIGIN[r.origin ?? ""] ?? ORIGIN.guangzhou;
}
export function reviewDest(r: Review): BL {
  return (
    DEST[r.dest ?? ""] ??
    (r.tagKeys.includes("tagAir") ? DEST.suvarnabhumi : DEST.laemchabang)
  );
}
export function reviewProduct(r: Review): ProductInfo {
  return PRODUCT[r.product ?? ""] ?? PRODUCT.machinery;
}
/** Localized product display label, e.g. "อะไหล่รถยนต์" / "Auto parts". */
export function reviewProductLabel(r: Review, locale: Loc): string {
  return bl(reviewProduct(r), locale);
}
/** HS-code heading for the product, e.g. "8708". */
export function reviewHsCode(r: Review): string {
  return reviewProduct(r).hs;
}

/** Localized route summary "กวางโจว → แหลมฉบัง" / "Guangzhou → Laem Chabang". */
export function reviewRoute(r: Review, locale: Loc): string {
  return `${bl(reviewOrigin(r), locale)} → ${bl(reviewDest(r), locale)}`;
}

// ─────────────────────────── slug (SEO URL · per the .csv patterns) ─────────
// URL-safe slug derived from the display labels. Thai has no case, so
// lowercasing is a no-op there; internal spaces/slashes collapse to a dash.

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[(),.]/g, "")
    .replace(/[\s/_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * SEO slug for a review per the owner's `.csv` URL patterns:
 *   import     → นำเข้าสินค้าจาก(ประเทศ)-(เหมาตู้,แชร์ตู้)-(ต้นทาง)-(ปลายทาง)-(สินค้า)
 *               / import-(country)-(fcl,lcl)-(origin)-(dest)-(product)
 *   export     → ส่งออก(ประเทศ)-(เหมาตู้,แชร์ตู้)-(ต้นทาง)-(ปลายทาง)-(สินค้า)
 *   clearance  → ชิปปิ้ง-เคลียร์สินค้า-พิธีการศุลกากร-(ต้นทาง)-(ปลายทาง)-(สินค้า)
 *               / shipping-customs-clearance-(origin)-(dest)-(product)
 */
export function reviewSlug(r: Review, locale: Loc): string {
  const isTh = locale !== "en";
  const c = bl(reviewCountry(r), locale);
  const o = bl(reviewOrigin(r), locale);
  const d = bl(reviewDest(r), locale);
  const p = reviewProductLabel(r, locale);
  const mode = containerModeLabel(r, locale);

  if (r.type === "clearance") {
    return slugify(
      isTh
        ? `ชิปปิ้ง-เคลียร์สินค้า-พิธีการศุลกากร-${o}-${d}-${p}`
        : `shipping-customs-clearance-${o}-${d}-${p}`,
    );
  }

  const modeSeg = mode ? `${mode}-` : "";
  if (r.type === "export") {
    return slugify(
      isTh
        ? `ส่งออก${c}-${modeSeg}${o}-${d}-${p}`
        : `export-${c}-${modeSeg}${o}-${d}-${p}`,
    );
  }
  // import (default)
  return slugify(
    isTh
      ? `นำเข้าสินค้าจาก${c}-${modeSeg}${o}-${d}-${p}`
      : `import-${c}-${modeSeg}${o}-${d}-${p}`,
  );
}

/** Canonical (TH) slug — used as the one stable URL for sitemap/JSON-LD. */
export function reviewCanonicalSlug(r: Review): string {
  return reviewSlug(r, "th");
}

/**
 * Natural-language heading built from the SAME pattern as the URL slug
 * (country · mode · origin · dest · product) but SPACE-separated instead of
 * dash-joined — reads as a normal title for breadcrumbs / page headings
 * (ปอน: "แพทเทิร์นแบบ url แต่ไม่ต้องมี - แบบหัวข้อธรรมชาติ").
 */
export function reviewHeading(r: Review, locale: Loc): string {
  const isTh = locale !== "en";
  const c = bl(reviewCountry(r), locale);
  const o = bl(reviewOrigin(r), locale);
  const d = bl(reviewDest(r), locale);
  const p = reviewProductLabel(r, locale);
  const mode = containerModeLabel(r, locale);
  const modeSeg = mode ? `${mode} ` : "";
  const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

  if (r.type === "clearance") {
    return tidy(
      isTh
        ? `ชิปปิ้ง เคลียร์สินค้า พิธีการศุลกากร ${o} ${d} ${p}`
        : `Shipping customs clearance ${o} ${d} ${p}`,
    );
  }
  if (r.type === "export") {
    return tidy(
      isTh ? `ส่งออก${c} ${modeSeg}${o} ${d} ${p}` : `Export ${c} ${modeSeg}${o} ${d} ${p}`,
    );
  }
  return tidy(
    isTh
      ? `นำเข้าสินค้าจาก${c} ${modeSeg}${o} ${d} ${p}`
      : `Import ${c} ${modeSeg}${o} ${d} ${p}`,
  );
}

// ───────────────────────── localized URL segment ───────────────────────────
// The portfolio segment is localized: Thai shows /ผลงานของเรา/..., English
// keeps /our-work/... . The Next route folder stays `our-work/[id]`; the
// next-intl middleware (i18n/routing.ts `routingWithPathnames`) serves the
// Thai segment from it and redirects the legacy /our-work (th) → /ผลงานของเรา.
// `OUR_WORK_SEGMENT` is the single source of truth for both.
export const OUR_WORK_SEGMENT: Record<Loc, string> = {
  th: "ผลงานของเรา",
  en: "our-work",
};

/** Localized path to the portfolio LIST (no locale prefix — for next-intl <Link>). */
export function ourWorkPath(locale: Loc): string {
  return `/${OUR_WORK_SEGMENT[locale]}`;
}

/** Localized path to a single case landing (no locale prefix — for next-intl <Link>). */
export function reviewUrl(slug: string, locale: Loc): string {
  return `/${OUR_WORK_SEGMENT[locale]}/${slug}`;
}

/** Locale-PREFIXED list path for <head> canonical / alternates (resolved vs metadataBase). */
export function ourWorkMetaPath(locale: Loc): string {
  return `${locale === "en" ? "/en" : ""}${ourWorkPath(locale)}`;
}

/** Locale-PREFIXED case path for <head> canonical / alternates / og:url. */
export function reviewMetaPath(slug: string, locale: Loc): string {
  return `${locale === "en" ? "/en" : ""}${reviewUrl(slug, locale)}`;
}

export function getReviewById(id: string): Review | undefined {
  return REVIEWS.find((r) => r.id === id);
}

/**
 * Resolve a `/our-work/[id]` param to a review. Accepts the new SEO slug
 * (either locale) AND the legacy short id (`fcl-1`) so old bookmarks /
 * indexed links keep working — the page sets the slug as canonical.
 */
export function getReviewBySlugOrId(param: string): Review | undefined {
  const decoded = (() => {
    try {
      return decodeURIComponent(param);
    } catch {
      return param;
    }
  })();
  return (
    REVIEWS.find((r) => r.id === decoded) ??
    REVIEWS.find(
      (r) => reviewSlug(r, "th") === decoded || reviewSlug(r, "en") === decoded,
    )
  );
}

/**
 * Related cases for the "ผลงานอื่นๆ" panel on a `/our-work/[id]` page.
 * Prefer same `titleKey` (most relevant), then top up with other reviews so
 * the panel is always full even for sparse categories.
 */
export function getRelatedReviews(id: string, limit = 6): Review[] {
  const current = getReviewById(id);
  if (!current) return REVIEWS.slice(0, limit);

  const sameTitle = REVIEWS.filter(
    (r) => r.id !== id && r.titleKey === current.titleKey,
  );
  const others = REVIEWS.filter(
    (r) => r.id !== id && r.titleKey !== current.titleKey,
  );
  return [...sameTitle, ...others].slice(0, limit);
}
