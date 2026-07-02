/**
 * Unit tests — MOMO Live parcel metrics (the money math).
 *
 * Focus (money-critical · owner/พี่ป๊อป 2026-07-01):
 *   1. TOTAL = per-piece × quantity (the scrape is per-piece; MOMO's web + tb_forwarder
 *      hold the TOTAL — undercharging ~×qty is the exact bug this guards).
 *   2. base-tracking aggregation (Σ across "-i/n" split siblings = tb_forwarder's row).
 *   3. FILL-WHEN-EMPTY decision + mismatch flag (never overwrite a non-zero value).
 *
 * Fixtures are VERIFIED against the live MOMO master account 2026-07-01 (tracking
 * 1782113771 + 1782544029) so the math is anchored to real data, not an assumption.
 *
 * Run: tsx lib/integrations/momo-web/live-parcel-metrics.test.ts
 */

import assert from "node:assert/strict";
import {
  parcelTotals,
  baseTrackingOf,
  aggregateLiveMetricsByBase,
  decideMetricFill,
} from "./live-parcel-metrics";
import type { MomoLiveParcel } from "./types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Minimal parcel factory — only the fields the metrics read. */
function parcel(p: Partial<MomoLiveParcel>): MomoLiveParcel {
  return {
    tracking: "",
    memberCode: "",
    weightKg: 0,
    cbm: 0,
    width: 0,
    length: 0,
    height: 0,
    quantity: 1,
    containerName: "",
    containerCode: "",
    containerNo: "",
    statusId: 0,
    statusText: "",
    shipBy: "",
    type: "",
    imageUrl: null,
    qrCode: "",
    statusDate: {},
    ...p,
  };
}

console.log("MOMO Live parcel metrics — TOTAL = per-piece × quantity");

check("parcelTotals multiplies per-piece by quantity (the VERIFIED 1782113771 base)", () => {
  // raw kg=20 · qty=10 → MOMO web shows 200 kg (VERIFIED live 2026-07-01).
  const t = parcelTotals(parcel({ weightKg: 20, cbm: 0.0233, quantity: 10 }));
  assert.equal(t.weightKg, 200, "20 × 10 = 200 (not the per-piece 20)");
  assert.ok(Math.abs(t.cbm - 0.233) < 1e-9, "0.0233 × 10 = 0.233");
  assert.equal(t.quantity, 10);
});

check("parcelTotals — the two VERIFIED siblings (-3 ×2, -4 ×7)", () => {
  assert.equal(parcelTotals(parcel({ weightKg: 38, quantity: 2 })).weightKg, 76, "38 × 2 = 76");
  assert.equal(parcelTotals(parcel({ weightKg: 196, quantity: 7 })).weightKg, 1372, "196 × 7 = 1372");
});

check("quantity floors at 1 (a parcel is at least one piece)", () => {
  assert.equal(parcelTotals(parcel({ weightKg: 15, quantity: 0 })).quantity, 1);
  assert.equal(parcelTotals(parcel({ weightKg: 15, quantity: 0 })).weightKg, 15, "×1 when qty missing");
  assert.equal(parcelTotals(parcel({ weightKg: 15, quantity: NaN as unknown as number })).quantity, 1);
});

check("negative / non-finite per-piece values → 0 (never a bogus total)", () => {
  assert.equal(parcelTotals(parcel({ weightKg: -5, quantity: 3 })).weightKg, 0);
  assert.equal(parcelTotals(parcel({ weightKg: Infinity, quantity: 3 })).weightKg, 0);
});

console.log("MOMO Live parcel metrics — base-tracking parse");

check("baseTrackingOf strips numeric split suffix only", () => {
  assert.equal(baseTrackingOf("1782544029"), "1782544029");
  assert.equal(baseTrackingOf("1782544029-2"), "1782544029");
  assert.equal(baseTrackingOf("1782113771-1/7"), "1782113771");
  assert.equal(baseTrackingOf("CBX260620-SEA07"), "CBX260620-SEA07", "non-numeric suffix stays");
});

console.log("MOMO Live parcel metrics — aggregate by base");

check("aggregate sums the split-sibling TOTALS by base (VERIFIED 1782544029 = 305.5kg / 9pcs)", () => {
  // From the live master account 2026-07-01 — tb_forwarder holds famount=9 for this base.
  const parcels = [
    parcel({ tracking: "1782544029", weightKg: 9, cbm: 0.0267, quantity: 1 }),
    parcel({ tracking: "1782544029-2", weightKg: 50, cbm: 0.2, quantity: 5 }),
    parcel({ tracking: "1782544029-3", weightKg: 18, cbm: 0.05016, quantity: 1 }),
    parcel({ tracking: "1782544029-4", weightKg: 11, cbm: 0.034496, quantity: 1 }),
    parcel({ tracking: "1782544029-5", weightKg: 17.5, cbm: 0.03496, quantity: 1 }),
  ];
  const map = aggregateLiveMetricsByBase(parcels);
  assert.equal(map.size, 1, "all siblings roll into one base");
  const agg = map.get("1782544029")!;
  assert.equal(agg.quantity, 9, "Σ qty 1+5+1+1+1 = 9 (matches tb_forwarder famount)");
  assert.equal(agg.weightKg, 305.5, "Σ (9 + 250 + 18 + 11 + 17.5) = 305.5");
  assert.equal(agg.parcelCount, 5);
  assert.ok(agg.cbm > 0);
});

check("aggregate keeps two different base trackings separate", () => {
  const map = aggregateLiveMetricsByBase([
    parcel({ tracking: "AAA-1", weightKg: 10, quantity: 2 }),
    parcel({ tracking: "BBB", weightKg: 5, quantity: 3 }),
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get("AAA")!.weightKg, 20);
  assert.equal(map.get("BBB")!.weightKg, 15);
});

check("aggregate skips blank trackings", () => {
  const map = aggregateLiveMetricsByBase([parcel({ tracking: "  ", weightKg: 10, quantity: 2 })]);
  assert.equal(map.size, 0);
});

console.log("MOMO Live parcel metrics — fill-when-empty decision");

check("empty row + real Live weight → FILL", () => {
  const d = decideMetricFill(0, 0, 305.5, 0.34);
  assert.equal(d.fill, true);
  assert.equal(d.mismatch, false);
});

check("empty row (null) + real Live weight → FILL", () => {
  assert.equal(decideMetricFill(null, null, 200, 0.23).fill, true);
});

check("empty row but Live has NO weight → do NOT fill (never write a bogus 0)", () => {
  assert.equal(decideMetricFill(0, 0, 0, 0).fill, false);
});

check("row already has weight → NEVER fill (protect staff edit / billed figure)", () => {
  const d = decideMetricFill(200, 0.2328, 305.5, 0.34);
  assert.equal(d.fill, false, "must not overwrite a non-zero value");
});

check("row has a MATCHING weight → not filled, not flagged", () => {
  const d = decideMetricFill(200, 0.23, 200, 0.23);
  assert.equal(d.fill, false);
  assert.equal(d.mismatch, false);
});

check("row has a DIFFERENT non-zero weight → flag mismatch (but still no overwrite)", () => {
  const d = decideMetricFill(200, 0.2328, 305.5, 0.34);
  assert.equal(d.fill, false, "still never overwrite");
  assert.equal(d.mismatch, true, "flag for a human to reconcile against แต้ม");
});

check("mismatch tolerance — within 2% is NOT flagged", () => {
  // 200 vs 201 = 0.5% → within tolerance.
  assert.equal(decideMetricFill(200, 0.2, 201, 0.2).mismatch, false);
  // 200 vs 250 = 20% → flagged.
  assert.equal(decideMetricFill(200, 0.2, 250, 0.2).mismatch, true);
});

check("volume-only mismatch is caught when weight matches", () => {
  // weight matches (200), but volume differs a lot (0.23 vs 0.50) → flagged.
  const d = decideMetricFill(200, 0.23, 200, 0.5);
  assert.equal(d.mismatch, true);
  assert.equal(d.fill, false);
});

console.log(`\n✅ all ${passed} MOMO Live parcel-metrics assertions passed`);
