/**
 * SF-1 — incoterm-scope freight-cost gate (lib/freight/rate-model.incursChinaFreightCost).
 *
 * Locks the money-display rule: only fold the looked-up China freight COST when
 * the incoterm's scope actually makes US incur it (freight/origin). For CIF/FOB/FAS
 * the seller already paid the China freight — folding the cost would understate
 * the NET margin. This is the predicate `adminComposeQuoteFromRateCard` gates the
 * China-cost lookup on (actions/admin/freight-quotes.ts).
 *
 * Run:  pnpm tsx lib/freight/incurs-china-freight.test.ts   (wired into pnpm test)
 */

import { incursChinaFreightCost, INCOTERM_SCOPE } from "./rate-model";
import { INCOTERMS, type Incoterm } from "@/lib/validators/freight-quote";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

// ── (a) seller-paid-freight incoterms → false (don't fold the China cost) ──
section("(a) CIF/FOB/FAS — seller paid freight → no China cost");
assertEq("CIF → false", incursChinaFreightCost("CIF"), false);
assertEq("FOB → false", incursChinaFreightCost("FOB"), false);
assertEq("FAS → false", incursChinaFreightCost("FAS"), false);

// ── (b) freight/origin-scope incoterms → true (we incur + bill the China cost) ──
section("(b) CFR/CPT/CIP/EXW/FCA/DAP/DPU/DDP → fold the China cost");
assertEq("CFR → true (we book freight)", incursChinaFreightCost("CFR"), true);
assertEq("CPT → true", incursChinaFreightCost("CPT"), true);
assertEq("CIP → true", incursChinaFreightCost("CIP"), true);
assertEq("EXW → true (factory door, incl. origin)", incursChinaFreightCost("EXW"), true);
assertEq("FCA → true", incursChinaFreightCost("FCA"), true);
assertEq("DAP → true", incursChinaFreightCost("DAP"), true);
assertEq("DPU → true", incursChinaFreightCost("DPU"), true);
assertEq("DDP → true (all-in door-to-door)", incursChinaFreightCost("DDP"), true);

// ── (c) EXHAUSTIVE — every Incoterm in INCOTERM_SCOPE maps to the expected value ──
// Expected = does its scope list include 'freight' OR 'origin'? (the source rule)
section("(c) every Incoterm matches its scope's freight/origin membership");
const expected: Record<Incoterm, boolean> = {
  EXW: true, FCA: true, CPT: true, CIP: true, DAP: true, DPU: true, DDP: true,
  FAS: false, FOB: false, CFR: true, CIF: false,
};
for (const ic of INCOTERMS) {
  const scopeHasFreightOrigin = INCOTERM_SCOPE[ic].some((s) => s === "freight" || s === "origin");
  // the predicate must agree with a direct read of the scope table …
  assertEq(`${ic}: predicate == scope-has-freight/origin`, incursChinaFreightCost(ic), scopeHasFreightOrigin);
  // … and with the hand-checked expectation table.
  assertEq(`${ic}: predicate == expected[${ic}]`, incursChinaFreightCost(ic), expected[ic]);
}

// ── (d) coverage completeness — every enum value asserted, none skipped ──
section("(d) all 11 Incoterms covered");
assertEq("INCOTERMS count = 11", INCOTERMS.length, 11);
assertEq("expected table covers every Incoterm", Object.keys(expected).length, INCOTERMS.length);

console.log(`\n${fail === 0 ? "✅" : "❌"} SF-1 incurs-china-freight: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
