/**
 * Next 16 client (browser) instrumentation entry point.
 *
 * Initialises Sentry in the browser before React hydrates. DSN is
 * read from `NEXT_PUBLIC_SENTRY_DSN` — must be the public-prefixed
 * variant so it's inlined into the client bundle. When unset, init is
 * a no-op (safe for dev / pre-launch).
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,

    // Performance — sample 10% in prod, 100% in dev. Adjust later when traffic
    // shape is understood; cheap to start narrow + ratchet up.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Session replay — off by default (privacy + bundle size). Enable later
    // when needed for debugging customer-reported bugs.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Don't capture noise from third-party browser extensions.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],
  });
}

// Required by Next 16: lets Sentry attach navigation breadcrumbs to events.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
