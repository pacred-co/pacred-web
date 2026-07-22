/**
 * 2026-06-05 (ภูม flag) — normalize product URLs from Taobao / Tmall / 1688
 * + JD before storing in `tb_cart.curl` (varchar(1000) since migration 0272 ·
 * was varchar(300)).
 *
 * Background: marketplace product URLs that customers paste carry a long
 * trail of tracking/analytics query params (utparam · scm · spm · pvid ·
 * abtest · ecpm · tpp_buckets · ab_info · mix_group · xxc · etc.). The full
 * URL ภูม paste'd was 935 chars — overflowing `curl varchar(300)`. The
 * canonical SKU is fully described by `id` (+ optional `skuId`) — every other
 * param is ad-attribution noise.
 *
 * This helper:
 *   1. Tries to parse as a URL.
 *   2. If it's a known marketplace, keeps only `id` + `skuId` (Taobao /
 *      Tmall / 1688) or `wareId` (JD) — and discards everything else.
 *   3. Otherwise, just truncates at MAX_URL_CHARS (defensive — never throws).
 *   4. Returns the original input as-is if URL parsing fails (fail-open · for
 *      non-URL strings like "ขอตามนี้นะ" we don't want to mangle them) — but
 *      still truncated to MAX_URL_CHARS, so nothing that leaves this function
 *      can overflow the column or trip the validator.
 */

// Postgres `tb_cart.curl` / `tb_order.curl` — widened 300 → varchar(1000) by
// migration 0272 (owner 2026-07-22 "ปรับขนาด database จาก 300 เป็น 1000"), so this
// tracks PRODUCT_URL_MAX minus a 10-char buffer (some marketplaces append `?`
// even on canonical URLs). Kept as a literal — NOT imported from
// lib/validators/product-text — because that module imports THIS one; the unit
// test pins `MAX_URL_CHARS < PRODUCT_URL_MAX` so the two can never drift apart.
export const MAX_URL_CHARS = 990;

// Hosts whose only canonical query param is `id` (+ optional `skuId`).
const TAOBAO_HOSTS = new Set([
  "item.taobao.com",
  "detail.tmall.com",
  "world.taobao.com",
  "world.tmall.com",
  "h5.m.taobao.com",
  "m.intl.taobao.com",
]);

// 1688 uses `offer/{id}.html` path style — no `id` query needed.
const ONE688_HOSTS = new Set([
  "detail.1688.com",
  "m.1688.com",
]);

// JD uses `wareId` (or sometimes `sku`).
const JD_HOSTS = new Set([
  "item.jd.com",
  "item.m.jd.com",
]);

/**
 * Strip tracking params from a marketplace product URL. Never throws.
 *
 * @param raw — the raw URL string from the customer paste (may be very long)
 * @returns a normalized URL ≤ MAX_URL_CHARS, or a truncated fallback
 */
export function normalizeProductUrl(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Fast path: already short → don't fiddle.
  if (trimmed.length <= MAX_URL_CHARS && !needsStripping(trimmed)) return trimmed;

  // Try to parse as URL.
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    // Not a URL (free-text note) — truncate defensively.
    return trimmed.slice(0, MAX_URL_CHARS);
  }

  const host = u.hostname.toLowerCase();

  if (TAOBAO_HOSTS.has(host)) {
    const id = u.searchParams.get("id");
    const skuId = u.searchParams.get("skuId");
    if (id) {
      const params = new URLSearchParams();
      params.set("id", id);
      if (skuId) params.set("skuId", skuId);
      const out = `${u.origin}${u.pathname}?${params.toString()}`;
      return out.length <= MAX_URL_CHARS ? out : out.slice(0, MAX_URL_CHARS);
    }
  } else if (ONE688_HOSTS.has(host)) {
    // 1688: path = /offer/{id}.html · no useful query params · drop ?...
    const out = `${u.origin}${u.pathname}`;
    return out.length <= MAX_URL_CHARS ? out : out.slice(0, MAX_URL_CHARS);
  } else if (JD_HOSTS.has(host)) {
    // JD: keep wareId (or sku) only
    const wareId = u.searchParams.get("wareId") ?? u.searchParams.get("sku");
    if (wareId) {
      const out = `${u.origin}${u.pathname}?wareId=${wareId}`;
      return out.length <= MAX_URL_CHARS ? out : out.slice(0, MAX_URL_CHARS);
    }
  }

  // Unknown host — keep origin+pathname, drop all query params if still long.
  const minimal = `${u.origin}${u.pathname}`;
  if (minimal.length <= MAX_URL_CHARS) return minimal;
  return minimal.slice(0, MAX_URL_CHARS);
}

/**
 * Cheap heuristic — true if URL has tracking-grade query params worth stripping.
 * Prevents needless URL re-parsing for short, clean URLs.
 */
function needsStripping(url: string): boolean {
  return /[?&](utparam|scm|spm|pvid|abtest|ecpm|tpp_buckets|ab_info|mix_group|xxc|cv|sourceType|jd_pop|extension_id|utm_|gclid|fbclid|mc_(?:eid|cid))/.test(url);
}
