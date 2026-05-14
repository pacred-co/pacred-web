/**
 * Sentry init for the Edge runtime (proxy.ts middleware + any
 * `runtime: "edge"` route handlers). Loaded by `instrumentation.ts`.
 *
 * DSN unset → no-op.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Same PII guard as server config — middleware sees every request,
    // so it's the highest-value place to strip cookies + auth headers
    // before they fly to Sentry.
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      return event;
    },
  });
}
