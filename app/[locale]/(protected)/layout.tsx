import { requireAuth } from "@/lib/auth/require-auth";
import { TosGate } from "@/components/tos-gate";
import { ImpersonationBanner } from "@/components/sections/impersonation-banner";
import { isTosCurrent } from "@/lib/tos";
import { getActiveTosVersion } from "@/lib/tos-server";
import { loadPcsChromeData } from "@/lib/legacy/pcs-chrome";
import { PcsBodyClass } from "@/components/legacy/pcs-body-class";
import { PcsTopMenu } from "@/components/legacy/pcs-top-menu";
import { PcsLeftMenu } from "@/components/legacy/pcs-left-menu";
import { PcsFooterNav } from "@/components/legacy/pcs-footer-nav";

/**
 * Layout for the (protected) customer portal — the D1 faithful PCS Cargo port.
 *
 * This layout IS the legacy PCS Cargo page shell. Every legacy `member/*.php`
 * screen is `header.php` + `header-theme.php` (→ `top-menu.php` + `left-menu.php`)
 * + the per-screen body + `all-script.php`. In the port that shared shell lives
 * here, once, and each `page.tsx` is just the per-screen `.app-content` body —
 * a 1:1 transcription of the runbook `docs/runbook/faithful-port-transcription.md`.
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
 * NOTE — `TosGate` is a Pacred compliance gate the legacy PCS portal lacked.
 * Kept for legal consent; strict-1:1 keep-vs-drop is a เดฟ/ก๊อต call (flagged
 * in `docs/runbook/faithful-port-plan.md`).
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
  // DataTables core + responsive (mobile-fix per Agent C audit 2026-05-20 ค่ำ —
  // without the responsive CSS, /service-order's 7-column #myTable horizontal-
  // scrolls on phones because the `dtr-inline` collapse rules are dead).
  `${PCS}/plugins/datatables/css/dataTables.bootstrap4.css`,
  `${PCS}/plugins/datatables/css/responsive.dataTables.min.css`,
  "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/css/intlTelInput.css",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.9.0/css/all.css",
  `${PCS}/css/style.css`,
  `${PCS}/css/custom.css`,
  `${PCS}/css/custom-2023.css`,
  `${PCS}/css/custom-tablet-2023.css`,
  `${PCS}/css/custom-mobile-2023.css`,
  `${PCS}/css/pcs-group/custom.css`,
  `${PCS}/css/pcs-group/custom-tablet.css`,
  `${PCS}/css/pcs-group/custom-mobile.css`,
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

  // Resolve the active TOS version from DB (hardcoded fallback; never throws).
  const activeTos = await getActiveTosVersion("all");
  const needsTosAccept =
    !!profile && !isTosCurrent(profile.tos_accepted_version, activeTos.version_no);

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
      {needsTosAccept && (
        <TosGate
          versionNo={activeTos.version_no}
          title={activeTos.title}
          bodyMd={activeTos.body_md}
        />
      )}

      {/* 7. Legacy JS bundle — rendered last so the full chrome DOM exists when
            it runs. jQuery → Popper → Bootstrap-4 (vendors.min.js) → the
            Modern-Admin theme JS → SweetAlert → Magnific-Popup, in exact
            all-script.php order; `async={false}` keeps that order. */}
      <script dangerouslySetInnerHTML={{ __html: "var basePath='/';" }} />
      {JS_BUNDLE.map((src) => (
        <script key={src} src={src} async={false} />
      ))}
    </>
  );
}
