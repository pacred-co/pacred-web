/**
 * REGRESSION LOCK — order quantity is UNLIMITED for everyone (owner 2026-07-17).
 *
 * "ปลดเพดานไปเป็นไม่จำกัดเลยครับ เพราะเราจะมีลูกค้าเจ้าใหญ่เข้ามา หรือเจ้ากลาง แต่สั่งจำนวน
 *  เยอะ เป็นล้านชิ้น จะทำยังไงหละครับ อย่าให้เกิดขึ้นอีกนะครับ และกับทุกคนครับ ทั้งลูกค้า
 *  และ พนักงาน"
 *
 * The walls that were there — every one invented, none a real limit:
 *   customer search page  maxQty={999}   ← hardcoded; the wall PR619 hit
 *   customer multi-pick   99999
 *   admin   multi-pick    99999 / max(stock, 9999)
 *   admin   single-pick   9999
 * Prod proof: the largest quantity ANY customer ever self-served across all of tb_cart is
 * 150, and not one row ever passed 999 — while admin-keyed orders reach 10,000.
 *
 * These assertions pin that a million (and a billion) pieces go through, that the only
 * ceiling left is the int32 DB column, and that a listing's own minimum still applies.
 */
import assert from "node:assert/strict";
import { MAX_ORDER_QTY, MIN_ORDER_QTY, clampOrderQty, isOrderQtyValid } from "./order-qty";

let checks = 0;
function ok(name: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ✓ ${name}`);
}

console.log("order-qty.test.ts — ไม่จำกัดจำนวน (owner 2026-07-17)");

ok("🔴 the exact PR619 pick: 90,000 pieces passes (was blocked at 999)", () => {
  assert.equal(clampOrderQty(90_000), 90_000);
  assert.ok(isOrderQtyValid(90_000));
});

ok("🔴 a million pieces passes — the owner's actual case", () => {
  assert.equal(clampOrderQty(1_000_000), 1_000_000);
  assert.ok(isOrderQtyValid(1_000_000));
});

ok("a billion passes", () => {
  assert.equal(clampOrderQty(1_000_000_000), 1_000_000_000);
});

ok("none of the old walls survive (999 / 9999 / 99999 all far below the ceiling)", () => {
  for (const wall of [999, 9_999, 99_999, 10_000]) {
    assert.ok(MAX_ORDER_QTY > wall * 1000, `MAX_ORDER_QTY must dwarf the old ${wall} wall`);
    assert.equal(clampOrderQty(wall + 1), wall + 1);
  }
});

ok("the ceiling is int32-safe — a +1 stepper at the top cannot overflow the column", () => {
  const INT32_MAX = 2_147_483_647;
  assert.ok(MAX_ORDER_QTY < INT32_MAX, "must fit tb_cart.camount (integer)");
  assert.ok(MAX_ORDER_QTY + 1 < INT32_MAX, "a +1 at the ceiling must still fit");
  assert.equal(clampOrderQty(MAX_ORDER_QTY + 5_000), MAX_ORDER_QTY);
});

ok("a listing's own minimum (起订量) still applies", () => {
  assert.equal(clampOrderQty(100, 600), 600);
  assert.equal(clampOrderQty(700, 600), 700);
  assert.ok(!isOrderQtyValid(100, 600));
});

ok("multi-pick: 0 means 'not picked' only when allowZero", () => {
  assert.equal(clampOrderQty(0, 1, true), 0);
  assert.equal(clampOrderQty(0, 1, false), MIN_ORDER_QTY);
  assert.ok(isOrderQtyValid(0, 1, true));
  assert.ok(!isOrderQtyValid(0, 1, false));
});

ok("garbage never crashes and never produces a bad row", () => {
  for (const bad of [NaN, undefined, null, "", "abc", -5, Infinity, -Infinity]) {
    const v = clampOrderQty(bad);
    assert.ok(Number.isInteger(v) && v >= MIN_ORDER_QTY, `clampOrderQty(${String(bad)}) = ${v}`);
  }
  assert.equal(clampOrderQty("1500"), 1500);
  assert.equal(clampOrderQty(12.7), 12);
});

console.log(`\n✅ order-qty.test.ts — ${checks} checks passed`);
