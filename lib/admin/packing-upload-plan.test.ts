import assert from "node:assert";
import {
  isNonParcelPackingRow,
  describeMissingCreatable,
  decideContainerWrite,
  containerWriteNote,
  describeApplyPlan,
  markSupersededUploads,
  describePriorUploads,
  overlayPackingLines,
  PR_CODE_RX,
} from "./packing-upload-plan";
import type { PackingContainerLine } from "./momo-container-truth";

// ══════════════════════════════════════════════════════════════════
// 1. isNonParcelPackingRow — หัวตาราง / กระสอบ / พัสดุจริง
// ══════════════════════════════════════════════════════════════════

// 1a. หัวตารางที่ติดมาในไฟล์ (พบจริงทุกไฟล์บน prod: base="Tracking" code="Code")
{
  const v = isNonParcelPackingRow({ baseTracking: "Tracking", code: "Code", boxes: null, weight: null, cbm: null });
  assert.equal(v.nonParcel, true, "หัวตาราง = ไม่ใช่พัสดุ");
  assert.equal(v.nonParcel && v.reason, "header_row");
  assert.match(v.nonParcel ? v.message : "", /หัวตาราง/);
}

// 1b. เลขกระสอบ CBX… ที่หลุดมาเป็นแถวพัสดุ (พบจริง: CBX260727-SEA23 · 1 กล่อง 0.4kg)
{
  const v = isNonParcelPackingRow({ baseTracking: "CBX260727-SEA23", code: null, boxes: 1, weight: 0.4, cbm: 0.00112 });
  assert.equal(v.nonParcel, true, "กระสอบ = ไม่ใช่พัสดุ แม้มีน้ำหนัก");
  assert.equal(v.nonParcel && v.reason, "sack");
  assert.match(v.nonParcel ? v.message : "", /กระสอบ/);
}

// 1c. พัสดุจริง — ห้ามถูกกลืน
{
  assert.equal(
    isNonParcelPackingRow({ baseTracking: "1784432869", code: "PR050", boxes: 2, weight: 36.5, cbm: 0.071 }).nonParcel,
    false,
    "พัสดุจริงต้องผ่าน",
  );
  // พัสดุจริงที่ MOMO ยังไม่ชั่ง (ค่าว่างทั้งแถว) แต่เลขแทรคไม่ใช่ชื่อคอลัมน์ → ยังเป็นพัสดุ
  assert.equal(
    isNonParcelPackingRow({ baseTracking: "SF0218235127129", code: null, boxes: null, weight: null, cbm: null }).nonParcel,
    false,
    "แทรคจริงที่ยังไม่มีตัวเลข ห้ามตีเป็นหัวตาราง",
  );
  // ชื่อคอลัมน์ แต่มีตัวเลขจริง → ไม่กลืน (fail-safe ทางที่ปลอดภัย)
  assert.equal(
    isNonParcelPackingRow({ baseTracking: "Tracking", code: "Code", boxes: 3, weight: 10, cbm: 0.05 }).nonParcel,
    false,
    "มีตัวเลขจริง = ไม่ตัดเป็นหัวตาราง",
  );
}

// 1d. normalize — "Tracking No." / "  code  " ก็จับได้
{
  assert.equal(isNonParcelPackingRow({ baseTracking: "Tracking No.", boxes: null, weight: null, cbm: null }).nonParcel, true);
  assert.equal(isNonParcelPackingRow({ baseTracking: "x", code: "  Code  ", boxes: null, weight: null, cbm: null }).nonParcel, true);
  assert.equal(isNonParcelPackingRow({ baseTracking: "", code: null }).nonParcel, true, "ไม่มีเลขแทรค = ไม่ใช่พัสดุ");
}

// ══════════════════════════════════════════════════════════════════
// 2. describeMissingCreatable — สร้างได้/ไม่ได้ + เหตุผลจริง
// ══════════════════════════════════════════════════════════════════
{
  assert.equal(describeMissingCreatable({ code: "PR050" }).creatable, true);
  assert.equal(describeMissingCreatable({ code: "pr9820" }).creatable, true, "รับตัวเล็ก (mirror /^PR\\d+$/i)");

  const noCode = describeMissingCreatable({ code: null });
  assert.equal(noCode.creatable, false);
  assert.match(noCode.creatable === false ? noCode.reason : "", /ไม่ได้ส่งรหัสลูกค้า/);

  const empty = describeMissingCreatable({ code: "   " });
  assert.equal(empty.creatable, false, "ช่องว่าง = ไม่มีรหัส");

  // prod จริง: "Code" (หัวตาราง) + "PR+PR132" (พิมพ์ผิด) → ต้องบอกรหัสที่ MOMO ส่งมา
  const junk = describeMissingCreatable({ code: "PR+PR132" });
  assert.equal(junk.creatable, false);
  assert.match(junk.creatable === false ? junk.reason : "", /PR\+PR132/, "เหตุผลต้องอ้างรหัสจริงที่ MOMO ส่งมา");
  assert.match(junk.creatable === false ? junk.reason : "", /ไม่ใช่รูปแบบ PR/);

  // ตัวตัดสินต้องตรงกับ regex ที่ apply ใช้ทุกเคส (จอ = เซิร์ฟ)
  for (const c of ["PR1", "PR050", "pr9820", "PR+PR132", "Code", "", "PR", "1234", "PR12a"]) {
    assert.equal(
      describeMissingCreatable({ code: c }).creatable,
      PR_CODE_RX.test(c.trim()),
      `creatable ต้องตรงกับ PR_CODE_RX สำหรับ "${c}"`,
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// 3. decideContainerWrite — ตู้ไหนถูก
// ══════════════════════════════════════════════════════════════════
{
  // 3a. SOT ยืนยันตรงกับไฟล์ → เขียนได้
  assert.equal(
    decideContainerWrite({ fileContainer: "GZS260723-1", shouldBe: "GZS260723-1", multiContainer: false }),
    "write",
  );
  // 3b. SOT บอกตู้อื่น → ห้ามทับ (เคส prod 1784432869 อยู่ 3 ตู้)
  assert.equal(
    decideContainerWrite({ fileContainer: "GZS260723-1", shouldBe: "GZS260720-1", multiContainer: true }),
    "skip_conflict",
    "ของอยู่ตู้อื่น → ห้ามทับ",
  );
  // 3c. หลายตู้ แต่ SOT ชี้ไม่ได้ → ไม่เดา
  assert.equal(
    decideContainerWrite({ fileContainer: "GZS260723-1", shouldBe: null, multiContainer: true }),
    "skip_ambiguous",
  );
  // 3d. ไม่มีข้อมูล SOT เลย (ตู้เดียว/ยังไม่มีแพคกิ้ง) → พฤติกรรมเดิม = เขียน
  assert.equal(
    decideContainerWrite({ fileContainer: "GZS260723-1", shouldBe: null, multiContainer: false }),
    "write",
    "ไม่มีข้อมูลค้าน = ไม่เปลี่ยนพฤติกรรมเดิม",
  );
  // 3e. ไฟล์ไม่มีเลขตู้ (Format B)
  assert.equal(decideContainerWrite({ fileContainer: null, shouldBe: "GZS260723-1", multiContainer: false }), "none");
  assert.equal(decideContainerWrite({ fileContainer: "   ", shouldBe: null, multiContainer: false }), "none");
  // 3f. เว้นวรรคหัว-ท้ายไม่ทำให้กลายเป็น conflict
  assert.equal(
    decideContainerWrite({ fileContainer: " GZS260723-1 ", shouldBe: "GZS260723-1", multiContainer: true }),
    "write",
  );

  // ข้อความไทย
  const noteConflict = containerWriteNote("skip_conflict", {
    fileContainer: "GZS260723-1", shouldBe: "GZS260720-1", packingCabinets: ["GZS260720-1", "GZS260723-1"],
  });
  assert.match(String(noteConflict), /GZS260720-1/);
  assert.match(String(noteConflict), /ไม่ทับเลขตู้/);
  assert.equal(containerWriteNote("write", { fileContainer: "A", shouldBe: "A", packingCabinets: ["A"] }), null);
  assert.match(
    String(containerWriteNote("skip_ambiguous", { fileContainer: "A", shouldBe: null, packingCabinets: ["A", "B"] })),
    /แยกส่ง 2 ตู้/,
  );
}

// ══════════════════════════════════════════════════════════════════
// 4. describeApplyPlan — ปุ่ม / เหตุผลที่ไม่มีปุ่ม
// ══════════════════════════════════════════════════════════════════
const basePlan = {
  format: "momo" as const,
  total: 10, willUpdate: 0, willAdvance: 0, toCreateCount: 0,
  alreadyOk: 0, billedDiffer: 0, multiRow: 0, notParcel: 0, missing: 0, missingCreatable: 0,
};

// 4a. มีงาน → ป้ายปุ่มบอกทุกอย่างที่จะเกิด
{
  const p = describeApplyPlan({ ...basePlan, willUpdate: 3, willAdvance: 5, toCreateCount: 2, alreadyOk: 5 });
  assert.equal(p.kind, "ready");
  assert.equal(p.kind === "ready" && p.label, "ยืนยัน + อัปเดต (แก้ 3 · สร้าง 2 · เลื่อนสถานะ 5)");
}
{
  const p = describeApplyPlan({ ...basePlan, willAdvance: 4, alreadyOk: 10 });
  assert.equal(p.kind, "ready", "เลื่อนสถานะอย่างเดียวก็ยังมีงาน");
  assert.equal(p.kind === "ready" && p.label, "ยืนยัน + อัปเดต (เลื่อนสถานะ 4)");
}

// 4b. ทุกแถวตรงแล้ว → ห้ามหายเงียบ ต้องบอก
{
  const p = describeApplyPlan({ ...basePlan, alreadyOk: 10 });
  assert.equal(p.kind, "nothing");
  assert.match(p.kind === "nothing" ? p.title : "", /ทุกแถวตรงกับระบบแล้ว/);
}
// 4b2. ตรงแล้ว + เคยบันทึก → บอกว่าบันทึกไปแล้ว + ใส่เวลาใน details
{
  const p = describeApplyPlan({ ...basePlan, alreadyOk: 10, appliedBeforeText: "23/07/69 14.05 น." });
  assert.equal(p.kind, "nothing");
  assert.match(p.kind === "nothing" ? p.title : "", /บันทึกไปแล้ว/);
  assert.ok(p.details.some((d) => d.includes("23/07/69 14.05 น.")), "details ต้องมีเวลาที่บันทึก");
}

// 4c. ต่างหมดแต่วางบิล/หลายแถว → อธิบายว่าแก้อัตโนมัติไม่ได้
{
  const p = describeApplyPlan({ ...basePlan, total: 6, alreadyOk: 2, billedDiffer: 3, multiRow: 1 });
  assert.equal(p.kind, "nothing");
  assert.match(p.kind === "nothing" ? p.title : "", /แก้อัตโนมัติไม่ได้/);
  assert.ok(p.details.some((d) => d.includes("🔒 วางบิลแล้ว 3")));
  assert.ok(p.details.some((d) => d.includes("🟣 หลายแถว 1")));
}

// 4d. ไม่พบ + สร้างได้ แต่ยังไม่ติ๊ก → ชี้ทางว่าติ๊กก่อน
{
  const p = describeApplyPlan({ ...basePlan, total: 4, alreadyOk: 2, missing: 2, missingCreatable: 2 });
  assert.equal(p.kind, "nothing");
  assert.match(p.kind === "nothing" ? p.title : "", /ติ๊ก/);
  assert.match(p.kind === "nothing" ? p.title : "", /2 รายการ/);
}

// 4e. ไม่พบ + สร้างไม่ได้เลย → บอกตัวขัดขวางจริง (ไม่ใช่แค่ "ไม่มีอะไรทำ")
{
  const p = describeApplyPlan({ ...basePlan, total: 4, alreadyOk: 2, missing: 2, missingCreatable: 0 });
  assert.equal(p.kind, "nothing");
  assert.match(p.kind === "nothing" ? p.title : "", /ยังสร้างไม่ได้/);
  assert.ok(p.details.some((d) => d.includes("สร้างไม่ได้ 2")));
}

// 4f. notParcel นับรวมเป็น "ตรงแล้ว" ได้ (หัวตาราง 1 แถว + ตรง 9 แถว = ครบ 10)
{
  const p = describeApplyPlan({ ...basePlan, total: 10, alreadyOk: 9, notParcel: 1 });
  assert.equal(p.kind, "nothing");
  assert.match(p.kind === "nothing" ? p.title : "", /ทุกแถวตรงกับระบบแล้ว/);
  assert.ok(p.details.some((d) => d.includes("ไม่ใช่พัสดุ 1")));
}

// 4g. ไฟล์ว่าง / อี้อู
{
  assert.match(
    (() => { const p = describeApplyPlan({ ...basePlan, total: 0 }); return p.kind === "nothing" ? p.title : ""; })(),
    /ไม่มีรายการพัสดุ/,
  );
  const y = describeApplyPlan({ ...basePlan, format: "yiwu", willUpdate: 5 });
  assert.equal(y.kind, "nothing", "อี้อู = พรีวิวเท่านั้น แม้มีงาน");
  assert.match(y.kind === "nothing" ? y.title : "", /อี้อู/);
}

// 4h. ติ๊กสร้างครบแล้ว → ไม่เตือนซ้ำใน details
{
  const p = describeApplyPlan({ ...basePlan, total: 3, alreadyOk: 1, missing: 2, missingCreatable: 2, toCreateCount: 2 });
  assert.equal(p.kind, "ready");
  assert.ok(!p.details.some((d) => d.includes("ติ๊ก")), "ติ๊กครบแล้วไม่ต้องเตือนให้ติ๊ก");
}

// ══════════════════════════════════════════════════════════════════
// 5. markSupersededUploads
// ══════════════════════════════════════════════════════════════════
{
  // prod: GZS260718-1 อัพ 3 รอบ (37 · 20 · 16) → 37 คือตัวจริง
  const s = markSupersededUploads([
    { id: 37, containerNo: "GZS260718-1", uploadedAt: "2026-07-20T10:00:00Z" },
    { id: 20, containerNo: "GZS260718-1", uploadedAt: "2026-07-18T10:00:00Z" },
    { id: 16, containerNo: "GZS260718-1", uploadedAt: "2026-07-17T10:00:00Z" },
    { id: 9,  containerNo: "GZE260716-1", uploadedAt: "2026-07-16T10:00:00Z" },
  ]);
  assert.deepEqual([...s].sort((a, b) => a - b), [16, 20], "เก่ากว่า 2 ไฟล์ = แทนที่แล้ว");
  assert.ok(!s.has(37), "ไฟล์ล่าสุดไม่ใช่ตัวที่ถูกแทนที่");
  assert.ok(!s.has(9), "ตู้ที่มีไฟล์เดียว ไม่ถูกตี superseded");
}
{
  // เวลาเท่ากันเป๊ะ (อัพ 2 ครั้งในนาทีเดียว — prod GZE260723-1) → id ใหญ่ชนะ
  const s = markSupersededUploads([
    { id: 24, containerNo: "GZE260723-1", uploadedAt: "2026-07-23T09:00:00Z" },
    { id: 25, containerNo: "GZE260723-1", uploadedAt: "2026-07-23T09:00:00Z" },
  ]);
  assert.deepEqual([...s], [24], "เวลาเท่ากัน → id ใหญ่กว่าเป็นตัวจริง");
}
{
  // ลำดับ input สลับ (ไม่พึ่ง order ที่ส่งมา) + container ว่างไม่พัง
  const s = markSupersededUploads([
    { id: 1, containerNo: "A", uploadedAt: "2026-07-01T00:00:00Z" },
    { id: 2, containerNo: "A", uploadedAt: "2026-07-05T00:00:00Z" },
    { id: 3, containerNo: null, uploadedAt: "2026-07-09T00:00:00Z" },
    { id: 4, containerNo: "  ", uploadedAt: "2026-07-09T00:00:00Z" },
  ]);
  assert.deepEqual([...s], [1]);
  assert.equal(markSupersededUploads([]).size, 0);
}

// describePriorUploads
{
  assert.equal(describePriorUploads({ count: 1, latestText: "x", appliedCount: 0 }), null, "ไฟล์เดียว = ไม่เตือน");
  const m = describePriorUploads({ count: 3, latestText: "20/07/69 10.00 น.", appliedCount: 1 });
  assert.match(String(m), /3 ครั้ง/);
  assert.match(String(m), /20\/07\/69 10\.00 น\./);
  assert.match(String(m), /เคยกดบันทึก/);
  assert.match(String(m), /ไฟล์ล่าสุดเป็นตัวจริง/);
  assert.ok(!String(describePriorUploads({ count: 2, latestText: null, appliedCount: 0 })).includes("เคยกดบันทึก"));
}

// ══════════════════════════════════════════════════════════════════
// 6. overlayPackingLines
// ══════════════════════════════════════════════════════════════════
{
  const L = (cabinet: string, weightKg: number): PackingContainerLine =>
    ({ cabinet, boxes: 1, weightKg, cbm: 0.01, subCount: 1, cg: null });

  const db = new Map<string, PackingContainerLine[]>([
    ["1784432869", [L("GZS260720-1", 10), L("GZS260721-1", 20), L("GZS260723-1", 99)]],
    ["OTHERBASE",  [L("GZS260723-1", 5)]],
  ]);

  // ไฟล์ที่กำลังพรีวิว = GZS260723-1 (ยอดของ base 1784432869 คือ 30, ไม่ใช่ 99 ที่ค้างใน DB)
  const merged = overlayPackingLines(db, "GZS260723-1", [
    { baseTracking: "1784432869", boxes: 2, weight: 30, cbm: 0.05, subCount: 2, cg: "39" },
    { baseTracking: "NEWBASE",    boxes: 1, weight: 7,  cbm: 0.02, subCount: 1 },
  ]);

  const a = merged.get("1784432869") ?? [];
  assert.equal(a.length, 3, "ตู้อื่น 2 บรรทัดคงอยู่ + ไฟล์นี้ 1 บรรทัด");
  const mine = a.filter((l) => l.cabinet === "GZS260723-1");
  assert.equal(mine.length, 1, "บรรทัดตู้เดียวกันต้องถูกทับ ไม่ใช่ซ้อน");
  assert.equal(mine[0].weightKg, 30, "ค่าจากไฟล์ที่กำลังพรีวิวชนะ");
  assert.equal(mine[0].subCount, 2);
  assert.equal(mine[0].cg, "39");
  assert.deepEqual(a.filter((l) => l.cabinet !== "GZS260723-1").map((l) => l.weightKg), [10, 20], "ตู้อื่นไม่ถูกแตะ");

  assert.equal(merged.get("NEWBASE")?.length, 1, "base ใหม่ในไฟล์ถูกเพิ่ม");
  assert.equal(merged.get("OTHERBASE"), undefined, "base ที่มีแต่บรรทัดตู้นี้ แต่ไฟล์ใหม่ไม่มี → ถูกตัดออก (ไฟล์ล่าสุดเป็นตัวจริง)");

  // db map เดิมต้องไม่ถูกแก้ (pure)
  assert.equal(db.get("1784432869")?.length, 3);
  assert.equal(db.get("OTHERBASE")?.length, 1);

  // ไม่มีเลขตู้ → คืนของเดิมทั้งหมด (ไม่ตัด ไม่เพิ่ม)
  const noCab = overlayPackingLines(db, null, [{ baseTracking: "X", boxes: 1, weight: 1, cbm: 1, subCount: 1 }]);
  assert.equal(noCab.get("1784432869")?.length, 3);
  assert.equal(noCab.get("X"), undefined);
  // ค่าว่าง/null ในไฟล์ → 0 (ไม่ NaN)
  const zeros = overlayPackingLines(new Map(), "C1", [{ baseTracking: "B", boxes: null, weight: null, cbm: null, subCount: 0 }]);
  assert.deepEqual(zeros.get("B"), [{ cabinet: "C1", boxes: 0, weightKg: 0, cbm: 0, subCount: 0, cg: null }]);
}

console.log("packing-upload-plan.test.ts: all assertions passed");
