/**
 * Pure helpers for laonet.ts (P-53).
 *
 * Outside the `server-only` boundary so tsx tests can load the URL
 * builders + response parsers without a Next.js runtime.
 */

import type { ChinaSearchHit } from "./types";

/**
 * Build the Laonet image upload URL.  Returns imgid in the response.
 *
 * Per audit §4b:
 *   ?route=api_tester/call&api_name=upload_img&imgcode={base64}&key={email-as-key}
 *
 * The base64 is intentionally NOT URL-encoded inside this builder — the
 * caller is expected to pass an already-safe-for-querystring string OR
 * (more typically) hand the base64 to a POST body.  We default to a GET
 * URL since legacy PHP uses GET, but expose the params separately so the
 * caller can switch to POST if Laonet changes the contract.
 */
export function buildLaonetUploadUrl(
  base: string,
  imgcode: string,
  key: string,
): string {
  const trimmedBase = base.replace(/\/+$/, "");
  // We can't use URLSearchParams for imgcode because it would re-encode
  // the base64 padding ('=') and confuse the upstream parser.  Build the
  // querystring manually so imgcode stays raw (assumed already-safe).
  const params: string[] = [
    "route=api_tester/call",
    "api_name=upload_img",
    `imgcode=${encodeURIComponent(imgcode)}`,
    `key=${encodeURIComponent(key)}`,
  ];
  return `${trimmedBase}/index.php?${params.join("&")}`;
}

/** Build the Laonet image search URL given an imgid from a prior upload. */
export function buildLaonetSearchUrl(
  base: string,
  imgid: string,
  key: string,
): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const qs = new URLSearchParams({
    route:    "api_tester/call",
    api_name: "item_search_img",
    imgid,
    key,
  });
  return `${trimmedBase}/index.php?${qs.toString()}`;
}

/**
 * Pull the imgid out of a Laonet upload response.  Defensive against
 * shape variation — Laonet wraps the Taobao Open API which has changed
 * field names over time.
 *
 * Tries (in order):
 *   - top-level `imgid`, `img_id`, `id`
 *   - nested `data.imgid` / `data.img_id` / `data.id`
 *   - nested `result.imgid` / `result.url`
 *   - top-level `url` (some variants return the upload URL as the id)
 */
export function parseLaonetUploadResponse(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;

  const candidates: unknown[] = [
    root.imgid,
    root.img_id,
    root.id,
    root.url,
    (root.data as Record<string, unknown> | undefined)?.imgid,
    (root.data as Record<string, unknown> | undefined)?.img_id,
    (root.data as Record<string, unknown> | undefined)?.id,
    (root.data as Record<string, unknown> | undefined)?.url,
    (root.result as Record<string, unknown> | undefined)?.imgid,
    (root.result as Record<string, unknown> | undefined)?.url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/**
 * Parse the Laonet image-search response.  Top-level shape variants:
 *   - `{ items: { item: [...] } }`  (canonical Taobao Open API)
 *   - `{ items: [...] }`            (flat alt)
 *   - `{ data: [...] }`             (some Laonet wrappers)
 *
 * Per-row fields (per audit §4a — Laonet shares schema with AkuCargo at
 * search level):
 *   detail_url, pic_url, title, price, promotion_price, num_iid, shop
 */
export function parseLaonetSearchResponse(json: unknown): ChinaSearchHit[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;

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
    const basePrice  = numericOrUndef(baseRaw);
    const promoPrice = numericOrUndef(promoRaw);
    const price_cny =
      promoPrice != null && promoPrice > 0 && (basePrice == null || promoPrice < basePrice)
        ? promoPrice
        : basePrice;

    // Image search results are always 1688 items (Laonet's image-search
    // backend only indexes 1688), even though the same Laonet wrapper
    // serves Taobao detail in audit §4b.
    const hit: ChinaSearchHit = {
      provider:   "1688",
      product_id: typeof r.num_iid === "string" ? r.num_iid
                  : typeof r.product_id === "string" ? r.product_id
                  : undefined,
      title,
      url,
      image_url:  typeof r.pic_url === "string" ? r.pic_url
                  : typeof r.image === "string" ? r.image
                  : undefined,
      price_cny,
      shop_name:  typeof r.shop === "string" ? r.shop
                  : typeof r.seller_nick === "string" ? r.seller_nick
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
