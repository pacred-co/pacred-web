/**
 * Pure URL host allow-list for the product-search server action.
 *
 * Lives in its own file (no `server-only`) so it can be unit-tested
 * with tsx without spinning up Next.js — actions/product-search.ts
 * is "use server" and would throw at import time in a plain node
 * runner. Same pattern as lib/china-search/extract-product-id.ts.
 *
 * Mirrors the host set the legacy `convertURLChinna()` classifier
 * recognised (`pcs-admin/include/functions.php`):
 *   - 1688.com (any subdomain — desktop, mobile, m.)
 *   - taobao.com (item.taobao, etc.)
 *   - tmall.com (detail.tmall, detail.m.tmall)
 *   - m.tb.cn (Taobao short share URL)
 *   - qr.1688.com (1688 short share URL — short URLs are resolved
 *     by lib/china-search/short-url-cache.ts before the productID
 *     extraction step)
 *
 * Anything else short-circuits to a typed error so a pasted
 * "google.com" / "amazon.com" / "lazada.co.th" never burns a TAMIT
 * round-trip.  Non-https URLs (ftp://, javascript:) also rejected
 * for XSS hygiene — Pacred's CSP would block them at the browser
 * anyway, but failing fast is cheaper than producing an inert card.
 */

const SUPPORTED_HOST_PATTERN =
  /(1688\.com|taobao\.com|tmall\.com|m\.tb\.cn|qr\.1688\.com)/i;

export function isSupportedProductUrl(url: string): boolean {
  const u = (url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  return SUPPORTED_HOST_PATTERN.test(u);
}
