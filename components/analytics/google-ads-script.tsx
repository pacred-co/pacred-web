import Script from "next/script";

const GOOGLE_ADS_ID = "AW-17941254120";

/**
 * Google Ads conversion tag for the customs-clearance landing page (per ปอน
 * 2026-05-20 — paid traffic points at this page, conversions need to fire on
 * phone-tap + LINE-tap).
 *
 * Loads `gtag.js`, configures the AW- account, and installs a single click
 * delegation listener that fires `event: conversion` when the user taps:
 *   - any `<a href="tel:…">` (phone CTA)
 *   - any `<a href="/line">` or LINE-URL anchor
 *
 * Centralising via delegation means new phone/LINE buttons on the page get
 * tracked automatically — no per-button wiring + no need to make the page a
 * Client Component.
 */
export function GoogleAdsScript() {
  return (
    <>
      <link rel="preconnect" href="https://www.googletagmanager.com" />
      <Script
        id="google-ads-gtag"
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

            // Fire conversion on phone (tel:) + LINE link clicks. Use capture
            // phase so the event lands even if a child element's handler calls
            // stopPropagation. Idempotent: re-arming on re-mount is harmless
            // because the listener key is the same anonymous function — but
            // we still gate with a window flag to be safe.
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
