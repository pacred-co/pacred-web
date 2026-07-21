import assert from "node:assert/strict";
import { buildRateHistoryRows, groupRateHistory, rateAsOf, type RateHistoryRow } from "./customer-rate-history";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ✓ ${name}`);
}

console.log("lib/admin/customer-rate-history");

const CELLS = [
  { t: "1", p: "1", rkg: 17, rcbm: 5700 },
  { t: "2", p: "1", rkg: 10, rcbm: 3700 },
];

// ── บันทึก 1 ครั้ง → แถวประวัติ ──────────────────────────────────────────────
t("1 ช่อง = 1 แถว · แนบแพ็กเกจ + เลขที่ใบ + ผู้ตั้ง ครบ", () => {
  const rows = buildRateHistoryRows({
    userid: "PR645", sourceWarehouse: "1", cells: CELLS,
    packageId: "transfer", packageLabel: "แพ็คเกจที่ 2: นำเข้า + ฝากโอน",
    quotationRef: "QT-PR645-20260721", setBy: "admin_pop",
    effectiveFrom: "2026-07-21T03:00:00.000Z",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].package_id, "transfer");
  assert.equal(rows[0].quotation_ref, "QT-PR645-20260721");
  assert.equal(rows[0].set_by, "admin_pop");
  assert.equal(rows[0].rcbm, 5700);
});

t("ทุกแถวของการกดครั้งเดียวกัน ต้องมีเวลา 'เดียวกันเป๊ะ' (ไม่งั้น timeline เหลื่อม)", () => {
  const rows = buildRateHistoryRows({
    userid: "PR645", sourceWarehouse: "1", cells: CELLS, effectiveFrom: "2026-07-21T03:00:00.000Z",
  });
  assert.equal(new Set(rows.map((r) => r.effective_from)).size, 1);
});

t("ไม่ผ่านใบเสนอราคา (ตั้งมือ/สคริปต์) → แพ็กเกจ+เลขที่ใบ เป็นค่าว่าง ไม่ใช่ error", () => {
  const rows = buildRateHistoryRows({ userid: "PR1", sourceWarehouse: "2", cells: CELLS, effectiveFrom: "2026-07-21T00:00:00.000Z" });
  assert.equal(rows[0].package_id, "");
  assert.equal(rows[0].quotation_ref, "");
});

t("ค่าเท่าเดิมก็ยังบันทึก — ใบที่ 'ยืนยันเรทเดิม' ก็เป็นข้อตกลงที่ต้องอ้างอิงได้", () => {
  const rows = buildRateHistoryRows({
    userid: "PR1", sourceWarehouse: "1", cells: CELLS,
    quotationRef: "QT-2", effectiveFrom: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(rows.length, 2); // ไม่ถูกกรองทิ้งเพราะ "ไม่เปลี่ยน"
});

// ── ยุบกลับเป็น "การบันทึก 1 ครั้ง" ──────────────────────────────────────────
const H = (over: Partial<RateHistoryRow>): RateHistoryRow => ({
  userid: "PR645", package_id: "", package_label: "", quotation_ref: "",
  sourcewarehouse: "1", rtransporttype: "1", rproductstype: "1",
  rcbm: 5700, rkg: 17, effective_from: "2026-07-01T00:00:00.000Z", set_by: "", ...over,
});

t("ยุบหลายช่องของการกดครั้งเดียว เป็น 1 รายการ · ใหม่อยู่บนสุด", () => {
  const g = groupRateHistory([
    H({ effective_from: "2026-07-01T00:00:00.000Z", quotation_ref: "QT-A", rtransporttype: "1" }),
    H({ effective_from: "2026-07-01T00:00:00.000Z", quotation_ref: "QT-A", rtransporttype: "2" }),
    H({ effective_from: "2026-08-01T00:00:00.000Z", quotation_ref: "QT-B", rtransporttype: "1" }),
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].quotationRef, "QT-B"); // ใหม่ก่อน
  assert.equal(g[1].cells.length, 2); // ครั้งเดียวกัน 2 ช่อง
});

t("บันทึกคนละใบ เวลาเดียวกัน ไม่ถูกยุบรวมกัน", () => {
  const g = groupRateHistory([
    H({ quotation_ref: "QT-A" }),
    H({ quotation_ref: "QT-B" }),
  ]);
  assert.equal(g.length, 2);
});

// ── หัวใจ: "งานที่เกิดวันนั้น ใช้เรทไหน" (สิ่งที่ owner กลัว) ─────────────────
const TIMELINE = [
  H({ effective_from: "2026-06-01T00:00:00.000Z", rcbm: 5000, quotation_ref: "QT-เก่า" }),
  H({ effective_from: "2026-07-21T00:00:00.000Z", rcbm: 5700, quotation_ref: "QT-ใหม่" }),
];
const CELL = { sourcewarehouse: "1", rtransporttype: "1", rproductstype: "1" };

t("งานเดือน มิ.ย. → ได้เรทเก่า 5,000 (ใบใหม่ไม่ย้อนไปเปลี่ยน)", () => {
  const r = rateAsOf(TIMELINE, "2026-06-15T00:00:00.000Z", CELL);
  assert.equal(r?.rcbm, 5000);
  assert.equal(r?.quotation_ref, "QT-เก่า");
});

t("งานหลังออกใบใหม่ → ได้เรทใหม่ 5,700", () => {
  assert.equal(rateAsOf(TIMELINE, "2026-08-01T00:00:00.000Z", CELL)?.rcbm, 5700);
});

t("ณ วินาทีที่เรทมีผลพอดี → นับเป็นเรทใหม่แล้ว (half-open range)", () => {
  assert.equal(rateAsOf(TIMELINE, "2026-07-21T00:00:00.000Z", CELL)?.rcbm, 5700);
});

t("ก่อนเคยตั้งเรทครั้งแรก → null (ผู้เรียก fallback เรททั่วไปเอง ไม่ใช่เดา 0)", () => {
  assert.equal(rateAsOf(TIMELINE, "2026-01-01T00:00:00.000Z", CELL), null);
});

t("ไม่หยิบเรทของช่องอื่นมาตอบ (คนละโกดัง/ทาง/ประเภท = คนละ timeline)", () => {
  assert.equal(rateAsOf(TIMELINE, "2026-08-01T00:00:00.000Z", { ...CELL, sourcewarehouse: "2" }), null);
  assert.equal(rateAsOf(TIMELINE, "2026-08-01T00:00:00.000Z", { ...CELL, rtransporttype: "2" }), null);
  assert.equal(rateAsOf(TIMELINE, "2026-08-01T00:00:00.000Z", { ...CELL, rproductstype: "3" }), null);
});

t("แถวมาไม่เรียง ก็ยังตอบถูก (ไม่พึ่งลำดับที่ DB คืนมา)", () => {
  const shuffled = [TIMELINE[1], TIMELINE[0]];
  assert.equal(rateAsOf(shuffled, "2026-06-15T00:00:00.000Z", CELL)?.rcbm, 5000);
});

console.log(`\n${pass} passed`);
