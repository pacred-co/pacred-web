/**
 * Promo-banner manager — multi-promo model (2026-06-01 · เดฟ).
 *
 * The owner wanted to manage MULTIPLE promo banners + upload images, not just
 * the single hardcoded ฝากนำเข้า promo. To stay NO-DDL (the home machine's
 * direct-DB/IPv6 is down; only REST/DML works), the promo LIST is stored as a
 * JSON array in the EXISTING `business_config` table under one key:
 *
 *   key        = "promo.banners"
 *   value_type = "json"          (already in the value_type allow-list)
 *   value      = PromoBanner[]   (the array below)
 *
 * Reads go through getBusinessConfig (60s cache · falls back on miss). Writes
 * + the seed go through the REST admin client (actions/admin/promo-banners.ts),
 * NOT a SQL migration.
 *
 * ── Backward-compat (do NOT break the live banner) ──
 * The previous single promo lives in 6 keys `import.promo.{enabled,headline,
 * text,amount_thb,end_date,image_url}` (migration 0135). When `promo.banners`
 * is empty/missing, `getActivePromoBanners("import")` falls back to those keys
 * so the live /service-import banner keeps rendering. An admin "import the old
 * promo" action seeds it into the array as the first item.
 *
 * Server-only — never import from a Client Component (it pulls the admin lib).
 */

import "server-only";

import { getBusinessConfig } from "@/lib/business-config";

/** The business_config key that holds the promo array. */
export const PROMO_BANNERS_KEY = "promo.banners";

/**
 * Locations a promo can target. `"import"` = the ฝากนำเข้า /service-import
 * page (the only consumer today). Designed so other pages can read their own
 * location later (add the value here + read it from that page).
 */
export const PROMO_LOCATIONS = [
  "import", // /service-import (ฝากนำเข้า) — "โปรเหมาๆ" strip
] as const;
export type PromoLocation = (typeof PROMO_LOCATIONS)[number];

/** One promo banner. All fields plain-serializable (crosses the RSC boundary). */
export type PromoBanner = {
  /** Stable id (client-generated; used as React key + for edit/delete). */
  id: string;
  /** Which page this promo shows on. */
  location: string;
  headline: string;
  text: string;
  /** Discount/amount in THB. 0 = don't show the amount line. */
  amount_thb: number;
  /** Public image URL ("" = no image). */
  image_url: string;
  enabled: boolean;
  /** ISO date YYYY-MM-DD or "" = no start gate. */
  start_date: string;
  /** ISO date YYYY-MM-DD or "" = no end gate. */
  end_date: string;
  /** Sort order ascending (lower = earlier). */
  sort: number;
};

/** Today as YYYY-MM-DD (lexicographic compare === chronological for ISO dates). */
function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Is the promo within its [start, end] date window today? */
export function isPromoWithinDate(
  b: Pick<PromoBanner, "start_date" | "end_date">,
): boolean {
  const today = todayYmd();
  if (b.start_date && today < b.start_date) return false;
  if (b.end_date && today > b.end_date) return false;
  return true;
}

/**
 * Coerce an arbitrary jsonb value into a clean PromoBanner[] (defensive — the
 * value is admin-editable JSON). Drops malformed entries; never throws.
 */
export function normalizePromoBanners(raw: unknown): PromoBanner[] {
  if (!Array.isArray(raw)) return [];
  const out: PromoBanner[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const amount = Number(o.amount_thb);
    out.push({
      id: String(o.id ?? `promo-${out.length}`),
      location:
        typeof o.location === "string" && o.location ? o.location : "import",
      headline: typeof o.headline === "string" ? o.headline : "",
      text: typeof o.text === "string" ? o.text : "",
      amount_thb: Number.isFinite(amount) ? amount : 0,
      image_url: typeof o.image_url === "string" ? o.image_url : "",
      enabled: o.enabled === true,
      start_date: typeof o.start_date === "string" ? o.start_date : "",
      end_date: typeof o.end_date === "string" ? o.end_date : "",
      sort: Number.isFinite(Number(o.sort)) ? Number(o.sort) : out.length,
    });
  }
  return out;
}

/**
 * Read the full promo list (ALL locations, all states) — for the admin editor.
 * Sorted by (location, sort). Returns [] on miss/error.
 */
export async function getAllPromoBanners(): Promise<PromoBanner[]> {
  const raw = await getBusinessConfig<unknown>(PROMO_BANNERS_KEY, []);
  return normalizePromoBanners(raw).sort(
    (a, b) => a.location.localeCompare(b.location) || a.sort - b.sort,
  );
}

/**
 * Resolve the ACTIVE promos for one location (enabled + within date window),
 * sorted by `sort`. This is what a customer page renders.
 *
 * BACKWARD-COMPAT: if the array yields NO promos for `"import"` (empty/missing
 * `promo.banners`), fall back to the legacy single-promo keys
 * `import.promo.*` (migration 0135) so the live banner never disappears.
 */
export async function getActivePromoBanners(
  location: PromoLocation,
): Promise<PromoBanner[]> {
  const all = await getAllPromoBanners();
  const active = all
    .filter((b) => b.location === location && b.enabled && isPromoWithinDate(b))
    .sort((a, b) => a.sort - b.sort);

  if (active.length > 0) return active;

  // ── Fallback to the legacy single promo (only for the import location) ──
  if (location === "import") {
    const single = await readLegacySingleImportPromo();
    if (single && single.enabled && isPromoWithinDate(single)) return [single];
  }
  return [];
}

/**
 * Read the legacy single import promo (the 6 `import.promo.*` keys · migration
 * 0135) as a PromoBanner. Used for the backward-compat fallback + the admin
 * "import old promo" seed. Defaults reproduce the previous hardcoded banner.
 */
export async function readLegacySingleImportPromo(): Promise<PromoBanner | null> {
  const LEGACY_MAO_TEXT =
    "“หากลูกค้าชำระค่าขนส่งในไทยก่อนเวลา 00.00 น. บริษัทฯ จะจัดส่งสินค้าให้ภายใน 1-3 วันทำการ นับจากวันที่ชำค่าขนส่ง”";
  const [enabled, headline, text, amount, endDate, imageUrl] = await Promise.all([
    getBusinessConfig<boolean>("import.promo.enabled", true),
    getBusinessConfig<string>("import.promo.headline", "โปรเหมาๆ"),
    getBusinessConfig<string>("import.promo.text", LEGACY_MAO_TEXT),
    getBusinessConfig<number>("import.promo.amount_thb", 100),
    getBusinessConfig<string>("import.promo.end_date", ""),
    getBusinessConfig<string>("import.promo.image_url", ""),
  ]);
  return {
    id: "legacy-import-promo",
    location: "import",
    headline,
    text,
    amount_thb: Number(amount) || 0,
    image_url: imageUrl,
    enabled,
    start_date: "",
    end_date: endDate,
    sort: 0,
  };
}
