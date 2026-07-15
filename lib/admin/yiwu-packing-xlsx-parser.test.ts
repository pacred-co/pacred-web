/**
 * Tests parseYiwuPackingXlsx + the packing-format dispatcher against the REAL committed
 * fixture yiwu-packing-data.xlsx (the อี้อู packing list GZS260625-5T · sheet 收货 · slimmed
 * to the data sheet only). Also asserts the dispatcher still routes a MOMO file to the MOMO parser.
 * Run: npx tsx lib/admin/yiwu-packing-xlsx-parser.test.ts
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { parseYiwuPackingXlsx, isYiwuPackingWorkbook } from "./yiwu-packing-xlsx-parser";
import { detectPackingFormat, parsePackingXlsx } from "./packing-xlsx-dispatch";

const FIX = path.join(__dirname, "__fixtures__");
let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}
const near = (a: number | null | undefined, b: number, eps = 1e-4) =>
  a != null && Math.abs(a - b) < eps;

console.log("yiwu-packing-xlsx-parser");

const yiwuBuf = fs.readFileSync(path.join(FIX, "yiwu-packing-data.xlsx"));
const Y = parseYiwuPackingXlsx(yiwuBuf);

ok("reads container from R0/C2", () => {
  assert.strictEqual(Y.container, "GZS260625-5T");
});

ok("transport hint = SEA (GZS container)", () => {
  assert.strictEqual(Y.transportHint, "SEA");
});

ok("totals come from the GRAND-TOTAL footer row (not leaked as data)", () => {
  assert.ok(near(Y.totals.qty, 601, 0.5), `qty=${Y.totals.qty}`);
  assert.ok(near(Y.totals.totalWeight, 15075.8994, 1e-3), `wt=${Y.totals.totalWeight}`);
  assert.ok(near(Y.totals.totalCbm, 75.876962, 1e-5), `cbm=${Y.totals.totalCbm}`);
  assert.ok((Y.totals.trackingCount ?? 0) > 40, `trackingCount=${Y.totals.trackingCount}`);
});

ok("no footer / DISPIMG / blank row leaked into rows[]", () => {
  assert.ok(Y.rows.length > 40, `expected many data rows, got ${Y.rows.length}`);
  assert.ok(Y.rows.every((r) => r.tracking && r.tracking.trim() !== ""), "empty tracking leaked");
  assert.ok(!Y.rows.some((r) => /DISPIMG|GRAND|合计|总计/i.test(r.tracking)), "footer/img leaked as a row");
});

ok("X9002591 splits into 2 box-rows (different dims) and aggregates correctly", () => {
  const a = Y.aggregated.find((x) => x.baseTracking === "X9002591");
  assert.ok(a, "X9002591 not aggregated");
  assert.strictEqual(a!.subTrackings.length, 2, "expected 2 box-rows");
  assert.strictEqual(a!.parcelCount, 7, `boxes 4+3=7, got ${a!.parcelCount}`);
  assert.ok(near(a!.totalWeight, 525, 1e-6), `wt 300+225=525, got ${a!.totalWeight}`); // 💰 SELL basis
  assert.ok(near(a!.totalCbm, 2.670444, 1e-6), `cbm 1.751904+0.91854, got ${a!.totalCbm}`); // 💰
  assert.strictEqual(a!.code, "MG/WSIM/SEA"); // mark (唛头)
  assert.strictEqual(a!.product, "กางเกงขาสั้น"); // Thai preferred (英文)
});

ok("row-level split rows keep their OWN dims (so pricing per box is correct)", () => {
  const subs = Y.rows.filter((r) => r.tracking === "X9002591");
  assert.strictEqual(subs.length, 2);
  // dims differ between the two boxes → this is WHY we must split (owner ภูม)
  assert.deepStrictEqual(
    subs.map((s) => [s.length, s.width, s.height]).sort(),
    [[70, 54, 81], [79, 56, 99]].sort(),
  );
  assert.ok(near(subs.find((s) => s.length === 79)!.totalWeight, 300));
  assert.ok(near(subs.find((s) => s.length === 70)!.totalWeight, 225));
});

ok("K-series order (no 编号/管道/会员) still parses its money data", () => {
  const k = Y.aggregated.find((x) => x.baseTracking === "K0025865");
  assert.ok(k, "K0025865 not found");
  assert.ok(k!.subTrackings.length >= 5, `subs=${k!.subTrackings.length}`);
  // every K0025865 row has 件数=1 → box count === sub-row count
  assert.strictEqual(k!.parcelCount, k!.subTrackings.length);
  assert.ok((k!.totalWeight ?? 0) > 1000, `wt=${k!.totalWeight}`);
});

ok("Σ aggregated weight ≈ footer grand total (parse integrity)", () => {
  const sumWt = Y.aggregated.reduce((s, a) => s + (a.totalWeight ?? 0), 0);
  assert.ok(near(sumWt, 15075.8994, 0.5), `Σ=${sumWt} vs footer 15075.8994`);
  const sumBoxes = Y.aggregated.reduce((s, a) => s + (a.parcelCount ?? 0), 0);
  assert.ok(near(sumBoxes, 601, 0.5), `Σboxes=${sumBoxes} vs footer 601`);
});

ok("baseTracking is the RAW 单号 (no -N suffix to strip)", () => {
  assert.ok(Y.aggregated.every((a) => !/-\d+(\/\d+)?$/.test(a.baseTracking)));
});

// ── dispatcher ──────────────────────────────────────────────────────────────
ok("dispatcher detects the Yiwu file as 'yiwu'", () => {
  assert.strictEqual(isYiwuPackingWorkbook(yiwuBuf), true);
  assert.strictEqual(detectPackingFormat(yiwuBuf), "yiwu");
  assert.strictEqual(parsePackingXlsx(yiwuBuf).container, "GZS260625-5T");
});

ok("dispatcher routes a MOMO file to the MOMO parser (not falsely 'yiwu')", () => {
  const momoBuf = fs.readFileSync(path.join(FIX, "momo-packing-data.xlsx"));
  assert.strictEqual(isYiwuPackingWorkbook(momoBuf), false);
  assert.strictEqual(detectPackingFormat(momoBuf), "momo");
  assert.strictEqual(parsePackingXlsx(momoBuf).container, "GZS260617-1"); // MOMO fixture container
});

console.log(`\n✅ yiwu-packing-xlsx-parser: ${passed} passed`);
