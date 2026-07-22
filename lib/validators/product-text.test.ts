/**
 * product-text — the ONE product name / shop / link / image ceiling.
 *
 * Regression lock for owner 2026-07-22 "ไม่สามารถกดสั่งในระบบได้ · ปรับขนาด
 * database จาก 300 เป็น 1000". The block was `adminCartItemSchema.curl`: a bare
 * `.max(300)` against a 401-char pasted 1688 URL, reported to the operator as
 * zod's raw English "Too big: expected string to have <=300 characters".
 *
 * What these assertions defend:
 *   1. a realistic long 1688 / Taobao paste is ACCEPTED on both the customer and
 *      the staff path (the actual bug),
 *   2. the cart and the order schemas agree — no value passes one button and
 *      dies at the next,
 *   3. an absurd value is still refused, and refused in THAI naming the field,
 *   4. no customer-submitted cart field can leak a raw zod message again.
 *
 * Run: tsx lib/validators/product-text.test.ts
 */

import assert from "node:assert/strict";
import {
  PRODUCT_TEXT_MAX,
  PRODUCT_URL_MAX,
  PRODUCT_IMAGE_URL_MAX,
  VARIANT_TEXT_MAX,
  PRODUCT_URL_NORMALISE_CEILING,
  productTitleField,
  shopNameField,
  productUrlField,
  productImageUrlField,
  variantTextField,
} from "./product-text";
import { cartItemSchema } from "./cart";
import { adminCartItemSchema } from "./admin-cart";
import { MAX_ORDER_QTY } from "./order-qty";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

/** Thai = contains at least one Thai character; the zod defaults are ASCII-only. */
const isThai = (s: string) => /[฀-๿]/.test(s);
const firstIssue = (r: { success: boolean; error?: { issues: Array<{ message: string; path: PropertyKey[] }> } }) =>
  r.success ? null : r.error!.issues[0];

console.log("\nproduct-text — constants");

check("PRODUCT_TEXT_MAX is the widened column width (migration 0272)", () => {
  assert.equal(PRODUCT_TEXT_MAX, 1000);
  assert.equal(PRODUCT_URL_MAX, PRODUCT_TEXT_MAX);
  assert.equal(PRODUCT_IMAGE_URL_MAX, PRODUCT_TEXT_MAX);
});

check("the URL normaliser truncates BELOW the column — so a normalised URL can never fail validation", () => {
  assert.ok(
    PRODUCT_URL_NORMALISE_CEILING < PRODUCT_URL_MAX,
    `normalise ceiling ${PRODUCT_URL_NORMALISE_CEILING} must stay under the column ${PRODUCT_URL_MAX}`,
  );
});

console.log("\nthe real block — a pasted 1688 search-result URL");

// Verbatim shape of the longest 1688 URL in prod (tb_order.curl len=264) plus the
// percent-encoded Chinese `keywords=` 1688 appends when the offer is opened from
// a search result. Measured: 401 characters — the value that killed the order.
const OFFER = "686279708656";
const PASTED_1688_URL =
  `https://detail.1688.com/offer/${OFFER}.html` +
  `?spm=a26352.13672862.offerlist.137.d7061e62B1ymog&offerId=${OFFER}` +
  `&sortType=&pageId=&abBizDataType=cbuOffer&hotSaleSkuId=6030149429232` +
  `&trace_log=normal&uuid=b64ca39b15134b6791cdf69dbbbab085&forcePC=1781671978426` +
  `&keywords=${encodeURIComponent("32700磷酸铁锂电池6000mah太阳能路灯储能")}`;

check(`the pasted URL is genuinely over the old 300 ceiling (${PASTED_1688_URL.length} chars)`, () => {
  assert.ok(PASTED_1688_URL.length > 300);
});

check("staff path: the paste is ACCEPTED and normalised down to the canonical offer URL", () => {
  const r = productUrlField({ required: true }).safeParse(PASTED_1688_URL);
  assert.ok(r.success, `expected accept, got ${firstIssue(r)?.message}`);
  assert.equal(r.data, `https://detail.1688.com/offer/${OFFER}.html`);
});

check("customer path: the same paste is accepted too", () => {
  const r = productUrlField().safeParse(PASTED_1688_URL);
  assert.ok(r.success);
});

check("a Taobao paste keeps id + skuId and drops the tracking trail", () => {
  const r = productUrlField().safeParse(
    "https://item.taobao.com/item.htm?id=770123456789&skuId=5555&spm=a21n57.1.0.0&utparam=%7B%22x%22%3A1%7D&scm=1007.abc&pvid=deadbeef",
  );
  assert.ok(r.success);
  assert.equal(r.data, "https://item.taobao.com/item.htm?id=770123456789&skuId=5555");
});

check("a free-text (non-URL) paste is truncated, never rejected", () => {
  const r = productUrlField().safeParse("ขอตามลิงก์นี้นะครับ ".repeat(200));
  assert.ok(r.success);
  assert.ok(r.data!.length <= PRODUCT_URL_MAX);
});

check("an empty optional URL stays empty", () => {
  const r = productUrlField().safeParse("");
  assert.ok(r.success);
  assert.equal(r.data, "");
});

check("a missing REQUIRED staff URL says so in Thai", () => {
  const r = productUrlField({ required: true }).safeParse("   ");
  assert.ok(!r.success);
  assert.equal(firstIssue(r)!.message, "กรุณากรอก URL สินค้า");
});

console.log("\nlong marketplace titles + shop names");

check("a 900-char scraped title is accepted (was refused at 300)", () => {
  assert.ok(productTitleField().safeParse("电池".repeat(450)).success);
  assert.ok(shopNameField().safeParse("深圳市强晟科技有限公司".repeat(80)).success);
});

check("an absurd title is refused — in Thai, naming the field and the limit", () => {
  const r = productTitleField().safeParse("ก".repeat(PRODUCT_TEXT_MAX + 1));
  assert.ok(!r.success);
  const msg = firstIssue(r)!.message;
  assert.ok(isThai(msg), `expected a Thai message, got: ${msg}`);
  assert.ok(msg.includes("ชื่อสินค้า") && msg.includes(String(PRODUCT_TEXT_MAX)), msg);
});

check("shop name / สี / ขนาด also refuse in Thai with their own name", () => {
  const shop = firstIssue(shopNameField().safeParse("ก".repeat(PRODUCT_TEXT_MAX + 1)))!.message;
  assert.ok(isThai(shop) && shop.includes("ชื่อร้าน"), shop);
  const color = firstIssue(variantTextField("สี").safeParse("ก".repeat(VARIANT_TEXT_MAX + 1)))!.message;
  assert.ok(isThai(color) && color.includes("สี"), color);
  const size = firstIssue(variantTextField("ขนาด").safeParse("ก".repeat(VARIANT_TEXT_MAX + 1)))!.message;
  assert.ok(isThai(size) && size.includes("ขนาด"), size);
});

check("image URLs: a long alicdn link passes, a Drive folder link still refuses in Thai", () => {
  const long = "https://cbu01.alicdn.com/img/ibank/" + "O1CN01".repeat(30) + "_!!2211914925804-0-cib.jpg";
  assert.ok(long.length > 200 && long.length <= PRODUCT_IMAGE_URL_MAX);
  assert.ok(productImageUrlField().safeParse(long).success);
  const bad = productImageUrlField().safeParse("https://drive.google.com/drive/folders/1AbC");
  assert.ok(!bad.success);
  assert.ok(isThai(firstIssue(bad)!.message));
});

console.log("\nend-to-end: the two cart schemas must agree");

const LONG_TITLE = "出口32700磷酸铁锂电池6000mah太阳能户外路灯储能3.2v房车锂电池 ".repeat(12); // ~470 chars
const IMAGE = "https://img.alicdn.com/img/ibank/O1CN01S51x9m2Mir2ZJgijr_!!3039359862-0-cib.jpg";

check("STAFF adminCartItemSchema accepts the owner's exact blocked payload", () => {
  const r = adminCartItemSchema.safeParse({
    curl:      PASTED_1688_URL,
    cdetails:  "规格: 32700铁锂-6000mAh",
    ctitle:    LONG_TITLE,
    cnameshop: "深圳强晟科技",
    cprovider: "1",
    cimages:   IMAGE,
    cprice:    7.5,
    camount:   400,
    ccolor:    "",
    csize:     "",
  });
  assert.ok(r.success, `expected accept, got ${firstIssue(r)?.message}`);
});

check("CUSTOMER cartItemSchema accepts the same product", () => {
  const r = cartItemSchema.safeParse({
    provider:   "1688",
    shop_name:  "深圳强晟科技",
    url:        PASTED_1688_URL,
    title:      LONG_TITLE,
    image_path: IMAGE,
    price_cny:  7.5,
    amount:     400,
    details:    "规格: 32700铁锂-6000mAh",
  });
  assert.ok(r.success, `expected accept, got ${firstIssue(r)?.message}`);
});

check("cart and admin agree on the title ceiling — no pass-here-fail-there", () => {
  const overLimit = "ก".repeat(PRODUCT_TEXT_MAX + 1);
  const base = { cprice: 1, camount: 1, cdetails: "x", curl: "https://detail.1688.com/offer/1.html", cprovider: "1" as const };
  const admin = adminCartItemSchema.safeParse({ ...base, ctitle: overLimit });
  const cust  = cartItemSchema.safeParse({ provider: "1688", price_cny: 1, amount: 1, title: overLimit });
  assert.ok(!admin.success && !cust.success, "both must refuse the same over-limit title");
  const atLimit = "ก".repeat(PRODUCT_TEXT_MAX);
  assert.ok(adminCartItemSchema.safeParse({ ...base, ctitle: atLimit }).success);
  assert.ok(cartItemSchema.safeParse({ provider: "1688", price_cny: 1, amount: 1, title: atLimit }).success);
});

check("no customer-submitted cart field can answer in raw English zod again", () => {
  const overs: Array<[string, Record<string, unknown>]> = [
    ["title",      { title:      "ก".repeat(PRODUCT_TEXT_MAX + 1) }],
    ["shop_name",  { shop_name:  "ก".repeat(PRODUCT_TEXT_MAX + 1) }],
    ["color",      { color:      "ก".repeat(VARIANT_TEXT_MAX + 1) }],
    ["size",       { size:       "ก".repeat(VARIANT_TEXT_MAX + 1) }],
    ["details",    { details:    "ก".repeat(5000) }],
    ["amount",     { amount:     MAX_ORDER_QTY + 1 }],
    ["price_cny",  { price_cny:  -1 }],
  ];
  for (const [field, patch] of overs) {
    const r = cartItemSchema.safeParse({ provider: "1688", price_cny: 1, amount: 1, ...patch });
    assert.ok(!r.success, `${field}: expected a refusal`);
    const msg = firstIssue(r)!.message;
    assert.ok(isThai(msg), `${field}: message must be Thai, got "${msg}"`);
    assert.ok(!/Too big|Too small|Invalid/i.test(msg), `${field}: raw zod default leaked → "${msg}"`);
  }
});

check("staff qty ceiling equals the customer one (owner 2026-07-17 · ทั้งลูกค้า และ พนักงาน)", () => {
  const base = { cprice: 1, cdetails: "x", curl: "https://detail.1688.com/offer/1.html", cprovider: "1" as const };
  assert.ok(adminCartItemSchema.safeParse({ ...base, camount: 90_000 }).success);
  assert.ok(adminCartItemSchema.safeParse({ ...base, camount: MAX_ORDER_QTY }).success);
  assert.ok(!adminCartItemSchema.safeParse({ ...base, camount: MAX_ORDER_QTY + 1 }).success);
});

console.log(`\n✅ product-text: ${passed} checks passed\n`);
