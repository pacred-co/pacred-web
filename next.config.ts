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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://hcaptcha.com https://*.hcaptcha.com",
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
  // Next 16 Server Actions default body limit = 1 MB. Admin file-upload forms
  // accept up to 5 MB images (cover photos · slip uploads · driver photos —
  // per per-form client-side validation), and phone-shot HEIC files routinely
  // land at 8-12 MB. Bumping to 10 MB matches what the storage helper allows
  // and prevents the silent "Body exceeded 1 MB limit" 500 ภูม hit on
  // /admin/forwarders/new (2026-05-27 · pre-existing config gap since
  // Wave 12-C built the cover-upload modal).
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
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
