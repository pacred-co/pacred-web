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
  containerRate,
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
  { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646, famount: 1, famountcount: "1" },
  { fcostship1defaultmomo: 2500 },
);
eq(r52028.column, "fcostship1defaultmomo", "52028 column");
eq(r52028.rate, 2500, "52028 rate");
eq(r52028.basis, "cbm", "52028 basis = cbm");
eq(r52028.dimension, 0.04646, "52028 dimension = fvolume");
eq(r52028.cost, 116.15, "52028 cost = round2(0.04646 × 2500)");

// ── empty rate cell → cost 0 (NEVER guess) ──
const rEmpty = resolveRowCost(
  { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646, famount: 1, famountcount: "1" },
  { fcostship1defaultmomo: 0 },
);
eq(rEmpty.cost, 0, "rate 0 → cost 0");
eq(rEmpty.rate, 0, "rate 0 read");

// ── settings missing the column → cost 0 ──
const rNoSetting = resolveRowCost(
  { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646, famount: 1, famountcount: "1" },
  {},
);
eq(rNoSetting.cost, 0, "missing settings → cost 0");

// ── weight-basis carrier (MX) uses fweight, not fvolume ──
const rMx = resolveRowCost(
  { fwarehousename: "4", fwarehousechina: "1", ftransporttype: "2", fproductstype: "3", fweight: 44.5, fvolume: 0.67653, famount: 1, famountcount: "1" },
  { fcostship3defaultmkcargo: 50 },
);
eq(rMx.basis, "weight", "MX basis = weight");
eq(rMx.dimension, 44.5, "MX dimension = fweight");
eq(rMx.cost, 2225, "MX cost = round2(44.5 × 50)");

// ── invalid warehouse → cost 0, column null ──
const rBad = resolveRowCost(
  { fwarehousename: "", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646, famount: 1, famountcount: "1" },
  { fcostship1defaultmomo: 2500 },
);
eq(rBad.cost, 0, "invalid wh → cost 0");
eq(rBad.column, null, "invalid wh → column null");

// ── zero/negative dimension → cost 0 ──
eq(
  resolveRowCost(
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 0, fvolume: 0, famount: 1, famountcount: "1" },
    { fcostship1defaultmomo: 2500 },
  ).cost,
  0,
  "zero dimension → cost 0",
);

// ── resolveOrderCost — multi-tracking aggregate ──
const order = resolveOrderCost(
  [
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 7.5, fvolume: 0.04646, famount: 1, famountcount: "1" },
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 44.5, fvolume: 0.67653, famount: 1, famountcount: "1" },
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

// ═══════════════════════════════════════════════════════════════════════════
// THE WATERFALL — tier 1 (accounting's per-container rate) BEATS tier 2
// (the tb_settings global default). Owner 2026-07-17: "บัญชีก็ตั้งต้นทุนตู้ตอน
// ตรวจตู้เป็น 4700 แล้ว ระบบก็ไม่เห็นดึงมาใช้เลยครับ".
// ═══════════════════════════════════════════════════════════════════════════

// ── source is reported on the settings path (back-compat: 2-arg call) ──
eq(r52028.source, "settings", "2-arg call → source=settings (back-compat)");
eq(rEmpty.source, "none", "rate 0 → source=none");
eq(rBad.source, "none", "invalid wh → source=none");

// ── containerRate — pick the cell for the row's product type ──
const CC = { fproductstype1: 4700, fproductstype2: 4800, fproductstype3: 4900, fproductstype4: 5000 };
eq(containerRate(CC, "1"), 4700, "container rate type 1");
eq(containerRate(CC, "3"), 4900, "container rate type 3");
eq(containerRate(CC, null), 4700, "container rate null type → type 1 cell");
eq(containerRate(null, "1"), 0, "no container row → 0 (fall through)");
eq(containerRate({ fproductstype1: 0 }, "1"), 0, "unset cell → 0 (fall through)");
eq(containerRate({ fproductstype1: "4700.00" }, "1"), 4700, "numeric string cell (pg numeric) → 4700");
eq(containerRate({ fproductstype1: "abc" }, "1"), 0, "garbage cell → 0 (never guess)");
eq(containerRate({ fproductstype1: -5 }, "1"), 0, "negative cell → 0 (never guess)");

// ── 🔴 THE OWNER'S ROW · prod 52184 · tracking 500255762943 · GZE260701-1 ──
// MOMO(8) · ROAD(1) · กวางโจว · ทั่วไป · cbm 0.0536. Accounting set the container
// to 4,700 at ตรวจตู้; the global MOMO road default is 2,500 (mig 0194).
// Booked prod fcosttotalprice = 251.92 — the resolver MUST reproduce it exactly.
const ownerRow = { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "1", fproductstype: "1", fweight: 72, fvolume: 0.0536, famount: 1, famountcount: "1" } as const;
const rOwner = resolveRowCost(ownerRow, { fcostcar1defaultmomo: 2500 }, { fproductstype1: 4700 });
eq(rOwner.rate, 4700, "52184 rate = 4700 (container beats the 2500 default)");
eq(rOwner.source, "container", "52184 source = container");
eq(rOwner.basis, "cbm", "52184 basis = cbm (MOMO)");
eq(rOwner.cost, 251.92, "52184 cost = round2(0.0536 × 4700) = the booked 251.92");
// the pre-fix behaviour, pinned as the REGRESSION: settings-only → the wrong ฿134
eq(resolveRowCost(ownerRow, { fcostcar1defaultmomo: 2500 }).cost, 134, "52184 settings-only = the ฿134 the panel wrongly showed");

// ── ROAD ≠ SEA (owner: "เรท รถ และ เรือ ไม่เท่ากันนะครับ") ──
// Same container rate applies to both modes; the tb_settings FALLBACK is what
// must differ per mode. Prod accounting: ROAD 4,700 · SEA 2,500.
const settingsBothModes = { fcostcar1defaultmomo: 2500, fcostship1defaultmomo: 2500 };
eq(
  resolveRowCost({ ...ownerRow, ftransporttype: "1" }, settingsBothModes).column,
  "fcostcar1defaultmomo",
  "ROAD → fcostcar column",
);
eq(
  resolveRowCost({ ...ownerRow, ftransporttype: "2" }, settingsBothModes).column,
  "fcostship1defaultmomo",
  "SEA → fcostship column",
);
// mig 0194 set BOTH to 2500 → road and sea resolve identically = the flattening
// the owner flagged. Pinned so a per-mode correction is a visible test change.
eq(
  resolveRowCost({ ...ownerRow, ftransporttype: "1" }, settingsBothModes).rate,
  resolveRowCost({ ...ownerRow, ftransporttype: "2" }, settingsBothModes).rate,
  "mig 0194 flattening: road default == sea default (2500) — the regression",
);
// with per-mode defaults restored, road and sea diverge as accounting intends
const perMode = { fcostcar1defaultmomo: 4700, fcostship1defaultmomo: 2500 };
eq(resolveRowCost({ ...ownerRow, ftransporttype: "1" }, perMode).rate, 4700, "per-mode: ROAD → 4700");
eq(resolveRowCost({ ...ownerRow, ftransporttype: "2" }, perMode).rate, 2500, "per-mode: SEA → 2500");

// ── container rate wins even when the global cell is UNSET (0) ──
// A rated container must cost out even where "never guess" leaves tier 2 empty.
const rNoDefault = resolveRowCost(ownerRow, {}, { fproductstype1: 4700 });
eq(rNoDefault.rate, 4700, "container rate works with an empty settings matrix");
eq(rNoDefault.cost, 251.92, "container-only cost still exact");
eq(rNoDefault.source, "container", "container-only source");

// ── an EMPTY/garbage container row falls through to the default (no guessing) ──
eq(resolveRowCost(ownerRow, { fcostcar1defaultmomo: 2500 }, {}).source, "settings", "empty container row → settings");
eq(resolveRowCost(ownerRow, { fcostcar1defaultmomo: 2500 }, { fproductstype1: 0 }).rate, 2500, "unset container cell → settings 2500");
eq(resolveRowCost(ownerRow, {}, {}).cost, 0, "no tier produces a rate → cost 0 (never guess)");

// ── product-type routing: the container cell must follow fproductstype ──
eq(resolveRowCost({ ...ownerRow, fproductstype: "3" }, {}, CC).rate, 4900, "type 3 → container cell 3");

// ── weight-basis carrier + container rate (the ฿-explosion shape) ──
// Sang(1)/MX(4) cost by WEIGHT. A per-CBM container rate (4,700) × kg is exactly
// the GZE260627-1 ฿328M fire — the resolver computes it faithfully; the WRITE
// path's sanity backstop is what refuses it. Pinned so the basis stays visible.
const rSangWeight = resolveRowCost(
  { fwarehousename: "1", fwarehousechina: "1", ftransporttype: "1", fproductstype: "1", fweight: 2792.66, fvolume: 0.4, famount: 1, famountcount: "1" },
  {},
  { fproductstype1: 4700 },
);
eq(rSangWeight.basis, "weight", "Sang basis = weight even with a container rate");
eq(rSangWeight.dimension, 2792.66, "Sang dimension = fweight");
eq(rSangWeight.cost, 13125502, "Sang: 2792.66kg × 4700/CBM = ฿13.1M — the basis-mismatch shape");

// ── resolveOrderCost threads the container rate to every row ──
const orderCC = resolveOrderCost(
  [
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "1", fproductstype: "1", fweight: 72, fvolume: 0.0536, famount: 1, famountcount: "1" },
    { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "1", fproductstype: "1", fweight: 10, fvolume: 0.1, famount: 1, famountcount: "1" },
  ],
  { fcostcar1defaultmomo: 2500 },
  { fproductstype1: 4700 },
);
eq(orderCC.perRow.every((r) => r.source === "container"), true, "aggregate: every row uses the container rate");
eq(orderCC.total, 251.92 + 470, "aggregate total at the container rate");


// ── per-box convention (famountcount≠'1' · owner 2026-07-19 TTW กำไรเกินจริง) ──
// PR172 52179: fvolume 0.18067 PER BOX × 19 boxes → total 3.43273 CBM. Cost must
// use the TOTAL (อี้อู sea 2600 → ฿8,925.10), NOT the per-box 0.18067 (฿469.74).
const rPerBox = resolveRowCost(
  { fwarehousename: "9", fwarehousechina: "2", ftransporttype: "2", fproductstype: "1", fweight: 171, fvolume: 0.18067, famount: 19, famountcount: null },
  { fcostship1defaultmomo2: 2600 },
);
eq(rPerBox.column, "fcostship1defaultmomo2", "TTW per-box column → momo2 (อี้อู)");
eq(rPerBox.dimension, 3.43273, "per-box dimension = fvolume × famount");
eq(rPerBox.cost, 8925.1, "per-box cost = round2(3.43273 × 2600)");
// famountcount='1' with famount>1 → fvolume already total, NO multiply
const rTotal = resolveRowCost(
  { fwarehousename: "8", fwarehousechina: "1", ftransporttype: "2", fproductstype: "1", fweight: 100, fvolume: 1.494, famount: 10, famountcount: "1" },
  { fcostship1defaultmomo: 2500 },
);
eq(rTotal.dimension, 1.494, "total-convention: dimension = fvolume as-is");
eq(rTotal.cost, 3735, "total-convention cost = 1.494 × 2500");

console.log(`\nresolve-cost.test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
