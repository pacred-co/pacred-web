// Unit tests for lib/warehouse/rate-dimensions.ts — V-D2 canonical rate-axis
// labels (warehouse × transport × product-type). No framework; tsx asserts.

import {
  RATE_WAREHOUSE_CODES,
  RATE_WAREHOUSE_LABEL,
  RATE_TRANSPORT_CODES,
  RATE_TRANSPORT_LABEL,
  RATE_TRANSPORT_LABEL_EMOJI,
  RATE_PRODUCT_CODES,
  RATE_PRODUCT_LABEL,
  RATE_PRODUCT_CODES_EXT,
  RATE_PRODUCT_LABEL_EXT,
  REF_PRICE_LABEL,
} from "./rate-dimensions";

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

function truthy(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── (a) warehouse — legacy nameSourceWarehouse() ─────────────────
console.log("\n(a) warehouse labels (legacy nameSourceWarehouse)");
eq("1 → กวางโจว", RATE_WAREHOUSE_LABEL["1"], "กวางโจว");
eq("2 → อี้อู",    RATE_WAREHOUSE_LABEL["2"], "อี้อู");
eq("2 warehouse codes", RATE_WAREHOUSE_CODES.length, 2);

// ── (b) transport — legacy nameTransportType() + air ─────────────
console.log("\n(b) transport labels (legacy nameTransportType + Pacred air)");
eq("1 → รถ",     RATE_TRANSPORT_LABEL["1"], "รถ");
eq("2 → เรือ",   RATE_TRANSPORT_LABEL["2"], "เรือ");
eq("3 → อากาศ",  RATE_TRANSPORT_LABEL["3"], "อากาศ");
eq("3 transport codes", RATE_TRANSPORT_CODES.length, 3);
truthy("emoji label has รถ", RATE_TRANSPORT_LABEL_EMOJI["1"].includes("รถ"));
truthy("emoji label has เรือ", RATE_TRANSPORT_LABEL_EMOJI["2"].includes("เรือ"));

// ── (c) product type — legacy nameProductsType() 1-4 ─────────────
console.log("\n(c) product-type labels — legacy 1-4");
eq("1 → ทั่วไป", RATE_PRODUCT_LABEL["1"], "ทั่วไป");
eq("2 → มอก.",   RATE_PRODUCT_LABEL["2"], "มอก.");
eq("3 → อย.",    RATE_PRODUCT_LABEL["3"], "อย.");
eq("4 → พิเศษ",  RATE_PRODUCT_LABEL["4"], "พิเศษ");
eq("4 base product codes", RATE_PRODUCT_CODES.length, 4);

// ── (d) extended product type — adds 5=ควบคุมพิเศษ ────────────────
console.log("\n(d) extended product-type — Pacred 5th band");
eq("ext 5 → ควบคุมพิเศษ", RATE_PRODUCT_LABEL_EXT["5"], "ควบคุมพิเศษ");
eq("ext keeps 1 → ทั่วไป", RATE_PRODUCT_LABEL_EXT["1"], "ทั่วไป");
eq("5 ext product codes", RATE_PRODUCT_CODES_EXT.length, 5);
truthy("ext is superset of base",
  RATE_PRODUCT_CODES.every((c) => RATE_PRODUCT_LABEL_EXT[c] === RATE_PRODUCT_LABEL[c]));

// ── (e) ref-price basis — legacy nameRefPrice() + compare ────────
console.log("\n(e) ref-price basis");
eq("1 → น้ำหนัก",     REF_PRICE_LABEL["1"], "น้ำหนัก");
eq("2 → ปริมาตร",     REF_PRICE_LABEL["2"], "ปริมาตร");
eq("3 → เปรียบเทียบ", REF_PRICE_LABEL["3"], "เปรียบเทียบ");

// ── (f) completeness — every code has a non-empty label ──────────
console.log("\n(f) completeness");
truthy("every warehouse code labelled",
  RATE_WAREHOUSE_CODES.every((c) => RATE_WAREHOUSE_LABEL[c]?.length > 0));
truthy("every transport code labelled",
  RATE_TRANSPORT_CODES.every((c) => RATE_TRANSPORT_LABEL[c]?.length > 0 && RATE_TRANSPORT_LABEL_EMOJI[c]?.length > 0));
truthy("every ext product code labelled",
  RATE_PRODUCT_CODES_EXT.every((c) => RATE_PRODUCT_LABEL_EXT[c]?.length > 0));

// ── summary ──────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "✅" : "❌"} rate-dimensions — ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("\nFailures:\n  " + failures.join("\n  "));
  process.exit(1);
}
