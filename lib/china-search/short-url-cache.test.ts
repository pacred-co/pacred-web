/**
 * Unit tests for short-URL helpers (P-51).
 *
 * Imports from ./short-url-helpers (the no-server-only split) so tsx can
 * load these without dragging the "server-only" sentinel through node.
 * The full resolveShortUrl flow (network I/O, fetch with desktop UA spoof,
 * write-back to tam-i-t.com cache) lives in ./short-url-cache and is
 * verified by the manual smoke flow once vendor allowlists Vercel egress
 * IPs (P-55).
 *
 * Run with:
 *   pnpm tsx lib/china-search/short-url-cache.test.ts
 *   (or `pnpm test` to run alongside the rest of the suite)
 */

import { detectShortUrl, scrapeProductId } from "./short-url-helpers";

let failed = 0;
let passed = 0;

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

console.log("=== short-url-cache helpers ===");

// ────────────────────────────────────────────────────────────
// (a) detectShortUrl — Taobao m.tb.cn
// ────────────────────────────────────────────────────────────
group("(a) detectShortUrl — Taobao m.tb.cn", () => {
  const m1 = detectShortUrl("https://m.tb.cn/h.gA1B2cD");
  assertEq(m1?.provider,  "2",            "provider=2 (taobao)");
  assertEq(m1?.cachePath, "/get/taobao/", "cachePath = /get/taobao/");
  assertEq(m1?.tk,        "h.gA1B2cD",    "tk extracted from path");

  const m2 = detectShortUrl("https://m.tb.cn/abc123");
  assertEq(m2?.tk,        "abc123",       "no h. prefix still works");
});

// ────────────────────────────────────────────────────────────
// (b) detectShortUrl — 1688 qr.1688.com/s/{tk}
// ────────────────────────────────────────────────────────────
group("(b) detectShortUrl — 1688 qr.1688.com", () => {
  const m1 = detectShortUrl("https://qr.1688.com/s/abc123");
  assertEq(m1?.provider,  "1",        "provider=1 (1688)");
  assertEq(m1?.cachePath, "/get/",    "cachePath = /get/");
  assertEq(m1?.tk,        "abc123",   "tk extracted after /s/");

  const m2 = detectShortUrl("https://qr.1688.com/s/xyz789/");
  assertEq(m2?.tk,        "xyz789",   "trailing slash trimmed");
});

// ────────────────────────────────────────────────────────────
// (c) detectShortUrl — non-short URLs return null
// ────────────────────────────────────────────────────────────
group("(c) detectShortUrl — non-short URLs", () => {
  assertEq(detectShortUrl("https://detail.1688.com/offer/12345.html"), null, "1688 full URL → null");
  assertEq(detectShortUrl("https://item.taobao.com/item.htm?id=12345"), null, "Taobao full URL → null");
  assertEq(detectShortUrl("https://detail.tmall.com/item.htm?id=12345"), null, "Tmall → null");
  assertEq(detectShortUrl("not-a-url"),                                  null, "garbage → null");
  assertEq(detectShortUrl(""),                                           null, "empty → null");
});

// ────────────────────────────────────────────────────────────
// (d) scrapeProductId — encoded redirects (Tmall/Taobao)
// ────────────────────────────────────────────────────────────
group("(d) scrapeProductId — encoded patterns", () => {
  assertEq(
    scrapeProductId("https://login.taobao.com/jump?Id%3D808456582517&from=mobile"),
    "808456582517",
    "Id%3D<id> (encoded ?Id=)",
  );
  assertEq(
    scrapeProductId("https://login.1688.com/?redirectURL=https%3A%2F%2Fdetail.1688.com%2FFoffer%2F123456789"),
    "123456789",
    "Foffer%2F<id> (encoded /offer/)",
  );
});

// ────────────────────────────────────────────────────────────
// (e) scrapeProductId — plain URLs / querystrings
// ────────────────────────────────────────────────────────────
group("(e) scrapeProductId — plain patterns", () => {
  assertEq(
    scrapeProductId("https://item.taobao.com/item.htm?id=678901234567"),
    "678901234567",
    "?id=<digits>",
  );
  assertEq(
    scrapeProductId("https://detail.1688.com/offer/555666777.html"),
    "555666777",
    "/offer/<id>.html",
  );
  assertEq(
    scrapeProductId("https://x.com/foo?spm=a&offerId=999888777&bar=baz"),
    "999888777",
    "?offerId=<digits>",
  );
});

// ────────────────────────────────────────────────────────────
// (f) scrapeProductId — body fragments + edge cases
// ────────────────────────────────────────────────────────────
group("(f) scrapeProductId — body fragments + edge cases", () => {
  // Realistic HTML fragment with mixed signal:
  assertEq(
    scrapeProductId(`<a href="https://detail.1688.com/offer/123456.html">x</a>`),
    "123456",
    "extracts from anchor href in HTML body",
  );
  // Doesn't match short numeric segments:
  assertEq(scrapeProductId("v2/page-1234"), null, "rejects short numbers in path");
  assertEq(scrapeProductId(""),             null, "empty → null");
  assertEq(scrapeProductId("?id=abc"),      null, "non-numeric ?id= rejected");
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
