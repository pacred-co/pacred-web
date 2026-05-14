/**
 * Unit tests for AkuCargo helpers (P-52).
 *
 * Imports from ./akucargo-helpers (no server-only) so tsx can load
 * without dragging the Next.js sentinel into a node runner.  The full
 * akucargoSearch network flow is verified by the manual smoke test
 * (type a Chinese keyword in /service-order/add → see real results)
 * once vendor allowlists Vercel egress (P-55).
 *
 * Run with:
 *   pnpm tsx lib/china-search/akucargo-helpers.test.ts
 *   (or `pnpm test` to run alongside the rest of the suite)
 */

import { buildAkucargoUrl, parseAkucargoResponse } from "./akucargo-helpers";

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

console.log("=== akucargo-helpers ===");

// ────────────────────────────────────────────────────────────
// (a) buildAkucargoUrl — 1688 (no /taobao infix)
// ────────────────────────────────────────────────────────────
group("(a) buildAkucargoUrl — 1688", () => {
  const url = buildAkucargoUrl(
    "https://akucargo.com/api3/api-2022",
    "ขายส่ง",
    1,
    "1688",
  );
  // URLSearchParams encodes Thai → percent-encoded UTF-8
  assertEq(
    url,
    "https://akucargo.com/api3/api-2022/search/v1/?q=%E0%B8%82%E0%B8%B2%E0%B8%A2%E0%B8%AA%E0%B9%88%E0%B8%87&page=1&page_size=15&lang=zh-CN",
    "1688 path = /search/v1/ (no taobao infix)",
  );
});

// ────────────────────────────────────────────────────────────
// (b) buildAkucargoUrl — taobao (with /taobao infix)
// ────────────────────────────────────────────────────────────
group("(b) buildAkucargoUrl — taobao", () => {
  const url = buildAkucargoUrl(
    "https://akucargo.com/api3/api-2022",
    "shoes",
    2,
    "taobao",
  );
  assertEq(
    url,
    "https://akucargo.com/api3/api-2022/search/v1/taobao/?q=shoes&page=2&page_size=15&lang=zh-CN",
    "taobao path = /search/v1/taobao/",
  );
});

// ────────────────────────────────────────────────────────────
// (c) buildAkucargoUrl — base URL trailing slash + bad page
// ────────────────────────────────────────────────────────────
group("(c) buildAkucargoUrl — defensive inputs", () => {
  assertEq(
    buildAkucargoUrl("https://x.com/api/", "foo", 1, "1688"),
    "https://x.com/api/search/v1/?q=foo&page=1&page_size=15&lang=zh-CN",
    "trailing slash on base trimmed",
  );
  assertEq(
    buildAkucargoUrl("https://x.com/api", "foo", 0, "1688"),
    "https://x.com/api/search/v1/?q=foo&page=1&page_size=15&lang=zh-CN",
    "page=0 → page=1",
  );
  assertEq(
    buildAkucargoUrl("https://x.com/api", "foo", -5, "1688"),
    "https://x.com/api/search/v1/?q=foo&page=1&page_size=15&lang=zh-CN",
    "page=negative → page=1",
  );
});

// ────────────────────────────────────────────────────────────
// (d) parseAkucargoResponse — canonical items.item[]
// ────────────────────────────────────────────────────────────
group("(d) parseAkucargoResponse — canonical items.item[]", () => {
  const json = {
    items: {
      item: [
        {
          num_iid:     "808456582517",
          title:       "ทดสอบสินค้า",
          detail_url:  "https://item.taobao.com/item.htm?id=808456582517",
          pic_url:     "https://img.alicdn.com/foo.jpg",
          price:       "120.00",
          promotion_price: "98.50",
          shop:        "Test Shop",
          sales:       523,
        },
      ],
    },
  };
  const hits = parseAkucargoResponse(json, "taobao");
  assertEq(hits.length,        1,                      "1 hit returned");
  assertEq(hits[0]?.product_id, "808456582517",        "num_iid → product_id");
  assertEq(hits[0]?.title,     "ทดสอบสินค้า",          "title preserved");
  assertEq(hits[0]?.url,       "https://item.taobao.com/item.htm?id=808456582517", "detail_url → url");
  assertEq(hits[0]?.image_url, "https://img.alicdn.com/foo.jpg", "pic_url → image_url");
  assertEq(hits[0]?.price_cny, 98.5,                   "promotion_price wins when < price");
  assertEq(hits[0]?.shop_name, "Test Shop",            "shop → shop_name");
  assertEq(hits[0]?.provider,  "taobao",               "platform passed through");
});

// ────────────────────────────────────────────────────────────
// (e) parseAkucargoResponse — fallback price logic
// ────────────────────────────────────────────────────────────
group("(e) parseAkucargoResponse — price fallback rules", () => {
  // promo === 0 → ignore promo
  const j1 = { items: { item: [{ title: "A", detail_url: "https://x.com/a", price: 100, promotion_price: 0 }] } };
  assertEq(parseAkucargoResponse(j1, "1688")[0]?.price_cny, 100, "promo=0 → use base");

  // promo present but >= base → use base (avoids surfacing identical/higher promo)
  const j2 = { items: { item: [{ title: "B", detail_url: "https://x.com/b", price: 50, promotion_price: 80 }] } };
  assertEq(parseAkucargoResponse(j2, "1688")[0]?.price_cny, 50, "promo >= base → use base");

  // base missing, promo present → use promo
  const j3 = { items: { item: [{ title: "C", detail_url: "https://x.com/c", promotion_price: 25 }] } };
  assertEq(parseAkucargoResponse(j3, "1688")[0]?.price_cny, 25, "base missing → use promo");

  // both missing → undefined
  const j4 = { items: { item: [{ title: "D", detail_url: "https://x.com/d" }] } };
  assertEq(parseAkucargoResponse(j4, "1688")[0]?.price_cny, undefined, "both missing → undefined");
});

// ────────────────────────────────────────────────────────────
// (f) parseAkucargoResponse — alt response shapes
// ────────────────────────────────────────────────────────────
group("(f) parseAkucargoResponse — alt response shapes", () => {
  // items: [...]  (flat array variant)
  const j1 = { items: [{ title: "X", detail_url: "https://x.com/x" }] };
  assertEq(parseAkucargoResponse(j1, "1688").length, 1, "items: [] flat array → parsed");

  // data: [...]   (legacy fallback)
  const j2 = { data: [{ title: "Y", detail_url: "https://x.com/y" }] };
  assertEq(parseAkucargoResponse(j2, "1688").length, 1, "data: [] legacy → parsed");
});

// ────────────────────────────────────────────────────────────
// (g) parseAkucargoResponse — defensive edge cases
// ────────────────────────────────────────────────────────────
group("(g) parseAkucargoResponse — defensive edge cases", () => {
  assertEq(parseAkucargoResponse(null,             "1688").length, 0, "null → []");
  assertEq(parseAkucargoResponse(undefined,        "1688").length, 0, "undefined → []");
  assertEq(parseAkucargoResponse("not an object",  "1688").length, 0, "string → []");
  assertEq(parseAkucargoResponse({ items: { item: [] } }, "1688").length, 0, "empty list → []");
  assertEq(
    parseAkucargoResponse({ items: { item: [{}, { title: "Z", detail_url: "https://x.com/z" }] } }, "1688").length,
    1,
    "rows with no title AND no url skipped",
  );
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
