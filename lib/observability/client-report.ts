/**
 * IO-1 client-side error reporter — the "no submit button" mechanic
 * (design doc §6.3).
 *
 * Imported ONLY by client error boundaries (app/global-error.tsx,
 * app/[locale]/error.tsx). On a caught render error the boundary calls
 * reportClientIncident() in a useEffect — the error is POSTed to the
 * ingest sink before the user could have found a button.
 *
 * Best-effort by contract: a failed report MUST NOT break the fallback
 * UI. Every path is wrapped; failures are swallowed (the boundary still
 * renders the friendly screen). `keepalive` lets the POST survive a
 * navigation away from the errored page.
 *
 * NOT server-only — this is the one observability module that runs in
 * the browser. It imports no server code.
 */

import { isTransientAbortError, isChunkLoadError } from "./is-transient-abort";

const INGEST_URL = "/api/observability/incident";

/**
 * Fire-and-forget POST of a client render error to the ingest sink.
 * Returns a promise that always resolves (never rejects) so callers
 * can `void` it safely.
 *
 * Genuine transient navigation-abort / network-cancel errors are SKIPPED
 * (not a bug — the user navigated away / backgrounded the tab / lost
 * signal and an in-flight Server-Action or RSC fetch was cancelled).
 * These are stack-less "Load failed" / "Failed to fetch" / "Connection
 * closed." shapes that otherwise flood /admin/incidents with
 * unactionable rows. Chunk-load / dynamic-import failures (deploy churn —
 * a stale tab referencing a superseded deployment's chunk, often with a
 * `?dpl=` query) are ALSO skipped here; the error boundaries auto-heal
 * them with a guarded one-time reload. The friendly fallback UI still
 * renders (the caller — the error boundary — is unaffected); only the
 * report POST is suppressed. See lib/observability/is-transient-abort.ts
 * for the tightly-scoped allow-lists — a real error is never suppressed.
 */
export async function reportClientIncident(error: Error & { digest?: string }): Promise<void> {
  // Skip pure transient aborts + deploy-churn chunk-load errors — not incidents.
  if (isTransientAbortError(error) || isChunkLoadError(error)) return;

  try {
    // Route — best-effort from the browser location. The server
    // re-normalises it for the fingerprint.
    const route =
      typeof window !== "undefined" ? window.location?.pathname ?? "" : "";

    const meta: Record<string, unknown> = {};
    if (error.digest) meta.digest = error.digest;
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      // userAgent is not PII — useful for "only fails on Safari" triage.
      meta.userAgent = navigator.userAgent.slice(0, 256);
    }

    const body = JSON.stringify({
      kind:    "js_error",
      message: (error.message || error.name || "Client render error").slice(0, 4000),
      stack:   error.stack ? error.stack.slice(0, 8000) : undefined,
      route,
      meta,
    });

    await fetch(INGEST_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Survive a navigation away from the errored page.
      keepalive: true,
    });
  } catch {
    // Swallow — a failed report must never break the fallback UI.
    // Sentry (when its DSN is set) is the independent backstop.
  }
}
