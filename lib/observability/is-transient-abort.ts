/**
 * IO-1 — transient navigation-abort / network-cancel classifier.
 *
 * The client error boundaries (app/[locale]/error.tsx +
 * app/global-error.tsx) auto-report EVERY caught render error to the
 * incident board. But a large class of caught errors are NOT bugs — they
 * are a fetch that was cancelled because the user navigated away, put the
 * tab in the background, lost signal for a moment, or a Server-Action /
 * RSC stream that was aborted mid-flight. On this platform those surface
 * to the boundary because ~250 client components dispatch Server Actions
 * inside `startTransition(async () => { await action() })` with no
 * try/catch — when that action's underlying fetch() rejects, React
 * re-throws it to the nearest error boundary.
 *
 * These produce browser-specific, STACK-LESS messages:
 *   - Safari:   "Load failed"
 *   - Chrome:   "Failed to fetch"
 *   - Firefox:  "NetworkError when attempting to fetch resource."
 *   - Firefox:  "Error in input stream"        (aborted response stream)
 *   - Next RSC: "Connection closed."            (aborted RSC stream)
 *   - generic:  "network error" / DOMException name "AbortError"
 *
 * They flood /admin/incidents with unactionable, empty-stack rows (the
 * §12 "incident-log floods" risk). This predicate identifies ONLY those
 * genuine transient aborts so the reporter can skip them — it must NEVER
 * match a real application error (a ReferenceError, a TypeError from our
 * code, a chunk-load failure worth seeing, etc.).
 *
 * CONSERVATIVE by contract: match a tightly-scoped allow-list of the
 * abort/cancel messages above, plus the DOMException AbortError name.
 * Anything else → not transient → still reported.
 *
 * Pure + isomorphic — safe in the browser (imported by client-report.ts).
 */

/**
 * The exact, whole-message strings a cancelled fetch / aborted stream
 * produces across browsers. Matched case-insensitively against the
 * trimmed message. Deliberately NOT substring-matched against arbitrary
 * text (a real error whose message merely contains "network" must still
 * be reported) — see isTransientAbortError for the matching rule.
 */
const TRANSIENT_ABORT_MESSAGES = new Set([
  "load failed",                                  // Safari — cancelled fetch
  "failed to fetch",                              // Chrome/Edge — cancelled fetch
  "networkerror when attempting to fetch resource.", // Firefox — cancelled fetch
  "error in input stream",                        // Firefox — aborted response stream
  "connection closed.",                           // Next.js RSC — aborted stream
  "network error",                                // generic transport abort
  "the network connection was lost.",             // iOS WKWebView — cancelled fetch
  "cancelled",                                    // WebKit — user-cancelled request
  "the operation was aborted.",                   // AbortController abort
  "the user aborted a request.",                  // fetch abort (Chrome DOMException msg)
  "fetch aborted",                                // generic
  "aborterror",                                   // DOMException name as message
]);

/**
 * True when the error is a genuine transient navigation-abort / network-
 * cancel that should NOT be captured as an incident (it is not a bug —
 * the user moved on / the connection blipped and the in-flight fetch or
 * stream was cancelled).
 *
 * Matches on:
 *   1. a DOMException whose `name` is "AbortError" (the canonical
 *      abort signal — this is never an application bug), OR
 *   2. the trimmed, lower-cased message being EXACTLY one of the known
 *      browser abort/cancel strings.
 *
 * Everything else (ReferenceError, TypeError from our own code, chunk
 * load failures, `X is not defined`, DOM mutation errors, real API 500
 * shapes, etc.) returns false → still reported.
 */
export function isTransientAbortError(
  error: (Error & { name?: string; digest?: string }) | null | undefined,
): boolean {
  if (!error) return false;

  // 1) The canonical abort signal — a cancelled fetch/AbortController.
  //    A DOMException named AbortError is by definition a cancel, never
  //    an application bug.
  if (typeof error.name === "string" && error.name === "AbortError") {
    return true;
  }

  // 2) Known stack-less browser abort/cancel messages, whole-string only.
  const msg = (error.message ?? "").trim().toLowerCase();
  if (!msg) return false;
  return TRANSIENT_ABORT_MESSAGES.has(msg);
}

/**
 * True when the error is a chunk-load / dynamic-import failure — DEPLOY
 * CHURN, not a bug. After a new Vercel deployment a still-open browser tab
 * holds references to the PRIOR deployment's hashed chunks (often with a
 * `?dpl=dpl_…` query); requesting one now 404s → a ChunkLoadError. The right
 * response is to fetch the fresh chunks (a guarded one-time reload in the
 * error boundaries), NOT to file an incident.
 *
 * Kept SEPARATE from isTransientAbortError on purpose: the transient-abort
 * classifier deliberately does NOT match chunk-load (a broken chunk from a
 * bad build IS worth seeing there). This predicate is OR'd into the
 * client-report skip + drives the boundaries' auto-reload — the two stay
 * orthogonal.
 *
 * CONSERVATIVE: only whole chunk-load shapes (the ChunkLoadError name or the
 * canonical chunk / dynamic-import messages), case-insensitive because the
 * message carries volatile paths / module numbers / the ?dpl= query.
 */
export function isChunkLoadError(
  error: (Error & { name?: string }) | null | undefined,
): boolean {
  if (!error) return false;

  // The canonical name webpack/Next set on a failed chunk fetch.
  if (typeof error.name === "string" && error.name === "ChunkLoadError") {
    return true;
  }

  const msg = (error.message ?? "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("failed to load chunk") ||
    /loading (css )?chunk \S+ failed/.test(msg) ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("failed to fetch dynamically imported module")
  );
}
