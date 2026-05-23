import Script from "next/script";

/**
 * Google Ads conversion / remarketing tag (gtag.js).
 *
 * Fires on EVERY page for ad-conversion + remarketing measurement, AND
 * fires an explicit `conversion` event on phone (tel:) + LINE link clicks
 * for paid-traffic conversion attribution.
 *
 * **THE ID IS HARDCODED BY DIRECTIVE** (เดฟ, 2026-05-20): every page must
 * embed the tracking tag in CODE, not in GTM or any external dashboard.
 * The owner is running paid ads (Google + Facebook) right now and was
 * "blind" because the tag was missing from production HTML. The ID
 * `AW-17941254120` is Pacred's Google Ads account. Env override
 * `NEXT_PUBLIC_GOOGLE_ADS_ID` is supported for dev/staging swaps; the
 * hardcoded default ensures the tag fires on Vercel regardless of env
 * config. Do NOT remove the hardcoded default.
 *
 * Per ปอน 2026-05-20: paid traffic points at the customs-clearance landing
 * — conversions need to fire on phone-tap + LINE-tap. Click delegation
 * (capture phase, idempotent via `window.__pacredAdsClickArmed`) means new
 * phone/LINE buttons added later are auto-tracked.
 *
 * Place inside the root `<head>` (Server Component). Reuses the same
 * `window.dataLayer` GTM sets up — both can coexist; `gtag('config')`
 * pushes to the shared queue.
 */
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-17941254120";

export function GoogleAdsScript() {
  if (!GOOGLE_ADS_ID) return null;

  return (
    <>
      <link rel="preconnect" href="https://www.googletagmanager.com" />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-ads-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ADS_ID}');

            if (!window.__pacredAdsClickArmed) {
              window.__pacredAdsClickArmed = true;
              document.addEventListener('click', function(e) {
                var a = e.target && e.target.closest && e.target.closest('a');
                if (!a) return;
                var href = a.getAttribute('href') || '';
                var isPhone = href.indexOf('tel:') === 0;
                var isLine  = href === '/line' || href.indexOf('line.me') >= 0 || href.indexOf('lin.ee') >= 0;
                if (isPhone || isLine) {
                  gtag('event', 'conversion', {
                    send_to: '${GOOGLE_ADS_ID}',
                    cta_type: isPhone ? 'phone' : 'line',
                  });
                }
              }, true);
            }
          `,
        }}
      />
    </>
  );
}
