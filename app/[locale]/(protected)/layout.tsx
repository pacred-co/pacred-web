import Script from "next/script";
import { requireAuth } from "@/lib/auth/require-auth";
import { TosGate } from "@/components/tos-gate";
import { ImpersonationBanner } from "@/components/sections/impersonation-banner";
import { isTosCurrent } from "@/lib/tos";
import { getActiveTosVersion } from "@/lib/tos-server";

/**
 * Layout for routes under (protected) — the D1 faithful-port customer portal.
 *
 * MINIMAL wrapper by design (owner's 1:1 directive). It does the auth gate +
 * the TOS gate, loads the legacy PCS vendor JS/CSS, then renders the screen —
 * and NOTHING else. The Pacred app chrome (NavBar · the protected sidebar /
 * mobile bottom-nav · the floating action menu) is intentionally NOT rendered:
 * every customer screen here is a 1:1 transcription of a legacy PCS
 * `member/*.php` page and carries the legacy chrome itself — the `menu.php`
 * launchpad IS the navigation. Pacred chrome layered on top would double the
 * nav and break the 1:1 fidelity.
 *
 * ── Legacy vendor JS/CSS (D1 1:1 interactivity) ──────────────────────
 * The transcribed screens reproduce the legacy Bootstrap-4 markup verbatim
 * (`data-toggle="modal"` modals, tabs, dropdowns, collapse). Those need the
 * legacy jQuery + Popper + Bootstrap-4 JS to be live, so this layout loads
 * them once, here, for EVERY `(protected)` screen:
 *
 *   - `vendors.min.js` — the EXACT bundle the legacy `member/include/header.php`
 *     loads (`assets/js/vendors/js/vendors.min.js`). One concatenated file, in
 *     order: jQuery v3.4.1 → Popper.js → Bootstrap v4.3.1. Loaded via
 *     `next/script` with `strategy="afterInteractive"`. Bootstrap-4 JS
 *     auto-wires every `[data-toggle]` document-wide on load, so the
 *     statically-rendered legacy markup becomes interactive 1:1 — no
 *     per-screen JS. The file is staged at the path below; until the
 *     integrator copies it (see `public/legacy/pcs/vendor/VENDOR-COPY-MANIFEST.md`)
 *     the request 404s harmlessly — pages still render, just without the
 *     legacy interactivity (the pre-this-change state).
 *   - FontAwesome — the legacy portal itself loads FA Free 5.9.0 from a CDN
 *     (`header.php` L173), it ships no local copy. The faithful reproduction
 *     of the legacy behaviour is therefore the SAME CDN `<link>`, rendered
 *     below. Icon classes (`fa fa-map`, …) in the transcribed markup resolve
 *     against it.
 *
 * DataTables (the legacy `#myTable` lists) is intentionally NOT initialised
 * here — the legacy inits it per-screen with per-table options. The library
 * is staged under `vendor/datatables/` for a per-screen 1:1 follow-up; see
 * the copy manifest.
 *
 * Redirects (via requireAuth): → /login if not signed in · → /complete-profile
 * if signed in but the profile is incomplete.
 *
 * NOTE — `TosGate` is a Pacred-added compliance gate the legacy PCS portal did
 * not have. It is kept for legal consent; whether strict 1:1 should drop it is
 * a เดฟ/ก๊อต call (flagged in the faithful-port plan).
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();

  // Resolve the active TOS version from DB (hardcoded fallback; never throws).
  const activeTos = await getActiveTosVersion("all");
  const needsTosAccept =
    !!profile && !isTosCurrent(profile.tos_accepted_version, activeTos.version_no);

  return (
    <>
      {/* Legacy PCS FontAwesome — the legacy customer portal loads FA Free
          5.9.0 from this exact CDN URL (member/include/header.php L173); it
          ships no local FA. Reproducing the legacy CDN <link> verbatim IS the
          faithful 1:1 (the legacy itself uses the CDN). */}
      <link
        rel="stylesheet"
        type="text/css"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.9.0/css/all.css"
      />
      {/* Legacy PCS vendor JS — the verbatim bundle the legacy header.php
          loads: jQuery v3.4.1 → Popper.js → Bootstrap v4.3.1, concatenated
          in that order in one file. afterInteractive = loads right after the
          page is interactive; Bootstrap-4 then auto-wires every [data-toggle]
          document-wide, so the transcribed legacy modals / tabs / dropdowns /
          collapse work 1:1 on the statically-rendered markup. */}
      <Script
        src="/legacy/pcs/vendor/js/vendors.min.js"
        strategy="afterInteractive"
      />
      <ImpersonationBanner />
      {children}
      {needsTosAccept && (
        <TosGate
          versionNo={activeTos.version_no}
          title={activeTos.title}
          bodyMd={activeTos.body_md}
        />
      )}
    </>
  );
}
