/**
 * Unit tests for cart Zod schemas.
 *
 * Critical path — order creation. cartItemSchema validates each line
 * item, placeOrderSchema validates the order header including shipping
 * address (Thai postcode + phone regex).
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import { cartItemSchema, placeOrderSchema, PROVIDERS } from "./cart";

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
  cart_item_ids:     ["00000000-0000-4000-8000-000000000001"],
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
assertOk  ("multiple cart_item_ids",      placeOrderSchema, { ...validOrder, cart_item_ids: [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
]});

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
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
