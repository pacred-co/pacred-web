import { requireAuth } from "@/lib/auth/require-auth";
import { ImpersonationBanner } from "@/components/sections/impersonation-banner";
import { loadPcsChromeData } from "@/lib/legacy/pcs-chrome";
import { PcsBodyClass } from "@/components/legacy/pcs-body-class";
import { PcsTopMenu } from "@/components/legacy/pcs-top-menu";
import { PcsLeftMenu } from "@/components/legacy/pcs-left-menu";
import { PcsFooterNav } from "@/components/legacy/pcs-footer-nav";
import { PcsChromeInit } from "@/components/legacy/pcs-chrome-init";

/**
 * Layout for the (protected) customer portal — the D1 faithful PCS Cargo port.
 *
 * This layout IS the legacy PCS Cargo page shell. Every legacy `member/*.php`
 * screen is `header.php` + `header-theme.php` (→ `top-menu.php` + `left-menu.php`)
 * + the per-screen body + `all-script.php`. In the port that shared shell lives
 * here, once, and each `page.tsx` is just the per-screen `.app-content` body.
 *
 * Rendered, in legacy `<body>` order:
 *   1. the Modern-Admin Bootstrap-4 theme CSS bundle — the EXACT 21 stylesheets
 *      `member/include/header.php` loads (incl. the `custom-mobile-2023` /
 *      `custom-tablet-2023` / `pcs-group/custom-mobile` responsive layers, so
 *      the mobile + desktop layouts both render 1:1). Staged verbatim under
 *      `public/legacy/pcs/assets/`.
 *   2. `<PcsBodyClass>` — the legacy `<body class="vertical-layout …">`.
 *   3. `<PcsTopMenu>` — the fixed red navbar (`top-menu.php`).
 *   4. `<PcsLeftMenu>` — the accordion sidebar (`left-menu.php`).
 *   5. `{children}` — the per-screen `.app-content` body.
 *   6. `<PcsFooterNav>` — footer + mobile bottom-nav + right rail (`all-script.php`).
 *   7. the legacy JS bundle — jQuery + Popper + Bootstrap-4 + the Modern-Admin
 *      theme JS + SweetAlert + Magnific-Popup, in the exact `all-script.php`
 *      order (rendered last, so the full chrome DOM exists when it runs).
 *
 * Auth: `requireAuth()` → /login if signed-out, /complete-profile if the
 * profile is incomplete.
 *
 * ── Strict 1:1 — TOS modal does NOT auto-pop ───────────────────────────────
 * The legacy `<div id="pcs-terms-of-service">` modal exists in
 * `member/include/all-script.php`'s markup, but the JS line that would open
 * it (`//$("#pcs-terms-of-service").modal("show");`) is COMMENTED OUT — the
 * legacy portal NEVER auto-pops a TOS modal. Per the owner's "copy 100% first"
 * rule we do not auto-pop one either. The Pacred `TosGate` (a legal-consent
 * gate added pre-1:1) is removed from this layout. If a legal-consent gate is
 * needed later, that's a separate Phase-C feature, not part of the faithful port.
 */
export const dynamic = "force-dynamic";

/** Legacy basePath."assets" — the staged Modern-Admin theme bundle root. */
const PCS = "/legacy/pcs/assets";

/**
 * The legacy `member/include/header.php` CSS bundle (L158-182), in load order.
 * Two entries stay on their original CDN — the legacy portal loads them from
 * the CDN too, so the faithful reproduction is the same CDN `<link>`.
 */
const CSS_BUNDLE: string[] = [
  `${PCS}/css/vendors.min.css`,
  `${PCS}/css/bootstrap.min.css`,
  `${PCS}/css/bootstrap-extended.min.css`,
  `${PCS}/css/colors.min.css`,
  `${PCS}/css/components.min.css`,
  `${PCS}/css/core/menu/menu-types/vertical-menu-modern.css`,
  `${PCS}/css/core/colors/palette-gradient.css`,
  `${PCS}/plugins/animate/animate.min.css`,
  `${PCS}/plugins/sweetalert/css/sweetalert2.min.css`,
  `${PCS}/fonts/feather/style.min.css`,
  `${PCS}/plugins/magnific-popup/dist/magnific-popup.css`,
  `${PCS}/fonts/simple-line-icons/style.css`,
  "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.css",
  // Bumped from legacy 5.9.0 → 5.15.4 (last FA5 release) — needed for the
  // Pacred-added `fa-tiktok` topbar icon (TikTok was added in FA 5.11.2).
  // All FA5.9-era glyph names (fa-line, fa-facebook, fa-youtube, fa-instagram)
  // remain backward-compatible. Same CDN, same `fab` class convention.
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css",
  `${PCS}/css/style.css`,
  `${PCS}/css/custom.css`,
  `${PCS}/css/custom-2023.css`,
  `${PCS}/css/custom-tablet-2023.css`,
  `${PCS}/css/custom-mobile-2023.css`,
  `${PCS}/css/pcs-group/custom.css`,
  `${PCS}/css/pcs-group/custom-tablet.css`,
  `${PCS}/css/pcs-group/custom-mobile.css`,
  // Last-loaded scoped overrides for Tailwind v4 preflight resets
  // (.card / .img-fluid / h1-h6 baselines + the carousel slick-init
  // pre-load max-height). Scoped to body.pcs-legacy-body — see 4b.2 in
  // docs/podeng-handoff.md for the diagnostic notes.
  `/legacy/pcs/legacy-overrides.css`,
  // ── Per-screen legacy stylesheets loaded GLOBALLY — owner directive
  //    2026-05-22: the inline <link> per page was causing a known
  //    React-19 client-nav bug where the stylesheet was dropped from
  //    the <head> after a popstate (browser back button) → next paint
  //    of the previous page rendered unstyled (everything ballooned,
  //    headings huge, grid collapsed). The user described it as
  //    "ทุกอย่างกลับไปเบี้ยว กลับไปบวมทุกอย่างเลย" after going back.
  //    Each file is .pcs-legacy-scoped already (or `.print-*-overlay`
  //    scoped for the print sheets), so loading them on every protected
  //    route is safe — selectors only match when a screen renders the
  //    matching wrapper className. Loading once + persisting across
  //    client-side nav eliminates the unmount/remount of stylesheets.
  `/legacy/pcs/menu.css`,
  `/legacy/pcs/shops.css`,
  `/legacy/pcs/service-import.css`,
  `/legacy/pcs/forwarder-table.css`,
  `/legacy/pcs/payment.css`,
  `/legacy/pcs/cart.css`,
  `/legacy/pcs/wallet.css`,
  `/legacy/pcs/address.css`,
  `/legacy/pcs/china-address.css`,
  `/legacy/pcs/account-settings.css`,
  `/legacy/pcs/profile.css`,
  `/legacy/pcs/search.css`,
  `/legacy/pcs/pay.css`,
  `/legacy/pcs/report-user-sales.css`,
  `/legacy/pcs/receipt-f-hs.css`,
  `/legacy/pcs/index.css`,
  // NOTE — print-shop.css / print-receipt-f.css / print-overlay.css are
  // INTENTIONALLY NOT in this global bundle. Each contains an `@page`
  // rule that defines the printed-paper margin, and `@page` is GLOBAL
  // — loading them on every protected page would force the @page margin
  // on Ctrl+P of any page (e.g. /wallet's print → @page{margin:0} from
  // print-overlay.css). Keep them as inline <link> in the print pages
  // themselves so the @page rule only applies on those routes.
];

/** The legacy `member/include/all-script.php` JS bundle (L85-96), in order. */
const JS_BUNDLE: string[] = [
  `${PCS}/js/vendors/js/vendors.min.js`,
  `${PCS}/js/core/app-menu.min.js`,
  `${PCS}/js/core/app.min.js`,
  `${PCS}/js/tam-it.js`,
  `${PCS}/js/js.cookie.js`,
  `${PCS}/plugins/sweetalert/js/sweetalert2.all.min.js`,
  `${PCS}/plugins/sweetalert/js/polyfill.min.js`,
  `${PCS}/plugins/magnific-popup/dist/jquery.magnific-popup.min.js`,
  `${PCS}/plugins/magnific-popup/meg.init.js`,
];

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();
  const memberCode = profile?.member_code ?? "";

  // The legacy header.php / chrome data — every SELECT the includes run.
  const chrome = await loadPcsChromeData(memberCode);

  return (
    <>
      {/* 1. Legacy <head> — the Modern-Admin BS4 theme CSS bundle + Prompt font.
            React 19 hoists <link rel="stylesheet"> to <head> in render order. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css?family=Prompt&display=swap"
      />
      {CSS_BUNDLE.map((href) => (
        <link key={href} rel="stylesheet" type="text/css" href={href} />
      ))}

      {/* 2. Legacy <body class="vertical-layout vertical-menu-modern …"> */}
      <PcsBodyClass />

      {/* 3-4. Legacy chrome — the fixed navbar + the accordion sidebar. */}
      <PcsTopMenu data={chrome} />
      <PcsLeftMenu data={chrome} />

      {/* 5. The per-screen `.app-content` body. */}
      {children}

      {/* 6. Legacy footer + mobile bottom-nav + desktop right rail. */}
      <PcsFooterNav data={chrome} />

      <ImpersonationBanner />

      {/* 7. Legacy JS bundle — rendered last so the full chrome DOM exists when
            it runs. jQuery → Popper → Bootstrap-4 (vendors.min.js) → the
            Modern-Admin theme JS → SweetAlert → Magnific-Popup, in exact
            all-script.php order; `async={false}` keeps that order. */}
      {/* basePath = the legacy asset root. Legacy `app.min.js` L295-301 does
          `$.getScript(basePath+"assets/js/lang/X.js")` at runtime, so basePath
          must resolve to `/legacy/pcs/` (not `/`) — otherwise the language
          string-table 404s. The legacy PHP set basePath="/member/" because that
          was BOTH the route base AND the asset base; in the Next.js port the
          two are different (`/` for routes, `/legacy/pcs/` for staged assets),
          and the runtime JS only consumes basePath for ASSETS — so the asset
          root is the correct value. App-route links are hardcoded in JSX. */}
      <script dangerouslySetInnerHTML={{ __html: "var basePath='/legacy/pcs/';" }} />
      {JS_BUNDLE.map((src) => (
        <script key={src} src={src} async={false} />
      ))}

      {/* 8. Legacy chrome-init (post-hydration). Replays the two pieces of
            `all-script.php` L725-771 + `app.min.js` L239-273 that mutate the
            DOM after page load: the cookie-driven lang auto-load AND the
            active-nav highlight + accordion toggle. Runs inside a Client
            Component useEffect so it fires AFTER React 19 hydration (an
            earlier inline-script version ran BEFORE hydration → React
            reverted the jQuery mutations against the JSX text). */}
      <PcsChromeInit />
    </>
  );
}
