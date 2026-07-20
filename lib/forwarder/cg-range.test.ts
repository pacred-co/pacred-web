/**
 * cg-range.test.ts — locks the CG box-number pattern (owner 2026-07-19).
 * Run: tsx lib/forwarder/cg-range.test.ts
 */
import { parseCgRange, cgMatchesQty } from "./cg-range";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

// ── the owner's real example: PR9820 908007156796 ──
eq("range 002-007 = 6 boxes", parseCgRange("CG84280723002-CG84280723007")?.count, 6);
eq("range 008-010 = 3", parseCgRange("CG84280723008-CG84280723010")?.count, 3);
eq("range 011-012 = 2", parseCgRange("CG84280723011-CG84280723012")?.count, 2);
eq("single CG…015 = 1", parseCgRange("CG84280723015")?.count, 1);
eq("single start==end", parseCgRange("CG84280723015")?.end, "CG84280723015");
// whitespace + empty
eq("empty → null", parseCgRange(""), null);
eq("null → null", parseCgRange(null), null);
eq("trimmed", parseCgRange("  CG82541643220 ")?.count, 1);
// garbage — never guess
eq("prefix mismatch → count null", parseCgRange("CG84280723002-XX84280723007")?.count, null);
eq("reversed range → count null", parseCgRange("CG84280723007-CG84280723002")?.count, null);
eq("huge span refused", parseCgRange("CG80000000000-CG89999999999")?.count, null);
// big-int safe (CG ids are 11+ digits — beyond 2^53 territory must not wobble)
eq("11-digit ids exact", parseCgRange("CG99999999990-CG99999999999")?.count, 10);

// ── consistency vs declared qty ──
eq("6 boxes vs qty 6 → true", cgMatchesQty("CG84280723002-CG84280723007", 6), true);
eq("6 boxes vs qty 1 → FALSE (mismatch)", cgMatchesQty("CG84280723002-CG84280723007", 1), false);
eq("no CG → null (can't judge)", cgMatchesQty("", 5), null);
eq("no qty → null", cgMatchesQty("CG84280723015", null), null);
eq("unparseable count → null", cgMatchesQty("CG1-XX9", 3), null);

console.log(`\nforwarder/cg-range: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
