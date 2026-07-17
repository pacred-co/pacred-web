/**
 * Tests for evaluateBasisDrift — the "ฐานเพี้ยน ห้าม re-price" money guard.
 *
 * Every BLOCK/PASS fixture below is a REAL prod row (read-only probe 2026-07-17 ·
 * scripts/probe-basis-drift-guard-2026-07-17.ts), so a regression here is a regression
 * against MOMO's actual data — not an invented shape. Synthetic cases are marked.
 *
 * ⚠️ The most important assertions here are the PASS ones. A guard that over-blocks
 *    freezes normal pricing platform-wide — worse than no guard at all. The no-momo /
 *    undecidable / noise-floor / ROLLUP cases below are what keep that from happening.
 *    In particular "PASS · แถวรวม (rollup)" guards the REPAIR path: without it, staff
 *    fix the boxes and the corrected row silently keeps its stale price.
 *
 * Run: tsx lib/forwarder/basis-drift-guard.test.ts
 */
import assert from "node:assert/strict";
import {
  evaluateBasisDrift,
  BASIS_DRIFT_TOLERANCE,
  BASIS_DRIFT_MIN_KG,
  type MomoBoxRow,
} from "./basis-drift-guard";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log("basis-drift-guard.test.ts");

// ── prod fixtures ───────────────────────────────────────────────────────────
/** #52082 · 1781309805 · PR10190 — the ×2 landmine (single-box base). */
const BOX_1781309805: MomoBoxRow = {
  boxTracking: "1781309805", width: 100, length: 70, height: 150,
  weightKg: 335, cbm: 1.05, quantity: 1,
};
/** #52137 · 1782555393 (bare · per_piece) + its 4 real siblings — a healthy split base. */
const BASE_1782555393: MomoBoxRow[] = [
  { boxTracking: "1782555393",   width: 320, length: 27,  height: 13,    weightKg: 50,     cbm: 0.1123,  quantity: 3 },
  { boxTracking: "1782555393-2", width: 190, length: 77,  height: 120,   weightKg: 3580.5, cbm: 5.2668,  quantity: 3 },
  { boxTracking: "1782555393-3", width: 117, length: 110, height: 155,   weightKg: 350,    cbm: 1.99485, quantity: 1 },
  { boxTracking: "1782555393-4", width: 371, length: 22,  height: 20.5,  weightKg: 800,    cbm: 1.67321, quantity: 10 },
  { boxTracking: "1782555393-5", width: 126, length: 48,  height: 52,    weightKg: 60,     cbm: 0.3145,  quantity: 15 },
];

// ════════════════════════════════════════════════════════════════════
// BLOCK — the landmine the guard exists for
// ════════════════════════════════════════════════════════════════════

check("BLOCK · ฐาน ×2 เป๊ะ (prod #52082 · 1781309805 · PR10190 · ฿3,350)", () => {
  // momo: qty=1 · weight_kg=335 · cbm=1.05 · dims 100×70×150 = 1.05 → single_piece
  // เรา: fweight=670 · fvolume=2.10 = ×2 · ราคา ฿3,350 = rate 10 × 335 (ฐานจริง)
  // → re-price บนฐานที่เก็บ = 10 × 670 = ฿6,700 = เก็บเกิน 2 เท่า  ← ตัวที่ต้องกัน
  const v = evaluateBasisDrift({
    storedWeightKg: 670, storedCbm: 2.1,
    ownBoxTracking: "1781309805", baseBoxes: [BOX_1781309805],
  });
  assert.equal(v.blocked, true);
  assert.equal(v.skipReason, null);
  assert.equal(v.matchedModel, null, "ต้องไม่เข้าโมเดลไหนเลย");
  assert.equal(v.detail?.ownWeightRatio, 2);
  assert.equal(v.detail?.ownCbmRatio, 2);
});

check("BLOCK · ฐาน ×5 (prod #52198 · 1782544029-2 · PR086 · เก็บเกิน ฿3,920 จริง)", () => {
  // momo: qty=5 · weight_kg=50 · cbm=0.2 · dims 50×40×20 = 0.04 → 0.04×5 = 0.2 = line_total
  // เรา: fweight=250 (=50×5 ซ้ำ) · fvolume=1.0 (=0.2×5 ซ้ำ)
  // ยืนยันซ้อนจากใบแจ้งหนี้ MOMO เอง (INV-20260708-0002 บรรทัด 5)
  // ฐาน 250/1.0 ไม่เข้าทั้งกล่องตัวเอง (50/0.2) และ Σ ทั้ง base (105.5/0.346) → block
  const base: MomoBoxRow[] = [
    { boxTracking: "1782544029",   width: 30, length: 25, height: 20, weightKg: 15.5, cbm: 0.015,  quantity: 1 },
    { boxTracking: "1782544029-2", width: 50, length: 40, height: 20, weightKg: 50,   cbm: 0.2,    quantity: 5 },
    { boxTracking: "1782544029-3", width: 40, length: 30, height: 25, weightKg: 40,   cbm: 0.03,   quantity: 1 },
  ];
  const v = evaluateBasisDrift({
    storedWeightKg: 250, storedCbm: 1.0,
    ownBoxTracking: "1782544029-2", baseBoxes: base,
  });
  assert.equal(v.blocked, true);
  assert.equal(v.detail?.ownWeightRatio, 5);
  assert.equal(v.detail?.ownCbmRatio, 5);
});

check("BLOCK · คิว เพี้ยนอย่างเดียว · นน. ตรง (prod #52422 · 1783586200 · PR566)", () => {
  // นน. 195 = 15×13 ✓ ตรง · แต่ fvolume=0.05063 = ต่อกล่อง (ที่ถูก = 0.0506×13 = 0.658)
  // แถวเดียวกันเก็บ นน. แบบยอดรวม แต่ คิว แบบต่อกล่อง = ขัดกันเองในแถว → ฐานเชื่อไม่ได้
  const v = evaluateBasisDrift({
    storedWeightKg: 195, storedCbm: 0.05063,
    ownBoxTracking: "1783586200",
    baseBoxes: [{ boxTracking: "1783586200", width: 45, length: 45, height: 25, weightKg: 15, cbm: 0.0506, quantity: 13 }],
  });
  assert.equal(v.blocked, true);
  assert.ok(v.message?.includes("ปริมาตร"), "ต้องชี้ว่าเป็นเรื่อง คิว");
  assert.ok(!v.message?.includes("น้ำหนัก ระบบเก็บ"), "นน. ตรง → ห้ามฟ้อง นน.");
});

check("BLOCK · ฐานเก็บ **ต่ำกว่า** MOMO ก็ block (prod #52110 · 1782113771 · PR047)", () => {
  // นน. เก็บ 149.09 vs MOMO 200 (0.75x) — ทิศตรงข้ามกับ ×2 แต่ก็คือ "ฐานไม่ตรง MOMO"
  // guard เป็นกลางเรื่องทิศ: เก็บสูงไป = เก็บเกินลูกค้า · เก็บต่ำไป = บริษัทขาดรายได้
  const v = evaluateBasisDrift({
    storedWeightKg: 149.09, storedCbm: 0.2328,
    ownBoxTracking: "1782113771",
    baseBoxes: [{ boxTracking: "1782113771", width: 20, length: 30, height: 38.8, weightKg: 20, cbm: 0.0233, quantity: 10 }],
  });
  assert.equal(v.blocked, true);
  assert.ok((v.detail?.ownWeightRatio ?? 0) < 1, "ratio ต้อง < 1 (เก็บต่ำกว่า MOMO)");
});

check("BLOCK · ข้อความไทย บอกความจริง: เลขทั้ง 2 ฝั่ง + กี่เท่า + ต้องทำอะไรต่อ", () => {
  // [[wrong-error-message-hides-real-block]] — error ที่ไม่บอกต้นตอ = คนไปนั่งแก้ผิดเรื่อง
  const v = evaluateBasisDrift({
    storedWeightKg: 670, storedCbm: 2.1,
    ownBoxTracking: "1781309805", baseBoxes: [BOX_1781309805],
  });
  assert.ok(v.message, "ต้องมีข้อความ");
  const m = v.message!;
  assert.ok(m.includes("670"), "ต้องบอกฐานที่ระบบเก็บ");
  assert.ok(m.includes("335"), "ต้องบอกฐานของ MOMO");
  assert.ok(m.includes("2.00 เท่า"), "ต้องบอกว่าต่างกี่เท่า");
  assert.ok(m.includes("MOMO"), "ต้องบอกว่าเทียบกับอะไร");
  assert.ok(m.includes("ราคาเดิมถูกล็อกไว้"), "ต้องบอกว่าเงินเดิมไม่ถูกแตะ");
  assert.ok(m.includes("ขนาดกล่อง"), "ต้องบอกว่าไปแก้ที่ไหน");
});

check("BLOCK · หลายกล่อง → ข้อความบอกยอดรวมที่เทียบแล้วด้วย (ตอบ 'แล้วเลขไหนถูก')", () => {
  const v = evaluateBasisDrift({
    storedWeightKg: 99999, storedCbm: 99,
    ownBoxTracking: "1782555393-2", baseBoxes: BASE_1782555393,
  });
  assert.equal(v.blocked, true);
  assert.ok(v.message?.includes("ยอดรวมทั้งแทรคกิ้ง"), "หลายกล่อง → ต้องบอก Σ ที่เทียบด้วย");
  assert.ok(v.message?.includes("5 กล่อง"), "ต้องบอกจำนวนกล่องที่รวม");
});

// ════════════════════════════════════════════════════════════════════
// PASS — the over-blocking protection (the load-bearing half)
// ════════════════════════════════════════════════════════════════════

check("PASS · ฐานตรงกล่องตัวเอง (prod #52137 · 1782555393 · per_piece)", () => {
  // dims 320×27×13 = 0.11232 ≈ cbm 0.1123 → per_piece → นน. 50×3=150 · คิว 0.33696
  const v = evaluateBasisDrift({
    storedWeightKg: 150, storedCbm: 0.3369,
    ownBoxTracking: "1782555393", baseBoxes: BASE_1782555393,
  });
  assert.equal(v.blocked, false);
  assert.equal(v.matchedModel, "own_box");
  assert.equal(v.skipReason, "basis_matches_box");
});

check("PASS · ฐานตรงกล่องตัวเอง แบบ line_total (prod #52194 · 1782555393-2)", () => {
  // dims 1.7556 × qty 3 = 5.2668 = cbm → line_total → ห้ามคูณ → นน. 3580.5 · คิว 5.2668
  // (ตัวนี้เคยถูกเรียกว่า "landmine ฿114,888" ในเอกสาร — prod วันนี้ซ่อมแล้ว = ต้องผ่าน)
  const v = evaluateBasisDrift({
    storedWeightKg: 3580.5, storedCbm: 5.2668,
    ownBoxTracking: "1782555393-2", baseBoxes: BASE_1782555393,
  });
  assert.equal(v.blocked, false);
  assert.equal(v.matchedModel, "own_box");
});

check("🔴 PASS · แถวรวม (rollup Σ) — กัน guard บล็อก 'การซ่อม' ของตัวเอง", () => {
  // adminUpdateMomoBoxDetails เขียน rollupBoxes = Σ ทุกกล่องของ base ลงแถวเดียว
  // (famountcount='1') **แล้วค่อย** re-price → ถ้า guard ดูแค่กล่องตัวเอง จะบล็อกทันที
  // → พนักงานแก้กล่องเสร็จ แต่ราคาไม่อัพเดท = การซ่อมพัง. ต้องผ่าน.
  // Σ ของ BASE_1782555393 = 150 + 3580.5 + 350 + 800 + 900 = 5,780.5 กก.
  const v = evaluateBasisDrift({
    storedWeightKg: 5780.5, storedCbm: 13.989264,
    ownBoxTracking: "1782555393", baseBoxes: BASE_1782555393,
  });
  assert.equal(v.blocked, false, "แถวรวมต้องไม่ถูกบล็อก");
  assert.equal(v.matchedModel, "base_sum");
  assert.equal(v.skipReason, "basis_matches_base_sum");
  assert.equal(v.detail?.baseBoxCount, 5);
});

check("PASS · ไม่มี box_detail เลย → ปล่อยผ่าน (102 แถว prod · งานปกติห้ามหยุด)", () => {
  // fail-SAFE ไม่ fail-closed: ของที่ไม่ได้มาจาก MOMO ต้องคิดราคาได้ตามปกติ
  const v = evaluateBasisDrift({
    storedWeightKg: 100, storedCbm: 1.5, ownBoxTracking: "SOMETHING", baseBoxes: [],
  });
  assert.equal(v.blocked, false);
  assert.equal(v.skipReason, "no_momo_box");
  assert.equal(v.detail, null);
});

check("PASS · baseBoxes = null/undefined → ปล่อยผ่าน", () => {
  assert.equal(evaluateBasisDrift({ storedWeightKg: 100, storedCbm: 1.5, ownBoxTracking: "X", baseBoxes: null }).blocked, false);
  assert.equal(evaluateBasisDrift({ storedWeightKg: 100, storedCbm: 1.5, ownBoxTracking: "X", baseBoxes: undefined }).blocked, false);
});

check("PASS · มี box ของ base แต่ไม่มีกล่องของแถวนี้ (ช่องโหว่ bare↔-1/N) → ข้าม ไม่เดา", () => {
  // 15 แถว prod: bare base ที่ MOMO ตั้งชื่อกล่อง #1 ว่า "-1/N" → ไม่มี exact match
  // จับคู่มั่วอันตราย (bare อาจเป็นกล่อง#1 หรือแถวสรุปทั้งชิปเม้น) → skip
  const v = evaluateBasisDrift({
    storedWeightKg: 36.5, storedCbm: 0.0712,
    ownBoxTracking: "519218029029",
    baseBoxes: [
      { boxTracking: "519218029029-1/2", width: 30, length: 25, height: 20, weightKg: 16.5, cbm: 0.0356, quantity: 1 },
      { boxTracking: "519218029029-2/2", width: 30, length: 25, height: 20, weightKg: 20,   cbm: 0.0356, quantity: 1 },
    ],
  });
  assert.equal(v.blocked, false);
  assert.equal(v.skipReason, "no_momo_box");
});

check("PASS · MOMO ชี้ขาดไม่ได้ (ไม่มี dims) → ปล่อยผ่าน ไม่เดา", () => {
  // resolveMomoBoxBasis → decided:false → เราไม่มี "ความจริง" จะไปอ้าง → ห้าม block
  const v = evaluateBasisDrift({
    storedWeightKg: 999, storedCbm: 9.99,
    ownBoxTracking: "X",
    baseBoxes: [{ boxTracking: "X", width: 0, length: 0, height: 0, weightKg: 10, cbm: 0.5, quantity: 5 }],
  });
  assert.equal(v.blocked, false);
  assert.equal(v.skipReason, "momo_basis_undecidable");
});

check("PASS · MOMO ชี้ขาดไม่ได้ (cbm ไม่เข้าทั้ง 2 สูตร = MOMO มั่ว) → ปล่อยผ่าน", () => {
  const v = evaluateBasisDrift({
    storedWeightKg: 100, storedCbm: 1.0,
    ownBoxTracking: "X",
    baseBoxes: [{ boxTracking: "X", width: 10, length: 10, height: 10, weightKg: 10, cbm: 7.77, quantity: 5 }],
  });
  assert.equal(v.blocked, false);
  assert.equal(v.skipReason, "momo_basis_undecidable");
});

check("PASS · noise floor: ต่าง 2.4% แต่แค่ 0.01 กก. (prod #52625 · SF5157997088360)", () => {
  // นน. เก็บ 0.42 vs MOMO 0.41 → relDiff 2.4% > 2% แต่ = การปัดเศษของ MOMO
  // ถ้าไม่มี abs floor → แถว ฿50 พวกนี้โดน block ฟรี (verified prod: 3 แถว)
  const v = evaluateBasisDrift({
    storedWeightKg: 0.42, storedCbm: 0.007444,
    ownBoxTracking: "SF5157997088360",
    baseBoxes: [{ boxTracking: "SF5157997088360", width: 34.36, length: 23.55, height: 9.2, weightKg: 0.41, cbm: 0.0074, quantity: 1 }],
  });
  assert.equal(v.blocked, false);
  assert.equal(v.matchedModel, "own_box");
});

check("PASS · noise floor prod #52633 (0.21 vs 0.20 = 4.8% · 0.01 กก.)", () => {
  const v = evaluateBasisDrift({
    storedWeightKg: 0.21, storedCbm: 0.006122,
    ownBoxTracking: "435265138767340",
    baseBoxes: [{ boxTracking: "435265138767340", width: 26, length: 21.5, height: 10.95, weightKg: 0.2, cbm: 0.0061, quantity: 1 }],
  });
  assert.equal(v.blocked, false);
});

check("PASS · ฐานเรา=0 ทั้งคู่ → ข้าม (0 = ข้อมูลขาด · guard เดิมจับไปแล้ว)", () => {
  const v = evaluateBasisDrift({
    storedWeightKg: 0, storedCbm: 0,
    ownBoxTracking: "X",
    baseBoxes: [{ boxTracking: "X", width: 30, length: 30, height: 30, weightKg: 10, cbm: 0.027, quantity: 1 }],
  });
  assert.equal(v.blocked, false);
  assert.equal(v.skipReason, "nothing_comparable");
});

check("PASS · MOMO ส่ง 0 มาทั้งคู่ → ข้าม ไม่เคลมว่าเราผิด", () => {
  // "MOMO ส่ง 0 มา = ข้อมูลขาด ไม่ใช่เราเก็บเกิน"
  const v = evaluateBasisDrift({
    storedWeightKg: 100, storedCbm: 1.5,
    ownBoxTracking: "X",
    baseBoxes: [{ boxTracking: "X", width: 0, length: 0, height: 0, weightKg: 0, cbm: 0, quantity: 1 }],
  });
  assert.equal(v.blocked, false);
  assert.ok(v.skipReason === "nothing_comparable" || v.skipReason === "momo_basis_undecidable");
});

check("PASS · ต่างพอดี tolerance (2%) → ไม่ block (ขอบเขตแม่น)", () => {
  // 102 vs 100 = relDiff 1.96% ≤ 2% → ผ่าน (แม้ abs 2 กก. > floor)
  const v = evaluateBasisDrift({
    storedWeightKg: 102, storedCbm: 1.0,
    ownBoxTracking: "X",
    baseBoxes: [{ boxTracking: "X", width: 100, length: 100, height: 100, weightKg: 100, cbm: 1.0, quantity: 1 }],
  });
  assert.equal(v.blocked, false);
  assert.equal(v.matchedModel, "own_box");
});

check("Σ ที่มีกล่องชี้ขาดไม่ได้ปนอยู่ → ห้ามใช้ Σ นั้น 'ช่วย' ให้ผ่าน (เดาไม่ได้)", () => {
  // กล่อง -2 ไม่มี dims → undecidable → Σ เป็นการเดา → ต้องไม่ rescue
  const base: MomoBoxRow[] = [
    { boxTracking: "Z",   width: 100, length: 100, height: 100, weightKg: 100, cbm: 1.0, quantity: 1 },
    { boxTracking: "Z-2", width: 0,   length: 0,   height: 0,   weightKg: 50,  cbm: 0.5, quantity: 4 },
  ];
  const v = evaluateBasisDrift({ storedWeightKg: 300, storedCbm: 3.0, ownBoxTracking: "Z", baseBoxes: base });
  assert.equal(v.blocked, true, "Σ ที่เดา ห้ามใช้ปลดล็อก");
  assert.equal(v.detail?.baseSumWeightKg, null, "Σ ที่เชื่อไม่ได้ → ไม่รายงานเป็นตัวเลข");
});

// ════════════════════════════════════════════════════════════════════
// knobs / invariants
// ════════════════════════════════════════════════════════════════════

check("threshold = 2% เท่ากับ BOX_BASIS_TOLERANCE ของ self-heal (SOT เดียวกัน)", () => {
  // ถ้าเลขนี้เพี้ยนจากกัน guard กับ self-heal จะเถียงกันว่าแถวไหน healthy
  assert.equal(BASIS_DRIFT_TOLERANCE, 0.02);
  assert.equal(BASIS_DRIFT_MIN_KG, 0.5);
});

check("ปรับ tolerance ได้ผ่าน opts (ให้ script/audit ลองค่าอื่นได้)", () => {
  const base: MomoBoxRow[] = [{ boxTracking: "X", width: 100, length: 100, height: 100, weightKg: 100, cbm: 1.0, quantity: 1 }];
  const inp = { storedWeightKg: 130, storedCbm: 1.0, ownBoxTracking: "X", baseBoxes: base };
  assert.equal(evaluateBasisDrift(inp).blocked, true);                          // 23% → block @2%
  assert.equal(evaluateBasisDrift(inp, { relTolerance: 0.5 }).blocked, false);  // ผ่าน @50%
});

check("PURE · เรียกซ้ำได้ผลเดิม + ไม่แก้ input", () => {
  const input = {
    storedWeightKg: 670, storedCbm: 2.1,
    ownBoxTracking: "1781309805", baseBoxes: [BOX_1781309805],
  };
  const snapshot = JSON.stringify(input);
  const a = evaluateBasisDrift(input);
  const b = evaluateBasisDrift(input);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(input), snapshot, "ห้ามแก้ input");
});

check("รับค่า string จาก DB (legacy varchar) ได้", () => {
  const v = evaluateBasisDrift({
    storedWeightKg: 670, storedCbm: 2.1,
    ownBoxTracking: "1781309805",
    baseBoxes: [{ boxTracking: "1781309805", width: "100", length: "70", height: "150", weightKg: "335", cbm: "1.05", quantity: "1" }],
  });
  assert.equal(v.blocked, true);
  assert.equal(v.detail?.ownWeightRatio, 2);
});

check("ตัดช่องว่างหัวท้ายของ tracking ก่อนจับคู่", () => {
  const v = evaluateBasisDrift({
    storedWeightKg: 670, storedCbm: 2.1,
    ownBoxTracking: "  1781309805  ",
    baseBoxes: [{ ...BOX_1781309805, boxTracking: " 1781309805 " }],
  });
  assert.equal(v.blocked, true, "ต้องจับคู่ได้แม้มีช่องว่าง");
});

console.log(`\n${passed} passed\n`);
