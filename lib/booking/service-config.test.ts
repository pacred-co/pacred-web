/**
 * Unit tests for lib/booking/service-config.ts — the BK-1 per-service booking
 * manifest + the calculator-mode→slug mapper. Pure, no IO. The headline test is
 * the INTEGRITY check: every slug the mapper can emit must be a real
 * SERVICE_CONFIGS key (catches mapper↔config drift → a dead /book/<slug> link).
 *
 * Run:  pnpm tsx lib/booking/service-config.test.ts   (wired into pnpm test:unit)
 */

import {
  getServiceConfig, listBookableServices, mapCalculatorModeToServiceSlug,
} from "./service-config";
import type { TabMode } from "@/types/booking";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function assertTrue(label: string, cond: boolean) { assertEq(label, cond, true); }
function section(name: string) { console.log(`\n${name}`); }

// ── mapCalculatorModeToServiceSlug — exact switch outputs ──
section("mapCalculatorModeToServiceSlug");
assertEq("sea + fcl → import-china-fcl", mapCalculatorModeToServiceSlug("sea" as TabMode, "fcl"), "import-china-fcl");
assertEq("sea + lcl → import-china-lcl", mapCalculatorModeToServiceSlug("sea" as TabMode, "lcl"), "import-china-lcl");
assertEq("sea + null → import-china-lcl (default)", mapCalculatorModeToServiceSlug("sea" as TabMode, null), "import-china-lcl");
assertEq("truck → import-china-truck", mapCalculatorModeToServiceSlug("truck" as TabMode), "import-china-truck");
assertEq("air → import-china-air", mapCalculatorModeToServiceSlug("air" as TabMode), "import-china-air");
assertEq("customs → customs-clearance", mapCalculatorModeToServiceSlug("customs" as TabMode), "customs-clearance");
assertEq("sourcing → china-shopping", mapCalculatorModeToServiceSlug("sourcing" as TabMode), "china-shopping");
assertEq("remit → yuan-transfer", mapCalculatorModeToServiceSlug("remit" as TabMode), "yuan-transfer");
assertEq("unknown mode → null", mapCalculatorModeToServiceSlug("nope" as TabMode), null);

// ── INTEGRITY: every slug the mapper emits is a real config key ──
section("mapper ↔ config integrity (no dead /book/<slug>)");
const modes: TabMode[] = (["sea", "truck", "air", "customs", "sourcing", "remit"] as string[]) as TabMode[];
for (const m of modes) {
  const slug = mapCalculatorModeToServiceSlug(m);
  assertTrue(`mode "${m}" → "${slug}" resolves to a real ServiceConfig`, !!slug && getServiceConfig(slug) !== null);
}

// ── getServiceConfig — null safety ──
section("getServiceConfig");
assertEq("null → null", getServiceConfig(null), null);
assertEq("undefined → null", getServiceConfig(undefined), null);
assertEq("unknown slug → null", getServiceConfig("not-a-service"), null);
assertEq("known slug → its own config (slug matches)", getServiceConfig("customs-clearance")?.slug, "customs-clearance");

// ── listBookableServices — self-consistency ──
section("listBookableServices");
const all = listBookableServices();
assertTrue("returns a non-empty list", all.length > 0);
assertTrue("every entry's slug round-trips through getServiceConfig", all.every((c) => getServiceConfig(c.slug)?.slug === c.slug));
assertTrue("every entry has a TH title + 3-step howItWorks", all.every((c) => c.titleTh.length > 0 && c.howItWorksTh.length === 3));

console.log(`\n${fail === 0 ? "✅" : "❌"} booking/service-config: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
