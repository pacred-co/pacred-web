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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.doubleclick.net https://googleads.g.doubleclick.net https://hcaptcha.com https://*.hcaptcha.com https://www.clarity.ms https://*.clarity.ms https://connect.facebook.net https://*.facebook.net https://static.cloudflareinsights.com https://*.line-scdn.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://www.google.com https://hcaptcha.com https://*.hcaptcha.com https://www.youtube.com https://www.youtube-nocookie.com",
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
  images: {
    qualities: [75, 92],
  },

  /**
   * Server Actions used for file uploads (juristic register: ภพ20 +
   * ใบรับรองบริษัท + บัตรประชาชนกรรมการ — see actions/auth.ts
   * `uploadJuristicDoc`) need a body-size limit ABOVE the validator's
   * `MAX_SIZE` (10 MB).
   *
   * Next 16 default is 1 MB — silently rejected ~10 MB file uploads as
   * "stuck on click", which is exactly the 2026-05-25 prod symptom that
   * survived the requireGuest() + resume-flow fixes (P0 #2 + #3): no
   * documents in prod despite users completing Step 1–3. The action's
   * `if (file.size > MAX_SIZE)` check never runs because the platform
   * blocks the request body first.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
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
