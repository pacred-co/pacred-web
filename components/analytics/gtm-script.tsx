import Script from "next/script";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

/**
 * Google Tag Manager container loader. Injects the inline bootstrap that
 * starts `dataLayer` and pulls the GTM script. Renders nothing when
 * NEXT_PUBLIC_GTM_ID is unset so dev / preview builds stay silent.
 *
 * Place inside the root `<head>` (Server Component).
 */
export function GtmScript() {
  if (!GTM_ID) return null;

  return (
    <Script
      id="gtm-init"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`,
      }}
    />
  );
}

/**
 * `<noscript>` fallback iframe for users with JS disabled. Recommended by
 * GTM for tag-firing coverage on no-JS clients. Place near the top of
 * `<body>`. Renders nothing when GTM is unconfigured.
 */
export function GtmNoscript() {
  if (!GTM_ID) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="gtm-noscript"
      />
    </noscript>
  );
}
