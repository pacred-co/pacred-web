/**
 * Legacy tb_users.userid → profiles.id (uuid) resolver.
 *
 * Wave 16 follow-up A · 2026-05-23
 *
 * Why this exists
 *   Faithful-port admin actions (e.g. `actions/admin/forwarder-check.ts`
 *   `adminCallPriceUser`, `actions/admin/tb-bulk.ts`) work natively on the
 *   legacy `tb_*` schema where customers are keyed by `userid` (text, `PR1234`).
 *   The notification sender `lib/notifications/sendNotification()` requires
 *   `profiles.id` (uuid) because `notifications.profile_id` FK → `profiles.id`.
 *
 *   This helper bridges the two: given a legacy `userid`, return the matching
 *   `profiles.id` uuid (or null if the legacy customer has no profile yet).
 *
 *   The matching rule (per `lib/auth/pcs-legacy-bridge.ts` L221 +
 *   `0083_pcs_legacy_member_seq.sql`):
 *
 *     profiles.member_code  ==  tb_users.userid
 *
 *   Both are `PR<n>` after the PCS→PR rebrand in the Phase A load. Letter-only
 *   handles (`PW`, `JET`, `FCL`, `AIGA`) are kept verbatim.
 *
 * Coverage
 *   After `scripts/data/02-provision-profiles-for-tb-users.ts` runs, EVERY
 *   tb_users row has a matching `profiles` row (the script created
 *   `pcs-legacy-<userid>@users.pacred.invalid` auth.users + profiles with
 *   real phone/email from tb_users for notification routing). The resolver
 *   should return non-null for any valid userid.
 *
 *   Returns null when:
 *     - The userid doesn't exist in `tb_users` (caller passed a typo)
 *     - The provisioning script hasn't been run yet for new tb_users rows
 *       added after the backfill (re-run the script periodically)
 *     - The matching profile row was manually deleted (extremely rare)
 *
 * Caching
 *   Cheap per-request LRU (Map with simple cap). Keyed by userid · stable
 *   value (uuid never changes for a given member_code). Cache lives for the
 *   process lifetime — Vercel functions get a fresh process per invocation so
 *   the cache is effectively per-request for our use cases.
 *
 *   For bulk-resolution (e.g. resolving 200 userids in one bulk-bill call),
 *   use `resolveProfileIdsForLegacyUserids()` — one round-trip instead of N.
 *
 * Server-only.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const SCOPE = "tb-users-resolver";

// ──────────────────────────────────────────────────────────────────
// Cache — simple bounded Map (insertion-order LRU)
// ──────────────────────────────────────────────────────────────────

const CACHE_MAX = 1000;
const cache = new Map<string, string | null>();

function cacheGet(userid: string): { hit: boolean; value: string | null } {
  if (cache.has(userid)) {
    const v = cache.get(userid) ?? null;
    // Re-insert to move to end (LRU touch).
    cache.delete(userid);
    cache.set(userid, v);
    return { hit: true, value: v };
  }
  return { hit: false, value: null };
}

function cacheSet(userid: string, value: string | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(userid, value);
}

// ──────────────────────────────────────────────────────────────────
// Single-row resolve
// ──────────────────────────────────────────────────────────────────

/**
 * Resolve a single legacy `tb_users.userid` to its `profiles.id` (uuid).
 *
 * Returns null if no profile exists (caller should fall back to SMS-only
 * notification or log+skip).
 *
 * Idempotent + safe to call from server actions. Wrapped in try/catch — never
 * throws (the notification path treats null as "no LINE/email available").
 */
export async function resolveProfileIdForLegacyUserid(
  userid: string,
): Promise<string | null> {
  const key = userid.trim();
  if (!key) return null;

  const cached = cacheGet(key);
  if (cached.hit) return cached.value;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("member_code", key)
      .maybeSingle<{ id: string }>();

    if (error) {
      logger.warn(SCOPE, "lookup failed", { userid: key, reason: error.message });
      // Do NOT cache transient errors — let the next call retry.
      return null;
    }

    const value = data?.id ?? null;
    cacheSet(key, value);
    return value;
  } catch (e) {
    logger.warn(SCOPE, "lookup threw", { userid: key, reason: String(e) });
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// Bulk resolve — one query for N userids
// ──────────────────────────────────────────────────────────────────

/**
 * Resolve N legacy userids in a single round-trip. Returns a Map keyed by
 * userid → uuid (or undefined for unresolved). Caches every result.
 *
 * Use this in bulk-bill / bulk-approve actions that touch dozens of rows.
 * Avoid the N-call shape `for (...) { await resolve(userid) }` for batches.
 */
export async function resolveProfileIdsForLegacyUserids(
  userids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userids.length === 0) return out;

  // Dedup + clean
  const wanted = new Set<string>();
  for (const u of userids) {
    const k = u.trim();
    if (k) wanted.add(k);
  }

  // Cache fast-path
  const stillMissing: string[] = [];
  for (const k of wanted) {
    const c = cacheGet(k);
    if (c.hit) {
      if (c.value) out.set(k, c.value);
    } else {
      stillMissing.push(k);
    }
  }
  if (stillMissing.length === 0) return out;

  // Single round-trip for the remainder. `.in()` accepts a string[] —
  // PostgREST chunks at ~1000 implicitly; we cap at 500 to stay well clear.
  const CHUNK = 500;
  try {
    const admin = createAdminClient();
    for (let i = 0; i < stillMissing.length; i += CHUNK) {
      const slice = stillMissing.slice(i, i + CHUNK);
      const { data, error } = await admin
        .from("profiles")
        .select("id, member_code")
        .in("member_code", slice)
        .returns<Array<{ id: string; member_code: string }>>();
      if (error) {
        logger.warn(SCOPE, "bulk lookup failed", {
          chunk_size: slice.length,
          reason:     error.message,
        });
        continue;   // partial result OK
      }
      const found = new Set<string>();
      for (const r of data ?? []) {
        out.set(r.member_code, r.id);
        cacheSet(r.member_code, r.id);
        found.add(r.member_code);
      }
      // Cache misses too — avoids re-querying for known-orphans.
      for (const k of slice) {
        if (!found.has(k)) cacheSet(k, null);
      }
    }
  } catch (e) {
    logger.warn(SCOPE, "bulk lookup threw", { reason: String(e) });
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────
// Test-only helper — exported for unit tests to reset cache between cases.
// ──────────────────────────────────────────────────────────────────

/** @internal — DO NOT use in production code paths. */
export function __resetResolverCacheForTests(): void {
  cache.clear();
}
