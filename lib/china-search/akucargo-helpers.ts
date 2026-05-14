/**
 * Pure helpers for akucargo.ts (P-52).
 *
 * Outside the `server-only` boundary so tsx can unit-test the URL builder
 * + response parser without a Next.js runtime.  Network-touching code
 * lives in akucargo.ts.
 */

import type { ChinaSearchHit } from "./types";

/** AkuCargo only routes 1688 and taobao distinctly; tmall maps to taobao. */
export type AkucargoPlatform = "1688" | "taobao";

const PAGE_SIZE = 15;

/**
 * Build the AkuCargo search URL.
 *   1688:    {base}/search/v1/?q=&page=&page_size=15&lang=zh-CN
 *   taobao:  {base}/search/v1/taobao/?q=&page=&page_size=15&lang=zh-CN
 */
export function buildAkucargoUrl(
  base: string,
  words: string,
  page: number,
  platform: AkucargoPlatform,
): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const path = platform === "taobao" ? "/search/v1/taobao/" : "/search/v1/";
  const qs = new URLSearchParams({
    q:         words,
    page:      String(Math.max(1, page | 0)),
    page_size: String(PAGE_SIZE),
    lang:      "zh-CN",
  });
  return `${trimmedBase}${path}?${qs.toString()}`;
}

/**
 * Map AkuCargo's response JSON to our normalised ChinaSearchHit shape.
 *
 * Defensive against:
 *   - top-level shape variants: `{ items: { item: [...] } }` (canonical),
 *     `{ items: [...] }` (alt), `{ data: [...] }` (legacy fallback)
 *   - missing fields per row (skip rows with no title and no url)
 *   - price as string vs number
 *   - promotion_price === 0 / "" → ignore (treat as no promo)
 */
export function parseAkucargoResponse(
  json: unknown,
  fallbackPlatform: AkucargoPlatform,
): ChinaSearchHit[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;

  // Canonical: items.item[]
  let list: unknown[] = [];
  const items = root.items;
  if (items && typeof items === "object" && Array.isArray((items as Record<string, unknown>).item)) {
    list = (items as { item: unknown[] }).item;
  } else if (Array.isArray(items)) {
    list = items;
  } else if (Array.isArray(root.data)) {
    list = root.data;
  }

  return list.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;

    const title = String(r.title ?? r.name ?? "").trim();
    const url   = String(r.detail_url ?? r.url ?? "").trim();
    if (!title && !url) return [];

    const promoRaw = r.promotion_price;
    const baseRaw  = r.price;
    // AkuCargo gives one or both — pick the lower if both present and
    // promo is non-zero, otherwise just the base.
    const basePrice  = numericOrUndef(baseRaw);
    const promoPrice = numericOrUndef(promoRaw);
    const price_cny =
      promoPrice != null && promoPrice > 0 && (basePrice == null || promoPrice < basePrice)
        ? promoPrice
        : basePrice;

    const hit: ChinaSearchHit = {
      provider:   fallbackPlatform,
      product_id: typeof r.num_iid === "string"
        ? r.num_iid
        : typeof r.product_id === "string"
          ? r.product_id
          : typeof r.thid_item_id === "string"
            ? r.thid_item_id
            : undefined,
      title,
      url,
      image_url:  typeof r.pic_url === "string" ? r.pic_url
                  : typeof r.image === "string" ? r.image
                  : undefined,
      price_cny,
      shop_name:  typeof r.shop === "string" ? r.shop
                  : typeof r.seller_nick === "string" ? r.seller_nick
                  : typeof r.nick === "string" ? r.nick
                  : undefined,
    };
    return [hit];
  });
}

function numericOrUndef(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
