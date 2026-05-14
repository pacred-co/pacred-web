/**
 * Next 16 server instrumentation entry point.
 *
 * Pacred uses this to wire Sentry on Node + Edge runtimes. The DSN is
 * intentionally optional — when `SENTRY_DSN` is unset (dev / pre-launch),
 * `Sentry.init` is a no-op so nothing breaks. Drop the env var in prod
 * and error tracking activates with no code change.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Forwards every server error caught by Next's runtime to Sentry. This
 * captures errors thrown in Server Components, Route Handlers, and
 * Server Actions even when our `lib/logger.ts` `logger.error()` is not
 * called explicitly.
 */
export const onRequestError = Sentry.captureRequestError;
