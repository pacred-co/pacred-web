/**
 * container-eta-estimate.test.ts — ล็อกสูตร ETD/ETA ประมาณการ (owner 2026-08-07)
 * ตัวเลข/ชื่อตู้ทั้งหมด = ของจริงจาก prod (ห้ามกุ).
 */
import {
  routeOfCabinet,
  etdFromCabinetName,
  addDaysIso,
  medianDays,
  transitDaysFor,
  estimateContainerEta,
  actualTransitDays,
  MEASURED_TRANSIT_DAYS,
  MIN_SAMPLES,
  MAX_PLAUSIBLE_DAYS,
} from "./container-eta-estimate";

let pass = 0, fail = 0;
function eq<T>(got: T, want: T, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label} — got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

// ── เส้นทาง ──
eq(routeOfCabinet("GZS260723-1"), "GZS", "กวางโจว เรือ");
eq(routeOfCabinet("GZE260806-1"), "GZE", "กวางโจว รถ");
eq(routeOfCabinet("YWS260803-1"), "YWS", "อี้อู เรือ");
eq(routeOfCabinet("YWE260810-2"), "YWE", "อี้อู รถ (เส้นทางที่ยังไม่เคยมีข้อมูล)");
eq(routeOfCabinet("YWS260722-10T"), null, "ชื่อยุคเก่า T-suffix ไม่เข้ารูป");
eq(routeOfCabinet("SEA0625-8211YW"), null, "เลข verbatim TTW ไม่เข้ารูป");
eq(routeOfCabinet(""), null, "ว่าง = null");
eq(routeOfCabinet(null), null, "null = null");

// ── ETD จากชื่อตู้ ──
eq(etdFromCabinetName("GZS260723-1"), "2026-07-23", "GZS260723-1 → 23 ก.ค. 2026");
eq(etdFromCabinetName("YWS260803-1"), "2026-08-03", "YWS260803-1 → 3 ส.ค. 2026");
eq(etdFromCabinetName("GZE260731-2"), "2026-07-31", "ตู้ที่ 2 ของวัน = วันเดียวกัน");
eq(etdFromCabinetName("GZS261231-1"), "2026-12-31", "สิ้นปี");
eq(etdFromCabinetName("GZS260230-1"), null, "30 ก.พ. ไม่มีจริง = null (ห้ามเดา)");
eq(etdFromCabinetName("GZS261301-1"), null, "เดือน 13 = null");
eq(etdFromCabinetName("MOCKAD006"), null, "ตู้ทดสอบ = null");

// ── บวกวันบนปฏิทิน (UTC ล้วน · กัน timezone เลื่อนวัน) ──
eq(addDaysIso("2026-07-23", 18), "2026-08-10", "ข้ามเดือน");
eq(addDaysIso("2026-12-25", 10), "2027-01-04", "ข้ามปี");
eq(addDaysIso("2026-08-03", -1), "2026-08-02", "ย้อนหลัง 1 วัน");
eq(addDaysIso("2026-02-28", 1), "2026-03-01", "ก.พ. ปีปกติ");

// ── มัธยฐาน ──
eq(medianDays([5, 3, 9, 4, 6]), 5, "5 ค่า → ตัวกลาง");
eq(medianDays([11, 18, 43, 12]), 12, "จำนวนคู่ → ตัวล่างของคู่กลาง (อนุรักษ์นิยม)");
eq(medianDays([]), null, "ไม่มีข้อมูล = null");
eq(medianDays([0, -3, 200]), null, "ค่าผิดปกติถูกตัดออกหมด = null");
eq(medianDays([5, 999, 7, 6]), 6, "ตัดค่าเกินเพดานออกก่อนคิด");

// ── จำนวนวันเดินทาง (ประวัติสด vs ค่าที่วัดไว้) ──
eq(transitDaysFor("GZS"), MEASURED_TRANSIT_DAYS.GZS, "ไม่มีประวัติ → ใช้ค่าที่วัดไว้ (18)");
eq(transitDaysFor("GZE"), 5, "รถกวางโจว = 5 วัน (วัดจาก 19 ตู้)");
eq(transitDaysFor("YWS"), 25, "เรืออี้อู = 25 วัน (วัดจาก 2 ตู้)");
eq(transitDaysFor("YWE"), null, "เส้นทางที่ไม่เคยวิ่ง = null (ไม่กุตัวเลข)");
eq(transitDaysFor(null), null, "ไม่รู้เส้นทาง = null");
eq(transitDaysFor("GZS", { GZS: [12, 14, 19, 11] }), 12, "ประวัติสด ≥3 ตู้ ชนะค่าที่วัดไว้");
eq(transitDaysFor("GZS", { GZS: [30, 31] }), 18, `ประวัติ < ${MIN_SAMPLES} ตู้ → ยังใช้ค่าที่วัดไว้`);
eq(transitDaysFor("YWE", { YWE: [8, 9, 10] }), 9, "เส้นทางใหม่: พอมีประวัติ 3 ตู้ก็ประมาณการได้");

// ── ประมาณการเต็ม (เคสจริง prod) ──
eq(estimateContainerEta("YWS260803-1").etd, "2026-08-03", "ETD = วันปิดตู้ในชื่อ");
eq(estimateContainerEta("YWS260803-1").eta, "2026-08-28", "ETA = 3 ส.ค. + 25 วัน");
eq(estimateContainerEta("GZE260806-1").eta, "2026-08-11", "รถ: 6 ส.ค. + 5 วัน");
eq(estimateContainerEta("GZS260723-1").eta, "2026-08-10", "เรือ: 23 ก.ค. + 18 วัน");
eq(estimateContainerEta("YWE260810-1").eta, null, "เส้นทางไม่มีข้อมูล = ETA null แต่ ETD ยังมี");
eq(estimateContainerEta("YWE260810-1").etd, "2026-08-10", "…ETD ยังคำนวณได้จากชื่อ");
eq(estimateContainerEta("SEA0625-8211YW").etd, null, "ชื่อ verbatim = ไม่มีทั้ง ETD/ETA");
eq(estimateContainerEta("GZS260723-1").estimated, true, "ติดธง 'ประมาณการ' เสมอ");
eq(estimateContainerEta("GZS260723-1").sampleSize, 0, "ไม่มีประวัติสด → sampleSize 0 (ใช้ค่าที่วัดไว้)");
eq(estimateContainerEta("GZS260723-1", { GZS: [12, 14, 19] }).sampleSize, 3, "มีประวัติสด → บอกจำนวนตู้ที่ใช้คิด");

// ── วันเดินทางจริง (ใช้สร้างประวัติ · −1 วันตามที่ owner อธิบาย) ──
eq(actualTransitDays("GZE260731-2", "2026-08-05"), 4, "ยิงรับ 5 ส.ค. → ถึงจริง 4 ส.ค. − ปิดตู้ 31 ก.ค. = 4 วัน");
eq(actualTransitDays("GZS260715-1", "2026-08-04"), 19, "prod GZS260715-1: ยิงรับ 4 ส.ค. → ถึงจริง 3 ส.ค. − ปิดตู้ 15 ก.ค. = 19 วัน");
eq(actualTransitDays("GZS260712-1", "2026-07-27"), 14, "prod GZS260712-1 = 14 วัน");
eq(actualTransitDays("GZE260718-1", "2026-07-22"), 3, "prod GZE260718-1 = รถเร็วสุดที่เจอ 3 วัน");
eq(actualTransitDays("GZS260723-1", null), null, "ยังไม่มีใครยิงรับ = null");
eq(actualTransitDays("GZS260723-1", "2026-07-23"), null, "ถึงก่อน/วันเดียวกับปิดตู้ = ค่าผิด → null");
eq(actualTransitDays("SEA0625-8211YW", "2026-07-20"), null, "ชื่อไม่เข้ารูป = null");
eq(actualTransitDays("GZS260101-1", `2026-12-31`), null, `เกิน ${MAX_PLAUSIBLE_DAYS} วัน = ข้อมูลผิด → null`);
eq(actualTransitDays("GZE260731-2", "2026-08-05T09:12:00.000Z"), 4, "รับ timestamp เต็มได้ (ตัดเอาแต่วันที่)");

console.log(`\n${fail === 0 ? "✅" : "❌"} container-eta-estimate: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
