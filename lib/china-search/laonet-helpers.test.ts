/**
 * Unit tests for Laonet helpers (P-53).
 *
 * Imports from ./laonet-helpers (no server-only) so tsx can load without
 * the Next.js sentinel breaking the test runner.  The full
 * laonetImageSearch network flow (base64 upload → imgid → search) is
 * verified by the manual smoke test (upload product photo in
 * /service-order/add → see similar 1688 products) once vendor allowlists
 * Vercel egress (P-55).
 *
 * Run with:
 *   pnpm tsx lib/china-search/laonet-helpers.test.ts
 *   (or `pnpm test` to run alongside the rest of the suite)
 */

import {
  buildLaonetUploadUrl,
  buildLaonetSearchUrl,
  parseLaonetUploadResponse,
  parseLaonetSearchResponse,
} from "./laonet-helpers";

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

console.log("=== laonet-helpers ===");

// ────────────────────────────────────────────────────────────
// (a) buildLaonetUploadUrl
// ────────────────────────────────────────────────────────────
group("(a) buildLaonetUploadUrl", () => {
  const url = buildLaonetUploadUrl(
    "https://laonet.online",
    "iVBORw0KGgo=", // tiny base64 sample
    "tam011plus@gmail.com",
  );
  assertEq(
    url,
    "https://laonet.online/index.php?route=api_tester/call&api_name=upload_img&imgcode=iVBORw0KGgo%3D&key=tam011plus%40gmail.com",
    "encodes imgcode + key correctly",
  );

  // base trailing slash should be trimmed
  const url2 = buildLaonetUploadUrl(
    "https://laonet.online/",
    "abc",
    "k",
  );
  assertEq(
    url2,
    "https://laonet.online/index.php?route=api_tester/call&api_name=upload_img&imgcode=abc&key=k",
    "trailing slash on base trimmed",
  );
});

// ────────────────────────────────────────────────────────────
// (b) buildLaonetSearchUrl
// ────────────────────────────────────────────────────────────
group("(b) buildLaonetSearchUrl", () => {
  const url = buildLaonetSearchUrl(
    "https://laonet.online",
    "img-12345",
    "tam011plus@gmail.com",
  );
  assertEq(
    url,
    "https://laonet.online/index.php?route=api_tester%2Fcall&api_name=item_search_img&imgid=img-12345&key=tam011plus%40gmail.com",
    "encodes imgid + key, builds canonical URL",
  );
});

// ────────────────────────────────────────────────────────────
// (c) parseLaonetUploadResponse — top-level imgid
// ────────────────────────────────────────────────────────────
group("(c) parseLaonetUploadResponse — top-level fields", () => {
  assertEq(parseLaonetUploadResponse({ imgid: "abc-123" }),  "abc-123",   "top-level imgid");
  assertEq(parseLaonetUploadResponse({ img_id: "x42" }),     "x42",       "top-level img_id");
  assertEq(parseLaonetUploadResponse({ id: "snake-case" }),  "snake-case", "top-level id");
  assertEq(parseLaonetUploadResponse({ url: "https://x.com/i.jpg" }), "https://x.com/i.jpg", "top-level url as id");
});

// ────────────────────────────────────────────────────────────
// (d) parseLaonetUploadResponse — nested data/result
// ────────────────────────────────────────────────────────────
group("(d) parseLaonetUploadResponse — nested wrappers", () => {
  assertEq(parseLaonetUploadResponse({ data:   { imgid: "d-1" } }), "d-1", "data.imgid");
  assertEq(parseLaonetUploadResponse({ data:   { img_id: "d-2" } }), "d-2", "data.img_id");
  assertEq(parseLaonetUploadResponse({ result: { imgid: "r-1" } }), "r-1", "result.imgid");
  assertEq(parseLaonetUploadResponse({ result: { url: "https://r.com" } }), "https://r.com", "result.url");
});

// ────────────────────────────────────────────────────────────
// (e) parseLaonetUploadResponse — defensive
// ────────────────────────────────────────────────────────────
group("(e) parseLaonetUploadResponse — defensive", () => {
  assertEq(parseLaonetUploadResponse(null),          null, "null → null");
  assertEq(parseLaonetUploadResponse(undefined),     null, "undefined → null");
  assertEq(parseLaonetUploadResponse("string body"), null, "string body → null");
  assertEq(parseLaonetUploadResponse({}),            null, "empty object → null");
  assertEq(parseLaonetUploadResponse({ imgid: "" }), null, "empty string imgid → null");
  assertEq(parseLaonetUploadResponse({ imgid: 123 }),null, "non-string imgid → null");
});

// ────────────────────────────────────────────────────────────
// (f) parseLaonetSearchResponse — canonical hits
// ────────────────────────────────────────────────────────────
group("(f) parseLaonetSearchResponse — canonical hits", () => {
  const json = {
    items: {
      item: [
        {
          num_iid:     "808456582517",
          title:       "ตัวอย่าง 1688",
          detail_url:  "https://detail.1688.com/offer/808456582517.html",
          pic_url:     "https://img.alicdn.com/i.jpg",
          price:       150,
          promotion_price: 99,
          shop:        "Laonet Test Shop",
        },
      ],
    },
  };
  const hits = parseLaonetSearchResponse(json);
  assertEq(hits.length,         1,                  "1 hit");
  assertEq(hits[0]?.product_id, "808456582517",     "num_iid → product_id");
  assertEq(hits[0]?.provider,   "1688",             "always 1688 (Laonet image search backend)");
  assertEq(hits[0]?.title,      "ตัวอย่าง 1688",     "title preserved");
  assertEq(hits[0]?.url,        "https://detail.1688.com/offer/808456582517.html", "detail_url → url");
  assertEq(hits[0]?.image_url,  "https://img.alicdn.com/i.jpg", "pic_url → image_url");
  assertEq(hits[0]?.price_cny,  99,                 "promo wins when < base");
  assertEq(hits[0]?.shop_name,  "Laonet Test Shop", "shop → shop_name");
});

// ────────────────────────────────────────────────────────────
// (g) parseLaonetSearchResponse — alt response shapes + edge
// ────────────────────────────────────────────────────────────
group("(g) parseLaonetSearchResponse — alt shapes + edge", () => {
  // flat items
  assertEq(
    parseLaonetSearchResponse({ items: [{ title: "X", detail_url: "https://x.com/x" }] }).length,
    1,
    "items: [] flat → parsed",
  );
  // legacy data
  assertEq(
    parseLaonetSearchResponse({ data: [{ title: "Y", detail_url: "https://x.com/y" }] }).length,
    1,
    "data: [] legacy → parsed",
  );
  // null/undefined/string
  assertEq(parseLaonetSearchResponse(null).length,      0, "null → []");
  assertEq(parseLaonetSearchResponse(undefined).length, 0, "undefined → []");
  assertEq(parseLaonetSearchResponse("xxx").length,     0, "string → []");
  // skip rows missing both title + url
  assertEq(
    parseLaonetSearchResponse({ items: { item: [{}, { title: "Z", detail_url: "https://x.com/z" }] } }).length,
    1,
    "rows missing title+url skipped",
  );
});

// ────────────────────────────────────────────────────────────
// summary
// ────────────────────────────────────────────────────────────
console.log(`\n${passed} pass, ${failed} fail`);
if (failed > 0) process.exit(1);
