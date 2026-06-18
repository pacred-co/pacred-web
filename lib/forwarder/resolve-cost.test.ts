/**
 * resolve-cost.test.ts — locks the forwarder COST math against the report-cnt
 * engine (the byte-for-byte source) + the real DEV order 52028.
 *
 * Run: tsx lib/forwarder/resolve-cost.test.ts
 */

import {
  costColumn,
  costBasisMode,
  productTypeIdx,
  resolveRowCost,
  resolveOrderCost,
} from "./resolve-cost";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}\n   expected ${e}\n   actual   ${a}`);
  }
}

// ── costColumn — mirrors report-cnt-detail.ts warehouseSegment() exactly ──
eq(costColumn("8", 1, "2", "1"), "fcostship1defaultmomo", "MOMO·เรือ·ทั่วไป·กวางโจว");
eq(costColumn("8", 1, "2", "2"), "fcostship1defaultmomo2", "MOMO·เรือ·ทั่วไป·อี้อู (city suffix)");
eq(costColumn("8", 1, "1", "1"), "fcostcar1defaultmomo", "MOMO·รถ·ทั่วไป·กวางโจว");
eq(costColumn("2", 1, "1", "1"), "fcostcar1default", "CTT·รถ·ทั่วไป (bare default)");
eq(costColumn("2", 3, "2", "2"), "fcostship3default2", "CTT·เรือ·อย.·อี้อู");
eq(costColumn("1", 2, "1", "1"), "fcostcar2defaultsang", "แสง·รถ·มอก.");
eq(costColumn("3", 4, "2", "1"), "fcostship4defaultmkcargo", "MK·เรือ·พิเศษ");
eq(costColumn("4", 1, "2", "1"), "fcostship1defaultmkcargo", "MX→mkcargo (legacy alias)");
eq(costColumn("5", 1, "1", "1"), "fcostcar1defaultjmf", "JMF");
eq(costColumn("6", 1, "1", "1"), "fcostcar1defaultgogo", "GOGO");
eq(costColumn("7", 1, "1", "1"), "fcostcar1defaultcargocenter", "Cargo Center");

// ── costBasisMode — Sang(1) + MX(4) weight; rest cbm (report-cnt L335) ──
eq(costBasisMode("1"), "weight", "แสง bills by weight");
eq(costBasisMode("4"), "weight", "MX bills by weight");
eq(costBasisMode("8"), "cbm", "MOMO bills by cbm");
eq(costBasisMode("2"), "cbm", "CTT bills by cbm");

// ── productTypeIdx — default 1 for empty/invalid ──
eq(productTypeIdx("1"), 1, "type 1");
eq(productTypeIdx("4"), 4, "type 4");
eq(productTypeIdx(""), 1, "empty → 1");
eq(productTypeIdx(null), 1, "null → 1");
eq(productTypeIdx("9"), 1, "invalid → 1");

// ── resolveRowCost — the real DEV order 52028 (MOMO·เรือ·กวางโจว·ทั่วไป) ──
// rate fcostship1defaultmomo = 2500 (ภูม set 2026-06-18) · cbm 0.04646
const r52028 = resolveRowCost(
  { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646 },
  { fcostship1defaultmomo: 2500 },
);
eq(r52028.column, "fcostship1defaultmomo", "52028 column");
eq(r52028.rate, 2500, "52028 rate");
eq(r52028.basis, "cbm", "52028 basis = cbm");
eq(r52028.dimension, 0.04646, "52028 dimension = fvolume");
eq(r52028.cost, 116.15, "52028 cost = round2(0.04646 × 2500)");

// ── empty rate cell → cost 0 (NEVER guess) ──
const rEmpty = resolveRowCost(
  { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646 },
  { fcostship1defaultmomo: 0 },
);
eq(rEmpty.cost, 0, "rate 0 → cost 0");
eq(rEmpty.rate, 0, "rate 0 read");

// ── settings missing the column → cost 0 ──
const rNoSetting = resolveRowCost(
  { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646 },
  {},
);
eq(rNoSetting.cost, 0, "missing settings → cost 0");

// ── weight-basis carrier (MX) uses fweight, not fvolume ──
const rMx = resolveRowCost(
  { fwarehousename: "4", fwarehousechina: "1", ftransporttype: "2", fproductstype: "3", fweight: 44.5, fvolume: 0.67653 },
  { fcostship3defaultmkcargo: 50 },
);
eq(rMx.basis, "weight", "MX basis = weight");
eq(rMx.dimension, 44.5, "MX dimension = fweight");
eq(rMx.cost, 2225, "MX cost = round2(44.5 × 50)");

// ── invalid warehouse → cost 0, column null ──
const rBad = resolveRowCost(
  { fwarehousename: "", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646 },
  { fcostship1defaultmomo: 2500 },
);
eq(rBad.cost, 0, "invalid wh → cost 0");
eq(rBad.column, null, "invalid wh → column null");

// ── zero/negative dimension → cost 0 ──
eq(
  resolveRowCost(
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 0, fvolume: 0 },
    { fcostship1defaultmomo: 2500 },
  ).cost,
  0,
  "zero dimension → cost 0",
);

// ── resolveOrderCost — multi-tracking aggregate ──
const order = resolveOrderCost(
  [
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646 },
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 44.5, fvolume: 0.67653 },
  ],
  { fcostship1defaultmomo: 2500 },
);
eq(order.perRow.length, 2, "aggregate perRow count");
// round-THEN-sum (NOT sum-then-round — they differ by ฿0.01 here): each row
// rounds independently like report-cnt stores each fcosttotalprice rounded.
//   row1 = round2(0.04646×2500) = 116.15
//   row2 = round2(0.67653×2500). NOTE: 0.67653×2500 = 1691.3249999… in IEEE-754
//     (NOT a clean 1691.325 half), so Math.round(v*rate*100)/100 = 1691.32.
//     resolver + report-cnt agree ONLY because both use the identical
//     Math.round(v*rate*100)/100 — neither may be "simplified" independently.
//   total = 116.15 + 1691.32 = 1807.47 (literal pin so a sum-then-round
//     regression → 1807.48 is caught).
eq(order.perRow[0].cost, 116.15, "aggregate row1 cost");
eq(order.perRow[1].cost, 1691.32, "aggregate row2 cost (IEEE-754: 1691.3249… → 1691.32)");
eq(order.total, 1807.47, "aggregate total = round-then-sum (NOT 1807.48)");

console.log(`\nresolve-cost.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
