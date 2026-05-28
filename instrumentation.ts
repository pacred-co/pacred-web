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
    // 🚨 Wave 24 bounce-loop root-cause fix (2026-05-27 ดึก):
    // Node 18+ defaults DNS resolution to `verbatim` order (IPv6 → IPv4),
    // which on Windows + some ISPs causes a 5-10 s race when AAAA resolves
    // but the IPv6 path stalls. Supabase prod (yzljakczhwrpbxflnmco.supabase.co)
    // was hitting 10 s ConnectTimeoutError sporadically → `auth.getUser()`
    // returned null → proxy.ts redirect /admin → /login → (auth) layout
    // requireGuest() saw real signed-in user → / (homepage bounce).
    // Forcing IPv4-first eliminates the race + dramatically reduces timeouts.
    // Net behaviour on systems that need IPv6: unchanged (we still try v6 if
    // v4 doesn't resolve — `ipv4first` orders the resolution, not exclusivity).
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");

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
