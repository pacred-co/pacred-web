/**
 * Unit tests for lib/china-search/short-url-helpers.ts — the pure
 * classifier + scraper behind the China-search short-URL resolver (P-51).
 *
 * `detectShortUrl` classifies m.tb.cn / qr.1688.com share links;
 * `scrapeProductId` extracts a numeric productID from any URL / HTML /
 * query string via the PHP-audit regex order. Both are pure (no fetch),
 * so they unit test directly.
 *
 * Harness: plain tsx script, matches lib/china-search/laonet-helpers.test.ts.
 */

import { detectShortUrl, scrapeProductId } from "./short-url-helpers";

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

function deep<T>(name: string, actual: T, expected: T): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}\n      expected ${e}\n      got      ${a}`);
    console.log(`  ✗ ${name}`);
  }
}

// ════════════════════════════════════════════════════════════════════
// detectShortUrl — Taobao m.tb.cn
// ════════════════════════════════════════════════════════════════════
console.log("\ndetectShortUrl — Taobao m.tb.cn");

deep(
  "m.tb.cn/h.abc → provider 2, taobao cache subpath",
  detectShortUrl("https://m.tb.cn/h.abc"),
  { provider: "2", tk: "h.abc", cachePath: "/get/taobao/" },
);
deep(
  "m.tb.cn bare token",
  detectShortUrl("https://m.tb.cn/Xy9Z"),
  { provider: "2", tk: "Xy9Z", cachePath: "/get/taobao/" },
);
eq(
  "m.tb.cn with empty path → null",
  detectShortUrl("https://m.tb.cn/"),
  null,
);
deep(
  "m.tb.cn host is case-insensitive",
  detectShortUrl("https://M.TB.CN/h.abc"),
  { provider: "2", tk: "h.abc", cachePath: "/get/taobao/" },
);

// ════════════════════════════════════════════════════════════════════
// detectShortUrl — 1688 qr.1688.com
// ════════════════════════════════════════════════════════════════════
console.log("\ndetectShortUrl — 1688 qr.1688.com");

deep(
  "qr.1688.com/s/TOKEN → provider 1, /get/ subpath",
  detectShortUrl("https://qr.1688.com/s/abc123"),
  { provider: "1", tk: "abc123", cachePath: "/get/" },
);
deep(
  "qr.1688.com/s/TOKEN with trailing slash stripped",
  detectShortUrl("https://qr.1688.com/s/abc123/"),
  { provider: "1", tk: "abc123", cachePath: "/get/" },
);
eq(
  "qr.1688.com/s/ with no token → null",
  detectShortUrl("https://qr.1688.com/s/"),
  null,
);

// ════════════════════════════════════════════════════════════════════
// detectShortUrl — non-matching / malformed
// ════════════════════════════════════════════════════════════════════
console.log("\ndetectShortUrl — non-matching input");

eq("full taobao url (not short) → null", detectShortUrl("https://item.taobao.com/item.htm?id=12345678"), null);
eq("full 1688 url → null", detectShortUrl("https://detail.1688.com/offer/123456789.html"), null);
eq("unknown host → null", detectShortUrl("https://example.com/x"), null);
eq("garbage string (not a URL) → null", detectShortUrl("not a url at all"), null);
eq("empty string → null", detectShortUrl(""), null);

// ════════════════════════════════════════════════════════════════════
// scrapeProductId — regex priority order
// ════════════════════════════════════════════════════════════════════
console.log("\nscrapeProductId — extraction patterns");

eq("?id= querystring", scrapeProductId("https://item.taobao.com/item.htm?id=654321789"), "654321789");
eq("&id= mid-querystring", scrapeProductId("https://x.com/p?foo=1&id=987654321&bar=2"), "987654321");
eq("encoded Id%3D (Taobao redirect)", scrapeProductId("https://login.taobao.com/?redirect=Id%3D112233445"), "112233445");
eq("encoded Foffer%2F (1688 redirect)", scrapeProductId("https://x.com/?u=Foffer%2F778899001"), "778899001");
eq("/offer/<digits>.html plain", scrapeProductId("https://detail.1688.com/offer/556677889.html"), "556677889");
eq("?offerId= alternate querystring", scrapeProductId("https://x.com/p?offerId=334455667"), "334455667");

// priority: ?id= wins over /offer/ when both present
eq(
  "?id= takes priority over /offer/ when both present",
  scrapeProductId("https://x.com/offer/111111111.html?id=222222222"),
  "222222222",
);

// boundary / negative
eq("ids shorter than 6 digits are ignored", scrapeProductId("https://x.com/p?id=12345"), null);
eq("no id anywhere → null", scrapeProductId("https://example.com/about"), null);
eq("empty string → null", scrapeProductId(""), null);
eq("id embedded in HTML body still extracted", scrapeProductId('<a href="?id=900900900">link</a>'), "900900900");
eq("Id%3D is case-insensitive", scrapeProductId("https://x.com/?u=iD%3d121212121"), "121212121");

// ════════════════════════════════════════════════════════════════════
console.log(`\n  ${pass} pass · ${fail} fail`);
if (failures.length > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
