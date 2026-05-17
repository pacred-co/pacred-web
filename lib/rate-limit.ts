/**
 * Rate limiting for IP-based + generic endpoint protection.
 *
 *   import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
 *
 *   const ip = getClientIp(req);
 *   const result = await rateLimit("signup", ip);
 *   if (!result.success) {
 *     return { ok: false, error: "rate_limit", retryAfter: result.reset };
 *   }
 *
 * Backed by Upstash Redis when `UPSTASH_REDIS_REST_URL` +
 * `UPSTASH_REDIS_REST_TOKEN` are set; otherwise an in-memory Map (per
 * server process) with TTL eviction. The in-memory path is ONLY
 * appropriate for dev — in prod, multiple Vercel function instances
 * each have their own memory, so attackers can multiply allowed
 * volume by hammering different cold starts.
 *
 * NOT a replacement for the DB-backed OTP limiter in `actions/otp.ts`
 * (3/hour/phone counted from `otp_codes` table) — that limiter doubles
 * as an audit trail. Use this lib for IP-based protection (no phone
 * to key on yet) and for endpoints where a DB query per request would
 * be wasteful.
 *
 * Server-only.
 */

import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

// ── Pre-configured limits ────────────────────────────────────────
// Tune these as traffic shape becomes known. Conservative defaults;
// false positives are easier to fix (loosen) than missed abuse.
export const RATE_LIMITS = {
  /** Pre-account signup attempts per IP — captcha + rate combine. */
  signup:        { limit: 5,  windowMs: 3_600_000 },   // 5 / hour
  /** Login attempts per IP — defends against credential stuffing. */
  login:         { limit: 10, windowMs: 3_600_000 },   // 10 / hour
  /** Password-reset request per IP — anti-enumeration. */
  passwordReset: { limit: 5,  windowMs: 3_600_000 },   // 5 / hour
  /** OTP-confirm steps (password-reset confirm, phone-change confirm) per
   *  IP — S-3. verifyOtp itself caps 5 tries per OTP row; this adds the
   *  missing IP-level ceiling so a 6-digit OTP can't be brute-forced across
   *  successive rows, and gives one IP-level lockout signal. */
  otpVerify:     { limit: 10, windowMs: 3_600_000 },   // 10 / hour
  /** Contact form per IP — anti-spam. */
  contact:       { limit: 5,  windowMs: 3_600_000 },   // 5 / hour
  /** Generic API endpoint default (calls without their own bucket). */
  generic:       { limit: 30, windowMs: 60_000 },      // 30 / minute
} as const;

export type LimitName = keyof typeof RATE_LIMITS;

export type RateLimitResult = {
  /** True when the request is within budget. */
  success:   boolean;
  /** Total budget for this window (informational — useful in headers). */
  limit:     number;
  /** Requests still allowed in this window after this call. */
  remaining: number;
  /** Unix ms when the bucket resets (informational + for `Retry-After`). */
  reset:     number;
};

// ── Backend selection ────────────────────────────────────────────
const redis = (() => {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch (err) {
    logger.warn("rate-limit", "Upstash init failed, falling back to memory", { err: String(err) });
    return null;
  }
})();

// One Ratelimit instance per (limit-name) — Upstash recommends caching them.
const upstashLimiters: Partial<Record<LimitName, Ratelimit>> = {};

/**
 * Convert window milliseconds to Upstash's Duration string format
 * ("1 h" / "5 m" / "30 s"). Falls back to "<n> ms" for non-aligned
 * windows. Cleaner than passing raw ms — easier to read in Redis keys
 * and matches Upstash's docs/examples.
 */
function msToDuration(ms: number): `${number} ${"d" | "h" | "m" | "s" | "ms"}` {
  if (ms >= 86_400_000 && ms % 86_400_000 === 0) return `${ms / 86_400_000} d`;
  if (ms >= 3_600_000  && ms % 3_600_000  === 0) return `${ms / 3_600_000} h`;
  if (ms >= 60_000     && ms % 60_000     === 0) return `${ms / 60_000} m`;
  if (ms >= 1_000      && ms % 1_000      === 0) return `${ms / 1_000} s`;
  return `${ms} ms`;
}

function getUpstashLimiter(name: LimitName): Ratelimit | null {
  if (!redis) return null;
  let lim = upstashLimiters[name];
  if (!lim) {
    const cfg = RATE_LIMITS[name];
    lim = new Ratelimit({
      redis,
      // Sliding window — fairer than fixed-window (no hot edge resets).
      limiter: Ratelimit.slidingWindow(cfg.limit, msToDuration(cfg.windowMs)),
      prefix:  `pacred:rl:${name}`,
      // Disable Upstash's analytics dashboard ingestion — we have Sentry
      // for observability + don't want extra writes per request.
      analytics: false,
    });
    upstashLimiters[name] = lim;
  }
  return lim;
}

// ── In-memory fallback (dev only) ────────────────────────────────
type MemEntry = { count: number; resetAt: number };
const memoryStore = new Map<string, MemEntry>();

function memoryCheck(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Lazy cleanup — 1% probability per call. Avoids per-request scan + a
  // setInterval (the latter doesn't survive Edge runtime). Bounded
  // memory: each key fits at most one entry.
  if (Math.random() < 0.01) {
    for (const [k, v] of memoryStore) {
      if (v.resetAt < now) memoryStore.delete(k);
    }
  }

  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, limit, remaining: limit - 1, reset: now + windowMs };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { success: false, limit, remaining: 0, reset: entry.resetAt };
  }
  return { success: true, limit, remaining: limit - entry.count, reset: entry.resetAt };
}

// ── Public API ───────────────────────────────────────────────────
export async function rateLimit(name: LimitName, key: string): Promise<RateLimitResult> {
  const cfg = RATE_LIMITS[name];

  const upstash = getUpstashLimiter(name);
  if (upstash) {
    try {
      const res = await upstash.limit(key);
      return {
        success:   res.success,
        limit:     res.limit,
        remaining: res.remaining,
        reset:     res.reset,
      };
    } catch (err) {
      // Redis hiccup — log + fall through to memory so a single Upstash
      // outage doesn't take down auth flows. Trade-off: a few requests
      // bypass quotas during the outage.
      logger.warn("rate-limit", "Upstash check failed, using memory fallback", {
        name,
        err:  String(err),
      });
    }
  }

  return memoryCheck(`${name}:${key}`, cfg.limit, cfg.windowMs);
}

/**
 * Like `getClientIp` but takes a Headers-like (anything with `.get()`) directly.
 * Use this in Server Actions where `await headers()` from `next/headers` returns
 * a ReadonlyHeaders that quacks like Headers but isn't an instanceof of it.
 *
 *   import { headers } from "next/headers";
 *   const ip = getClientIpFromHeaders(await headers());
 */
export function getClientIpFromHeaders(h: { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Best-effort client IP extraction from a Request. Vercel + most proxies
 * set `x-forwarded-for`. Returns `"unknown"` when no header is present —
 * caller decides whether to treat that as one shared bucket or to skip
 * limiting (recommend bucket — collapsing all unknowns to one key is the
 * conservative choice).
 */
export function getClientIp(req: Request | { headers: Headers } | { headers: Record<string, string | string[]> }): string {
  // Headers can be either Web API Headers or a plain Node-style object.
  const get = (h: unknown, name: string): string | null => {
    if (h instanceof Headers) return h.get(name);
    if (h && typeof h === "object") {
      const rec = h as Record<string, string | string[] | undefined>;
      const v = rec[name] ?? rec[name.toLowerCase()];
      if (Array.isArray(v)) return v[0] ?? null;
      return v ?? null;
    }
    return null;
  };

  const headers = (req as { headers: unknown }).headers;
  const xff     = get(headers, "x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  const realIp  = get(headers, "x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

/**
 * Convenience for Server Actions / Route Handlers — returns a 429-ready
 * payload when limit exceeded, or `null` to continue. Useful at the top
 * of an action:
 *
 *   const blocked = await checkRateLimit("signup", ip);
 *   if (blocked) return blocked;
 */
export async function checkRateLimit(
  name: LimitName,
  key: string,
): Promise<{ ok: false; error: "rate_limit"; retryAfterSeconds: number } | null> {
  const res = await rateLimit(name, key);
  if (res.success) return null;
  return {
    ok:                false,
    error:             "rate_limit",
    retryAfterSeconds: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)),
  };
}
