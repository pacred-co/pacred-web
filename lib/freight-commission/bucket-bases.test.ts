/**
 * Tests for bucketCommissionBases (audit 2026-06-14 test-gap #2) — the SOLE
 * source-of-truth mapping from a freight quote's line `commission_scope` to the
 * three commission revenue bases. A re-label or a new-scope-buckets-to-zero
 * regression would silently change what staff get paid — this locks it.
 *
 * Run: npx tsx lib/freight-commission/bucket-bases.test.ts
 */

import { bucketCommissionBases } from "./calc-v2";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}
const I = (commission_scope: string | null, line_total_thb: number | string | null) => ({ commission_scope, line_total_thb });

console.log("freight-commission bucketCommissionBases (test-gap #2)");

// ── the three commission-bearing scopes map to their bucket ──
eq("freight → freightThb", bucketCommissionBases([I("freight", 1000)]).freightThb, 1000);
eq("thai_customs → customsThb", bucketCommissionBases([I("thai_customs", 500)]).customsThb, 500);
eq("origin → docThb (origin/doc revenue → doc commission)", bucketCommissionBases([I("origin", 300)]).docThb, 300);

// ── NON-commission scopes contribute ZERO (the load-bearing exclusion) ──
{
  const b = bucketCommissionBases([I("thai_transport", 9999), I("import_tax", 8888), I(null, 7777), I("unknown_future", 6666)]);
  eq("thai_transport → 0", [b.freightThb, b.customsThb, b.docThb], [0, 0, 0]);
}

// ── mixed quote sums per bucket; shipmentCount defaults to 1 ──
{
  const b = bucketCommissionBases([
    I("freight", 1000), I("freight", 200),
    I("thai_customs", 500),
    I("origin", 300),
    I("thai_transport", 5000), // excluded
  ]);
  eq("freightThb summed", b.freightThb, 1200);
  eq("customsThb summed", b.customsThb, 500);
  eq("docThb summed", b.docThb, 300);
  eq("shipmentCount defaults 1", b.shipmentCount, 1);
}

// ── string numerics (Postgres numeric → string) coerce; junk → 0 (no NaN) ──
eq("string numeric coerces", bucketCommissionBases([I("freight", "1500.50")]).freightThb, 1500.5);
eq("non-finite → skipped (no NaN)", bucketCommissionBases([I("freight", "abc")]).freightThb, 0);
eq("empty items → all-zero", bucketCommissionBases([]), { freightThb: 0, customsThb: 0, docThb: 0, shipmentCount: 1 });

console.log(`\n${fail === 0 ? "✅" : "❌"} bucketCommissionBases: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
