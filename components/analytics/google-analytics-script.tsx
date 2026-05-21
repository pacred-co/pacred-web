import Script from "next/script";

/**
 * Google Analytics 4 + Google Tag (gtag.js consolidated) — fires on every
 * page for site analytics + conversion measurement.
 *
 * **IDs HARDCODED BY DIRECTIVE** (เดฟ, 2026-05-20): both the GA4
 * Measurement ID (`G-…`) and the new consolidated Google Tag (`GT-…`)
 * the owner provided are embedded as fallbacks so the tags fire even
 * without Vercel env configuration. Env overrides:
 *   - NEXT_PUBLIC_GA4_ID
 *   - NEXT_PUBLIC_GOOGLE_TAG_ID
 *
 * Both load the SAME `gtag.js` runtime (the browser caches it), so this
 * one component configures both IDs with a single `<script>` block.
 * `window.dataLayer` + `gtag()` are shared with `GoogleAdsScript` and any
 * other gtag-based loader — multiple `gtag('config', …)` calls just
 * accumulate; the second `gtag.js` request is a cache hit, not a refetch.
 *
 * Place inside the root `<head>` (Server Component).
 */
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID || "G-62J8PEVJLZ";
const GOOGLE_TAG_ID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "GT-KFHGBVK9";

export function GoogleAnalyticsScript() {
  const configs = [GA4_ID, GOOGLE_TAG_ID].filter((id): id is string => !!id);
  if (configs.length === 0) return null;

  // The src ID is just whichever runs first; gtag('config') is the call
  // that actually registers each tracking property.
  const primary = configs[0];

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${primary}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga4-googletag-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
${configs.map((id) => `gtag('config', '${id}');`).join("\n")}`,
        }}
      />
    </>
  );
}
