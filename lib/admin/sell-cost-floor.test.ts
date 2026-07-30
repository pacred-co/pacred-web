import assert from "node:assert/strict";
import { isCbmRateBelowCost, CBM_COST_FALLBACK, parseCbmCostFloor, costColumn } from "./sell-cost-floor-core";

// owner 2026-07-30: "ต่อไปจากนี้ ห้ามมีงานขาดทุนอีกแล้วนะครับ"
// ล็อกกติกา "ต่ำกว่าทุน = บล็อกเสมอ" ไม่ให้ใครปรับหลวมโดยไม่ตั้งใจ

// ── ทุนจริงบน prod (mig 0194/0260) — ค่าสำรองต้องตรงกับที่ระบบใช้ ──
assert.equal(CBM_COST_FALLBACK["1"]["1"], 4700); // กวางโจว · รถ
assert.equal(CBM_COST_FALLBACK["1"]["2"], 2500); // กวางโจว · เรือ
assert.equal(CBM_COST_FALLBACK["2"]["1"], 5300); // อี้อู · รถ
assert.equal(CBM_COST_FALLBACK["2"]["2"], 2600); // อี้อู · เรือ

// ── ต่ำกว่าทุน = บล็อก ──
assert.equal(isCbmRateBelowCost(4500, 4700), true);  // เคสจริง prod: 5 ลูกค้าถือเซล 4,500 รถ
assert.equal(isCbmRateBelowCost(3500, 4700), true);  // PR10147
assert.equal(isCbmRateBelowCost(2499.99, 2500), true);

// ── เท่าทุนพอดี = ผ่าน (กำไร 0 ยังไม่ขาดทุน · เป็นดุลพินิจ owner) ──
assert.equal(isCbmRateBelowCost(2500, 2500), false); // 33 เซล prod อยู่ทรงนี้
assert.equal(isCbmRateBelowCost(4700, 4700), false);

// ── เหนือทุน = ผ่าน ──
assert.equal(isCbmRateBelowCost(5700, 4700), false); // เรทกลางวันนี้ รถ
assert.equal(isCbmRateBelowCost(3700, 2500), false); // เรทกลางวันนี้ เรือ
assert.equal(isCbmRateBelowCost(3300, 2500), false); // PR002 เรือ — ไม่ขาดทุนบนตู้เรือ

// ── ไม่ได้ตั้งเรท (0 / ว่าง) = ไม่ใช่ขาดทุน ต้องไม่บล็อก ──
// (ลูกค้าที่คิดตามน้ำหนักอย่างเดียว ปล่อยช่อง CBM = 0 ไว้ — บล็อกจะทำให้เซฟไม่ได้ทั้งใบ)
assert.equal(isCbmRateBelowCost(0, 4700), false);
assert.equal(isCbmRateBelowCost(-1, 4700), false);
assert.equal(isCbmRateBelowCost(Number.NaN, 4700), false);

// ── ไม่รู้ทุน = ห้ามเดา ต้องปล่อยผ่าน (fail-open ฝั่งนี้ · พื้นราคาปกติยังบล็อกอยู่) ──
assert.equal(isCbmRateBelowCost(100, 0), false);
assert.equal(isCbmRateBelowCost(100, Number.NaN), false);

// ── parseCbmCostFloor: อ่านจากแถว tb_settings จริง ──
{
  const row = {
    fcostcar1defaultmomo: "4700.00", fcostcar2defaultmomo: "4700.00",
    fcostcar3defaultmomo: "4700.00", fcostcar4defaultmomo: "4700.00",
    fcostship1defaultmomo: "2500.00", fcostship2defaultmomo: "2500.00",
    fcostship3defaultmomo: "2500.00", fcostship4defaultmomo: "2500.00",
    fcostcar1defaultmomo2: "5300.00", fcostcar2defaultmomo2: "5300.00",
    fcostcar3defaultmomo2: "5300.00", fcostcar4defaultmomo2: "5300.00",
    fcostship1defaultmomo2: "2600.00", fcostship2defaultmomo2: "2600.00",
    fcostship3defaultmomo2: "2600.00", fcostship4defaultmomo2: "2600.00",
  };
  assert.deepEqual(parseCbmCostFloor(row), {
    "1": { "1": 4700, "2": 2500 },
    "2": { "1": 5300, "2": 2600 },
  });
}
// ตั้งต่างกันรายประเภท → ใช้ค่าต่ำสุด (ไม่บล็อกเกินจำเป็น)
{
  const row = {
    fcostcar1defaultmomo: 4700, fcostcar2defaultmomo: 5000,
    fcostcar3defaultmomo: 6000, fcostcar4defaultmomo: 6000,
  };
  assert.equal(parseCbmCostFloor(row)["1"]["1"], 4700);
}
// อ่านไม่ได้ / ว่าง / ขยะ → คงค่าสำรอง (ยังบล็อกได้)
assert.deepEqual(parseCbmCostFloor(null), CBM_COST_FALLBACK);
assert.deepEqual(parseCbmCostFloor({}), CBM_COST_FALLBACK);
assert.equal(parseCbmCostFloor({ fcostcar1defaultmomo: "abc" })["1"]["1"], 4700);
assert.equal(parseCbmCostFloor({ fcostcar1defaultmomo: 0 })["1"]["1"], 4700);

// ชื่อคอลัมน์ต้องตรง resolve-cost.ts เป๊ะ (ผิด = อ่านทุนไม่เจอเงียบๆ)
assert.equal(costColumn("1", "1", "1"), "fcostcar1defaultmomo");
assert.equal(costColumn("1", "2", "3"), "fcostship3defaultmomo");
assert.equal(costColumn("2", "1", "4"), "fcostcar4defaultmomo2");
assert.equal(costColumn("2", "2", "1"), "fcostship1defaultmomo2");

console.log("sell-cost-floor: OK");
