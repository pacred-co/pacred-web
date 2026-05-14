/**
 * Pure helpers for short-url-cache.ts (P-51).
 *
 * Lives outside the `server-only` boundary so tsx tests can import them
 * without a Next.js runtime — the resolveShortUrl flow itself is server-
 * only because it does fetch() with desktop-UA spoofing, but the URL
 * classifier and the regex scraper are pure logic.
 */

export type ShortMatch =
  | { provider: "1" | "2"; tk: string; cachePath: "/get/" | "/get/taobao/" }
  | null;

/**
 * Classify a URL as short-form Taobao / 1688.  Returns null for any
 * other URL (including full URLs that already have productID inline —
 * the caller handles those via extractProductId).
 *
 * Provider mapping (matches PHP audit §3b):
 *   m.tb.cn/{tk}        → provider=2 (Taobao), cache subpath /get/taobao/
 *   qr.1688.com/s/{tk}  → provider=1 (1688),   cache subpath /get/
 */
export function detectShortUrl(url: string): ShortMatch {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  // Taobao mobile share: m.tb.cn/h.{tk}  OR  m.tb.cn/{tk}
  if (host === "m.tb.cn") {
    const tk = parsed.pathname.replace(/^\/+/, "").trim();
    if (tk) return { provider: "2", tk, cachePath: "/get/taobao/" };
  }

  // 1688 mobile share: qr.1688.com/s/{tk}
  if (host === "qr.1688.com") {
    const tk = parsed.pathname.replace(/^\/+s\/?/, "").replace(/\/+$/, "").trim();
    if (tk) return { provider: "1", tk, cachePath: "/get/" };
  }

  return null;
}

/**
 * Scrape a productID from an arbitrary string (URL, HTML body, or query).
 * Mirrors the PHP regex order from audit §3b.
 *
 * Patterns tried in order:
 *   ?id=<digits>           — canonical querystring
 *   Id%3D<digits>          — encoded ?Id= (Taobao redirect)
 *   Foffer%2F<digits>      — encoded /offer/ (1688 redirect)
 *   /offer/<digits>.html   — 1688 plain
 *   ?offerId=<digits>      — alternate 1688 querystring
 */
export function scrapeProductId(text: string): string | null {
  if (!text) return null;
  const idQs = text.match(/[?&]id=(\d{6,})/);
  if (idQs) return idQs[1];
  const idEnc = text.match(/Id%3D(\d{6,})/i);
  if (idEnc) return idEnc[1];
  const offerEnc = text.match(/Foffer%2F(\d{6,})/i);
  if (offerEnc) return offerEnc[1];
  const offerPlain = text.match(/\/offer\/(\d{6,})\.html/);
  if (offerPlain) return offerPlain[1];
  const offerQs = text.match(/[?&]offerId=(\d{6,})/);
  if (offerQs) return offerQs[1];
  return null;
}
