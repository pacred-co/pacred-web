/**
 * Unit tests for the rate-tier coID predicate (lib/forwarder/coid.ts) — the
 * money-path SOT (ADR-0029) that decides general (tiered tb_rate_g_*) vs VIP
 * (tb_rate_vip_*) for 8,700+ customers. A miss here mis-prices / mislabels.
 *
 * Run: tsx lib/forwarder/coid.test.ts   (or `pnpm test:unit`)
 * Exits non-zero on any failure.
 *
 * Regression guard for the 2026-06-12 coID PCS→PR rebrand: the canonical general
 * code is 'PR' (post-mig-0182); the predicate MUST also accept the legacy 'PCS',
 * the 'GENERAL' sentinel, and empty — and stay case-insensitive — so a 'PR'
 * customer never falls through to the VIP branch ("ไม่มีเรต") or gets a VIP label.
 */

import { isGeneralCoid, GENERAL_COID, GENERAL_COID_VALUES } from "./coid";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}`); }
}

console.log("coid: GENERAL_COID + value list");
ok("GENERAL_COID is 'PR'", GENERAL_COID === "PR");
ok("GENERAL_COID_VALUES = ['','PR','PCS','GENERAL']",
  JSON.stringify([...GENERAL_COID_VALUES]) === JSON.stringify(["", "PR", "PCS", "GENERAL"]));

console.log("coid: general tier → isGeneralCoid true");
for (const v of ["", "PR", "PCS", "GENERAL"]) ok(`'${v}' is general`, isGeneralCoid(v) === true);
ok("null is general", isGeneralCoid(null) === true);
ok("undefined is general", isGeneralCoid(undefined) === true);
ok("' PR ' (whitespace) is general", isGeneralCoid(" PR ") === true);
ok("'pr' (lowercase) is general", isGeneralCoid("pr") === true);
ok("'general' (lowercase) is general", isGeneralCoid("general") === true);

console.log("coid: VIP groups → isGeneralCoid false (read tb_rate_vip_*)");
for (const v of ["THADA.VIP", "SIN.VIP", "OOAEOM.VIP", "SWAN", "VIP1", "VIP5", "PRO"]) {
  ok(`'${v}' is NOT general (VIP)`, isGeneralCoid(v) === false);
}
// The rebrand bug class: a 'PR' customer must NEVER be classed VIP.
ok("isVip('PR') === false (the rebrand regression guard)", !isGeneralCoid("PR") === false);

console.log(`\ncoid: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
