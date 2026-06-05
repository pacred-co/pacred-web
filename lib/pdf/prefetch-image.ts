/**
 * 2026-06-05 (ภูม flag) — fetch marketplace product images server-side and
 * encode as base64 data URIs for embedding in @react-pdf/renderer PDFs.
 *
 * Why this exists:
 *   alicdn (and other Aliyun-backed CDNs serving Taobao/1688/Tmall product
 *   images) **auto-negotiates WebP based on User-Agent**. When @react-pdf's
 *   built-in image fetcher (or any node-fetch with a UA) requests an alicdn
 *   URL, the CDN returns `Content-Type: image/webp`. @react-pdf/renderer
 *   only supports JPG / PNG / GIF — WebP returns an empty/broken image and
 *   renders as a blank box. Forcing the CDN to serve JPG requires sending
 *   a request with NO User-Agent header (verified via `curl -A ""` 2026-06-05
 *   → `Content-Type: image/jpeg`).
 *
 * Strategy:
 *   1. Pre-fetch each image at PDF route handler time (before render).
 *   2. Send a fetch with empty User-Agent → CDN serves JPG.
 *   3. Verify Content-Type is JPG/PNG/GIF (skip WebP/AVIF/SVG).
 *   4. Cap at 200 KB (skip huge originals · keeps PDF render fast).
 *   5. Encode as `data:image/jpeg;base64,...` URI.
 *   6. Replace `image_path` in items before render.
 *
 * Failures (timeout · 404 · WebP · oversize · bare-filename) → `null` so the
 * component falls through to the "—" placeholder. Never throws.
 */

import "server-only";

const FETCH_TIMEOUT_MS = 4000;
const MAX_IMAGE_BYTES = 200 * 1024;

/**
 * Fetch one product image and return a base64 data URI, or null on any
 * failure. Never throws.
 */
export async function prefetchProductImage(rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (!url) return null;
  // Protocol-relative URL ("//img.alicdn.com/...") → coerce to https://
  if (url.startsWith("//")) url = "https:" + url;
  if (!/^https?:\/\//i.test(url)) return null; // bare filename · skip (legacy)

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      // ⚠️ Empty User-Agent header is INTENTIONAL · forces alicdn/Aliyun CDN
      // to serve JPG instead of WebP. Do not "fix" this by adding a normal UA.
      headers: { "User-Agent": "" },
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const ctype = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    // @react-pdf/renderer decodes JPG / PNG / GIF only. WebP/AVIF/SVG break.
    if (!/^image\/(jpeg|jpg|png|gif)$/.test(ctype)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${ctype};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pre-fetch images for an array of items in parallel. Replaces each item's
 * `image_path` with a data URI (or `null` on failure). Used by PDF route
 * handlers before passing data to the receipt component.
 */
export async function prefetchAllItemImages<T extends { image_path: string | null }>(
  items: readonly T[],
): Promise<T[]> {
  return Promise.all(
    items.map(async (it) => ({
      ...it,
      image_path: await prefetchProductImage(it.image_path),
    })),
  );
}
