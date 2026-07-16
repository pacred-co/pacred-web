/**
 * IO-1 — Next.js control-flow sentinel detector.
 *
 * `notFound()`, `redirect()`, and an HTTP-error throw inside a Next.js App
 * Router path don't throw an ERROR — they throw a control-flow SENTINEL the
 * framework catches to drive rendering. Next tags these with a string
 * `digest` starting with "NEXT_":
 *   - redirect()  → "NEXT_REDIRECT;replace;/login;307;"
 *   - notFound()  → "NEXT_NOT_FOUND"
 *   - HTTP error  → "NEXT_HTTP_ERROR_FALLBACK;404"
 *
 * When one of these bubbles through a withObservability-wrapped server
 * action it must be RE-THROWN untouched (so the framework still redirects /
 * 404s), NOT captured as a failed_action incident. This mirrors Next's own
 * isRedirectError / isNotFoundError digest checks.
 *
 * Pure + isomorphic — no server-only import, safe to import under tsx for
 * unit testing.
 */

/**
 * True when `error` is a Next.js control-flow sentinel (an object whose
 * string `digest` starts with "NEXT_"). These are framework control flow,
 * not bugs.
 */
export function isNextControlFlowError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}
