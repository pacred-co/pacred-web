/**
 * Unit tests for extractProductId (P-50 — china-search rewire).
 *
 * Same tsx test pattern as lib/forwarder/calc-price.test.ts /
 * lib/utils/thai-number.test.ts (per §6 self-directed DECISION:
 * no vitest, keep the existing pnpm test chain).
 *
 * Run with:
 *   pnpm tsx lib/china-search/extract-product-id.test.ts
 *   (or `pnpm test` to run alongside the rest of the suite)
 */

import { extractProductId, detectProviderFromUrl } from "./extract-product-id";

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

console.log("=== extractProductId tests ===");

// ────────────────────────────────────────────────────────────
// (a) 1688 desktop offer page
// ────────────────────────────────────────────────────────────
group("(a) 1688 desktop offer page", () => {
  assertEq(
    extractProductId("https://detail.1688.com/offer/808456582517.html"),
    "808456582517",
    "extracts from /offer/<id>.html",
  );
  assertEq(
    extractProductId("https://detail.1688.com/offer/123456789.html?spm=a312h.foo"),
    "123456789",
    "ignores trailing query params",
  );
  assertEq(
    extractProductId("https://m.1688.com/offer/777888999.html"),
    "777888999",
    "works for mobile m.1688.com host",
  );
});

// ────────────────────────────────────────────────────────────
// (b) Taobao item.htm
// ────────────────────────────────────────────────────────────
group("(b) Taobao item.htm", () => {
  assertEq(
    extractProductId("https://item.taobao.com/item.htm?id=678901234567"),
    "678901234567",
    "extracts from ?id=",
  );
  assertEq(
    extractProductId("https://item.taobao.com/item.htm?spm=foo&id=678901234567&bar=baz"),
    "678901234567",
    "extracts ?id= regardless of position in querystring",
  );
});

// ────────────────────────────────────────────────────────────
// (c) Tmall item.htm
// ────────────────────────────────────────────────────────────
group("(c) Tmall item.htm", () => {
  assertEq(
    extractProductId("https://detail.tmall.com/item.htm?id=987654321098"),
    "987654321098",
    "extracts from Tmall ?id=",
  );
  assertEq(
    extractProductId("https://detail.m.tmall.com/item.htm?id=111222333"),
    "111222333",
    "extracts from Tmall mobile",
  );
});

// ────────────────────────────────────────────────────────────
// (d) ?offerId fallback
// ────────────────────────────────────────────────────────────
group("(d) ?offerId fallback", () => {
  assertEq(
    extractProductId("https://detail.1688.com/some-other-page?offerId=555666777"),
    "555666777",
    "uses ?offerId when ?id missing",
  );
  assertEq(
    extractProductId("https://x.com/page?id=123456&offerId=999888777"),
    "123456",
    "?id= takes precedence over ?offerId= when both valid",
  );
});

// ────────────────────────────────────────────────────────────
// (e) generic numeric path segment
// ────────────────────────────────────────────────────────────
group("(e) generic numeric path segment", () => {
  assertEq(
    extractProductId("https://x.com/item/123456789"),
    "123456789",
    "matches /<id> at end of path",
  );
  assertEq(
    extractProductId("https://x.com/123456789.htm"),
    "123456789",
    "matches /<id>.<ext>",
  );
  assertEq(
    extractProductId("https://x.com/v2/page"),
    null,
    "rejects short numeric path segments (only v2 = 1 digit)",
  );
});

// ────────────────────────────────────────────────────────────
// (f) short URLs (P-51 will resolve via tam-i-t.com cache)
// ────────────────────────────────────────────────────────────
group("(f) short URLs return null (P-51 will handle)", () => {
  assertEq(
    extractProductId("https://m.tb.cn/h.gA1B2cD"),
    null,
    "Taobao short URL → null",
  );
  assertEq(
    extractProductId("https://qr.1688.com/s/abc123"),
    null,
    "1688 short URL → null",
  );
});

// ────────────────────────────────────────────────────────────
// (g) malformed / non-URL inputs
// ────────────────────────────────────────────────────────────
group("(g) malformed / non-URL inputs", () => {
  assertEq(extractProductId(""),                     null, "empty string → null");
  assertEq(extractProductId("not-a-url"),            null, "garbage text → null");
  assertEq(extractProductId("ftp://x.com/12345678"), "12345678", "non-http URL still parses");
  assertEq(
    extractProductId("https://x.com/?id=abc"),
    null,
    "non-numeric ?id= rejected",
  );
  assertEq(
    extractProductId("https://x.com/?id=12"),
    null,
    "?id= shorter than 6 digits rejected",
  );
});

// ────────────────────────────────────────────────────────────
// (h) detectProviderFromUrl — platform CODE from the authoritative link (BUG-6)
// ────────────────────────────────────────────────────────────
group("(h) detectProviderFromUrl", () => {
  assertEq(detectProviderFromUrl("https://detail.1688.com/offer/808456582517.html"), "1", "1688 desktop → '1'");
  assertEq(detectProviderFromUrl("https://m.1688.com/offer/777888999.html"),         "1", "1688 wireless → '1'");
  assertEq(detectProviderFromUrl("https://item.taobao.com/item.htm?id=678901234567"), "2", "Taobao → '2'");
  assertEq(detectProviderFromUrl("https://detail.tmall.com/item.htm?id=987654321098"), "3", "Tmall → '3'");
  assertEq(detectProviderFromUrl("https://detail.m.tmall.com/item.htm?id=111"),        "3", "Tmall mobile → '3'");
  // the BUG-6 case: a 1688 link (would be mis-stored as Taobao) resolves to 1688.
  assertEq(detectProviderFromUrl("https://detail.1688.com/offer/123.html"),           "1", "mis-stored 1688 link → '1' (not stored code)");
  // unknown / malformed → null (caller falls back to stored cprovider)
  assertEq(detectProviderFromUrl("https://example.com/item/123456"),  null, "unknown host → null");
  assertEq(detectProviderFromUrl("https://not1688.com/offer/1.html"), null, "lookalike host not1688.com → null");
  assertEq(detectProviderFromUrl("not-a-url"),                        null, "garbage → null");
  assertEq(detectProviderFromUrl(""),                                 null, "empty → null");
  assertEq(detectProviderFromUrl(null),                               null, "null → null");
  assertEq(detectProviderFromUrl(undefined),                          null, "undefined → null");
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
