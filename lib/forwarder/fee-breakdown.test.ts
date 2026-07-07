/**
 * Unit tests for lib/forwarder/fee-breakdown.ts (owner 2026-07-07).
 *
 * Locks the load-bearing invariant: the named fee split is a pure re-labeling —
 * the SAME gross, presented with each component surfaced. Specifically:
 *   • namedFeesGross(splitForwarderFees(row)) === calcForwarderGross(row)
 *   • thaiShipping+crate+update+chnPlus+other === computeForwarderDebitBatch
 *     breakdown.otherCharges (the old opaque bucket the papers must now split)
 *   • freight + otherCharges + maoFee === the doc gross, and the printed NET
 *     (gross − WHT 1%) is unchanged — incl. the FRI2607-00018 case
 *     (freight 3,350 + ค่าขนส่งในไทย 100 = 3,450 · mao 0 · net 3,415.50).
 *
 * Harness: plain `tsx` (no vitest), matching forwarder-debit-total.test.ts.
 */

import {
  splitForwarderFees,
  sumNamedFees,
  namedNonFreight,
  namedFeesGross,
  type ForwarderFeeFields,
} from "./fee-breakdown";
import { calcForwarderGross } from "./outstanding";
import { computeForwarderDebitBatch } from "./forwarder-debit-total";
import { computeBillWht } from "@/lib/billing/wht";

let pass = 0;
let fail = 0;

function assertClose(label: string, actual: number, expected: number, eps = 0.005) {
  if (Math.abs(actual - expected) <= eps) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${expected}\n    actual:   ${actual}`);
  }
}

/** Minimal forwarder row builder — only the price columns matter. */
function row(p: Partial<ForwarderFeeFields>): ForwarderFeeFields {
  return {
    ftotalprice:           p.ftotalprice           ?? 0,
    ftransportprice:       p.ftransportprice        ?? 0,
    fpriceupdate:          p.fpriceupdate           ?? 0,
    fshippingservice:      p.fshippingservice       ?? 0,
    pricecrate:            p.pricecrate             ?? 0,
    ftransportpricechnthb: p.ftransportpricechnthb  ?? 0,
    priceother:            p.priceother             ?? 0,
    fdiscount:             p.fdiscount              ?? 0,
  };
}

console.log("\nfee-breakdown");

// ── 1. split reads the right columns ─────────────────────────────────
{
  const f = splitForwarderFees(
    row({ ftotalprice: 1000, ftransportprice: 100, pricecrate: 50, fpriceupdate: 30,
          ftransportpricechnthb: 20, priceother: 10, fshippingservice: 5, fdiscount: 15 }),
  );
  assertClose("freight = ftotalprice", f.freight, 1000);
  assertClose("thaiShipping = ftransportprice", f.thaiShipping, 100);
  assertClose("crate = pricecrate", f.crate, 50);
  assertClose("update = fpriceupdate", f.update, 30);
  assertClose("chnPlus = ftransportpricechnthb", f.chnPlus, 20);
  assertClose("other = priceother + fshippingservice", f.other, 15);
  assertClose("discount = fdiscount", f.discount, 15);
}

// ── 2. invariant: namedFeesGross === calcForwarderGross (many rows) ───
{
  const cases: ForwarderFeeFields[] = [
    row({ ftotalprice: 3350, ftransportprice: 100 }),
    row({ ftotalprice: 1234.56, ftransportprice: 78.9, pricecrate: 12.34, fpriceupdate: 5,
          ftransportpricechnthb: 6.78, priceother: 9.1, fshippingservice: 2.2, fdiscount: 50 }),
    row({ ftotalprice: 95 }),
    row({ ftotalprice: 0, ftransportprice: 0 }),
    row({ ftotalprice: "2000", ftransportprice: "150", fdiscount: "100" }), // varchar coercion
  ];
  for (let i = 0; i < cases.length; i++) {
    const f = splitForwarderFees(cases[i]);
    // outstanding.ForwarderPriceFields also needs fusercompany — supply null.
    const gross = calcForwarderGross({ ...cases[i], fusercompany: null });
    assertClose(`namedFeesGross === calcForwarderGross [case ${i}]`, namedFeesGross(f), gross);
  }
}

// ── 3. thaiShipping+crate+update+chnPlus+other === breakdown.otherCharges ─
{
  const r = row({ ftotalprice: 1000, ftransportprice: 100, pricecrate: 50, fpriceupdate: 30,
                  ftransportpricechnthb: 20, priceother: 10, fshippingservice: 5, fdiscount: 15 });
  const f = splitForwarderFees(r);
  const batch = computeForwarderDebitBatch(
    [{ id: 1, fshipby: "PCS", ftrackingchn: "T1", ...r }],
    { userId: "PR001", isCorporate: false },
  );
  const otherCharges = batch.lines[0].breakdown.otherCharges;
  const namedOther = f.thaiShipping + f.crate + f.update + f.chnPlus + f.other;
  assertClose("named non-freight (ex discount) === breakdown.otherCharges", namedOther, otherCharges);
}

// ── 4. FRI2607-00018 — freight 3,350 + ค่าขนส่งในไทย 100 = 3,450 → net 3,415.50 ─
{
  const r = row({ ftotalprice: 3350, ftransportprice: 100 }); // mao 0 (ftransportprice≠0 ⇒ not เหมาๆ)
  const f = splitForwarderFees(r);
  assertClose("FRI…18 freight", f.freight, 3350);
  assertClose("FRI…18 ค่าขนส่งในไทย (thaiShipping · LOGISTICS)", f.thaiShipping, 100);
  const maoFee = 0;
  const gross = namedFeesGross(f) + maoFee;
  assertClose("FRI…18 gross = freight + otherCharges + maoFee = 3450", f.freight + namedNonFreight(f) + maoFee, 3450);
  assertClose("FRI…18 gross === 3450", gross, 3450);
  const { wht_amount, net_payable } = computeBillWht(true, gross); // juristic 1%
  assertClose("FRI…18 WHT 1% = 34.50", wht_amount, 34.5);
  assertClose("FRI…18 net = gross − WHT = 3415.50 (unchanged)", net_payable, 3415.5);
}

// ── 5. sumNamedFees Σ across rows (rounded per field) ────────────────
{
  const rows = [
    row({ ftotalprice: 1000, ftransportprice: 100 }),
    row({ ftotalprice: 2000, ftransportprice: 100, pricecrate: 25 }),
    row({ ftotalprice: 350.55, priceother: 4.44 }),
  ];
  const s = sumNamedFees(rows);
  assertClose("Σ freight", s.freight, 3350.55);
  assertClose("Σ thaiShipping", s.thaiShipping, 200);
  assertClose("Σ crate", s.crate, 25);
  assertClose("Σ other", s.other, 4.44);
  // doc gross re-sum must equal Σ of per-row calcForwarderGross
  const grossFromNamed = s.freight + namedNonFreight(s);
  const grossFromRows = rows.reduce((a, r) => a + calcForwarderGross({ ...r, fusercompany: null }), 0);
  assertClose("Σ named gross === Σ calcForwarderGross", grossFromNamed, Math.round(grossFromRows * 100) / 100);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
