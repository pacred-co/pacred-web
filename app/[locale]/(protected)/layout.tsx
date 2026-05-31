import Script from "next/script";
import { requireAuth } from "@/lib/auth/require-auth";
import { ImpersonationBanner } from "@/components/sections/impersonation-banner";
import { loadPcsChromeData } from "@/lib/legacy/pcs-chrome";
import { PcsBodyClass } from "@/components/legacy/pcs-body-class";
import { PcsLeftMenu } from "@/components/legacy/pcs-left-menu";
import { PcsSidebarToggle } from "@/components/legacy/pcs-sidebar-toggle";
import { PcsFooterNav } from "@/components/legacy/pcs-footer-nav";
import { PcsChromeInit } from "@/components/legacy/pcs-chrome-init";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { FloatingTabs } from "@/components/sections/floating-tabs";
import { NotifyPopup } from "./_notify-popup/notify-popup";

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
 * ⚠️ 2026-05-24 (ปอน) — legacy CSS bundle SLASHED.
 *
 * The full 21-stylesheet Modern-Admin theme bundle leaked unscoped rules
 * (Bootstrap `.hidden`/`.sticky`, `nav { display:block }`, `body { padding-top }`,
 * etc.) that broke the public-site chrome (NavBar/SearchBar/FloatingTabs) on
 * every protected page. Per ปอน: stop patching legacy CSS overrides, just
 * remove the leaking stylesheets entirely — chrome must render Tailwind-pure.
 *
 * What we KEEP:
 *  - Icon fonts (feather + Font Awesome + simple-line-icons) — used by legacy
 *    inside-content markup; safe because they only add @font-face + `.fa-*`
 *    classes that don't collide with Tailwind.
 *  - Sidebar layout sheet (`vertical-menu-modern.css`) — scopes to
 *    `.main-menu` only, doesn't leak.
 *  - Plugin CSS (sweetalert, animate, magnific-popup, intl-tel-input, slick)
 *    — plugin-scoped class names.
 *  - `legacy-overrides.css` — our own overrides.
 *  - Per-screen sheets (`menu.css`, `shops.css`, etc.) — each is scoped to a
 *    `.pcs-legacy-scoped` wrapper its page sets up.
 *
 * What we DROP:
 *  - bootstrap.min.css, bootstrap-extended.min.css, vendors.min.css
 *  - colors.min.css, components.min.css, palette-gradient.css
 *  - style.css, custom.css, custom-2023*.css, pcs-group/custom*.css
 *  These rules generated all the `.hidden`/`.sticky`/grid/typography
 *  collisions. Inside-content Bootstrap markup (.card / .col-md-* / .row /
 *  .progress) will render unstyled until each page is migrated to Tailwind,
 *  but every link/form/function still works (ปอน's "relations must stay"
 *  rule is preserved — markup + hrefs + Server Actions are untouched).
 */
const CSS_BUNDLE: string[] = [
  `${PCS}/css/core/menu/menu-types/vertical-menu-modern.css`,
  `${PCS}/plugins/animate/animate.min.css`,
  `${PCS}/plugins/sweetalert/css/sweetalert2.min.css`,
  `${PCS}/fonts/feather/style.min.css`,
  `${PCS}/plugins/magnific-popup/dist/magnific-popup.css`,
  `${PCS}/fonts/simple-line-icons/style.css`,
  // DataTables core + responsive (mobile-fix per Agent C audit 2026-05-20 ค่ำ —
  // without the responsive CSS, /service-order's 7-column #myTable horizontal-
  // scrolls on phones because the `dtr-inline` collapse rules are dead).
  `${PCS}/plugins/datatables/css/dataTables.bootstrap4.css`,
  `${PCS}/plugins/datatables/css/responsive.dataTables.min.css`,
  "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.css",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css",
  `${PCS}/plugins/slick/slick.css`,
  `${PCS}/plugins/slick/slick-theme.css`,
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
  // Sprint-5 theme — Pacred brand-token swap, loaded LAST so every
  // per-screen sheet (search.css btn-main gradient, payment.css btn-main
  // gradient, etc.) is overridden by the canonical podeng #B30000 +
  // semantic palette. Scoped to `.pcs-legacy` so public marketing is
  // unaffected.
  `/legacy/pcs/legacy-brand-tokens.css`,
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
  // headroom.min.js — Modern-Admin theme's `app.min.js` calls
  // `$(...).headroom()` on the navbar at init; legacy PCS loaded the plugin
  // inline on each member page, but the bundle list never picked it up. The
  // plugin file ships with the staged assets at `assets/js/ui/headroom.min.js`
  // so wiring it in before app-menu fixes the "$(...).headroom is not a
  // function" runtime error without touching legacy markup.
  `${PCS}/js/ui/headroom.min.js`,
  `${PCS}/js/core/app-menu.min.js`,
  `${PCS}/js/core/app.min.js`,
  `${PCS}/js/tam-it.js`,
  `${PCS}/js/js.cookie.js`,
  `${PCS}/plugins/sweetalert/js/sweetalert2.all.min.js`,
  `${PCS}/plugins/sweetalert/js/polyfill.min.js`,
  `${PCS}/plugins/magnific-popup/dist/jquery.magnific-popup.min.js`,
  `${PCS}/plugins/magnific-popup/meg.init.js`,
  // DataTables JS + responsive plugin (mobile-fix per Agent C audit 2026-05-20 ค่ำ).
  `${PCS}/plugins/datatables.net/js/jquery.dataTables.min.js`,
  `${PCS}/plugins/datatables/js/dataTables.responsive.min.js`,
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

      {/* 2. Legacy <body class="vertical-layout vertical-menu-modern …">
            — needed for the Modern-Admin sidebar (`PcsLeftMenu`) and the
            desktop right-rail (`PcsFooterNav` → `.nav-right-pcs`) which the
            theme CSS only positions correctly when the body carries those
            classes. The unwanted `margin-left: 240px` push on `.app-content`
            is undone in `legacy-overrides.css` §0. */}
      <PcsBodyClass />

      {/* 3. Modern Pacred top chrome — replaces legacy PcsTopMenu.
            NavBar already knows auth state (reads Supabase from the client)
            and SearchBar is the same component the public home renders. */}
      <NavBar />
      <SearchBar />

      {/* 4. Legacy left sidebar — kept per ปอน 2026-05-23 (the "แถบซ้าย"). */}
      <PcsLeftMenu data={chrome} />
      <PcsSidebarToggle />

      {/* 5. The per-screen `.app-content` body. */}
      {children}

      {/* Customer login-popup announcement — faithful port of all-script.php's
          tb_notify popup (reaches all migrated customers via tb_notify /
          tb_notify_read). Renders nothing when there's no unread, in-window
          announcement. */}
      <NotifyPopup memberCode={memberCode} />

      {/* 6. Legacy right rail (`.nav-right-pcs`) — kept per ปอน 2026-05-23.
            The bundled legacy mobile bottom-nav `.nav-footer-pcs` is hidden
            in `legacy-overrides.css` §0 because <FloatingTabs /> from the
            marketing site fills that slot. */}
      <PcsFooterNav data={chrome} />

      <ImpersonationBanner />

      {/* Mobile bottom nav + floating LINE bubble — same chrome as the public
          site. Restored on protected per user 2026-05-26 (the FloatingTabs gate
          to (public)-only on 2026-05-25 left the customer back-office with no
          mobile bottom nav since the legacy `.nav-footer-pcs` is hidden in
          legacy-overrides.css §0). Auto-hides itself on /admin /login /register
          /forgot-password via its own isHidden check, so adding it here is safe. */}
      <FloatingTabs payDueCount={chrome.countPaymentDue} />

      {/* 7. Legacy JS bundle — rendered last so the full chrome DOM exists
            when it runs. jQuery → Popper → Bootstrap-4 (vendors.min.js) → the
            Modern-Admin theme JS → SweetAlert → Magnific-Popup, in exact
            all-script.php order.

            ⚠️ 2026-05-28 — DO NOT render each entry as its own <Script>.
            `next/script strategy="afterInteractive"` inserts each script
            independently after hydration and the browser races them — the
            smaller files (tam-it.js 8KB / app.min.js 17KB / meg.init.js)
            finish + execute before vendors.min.js (537KB, contains jQuery
            3.4.1) is done, so the dependent scripts hit
              tam-it.js:21 Uncaught ReferenceError: $ is not defined
              app.min.js:292 Uncaught ReferenceError: jQuery is not defined
              meg.init.js:2 Uncaught ReferenceError: $ is not defined
              jquery.magnific-popup.min.js:4 Uncaught TypeError: a is not a function
              app-menu.min.js:505 Uncaught ReferenceError: jQuery is not defined
            (the team comment that said scripts in the same strategy execute
             in render order was wrong — they don't).

            Fix: one inline loader that creates <script> elements with
            `async = false`. Per HTML spec, JS-injected scripts with
            async=false are added to the "in-order" list and execute in
            DOM-insertion order — the same pattern jQuery's own CDN loader
            uses. basePath is set inside the same loader so it's defined
            before any src executes. */}
      {/* basePath = the legacy asset root. Legacy `app.min.js` L295-301 does
          `$.getScript(basePath+"assets/js/lang/X.js")` at runtime, so basePath
          must resolve to `/legacy/pcs/` (not `/`) — otherwise the language
          string-table 404s. The legacy PHP set basePath="/member/" because that
          was BOTH the route base AND the asset base; in the Next.js port the
          two are different (`/` for routes, `/legacy/pcs/` for staged assets),
          and the runtime JS only consumes basePath for ASSETS — so the asset
          root is the correct value. App-route links are hardcoded in JSX. */}
      <Script
        id="legacy-js-bundle-loader"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            var basePath = '/legacy/pcs/';
            (function () {
              var sources = ${JSON.stringify(JS_BUNDLE)};
              sources.forEach(function (src) {
                if (document.querySelector('script[data-legacy-src="' + src + '"]')) return;
                var s = document.createElement('script');
                s.src = src;
                s.async = false;
                s.setAttribute('data-legacy-src', src);
                document.head.appendChild(s);
              });
            })();
          `,
        }}
      />

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
