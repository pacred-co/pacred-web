import assert from "node:assert";
import {
  computeSackTotals,
  transportTypeOf,
  warehouseCityLabel,
  sackStatusLabel,
  transportTypeLabel,
} from "./sack";

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

// ── computeSackTotals (aggregate momo_import_tracks rows) ─────
t("computeSackTotals: empty → zeros", () => {
  assert.deepEqual(computeSackTotals([]), { qty: 0, weight: 0, cbm: 0, parcels: 0 });
});

t("computeSackTotals: sums quantity/weight_kg/cbm + counts parcels", () => {
  const totals = computeSackTotals([
    { quantity: 2, weight_kg: 3.5, cbm: 0.1 },
    { quantity: 3, weight_kg: 1.5, cbm: 0.2 },
  ]);
  assert.equal(totals.qty, 5);
  assert.equal(totals.weight, 5);
  assert.ok(Math.abs(totals.cbm - 0.3) < 1e-9);
  assert.equal(totals.parcels, 2);
});

t("computeSackTotals: null/undefined/NaN coerce to 0 (never NaN), parcels still counted", () => {
  const totals = computeSackTotals([
    { quantity: null, weight_kg: undefined, cbm: 1 },
    { quantity: 2, weight_kg: 4, cbm: null },
    // @ts-expect-error — exercise a bad runtime value
    { quantity: "x", weight_kg: 2, cbm: 3 },
  ]);
  assert.equal(totals.qty, 2);
  assert.equal(totals.weight, 6);
  assert.equal(totals.cbm, 4);
  assert.equal(totals.parcels, 3);
  assert.ok(!Number.isNaN(totals.qty) && !Number.isNaN(totals.weight) && !Number.isNaN(totals.cbm));
});

// ── transportTypeOf (derive via cabinet-transport SOT) ───────
t("transportTypeOf: GZS/SEA → เรือ '2'", () => {
  assert.equal(transportTypeOf("GZS260529-1"), "2");
  assert.equal(transportTypeOf("MO20260523-SEA02"), "2");
});

t("transportTypeOf: GZE/EK → รถ '1' (EK is ROAD)", () => {
  assert.equal(transportTypeOf("GZE2604-01"), "1");
  assert.equal(transportTypeOf("CBX260616-EK08"), "1");
});

t("transportTypeOf: GZA/AIR → อากาศ '3'", () => {
  assert.equal(transportTypeOf("GZA260601-AIR"), "3");
});

t("transportTypeOf: falls through names, first hit wins", () => {
  // first name has no token, the container name does → derive from the container.
  assert.equal(transportTypeOf("no-token", "GZS260529-1"), "2");
});

t("transportTypeOf: no recognisable token → null", () => {
  assert.equal(transportTypeOf("random", ""), null);
  assert.equal(transportTypeOf(null, undefined), null);
});

// ── labels (reuse SOTs) ──────────────────────────────────────
t("warehouseCityLabel: 1=กวางโจว 2=อี้อู, empty=—", () => {
  assert.equal(warehouseCityLabel("1"), "กวางโจว");
  assert.equal(warehouseCityLabel("2"), "อี้อู");
  assert.equal(warehouseCityLabel(""), "—");
  assert.equal(warehouseCityLabel(null), "—");
  assert.equal(warehouseCityLabel("9"), "9"); // unknown code passes through
});

t("transportTypeLabel: readable labels, unknown=—", () => {
  assert.equal(transportTypeLabel("1"), "🚛 ทางรถ");
  assert.equal(transportTypeLabel("2"), "🚢 ทางเรือ");
  assert.equal(transportTypeLabel("3"), "✈️ ทางอากาศ");
  assert.equal(transportTypeLabel(null), "—");
});

t("sackStatusLabel: known tokens map to Thai, free-text passes through, empty=—", () => {
  assert.equal(sackStatusLabel("in_transit"), "กำลังขนส่ง");
  assert.equal(sackStatusLabel("ARRIVED"), "ถึงแล้ว");
  assert.equal(sackStatusLabel("ถึงโกดังจีนแล้ว"), "ถึงโกดังจีนแล้ว"); // Thai free-text unchanged
  assert.equal(sackStatusLabel(""), "—");
  assert.equal(sackStatusLabel(null), "—");
});

console.log(`✓ sack — ${pass} passed`);
