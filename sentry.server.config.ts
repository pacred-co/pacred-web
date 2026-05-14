/**
 * Sentry init for the Node.js runtime (Server Components, Route Handlers,
 * Server Actions). Loaded by `instrumentation.ts` register hook.
 *
 * DSN unset → no-op. Set `SENTRY_DSN` in production to activate.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,

    // Performance traces — 10% in prod (cost control), 100% in dev.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Don't auto-instrument every fetch — too noisy for our admin-heavy app.
    // Sentry's defaults already capture errors; we explicitly add traces
    // when needed via `Sentry.startSpan`.
    integrations: [],

    // Server stack frames — keep them. Source maps land later when
    // SENTRY_AUTH_TOKEN + build-time upload are configured.
    beforeSend(event) {
      // Strip any payload field that might carry PII. Defense in depth on
      // top of `lib/logger.ts` redact* helpers.
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });
}
