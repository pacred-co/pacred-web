/**
 * Short-URL → productID resolver (P-51).
 *
 * Mirrors the PHP `convertURLChinna()` cache flow at `tam-i-t.com` per
 * audit §3b.  Without this layer, every short URL paste (the most common
 * case from mobile LINE share / WeChat / TaoBao mobile app) falls through
 * to the demo fallback in `convertProductUrlDetail` because the productID
 * isn't in the URL — it's only obtainable by following the redirect.
 *
 * Flow:
 *   1. Classify short URL → which TAM cache subpath:
 *        m.tb.cn/{tk}        → /get/taobao/?tk={tk}   (provider=2)
 *        qr.1688.com/s/{tk}  → /get/?tk={tk}          (provider=1)
 *   2. GET the cache.  HTTP 200 + body has productID  → done.
 *      HTTP 204 → cache miss, fall through.
 *   3. On miss: fetch the short URL itself with a desktop Firefox UA spoof
 *      (mobile UA gets a different DOM that hides the productID).  The
 *      response body / Location header contains one of:
 *        ?Id=<id>  /  Id%3D<id>      (Tmall/Taobao redirect)
 *        Foffer%2F<id>               (1688 redirect)
 *        ?id=<id>                    (canonical querystring)
 *   4. POST back to /save/?tk=...&provider={1|2}&productID=... so the
 *      next paste of the same short URL skips the scrape.
 *
 * In-memory LRU cache (small) on top of the upstream cache reduces RTT
 * for repeated lookups within the same Vercel function instance.
 *
 * Env:
 *   PACRED_TAMIT_CACHE_URL (default https://tam-i-t.com/api/convert-link-china)
 *
 * Returns null on any failure — caller must handle (P-50's
 * `convertProductUrlDetail` falls through to `buildDemoDetail`).
 */

import "server-only";
import { detectShortUrl, scrapeProductId } from "./short-url-helpers";

// Re-export so existing callers don't need to know about the split.
export { detectShortUrl, scrapeProductId };

const DEFAULT_CACHE_BASE = "https://tam-i-t.com/api/convert-link-china";

// Desktop Firefox UA — taobao/1688 short-URL pages serve a different,
// productID-bearing page when they think the client is desktop. PHP audit
// §3b confirms this is the spoof legacy uses.
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:53.0) Gecko/20100101 Firefox/53.0";

const MEM_CACHE = new Map<string, { productId: string; expiresAt: number }>();
const MEM_TTL_MS = 5 * 60 * 1000; // 5 minutes — long enough for a checkout session
const MEM_MAX = 200;              // bounded so a busy instance doesn't grow unbounded

/**
 * Resolve a short URL to its productID.  Returns null on any failure —
 * callers should fall through to the demo fallback so the customer is
 * never blocked by an upstream outage.
 */
export async function resolveShortUrl(url: string): Promise<string | null> {
  const m = detectShortUrl(url);
  if (!m) return null;

  // ── 0. in-memory hit ──
  const memKey = `${m.provider}:${m.tk}`;
  const cached = MEM_CACHE.get(memKey);
  if (cached && cached.expiresAt > Date.now()) return cached.productId;

  const base = (process.env.PACRED_TAMIT_CACHE_URL || DEFAULT_CACHE_BASE).replace(/\/+$/, "");

  // ── 1. upstream cache lookup ──
  try {
    const cacheUrl = `${base}${m.cachePath}?tk=${encodeURIComponent(m.tk)}`;
    const res = await fetch(cacheUrl, {
      headers: { Accept: "application/json,text/plain,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 200) {
      const id = parseProductIdFromCacheBody(await res.text());
      if (id) {
        rememberInMem(memKey, id);
        return id;
      }
    }
    // 204 = miss → fall through to scrape
  } catch {
    // network blip — try the scrape path; if both fail, return null
  }

  // ── 2. scrape the short URL itself ──
  let productId: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": DESKTOP_UA, Accept: "text/html" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    // Look at both the final URL (after redirects) and the response body.
    // Either side may carry the productID depending on how the short link
    // resolves (some land on a JS interstitial, some 302 straight through).
    const finalUrl = res.url || "";
    const body = await res.text();
    productId = scrapeProductId(finalUrl) ?? scrapeProductId(body);
  } catch {
    return null;
  }

  if (!productId) return null;

  rememberInMem(memKey, productId);

  // ── 3. write back to upstream cache (best-effort, fire-and-forget) ──
  // Don't await — failure here just means the next paste of the same tk
  // will scrape again.  Don't surface error to the caller either.
  void (async () => {
    try {
      const saveUrl = `${base}/save/?tk=${encodeURIComponent(m.tk)}&provider=${m.provider}&productID=${encodeURIComponent(productId!)}`;
      await fetch(saveUrl, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* ignore — best-effort */
    }
  })();

  return productId;
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function rememberInMem(key: string, productId: string): void {
  if (MEM_CACHE.size >= MEM_MAX) {
    // simple FIFO eviction — drop the oldest (Map iteration is insertion-order)
    const first = MEM_CACHE.keys().next().value;
    if (first !== undefined) MEM_CACHE.delete(first);
  }
  MEM_CACHE.set(key, { productId, expiresAt: Date.now() + MEM_TTL_MS });
}

/**
 * Cache responses can be plain text ("808456582517"), JSON
 * ({"productID":"..."} or {"data":{"id":"..."}}), or HTML wrappers.
 * Try a few common shapes and otherwise just look for the first long
 * numeric run.
 */
function parseProductIdFromCacheBody(body: string): string | null {
  const trimmed = body.trim();
  if (/^\d{6,}$/.test(trimmed)) return trimmed;
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>;
    const candidates = [
      j.productID,
      j.productId,
      j.id,
      (j.data as Record<string, unknown> | undefined)?.productID,
      (j.data as Record<string, unknown> | undefined)?.productId,
      (j.data as Record<string, unknown> | undefined)?.id,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && /^\d{6,}$/.test(c)) return c;
      if (typeof c === "number" && c > 100_000) return String(c);
    }
  } catch {
    /* not JSON, fall through */
  }
  return scrapeProductId(trimmed);
}

// scrapeProductId / detectShortUrl now live in ./short-url-helpers and are
// re-exported above so test runners can import the pure logic without
// dragging "server-only" into a node tsx process.
