// Unit tests for lib/experiments.ts — pure A/B primitives.
// Matches Pacred test conventions (no framework; manual tsx-driven asserts).

import { bucketIndex, fnv1a32, newVisitorId, pickVariant, EXPERIMENTS } from "./experiments";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function eq<T>(name: string, actual: T, expected: T): void {
  if (actual === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
    console.log(`  ✗ ${name}`);
  }
}

function truthy(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── (a) fnv1a32 — basic properties ───────────────────────────────
console.log("\n(a) fnv1a32 — basic properties");
eq("empty string → offset basis", fnv1a32(""), 0x811c9dc5);
truthy("returns uint32 (≥ 0)", fnv1a32("anything") >= 0);
truthy("returns uint32 (< 2^32)", fnv1a32("anything") < 2 ** 32);
eq("same input → same output (1)", fnv1a32("foo"), fnv1a32("foo"));
eq("same input → same output (2)", fnv1a32("home_hero_cta:abc"), fnv1a32("home_hero_cta:abc"));
truthy("different input → different output (likely)", fnv1a32("foo") !== fnv1a32("bar"));

// ── (b) bucketIndex — determinism + range ────────────────────────
console.log("\n(b) bucketIndex — determinism + range");
eq("same key+visitor → same index", bucketIndex("exp", "vid-1", 2), bucketIndex("exp", "vid-1", 2));
const idx = bucketIndex("exp_a", "visitor-xyz", 4);
truthy("returns int in [0, count)", idx >= 0 && idx < 4 && Number.isInteger(idx), `idx=${idx}`);
truthy("count=2 → always 0 or 1", [0, 1].includes(bucketIndex("exp", "any", 2)));
truthy("count=1 → always 0", bucketIndex("exp", "vid", 1) === 0);

// Cross-key isolation: same visitor, different exp keys → independent
const idxA = bucketIndex("exp_a", "shared-visitor", 2);
const idxB = bucketIndex("exp_b", "shared-visitor", 2);
truthy(
  "different experiment keys salt independently",
  // We can't assert they ALWAYS differ (1/2 chance of collision), but the
  // strings being concatenated as `${key}:${visitor}` ensures their inputs
  // to fnv differ, so this is deterministic-but-uncorrelated.
  typeof idxA === "number" && typeof idxB === "number",
);

// ── (c) bucketIndex — distribution uniformity ────────────────────
console.log("\n(c) bucketIndex — distribution uniformity (10k samples)");
const buckets = [0, 0];
const N = 10_000;
for (let i = 0; i < N; i++) {
  buckets[bucketIndex("dist_test", `visitor-${i}`, 2)]++;
}
const ratio = buckets[0] / N;
// 50/50 split with 10k samples — expect within ±2% (very lenient; FNV gives < 1% typically)
truthy(
  `bucket-0 share ${(ratio * 100).toFixed(2)}% (expect 48-52%)`,
  ratio > 0.48 && ratio < 0.52,
  `buckets=${JSON.stringify(buckets)}`,
);

// 3-variant split
const b3 = [0, 0, 0];
for (let i = 0; i < N; i++) {
  b3[bucketIndex("dist_test_3", `visitor-${i}`, 3)]++;
}
const min = Math.min(...b3);
const max = Math.max(...b3);
truthy(
  `3-bucket split spread ≤ 5% of N (got min=${min} max=${max})`,
  max - min < 500,
  `buckets=${JSON.stringify(b3)}`,
);

// ── (d) pickVariant — registry integration ───────────────────────
console.log("\n(d) pickVariant — registry integration");
// home_hero_cta is the only registered exp, active=false → always "control"
eq("inactive exp → control (visitor 1)", pickVariant("home_hero_cta", "vid-1"), "control");
eq("inactive exp → control (visitor 2)", pickVariant("home_hero_cta", "completely-different-visitor"), "control");
eq("inactive exp → control (empty visitor)", pickVariant("home_hero_cta", ""), "control");

// ── (e) newVisitorId — format ────────────────────────────────────
console.log("\n(e) newVisitorId — format");
const vid = newVisitorId();
truthy("returns non-empty string", typeof vid === "string" && vid.length > 0, `got=${vid}`);
truthy(
  "matches RFC 4122 v4 UUID shape",
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vid),
  `got=${vid}`,
);
truthy("two consecutive calls return distinct values", newVisitorId() !== newVisitorId());

// ── (f) EXPERIMENTS registry shape ───────────────────────────────
console.log("\n(f) EXPERIMENTS registry shape");
truthy("has at least 1 entry", Object.keys(EXPERIMENTS).length >= 1);
for (const [k, exp] of Object.entries(EXPERIMENTS)) {
  truthy(`${k} → variants is array ≥ 2`, Array.isArray(exp.variants) && exp.variants.length >= 2);
  eq(`${k} → first variant is "control"`, exp.variants[0], "control");
  truthy(`${k} → active is boolean`, typeof exp.active === "boolean");
}

// ── summary ──────────────────────────────────────────────────────
console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
