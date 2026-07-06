/**
 * Unit tests for the PURE PR-code reassignment core.
 * Pattern matches lib/auth/pcs-legacy-password.test.ts (plain tsx + manual asserts).
 */
import {
  computeLowestVacantPrCode,
  formatPrCode,
  parsePrIndex,
  reassignSyntheticEmail,
  describeReassignPlan,
} from "./reassign-member-code";
import { legacySyntheticEmail } from "@/lib/auth/pcs-legacy-password";

let pass = 0;
let fail = 0;

function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}
function assertThrows(label: string, fn: () => unknown) {
  try {
    fn();
    fail++;
    console.error(`  ✗ ${label} — expected throw, got none`);
  } catch {
    pass++;
    console.log(`  ✓ ${label}`);
  }
}
function section(name: string) {
  console.log(`\n${name}`);
}

section("parsePrIndex");
assertEq("PR001 → 1", parsePrIndex("PR001"), 1);
assertEq("PR1 → 1 (unpadded)", parsePrIndex("PR1"), 1);
assertEq("PR10794 → 10794", parsePrIndex("PR10794"), 10794);
assertEq("pr034 → 34 (case-insensitive)", parsePrIndex("pr034"), 34);
assertEq("  PR168  → 168 (trim)", parsePrIndex("  PR168  "), 168);
assertEq("PR000 → null (index 0 invalid)", parsePrIndex("PR000"), null);
assertEq("AD020 → null (staff code)", parsePrIndex("AD020"), null);
assertEq("empty → null", parsePrIndex(""), null);
assertEq("null → null", parsePrIndex(null), null);
assertEq("PRabc → null", parsePrIndex("PRabc"), null);

section("formatPrCode — min-3-digit padding");
assertEq("1 → PR001", formatPrCode(1), "PR001");
assertEq("34 → PR034", formatPrCode(34), "PR034");
assertEq("999 → PR999", formatPrCode(999), "PR999");
assertEq("10794 → PR10794 (past 999, no truncation)", formatPrCode(10794), "PR10794");
assertThrows("0 throws", () => formatPrCode(0));
assertThrows("-5 throws", () => formatPrCode(-5));
assertThrows("1.5 throws", () => formatPrCode(1.5));

section("computeLowestVacantPrCode — fills the LOWEST gap");
assertEq("gap at 3 → PR003", computeLowestVacantPrCode(["PR001", "PR002", "PR004"]), "PR003");
assertEq("no gap → next (PR004)", computeLowestVacantPrCode(["PR001", "PR002", "PR003"]), "PR004");
assertEq("empty registry → PR001", computeLowestVacantPrCode([]), "PR001");
assertEq("first slot free → PR001", computeLowestVacantPrCode(["PR002", "PR003"]), "PR001");
assertEq(
  "padded + unpadded mix (PR1==PR001) → PR003",
  computeLowestVacantPrCode(["PR1", "PR002"]),
  "PR003",
);
assertEq(
  "ignores non-PR entries (AD020/'') → PR002",
  computeLowestVacantPrCode(["PR001", "AD020", "", null, "PR003"]),
  "PR002",
);
assertEq(
  "gap below a big code → PR001 (holes before PR10794 filled first)",
  computeLowestVacantPrCode(["PR10794"]),
  "PR001",
);
assertEq(
  "result padded to ≥3 digits even for low index",
  computeLowestVacantPrCode(["PR001", "PR002"]),
  "PR003",
);

section("reassignSyntheticEmail — byte-identical to the auth bridge");
assertEq(
  "PR034 → pcs-legacy-pr034@users.pacred.invalid",
  reassignSyntheticEmail("PR034"),
  "pcs-legacy-pr034@users.pacred.invalid",
);
// Lock-step guard: the pure copy MUST equal the server-only auth helper — if
// legacySyntheticEmail ever changes shape, this fails so the move can't drift.
for (const code of ["PR001", "PR168", "PR10794", "pr540"]) {
  assertEq(`lock-step with legacySyntheticEmail(${code})`, reassignSyntheticEmail(code), legacySyntheticEmail(code));
}

section("describeReassignPlan — filters 0-row tables + sums");
{
  const plan = describeReassignPlan({
    fromCode: "PR10794",
    toCode: "PR034",
    authEmailFrom: "pcs-legacy-pr10794@users.pacred.invalid",
    tables: [
      { table: "tb_users", column: "userID", rows: 1 },
      { table: "profiles", column: "member_code", rows: 1 },
      { table: "tb_forwarder", column: "userid", rows: 12 },
      { table: "tb_cart", column: "userid", rows: 0 }, // dropped
    ],
  });
  assertEq("drops the 0-row table", plan.tables.length, 3);
  assertEq("sums non-zero rows", plan.totalRows, 14);
  assertEq("authEmailTo computed from toCode", plan.authEmailTo, "pcs-legacy-pr034@users.pacred.invalid");
  assertEq("passes authEmailFrom through", plan.authEmailFrom, "pcs-legacy-pr10794@users.pacred.invalid");
}

console.log(`\n${fail === 0 ? "✓ ALL PASS" : "✗ FAILURES"} — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
