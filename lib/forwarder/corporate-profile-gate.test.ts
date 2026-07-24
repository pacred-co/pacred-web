/**
 * ล็อกกฎ "อะไรบล็อกเงิน อะไรแค่เตือนเรื่องเอกสาร".
 *
 * เคสที่ต้องไม่ถอยกลับ: PR022 (ชื่อ ✓ เลขภาษี ✓ ที่อยู่ ✗) ต้อง **ผ่าน** —
 * ถ้าวันหนึ่งมีคนเผลอเอาที่อยู่กลับไปเป็นเงื่อนไขบล็อก บัญชีจะยืนยันสลิปให้ลูกค้าที่จ่ายเงิน
 * มาแล้วไม่ได้อีกรอบ.
 *
 * Run: tsx lib/forwarder/corporate-profile-gate.test.ts
 */
import assert from "node:assert/strict";
import { classifyCorporateProfile } from "./corporate-profile-gate";

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("classifyCorporateProfile");

ok("🔴 เคสจริง PR022 — ที่อยู่ว่าง แต่ชื่อ+เลขภาษีครบ → ผ่าน + เตือน", () => {
  const v = classifyCorporateProfile({
    corporatename: "บริษัท เจ แนค (ประเทศไทย) จำกัด",
    corporatenumber: "0115561012346",
    corporateaddress: "",
  });
  assert.deepEqual(v.blockingMissing, [], "ที่อยู่ต้องไม่บล็อกเงิน — ยอดเท่ากันเป๊ะ");
  assert.ok(v.warning, "แต่ต้องเตือนให้ไปเติมที่อยู่");
});

ok("ครบทั้ง 3 → ผ่าน ไม่มีเตือน", () => {
  const v = classifyCorporateProfile({
    corporatename: "บริษัท ทดสอบ จำกัด",
    corporatenumber: "0105564077716",
    corporateaddress: "28/40 กรุงเทพฯ 10160",
  });
  assert.deepEqual(v.blockingMissing, []);
  assert.equal(v.warning, null);
});

ok("ไม่มีเลขภาษี → บล็อก (ออกใบเสร็จนามนิติ + หัก 1% ไม่ได้)", () => {
  const v = classifyCorporateProfile({
    corporatename: "บริษัท ทดสอบ จำกัด",
    corporatenumber: "",
    corporateaddress: "28/40 กรุงเทพฯ",
  });
  assert.deepEqual(v.blockingMissing, ["เลขประจำตัวผู้เสียภาษี"]);
});

ok("ไม่มีชื่อ → บล็อก", () => {
  const v = classifyCorporateProfile({
    corporatename: "   ",
    corporatenumber: "0105564077716",
    corporateaddress: "28/40",
  });
  assert.deepEqual(v.blockingMissing, ["ชื่อนิติบุคคล"]);
});

ok("ไม่มีทั้งคู่ → บล็อกและบอกครบทั้ง 2 ช่อง", () => {
  const v = classifyCorporateProfile({ corporatename: null, corporatenumber: null, corporateaddress: null });
  assert.deepEqual(v.blockingMissing, ["ชื่อนิติบุคคล", "เลขประจำตัวผู้เสียภาษี"]);
});

ok("ไม่มีแถว corporate เลย (flag นิติแต่ไม่มีข้อมูล · prod 71 ราย) → บล็อก", () => {
  const v = classifyCorporateProfile(null);
  assert.deepEqual(v.blockingMissing, ["ชื่อนิติบุคคล", "เลขประจำตัวผู้เสียภาษี"]);
});

ok("ยังบล็อกอยู่ → ไม่เตือนเรื่องที่อยู่ (บอกทีละเรื่อง ไม่งั้นไม่รู้ต้องแก้อะไรก่อน)", () => {
  const v = classifyCorporateProfile({ corporatename: "", corporatenumber: "", corporateaddress: "" });
  assert.ok(v.blockingMissing.length > 0);
  assert.equal(v.warning, null);
});

ok("ช่องว่างล้วน (spaces) นับเป็นว่าง", () => {
  const v = classifyCorporateProfile({ corporatename: "  ", corporatenumber: "  ", corporateaddress: "  " });
  assert.equal(v.blockingMissing.length, 2);
});

console.log(`\n✅ corporate-profile-gate: ${passed} assertions passed`);
