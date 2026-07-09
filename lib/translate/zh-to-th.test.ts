/**
 * Unit tests for the in-house ZH→TH translate tool.
 *
 * No vitest — uses the project's tsx assertion pattern (matches calc-price.test.ts).
 * Run with:  pnpm tsx lib/translate/zh-to-th.test.ts
 *
 * Covers the two PURE units (per the codebase convention that server-only modules
 * — here zh-to-th.ts's `import "server-only"` chain — are NOT imported directly
 * under tsx):
 *   (a) containsCJK  — Chinese true / Thai+Latin/empty false (the translate-button guard)
 *   (b) translationCacheHash — stable sha256 · lang-scoped (the cache-key shape)
 *
 * fetch is mocked to prove the pure units never touch the network.
 */

import { containsCJK } from "./cjk";
import { translationCacheHash } from "./hash";

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}
function assertTrue(label: string, cond: boolean) {
  assertEq(label, cond, true);
}
function section(name: string) {
  console.log(`\n${name}`);
}

// fetch mocked — asserts these pure helpers never hit the network.
let fetchCalled = false;
globalThis.fetch = (async () => {
  fetchCalled = true;
  throw new Error("pure helpers must not call fetch");
}) as typeof fetch;

// ── (a) containsCJK ──
section("containsCJK");
assertTrue("Chinese product name → true", containsCJK("红色连衣裙"));
assertTrue("single han char → true", containsCJK("裙"));
assertTrue("mixed CN + latin → true", containsCJK("红色 size M"));
assertEq("Thai → false", containsCJK("เสื้อสีแดง"), false);
assertEq("Latin → false", containsCJK("Red Dress"), false);
assertEq("digits/punct → false", containsCJK("2026-07-09 · 5.10"), false);
assertEq("empty → false", containsCJK(""), false);
assertEq("null → false", containsCJK(null), false);
assertEq("undefined → false", containsCJK(undefined), false);

// ── (b) translationCacheHash ──
section("translationCacheHash");
const h1 = translationCacheHash("红色连衣裙");
assertEq("is 64-hex sha256", /^[0-9a-f]{64}$/.test(h1), true);
assertEq("deterministic", translationCacheHash("红色连衣裙"), h1);
assertTrue("different source → different hash", translationCacheHash("蓝色") !== h1);
assertTrue("lang-scoped (th vs en differ)", translationCacheHash("红色连衣裙", "en") !== h1);
assertEq(
  "default lang == explicit th",
  translationCacheHash("红色连衣裙"),
  translationCacheHash("红色连衣裙", "th"),
);

// ── network isolation ──
section("network isolation");
assertEq("no fetch call from pure helpers", fetchCalled, false);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
