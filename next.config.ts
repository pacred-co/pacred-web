import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import path from "path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Security headers applied to every response.
 *
 * Defense-in-depth — Next.js + Supabase + react-pdf already have strong
 * defaults; these are the "should have for production" layer per OWASP.
 *
 * CSP uses 'unsafe-inline' for styles/scripts because Next.js inlines
 * many runtime hints and Tailwind v4 injects styles. Tightening this
 * (nonces / hashes) is a Phase H2 task — not blocking launch.
 */
const SECURITY_HEADERS = [
  {
    key:   "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key:   "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key:   "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key:   "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key:   "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), interest-cohort=()",
  },
  {
    key:   "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Analytics / ads pixels — keep this list in sync with the env-driven
      // tracking pixels wired into <head> (Google Ads, GA4, Meta Pixel, MS
      // Clarity, Cloudflare beacon, LINE Tag). Missing entries flood the
      // browser console with CSP violations even though the page still works.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.doubleclick.net https://googleads.g.doubleclick.net https://hcaptcha.com https://*.hcaptcha.com https://www.clarity.ms https://*.clarity.ms https://connect.facebook.net https://*.facebook.net https://static.cloudflareinsights.com https://*.line-scdn.net https://translate.google.com https://translate.googleapis.com",
      // Legacy `member/include/header.php` references external stylesheets
      // from Google Fonts (Prompt) + cdnjs (intl-tel-input + font-awesome
      // icons). The protected-portal layout still <link>s them — until
      // those references are removed (Phase C polish, post-1:1), allow
      // their origins here so the browser stops console-spamming with
      // CSP violations on every protected page.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob: https:",
      // fonts.gstatic.com — Google Fonts serves CSS from googleapis but
      // the actual woff/woff2 font files come from gstatic. translate.googleapis.com
      // serves the Google Translate widget's font assets.
      "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "connect-src 'self' https: wss:",
      // *.supabase.co — admin doc review (juristic หนังสือรับรอง / ภพ20 /
      // บัตรประชาชน) embeds the PDF signed URLs from Supabase Storage in an
      // <iframe>. Without this, frame-src blocked the PDFs ("This content is
      // blocked") — only image docs rendered (img-src already allows https:).
      "frame-src 'self' https://www.google.com https://hcaptcha.com https://*.hcaptcha.com https://www.youtube.com https://www.youtube-nocookie.com https://*.supabase.co",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  /**
   * Server Actions default body limit (Next 16) = 1 MB.
   *
   * Bumped to 12 MB to cover ALL upload paths:
   *   - Admin file-upload forms — cover photos · slip uploads · driver
   *     photos. Per-form client-side validation caps at 5 MB but phone-
   *     shot HEIC files routinely land at 8-12 MB. Fixed the silent
   *     "Body exceeded 1 MB limit" 500 ภูม hit on /admin/forwarders/new
   *     (2026-05-27 Wave 23 P0 · pre-existing config gap since Wave 12-C
   *     built the cover-upload modal).
   *   - Juristic register Step-3 uploads — ภพ20 + ใบรับรองบริษัท +
   *     บัตรประชาชนกรรมการ (validator MAX_SIZE = 10 MB · see
   *     actions/auth.ts `uploadJuristicDoc`). Without this limit, the
   *     request body is blocked at the platform layer BEFORE the action
   *     even runs — looked like "stuck on click" in prod (2026-05-25
   *     P0 #4 survived the requireGuest() + resume-flow fixes).
   *
   * 12 MB chosen so both upload caps (5 MB + 10 MB) have safety margin
   * for multipart overhead.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  images: {
    // Quality values used across the codebase: 75 (default thumbs · table avatars),
    // 92 (hi-res shop covers · forwarder thumbs), 95 (marketing banners · office
    // photos), 100 (hero banner desktop · pristine source). Next 16 dev overlay
    // throws an Issue per <Image quality={N}> where N isn't in this allowlist —
    // so keep all 4 values listed even if some are only used by 1-2 components.
    qualities: [75, 92, 95, 100],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

/**
 * Sentry build wrapper.
 *
 * Active only when SENTRY_DSN is set — in dev / pre-launch this is a
 * passthrough. Source map upload requires SENTRY_AUTH_TOKEN +
 * SENTRY_ORG + SENTRY_PROJECT (set in Vercel later for production
 * stack-trace symbolication). Until then, errors still arrive at
 * Sentry but stacks point at minified output.
 *
 * Tunnel route bypasses ad-blockers that block requests to *.sentry.io.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
const sentryBuildOptions = {
  org:    process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/api/monitoring",
  // Sentry deprecated `disableLogger` and `automaticVercelMonitors` as
  // top-level options 2026-05-21; both now live under `webpack`.
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
};

/**
 * Sprint-8 perf — gate the Sentry build-time plugin behind the DSN.
 *
 * `withSentryConfig` is what injects the ~474 KB `@sentry/nextjs` client
 * SDK into the customer's main JS chunk. Without a DSN there's nothing
 * for it to do, so skipping the wrapper when `NEXT_PUBLIC_SENTRY_DSN`
 * is unset at build time removes the SDK from the bundle entirely.
 *
 * Setting `NEXT_PUBLIC_SENTRY_DSN` on Vercel re-enables Sentry on the
 * next build — instrumentation, source-map upload, and the tunnel
 * route at `/api/monitoring` all come back automatically.
 */
const baseConfig = withNextIntl(nextConfig);

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(baseConfig, sentryBuildOptions)
  : baseConfig;
