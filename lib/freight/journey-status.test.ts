/**
 * Freight CUSTOMER-JOURNEY SOT (lib/freight/journey-status) — unit tests.
 *
 * Locks the three load-bearing customer-safety guarantees:
 *   1) the internal `draft` status is NEVER customer-visible
 *   2) only the 5 journey stages are returned (no raw-enum leak)
 *   3) a `cancelled`/held job NEVER shows the raw word — it pauses + shows a
 *      friendly hold note; and milestone dates are only the ones the schema
 *      actually stamps (no invented ETD/ETA).
 *
 * Run:  pnpm tsx lib/freight/journey-status.test.ts   (wired into pnpm test)
 */

import {
  isCustomerVisible,
  resolveJourney,
  CUSTOMER_VISIBLE_STATUSES,
  JOURNEY_STAGES,
  FREIGHT_JOURNEY_STAGE_KEYS,
  type JourneyTimestamps,
} from "./journey-status";
import { FREIGHT_SHIPMENT_STATUSES } from "@/lib/validators/freight-shipment";

let pass = 0;
let fail = 0;
function assertEq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`); }
}
function section(name: string) { console.log(`\n${name}`); }

const NO_TS: JourneyTimestamps = { created_at: null, confirmed_at: null, delivered_at: null };
const FULL_TS: JourneyTimestamps = {
  created_at:   "2026-06-01T00:00:00Z",
  confirmed_at: "2026-06-02T00:00:00Z",
  delivered_at: "2026-06-10T00:00:00Z",
};

// ── (a) draft is the ONLY hidden status ──────────────────────────────────────
section("(a) customer visibility — draft hidden, rest visible");
assertEq("draft → not visible", isCustomerVisible("draft"), false);
assertEq("confirmed → visible", isCustomerVisible("confirmed"), true);
assertEq("in_progress → visible", isCustomerVisible("in_progress"), true);
assertEq("cleared → visible", isCustomerVisible("cleared"), true);
assertEq("delivered → visible", isCustomerVisible("delivered"), true);
assertEq("cancelled → visible (as a friendly hold)", isCustomerVisible("cancelled"), true);
// every raw status accounted for: visible iff not draft
for (const s of FREIGHT_SHIPMENT_STATUSES) {
  assertEq(`visible(${s}) == (s !== draft)`, isCustomerVisible(s), s !== "draft");
}
assertEq("CUSTOMER_VISIBLE_STATUSES excludes draft", CUSTOMER_VISIBLE_STATUSES.includes("draft"), false);

// ── (b) the journey always returns exactly the 5 stage keys (no enum leak) ───
section("(b) resolveJourney returns only the 5 journey stages");
for (const s of FREIGHT_SHIPMENT_STATUSES) {
  const j = resolveJourney(s, NO_TS);
  assertEq(`${s}: 5 stages`, j.stages.length, 5);
  assertEq(`${s}: stage keys`, j.stages.map((x) => x.key), [...FREIGHT_JOURNEY_STAGE_KEYS]);
}
assertEq("JOURNEY_STAGES count", JOURNEY_STAGES.length, 5);

// ── (c) progression — done/current/upcoming indices ──────────────────────────
section("(c) progression markers per status");
{
  const j = resolveJourney("confirmed", NO_TS);
  assertEq("confirmed currentIndex", j.currentIndex, 1);
  assertEq("confirmed: booked done", j.stages[0].state, "done");
  assertEq("confirmed: confirmed current", j.stages[1].state, "current");
  assertEq("confirmed: in_transit upcoming", j.stages[2].state, "upcoming");
}
{
  const j = resolveJourney("in_progress", NO_TS);
  assertEq("in_progress currentIndex", j.currentIndex, 2);
  assertEq("in_progress: in_transit current", j.stages[2].state, "current");
}
{
  const j = resolveJourney("cleared", NO_TS);
  assertEq("cleared currentIndex", j.currentIndex, 3);
  assertEq("cleared: customs current", j.stages[3].state, "current");
}
{
  const j = resolveJourney("delivered", FULL_TS);
  assertEq("delivered currentIndex", j.currentIndex, 4);
  assertEq("delivered: all but last done", j.stages.slice(0, 4).every((x) => x.state === "done"), true);
  assertEq("delivered: last current", j.stages[4].state, "current");
}

// ── (d) draft = preparing, no stage reached, no hold note ────────────────────
section("(d) draft → preparing placeholder, currentIndex -1");
{
  const j = resolveJourney("draft", NO_TS);
  assertEq("draft isPreparing", j.isPreparing, true);
  assertEq("draft currentIndex", j.currentIndex, -1);
  assertEq("draft no hold note", j.holdNote, null);
  assertEq("draft: all stages upcoming", j.stages.every((x) => x.state === "upcoming"), true);
}

// ── (e) cancelled/held — friendly note, paused stages, NEVER 'cancelled' word ─
section("(e) cancelled → hold note + paused (no raw label leak)");
{
  const j = resolveJourney("cancelled", FULL_TS);
  assertEq("cancelled hold note kind", j.holdNote?.kind, "hold");
  assertEq("cancelled hold messageKey", j.holdNote?.messageKey, "journeyHeldNote");
  assertEq("cancelled: booked still done", j.stages[0].state, "done");
  assertEq("cancelled: confirmed frozen current", j.stages[1].state, "current");
  assertEq("cancelled: transit paused (not upcoming)", j.stages[2].state, "paused");
  assertEq("cancelled: customs paused", j.stages[3].state, "paused");
  assertEq("cancelled: delivered paused", j.stages[4].state, "paused");
  // no stage label/key is the raw enum word 'cancelled'
  assertEq("no stage key == 'cancelled'", j.stages.some((x) => (x.key as string) === "cancelled"), false);
}

// ── (f) in_progress shows the gentle clearance-ahead note ────────────────────
section("(f) in_progress → clearance-ahead note");
{
  const j = resolveJourney("in_progress", NO_TS);
  assertEq("in_progress note kind", j.holdNote?.kind, "customs_pending");
  assertEq("in_progress note key", j.holdNote?.messageKey, "journeyClearanceAheadNote");
}

// ── (g) milestone dates — only stamped ones; never invented ──────────────────
section("(g) milestone dates resolve only from real stamps");
{
  const j = resolveJourney("delivered", FULL_TS);
  assertEq("booked date = created_at", j.stages[0].date, FULL_TS.created_at);
  assertEq("confirmed date = confirmed_at", j.stages[1].date, FULL_TS.confirmed_at);
  assertEq("in_transit date = null (no stamp)", j.stages[2].date, null);
  assertEq("customs date = null (no stamp)", j.stages[3].date, null);
  assertEq("delivered date = delivered_at", j.stages[4].date, FULL_TS.delivered_at);
}
{
  const j = resolveJourney("confirmed", NO_TS);
  assertEq("no stamps → all dates null", j.stages.every((x) => x.date === null), true);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} freight journey-status: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
