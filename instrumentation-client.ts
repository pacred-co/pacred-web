/**
 * Next 16 client (browser) instrumentation entry point.
 *
 * **Perf-critical (Sprint-8):** Sentry's `@sentry/nextjs` SDK is ~474 KB
 * uncompressed (~150 KB gzipped) — most of the JS bundle weight when
 * the customer hits any Pacred page. As long as we don't have a
 * `NEXT_PUBLIC_SENTRY_DSN` env var configured (current pre-launch
 * state), there's nothing the SDK can do at runtime, so we shouldn't
 * import it at all — even a dynamic `import("@sentry/nextjs")` inside
 * an `if (dsn)` branch still forces the bundler to emit a chunk
 * containing the SDK on the off-chance the branch fires.
 *
 * This file is therefore a pure no-op for the no-DSN path. When ก๊อต
 * configures `NEXT_PUBLIC_SENTRY_DSN` on Vercel, restore the original
 * `Sentry.init({...})` body — that re-introduces the SDK to the bundle
 * but does so for an environment that's actually sending events.
 *
 * The original Sentry init body is preserved in
 * `docs/learnings/perf-patterns.md` for restore-time reference.
 *
 * `next.config.ts` separately skips `withSentryConfig()` when the DSN
 * is unset; the two halves together keep the SDK fully out of the
 * bundle until the DSN lands.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */

// onRouterTransitionStart is the documented hook Next 16 calls on every
// client-side navigation. With Sentry stripped, it's a silent no-op.
// Type signature matches `(navigateToHref: string, navigateType: ...)`
// so this stays a valid Next instrumentation file.
export function onRouterTransitionStart(): void {
  // intentionally empty — Sentry is not loaded
}
