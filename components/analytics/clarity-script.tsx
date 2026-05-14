import Script from "next/script";

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

/**
 * Microsoft Clarity tag loader. Provides heatmap, click recording, scroll
 * tracking, and session replay (free, no quota). Renders nothing when
 * NEXT_PUBLIC_CLARITY_ID is unset so dev / preview builds stay silent.
 *
 * Place inside the root `<head>` (Server Component). Pairs with GTM (L-22)
 * to give the landing pivot a complete picture: GTM = event funnel +
 * conversion attribution; Clarity = behavioural recordings showing where
 * customers struggle / abandon.
 *
 * Custom tagging via `clarityTag()` + `clarityEvent()` in `lib/analytics.ts`.
 */
export function ClarityScript() {
  if (!CLARITY_ID) return null;

  return (
    <>
      {/* Open TLS to Clarity origin ahead of the script download. */}
      <link rel="preconnect" href="https://www.clarity.ms" />
      <Script
        id="clarity-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_ID}");`,
        }}
      />
    </>
  );
}
