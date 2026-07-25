/**
 * ล็อกกฎ "เอกสาร 1 บรรทัด = 1 แทรคกิ้ง" + "Σ ยอดที่พิมพ์ = ยอดที่แช่ไว้ เป๊ะถึงสตางค์".
 *
 * เคสจริง: FRI2607-00071 / ใบเสร็จ FRC2607-00024 / PR079 · ชิปเม้น 800206224068
 *   บิลเขียนบรรทัดเดียว → forwarder 52305 · amount_thb ฿4,980 (ทั้งชิปเม้น)
 *   แต่ชิปเม้นมี 8 แถว/13 กล่อง · บนใบเดียวกัน ชิปเม้นอื่น (760235240370) แจง 3 แถวแยกอยู่แล้ว
 *   → owner: *"มันต้องแจงตามแทรคกิ้งเลยไหมครับ ไม่เห็นเหมือนรายการเพื่อนๆ อื่นๆ เลยครับ"*
 *
 * 🔴 กันถอยหลัง: 290/291 บรรทัดบน prod ถูกต้องอยู่แล้ว → ต้องออกมา 1:1 ไม่แตก ไม่ยุบ
 *
 * Run: tsx lib/billing/shipment-line-coverage.test.ts
 */
import assert from "node:assert/strict";
import { baseTrackingOf, expandDocLines, type CoverageRow } from "./shipment-line-coverage";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const row = (id: number, tr: string, box: number, kg: number, cbm: number, freight: number): CoverageRow =>
  ({ id, ftrackingchn: tr, famount: box, fweight: kg, totalCbm: cbm, freight });

/** ครอบครัวจริงของ 800206224068 (PR079) จาก prod — Σ 13 กล่อง · 249 kg · ฿4,980 */
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
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

console.log("baseTrackingOf");

ok("ตัด -N และ -N/M · ตัวที่ไม่มี suffix คงเดิม", () => {
  assert.equal(baseTrackingOf("800206224068-8"), "800206224068");
  assert.equal(baseTrackingOf("760235240370-2/3"), "760235240370");
  assert.equal(baseTrackingOf("800206224068"), "800206224068");
  assert.equal(baseTrackingOf(null), "");
});

ok("ห้ามตัดขีดที่ไม่ได้ลงท้ายด้วยตัวเลข", () => {
  assert.equal(baseTrackingOf("KY4001024768574"), "KY4001024768574");
  assert.equal(baseTrackingOf("SEA0625-8211YW"), "SEA0625-8211YW");
});

console.log("\n🔴 เคสจริง — บรรทัดเดียวเก็บเงินทั้งชิปเม้น ต้องแตกเป็น 8 บรรทัด");

const expandedCase = () =>
  expandDocLines({
    lines: [{ id: 266, forwarderId: 52305, amountThb: 4980 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });

ok("ได้ 8 บรรทัด · 1 บรรทัด = 1 แทรคกิ้ง (เหมือนชิปเม้นอื่นบนใบเดียวกัน)", () => {
  const out = expandedCase();
  assert.equal(out.length, 8);
  assert.deepEqual(
    out.map((d) => d.row.ftrackingchn),
    ["800206224068", "800206224068-2", "800206224068-3", "800206224068-4",
     "800206224068-5", "800206224068-6", "800206224068-7", "800206224068-8"],
    "ต้องเรียงตามเลขท้าย · ตัวหลักมาก่อน (ตรงกับหน้าตรวจตู้)",
  );
  assert.ok(out.every((d) => d.expanded));
});

ok("🔴 Σ ยอดที่พิมพ์ = ยอดที่แช่ไว้ เป๊ะถึงสตางค์ (บัญชีกระทบยอดได้)", () => {
  assert.equal(r2(expandedCase().reduce((s, d) => s + d.amountThb, 0)), 4980);
});

ok("แต่ละบรรทัดได้ยอดตามค่าขนส่งของตัวเอง (สัดส่วนจริง ไม่เฉลี่ยมั่ว)", () => {
  assert.deepEqual(expandedCase().map((d) => d.amountThb), [930, 380, 390, 350, 1680, 380, 380, 490]);
});

ok("กล่อง/น้ำหนักของแต่ละบรรทัด = ของแถวนั้น · Σ = ความจริงทั้งชิปเม้น", () => {
  const out = expandedCase();
  assert.equal(out.reduce((s, d) => s + d.row.famount, 0), 13);
  assert.equal(out.reduce((s, d) => s + d.row.fweight, 0), 249);
  assert.equal(out[0]!.row.famount, 3, "แถวหลักยังเป็น 3 กล่องของมันเอง ไม่ใช่ 13");
});

console.log("\n🔴 กันถอยหลัง — 290/291 บรรทัดที่ถูกอยู่แล้ว ต้องออกมา 1:1");

ok("แจงพี่น้องครบทุกแถวบนใบแล้ว → ไม่แตกซ้ำ (ไม่งั้นเบิ้ล)", () => {
  const out = expandDocLines({
    lines: FAMILY.map((r, i) => ({ id: 100 + i, forwarderId: r.id, amountThb: r.freight })),
    lineRows: new Map(FAMILY.map((r) => [r.id, r])),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  assert.equal(out.length, 8, "8 เข้า 8 ออก");
  assert.ok(out.every((d) => !d.expanded));
  assert.equal(out.reduce((s, d) => s + d.row.famount, 0), 13, "13 กล่อง ไม่ใช่ 13×8");
});

ok("ชิปเม้นแถวเดียว → 1:1", () => {
  const solo = row(52296, "760235240370", 1, 12, 0.03, 240);
  const out = expandDocLines({
    lines: [{ id: 1, forwarderId: 52296, amountThb: 240 }],
    lineRows: new Map([[52296, solo]]),
    familyByBase: new Map([["760235240370", [solo]]]),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.amountThb, 240);
});

ok("ยอด = ของตัวเอง (พี่น้องไปอยู่ใบอื่นโดยชอบ) → ไม่แตก", () => {
  const out = expandDocLines({
    lines: [{ id: 1, forwarderId: 52305, amountThb: 930 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.row.famount, 3);
});

ok("ยอดเกินนิดเดียว (ค่าอื่นๆ/ปัดสตางค์ ≤2%) → ไม่แตก", () => {
  assert.equal(
    expandDocLines({
      lines: [{ id: 1, forwarderId: 52305, amountThb: 945 }],
      lineRows: new Map([[52305, FAMILY[0]!]]),
      familyByBase: new Map([["800206224068", FAMILY]]),
    }).length, 1);
});

ok("บางส่วนอยู่บนใบ (2 จาก 8) → ไม่แตก (กำกวม ห้ามเดา)", () => {
  const out = expandDocLines({
    lines: [
      { id: 1, forwarderId: 52305, amountThb: 4980 },
      { id: 2, forwarderId: 52608, amountThb: 380 },
    ],
    lineRows: new Map([[52305, FAMILY[0]!], [52608, FAMILY[1]!]]),
    familyByBase: new Map([["800206224068", FAMILY]]),
  });
  assert.equal(out.length, 2);
});

console.log("\nความทนทาน + การแบ่งยอด");

ok("แถวหาไม่เจอ → ข้าม ไม่พัง", () => {
  assert.equal(
    expandDocLines({ lines: [{ id: 1, forwarderId: 99999, amountThb: 100 }],
      lineRows: new Map(), familyByBase: new Map() }).length, 0);
});

ok("โหลดครอบครัวพลาด → 1:1 = พฤติกรรมเดิมเป๊ะ", () => {
  const out = expandDocLines({
    lines: [{ id: 1, forwarderId: 52305, amountThb: 4980 }],
    lineRows: new Map([[52305, FAMILY[0]!]]),
    familyByBase: new Map(),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.amountThb, 4980, "เงินไม่หาย");
});

ok("🔴 ยอดหารไม่ลงตัว — เศษสตางค์ไปแถวสุดท้าย Σ ยังเป๊ะ", () => {
  const fam = [row(1, "T", 1, 1, 0.01, 100), row(2, "T-2", 1, 1, 0.01, 100), row(3, "T-3", 1, 1, 0.01, 100)];
  const out = expandDocLines({
    lines: [{ id: 9, forwarderId: 1, amountThb: 1000.01 }],
    lineRows: new Map([[1, fam[0]!]]),
    familyByBase: new Map([["T", fam]]),
  });
  assert.equal(out.length, 3);
  assert.equal(r2(out.reduce((s, d) => s + d.amountThb, 0)), 1000.01);
});

ok("ค่าขนส่งทั้งครอบครัวเป็น 0 → เฉลี่ยเท่ากัน Σ ยังเป๊ะ (ไม่หารศูนย์)", () => {
  const fam = [row(1, "T", 1, 1, 0.01, 0), row(2, "T-2", 1, 1, 0.01, 0)];
  const out = expandDocLines({
    lines: [{ id: 9, forwarderId: 1, amountThb: 333.33 }],
    lineRows: new Map([[1, fam[0]!]]),
    familyByBase: new Map([["T", fam]]),
  });
  assert.equal(out.length, 2);
  assert.equal(r2(out.reduce((s, d) => s + d.amountThb, 0)), 333.33);
});

ok("หลายชิปเม้นบนใบเดียว — แตกเฉพาะตัวที่เข้าเงื่อนไข", () => {
  const other = row(52384, "760235526605", 3, 24, 0.05, 480);
  const out = expandDocLines({
    lines: [
      { id: 1, forwarderId: 52305, amountThb: 4980 },
      { id: 2, forwarderId: 52384, amountThb: 480 },
    ],
    lineRows: new Map([[52305, FAMILY[0]!], [52384, other]]),
    familyByBase: new Map([["800206224068", FAMILY], ["760235526605", [other]]]),
  });
  assert.equal(out.length, 9, "8 + 1");
  assert.equal(r2(out.reduce((s, d) => s + d.amountThb, 0)), 5460);
});

console.log(`\n✅ shipment-line-coverage: ${passed} assertions passed`);
