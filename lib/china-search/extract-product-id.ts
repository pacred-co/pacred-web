/**
 * Pure URL → productID extraction for 1688 / Taobao / Tmall.
 *
 * Lives in its own file (no `server-only`) so it can be unit-tested with
 * tsx without spinning up Next.js — `lib/china-search/index.ts` is server-
 * only and would throw at import time in a plain node runner.
 *
 * Patterns supported (mirrors what the PHP regex catches in legacy
 * `pcs-admin/include/functions.php` — see audit §3a):
 *   - 1688 desktop:   detail.1688.com/offer/<id>.html
 *   - 1688 wireless:  m.1688.com/offer/<id>.html
 *   - Taobao desktop: item.taobao.com/item.htm?id=<id>
 *   - Taobao mobile:  detail.m.tmall.com/item.htm?id=<id>
 *   - Tmall:          detail.tmall.com/item.htm?id=<id>
 *   - any URL with `?id=<id>` or `?offerId=<id>` query string
 *
 * Returns null for short URLs (m.tb.cn/<tk> / qr.1688.com/s/<tk>) — those
 * need the tam-i-t.com cache resolver added in P-51.
 */

export function extractProductId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const queryId = parsed.searchParams.get("id") ?? parsed.searchParams.get("offerId");
  if (queryId && /^\d{6,}$/.test(queryId)) return queryId;

  const path = parsed.pathname;
  // 1688 offer page: `/offer/<id>.html`
  const offerMatch = path.match(/\/offer\/(\d{6,})\.html/);
  if (offerMatch) return offerMatch[1];

  // Long numeric segment anywhere in the path (catches /<id>.htm,
  // /item/<id>, /<id>, etc.).  Threshold of 6 digits avoids false
  // positives from short numeric segments like /v2/ or /api/.
  const segMatch = path.match(/\/(\d{6,})(?:[\/.]|$)/);
  if (segMatch) return segMatch[1];

  return null;
}

/**
 * Detect the marketplace platform CODE from a product URL — the same codes
 * `tb_order.cprovider` stores ("1"=1688, "2"=Taobao, "3"=Tmall).
 *
 * The stored `cprovider` is sometimes MIS-STORED (a 1688 link tagged "2"), so
 * order-detail surfaces derive the displayed platform from the authoritative
 * `curl` instead. Returns null for unknown / non-marketplace hosts (or a bad
 * URL) so callers can fall back to the stored code.
 *
 *   1688.com   → "1"   (tmall.1688.com would still read 1688-first below)
 *   taobao.com → "2"
 *   tmall.com  → "3"
 *
 * @example
 *   detectProviderFromUrl("https://detail.1688.com/offer/123456.html") // "1"
 *   detectProviderFromUrl("https://item.taobao.com/item.htm?id=123456") // "2"
 *   detectProviderFromUrl("https://detail.tmall.com/item.htm?id=123456") // "3"
 *   detectProviderFromUrl("https://example.com") // null
 */
export function detectProviderFromUrl(url: string | null | undefined): "1" | "2" | "3" | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  // Match on registrable domain (endsWith with a leading dot, or exact) so a
  // subdomain like detail.1688.com / item.taobao.com resolves correctly and a
  // lookalike host (e.g. not1688.com) does not.
  const isHost = (domain: string): boolean => host === domain || host.endsWith(`.${domain}`);
  if (isHost("1688.com")) return "1";
  if (isHost("taobao.com")) return "2";
  if (isHost("tmall.com")) return "3";
  return null;
}
