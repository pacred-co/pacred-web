import assert from "node:assert";
import {
  getMarginAdvisory,
  MARGIN_CAP_PER_CONTAINER_THB,
} from "./margin-advisory";

let pass = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
};

t("within cap → ok, no message, never blocks", () => {
  const a = getMarginAdvisory(10_000);
  assert.equal(a.level, "ok");
  assert.equal(a.message, null);
  assert.equal(a.overByThb, 0);
  assert.equal(a.blocks, false);
});

t("exactly at cap → ok (cap is inclusive, no nag)", () => {
  const a = getMarginAdvisory(MARGIN_CAP_PER_CONTAINER_THB);
  assert.equal(a.level, "ok");
  assert.equal(a.message, null);
});

t("over cap → over, with message, overBy correct, still never blocks", () => {
  const a = getMarginAdvisory(20_000);
  assert.equal(a.level, "over");
  assert.ok(a.message && a.message.includes("คำแนะนำ ไม่บังคับ"));
  assert.equal(a.overByThb, 5_000);
  assert.equal(a.blocks, false);
});

t("custom cap honored", () => {
  const a = getMarginAdvisory(9_000, { capThb: 8_000 });
  assert.equal(a.level, "over");
  assert.equal(a.overByThb, 1_000);
});

t("custom unit appears in message", () => {
  const a = getMarginAdvisory(30_000, { unit: "งาน" });
  assert.ok(a.message && a.message.includes("/งาน"));
});

t("non-finite / negative / zero → ok (nothing to advise)", () => {
  for (const v of [NaN, Infinity, -1, -50_000, 0]) {
    const a = getMarginAdvisory(v);
    assert.equal(a.level, "ok", `value ${v} should be ok`);
    assert.equal(a.blocks, false);
  }
});

console.log(`✓ margin-advisory: ${pass} tests passed`);
