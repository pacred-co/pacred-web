import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { Link } from "@/i18n/navigation";

/**
 * China warehouse receiving-address screen — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/china-address.php`
 * (D1 / ADR-0017 · faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `china-address.php` renders — same elements,
 * same Bootstrap-4 class names, same structure, same labels, same
 * order. The visual identity comes from the legacy CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/china-address.css`, loaded via a plain <link> so
 * it bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * `china-address.php` source structure transcribed here:
 *   include header.php (chrome) -> <title> -> include header-theme.php
 *   .app-content.content > .content-overlay
 *     + .content-wrapper
 *       > .content-header.row > .content-header-left.col-12.mb-2
 *           > .row.breadcrumbs-top > .breadcrumb-wrapper.col-12
 *             > ol.breadcrumb
 *                 li.breadcrumb-item        — <a> หน้าแรก
 *                 li.breadcrumb-item.active — ที่อยู่โกดังจีน
 *       > .content-body
 *           > section#basic-carousel
 *             > .row > .col-md-12.col-sm-12
 *               > .card
 *                   > .card-header  > <h3> ที่อยู่โกดังจีน
 *                   > .card-content > .card-body  (EMPTY in the legacy)
 *
 * Data — `china-address.php`'s OWN content body runs NO SQL: its
 * `card-body` is empty (china-address.php lines 35-37 are blank).
 * It is a placeholder screen. The only DB work in the legacy file is
 * inside its `include`s (header.php / header-theme.php) — the chrome
 * (top-menu + left-menu) — which, per the menu.php pilot's scope, is
 * NOT transcribed per-screen (the launchpad IS the navigation; the
 * (protected) layout renders no Pacred chrome either). So this screen
 * has no `tb_*` query of its own — faithful to the legacy file.
 *
 * Auth — `china-address.php`'s `header.php` redirects guests to
 * `login/`; here the (protected) layout's `requireAuth()` already
 * gates that, and `getCurrentUserWithProfile()` mirrors the legacy
 * "must be a logged-in member" check (redirect to /complete-profile
 * when the profile row is missing, as the menu.php pilot does).
 *
 * Rebrand DONE: legacy `PCS Cargo` brand -> Pacred (the
 * <title> branding); the legacy `basePath` home href -> Pacred `/`.
 * Nothing else.
 */

export const metadata: Metadata = {
  // china-address.php L4: <title>ที่อยู่โกดังจีน | PCS Cargo</title>
  // Rebrand PCS -> PR.
  title: "ที่อยู่โกดังจีน | Pacred",
};

export default async function ChinaAddressPage() {
  // Mirrors china-address.php's header.php logged-in-member gate.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — static public/ asset, loaded via a plain
          <link> so it bypasses the app's Tailwind/PostCSS pipeline. Kept
          per page even though the chrome below is now Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/china-address.css" />
      {/* BEGIN: Content — china-address.php L9.
          Tailwind rebuild (เดฟ 2026-05-30 — ปอน: "rebuild css เป็น tailwind
          mobile-first · ห้ามแก้ relation/href/logic"). Bootstrap-4 shell
          (.app-content > .content-wrapper > .content-body + .card chrome)
          → `.pcs-content-pad` wrapper + a Tailwind card. The legacy
          card-body stays EMPTY (china-address.php L35-37 — placeholder
          screen · no SQL · faithful 1:1). Breadcrumb hrefs unchanged. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* Breadcrumb — china-address.php L13-23 */}
        <nav aria-label="breadcrumb" className="mb-3 md:mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">
                หน้าแรก
              </Link>
            </li>
            <li aria-hidden className="text-border">/</li>
            <li className="font-medium text-foreground" aria-current="page">
              ที่อยู่โกดังจีน
            </li>
          </ol>
        </nav>

        {/* Card — china-address.php L26-39 (section#basic-carousel > .card) */}
        <section id="basic-carousel">
          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            <div className="border-b border-border px-4 py-3 md:px-5 md:py-4">
              <h3 className="text-base md:text-lg font-bold text-foreground">
                ที่อยู่โกดังจีน
              </h3>
            </div>
            {/* china-address.php L35-37: the legacy card-body is empty — a
                placeholder screen. Transcribed 1:1, including the empty
                body (no fields/links added). */}
            <div className="p-4 md:p-5"></div>
          </div>
        </section>
      </div>
      {/* END: Content */}
    </div>
  );
}
