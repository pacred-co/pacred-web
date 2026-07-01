/**
 * Unit tests for resolveReceiptFrozenTotals (task 4a · ภูม 2026-07-01).
 *
 * Proves a receipt renders its FROZEN stored totals (matching its ใบวางบิล) and
 * does NOT drift to a live re-sum of the forwarder rows.
 *
 * Run: node_modules/.bin/tsx lib/receipt/receipt-frozen-totals.test.ts
 */

import { resolveReceiptFrozenTotals } from "./receipt-frozen-totals";

let pass = 0;
let fail = 0;

function eq(name: string, got: number | boolean, want: number | boolean) {
  const ok = got === want;
  if (ok) {
    pass++;
    console.log(`✓ ${name}  got=${got}`);
  } else {
    fail++;
    console.error(`✗ ${name}  got=${got} want=${want}`);
  }
}

// ── 1. Personal receipt (no WHT) — frozen total wins, live sum ignored ──
// The whole point of 4a: the forwarder rows changed AFTER issuance (live sum
// = 2057) but the frozen doc = 2135.43 → the receipt MUST show 2135.43.
{
  const r = resolveReceiptFrozenTotals({
    headerTotalBefore: 2135.43,
    headerRamount:     2135.43, // personal: net == gross (no WHT)
    lineSumWithMao:    2057.0,  // drifted live sum — MUST be ignored
    showWht:           false,
    itemsMissing:      false,
  });
  eq("personal · preTax = frozen gross (not live)", r.preTaxTotal, 2135.43);
  eq("personal · grandTotal = frozen net (not live)", r.grandTotal, 2135.43);
  eq("personal · wht = 0", r.whtAmount, 0);
  eq("personal · usedFrozen", r.usedFrozen, true);
}

// ── 2. Corporate receipt (WHT 1%) — frozen breakdown, drift-proof ──
// Bill gross 2135.43 · 1% withheld → net 2113.98 (frozen at issuance). Live sum
// drifted to 2057 but the printed doc must reconcile to the stored figures.
{
  const r = resolveReceiptFrozenTotals({
    headerTotalBefore: 2135.43,
    headerRamount:     2113.98, // gross − 1% (21.45)
    lineSumWithMao:    2057.0,  // drifted — ignored
    showWht:           true,
    itemsMissing:      false,
  });
  eq("corp · preTax = frozen gross", r.preTaxTotal, 2135.43);
  eq("corp · wht = frozen diff (gross − net)", Math.round(r.whtAmount * 100) / 100, 21.45);
  eq("corp · grandTotal = frozen net", r.grandTotal, 2113.98);
  // Reconciliation: preTax − wht == grandTotal (the receipt's own arithmetic).
  eq("corp · preTax − wht = net", Math.round((r.preTaxTotal - r.whtAmount) * 100) / 100, 2113.98);
}

// ── 3. items-missing — header amount surfaced, WHT from the header diff ──
{
  const r = resolveReceiptFrozenTotals({
    headerTotalBefore: 5000,
    headerRamount:     4950,
    lineSumWithMao:    0,      // no items
    showWht:           true,
    itemsMissing:      true,
  });
  eq("missing · preTax = header before", r.preTaxTotal, 5000);
  eq("missing · grandTotal = header ramount", r.grandTotal, 4950);
  eq("missing · wht = header diff", r.whtAmount, 50);
  eq("missing · usedFrozen", r.usedFrozen, true);
}

// ── 4. Legacy fallback — header NOT populated (0/0) → live sum drives it ──
// A pre-column receipt: no frozen value → fall back to the live per-line sum so
// it never renders a wrong blank total. Personal (no WHT).
{
  const r = resolveReceiptFrozenTotals({
    headerTotalBefore: 0,
    headerRamount:     0,
    lineSumWithMao:    1234.56,
    showWht:           false,
    itemsMissing:      false,
  });
  eq("legacy · preTax = live sum", r.preTaxTotal, 1234.56);
  eq("legacy · grandTotal = live sum", r.grandTotal, 1234.56);
  eq("legacy · wht = 0", r.whtAmount, 0);
  eq("legacy · usedFrozen = false (fell back to live)", r.usedFrozen, false);
}

// ── 5. Legacy fallback WITH corporate WHT — re-applies 1% on the live sum ──
{
  const r = resolveReceiptFrozenTotals({
    headerTotalBefore: 0,
    headerRamount:     0,
    lineSumWithMao:    10000,
    showWht:           true,
    itemsMissing:      false,
  });
  eq("legacy corp · preTax = live sum", r.preTaxTotal, 10000);
  eq("legacy corp · wht = 1% live", r.whtAmount, 100);
  eq("legacy corp · grandTotal = live − wht", r.grandTotal, 9900);
  eq("legacy corp · usedFrozen = false", r.usedFrozen, false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
