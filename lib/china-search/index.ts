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

/** Rich product detail returned when a single URL is converted.
 *  Mirrors the legacy `json->data` shape from convertURL.php so any
 *  existing backend (RCGroup) can populate it without translation. */
export type ChinaProductDetail = {
  provider:     "1688" | "taobao" | "tmall";
  product_id?:  string;
  title:        string;
  url:          string;
  shop_name?:   string;
  main_image?:  string;
  images?:      string[];
  base_price_cny?: number;
  promo_price_cny?: number;
  stock_total?: number;

  /** Property axes: e.g. [{ name: 'สี', values: [{label:'แดง', image, data}, ...]}, ...] */
  sku_axes?: Array<{
    name: string;
    values: Array<{ label: string; image?: string; data?: string; is_image?: boolean }>;
  }>;

  /** Flattened combinations — one row per buyable SKU.
   *  prop_path identifies which axis-values combine to make this row. */
  sku_map?: Array<{
    sku_id:     string;
    prop_path:  Record<string, string>;     // { 'สี': 'แดง', 'ขนาด': 'M' }
    price_cny:  number;
    stock:      number;
    image?:     string;
  }>;
};

export type ConvertProductResult =
  | { available: false; reason: string; message?: string }
  | { available: true; detail: ChinaProductDetail };

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
 * normalized product summary that can be added to the cart. Returns
 * the simple search-hit shape (still used by some callers).
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
 * Rich URL converter — returns the full product detail with SKU
 * variants. Used by the "วาง URL" tab in /service-order/add to render
 * the variant grid the user picks quantities from.
 */
export async function convertProductUrlDetail(url: string): Promise<ConvertProductResult> {
  const base = process.env.PACRED_RCGROUP_API_URL;
  if (!base) return { available: false, reason: "not_configured", message: "RCGROUP_API_URL is unset" };

  const platform = guessPlatform(url);
  const path = platform === "taobao" || platform === "tmall" ? "/taobao/" : "/";
  const endpoint = `${base}${path}?q=${encodeURIComponent(url)}&page=1`;
  try {
    const res = await fetch(endpoint, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { available: false, reason: "network_error", message: `HTTP ${res.status}` };
    const json = await res.json();
    return { available: true, detail: normaliseDetail(json, platform, url) };
  } catch (e) {
    return { available: false, reason: "network_error", message: e instanceof Error ? e.message : "unknown" };
  }
}

function normaliseDetail(json: unknown, platform: ChinaProductDetail["provider"], srcUrl: string): ChinaProductDetail {
  // Legacy response shape: { data: { vendor, title, mainImage, images,
  //   price: [{price}], promoPrice: [{price}], stock, sku: [{value:[...]}],
  //   skuMap: [{prop_path, price, stock}] } }
  const d = (json && typeof json === "object" && "data" in (json as Record<string, unknown>))
    ? (json as { data: Record<string, unknown> }).data
    : (json as Record<string, unknown>);
  const root = d ?? {};

  const main_image = typeof root.mainImage === "string" ? fixAliCdn(root.mainImage) : undefined;
  const images = Array.isArray(root.images)
    ? (root.images as unknown[]).map((u) => (typeof u === "string" ? fixAliCdn(u) : undefined)).filter(Boolean) as string[]
    : main_image ? [main_image] : [];

  const basePrice = pickFirstPrice(root.price);
  const promoPrice = pickFirstPrice(root.promoPrice);

  // sku axes
  type SkuValueRaw = { label?: string; image?: string; data?: string; isImage?: number | boolean };
  type SkuAxisRaw  = { name?: string; value?: SkuValueRaw[] };
  const skuAxesRaw = (Array.isArray(root.sku) ? (root.sku as SkuAxisRaw[]) : []);
  const sku_axes = skuAxesRaw.map((axis, i) => ({
    name: axis?.name ?? `axis_${i}`,
    values: (axis?.value ?? []).map((v) => ({
      label:    String(v?.label ?? ""),
      image:    fixAliCdn(v?.image),
      data:     v?.data != null ? String(v.data) : undefined,
      is_image: v?.isImage === 1 || v?.isImage === true,
    })),
  }));

  // sku map (combinations)
  type SkuMapRaw = { skuId?: string | number; price?: number | string; stock?: number; propPath?: string; image?: string };
  const sku_map = Array.isArray(root.skuMap)
    ? (root.skuMap as SkuMapRaw[]).map((m) => {
        // propPath is "axisId:valueId;axisId:valueId" — we resolve to readable labels using sku_axes
        const path: Record<string, string> = {};
        if (typeof m.propPath === "string") {
          const parts = m.propPath.split(";").filter(Boolean);
          for (const p of parts) {
            const [axisId, valId] = p.split(":");
            // best-effort lookup; for now just include the raw ids and let UI prettify
            path[axisId] = valId;
          }
        }
        return {
          sku_id:    String(m.skuId ?? ""),
          prop_path: path,
          price_cny: Number(m.price ?? basePrice ?? 0),
          stock:     Number(m.stock ?? 0),
          image:     fixAliCdn(m.image),
        };
      })
    : [];

  return {
    provider:        platform,
    product_id:      typeof root.thid_item_id === "string" ? root.thid_item_id : undefined,
    title:           String(root.title ?? ""),
    url:             srcUrl,
    shop_name:       typeof root.vendor === "string" ? root.vendor : undefined,
    main_image,
    images,
    base_price_cny:  basePrice,
    promo_price_cny: promoPrice,
    stock_total:     typeof root.stock === "string" ? Number(root.stock.replace(/[^0-9]/g, "")) : (typeof root.stock === "number" ? root.stock : undefined),
    sku_axes:        sku_axes.length > 0 ? sku_axes : undefined,
    sku_map:         sku_map.length > 0 ? sku_map : undefined,
  };
}

function pickFirstPrice(v: unknown): number | undefined {
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0] as { price?: number | string };
    if (first?.price != null) return Number(first.price);
  }
  return undefined;
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
