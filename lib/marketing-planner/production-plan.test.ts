import assert from "node:assert/strict";
import { distributeMonth, spreadWithPins, splitAcrossPillars, targetsTotal, type PlanOverrides } from "./production-plan";
import type { ProductionTargets } from "./types";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ✓ ${name}`);
}
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

console.log("lib/marketing-planner/production-plan");

// ── spreadWithPins ──────────────────────────────────────────────────────────
t("spreadWithPins: ไม่มี pin = เกลี่ยเท่า · Σ = total", () => {
  const r = spreadWithPins(10, 5, [0, 1, 2, 3, 4], new Map());
  assert.equal(sum(r), 10);
});

t("spreadWithPins: pin 1 วัน → ที่เหลือไปวันอื่น · Σ = total (ปอน example ยาว10 พุธ2→พฤ8)", () => {
  const r = spreadWithPins(10, 31, [2, 3], new Map([[2, 2]])); // target idx 2,3 · pin idx2=2
  assert.equal(r[2], 2);
  assert.equal(r[3], 8);
  assert.equal(sum(r), 10);
});

t("spreadWithPins: pin เกิน total → clamp (pin คงไว้ · ที่เหลือ 0)", () => {
  const r = spreadWithPins(10, 31, [2, 3], new Map([[2, 15]]));
  assert.equal(r[2], 15);
  assert.equal(r[3], 0);
});

t("spreadWithPins: วันที่ไม่ใช่ target = 0", () => {
  const r = spreadWithPins(10, 5, [2, 3], new Map());
  assert.equal(r[0], 0);
  assert.equal(r[1], 0);
  assert.equal(r[4], 0);
});

// ── splitAcrossPillars ──────────────────────────────────────────────────────
t("splitAcrossPillars: ผลรวม = dayLongTotal เป๊ะ", () => {
  const r = splitAcrossPillars(7, Object.entries({ a: 10, b: 20 }));
  assert.equal(sum(r.map((x) => x.count)), 7);
});

t("splitAcrossPillars: 0 → []", () => {
  assert.deepEqual(splitAcrossPillars(0, Object.entries({ a: 10 })), []);
});

t("splitAcrossPillars: สัดส่วน (6 บน 10:20 → a2 b4)", () => {
  const by = Object.fromEntries(splitAcrossPillars(6, Object.entries({ a: 10, b: 20 })).map((x) => [x.pillarId, x.count]));
  assert.equal(by.a, 2);
  assert.equal(by.b, 4);
});

// ── distributeMonth ─────────────────────────────────────────────────────────
const T: ProductionTargets = { longByPillar: { a: 10, b: 0 }, shortTotal: 280, articlePerDay: 1, postPerDay: 3 };
const longOf = (slots: ReturnType<typeof distributeMonth>, day: number) =>
  slots.find((s) => s.day === day)!.longs.reduce((a, l) => a + l.count, 0);

t("distributeMonth: ไม่มี override → ยอดรวมเดือน = targetsTotal (no-regress)", () => {
  const slots = distributeMonth(2026, 6, T, null, null); // ก.ค. 2026 = 31 วัน
  const tot = targetsTotal(T, 31);
  assert.equal(sum(slots.map((s) => s.longs.reduce((a, l) => a + l.count, 0))), tot.long);
  assert.equal(sum(slots.map((s) => s.short)), tot.short);
  assert.equal(sum(slots.map((s) => s.article)), tot.article);
  assert.equal(sum(slots.map((s) => s.post)), tot.post);
});

t("distributeMonth: manual 2 วัน · pin ยาววันแรก=2 → วันสอง=8 · วันอื่น=0", () => {
  const sel = new Set([9, 10]);
  const ov: PlanOverrides = new Map([[9, { long: 2 }]]);
  const slots = distributeMonth(2026, 6, T, sel, ov);
  assert.equal(longOf(slots, 9), 2);
  assert.equal(longOf(slots, 10), 8);
  assert.equal(longOf(slots, 1), 0);
});

t("distributeMonth: บท/โพ = pool (perDay × วันที่เลือก) · pin แล้วเกลี่ย", () => {
  const sel = new Set([9, 10]); // pool บท = 1 × 2 = 2
  const ov: PlanOverrides = new Map([[9, { article: 2 }]]);
  const slots = distributeMonth(2026, 6, T, sel, ov);
  const artOf = (day: number) => slots.find((s) => s.day === day)!.article;
  assert.equal(artOf(9), 2);
  assert.equal(artOf(10), 0);
});

t("distributeMonth: เลือกวันเดียว ไม่ pin → ทั้ง pool ลงวันนั้น", () => {
  const slots = distributeMonth(2026, 6, T, new Set([15]), null);
  assert.equal(longOf(slots, 15), 10); // ยาว pool ทั้งหมด
  assert.equal(slots.find((s) => s.day === 15)!.short, 280);
  assert.equal(longOf(slots, 1), 0);
});

console.log(`\n${pass} passed`);
