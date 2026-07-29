/**
 * momo-container-truth.test.ts — ล็อกกฎ "สรุปอยู่ตู้ไหนกันแน่".
 *
 * เคสในเทสนี้เป็น **ข้อมูลจริงจาก prod** (2026-07-29) ไม่ใช่ fixture ที่กุขึ้น —
 * บทเรียน 2026-07-17: fixture ที่กุเองหลอกได้ทั้ง agent + verifier.
 *   1783582423 (PR179) = 3 ตู้ · 23 แถว · 987.48 / 487.80 / 532.00 kg
 *   1784432869 (PR179) = 3 ตู้ · 18 แถว · 432.00 / 1295.80 / 14.90 kg
 *   SF0218235127129 (PR589) = 2 ตู้ · 3 แถว (subCount ต่างกัน 1 vs 2)
 */
import assert from "node:assert/strict";
import {
  baseOfTracking,
  buildPackingTruthMap,
  groupStagingByMomoBatch,
  resolveContainerTruth,
  type PackingContainerLine,
  type StagingSubRow,
} from "./momo-container-truth";

let pass = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  pass += 1;
  console.log(`  ✓ ${label}`);
};

const sub = (
  t: string, batch: string | null, wt: number, cbm: number, qty: number, fid: number | null,
  containerBatchNo: string | null = null,
): StagingSubRow => ({
  momoTrackingNo: t, momoContainerNo: batch, weightKg: wt, cbm, quantity: qty,
  committedForwarderId: fid, containerBatchNo,
});

const pack = (cab: string, subCount: number, boxes: number, wt: number, cbm: number): PackingContainerLine =>
  ({ cabinet: cab, subCount, boxes, weightKg: wt, cbm });

console.log("momo-container-truth");

// ── baseOfTracking ─────────────────────────────────────────────────────
ok("baseOfTracking ตัด -N และ -N/M", () => {
  assert.equal(baseOfTracking("1783582423-23"), "1783582423");
  assert.equal(baseOfTracking("908006932749-2/6"), "908006932749");
  assert.equal(baseOfTracking("1783582423"), "1783582423");
  assert.equal(baseOfTracking(null), "");
  // เลขที่ลงท้ายด้วยขีดล้วน (JDX…-1-1-) ไม่ถูกตัดผิด
  assert.equal(baseOfTracking("SF0218235127129"), "SF0218235127129");
});

// ── groupStagingByMomoBatch ────────────────────────────────────────────
ok("จัดกลุ่มตามรอบขนส่ง MOMO + รวมยอด", () => {
  const gs = groupStagingByMomoBatch([
    sub("A-1", "PR20260708-SEA01", 10, 0.1, 1, 101),
    sub("A-2", "PR20260708-SEA01", 20, 0.2, 2, 102),
    sub("A-3", "PR20260710-SEA02", 5, 0.05, 1, 103),
  ]);
  assert.equal(gs.length, 2);
  const g1 = gs.find((g) => g.momoContainerNo === "PR20260708-SEA01")!;
  assert.equal(g1.rows, 2);
  assert.equal(g1.weightKg, 30);
  assert.equal(g1.quantity, 3);
  assert.deepEqual(g1.forwarderIds, [101, 102]);
});

ok("แถวที่ยังไม่ commit ไม่เข้า forwarderIds", () => {
  const gs = groupStagingByMomoBatch([sub("A-1", "B1", 10, 0.1, 1, null)]);
  assert.deepEqual(gs[0].forwarderIds, []);
  assert.equal(gs[0].rows, 1);
});

// ── เคสจริง prod: 1783582423 = 3 ตู้ ───────────────────────────────────
ok("1783582423 (prod): จับคู่ครบ 3 ตู้ ไม่มีชนกัน", () => {
  const packing = [
    pack("GZS260710-1", 14, 60, 987.48, 7.83702),
    pack("GZS260710-2", 8, 28, 487.80, 3.80236),
    pack("GZS260712-1", 1, 28, 532.00, 4.18320),
  ];
  // 14 แถว SEA01(07-08) · 8 แถว SEA02(07-10) · 1 แถว SEA01(07-10)
  const staging: StagingSubRow[] = [
    // GZS260710-1 → Σ 987.48 / 7.8370
    sub("1783582423-10", "PR20260708-SEA01", 27.6, 0.2412, 2, 52547),
    sub("1783582423-11", "PR20260708-SEA01", 170, 1.314, 10, 52548),
    sub("1783582423-12", "PR20260708-SEA01", 33.9, 0.33984, 3, 52549),
    sub("1783582423-13", "PR20260708-SEA01", 14.1, 0.1095, 1, 52564),
    sub("1783582423-14", "PR20260708-SEA01", 74.88, 0.56064, 4, 52565),
    sub("1783582423-16", "PR20260708-SEA01", 9.5, 0.0765, 1, 52550),
    sub("1783582423-18", "PR20260708-SEA01", 53.7, 0.4482, 3, 52569),
    sub("1783582423-2", "PR20260708-SEA01", 30.9, 0.3015, 3, 52541),
    sub("1783582423-20", "PR20260708-SEA01", 21.4, 0.18, 2, 52571),
    sub("1783582423-22", "PR20260708-SEA01", 14.3, 0.12864, 1, 52566),
    sub("1783582423-4", "PR20260708-SEA01", 33.6, 0.2412, 2, 52561),
    sub("1783582423-5", "PR20260708-SEA01", 13.35, 0.096, 1, 52563),
    sub("1783582423-8", "PR20260708-SEA01", 266, 2.0916, 14, 52545),
    sub("1783582423-9", "PR20260708-SEA01", 224.25, 1.7082, 13, 52546),
    // GZS260710-2 → Σ 487.80 / 3.80236
    sub("1783582423", "PR20260710-SEA02", 247, 1.9422, 13, 52511),
    sub("1783582423-15", "PR20260710-SEA02", 57, 0.4482, 3, 52567),
    sub("1783582423-17", "PR20260710-SEA02", 45, 0.3735, 3, 52568),
    sub("1783582423-19", "PR20260710-SEA02", 12, 0.1005, 1, 52570),
    sub("1783582423-21", "PR20260710-SEA02", 26, 0.2144, 2, 52572),
    sub("1783582423-3", "PR20260710-SEA02", 35, 0.249, 2, 52542),
    sub("1783582423-6", "PR20260710-SEA02", 55.5, 0.3984, 3, 52543),
    sub("1783582423-7", "PR20260710-SEA02", 10.3, 0.07616, 1, 52544),
    // GZS260712-1 → 532.00 / 4.1832
    sub("1783582423-23", "PR20260710-SEA01", 532, 4.1832, 28, 52447),
  ];
  const t = resolveContainerTruth("1783582423", packing, staging);
  assert.equal(t.isMultiContainer, true);
  assert.deepEqual(t.packingCabinets, ["GZS260710-1", "GZS260710-2", "GZS260712-1"]);
  assert.equal(t.groups.length, 3);
  assert.equal(t.unresolvedGroups.length, 0, "ทุกกลุ่มต้องจับคู่ได้");
  assert.equal(t.assignments.size, 23, "ครบ 23 แถว");
  // แถวที่ระบบเคยประทับ GZS260712-1 ผิด → ต้องได้ตู้ที่ถูก
  assert.equal(t.assignments.get(52545), "GZS260710-1");
  assert.equal(t.assignments.get(52511), "GZS260710-2");
  assert.equal(t.assignments.get(52447), "GZS260712-1");
  // ทุกกลุ่มจับด้วยกุญแจหลัก (ไม่ตกไปใช้ fallback)
  for (const g of t.groups) {
    assert.equal(g.outcome.kind, "matched");
    if (g.outcome.kind === "matched") assert.equal(g.outcome.how, "exact");
  }
});

// ── เคสจริง prod: 1784432869 ───────────────────────────────────────────
ok("1784432869 (prod): 2+15+1 แถว → 3 ตู้", () => {
  const packing = [
    pack("GZS260720-1", 2, 24, 432.00, 3.3696),
    pack("GZS260721-1", 15, 74, 1295.80, 10.2572),
    pack("GZS260723-1", 1, 1, 14.90, 0.1245),
  ];
  const staging: StagingSubRow[] = [
    sub("1784432869", "PR20260719-SEA01", 400, 3.0, 20, 900),
    sub("1784432869-2", "PR20260719-SEA01", 32, 0.3696, 4, 901),
    ...Array.from({ length: 15 }, (_, i) =>
      sub(`1784432869-${i + 3}`, "PR20260720-SEA01", 1295.8 / 15, 10.2572 / 15, 5, 910 + i)),
    sub("1784432869-18", "PR20260721-SEA01", 14.9, 0.1245, 1, 950),
  ];
  const t = resolveContainerTruth("1784432869", packing, staging);
  assert.equal(t.unresolvedGroups.length, 0);
  assert.equal(t.assignments.size, 18);
  assert.equal(t.assignments.get(900), "GZS260720-1");
  assert.equal(t.assignments.get(910), "GZS260721-1");
  assert.equal(t.assignments.get(950), "GZS260723-1");
});

// ── เคสจริง prod: subCount ต่าง (1 vs 2) ยังแยกได้ ─────────────────────
ok("SF0218235127129 (prod): น้ำหนักใกล้กัน 13.5 vs 14.0 แต่ subCount ต่าง → แยกออก", () => {
  const packing = [
    pack("GZE260718-1", 1, 1, 13.50, 0.1033),
    pack("GZE260720-1", 2, 2, 14.00, 0.1064),
  ];
  const staging: StagingSubRow[] = [
    sub("SF0218235127129", "PR20260716-EK01", 13.5, 0.1033, 1, 700),
    sub("SF0218235127129-2", "PR20260718-EK01", 7, 0.0532, 1, 701),
    sub("SF0218235127129-3", "PR20260718-EK01", 7, 0.0532, 1, 702),
  ];
  const t = resolveContainerTruth("SF0218235127129", packing, staging);
  assert.equal(t.unresolvedGroups.length, 0);
  assert.equal(t.assignments.get(700), "GZE260718-1");
  assert.equal(t.assignments.get(701), "GZE260720-1");
  assert.equal(t.assignments.get(702), "GZE260720-1");
});

// ── ตู้เดียว = ไม่ต้องเทียบน้ำหนัก ─────────────────────────────────────
ok("แพคกิ้งบอกตู้เดียว → ทุกกลุ่มได้ตู้นั้น (แม้น้ำหนักไม่ตรง)", () => {
  const t = resolveContainerTruth(
    "X1",
    [pack("GZS260701-1", 5, 5, 100, 1.0)],
    [sub("X1", "B1", 99, 0.99, 5, 1), sub("X1-2", "B2", 1, 0.01, 1, 2)],
  );
  assert.equal(t.isMultiContainer, false);
  assert.equal(t.assignments.get(1), "GZS260701-1");
  assert.equal(t.assignments.get(2), "GZS260701-1");
  assert.equal(t.unresolvedGroups.length, 0);
});

// ── ไม่เดา: ambiguous / unmatched / no_packing ─────────────────────────
ok("2 ตู้ยอดเท่ากันเป๊ะ → ambiguous (ห้ามเดา)", () => {
  const t = resolveContainerTruth(
    "X2",
    [pack("GZS260701-1", 1, 1, 50, 0.5), pack("GZS260702-1", 1, 1, 50, 0.5)],
    [sub("X2", "B1", 50, 0.5, 1, 11)],
  );
  assert.equal(t.assignments.size, 0, "ห้ามประทับเลขตู้ตอนชน");
  assert.equal(t.unresolvedGroups.length, 1);
  assert.equal(t.unresolvedGroups[0].outcome.kind, "ambiguous");
  if (t.unresolvedGroups[0].outcome.kind === "ambiguous") {
    assert.deepEqual(t.unresolvedGroups[0].outcome.candidates, ["GZS260701-1", "GZS260702-1"]);
  }
});

ok("น้ำหนักไม่ตรงบรรทัดไหนเลย → unmatched (ไม่เดา)", () => {
  const t = resolveContainerTruth(
    "X3",
    [pack("GZS260701-1", 1, 1, 50, 0.5), pack("GZS260702-1", 1, 1, 80, 0.8)],
    [sub("X3", "B1", 999, 9.99, 1, 12)],
  );
  assert.equal(t.assignments.size, 0);
  assert.equal(t.unresolvedGroups[0].outcome.kind, "unmatched");
});

ok("ยังไม่อัพแพคกิ้งลิส → no_packing (บอกให้ไปอัพ ไม่ใช่บอกว่าตู้ผิด)", () => {
  const t = resolveContainerTruth("X4", [], [sub("X4", "B1", 10, 0.1, 1, 13)]);
  assert.equal(t.assignments.size, 0);
  assert.equal(t.groups[0].outcome.kind, "no_packing");
  assert.equal(t.isMultiContainer, false);
});

ok("MOMO ส่งเลขตู้จริงมาเอง + อยู่ในแพคกิ้ง → เชื่อตัวนั้นก่อน", () => {
  const t = resolveContainerTruth(
    "X5",
    [pack("GZS260701-1", 1, 1, 50, 0.5), pack("GZS260702-1", 1, 1, 50, 0.5)],
    [sub("X5", "B1", 50, 0.5, 1, 14, "GZS260702-1")],
  );
  assert.equal(t.assignments.get(14), "GZS260702-1");
  const g = t.groups[0];
  assert.equal(g.outcome.kind, "matched");
  if (g.outcome.kind === "matched") assert.equal(g.outcome.how, "momo_batch_no");
});

ok("เลขตู้ที่ MOMO ส่งมาแต่ไม่อยู่ในแพคกิ้ง = ไม่เชื่อ (ตกไปเทียบยอด)", () => {
  const t = resolveContainerTruth(
    "X6",
    [pack("GZS260701-1", 1, 1, 50, 0.5), pack("GZS260702-1", 1, 1, 80, 0.8)],
    [sub("X6", "B1", 50, 0.5, 1, 15, "GZS269999-9")],
  );
  assert.equal(t.assignments.get(15), "GZS260701-1"); // ยอดชี้ตู้นี้
});

// ── buildPackingTruthMap: ตู้ซ้ำ = เอาไฟล์ล่าสุด ───────────────────────
ok("ตู้เดียวอัพซ้ำ → ใช้ไฟล์ล่าสุด ไฟล์เก่าถูกข้าม", () => {
  const map = buildPackingTruthMap([
    { containerNo: "GZS260712-1", rows: [{ baseTracking: "T1", boxes: 28, weight: 532, cbm: 4.1832, subCount: 1 }] },
    { containerNo: "GZS260712-1", rows: [{ baseTracking: "T1", boxes: 9, weight: 99, cbm: 9.9, subCount: 9 }] },
  ]);
  const lines = map.get("T1")!;
  assert.equal(lines.length, 1, "ต้องเหลือบรรทัดเดียว (ไฟล์ล่าสุด)");
  assert.equal(lines[0].weightKg, 532);
});

ok("หลายตู้ → base เดียวได้หลายบรรทัด", () => {
  const map = buildPackingTruthMap([
    { containerNo: "C1", rows: [{ baseTracking: "T", boxes: 1, weight: 10, cbm: 0.1, subCount: 1 }] },
    { containerNo: "C2", rows: [{ baseTracking: "T", boxes: 2, weight: 20, cbm: 0.2, subCount: 2 }] },
  ]);
  assert.equal(map.get("T")!.length, 2);
});

ok("บรรทัดที่ไม่มี baseTracking ถูกทิ้ง (ไม่พังทั้งไฟล์)", () => {
  const map = buildPackingTruthMap([
    { containerNo: "C1", rows: [{ baseTracking: null, boxes: 1, weight: 1, cbm: 1, subCount: 1 }, { baseTracking: "T", boxes: 1, weight: 1, cbm: 1, subCount: 1 }] },
  ]);
  assert.equal(map.size, 1);
  assert.ok(map.has("T"));
});

ok("ตู้ว่าง (ไฟล์ไม่รู้เลขตู้) ถูกข้าม", () => {
  const map = buildPackingTruthMap([
    { containerNo: "", rows: [{ baseTracking: "T", boxes: 1, weight: 1, cbm: 1, subCount: 1 }] },
  ]);
  assert.equal(map.size, 0);
});

console.log(`\n${pass} pass, 0 fail`);
