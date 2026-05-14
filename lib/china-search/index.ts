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
import { akucargoSearch } from "./akucargo";
import { laonetImageSearch } from "./laonet";
import type {
  ChinaSearchHit,
  ChinaProductDetail,
  ConvertProductResult,
  ChinaSearchResult,
} from "./types";

// Re-export types for back-compat with existing call sites.
export type {
  ChinaSearchHit,
  ChinaProductDetail,
  ConvertProductResult,
  ChinaSearchResult,
};

const DEFAULT_TAMIT_DETAIL_URL = "https://tamit-cloud.com/api-product";

// ────────────────────────────────────────────────────────────
// KEYWORD SEARCH — wired to AkuCargo per audit §4a (P-52)
// ────────────────────────────────────────────────────────────

/**
 * Search by keyword (text typed into the search bar).  Delegates to the
 * AkuCargo adapter which knows the actual `?q=&page_size=15&lang=zh-CN`
 * pattern — Tmall isn't a separate platform at AkuCargo so it falls
 * through to taobao.  The legacy `order` parameter is no longer used
 * (AkuCargo doesn't expose order-by) but kept in the signature so the
 * /api/china-search route handler doesn't need to change.
 */
export async function searchKeyword(
  words: string,
  page = 1,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for API compat; AkuCargo doesn't support order-by
  _order: "default" | "price_asc" | "price_desc" = "default",
  platform: "1688" | "taobao" | "tmall" = "1688",
): Promise<ChinaSearchResult> {
  const akucargoPlatform = platform === "1688" ? "1688" : "taobao";
  return akucargoSearch(words, page, akucargoPlatform);
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
// IMAGE SEARCH — wired to Laonet per audit §4b (P-53)
// ────────────────────────────────────────────────────────────

/**
 * Reverse-image search.  Delegates to the Laonet adapter which knows the
 * 2-step flow (base64 upload → returns imgid → search by imgid).
 * Returns 1688 hits only — Laonet's image-search backend only indexes
 * 1688, even though the same wrapper serves Taobao detail in audit §4b.
 */
export async function searchByImage(file: Blob): Promise<ChinaSearchResult> {
  return laonetImageSearch(file);
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

// normaliseHits removed in P-53 — keyword search now goes through
// AkuCargo (P-52) and image search through Laonet (P-53), each with its
// own per-adapter parser.  The legacy combined parser had RCGroup-shape
// fields baked in that no longer match either real backend.
