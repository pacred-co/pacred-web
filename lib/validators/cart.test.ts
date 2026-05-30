/**
 * Unit tests for cart Zod schemas.
 *
 * Critical path — order creation. cartItemSchema validates each line
 * item, placeOrderSchema validates the order header including shipping
 * address (Thai postcode + phone regex).
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import {
  cartItemSchema,
  placeOrderSchema,
  promoCodeSchema,
  applyPromoSchema,
  PROVIDERS,
} from "./cart";

let pass = 0;
let fail = 0;

function assertOk(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: success\n    got: ${JSON.stringify(res)}`); }
}

function assertFail(label: string, schema: { safeParse: (v: unknown) => { success: boolean } }, input: unknown) {
  const res = schema.safeParse(input);
  if (!res.success) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: failure\n    got: success`); }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ────────────────────────────────────────────────────────────
section("cartItemSchema — provider enum + price/amount bounds");
// ────────────────────────────────────────────────────────────

const validCartItem = {
  provider:   "1688" as const,
  shop_name:  "เพื่อนคลังจีน",
  price_cny:  100,
  amount:     2,
};

assertOk  ("happy path 1688",          cartItemSchema, validCartItem);
assertOk  ("provider=taobao",          cartItemSchema, { ...validCartItem, provider: "taobao" });
assertOk  ("provider=tmall",           cartItemSchema, { ...validCartItem, provider: "tmall" });
assertOk  ("provider=shop",            cartItemSchema, { ...validCartItem, provider: "shop" });
assertOk  ("provider=nice",            cartItemSchema, { ...validCartItem, provider: "nice" });
assertOk  ("price_cny=0 (free item)",  cartItemSchema, { ...validCartItem, price_cny: 0 });
assertOk  ("price_cny=999.99",         cartItemSchema, { ...validCartItem, price_cny: 999.99 });
assertOk  ("amount=1",                 cartItemSchema, { ...validCartItem, amount: 1 });
assertOk  ("amount=100",               cartItemSchema, { ...validCartItem, amount: 100 });

assertFail("provider invalid 'aliexpress'", cartItemSchema, { ...validCartItem, provider: "aliexpress" });
assertFail("price_cny negative",            cartItemSchema, { ...validCartItem, price_cny: -10 });
assertFail("amount=0 (not positive)",       cartItemSchema, { ...validCartItem, amount: 0 });
assertFail("amount=-1",                     cartItemSchema, { ...validCartItem, amount: -1 });
assertFail("amount=1.5 (not integer)",      cartItemSchema, { ...validCartItem, amount: 1.5 });

assertOk  ("PROVIDERS const includes all 5", { safeParse: (v: unknown) => ({ success: Array.isArray(v) && (v as readonly string[]).length === 5 }) } as { safeParse: (v: unknown) => { success: boolean } }, PROVIDERS);

// ────────────────────────────────────────────────────────────
section("cartItemSchema — empty-string optionals transformed to undefined");
// ────────────────────────────────────────────────────────────

assertOk("empty url transformed",        cartItemSchema, { ...validCartItem, url: "" });
assertOk("empty title transformed",      cartItemSchema, { ...validCartItem, title: "" });
assertOk("empty image_path transformed", cartItemSchema, { ...validCartItem, image_path: "" });
assertOk("empty color transformed",      cartItemSchema, { ...validCartItem, color: "" });
assertOk("empty size transformed",       cartItemSchema, { ...validCartItem, size: "" });
assertOk("empty details transformed",    cartItemSchema, { ...validCartItem, details: "" });

assertFail("title > 300 chars",          cartItemSchema, { ...validCartItem, title: "a".repeat(301) });
assertFail("details > 2000 chars",       cartItemSchema, { ...validCartItem, details: "a".repeat(2001) });
assertFail("url > 2000 chars",           cartItemSchema, { ...validCartItem, url: "https://example.com/" + "a".repeat(2000) });

// ────────────────────────────────────────────────────────────
section("placeOrderSchema — required address + enum fields");
// ────────────────────────────────────────────────────────────

const validOrder = {
  // D1 cart unification (P0-3/4/5): cart ids are now stringified tb_cart
  // integer ids (was rebuilt cart_items UUIDs).
  cart_item_ids:     ["101"],
  warehouse_china:   "guangzhou" as const,
  transport_type:    "truck" as const,
  pay_method:        "origin" as const,
  crate:             false,
  ship_first_name:   "Pacred",
  ship_last_name:    "Customer",
  ship_phone:        "0812345678",
  ship_address_line: "1/1 ถนนทดสอบ",
  ship_sub_district: "บางรัก",
  ship_district:     "บางรัก",
  ship_province:     "กรุงเทพ",
  ship_postal_code:  "10500",
};

assertOk  ("happy path full order",       placeOrderSchema, validOrder);
assertOk  ("warehouse=yiwu",              placeOrderSchema, { ...validOrder, warehouse_china: "yiwu" });
assertOk  ("transport=ship",              placeOrderSchema, { ...validOrder, transport_type: "ship" });
assertOk  ("transport=air",               placeOrderSchema, { ...validOrder, transport_type: "air" });
assertOk  ("pay_method=destination",      placeOrderSchema, { ...validOrder, pay_method: "destination" });
assertOk  ("crate=true",                  placeOrderSchema, { ...validOrder, crate: true });
assertOk  ("with ship_phone2",            placeOrderSchema, { ...validOrder, ship_phone2: "0822334455" });
assertOk  ("with note_user",              placeOrderSchema, { ...validOrder, note_user: "ส่งบ้านพ่อ" });
assertOk  ("multiple cart_item_ids (numeric strings)", placeOrderSchema, { ...validOrder, cart_item_ids: [
  "101",
  "102",
  "103",
]});
// D1 cart unification: a rebuilt-style UUID is now rejected (ids are tb_cart ints).
assertFail("UUID cart_item_id rejected",  placeOrderSchema, { ...validOrder, cart_item_ids: ["00000000-0000-4000-8000-000000000001"] });
assertFail("non-numeric cart_item_id rejected", placeOrderSchema, { ...validOrder, cart_item_ids: ["abc"] });
assertFail("empty cart_item_ids rejected", placeOrderSchema, { ...validOrder, cart_item_ids: [] });

// ────────────────────────────────────────────────────────────
section("placeOrderSchema — Thai phone regex (0\\d{8,9})");
// ────────────────────────────────────────────────────────────

assertOk  ("9-digit '081234567' OK",       placeOrderSchema, { ...validOrder, ship_phone: "081234567" });
assertOk  ("10-digit '0812345678' OK",     placeOrderSchema, { ...validOrder, ship_phone: "0812345678" });
assertFail("8-digit '01234567' too short", placeOrderSchema, { ...validOrder, ship_phone: "01234567" });
assertFail("11-digit '08123456789'",       placeOrderSchema, { ...validOrder, ship_phone: "08123456789" });
assertFail("no-leading-zero '812345678'",  placeOrderSchema, { ...validOrder, ship_phone: "812345678" });
assertFail("with +66 prefix",              placeOrderSchema, { ...validOrder, ship_phone: "+66812345678" });
assertFail("with dashes 081-234-5678",     placeOrderSchema, { ...validOrder, ship_phone: "081-234-5678" });

// ────────────────────────────────────────────────────────────
section("placeOrderSchema — postal_code regex (5 digits)");
// ────────────────────────────────────────────────────────────

assertOk  ("'10500' BKK 5-digit OK",       placeOrderSchema, { ...validOrder, ship_postal_code: "10500" });
assertOk  ("'73110' Nakhon Pathom OK",     placeOrderSchema, { ...validOrder, ship_postal_code: "73110" });
assertFail("'1050' 4-digit too short",     placeOrderSchema, { ...validOrder, ship_postal_code: "1050" });
assertFail("'105000' 6-digit too long",    placeOrderSchema, { ...validOrder, ship_postal_code: "105000" });
assertFail("'1050A' with letter",          placeOrderSchema, { ...validOrder, ship_postal_code: "1050A" });

// ────────────────────────────────────────────────────────────
section("placeOrderSchema — required fields cannot be empty");
// ────────────────────────────────────────────────────────────

assertFail("missing cart_item_ids",         placeOrderSchema, { ...validOrder, cart_item_ids: [] });
assertFail("cart_item_ids invalid uuid",    placeOrderSchema, { ...validOrder, cart_item_ids: ["not-a-uuid"] });
assertFail("warehouse_china invalid",       placeOrderSchema, { ...validOrder, warehouse_china: "shenzhen" });
assertFail("empty first_name",              placeOrderSchema, { ...validOrder, ship_first_name: "" });
assertFail("empty last_name",               placeOrderSchema, { ...validOrder, ship_last_name: "" });
assertFail("empty address_line",            placeOrderSchema, { ...validOrder, ship_address_line: "" });
assertFail("empty sub_district",            placeOrderSchema, { ...validOrder, ship_sub_district: "" });
assertFail("empty district",                placeOrderSchema, { ...validOrder, ship_district: "" });
assertFail("empty province",                placeOrderSchema, { ...validOrder, ship_province: "" });

// ────────────────────────────────────────────────────────────
section("promoCodeSchema — code length + uppercase transform + cartTotal bounds");
// ────────────────────────────────────────────────────────────
//
// Legacy fidelity — the legacy `check-proV.php` accepts ANY string
// (it just queries `tb_pro_valentine` by userID, code is unused). Our
// validator gates the input surface: 2-32 chars, trim, uppercase. The
// `cartTotal` is required (non-negative) and `userId` is the optional
// member_code ("PR<n>" up to 30 chars).

assertOk  ("happy path 'PR19' cartTotal=500",   promoCodeSchema, { code: "PR19", cartTotal: 500 });
assertOk  ("with userId 'PR12345'",             promoCodeSchema, { code: "PR19", cartTotal: 500, userId: "PR12345" });
assertOk  ("cartTotal=0 valid",                 promoCodeSchema, { code: "PR19", cartTotal: 0 });
assertOk  ("PCSF freeship code",                promoCodeSchema, { code: "PCSF", cartTotal: 100 });
assertOk  ("lowercase 'pcsf' uppercased",       promoCodeSchema, { code: "pcsf", cartTotal: 100 });

// Verify the .toUpperCase() transform actually fired — pull the parsed
// data out and confirm.
const upperRes = promoCodeSchema.safeParse({ code: "valentine", cartTotal: 0 });
if (upperRes.success && upperRes.data.code === "VALENTINE") {
  pass++; console.log("  ✓ transform: 'valentine' → 'VALENTINE'");
} else {
  fail++; console.error("  ✗ transform: 'valentine' should become 'VALENTINE'");
}

// Trim transform — whitespace stripped before upper.
const trimRes = promoCodeSchema.safeParse({ code: "  pr19  ", cartTotal: 0 });
if (trimRes.success && trimRes.data.code === "PR19") {
  pass++; console.log("  ✓ transform: '  pr19  ' trimmed + uppercased to 'PR19'");
} else {
  fail++; console.error("  ✗ transform: '  pr19  ' should become 'PR19'");
}

assertFail("code too short '' (under 2)",       promoCodeSchema, { code: "", cartTotal: 0 });
assertFail("code too short 'X' (under 2)",      promoCodeSchema, { code: "X", cartTotal: 0 });
assertFail("code too long (33 chars)",          promoCodeSchema, { code: "A".repeat(33), cartTotal: 0 });
assertFail("cartTotal negative",                promoCodeSchema, { code: "PR19", cartTotal: -1 });
assertFail("cartTotal missing",                 promoCodeSchema, { code: "PR19" });
assertFail("code missing",                      promoCodeSchema, { cartTotal: 0 });
assertFail("cartTotal as string '500'",         promoCodeSchema, { code: "PR19", cartTotal: "500" });
assertFail("userId too long (31 chars)",        promoCodeSchema, { code: "PR19", cartTotal: 0, userId: "P".repeat(31) });

// ────────────────────────────────────────────────────────────
section("applyPromoSchema — promoCode trim + uppercase");
// ────────────────────────────────────────────────────────────

assertOk  ("happy path 'PR19'",                 applyPromoSchema, { promoCode: "PR19" });
assertOk  ("PCSF",                              applyPromoSchema, { promoCode: "PCSF" });
assertOk  ("lowercase uppercased",              applyPromoSchema, { promoCode: "pcsf" });

const applyUpperRes = applyPromoSchema.safeParse({ promoCode: "  pcsf  " });
if (applyUpperRes.success && applyUpperRes.data.promoCode === "PCSF") {
  pass++; console.log("  ✓ apply transform: trim+upper '  pcsf  ' → 'PCSF'");
} else {
  fail++; console.error("  ✗ apply transform: '  pcsf  ' should become 'PCSF'");
}

assertFail("apply too short ''",                applyPromoSchema, { promoCode: "" });
assertFail("apply too short 'A'",               applyPromoSchema, { promoCode: "A" });
assertFail("apply too long (33 chars)",         applyPromoSchema, { promoCode: "A".repeat(33) });
assertFail("apply missing",                     applyPromoSchema, {});

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
