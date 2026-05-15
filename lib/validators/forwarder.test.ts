/**
 * Unit tests for forwarder (service-import) Zod schemas.
 *
 * The biggest customer form on Pacred — multi-enum classification +
 * required shipping address + measurements + optional services +
 * line items array. Critical for cargo revenue path.
 *
 * Pattern matches lib/validators/auth.test.ts.
 */

import { forwarderSchema, forwarderItemSchema } from "./forwarder";

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
section("forwarderItemSchema — required name + qty + optional dims");
// ────────────────────────────────────────────────────────────

const validItem = {
  product_name: "เสื้อยืดทดสอบ",
  product_qty:  10,
};

assertOk  ("happy path minimal",            forwarderItemSchema, validItem);
assertOk  ("with tracking",                 forwarderItemSchema, { ...validItem, product_tracking: "SF1234567890" });
assertOk  ("with dimensions",               forwarderItemSchema, { ...validItem, width_cm: 30, length_cm: 40, height_cm: 20, weight_per_item_kg: 0.5 });
assertOk  ("empty tracking transformed",    forwarderItemSchema, { ...validItem, product_tracking: "" });
assertOk  ("product_type_code 'gen'",       forwarderItemSchema, { ...validItem, product_type_code: "gen" });

assertFail("missing product_name",          forwarderItemSchema, { ...validItem, product_name: "" });
assertFail("qty=0 (not positive)",          forwarderItemSchema, { ...validItem, product_qty: 0 });
assertFail("qty=-1",                        forwarderItemSchema, { ...validItem, product_qty: -1 });
assertFail("qty=1.5 (not int)",             forwarderItemSchema, { ...validItem, product_qty: 1.5 });
assertFail("width_cm negative",             forwarderItemSchema, { ...validItem, width_cm: -10 });
assertFail("product_type_code too long",    forwarderItemSchema, { ...validItem, product_type_code: "way-too-long" });

// ────────────────────────────────────────────────────────────
section("forwarderSchema — classification enums");
// ────────────────────────────────────────────────────────────

const validForwarder = {
  source_warehouse: "guangzhou" as const,
  transport_type:   "truck" as const,
  product_type:     "general" as const,
  // Required ship address
  ship_first_name:   "Pacred",
  ship_last_name:    "Customer",
  ship_phone:        "0812345678",
  ship_address_line: "1/1 ถนนทดสอบ",
  ship_sub_district: "บางรัก",
  ship_district:     "บางรัก",
  ship_province:     "กรุงเทพ",
  ship_postal_code:  "10500",
  // Required measurements
  weight_kg: 5,
  width_cm:  30,
  length_cm: 40,
  height_cm: 20,
};

assertOk  ("happy path minimal",                 forwarderSchema, validForwarder);
assertOk  ("source_warehouse=yiwu",              forwarderSchema, { ...validForwarder, source_warehouse: "yiwu" });
assertOk  ("transport=ship",                     forwarderSchema, { ...validForwarder, transport_type: "ship" });
assertOk  ("transport=air",                      forwarderSchema, { ...validForwarder, transport_type: "air" });
assertOk  ("product_type=tisi",                  forwarderSchema, { ...validForwarder, product_type: "tisi" });
assertOk  ("product_type=fda",                   forwarderSchema, { ...validForwarder, product_type: "fda" });
assertOk  ("product_type=special",               forwarderSchema, { ...validForwarder, product_type: "special" });
assertOk  ("rate_basis=kg",                      forwarderSchema, { ...validForwarder, rate_basis: "kg" });
assertOk  ("rate_basis=cbm",                     forwarderSchema, { ...validForwarder, rate_basis: "cbm" });
assertOk  ("rate_basis=auto (default)",          forwarderSchema, { ...validForwarder, rate_basis: "auto" });
assertOk  ("rate_basis omitted (uses default)",  forwarderSchema, { ...validForwarder });

assertFail("source_warehouse=shenzhen invalid",  forwarderSchema, { ...validForwarder, source_warehouse: "shenzhen" });
assertFail("transport=plane invalid",            forwarderSchema, { ...validForwarder, transport_type: "plane" });
assertFail("product_type=fdaplus invalid",       forwarderSchema, { ...validForwarder, product_type: "fdaplus" });
assertFail("rate_basis=lbs invalid",             forwarderSchema, { ...validForwarder, rate_basis: "lbs" });

// ────────────────────────────────────────────────────────────
section("forwarderSchema — shipping address required + Thai phone/postal");
// ────────────────────────────────────────────────────────────

assertFail("missing first_name",                 forwarderSchema, { ...validForwarder, ship_first_name: "" });
assertFail("missing last_name",                  forwarderSchema, { ...validForwarder, ship_last_name: "" });
assertFail("phone too short",                    forwarderSchema, { ...validForwarder, ship_phone: "01234567" });
assertFail("phone no leading 0",                 forwarderSchema, { ...validForwarder, ship_phone: "812345678" });
assertFail("phone with +66 prefix",              forwarderSchema, { ...validForwarder, ship_phone: "+66812345678" });
assertFail("missing address_line",               forwarderSchema, { ...validForwarder, ship_address_line: "" });
assertFail("missing sub_district",               forwarderSchema, { ...validForwarder, ship_sub_district: "" });
assertFail("missing district",                   forwarderSchema, { ...validForwarder, ship_district: "" });
assertFail("missing province",                   forwarderSchema, { ...validForwarder, ship_province: "" });
assertFail("postal_code 4 digits",               forwarderSchema, { ...validForwarder, ship_postal_code: "1011" });
assertFail("postal_code 6 digits",               forwarderSchema, { ...validForwarder, ship_postal_code: "101100" });

assertOk  ("optional phone2 valid",              forwarderSchema, { ...validForwarder, ship_phone2: "0822334455" });
assertOk  ("empty phone2 transformed",           forwarderSchema, { ...validForwarder, ship_phone2: "" });
assertFail("phone2 malformed",                   forwarderSchema, { ...validForwarder, ship_phone2: "823344" });

// ────────────────────────────────────────────────────────────
section("forwarderSchema — measurements + box count");
// ────────────────────────────────────────────────────────────

assertOk  ("box_count default 1",                forwarderSchema, validForwarder);
assertOk  ("box_count=5",                        forwarderSchema, { ...validForwarder, box_count: 5 });
assertOk  ("weight_kg=0 (free shipping case)",   forwarderSchema, { ...validForwarder, weight_kg: 0 });
assertFail("box_count=0",                        forwarderSchema, { ...validForwarder, box_count: 0 });
assertFail("box_count=1.5 (not int)",            forwarderSchema, { ...validForwarder, box_count: 1.5 });
assertFail("weight_kg negative",                 forwarderSchema, { ...validForwarder, weight_kg: -1 });
assertFail("width_cm negative",                  forwarderSchema, { ...validForwarder, width_cm: -1 });

// ────────────────────────────────────────────────────────────
section("forwarderSchema — optional services + items array");
// ────────────────────────────────────────────────────────────

assertOk  ("with crate=true",                    forwarderSchema, { ...validForwarder, crate: true });
assertOk  ("with qc=true",                       forwarderSchema, { ...validForwarder, qc: true });
assertOk  ("with domestic_china_thb=500",        forwarderSchema, { ...validForwarder, domestic_china_thb: 500 });
assertOk  ("with thailand_delivery_thb=300",     forwarderSchema, { ...validForwarder, thailand_delivery_thb: 300 });
assertOk  ("with other_price + desc",            forwarderSchema, { ...validForwarder, other_price: 100, other_price_desc: "ค่าตีลังพิเศษ" });
assertOk  ("with cover_image_path",              forwarderSchema, { ...validForwarder, cover_image_path: "forwarder/covers/abc.jpg" });
assertOk  ("with extra_image_paths array",       forwarderSchema, { ...validForwarder, extra_image_paths: ["a.jpg", "b.jpg"] });
assertOk  ("with items array",                   forwarderSchema, { ...validForwarder, items: [{ product_name: "ทดสอบ", product_qty: 5 }] });
assertOk  ("with detail + note_user",            forwarderSchema, { ...validForwarder, detail: "รายละเอียดสินค้า", note_user: "ส่งด่วน" });

assertFail("domestic_china_thb negative",        forwarderSchema, { ...validForwarder, domestic_china_thb: -100 });
assertFail("thailand_delivery_thb negative",     forwarderSchema, { ...validForwarder, thailand_delivery_thb: -50 });
assertFail("invalid item in items array",        forwarderSchema, { ...validForwarder, items: [{ product_name: "", product_qty: 1 }] });
assertFail("detail > 5000 chars",                forwarderSchema, { ...validForwarder, detail: "x".repeat(5001) });

// ────────────────────────────────────────────────────────────
console.log(`\n  ${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
