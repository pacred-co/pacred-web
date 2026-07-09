/**
 * Tests parseMomoPackingXlsx against the two REAL committed fixtures:
 *  - momo-packing-data.xlsx  (Format A · a closed GZS container with 3 tracking rows)
 *  - momo-packing-empty.xlsx (Format B · "คิวมั่ว" · only a GRAND TOTAL row)
 * Run: npx tsx lib/admin/momo-packing-xlsx-parser.test.ts
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  parseMomoPackingXlsx,
  aggregatePackingRowsByBase,
  type MomoPackingRow,
} from "./momo-packing-xlsx-parser";

const FIX = path.join(__dirname, "__fixtures__");
let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("momo-packing-xlsx-parser");

// ── Format A (has data) ─────────────────────────────────────────────────────
const dataBuf = fs.readFileSync(path.join(FIX, "momo-packing-data.xlsx"));
const A = parseMomoPackingXlsx(dataBuf);

ok("Format A: reads the container from meta", () => {
  assert.strictEqual(A.container, "GZS260617-1");
});

ok("Format A: title + totals from the meta header", () => {
  assert.ok((A.listTitle ?? "").includes("PACKING LIST"));
  assert.strictEqual(A.totals.trackingCount, 3);
  assert.strictEqual(A.totals.qty, 7);
  assert.strictEqual(A.totals.totalWeight, 510);
  assert.ok(Math.abs((A.totals.totalCbm ?? 0) - 1.569334) < 1e-6);
});

ok("Format A: transport hint = SEA (GZS container)", () => {
  assert.strictEqual(A.transportHint, "SEA");
});

ok("Format A: has ≥1 parcel row and NO GRAND TOTAL row leaked in", () => {
  assert.ok(A.rows.length >= 1, `expected ≥1 row, got ${A.rows.length}`);
  assert.ok(!A.rows.some((r) => /grand/i.test(r.tracking)), "GRAND TOTAL leaked as a row");
});

ok("Format A: the PR10190 row is parsed by header name (Code=G, Tracking=H)", () => {
  const row = A.rows.find((r) => r.tracking === "1781309805");
  assert.ok(row, "tracking 1781309805 not found");
  assert.strictEqual(row!.code, "PR10190");
  assert.ok(Math.abs((row!.totalCbm ?? 0) - 1.05) < 1e-9, `totalCbm=${row!.totalCbm}`);
  assert.strictEqual(row!.totalWeight, 335);
  assert.strictEqual(row!.parcelCount, 1);
  assert.ok((row!.productType ?? "").includes("ทั่วไป") || (row!.productType ?? "").includes("普通"));
  assert.strictEqual(row!.cg, "CG81337997530");
});

ok("Format A: raw grid exposes a data header for the Excel-view", () => {
  assert.ok(A.rawGrid, "rawGrid missing");
  const hdr = A.rawGrid!.header.map((h) => h.toLowerCase());
  assert.ok(hdr.includes("tracking") && hdr.includes("code"), "header missing Tracking/Code");
  assert.strictEqual(A.rawGrid!.rows.length, A.rows.length);
});

ok("Format A: aggregated is one row per BASE tracking (3 single-sub bases)", () => {
  assert.strictEqual(A.aggregated.length, 3, `expected 3 aggregated bases, got ${A.aggregated.length}`);
  // every real-fixture row is single-sub → its agg equals its own row totals.
  const a190 = A.aggregated.find((r) => r.baseTracking === "1781309805");
  assert.ok(a190, "aggregated base 1781309805 not found");
  assert.strictEqual(a190!.parcelCount, 1);
  assert.strictEqual(a190!.totalWeight, 335);
  assert.ok(Math.abs((a190!.totalCbm ?? 0) - 1.05) < 1e-9, `totalCbm=${a190!.totalCbm}`);
  assert.strictEqual(a190!.subTrackings.length, 1);
  assert.strictEqual(a190!.code, "PR10190");
});

// ── Synthetic multi-box base — the case the real fixture doesn't cover ────────
ok("aggregate: sums a multi-box base (2 sub-rows) exactly", () => {
  const mk = (tracking: string, base: string, parcel: number, wt: number, cbm: number): MomoPackingRow => ({
    tracking, baseTracking: base, code: "PR555", productType: "ทั่วไป",
    width: 10, length: 20, height: 30, parcelCount: parcel,
    weightKg: wt / parcel, cbm: cbm / parcel, totalWeight: wt, totalCbm: cbm, cg: "CG1",
  });
  const agg = aggregatePackingRowsByBase([
    mk("SF1567683726553-1/2", "SF1567683726553", 1, 10, 0.1),
    mk("SF1567683726553-2/2", "SF1567683726553", 1, 12, 0.12),
  ]);
  assert.strictEqual(agg.length, 1, `expected 1 base, got ${agg.length}`);
  assert.strictEqual(agg[0].baseTracking, "SF1567683726553");
  assert.strictEqual(agg[0].parcelCount, 2);
  assert.strictEqual(agg[0].totalWeight, 22);
  assert.ok(Math.abs((agg[0].totalCbm ?? 0) - 0.22) < 1e-9, `totalCbm=${agg[0].totalCbm}`);
  assert.strictEqual(agg[0].subTrackings.length, 2);
});

ok("aggregate: a field stays null only when EVERY sub is null", () => {
  const base: MomoPackingRow = {
    tracking: "X-1", baseTracking: "X", code: null, productType: null,
    width: null, length: null, height: null, parcelCount: null,
    weightKg: null, cbm: null, totalWeight: null, totalCbm: null, cg: null,
  };
  const agg = aggregatePackingRowsByBase([
    { ...base, tracking: "X-1", totalWeight: null },
    { ...base, tracking: "X-2", totalWeight: 5 },
  ]);
  assert.strictEqual(agg.length, 1);
  assert.strictEqual(agg[0].totalWeight, 5, "one non-null sub → Σ = that value");
  assert.strictEqual(agg[0].totalCbm, null, "all-null field stays null");
  assert.strictEqual(agg[0].parcelCount, null, "all-null parcelCount stays null");
});

// ── Format B (empty / คิวมั่ว) ───────────────────────────────────────────────
const emptyBuf = fs.readFileSync(path.join(FIX, "momo-packing-empty.xlsx"));
const B = parseMomoPackingXlsx(emptyBuf);

ok("Format B: no parcel rows", () => {
  assert.strictEqual(B.rows.length, 0);
});

ok("Format B: aggregated is empty too", () => {
  assert.strictEqual(B.aggregated.length, 0);
});

ok("Format B: warns about an empty export", () => {
  assert.ok(B.warnings.some((w) => w.includes("ว่าง") || w.includes("คิวมั่ว")), `warnings=${JSON.stringify(B.warnings)}`);
});

console.log(`\n✅ momo-packing-xlsx-parser — ${passed} assertions passed`);
