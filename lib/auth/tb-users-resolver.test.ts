/**
 * tb-users-resolver — cache semantics test
 *
 * The resolver is hot-path: every bulk-bill (200 fids) hits it. Verify the
 * cache eviction + LRU touch behave as documented.
 *
 * Wave 16 follow-up A · 2026-05-23
 *
 * Run: pnpm tsx lib/auth/tb-users-resolver.test.ts
 */

// We can't import the real resolver here without invoking createAdminClient
// (which requires SUPABASE_SERVICE_ROLE_KEY in process.env). Re-implement the
// cache class against the same shape — this test verifies the algorithm, the
// integration with Supabase is verified by the survey scripts.

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, info?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else      { fail++; console.error(`  ✗ ${name}`, info ?? ""); }
}

// ── Inline cache mirror (DO NOT IMPORT — that triggers server-only) ──
const CACHE_MAX = 3;     // small for testing
const cache = new Map<string, string | null>();
function cacheGet(userid: string): { hit: boolean; value: string | null } {
  if (cache.has(userid)) {
    const v = cache.get(userid) ?? null;
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

console.log("\ntb-users-resolver — cache semantics");

// 1. Miss on empty cache
cache.clear();
const m1 = cacheGet("PR1");
assert("empty cache → miss", m1.hit === false);

// 2. Set + hit
cacheSet("PR1", "uuid-1");
const h1 = cacheGet("PR1");
assert("after set → hit", h1.hit === true && h1.value === "uuid-1");

// 3. Cache null value (for known-orphan)
cacheSet("PR2", null);
const h2 = cacheGet("PR2");
assert("null cache value retained on hit", h2.hit === true && h2.value === null);

// 4. LRU eviction when cap reached
cache.clear();
cacheSet("PR1", "u1");
cacheSet("PR2", "u2");
cacheSet("PR3", "u3");
assert("cache at cap (3)", cache.size === 3);

cacheSet("PR4", "u4");   // should evict PR1 (oldest)
assert("after 4th insert, size still 3", cache.size === 3);
assert("PR1 evicted",  cacheGet("PR1").hit === false);
assert("PR2 still in", cacheGet("PR2").hit === true);
assert("PR3 still in", cacheGet("PR3").hit === true);
assert("PR4 still in", cacheGet("PR4").hit === true);

// 5. LRU touch — a recent get bumps to most-recent
cache.clear();
cacheSet("PR1", "u1");
cacheSet("PR2", "u2");
cacheSet("PR3", "u3");
cacheGet("PR1");           // touch PR1 → now most recent
cacheSet("PR4", "u4");     // should evict PR2 (now oldest), not PR1
assert("PR2 evicted after PR1 touched", cacheGet("PR2").hit === false);
assert("PR1 still in (was touched)",   cacheGet("PR1").hit === true);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
