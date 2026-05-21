import Script from "next/script";

/**
 * Meta (Facebook) Pixel — fires on EVERY page for FB/Instagram ad
 * conversion + remarketing + audience-building.
 *
 * **THE ID IS HARDCODED BY DIRECTIVE** (เดฟ, 2026-05-20): tracking must
 * be embedded in CODE on every page, not in any external dashboard. The
 * owner runs paid FB/IG ads — without this tag in the rendered HTML
 * customers can't be tracked. Env override
 * `NEXT_PUBLIC_FB_PIXEL_ID` supported for dev/staging; the hardcoded
 * default fires regardless of env. Do NOT remove the hardcoded default.
 *
 * Two parts:
 *   - `<FacebookPixelScript />` — the `<script>` initialiser; place in
 *     root `<head>`. Loads `fbevents.js`, calls `fbq('init', …)` and
 *     `fbq('track', 'PageView')` on every page.
 *   - `<FacebookPixelNoscript />` — `<noscript><img>` fallback that
 *     pings tr?id=… for users with JS disabled; place near the top of
 *     `<body>` (mirrors GTM's `GtmNoscript`).
 */
const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || "27209891118650099";

export function FacebookPixelScript() {
  if (!FB_PIXEL_ID) return null;

  return (
    <>
      <link rel="preconnect" href="https://connect.facebook.net" />
      <Script
        id="meta-pixel-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${FB_PIXEL_ID}');
fbq('track', 'PageView');`,
        }}
      />
    </>
  );
}

export function FacebookPixelNoscript() {
  if (!FB_PIXEL_ID) return null;

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        alt=""
        src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
      />
    </noscript>
  );
}
