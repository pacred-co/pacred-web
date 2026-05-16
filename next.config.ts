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
      "frame-src 'self' https://www.google.com https://hcaptcha.com https://*.hcaptcha.com",
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
  disableLogger: true,
  automaticVercelMonitors: false,
};

export default withSentryConfig(withNextIntl(nextConfig), sentryBuildOptions);
