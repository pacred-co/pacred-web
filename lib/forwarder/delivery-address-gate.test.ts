/**
 * delivery-address-gate — ล็อกกติกา "ต้องมีที่อยู่จัดส่งก่อนส่งไปรอชำระเงิน(5)"
 * (owner 2026-07-23 · MONEY).
 *
 * สิ่งที่เทสนี้กันไม่ให้ regress:
 *   1. **ห้ามบังคับ zip** — prod มี 15 แถว fstatus=6 ที่มีจังหวัดแต่ไม่มี zip และ
 *      ส่งสำเร็จจริง. ถ้าใครเผลอเพิ่ม zip เข้าไปในเงื่อนไข เทสข้อนี้จะแดง.
 *   2. **PCS รับเองที่โกดัง = ยกเว้น** (ไม่มีขาจัดส่ง).
 *   3. **COD / เหมาๆ / Express ไม่ยกเว้น** — ต่างจากด่านค่าส่งไทย. COD ยิ่งต้องมี
 *      ปลายทาง (ไม่งั้นไม่รู้จะไปเก็บเงินที่ไหน + เอกสารไม่มีผู้รับ).
 *   4. ข้อความ error ต้อง **บอกแทรคกิ้งที่ติด + บอกว่าไปแก้ที่ไหน**
 *      (§0f · [[wrong-error-message-hides-real-block]]).
 *
 * Run: tsx lib/forwarder/delivery-address-gate.test.ts
 */

import assert from "node:assert/strict";
import {
  isDeliveryAddressMissing,
  isSelfPickupRow,
  deliveryAddressRowLabel,
  evaluateDeliveryAddressGate,
  type AddressGateRow,
} from "./delivery-address-gate";

let passed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  passed++;
}

const row = (o: Partial<AddressGateRow> = {}): AddressGateRow => ({
  id: 1, ftrackingchn: "T1", fshipby: "2",
  faddressprovince: null, faddresszipcode: null, faddressno: null, faddressname: null,
  ...o,
});

// ── ขาดที่อยู่จริง = ไม่มีทั้งจังหวัดและบ้านเลขที่ ────────────────────────────
check("ว่างทั้งคู่ (null) → ขาด", isDeliveryAddressMissing(row()), true);
check("ว่างทั้งคู่ (empty string) → ขาด",
  isDeliveryAddressMissing(row({ faddressprovince: "", faddressno: "" })), true);
check("ว่างทั้งคู่ (มีแต่ช่องว่าง) → ขาด",
  isDeliveryAddressMissing(row({ faddressprovince: "   ", faddressno: "\t \n" })), true);
check("undefined ทั้งคู่ → ขาด",
  isDeliveryAddressMissing({ fshipby: "2" }), true);

// ── มีจังหวัดอย่างเดียว = ผ่าน (⚠️ ห้ามบังคับ zip — prod 15 แถวที่ 6 เป็นแบบนี้) ──
check("มีจังหวัด ไม่มี zip ไม่มีบ้านเลขที่ → ผ่าน (zip ไม่บังคับ)",
  isDeliveryAddressMissing(row({ faddressprovince: "เชียงใหม่" })), false);
check("มีจังหวัด + zip ว่าง (string ว่าง) → ผ่าน",
  isDeliveryAddressMissing(row({ faddressprovince: "กรุงเทพมหานคร", faddresszipcode: "" })), false);

// ── มีบ้านเลขที่อย่างเดียว = ผ่าน ────────────────────────────────────────────
check("มีบ้านเลขที่ ไม่มีจังหวัด → ผ่าน",
  isDeliveryAddressMissing(row({ faddressno: "99/1 ซอยลาดพร้าว 5" })), false);

// ── มีครบ = ผ่าน ────────────────────────────────────────────────────────────
check("มีครบ → ผ่าน",
  isDeliveryAddressMissing(row({ faddressprovince: "ชลบุรี", faddressno: "1/2", faddresszipcode: "20000" })), false);

// ── PCS รับเองที่โกดัง = ยกเว้น แม้ไม่มีที่อยู่เลย ────────────────────────────
check("PCS ไม่มีที่อยู่เลย → ยกเว้น", isDeliveryAddressMissing(row({ fshipby: "PCS" })), false);
check("pcs ตัวเล็ก → ยกเว้น (case-insensitive)", isDeliveryAddressMissing(row({ fshipby: "pcs" })), false);
check("' PCS ' มีช่องว่าง → ยกเว้น", isDeliveryAddressMissing(row({ fshipby: " PCS " })), false);
check("isSelfPickupRow('PCS') = true", isSelfPickupRow(row({ fshipby: "PCS" })), true);
check("isSelfPickupRow('PCSF') = false (เหมาๆ ไม่ใช่รับเอง)", isSelfPickupRow(row({ fshipby: "PCSF" })), false);

// ── ไม่ยกเว้น: เหมาๆ / Express / COD / ขนส่งว่าง ─────────────────────────────
// (สามตัวแรกได้รับยกเว้นจากด่าน "ค่าส่งไทยห้ามลืม" แต่ยังเป็นการจัดส่งจริง)
check("เหมาๆ PCSF ไม่มีที่อยู่ → ขาด (ไม่ยกเว้น)", isDeliveryAddressMissing(row({ fshipby: "PCSF" })), true);
check("เหมาๆ PRF ไม่มีที่อยู่ → ขาด", isDeliveryAddressMissing(row({ fshipby: "PRF" })), true);
check("Express PCSE ไม่มีที่อยู่ → ขาด", isDeliveryAddressMissing(row({ fshipby: "PCSE" })), true);
check("Express PRE ไม่มีที่อยู่ → ขาด", isDeliveryAddressMissing(row({ fshipby: "PRE" })), true);
check("ขนส่งยังไม่เลือก (ว่าง) ไม่มีที่อยู่ → ขาด", isDeliveryAddressMissing(row({ fshipby: "" })), true);
check("ขนส่งยังไม่เลือก (null) ไม่มีที่อยู่ → ขาด", isDeliveryAddressMissing(row({ fshipby: null })), true);

// ── ชื่อผู้รับไม่นับเป็นที่อยู่ (prod มี placeholder "รับที่โกดัง Pacred") ─────
check("มีแต่ชื่อผู้รับ → ยังขาด",
  isDeliveryAddressMissing(row({ faddressname: "รับที่โกดัง Pacred" })), true);

// ── ป้ายชื่อแถว: แทรคกิ้ง → fidorco → #id → "-" ──────────────────────────────
check("label ใช้แทรคกิ้งก่อน",
  deliveryAddressRowLabel({ ftrackingchn: "1783582289-1/2", fidorco: "F123", id: 9 }), "1783582289-1/2");
check("label fallback ไป fidorco",
  deliveryAddressRowLabel({ ftrackingchn: "  ", fidorco: "F123", id: 9 }), "F123");
check("label fallback ไป #id",
  deliveryAddressRowLabel({ ftrackingchn: null, fidorco: null, id: 52562 }), "#52562");
check("label ไม่มีอะไรเลย → '-'", deliveryAddressRowLabel({}), "-");

// ── evaluateDeliveryAddressGate ─────────────────────────────────────────────
check("ลิสต์ว่าง → ok", evaluateDeliveryAddressGate([]).ok, true);
check("ลิสต์ว่าง → message ว่าง", evaluateDeliveryAddressGate([]).message, "");
check("ทุกแถวมีที่อยู่ → ok",
  evaluateDeliveryAddressGate([row({ faddressprovince: "ตาก" }), row({ fshipby: "PCS" })]).ok, true);

const mixed = evaluateDeliveryAddressGate([
  row({ id: 52554, ftrackingchn: "1783582289-1/2" }),        // ขาด
  row({ id: 52562, ftrackingchn: "1783582289-2/2" }),        // ขาด
  row({ id: 3, ftrackingchn: "OK-1", faddressprovince: "ภูเก็ต" }), // ผ่าน
  row({ id: 4, ftrackingchn: "OK-2", fshipby: "PCS" }),      // ยกเว้น
]);
check("ปนกัน → ไม่ ok", mixed.ok, false);
check("ปนกัน → blocked 2 แถว", mixed.blocked.length, 2);
check("ปนกัน → นับถูกในข้อความ", mixed.message.startsWith("2 รายการ"), true);
check("ข้อความบอกแทรคกิ้งที่ติด", mixed.message.includes("1783582289-1/2, 1783582289-2/2"), true);
check("ข้อความไม่พูดถึงแถวที่ผ่าน", mixed.message.includes("OK-1"), false);
check("ข้อความบอกทางแก้ (หน้ารายการนำเข้า)", mixed.message.includes("/admin/forwarders/"), true);
check("ข้อความบอกผลกระทบเรื่องเงิน", mixed.message.includes("ค่าส่งไทย"), true);

// เกิน 5 แถว → ลิสต์ 5 + สรุปที่เหลือ
const many = evaluateDeliveryAddressGate(
  Array.from({ length: 8 }, (_, i) => row({ id: i + 1, ftrackingchn: `TK${i + 1}` })),
);
check("8 แถวขาด → blocked 8", many.blocked.length, 8);
check("8 แถว → โชว์ 5 ตัวแรก", many.message.includes("TK1, TK2, TK3, TK4, TK5"), true);
check("8 แถว → ไม่โชว์ตัวที่ 6", many.message.includes("TK6"), false);
check("8 แถว → สรุปที่เหลือ", many.message.includes("และอีก 3 รายการ"), true);

console.log(`✓ delivery-address-gate: ${passed} assertions passed`);
