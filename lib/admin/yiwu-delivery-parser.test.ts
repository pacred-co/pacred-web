import assert from "node:assert/strict";
import { parseYiwuDeliveryOcr } from "./yiwu-delivery-parser";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; } catch (e) { console.error(`FAIL: ${name}`); throw e; }
}

// PR detection (with + without space)
t("detects PR code", () => {
  assert.equal(parseYiwuDeliveryOcr("Customer ID: PR022").memberCode, "PR022");
  assert.equal(parseYiwuDeliveryOcr("รหัส PR 10899 อี้อู").memberCode, "PR10899");
});

// 单号 candidate — alnum with letters + ≥4 digits, not a PR
t("detects order candidate, skips PR", () => {
  const r = parseYiwuDeliveryOcr("PR022\nX9002653 4 120.5 60 40 50 0.48");
  assert.equal(r.memberCode, "PR022");
  assert.equal(r.orderNo, "X9002653");
});

// data row: boxCount + weight/L/W/H/CBM
t("parses a data row with leading box count", () => {
  const r = parseYiwuDeliveryOcr("X9002653 4 120.5 60 40 50 0.48");
  assert.equal(r.rows.length, 1);
  const row = r.rows[0]!;
  assert.equal(row.boxCount, 4);
  assert.equal(row.weightKg, 120.5);
  assert.equal(row.lengthCm, 60);
  assert.equal(row.widthCm, 40);
  assert.equal(row.heightCm, 50);
  assert.equal(row.cbm, 0.48);
});

// data row without a leading box count → defaults boxCount 1
t("row without box count defaults to 1", () => {
  const r = parseYiwuDeliveryOcr("30 25 20 0.03 ของ");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]!.boxCount, 1);
  assert.equal(r.rows[0]!.weightKg, 30);
});

// header line ignored, multiple data rows
t("ignores header, keeps multiple rows", () => {
  const txt = "Pack Weight Length Width Height CBM\n2 15 30 20 10 0.02\n1 40 50 40 30 0.06";
  const r = parseYiwuDeliveryOcr(txt);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0]!.boxCount, 2);
  assert.equal(r.rows[1]!.weightKg, 40);
});

// empty / junk → safe empties, never throws
t("empty input is safe", () => {
  const r = parseYiwuDeliveryOcr("");
  assert.equal(r.memberCode, null);
  assert.equal(r.orderNo, null);
  assert.equal(r.rows.length, 0);
});
t("junk line with <4 numbers is not a row", () => {
  const r = parseYiwuDeliveryOcr("หมายเหตุ 12 ชิ้น");
  assert.equal(r.rows.length, 0);
});

console.log(`yiwu-delivery-parser: ${pass} assertions passed`);
