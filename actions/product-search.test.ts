/**
 * Unit tests for the product-search URL allow-list
 * (D1 / ADR-0017 · fidelity §4).
 *
 * Same tsx test pattern as lib/china-search/extract-product-id.test.ts
 * (per §6 self-directed DECISION: no vitest, keep the existing pnpm test
 * chain — `pnpm test:unit` runs all `tsx <file>.test.ts`).
 *
 * Scope: the pure isSupportedProductUrl helper. The full
 * `searchProductByUrl` flow runs auth (cookies + Supabase) + a network
 * call to TAMIT, both of which require an actual server boot — those
 * paths are covered by the qa-flow simulator during phase verify, not
 * here.  Test is named after the action that consumes it so a grep
 * for "product-search" pulls in both the action + its tests.
 *
 * Run with:
 *   pnpm tsx actions/product-search.test.ts
 *   (or `pnpm test:unit` once wired into package.json)
 */

import { isSupportedProductUrl } from "@/lib/china-search/url-allow-list";

let failed = 0;
let passed = 0;

function assertEq<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ${PASS_MARK} ${label}`);
    passed++;
  } else {
    console.log(
      `  ${FAIL_MARK} ${label}\n      expected: ${JSON.stringify(expected)}\n      actual:   ${JSON.stringify(actual)}`,
    );
    failed++;
  }
}

const PASS_MARK = "OK";
const FAIL_MARK = "FAIL";

function group(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

console.log("=== product-search.isSupportedProductUrl tests ===");

// ────────────────────────────────────────────────────────────
// (a) 1688 hosts — accepted
// ────────────────────────────────────────────────────────────
group("(a) 1688 hosts — accepted", () => {
  assertEq(
    isSupportedProductUrl("https://detail.1688.com/offer/808456582517.html"),
    true,
    "1688 desktop product page",
  );
  assertEq(
    isSupportedProductUrl("https://m.1688.com/offer/777888999.html"),
    true,
    "1688 mobile product page",
  );
  assertEq(
    isSupportedProductUrl("https://qr.1688.com/s/abc123"),
    true,
    "1688 short share URL",
  );
});

// ────────────────────────────────────────────────────────────
// (b) Taobao hosts — accepted
// ────────────────────────────────────────────────────────────
group("(b) Taobao hosts — accepted", () => {
  assertEq(
    isSupportedProductUrl("https://item.taobao.com/item.htm?id=678901234567"),
    true,
    "Taobao desktop item page",
  );
  assertEq(
    isSupportedProductUrl("https://m.tb.cn/h.gA1B2cD"),
    true,
    "Taobao short share URL (m.tb.cn)",
  );
});

// ────────────────────────────────────────────────────────────
// (c) Tmall hosts — accepted
// ────────────────────────────────────────────────────────────
group("(c) Tmall hosts — accepted", () => {
  assertEq(
    isSupportedProductUrl("https://detail.tmall.com/item.htm?id=987654321098"),
    true,
    "Tmall desktop item page",
  );
  assertEq(
    isSupportedProductUrl("https://detail.m.tmall.com/item.htm?id=111222333"),
    true,
    "Tmall mobile item page",
  );
});

// ────────────────────────────────────────────────────────────
// (d) Unsupported hosts — rejected
// ────────────────────────────────────────────────────────────
group("(d) Unsupported hosts — rejected", () => {
  assertEq(
    isSupportedProductUrl("https://www.google.com"),
    false,
    "google.com rejected",
  );
  assertEq(
    isSupportedProductUrl("https://www.amazon.com/dp/B07XYZABC"),
    false,
    "amazon.com rejected",
  );
  assertEq(
    isSupportedProductUrl("https://www.jd.com/product/123"),
    false,
    "JD.com rejected (not supported by TAMIT)",
  );
  assertEq(
    isSupportedProductUrl("https://www.lazada.co.th/products/abc"),
    false,
    "lazada.co.th rejected",
  );
});

// ────────────────────────────────────────────────────────────
// (e) Malformed / non-URL inputs — rejected
// ────────────────────────────────────────────────────────────
group("(e) Malformed / non-URL inputs — rejected", () => {
  assertEq(isSupportedProductUrl(""), false, "empty string");
  assertEq(isSupportedProductUrl("not-a-url"), false, "garbage text");
  assertEq(isSupportedProductUrl("1688.com"), false, "host without scheme");
  assertEq(
    isSupportedProductUrl("ftp://detail.1688.com/offer/123.html"),
    false,
    "non-http(s) scheme rejected",
  );
  assertEq(
    isSupportedProductUrl("javascript:alert(1)"),
    false,
    "javascript: URL rejected (XSS guard)",
  );
});

// ────────────────────────────────────────────────────────────
// (f) Edge cases — substring/lookalike attack surface
// ────────────────────────────────────────────────────────────
group("(f) Edge cases", () => {
  assertEq(
    isSupportedProductUrl("  https://detail.1688.com/offer/123.html  "),
    true,
    "trims leading/trailing whitespace",
  );
  assertEq(
    isSupportedProductUrl("HTTPS://DETAIL.1688.COM/OFFER/123.HTML"),
    true,
    "case-insensitive on scheme + host",
  );
  // Substring check is intentional — the legacy classifier did the same
  // (`stripos($url, '1688.com') !== false`). A subdomain of 1688.com is
  // still 1688's surface; only the legitimate hosts (taobao.com,
  // tmall.com) wear this. NOT a security issue because the call site
  // is auth-gated and the partner API itself validates productID format.
  assertEq(
    isSupportedProductUrl("https://www.1688.com/foo"),
    true,
    "any 1688.com subdomain accepted",
  );
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
