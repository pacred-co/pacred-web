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
