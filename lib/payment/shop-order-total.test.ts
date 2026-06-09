/**
 * Unit tests for the shop-order (ฝากสั่งซื้อ) payable-amount formula
 * (lib/payment/shop-order-total.ts).
 *
 *   payableThb = (htotalpricechn + hshippingchn) × hrate + hshippingservice
 *
 * This is the number shown as "ราคาที่ต้องชำระ" on each order card AND the
 * per-row total fed to the bulk-pay bar — the same formula was duplicated
 * in service-order/page.tsx, so this guards that the display price and the
 * bulk-pay total stay byte-identical. Boundary focus: ¥ vs ฿ separation (the
 * service fee is NOT FX-converted), PG-string coercion, and the
 * payable-status filter (only hstatus='2' is selectable).
 *
 * Run:  tsx lib/payment/shop-order-total.test.ts   (wired into pnpm test:unit)
 */

import {
  computeShopOrderPayableThb,
  isShopOrderPayable,
  type ShopOrderTotalParts,
} from "./shop-order-total";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// Force ESM module mode — keeps shared `pass`/`fail` from colliding with
// sibling .test.ts files in tsc's project graph (TS 2393/2451).
export {};

const parts = (over: Partial<ShopOrderTotalParts>): ShopOrderTotalParts => ({
  htotalpricechn: 0, hshippingchn: 0, hrate: 0, hshippingservice: 0, ...over,
});

console.log("=== computeShopOrderPayableThb — (goods¥ + shipping¥) × rate + serviceFee฿ ===");

// ── (a) the formula — ¥ converted by rate, ฿ service added on top ──────────
section("(a) (goods + chinaShip) × rate + serviceFee");
assertEq("legacy example: (2000 + 120) × 5.01 + 100 = 10721.20",
  computeShopOrderPayableThb(parts({ htotalpricechn: 2000, hshippingchn: 120, hrate: 5.01, hshippingservice: 100 })),
  (2000 + 120) * 5.01 + 100);
assertEq("goods only, no china-ship, no service: 1000 × 5 = 5000",
  computeShopOrderPayableThb(parts({ htotalpricechn: 1000, hrate: 5 })), 5000);
assertEq("service fee is NOT FX-converted (added in ฿): 0×rate + 250 = 250",
  computeShopOrderPayableThb(parts({ hrate: 5, hshippingservice: 250 })), 250);
assertEq("china-shipping IS part of the ¥ base: (0 + 80) × 5 = 400",
  computeShopOrderPayableThb(parts({ hshippingchn: 80, hrate: 5 })), 400);

// ── (b) rate 0 / all-zero → 0 (matches inline arithmetic) ──────────────────
section("(b) zero / empty order");
assertEq("all zero → 0", computeShopOrderPayableThb(parts({})), 0);
assertEq("rate 0 zeroes the ¥ base but keeps the ฿ service fee: 0 + 75 = 75",
  computeShopOrderPayableThb(parts({ htotalpricechn: 9999, hrate: 0, hshippingservice: 75 })), 75);

// ── (c) PG numeric strings coerced (PostgREST returns numeric(10,2) as text) ─
section("(c) PG string coercion");
assertEq("all-string fields: ('1500'+'50')×'5.2'+'30' = 8090",
  computeShopOrderPayableThb(parts({ htotalpricechn: "1500", hshippingchn: "50", hrate: "5.2", hshippingservice: "30" })),
  (1500 + 50) * 5.2 + 30);

// ── (d) null / undefined / NaN → treated as 0 (no NaN leak into a price) ───
section("(d) null / NaN safety");
assertEq("null fields → 0 (never NaN)", computeShopOrderPayableThb({
  htotalpricechn: null, hshippingchn: null, hrate: null, hshippingservice: null }), 0);
assertEq("non-numeric rate → 0 base, service kept: garbage rate + 40 = 40",
  computeShopOrderPayableThb(parts({ htotalpricechn: 100, hrate: "x", hshippingservice: 40 })), 40);
assertEq("result is always a finite number (no NaN)",
  Number.isFinite(computeShopOrderPayableThb(parts({ htotalpricechn: "n/a", hrate: null }))), true);

console.log("\n=== isShopOrderPayable — only hstatus='2' is wallet-payable ===");
section("(e) payable status filter");
assertEq("status '2' (รอชำระเงิน) → payable", isShopOrderPayable("2"), true);
assertEq("status '1' → not payable", isShopOrderPayable("1"), false);
assertEq("status '5' (paid) → not payable", isShopOrderPayable("5"), false);
assertEq("null status → not payable", isShopOrderPayable(null), false);
assertEq("undefined status → not payable", isShopOrderPayable(undefined), false);
assertEq("numeric-looking other → not payable", isShopOrderPayable("3"), false);

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);
