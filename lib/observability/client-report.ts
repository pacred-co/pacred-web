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

const INGEST_URL = "/api/observability/incident";

/**
 * Fire-and-forget POST of a client render error to the ingest sink.
 * Returns a promise that always resolves (never rejects) so callers
 * can `void` it safely.
 */
export async function reportClientIncident(error: Error & { digest?: string }): Promise<void> {
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
