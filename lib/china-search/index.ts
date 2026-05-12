/**
 * China product search abstraction.
 *
 * Legacy PHP code (D:\xampp\htdocs\pcscargo\member\):
 * - convertURL.php uses https://rcgroup-th.com/api-china/api-search/
 * - search.php uses https://tamit-cloud.com/api-product/api-search/
 *
 * Both are 3rd-party services we proxy. Behind this interface so the
 * provider can be swapped without rewriting callers (Phase D
 * "Critical migration concerns" #13).
 *
 * Configure via env:
 *   PACRED_RCGROUP_API_URL=https://rcgroup-th.com/api-china/api-search
 *   PACRED_TAMIT_API_URL=https://tamit-cloud.com/api-product/api-search
 *
 * When unset → returns { available: false } so the UI shows "เร็วๆนี้"
 * without crashing.
 */

import "server-only";

export type ChinaSearchHit = {
  provider: "1688" | "taobao" | "tmall";
  product_id?: string;
  title: string;
  url:   string;
  image_url?: string;
  price_cny?: number;
  shop_name?: string;
};

export type ChinaSearchResult =
  | { available: false; reason: "not_configured" | "network_error" | "rate_limited"; message?: string }
  | { available: true;  hits: ChinaSearchHit[]; page: number; has_more: boolean };

/**
 * Search by keyword (text or paste from search bar).
 */
export async function searchKeyword(
  words: string,
  page = 1,
  order: "default" | "price_asc" | "price_desc" = "default",
  platform: "1688" | "taobao" | "tmall" = "1688",
): Promise<ChinaSearchResult> {
  const base = process.env.PACRED_TAMIT_API_URL;
  if (!base) {
    return { available: false, reason: "not_configured", message: "TAMIT_API_URL is unset" };
  }
  const url = platform === "1688"
    ? `${base}/?words=${encodeURIComponent(words)}&page=${page}&order=${order}`
    : `${base}/${platform}/?words=${encodeURIComponent(words)}&page=${page}&order=${order}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { available: false, reason: "network_error", message: `HTTP ${res.status}` };
    const json = await res.json();
    return { available: true, hits: normaliseHits(json, platform), page, has_more: Boolean(json?.has_more) };
  } catch (e) {
    return { available: false, reason: "network_error", message: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Convert a product URL (pasted by user from 1688/Taobao/Tmall) into a
 * normalized product summary that can be added to the cart.
 */
export async function convertProductUrl(url: string): Promise<ChinaSearchResult> {
  const base = process.env.PACRED_RCGROUP_API_URL;
  if (!base) {
    return { available: false, reason: "not_configured", message: "RCGROUP_API_URL is unset" };
  }
  const platform = guessPlatform(url);
  const path = platform === "taobao" || platform === "tmall" ? "/taobao/" : "/";
  const endpoint = `${base}${path}?q=${encodeURIComponent(url)}&page=1`;
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { available: false, reason: "network_error", message: `HTTP ${res.status}` };
    const json = await res.json();
    return { available: true, hits: normaliseHits(json, platform), page: 1, has_more: false };
  } catch (e) {
    return { available: false, reason: "network_error", message: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Reverse image search.
 *
 * Legacy used the same RCGroup endpoint with imagesSearch param. We
 * accept a Buffer / Blob and forward as multipart/form-data.
 */
export async function searchByImage(file: Blob): Promise<ChinaSearchResult> {
  const base = process.env.PACRED_RCGROUP_API_URL;
  if (!base) {
    return { available: false, reason: "not_configured", message: "RCGROUP_API_URL is unset" };
  }
  const fd = new FormData();
  fd.append("image", file);
  try {
    const res = await fetch(`${base}/image-search/`, { method: "POST", body: fd, cache: "no-store" });
    if (!res.ok) return { available: false, reason: "network_error", message: `HTTP ${res.status}` };
    const json = await res.json();
    return { available: true, hits: normaliseHits(json, "1688"), page: 1, has_more: false };
  } catch (e) {
    return { available: false, reason: "network_error", message: e instanceof Error ? e.message : "unknown" };
  }
}

// ── helpers ──
function guessPlatform(url: string): ChinaSearchHit["provider"] {
  if (/taobao\.com/i.test(url)) return "taobao";
  if (/tmall\.com/i.test(url))  return "tmall";
  return "1688";
}

function fixAliCdn(src: string | undefined): string | undefined {
  if (!src) return src;
  return src
    .replace("http://g.search2.alicdn.com",  "https://cbu01.alicdn.com")
    .replace("http://g.search1.alicdn.com",  "https://cbu01.alicdn.com")
    .replace("http://g.search.alicdn.com",   "https://cbu01.alicdn.com");
}

type AnyRow = Record<string, unknown>;

function normaliseHits(json: unknown, fallbackProvider: ChinaSearchHit["provider"]): ChinaSearchHit[] {
  if (!json || typeof json !== "object") return [];
  const root = json as AnyRow;
  // Legacy response shape: { datalist: [{ thid_item_id, ... }] }
  const list = (Array.isArray(root.datalist) ? root.datalist : Array.isArray(root.data) ? root.data : []) as AnyRow[];
  return list.map((r) => ({
    provider:   (r.provider as ChinaSearchHit["provider"]) ?? fallbackProvider,
    product_id: typeof r.thid_item_id === "string" ? r.thid_item_id : (typeof r.product_id === "string" ? r.product_id : undefined),
    title:      String(r.title ?? r.name ?? ""),
    url:        String(r.url ?? r.detail_url ?? (typeof r.thid_item_id === "string" ? `https://detail.1688.com/offer/${r.thid_item_id}.html` : "")),
    image_url:  fixAliCdn(typeof r.image === "string" ? r.image : (typeof r.pImages === "string" ? r.pImages : undefined)),
    price_cny:  typeof r.price === "number" ? r.price : (typeof r.price === "string" ? Number(r.price) : undefined),
    shop_name:  typeof r.shop === "string" ? r.shop : (typeof r.shop_name === "string" ? r.shop_name : undefined),
  })).filter((h) => h.title || h.url);
}
