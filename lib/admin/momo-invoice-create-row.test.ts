/**
 * ล็อกกฎ "บรรทัดบนใบวางบิล MOMO เพาะแถวใหม่ได้ไหม" — owner 2026-08-03:
 * *"เจอใน MOMO แต่ไม่เจอในระบบเราได้ไงครับ … แต่พอไปดูที่ MOMO ก็เจอ แต่ของเราไม่เจอ"*
 *
 * ทุกค่าที่ใช้เป็นค่า **จริง** จากเคสที่ยืนยันบน prod (ไม่กุตัวเลข):
 *   300251844018   — พัสดุของ owner · บนใบ INV-20260728-0002 บรรทัดเดียว "No Code"
 *                    ฿1,391.67 · MOMO มีจริง แต่ระบบเราไม่มีทั้ง staging/tb_forwarder/แพคกิ้ง
 *   1783582423-8   — บรรทัดที่ MOMO บิลเป็นกล่องย่อยของชุดแยก (qty 14 · INV-20260723-0006)
 *   SF1562783666170 — เคสตู้ไม่ตรงจริง (ใบว่า GZS260528-2 · ระบบว่า PCS20260528-SEA01)
 *   GZE260701-1 / GZS260620-2 / GZS260528-2 — เลขตู้จริงบนใบ MOMO
 *   PCS20260528-SEA01 / PR20260720-SEA01   — placeholder รอบขนส่งของระบบ (ไม่ใช่ตู้)
 *   CBX260719-EK10 — เลขกระสอบจริง
 *   PR095          — รหัสสมาชิกจริงที่ parser อ้างเป็นตัวอย่าง
 */

import assert from "node:assert/strict";
import { decideCreateFromInvoiceLine } from "./momo-invoice-create-row";

// ── เคสของ owner: No Code + ไม่มีในระบบ + ใบระบุตู้ → สร้างได้แบบ NO CODE ──────
const noCode = decideCreateFromInvoiceLine({
  tracking: "300251844018",
  cabinet: "GZE260701-1",
  memberCode: null,
  matched: false,
});
assert.equal(noCode.allowed, true, "เคส 300251844018 ต้องสร้างได้ ไม่ใช่ทางตัน");
assert.equal(noCode.allowed && noCode.mode, "special-no-code");
assert.equal(noCode.allowed && noCode.memberCode, null, "ห้ามเดา PR ให้บรรทัด No Code");
assert.equal(noCode.allowed && noCode.cabinet, "GZE260701-1");
assert.match(noCode.allowed ? noCode.reason : "", /NO CODE/);

// ── มี PR บนใบ → โหมดปกติ (normalize เป็น PR####) ────────────────────────────
const withPr = decideCreateFromInvoiceLine({
  tracking: "300251844018",
  cabinet: "GZS260620-2",
  memberCode: " pr095 ",
  matched: false,
});
assert.equal(withPr.allowed && withPr.mode, "normal");
assert.equal(withPr.allowed && withPr.memberCode, "PR095", "trim + uppercase");

// รหัสที่ระบุลูกค้าไม่ได้ ต้องตกเป็น NO CODE — ไม่ใช่ปฏิเสธ และไม่ใช่เดา
for (const junk of ["PR", "PCS10830", "9602", ""]) {
  const d = decideCreateFromInvoiceLine({
    tracking: "300251844018",
    cabinet: "GZE260701-1",
    memberCode: junk,
    matched: false,
  });
  assert.equal(d.allowed, true, `รหัส "${junk}" ต้องยังสร้างได้`);
  assert.equal(d.allowed && d.mode, "special-no-code", `รหัส "${junk}" ระบุลูกค้าไม่ได้ → NO CODE`);
}

// ── 🔴 BLOCKER 1: เลขมี suffix = ห้ามเพาะ (กันแถว aggregate ปลอมโดนเขียนทับรอบหน้า) ──
const suffixed = decideCreateFromInvoiceLine({
  tracking: "1783582423-8",
  cabinet: "GZE260701-1",
  memberCode: "PR095",
  matched: false,
});
assert.equal(suffixed.allowed, false, "บรรทัดกล่องย่อยของชุดแยก ห้ามเพาะจากใบ");
assert.match(suffixed.reason, /1783582423/, "เหตุผลต้องบอกเลขฐานที่ระบบจะเก็บ");
assert.equal(
  decideCreateFromInvoiceLine({
    tracking: "1782110296-1/6",
    cabinet: "GZE260701-1",
    memberCode: null,
    matched: false,
  }).allowed,
  false,
  "ทรง -N/M ก็ห้ามเหมือนกัน",
);

// ── จับคู่ได้แล้ว → ไม่ต้องสร้าง ────────────────────────────────────────────
const already = decideCreateFromInvoiceLine({
  tracking: "300251844018",
  cabinet: "GZE260701-1",
  memberCode: null,
  matched: true,
});
assert.equal(already.allowed, false);
assert.match(already.reason, /มีรายการนี้ในระบบแล้ว/);

// ── ใบไม่พิมพ์เลขตู้ (ทรงเก่า "(Guangzhou - TH)") → สร้างไม่ได้ + บอกเหตุผล ──
for (const cab of [null, "", "   "]) {
  const d = decideCreateFromInvoiceLine({
    tracking: "300251844018",
    cabinet: cab,
    memberCode: "PR095",
    matched: false,
  });
  assert.equal(d.allowed, false, "ไม่มีเลขตู้ = สร้างไม่ได้");
  assert.match(d.reason, /ไม่ได้พิมพ์เลขตู้/);
}

// ── เลขบนใบไม่ใช่ตู้ (กระสอบ / รอบขนส่ง) → ปฏิเสธตั้งแต่บนจอ ────────────────
for (const notCab of ["CBX260719-EK10", "PR20260720-SEA01", "PCS20260528-SEA01"]) {
  const d = decideCreateFromInvoiceLine({
    tracking: "300251844018",
    cabinet: notCab,
    memberCode: "PR095",
    matched: false,
  });
  assert.equal(d.allowed, false, `"${notCab}" ไม่ใช่เลขตู้`);
  assert.match(d.reason, /ไม่ใช่เลขตู้/);
}

// ── 🔴 BLOCKER 5: แพคกิ้งลิสค้านเลขตู้บนใบ → ห้ามปั๊มตู้จากใบ ────────────────
const packingDisagrees = decideCreateFromInvoiceLine({
  tracking: "SF1562783666170",
  cabinet: "GZS260528-2",
  memberCode: null,
  matched: false,
  packingShouldBe: "GZS260620-2",
});
assert.equal(packingDisagrees.allowed, false);
assert.match(packingDisagrees.reason, /แพคกิ้งลิสว่า/);
assert.match(packingDisagrees.reason, /GZS260620-2/);

// แพคกิ้งยืนยันตรงกับใบ → ผ่าน
assert.equal(
  decideCreateFromInvoiceLine({
    tracking: "SF1562783666170",
    cabinet: "GZS260528-2",
    memberCode: null,
    matched: false,
    packingShouldBe: "GZS260528-2",
  }).allowed,
  true,
  "แพคกิ้งยืนยันตรงกับใบ = ยืนยันซึ่งกันและกัน",
);

// แพคกิ้งยังตอบไม่ได้ → ไม่ถือว่าค้าน (ของ owner ไม่มีในแพคกิ้งเลย ต้องยังสร้างได้)
assert.equal(
  decideCreateFromInvoiceLine({
    tracking: "300251844018",
    cabinet: "GZE260701-1",
    memberCode: null,
    matched: false,
    packingShouldBe: null,
  }).allowed,
  true,
  "ไม่มีแพคกิ้งลิส ≠ แพคกิ้งค้าน",
);

console.log("✅ momo-invoice-create-row: กฎเพาะแถวจากใบวางบิล MOMO (fail-closed ครบทุกข้อ)");
