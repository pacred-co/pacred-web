/**
 * Unit tests for the customer price-breakdown view-model (display-only).
 * Run: tsx lib/forwarder/price-breakdown-display.test.ts
 */
import assert from "node:assert/strict";
import { buildPriceBreakdownDisplay } from "./price-breakdown-display";

let passed = 0;
function ok(cond: boolean, msg: string) {
  assert.ok(cond, msg);
  passed++;
}

// 1. No rate + no total → null (nothing to explain).
{
  const r = buildPriceBreakdownDisplay({
    weightKg: 0, volume: 0, amount: 1, amountCount: "1",
    refRate: 0, refPrice: null, totalPrice: 0,
    comparisonOn: false, comparisonThreshold: 0,
  });
  ok(r === null, "null when no rate/total");
}

// 2. CBM basis chosen (frefprice '2'), famountcount==1 → billable = volume.
{
  const r = buildPriceBreakdownDisplay({
    weightKg: 100, volume: 2, amount: 5, amountCount: "1",
    refRate: 2900, refPrice: "2", totalPrice: 5800,
    comparisonOn: false, comparisonThreshold: 0,
  });
  ok(r !== null, "non-null priced CBM");
  ok(r!.basis === "cbm", "basis cbm from frefprice '2'");
  ok(r!.billableCbm === 2, "billable cbm = volume when amountCount=1");
  ok(r!.rate === 2900, "rate passthrough");
  ok(r!.transport === 5800, "transport = stored ftotalprice");
  ok(r!.byWeight === false, "no-comparison + cbm → byWeight false");
}

// 3. KG basis chosen (frefprice '1'), famountcount!=1 → billable = volume*amount.
{
  const r = buildPriceBreakdownDisplay({
    weightKg: 500, volume: 0.5, amount: 4, amountCount: "0",
    refRate: 20, refPrice: "1", totalPrice: 10000,
    comparisonOn: false, comparisonThreshold: 0,
  });
  ok(r!.basis === "kg", "basis kg from frefprice '1'");
  ok(r!.billableCbm === 2, "billable cbm = volume*amount when amountCount!=1");
  ok(r!.byWeight === true, "no-comparison + kg → byWeight true");
}

// 4. Comparison ON → kgPerCbm vs threshold drives byWeight.
{
  // weight 300, cbm 2 → kgPerCbm 150 > threshold 100 → byWeight true.
  const r = buildPriceBreakdownDisplay({
    weightKg: 300, volume: 2, amount: 1, amountCount: "1",
    refRate: 20, refPrice: "1", totalPrice: 6000,
    comparisonOn: true, comparisonThreshold: 100,
  });
  ok(r!.comparisonOn === true, "comparison flagged on");
  ok(Math.abs(r!.kgPerCbm - 150) < 1e-9, "kgPerCbm = weight/cbm");
  ok(r!.byWeight === true, "kgPerCbm>threshold → byWeight");
}

// 5. Comparison ON, ratio below threshold → byWeight false (CBM).
{
  const r = buildPriceBreakdownDisplay({
    weightKg: 100, volume: 2, amount: 1, amountCount: "1",
    refRate: 2900, refPrice: "2", totalPrice: 5800,
    comparisonOn: true, comparisonThreshold: 250,
  });
  ok(r!.kgPerCbm === 50, "kgPerCbm 50");
  ok(r!.byWeight === false, "kgPerCbm<=threshold → CBM");
}

// 6. Divide-by-zero guard (cbm 0).
{
  const r = buildPriceBreakdownDisplay({
    weightKg: 10, volume: 0, amount: 1, amountCount: "1",
    refRate: 20, refPrice: "1", totalPrice: 200,
    comparisonOn: false, comparisonThreshold: 0,
  });
  ok(r!.kgPerCbm === 0, "kgPerCbm 0 when cbm 0 (no NaN/Infinity)");
}

console.log(`price-breakdown-display: ${passed} assertions passed`);
