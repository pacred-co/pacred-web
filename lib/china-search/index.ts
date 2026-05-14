/**
 * China product search abstraction.
 *
 * Wired to the legacy PHP's actual production endpoints — see deep audit
 * `docs/audit/php-pcscargo-integrations.md`.  The previous wiring to
 * `PACRED_RCGROUP_API_URL` was incorrect: in PHP, RCGroup is dead code
 * gated by `$APIKEY` which is never assigned.  The real flow is:
 *
 *   - Product detail (URL→cart):  TAMIT-cloud `/api-product/get/{1688|taobao}/?id=<id>`  (P-50)
 *   - Short-URL resolver (m.tb.cn / qr.1688.com → productID):  tam-i-t.com cache  (P-51)
 *   - Keyword search:  AkuCargo (P-52 — still legacy here, TODO comment)
 *   - Image reverse search:  Laonet (P-53 — still legacy here, TODO comment)
 *
 * Env vars:
 *   PACRED_TAMIT_DETAIL_URL   defaults to `https://tamit-cloud.com/api-product`
 *   PACRED_TAMIT_API_URL      (legacy keyword endpoint — superseded by AkuCargo in P-52)
 *
 * When TAMIT detail is unreachable / unparseable / productID-not-extractable
 * we still return `available: true` with a `buildDemoDetail()` payload so
 * the customer can fill price + qty manually and add to cart.  This is the
 * exact same posture the legacy PHP took when its API was down — keeps the
 * checkout flow alive on flaky 3rd-party connectivity.
 */

import "server-only";
import { extractProductId } from "./extract-product-id";
import { resolveShortUrl, detectShortUrl } from "./short-url-cache";

const DEFAULT_TAMIT_DETAIL_URL = "https://tamit-cloud.com/api-product";

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
 *  Mirrors the legacy `json->data` shape so callers don't care which
 *  upstream provider answered. */
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

// ────────────────────────────────────────────────────────────
// KEYWORD SEARCH — TODO(P-52): rewire to AkuCargo per audit §4a
//   `https://akucargo.com/api3/api-2022/search/v1[/taobao]/?q=&page_size=15&page=&lang=zh-CN`
//   Response shape: json.items.item[i].{detail_url, pic_url, title, price, promotion_price, sales}
// ────────────────────────────────────────────────────────────
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
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { available: false, reason: "network_error", message: `HTTP ${res.status}` };
    const json = await res.json();
    return { available: true, hits: normaliseHits(json, platform), page, has_more: Boolean(json?.has_more) };
  } catch (e) {
    return { available: false, reason: "network_error", message: e instanceof Error ? e.message : "unknown" };
  }
}

// ────────────────────────────────────────────────────────────
// URL → PRODUCT DETAIL — wired to TAMIT-cloud (P-50)
// ────────────────────────────────────────────────────────────

/**
 * Simple URL converter — mirrors `convertProductUrlDetail` but projects
 * down to the search-hit shape for callers that don't need SKU axes.
 * Currently only the API route exposes this via `?mode=url`; the
 * service-order add page uses `convertProductUrlDetail` directly.
 */
export async function convertProductUrl(url: string): Promise<ChinaSearchResult> {
  const detail = await convertProductUrlDetail(url);
  if (!detail.available) {
    // Type-system gymnastics: the rich variant uses a generic `reason: string`
    // but the search variant constrains to a fixed enum.  Map any non-enum
    // reason to "network_error" so the UI banner says something sensible.
    const reason = detail.reason === "not_configured" || detail.reason === "rate_limited"
      ? detail.reason
      : "network_error";
    return { available: false, reason, message: detail.message };
  }
  const d = detail.detail;
  const hit: ChinaSearchHit = {
    provider:   d.provider,
    product_id: d.product_id,
    title:      d.title,
    url:        d.url,
    image_url:  d.main_image,
    price_cny:  d.base_price_cny,
    shop_name:  d.shop_name,
  };
  return { available: true, hits: [hit], page: 1, has_more: false };
}

/**
 * Rich URL converter — returns the full product detail with SKU
 * variants. Used by the "วาง URL" tab in /service-order/add to render
 * the variant grid the user picks quantities from.
 *
 * Flow per audit §3a:
 *   1. Classify URL → platform (1688 / taobao / tmall).  Tmall maps to
 *      taobao at TAMIT (same vendor backend).
 *   2. Extract productID from URL (regex; short URLs cannot be resolved
 *      here — P-51 will add the tam-i-t.com cache layer).
 *   3. GET ${TAMIT_DETAIL_URL}/get/${tamitPlatform}/?id=${productID}
 *      with NO auth headers (TAMIT is unauthenticated).
 *   4. If json.status === 200 → normaliseTamitDetail(json.data).
 *   5. Anything else → buildDemoDetail() so checkout flow isn't broken.
 */
export async function convertProductUrlDetail(url: string): Promise<ConvertProductResult> {
  // Short URLs (m.tb.cn/<tk>, qr.1688.com/s/<tk>) need the tam-i-t.com
  // cache resolver (P-51) to expose a productID — full URLs skip this.
  const short = detectShortUrl(url);
  let resolvedShortPlatform: ChinaProductDetail["provider"] | null = null;
  let resolvedShortId: string | null = null;
  if (short) {
    resolvedShortId = await resolveShortUrl(url);
    // Provider mapping: tam-i-t cache provider 1 = 1688, provider 2 = taobao.
    // We don't know whether the original Taobao share was Tmall vs Taobao;
    // safer to assume Taobao at this layer (Tmall items also work via the
    // Taobao backend at TAMIT — same vendor, see P-50 commit).
    resolvedShortPlatform = short.provider === "1" ? "1688" : "taobao";
  }

  const platform = resolvedShortPlatform ?? guessPlatform(url);
  const tamitPlatform = tamitPathSegment(platform);
  const productId = resolvedShortId ?? extractProductId(url);

  // No productID extractable AND short-URL resolution failed (network outage
  // / cache miss + scrape failure) — serve the demo so the customer can
  // still proceed.  The legacy PHP took the same posture on cache outages.
  if (!productId) {
    return { available: true, detail: buildDemoDetail(url, platform) };
  }

  const base = process.env.PACRED_TAMIT_DETAIL_URL || DEFAULT_TAMIT_DETAIL_URL;
  const endpoint = `${base.replace(/\/+$/, "")}/get/${tamitPlatform}/?id=${encodeURIComponent(productId)}`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { available: true, detail: buildDemoDetail(url, platform, productId) };
    }
    const json = await res.json();
    const status = (json as { status?: number | string } | null)?.status;
    if (String(status) !== "200") {
      return { available: true, detail: buildDemoDetail(url, platform, productId) };
    }
    return {
      available: true,
      detail: normaliseTamitDetail(json, platform, url, productId),
    };
  } catch {
    return { available: true, detail: buildDemoDetail(url, platform, productId) };
  }
}

/** Tmall and Taobao share the same TAMIT backend (`/get/taobao/`). */
function tamitPathSegment(platform: ChinaProductDetail["provider"]): "1688" | "taobao" {
  return platform === "1688" ? "1688" : "taobao";
}

/**
 * Demo product fallback — used when productID can't be extracted, TAMIT
 * is unreachable, env unset, or response status !== 200.  Mirrors what
 * the legacy code did when its API was down: render a single editable row
 * so the customer can fill in price + qty + free-text variant and still
 * place the order.  Admin resolves the actual product after placement.
 */
function buildDemoDetail(
  url: string,
  platform: ChinaProductDetail["provider"],
  knownProductId?: string,
): ChinaProductDetail {
  const productId = knownProductId ?? extractProductId(url) ?? undefined;

  const shopName = platform === "1688" ? "1688 Shop"
                 : platform === "taobao" ? "Taobao Shop"
                 : "Tmall Shop";

  return {
    provider:   platform,
    product_id: productId,
    title:      `สินค้าจาก ${platform.toUpperCase()}${productId ? ` (รหัส ${productId})` : ""}`,
    url,
    shop_name:  shopName,
    main_image: undefined,
    images:     [],
    base_price_cny:  0,
    promo_price_cny: undefined,
    stock_total: 9999,
    sku_axes: undefined,
    sku_map: [
      { sku_id: "demo-default", prop_path: {}, price_cny: 0, stock: 9999 },
    ],
  };
}

/**
 * Map the TAMIT-cloud response shape to ChinaProductDetail.
 *
 * TAMIT returns under `json.data` (audit §3a):
 *   title, vendor, listImage[], mainImage, sku[], skuMap[],
 *   priceRanges[], referencePrice, mainVedio, detail, provider, ...
 *
 * sku entries:    { name: string, value: [{label, image?, data?, isImage?}] }
 * skuMap entries: { skuId, propPath: "axisId:valId;...", price, stock, image? }
 * priceRanges:    [{ min, max, price }] (tier pricing — first tier is the
 *                  list price, subsequent tiers offer discounts at higher Q)
 *
 * Anything missing/wrong-typed degrades gracefully (e.g. sku_axes left
 * undefined → UI falls back to a single editable row).
 */
function normaliseTamitDetail(
  json: unknown,
  platform: ChinaProductDetail["provider"],
  srcUrl: string,
  productId: string,
): ChinaProductDetail {
  const root = (json && typeof json === "object" && "data" in (json as Record<string, unknown>))
    ? (json as { data: Record<string, unknown> }).data ?? {}
    : {};

  const main_image = typeof root.mainImage === "string" ? fixAliCdn(root.mainImage) : undefined;
  const list_images = Array.isArray(root.listImage)
    ? (root.listImage as unknown[])
        .map((u) => (typeof u === "string" ? fixAliCdn(u) : undefined))
        .filter((u): u is string => !!u)
    : [];
  const images = list_images.length > 0
    ? list_images
    : main_image ? [main_image] : [];

  // Reference price = headline price in the listing UI.
  const base_price_cny = typeof root.referencePrice === "number"
    ? root.referencePrice
    : typeof root.referencePrice === "string"
      ? Number(root.referencePrice) || undefined
      : undefined;

  // Best-effort promo price — if the lowest tier in priceRanges is below
  // referencePrice, surface that as the promo.  Otherwise leave undefined.
  let promo_price_cny: number | undefined;
  if (Array.isArray(root.priceRanges) && root.priceRanges.length > 0) {
    type Range = { price?: number | string; min?: number; max?: number };
    const ranges = root.priceRanges as Range[];
    const prices = ranges
      .map((r) => (typeof r.price === "number" ? r.price : Number(r.price ?? NaN)))
      .filter((p) => Number.isFinite(p) && p > 0);
    if (prices.length > 0) {
      const lowest = Math.min(...prices);
      if (base_price_cny == null) {
        // No referencePrice — use highest tier as base, lowest as promo if distinct
        const highest = Math.max(...prices);
        if (lowest < highest) promo_price_cny = lowest;
      } else if (lowest < base_price_cny) {
        promo_price_cny = lowest;
      }
    }
  }

  // sku axes — TAMIT shape: [{ name, value: [{label, image?, data?, isImage?}] }]
  type SkuValueRaw = { label?: string; image?: string; data?: string; isImage?: number | boolean };
  type SkuAxisRaw  = { name?: string; value?: SkuValueRaw[] };
  const skuAxesRaw = (Array.isArray(root.sku) ? (root.sku as SkuAxisRaw[]) : []);
  const sku_axes = skuAxesRaw.map((axis, i) => ({
    name: typeof axis?.name === "string" && axis.name ? axis.name : `axis_${i}`,
    values: (Array.isArray(axis?.value) ? axis.value : []).map((v) => ({
      label:    String(v?.label ?? ""),
      image:    fixAliCdn(v?.image),
      data:     v?.data != null ? String(v.data) : undefined,
      is_image: v?.isImage === 1 || v?.isImage === true,
    })),
  }));

  // sku map — propPath is "axisId:valId;axisId:valId" (legacy 1688 style).
  // Best-effort lookup against axes by index/name; UI prettifies further.
  type SkuMapRaw = { skuId?: string | number; price?: number | string; stock?: number; propPath?: string; image?: string };
  const sku_map = Array.isArray(root.skuMap)
    ? (root.skuMap as SkuMapRaw[]).map((m) => {
        const path: Record<string, string> = {};
        if (typeof m.propPath === "string") {
          const parts = m.propPath.split(";").filter(Boolean);
          for (const p of parts) {
            const [axisId, valId] = p.split(":");
            if (axisId && valId) path[axisId] = valId;
          }
        }
        return {
          sku_id:    String(m.skuId ?? ""),
          prop_path: path,
          price_cny: Number(m.price ?? base_price_cny ?? 0),
          stock:     Number(m.stock ?? 0),
          image:     fixAliCdn(m.image),
        };
      })
    : [];

  // Stock total — TAMIT may give it as string "in stock" or number, defensive.
  let stock_total: number | undefined;
  if (typeof root.stock === "number") stock_total = root.stock;
  else if (typeof root.stock === "string") {
    const n = Number(root.stock.replace(/[^0-9]/g, ""));
    if (Number.isFinite(n)) stock_total = n;
  }

  return {
    provider:        platform,
    product_id:      productId,
    title:           typeof root.title === "string" ? root.title : "",
    url:             srcUrl,
    shop_name:       typeof root.vendor === "string" ? root.vendor : undefined,
    main_image,
    images,
    base_price_cny,
    promo_price_cny,
    stock_total,
    sku_axes:        sku_axes.length > 0 ? sku_axes : undefined,
    sku_map:         sku_map.length > 0 ? sku_map : undefined,
  };
}

// ────────────────────────────────────────────────────────────
// IMAGE SEARCH — TODO(P-53): rewire to Laonet per audit §4b
//   upload:  ?api_name=upload_img&imgcode=<b64>&key=<email-as-key>
//   search:  ?api_name=item_search_img&imgid=<id>&key=...
// ────────────────────────────────────────────────────────────
export async function searchByImage(file: Blob): Promise<ChinaSearchResult> {
  const base = process.env.PACRED_RCGROUP_API_URL;
  if (!base) {
    return { available: false, reason: "not_configured", message: "RCGROUP_API_URL is unset (P-53 will rewire to Laonet)" };
  }
  const fd = new FormData();
  fd.append("image", file);
  try {
    const res = await fetch(`${base}/image-search/`, { method: "POST", body: fd, cache: "no-store", signal: AbortSignal.timeout(15000) });
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
  // Legacy/AkuCargo response shape variants.
  const list = (Array.isArray(root.datalist) ? root.datalist
              : Array.isArray(root.data)     ? root.data
              : []) as AnyRow[];
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
