/**
 * ล็อกสูตรยอดขายฝากสั่งซื้อ (SOT `shopSellTotalThb`) — เคสจริง P22456 ที่เก็บขาด ฿618.
 *
 * owner 2026-07-27: *"เจ้าหน้าที่ทำราคามา 151k แล้วทำไมลูกค้าเห็นแค่ 150k ลูกค้าจะจ่ายตัง
 * แล้ว"* — จอแอดมินรวมค่าลังไม้ แต่ writer ของ htotalpriceuser ไม่มีตัวไหนรวม.
 *
 * Run: tsx lib/shop-order/sell-total.test.ts
 */
import assert from "node:assert/strict";
import { crateCnyOf, shopSellTotalThb } from "./sell-total";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("shopSellTotalThb — สูตรยอดขายฝากสั่งซื้อ");

ok("🔴 เคสจริง P22456 — ตีลังไม้ ¥120 ต้องเข้ายอด (จอโชว์ 151,219.45 ไม่ใช่ 150,601.45)", () => {
  const total = shopSellTotalThb({
    htotalpricechn: 29_030, hshippingchn: 213, hrate: 5.15,
    hshippingservice: 0, crate: "1", pricecrate: 120,
  });
  assert.equal(total, 151_219.45);
  assert.notEqual(total, 150_601.45, "ยอดแบบไม่มีลัง = ที่ลูกค้าเกือบจ่ายขาด ฿618");
});

ok("ไม่ตีลัง (crate='2') → สูตรเดิมเป๊ะ ไม่มีอะไรเปลี่ยน", () => {
  assert.equal(
    shopSellTotalThb({ htotalpricechn: 29_030, hshippingchn: 213, hrate: 5.15, hshippingservice: 0, crate: "2", pricecrate: 120 }),
    150_601.45,
  );
});

ok("ตีลังแต่ราคาลัง 0/ว่าง → เท่าสูตรเดิม (ไม่มีผีบวกเพิ่ม)", () => {
  assert.equal(
    shopSellTotalThb({ htotalpricechn: 29_030, hshippingchn: 213, hrate: 5.15, hshippingservice: 0, crate: "1", pricecrate: 0 }),
    150_601.45,
  );
  assert.equal(
    shopSellTotalThb({ htotalpricechn: 29_030, hshippingchn: 213, hrate: 5.15, hshippingservice: 0, crate: "1", pricecrate: null }),
    150_601.45,
  );
});

ok("ค่าบริการ (฿) บวกหลังคูณเรท + ปัดขึ้น 2 ตำแหน่ง (convention เดิม)", () => {
  // (100 + 10 + 5) × 5.15 = 592.25 · + svc 30 = 622.25
  assert.equal(
    shopSellTotalThb({ htotalpricechn: 100, hshippingchn: 10, hrate: 5.15, hshippingservice: 30, crate: "1", pricecrate: 5 }),
    622.25,
  );
  // เศษต้องปัดขึ้น: 0.333 × 3 = 0.999 → 1.00
  assert.equal(
    shopSellTotalThb({ htotalpricechn: 0.333, hshippingchn: 0, hrate: 3, hshippingservice: 0 }),
    1.0,
  );
});

console.log("\ncrateCnyOf");

ok("เข้ายอดเฉพาะ crate='1' + ราคา > 0", () => {
  assert.equal(crateCnyOf({ crate: "1", pricecrate: 120 }), 120);
  assert.equal(crateCnyOf({ crate: "2", pricecrate: 120 }), 0);
  assert.equal(crateCnyOf({ crate: null, pricecrate: 120 }), 0);
  assert.equal(crateCnyOf({ crate: "1", pricecrate: -5 }), 0);
  assert.equal(crateCnyOf({ crate: "1", pricecrate: "120" }), 120);
});

console.log(`\n✅ sell-total: ${passed} assertions passed`);
