import { requireAuth } from "@/lib/auth/require-auth";

/**
 * Geolocation map screen — a FAITHFUL 1:1 TRANSCRIPTION of the legacy
 * PCS Cargo `member/map.php` (D1 / ADR-0017 · faithful-port
 * transcription · runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * ── What `map.php` is ────────────────────────────────────────
 * `member/map.php` is a STANDALONE full HTML document — it has NO
 * PHP `include`s, no `header.php` chrome, no auth code, no SQL. It
 * is the Google Maps "Geolocation" code sample (a Google LLC
 * sample, Apache-2.0) verbatim: a full-window `#map` div, the
 * Google Maps JS API `<script>` (with the legacy embed's API key),
 * an inline `<style>`, the `initMap()` geolocation logic, and a
 * "Pan to Current Location" control button.
 *
 * ── How it is transcribed (the map.php gotcha) ──────────────
 * The runbook's map.php rule: "reproduce the legacy embed verbatim
 * — keep the legacy map markup/script as-is; it is part of the
 * 1:1." A self-contained HTML document with a third-party
 * `<script>` does not transcribe cleanly into JSX without altering
 * it. So `map.php` is brought across as the STATIC file
 * `public/legacy/pcs/map.html` — the legacy document copied
 * byte-for-byte (the Google Maps `<script>`, the inline `<style>`,
 * `initMap()`, the polyfill — all unchanged) — and this Next.js
 * route embeds that static file in a full-viewport `<iframe>`. The
 * legacy map markup + script run exactly as they did in `map.php`.
 *
 * ── Route ───────────────────────────────────────────────────
 * The legacy path is `member/map.php` — a standalone utility
 * screen, not one of the `menu.php` launchpad's 9 icons and not
 * `include`d by any other `member/*.php`. It lands at
 * `/map` under the (protected) area — a customer-portal utility
 * screen, behind the same auth gate as the rest of the portal.
 *
 * ── Notes ───────────────────────────────────────────────────
 * - A Server Component render is a pure read (runbook §9.4);
 *   `map.php` has no mutations — nothing to defer.
 * - `requireAuth()` gates the screen (the legacy `member/` area is
 *   logged-in-only; `map.php` itself had no guard, but it lives
 *   under `member/`, so the portal auth gate is the faithful
 *   placement). `export const dynamic = "force-dynamic"` because
 *   the page reads auth/cookies.
 * - The Google Maps API key inside `map.html` is the EXACT key the
 *   legacy `map.php` embeds (member/map.php L63), carried over
 *   verbatim. Per the runbook the PCS→PR change is branding +
 *   member codes only; borrowed third-party keys are not scrubbed
 *   here — gated on ก๊อต (docs/runbook/pcs-scrub-plan.md). Flagged.
 * - `map.php` carries no `PCS` branding text, so the PCS→PR
 *   rebrand is a no-op — the static file is a literal verbatim copy.
 */

export const dynamic = "force-dynamic";

export default async function MapPage() {
  // The legacy map.php sits under member/ — logged-in-only. Gate it
  // with the portal auth chain (faithful placement of the screen).
  await requireAuth();

  // The legacy map.php IS a full-window document (its <style> sets
  // html,body { height:100% }). Reproduce that 1:1 with a
  // full-viewport iframe carrying the verbatim legacy embed.
  return (
    <iframe
      src="/legacy/pcs/map.html"
      title="Geolocation"
      // Geolocation must be allowed through to the iframe — map.php's
      // initMap() calls navigator.geolocation.getCurrentPosition().
      allow="geolocation"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
      }}
    />
  );
}
