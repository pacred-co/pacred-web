/**
 * ล็อกกฎ "บรรทัดที่เก็บเงินแทนพี่น้อง ต้องแจงทั้งชิปเม้น".
 *
 * เคสจริง: FRI2607-00071 / ใบเสร็จ 15200 / PR079 · ชิปเม้น 800206224068
 *   แถว anchor 52305 = 3 กล่อง · 46.5 kg · ค่าขนส่ง ฿930
 *   ทั้งชิปเม้น 8 แถว = 13 กล่อง · 249 kg · ฿4,980  ← ยอดที่แช่บนบรรทัด
 *
 * 🔴 เคสกันถอยหลังที่สำคัญที่สุด: 290/291 บรรทัดบน prod แจงพี่น้องครบอยู่แล้ว
 *    → ต้อง "ไม่แตะ" ไม่งั้นเอกสารที่ถูกอยู่จะกลายเป็นเบิ้ล
 *
 * Run: tsx lib/billing/shipment-line-coverage.test.ts
 */
import assert from "node:assert/strict";
import {
  baseTrackingOf, resolveLineCoverage, resolveReceiptLineCoverage, type CoverageRow,
} from "./shipment-line-coverage";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const row = (id: number, tr: string, box: number, kg: number, cbm: number, freight: number): CoverageRow =>
  ({ id, ftrackingchn: tr, famount: box, fweight: kg, totalCbm: cbm, freight });

/** ครอบครัวจริงของ 800206224068 (PR079) — จาก prod */
const FAMILY: CoverageRow[] = [
  row(52305, "800206224068", 3, 46.5, 0.08748, 930),
  row(52608, "800206224068-2", 1, 19, 0.02835, 380),
  row(52609, "800206224068-3", 1, 19.5, 0.02916, 390),
  row(52610, "800206224068-4", 1, 17.5, 0.0294, 350),
  row(52611, "800206224068-5", 4, 84, 0.142376, 1680),
  row(52612, "800206224068-6", 1, 19, 0.04032, 380),
  row(52613, "800206224068-7", 1, 19, 0.034225, 380),
  row(52614, "800206224068-8", 1, 24.5, 0.035594, 490),
];

console.log("baseTrackingOf");

ok("ตัด -N และ -N/M · ตัวที่ไม่มี suffix คงเดิม", () => {
  assert.equal(baseTrackingOf("800206224068-8"), "800206224068");
  assert.equal(baseTrackingOf("760235240370-2/3"), "760235240370");
  assert.equal(baseTrackingOf("800206224068"), "800206224068");
  assert.equal(baseTrackingOf(null), "");
});

ok("ห้ามตัดขีดที่เป็นส่วนหนึ่งของเลขแทรค (ไม่ได้ลงท้ายด้วยตัวเลข)", () => {
  assert.equal(baseTrackingOf("KY4001024768574"), "KY4001024768574");
  assert.equal(baseTrackingOf("SEA0625-8211YW"), "SEA0625-8211YW");
});

console.log("\n🔴 เคสจริง FRI2607-00071 — บรรทัดเดียวเก็บเงินทั้งชิปเม้น");

ok("ยุบเป็นทั้งชิปเม้น: 3 กล่อง/46.5kg → 13 กล่อง/249kg + แจงพี่น้อง 7 แทรค", () => {
  const cov = resolveLineCoverage({
    lines: [{ forwarderId: 52305, amountThb: 4980 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  const c = cov.get(52305)!;
  assert.equal(c.folded, true);
  assert.equal(c.famount, 13, "กล่องต้องเป็น 13 ไม่ใช่ 3");
  assert.equal(c.fweight, 249, "น้ำหนักต้องเป็น 249 ไม่ใช่ 46.5");
  assert.ok(Math.abs(c.totalCbm - 0.426905) < 1e-6, `คิว ${c.totalCbm}`);
  assert.equal(c.freight, 4980, "ค่าขนส่งที่โชว์ต้องเท่ายอดที่เก็บจริง");
  assert.equal(c.coveredTrackings.length, 7);
  assert.ok(!c.coveredTrackings.includes("800206224068"), "ห้ามใส่ตัวเองในลิสต์พี่น้อง");
  assert.equal(c.coveredTrackings[0], "800206224068-2");
});

ok("เลขที่โชว์ต้อง reconcile กับยอดที่แช่ไว้ (ค่าขนส่งรวม = amount_thb)", () => {
  const cov = resolveLineCoverage({
    lines: [{ forwarderId: 52305, amountThb: 4980 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  assert.equal(cov.get(52305)!.freight, 4980);
});

console.log("\n🔴 กันถอยหลัง — เอกสารที่แจงครบอยู่แล้ว ต้องไม่ถูกแตะ");

ok("แจงพี่น้องครบทุกแถวบนใบ → ทุกบรรทัดพิมพ์ค่าของตัวเอง (ไม่เบิ้ล)", () => {
  const cov = resolveLineCoverage({
    lines: FAMILY.map((r) => ({ forwarderId: r.id, amountThb: r.freight })),
    lineRows: new Map(FAMILY.map((r) => [r.id, r])),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  for (const r of FAMILY) {
    const c = cov.get(r.id)!;
    assert.equal(c.folded, false, `${r.ftrackingchn} ต้องไม่ fold`);
    assert.equal(c.famount, r.famount);
    assert.equal(c.fweight, r.fweight);
  }
  // Σ ที่พิมพ์ = ความจริง ไม่เบิ้ล
  const totalBox = FAMILY.reduce((s, r) => s + cov.get(r.id)!.famount, 0);
  assert.equal(totalBox, 13, "13 กล่อง ไม่ใช่ 13×8");
});

ok("ชิปเม้นแถวเดียว (ไม่มีพี่น้อง) → ไม่ fold", () => {
  const solo = row(52296, "760235240370", 1, 12, 0.03, 240);
  const cov = resolveLineCoverage({
    lines: [{ forwarderId: 52296, amountThb: 240 }],
    lineRows: new Map([[52296, solo]]),
    familyByBase: new Map([["760235240370", [solo]]]),
  });
  assert.equal(cov.get(52296)!.folded, false);
  assert.equal(cov.get(52296)!.famount, 1);
});

ok("อยู่บนใบแถวเดียว แต่ยอด = ของตัวเอง → ไม่ fold (พี่น้องไปอยู่ใบอื่นโดยชอบ)", () => {
  const cov = resolveLineCoverage({
    lines: [{ forwarderId: 52305, amountThb: 930 }], // = ค่าขนส่งของตัวเองเป๊ะ
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  assert.equal(cov.get(52305)!.folded, false, "ยอดไม่เกินตัวเอง = ไม่ได้เก็บแทนใคร");
  assert.equal(cov.get(52305)!.famount, 3);
});

ok("ยอดเกินนิดเดียว (ค่าอื่นๆ/ปัดสตางค์ ≤2%) → ไม่ fold", () => {
  const cov = resolveLineCoverage({
    lines: [{ forwarderId: 52305, amountThb: 945 }], // +1.6%
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  assert.equal(cov.get(52305)!.folded, false);
});

ok("บางส่วนอยู่บนใบ (2 จาก 8) → ไม่ fold (กำกวม ปล่อยให้ data-health จับ)", () => {
  const cov = resolveLineCoverage({
    lines: [
      { forwarderId: 52305, amountThb: 4980 },
      { forwarderId: 52608, amountThb: 380 },
    ],
    lineRows: new Map([[52305, FAMILY[0]!], [52608, FAMILY[1]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  assert.equal(cov.get(52305)!.folded, false, "กำกวม = ห้ามเดา");
});

console.log("\nความทนทาน");

ok("บรรทัดที่หาแถวไม่เจอ (แถวถูกลบ) → ข้าม ไม่พัง", () => {
  const cov = resolveLineCoverage({
    lines: [{ forwarderId: 99999, amountThb: 100 }],
    lineRows: new Map(),
    familyByBase: new Map(),
  });
  assert.equal(cov.size, 0);
});

ok("ไม่มีข้อมูลครอบครัว (โหลด family พลาด) → ไม่ fold = degrade เป็นพฤติกรรมเดิม", () => {
  const cov = resolveLineCoverage({
    lines: [{ forwarderId: 52305, amountThb: 4980 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map(),
  });
  assert.equal(cov.get(52305)!.folded, false);
  assert.equal(cov.get(52305)!.famount, 3, "พิมพ์ค่าเดิม ดีกว่าพิมพ์ค่ามั่ว");
});

ok("หลายชิปเม้นบนใบเดียว — ยุบเฉพาะตัวที่เข้าเงื่อนไข", () => {
  const other = row(52384, "760235526605", 3, 24, 0.05, 480);
  const cov = resolveLineCoverage({
    lines: [
      { forwarderId: 52305, amountThb: 4980 },
      { forwarderId: 52384, amountThb: 480 },
    ],
    lineRows: new Map([[52305, FAMILY[0]!], [52384, other]]),
    familyByBase: new Map([["800206224068", FAMILY], ["760235526605", [other]]]),
  });
  assert.equal(cov.get(52305)!.folded, true);
  assert.equal(cov.get(52384)!.folded, false);
  assert.equal(cov.get(52384)!.famount, 3);
});

console.log("\n🔴 ใบเสร็จ — ยอดต่อบรรทัดไม่ได้แช่ไว้ ใช้ยอดรวมเอกสารเป็นเกณฑ์");

/** สูตรบรรทัดของใบเสร็จแบบย่อ (เคสนี้มีแต่ค่าขนส่ง) */
const lineTotalOf = (r: CoverageRow) => r.freight;

ok("เคสจริง FRC2607-00024: แจงขาด → ยุบ แล้ว Σ กระทบยอดได้", () => {
  const other = row(52384, "760235526605", 3, 24, 0.05, 480);
  const cov = resolveReceiptLineCoverage({
    lines: [{ forwarderId: 52305 }, { forwarderId: 52384 }],
    lineRows: new Map([[52305, FAMILY[0]!], [52384, other]]),
    familyByBase: new Map([["800206224068", FAMILY], ["760235526605", [other]]]),
    docTotal: 5460,           // 4,980 + 480
    lineTotalOf,
  });
  assert.equal(cov.get(52305)!.folded, true);
  assert.equal(cov.get(52305)!.famount, 13);
  assert.equal(cov.get(52384)!.folded, false);
  const sum = [52305, 52384].reduce((s, id) => s + cov.get(id)!.freight, 0);
  assert.equal(sum, 5460, "Σ หลังยุบต้องเท่ายอดเอกสาร");
});

ok("🔴 ยุบแล้วจะล้นยอดที่เก็บจริง → ไม่ยุบ (ห้ามทำเอกสารเกินเงิน)", () => {
  const cov = resolveReceiptLineCoverage({
    lines: [{ forwarderId: 52305 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
    docTotal: 930,            // ใบนี้เก็บแค่แถวเดียวจริงๆ
    lineTotalOf,
  });
  assert.equal(cov.get(52305)!.folded, false);
  assert.equal(cov.get(52305)!.famount, 3);
});

ok("แจงครบอยู่แล้ว (Σ = ยอดเอกสาร) → ไม่แตะ", () => {
  const cov = resolveReceiptLineCoverage({
    lines: FAMILY.map((r) => ({ forwarderId: r.id })),
    lineRows: new Map(FAMILY.map((r) => [r.id, r])),
    familyByBase: new Map([["800206224068", FAMILY]]),
    docTotal: 4980,
    lineTotalOf,
  });
  for (const r of FAMILY) assert.equal(cov.get(r.id)!.folded, false);
});

ok("ไม่รู้ยอดเอกสาร (0) → ไม่ยุบ (degrade ปลอดภัย)", () => {
  const cov = resolveReceiptLineCoverage({
    lines: [{ forwarderId: 52305 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
    docTotal: 0,
    lineTotalOf,
  });
  assert.equal(cov.get(52305)!.folded, false);
});

console.log(`\n✅ shipment-line-coverage: ${passed} assertions passed`);
