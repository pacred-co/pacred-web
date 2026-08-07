/**
 * yiwu-cabinet-name.test.ts — ล็อกแพทเทิร์นชื่อตู้อี้อู (owner 2026-08-07)
 * เคสทั้งหมด = ชื่อจริงจาก prod ตอน rekey (ห้ามกุ).
 */
import {
  YIWU_CABINET_RX,
  isYiwuCabinetName,
  buildYiwuCabinetName,
  normalizeLegacyYiwuName,
} from "./yiwu-cabinet-name";

let pass = 0;
let fail = 0;
function eq<T>(got: T, want: T, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label} — got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  }
}
function throws(fn: () => unknown, label: string) {
  try {
    fn();
    fail++;
    console.error(`  ✗ ${label} — ไม่โยน`);
  } catch {
    pass++;
    console.log(`  ✓ ${label}`);
  }
}

// ── แพทเทิร์นใหม่ ──
eq(isYiwuCabinetName("YWS260717-1"), true, "YWS260717-1 = ชื่อใหม่ถูกต้อง");
eq(isYiwuCabinetName("YWE260801-2"), true, "YWE (รถ EK) ผ่าน");
eq(isYiwuCabinetName("yws260717-1"), true, "lower-case ก็ผ่าน (normalize ก่อนเช็ค)");
eq(isYiwuCabinetName("YWS260717-1T"), false, "T-suffix ยุคเก่า = ไม่ใช่แพทเทิร์นใหม่");
eq(isYiwuCabinetName("GZS260712-1"), false, "ตู้กวางโจว MOMO ไม่ใช่ตู้อี้อู");
eq(isYiwuCabinetName("YWYY13164"), false, "verbatim เก่าไม่ผ่าน");
eq(isYiwuCabinetName(""), false, "ว่าง = ไม่ผ่าน");
eq(isYiwuCabinetName(null), false, "null = ไม่ผ่าน");

// ── builder ──
eq(buildYiwuCabinetName("S", "260717", 1), "YWS260717-1", "ประกอบชื่อเรือ");
eq(buildYiwuCabinetName("E", "260801", 3), "YWE260801-3", "ประกอบชื่อรถ ตู้ที่ 3 ของวัน");
throws(() => buildYiwuCabinetName("S", "2607", 1), "วันที่ไม่ครบ 6 หลัก = โยน");
throws(() => buildYiwuCabinetName("S", "260717", 0), "seq 0 = โยน");
throws(() => buildYiwuCabinetName("S", "260717", 1.5), "seq ไม่ใช่จำนวนเต็ม = โยน");

// ── normalize ชื่อยุคเก่า (ชื่อจริงจาก prod ทั้งหมด) ──
eq(normalizeLegacyYiwuName("YWS260717-1"), "YWS260717-1", "ชื่อใหม่อยู่แล้ว = คืนตัวเอง");
eq(normalizeLegacyYiwuName("GZS260614-1T"), "YWS260614-1", "ยุค GZ…T แรกสุด");
eq(normalizeLegacyYiwuName("GZS260625-5T"), "YWS260625-1", "GZS260625-5T (ตู้ SEA0625 ใน staging)");
eq(normalizeLegacyYiwuName("GZS260707-6T"), "YWS260707-1", "GZS260707-6T (เคยทำเรทหลุด)");
eq(normalizeLegacyYiwuName("YWS260722-10T"), "YWS260722-1", "เลขสะสม 2 หลัก (10T) → -1");
eq(normalizeLegacyYiwuName("YWS260724-2T"), "YWS260724-1", "YWS…T ยุคหลัง");
eq(normalizeLegacyYiwuName("yws260723-1t"), "YWS260723-1", "lower-case normalize");
eq(normalizeLegacyYiwuName("SEA0625-8211YW"), null, "verbatim packing-id = null (ไม่มีปีในชื่อ ห้ามเดา)");
eq(normalizeLegacyYiwuName("YWYY13164"), null, "verbatim YWYY = null");
eq(normalizeLegacyYiwuName("0717-7072 YW SEA"), null, "หัวใบปิดตู้ = null");
eq(normalizeLegacyYiwuName("GZS260712-1"), null, "ตู้ MOMO กวางโจว (ไม่มี T) ห้ามแปลง");
eq(normalizeLegacyYiwuName(null), null, "null = null");

// regex ต้อง match สิ่งที่ builder ผลิตเสมอ (กัน drift)
eq(YIWU_CABINET_RX.test(buildYiwuCabinetName("A", "261231", 9)), true, "builder ↔ regex สอดคล้อง");

console.log(`\n${fail === 0 ? "✅" : "❌"} yiwu-cabinet-name: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
