/**
 * Unit tests for the lead source-tab bucketing SOT (lib/validators/imported-lead.ts
 * bucketLeadSource / isPcsLeadSource). This is the SINGLE definition the badge
 * counts (getImportedLeadSourceCounts) and the list filter (lead-assign-bar) both
 * use — a drift here re-creates the "badge says N but the list shows M" bug.
 *
 * Run: tsx lib/validators/imported-lead-source.test.ts   (or `pnpm test:unit`)
 * Exits non-zero on any failure.
 */

import { bucketLeadSource, isPcsLeadSource } from "./imported-lead";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log("imported-lead: bucketLeadSource — exact freight buckets");
ok("'freight' → freight", bucketLeadSource("freight") === "freight");
ok("'freight_no_phone' → freight_no_phone", bucketLeadSource("freight_no_phone") === "freight_no_phone");

console.log("imported-lead: bucketLeadSource — every NON-freight source → pcs");
for (const v of ["Axelra", "TT", "Pcs", "Pacred", "anything", "PCS"]) {
  ok(`'${v}' → pcs`, bucketLeadSource(v) === "pcs");
}

console.log("imported-lead: bucketLeadSource — empty/null/undefined → pcs (the default tab)");
ok("'' → pcs", bucketLeadSource("") === "pcs");
ok("null → pcs", bucketLeadSource(null) === "pcs");
ok("undefined → pcs", bucketLeadSource(undefined) === "pcs");

console.log("imported-lead: freight values are NOT pcs (no over-counting into PCS)");
ok("'freight' is NOT pcs", isPcsLeadSource("freight") === false);
ok("'freight_no_phone' is NOT pcs", isPcsLeadSource("freight_no_phone") === false);
ok("isPcsLeadSource('Axelra') === true", isPcsLeadSource("Axelra") === true);

console.log(`\nimported-lead-source: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
