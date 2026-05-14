// Cookie-based deterministic A/B experiments (L-24) — PURE primitives.
//
// This module is intentionally free of `next/headers` so it can be imported
// from the middleware edge runtime (`proxy.ts`) as well as from RSC, client
// components, and Node tests. Server-only helpers that need `cookies()` live
// in `lib/experiments-server.ts`.
//
// Design choices (DECISION: chose cookie-based bucketing over GrowthBook /
// PostHog / Vercel Edge Config; reason: zero external dep, zero monthly
// cost, SSR-pure with no flicker, suitable for Pacred MVP traffic volume;
// switch later if traffic warrants):
//
// 1. `pacred_vid` cookie holds a UUID visitor ID (set by proxy.ts on first visit, 1y TTL)
// 2. Bucketing = `FNV-1a(experimentKey + ":" + visitorId) % variants.length` — deterministic + uniform
// 3. Variant assignment via `getVariantServer()` (RSC, server actions) or `getVariantClient()` (use-client)
// 4. Exposure is tracked via `trackExperimentExposure()` in `lib/analytics.ts`
// 5. Disabled experiments (`active: false`) always return control — safe default for in-flight work

/** Cookie name holding the per-visitor UUID. Read-only for client JS (httpOnly=false). */
export const VISITOR_COOKIE = "pacred_vid";

/**
 * Active experiments registry. Add new entries here; the type system
 * enforces variant + active fields and the helpers below are generic over
 * `keyof typeof EXPERIMENTS`.
 *
 * Convention: first variant is always "control" — the baseline that
 * disabled experiments return.
 */
export const EXPERIMENTS = {
  // Example experiment — keep at least 1 entry so TS infers the type.
  // Not wired into any UI yet; `active: false` = always returns "control".
  home_hero_cta: {
    description: "Home hero CTA copy + colour test (control = current red, variant_a = larger white-on-red)",
    variants: ["control", "variant_a"] as const,
    active: false,
  },
} as const;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type ExperimentVariant<K extends ExperimentKey> =
  (typeof EXPERIMENTS)[K]["variants"][number];

/**
 * FNV-1a 32-bit hash — small, fast, uniform enough for A/B bucketing.
 * Not cryptographic; do not use for security.
 */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pure bucketing — given a visitorId and experiment, return the variant.
 * Exported for client-side use + tests.
 */
export function pickVariant<K extends ExperimentKey>(
  key: K,
  visitorId: string,
): ExperimentVariant<K> {
  const exp = EXPERIMENTS[key];
  if (!exp.active) return exp.variants[0] as ExperimentVariant<K>;
  const idx = fnv1a32(`${key}:${visitorId}`) % exp.variants.length;
  return exp.variants[idx] as ExperimentVariant<K>;
}

/**
 * Generate a new visitor ID. Called by middleware on first request when
 * no `pacred_vid` cookie is present. Uses `crypto.randomUUID()` so the
 * value collides at 2^61 (more than enough for traffic at any scale).
 */
export function newVisitorId(): string {
  return crypto.randomUUID();
}

/**
 * Client-side variant lookup — call inside `"use client"` components.
 * Reads `document.cookie` directly. Returns `null` during SSR + the first
 * client paint until the cookie is available.
 *
 * For RSC / server actions / route handlers, use `getVariantServer()`
 * from `lib/experiments-server.ts` (separated to keep `next/headers` out
 * of the middleware bundle).
 */
export function getVariantClient<K extends ExperimentKey>(
  key: K,
): ExperimentVariant<K> | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]+)`),
  );
  if (!match) return null;
  return pickVariant(key, decodeURIComponent(match[1]));
}
