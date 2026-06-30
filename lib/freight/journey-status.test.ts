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
  resolveJourneyFromCode,
  resolveCustomerJourney,
  customerLadderIndexOf,
  customerJobStatusLabel,
  parseJourneyCode,
  parseIssueFlag,
  CUSTOMER_VISIBLE_STATUSES,
  JOURNEY_STAGES,
  FREIGHT_JOURNEY_STAGE_KEYS,
  type JourneyTimestamps,
  type RichJourneyTimestamps,
} from "./journey-status";
import { FREIGHT_SHIPMENT_STATUSES } from "@/lib/validators/freight-shipment";
import { ALL_JOURNEY_CODES, JOURNEY_CODE_META } from "./journey-catalog";

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

// ════════════════════════════════════════════════════════════════════════════
// 4) journey_status → customer ladder (the rich-journey projection · SOT)
// ════════════════════════════════════════════════════════════════════════════

const NO_RICH_TS: RichJourneyTimestamps = {
  created_at: null, confirmed_at: null, delivered_at: null,
};

// ── (h) parsing — unknown values are treated as absent ───────────────────────
section("(h) parseJourneyCode / parseIssueFlag normalise raw text");
assertEq("known code parses", parseJourneyCode("AT_BORDER"), "AT_BORDER");
assertEq("unknown code → null", parseJourneyCode("NOPE"), null);
assertEq("empty code → null", parseJourneyCode(""), null);
assertEq("null code → null", parseJourneyCode(null), null);
assertEq("known flag parses", parseIssueFlag("delay"), "delay");
assertEq("unknown flag → none", parseIssueFlag("boom"), "none");
assertEq("null flag → none", parseIssueFlag(null), "none");

// ── (i) NO INTERNAL-STEP LEAK — internal codes never get a customer ladder idx
//        and never surface a currentJourneyLabelTh (the #1 invariant). ─────────
section("(i) internal (showCustomer=false) codes never leak a step label");
for (const code of ALL_JOURNEY_CODES) {
  const meta = JOURNEY_CODE_META[code];
  if (!meta.showCustomer) {
    assertEq(`${code}: customerLadderIndexOf == null (internal)`, customerLadderIndexOf(code), null);
    const j = resolveJourneyFromCode(code, "none", NO_RICH_TS);
    assertEq(`${code}: no currentJourneyLabelTh leak`, j.currentJourneyLabelTh, null);
    // the projected ladder still only ever uses the 5 known stage keys
    assertEq(`${code}: only 5 stage keys`, j.stages.map((s) => s.key), [...FREIGHT_JOURNEY_STAGE_KEYS]);
  }
}
// and a customer-visible (non-cancelled) code DOES surface its friendly label
section("(i2) customer-visible codes surface the rich customerLabelTh");
{
  const j = resolveJourneyFromCode("AT_BORDER", "none", NO_RICH_TS);
  assertEq("AT_BORDER currentJourneyLabelTh", j.currentJourneyLabelTh, JOURNEY_CODE_META.AT_BORDER.customerLabelTh);
  assertEq("AT_BORDER label is friendly (not internal labelTh)", j.currentJourneyLabelTh, "ถึงด่านชายแดน");
}
{
  // a customer-visible code maps onto a known ladder index 0..4
  for (const code of ALL_JOURNEY_CODES) {
    const idx = customerLadderIndexOf(code);
    if (idx !== null) {
      assertEq(`${code}: ladder idx in 0..4`, idx >= 0 && idx <= 4, true);
    }
  }
}

// ── (j) the projection maps the rich phases onto the 5-stage ladder ──────────
section("(j) journey code → customer ladder index");
assertEq("PENDING → booked(0)",            customerLadderIndexOf("PENDING"), 0);
assertEq("AWAIT_CONFIRM → booked(0)",      customerLadderIndexOf("AWAIT_CONFIRM"), 0);
assertEq("CONFIRMED → confirmed(1)",       customerLadderIndexOf("CONFIRMED"), 1);
assertEq("PREP_DOCS → confirmed(1)",       customerLadderIndexOf("PREP_DOCS"), 1);
assertEq("AT_CN_WAREHOUSE → confirmed(1)", customerLadderIndexOf("AT_CN_WAREHOUSE"), 1);
assertEq("IN_TRANSIT → in_transit(2)",     customerLadderIndexOf("IN_TRANSIT"), 2);
assertEq("AT_BORDER → in_transit(2)",      customerLadderIndexOf("AT_BORDER"), 2);
assertEq("AT_POD → customs(3)",            customerLadderIndexOf("AT_POD"), 3);
assertEq("TH_CUSTOMS → customs(3)",        customerLadderIndexOf("TH_CUSTOMS"), 3);
assertEq("AT_TH_WAREHOUSE → customs(3)",   customerLadderIndexOf("AT_TH_WAREHOUSE"), 3);
assertEq("AWAIT_PAYMENT → customs(3)",     customerLadderIndexOf("AWAIT_PAYMENT"), 3);
assertEq("DELIVERED → delivered(4)",       customerLadderIndexOf("DELIVERED"), 4);

// ── (k) progression markers from a rich code ─────────────────────────────────
section("(k) resolveJourneyFromCode progression");
{
  const j = resolveJourneyFromCode("IN_TRANSIT", "none", NO_RICH_TS);
  assertEq("IN_TRANSIT: 5 stages", j.stages.length, 5);
  assertEq("IN_TRANSIT currentIndex", j.currentIndex, 2);
  assertEq("IN_TRANSIT: booked done", j.stages[0].state, "done");
  assertEq("IN_TRANSIT: confirmed done", j.stages[1].state, "done");
  assertEq("IN_TRANSIT: in_transit current", j.stages[2].state, "current");
  assertEq("IN_TRANSIT: customs upcoming", j.stages[3].state, "upcoming");
  assertEq("IN_TRANSIT: not preparing", j.isPreparing, false);
  // in-transit ladder position → gentle clearance-ahead note
  assertEq("IN_TRANSIT note kind", j.holdNote?.kind, "customs_pending");
}
{
  const j = resolveJourneyFromCode("DELIVERED", "none", NO_RICH_TS);
  assertEq("DELIVERED currentIndex", j.currentIndex, 4);
  assertEq("DELIVERED: first 4 done", j.stages.slice(0, 4).every((s) => s.state === "done"), true);
  assertEq("DELIVERED: last current", j.stages[4].state, "current");
  assertEq("DELIVERED no hold note", j.holdNote, null);
}

// ── (l) RED issue_flag → friendly hold note + paused stages ──────────────────
section("(l) RED issue_flag → friendly note, NEVER the raw flag word");
for (const flag of ["delay", "hold", "problem"] as const) {
  const j = resolveJourneyFromCode("IN_TRANSIT", flag, NO_RICH_TS);
  assertEq(`${flag}: hold note kind == hold`, j.holdNote?.kind, "hold");
  assertEq(`${flag}: friendly messageKey`, j.holdNote?.messageKey, "journeyHeldNote");
  // stages beyond current are paused (not upcoming) when flagged
  assertEq(`${flag}: customs paused`, j.stages[3].state, "paused");
  assertEq(`${flag}: delivered paused`, j.stages[4].state, "paused");
}
{
  // none flag at a non-transit position → no hold note
  const j = resolveJourneyFromCode("CONFIRMED", "none", NO_RICH_TS);
  assertEq("CONFIRMED+none: no hold note", j.holdNote, null);
}

// ── (m) CANCELLED journey code — friendly note, never the raw 'ยกเลิก' label ──
section("(m) CANCELLED code → hold note + paused, no internal/cancelled leak");
{
  const j = resolveJourneyFromCode("CANCELLED", "none", FULL_TS as RichJourneyTimestamps);
  assertEq("CANCELLED hold note kind", j.holdNote?.kind, "hold");
  assertEq("CANCELLED hold messageKey", j.holdNote?.messageKey, "journeyHeldNote");
  assertEq("CANCELLED currentJourneyLabelTh hidden", j.currentJourneyLabelTh, null);
  assertEq("CANCELLED: booked done", j.stages[0].state, "done");
  assertEq("CANCELLED: confirmed current(frozen)", j.stages[1].state, "current");
  assertEq("CANCELLED: transit paused", j.stages[2].state, "paused");
  assertEq("no stage key == 'cancelled'", j.stages.some((s) => (s.key as string) === "cancelled"), false);
}

// ── (n) milestone dates — only real stamps, mapped onto the right stage ──────
section("(n) rich milestone dates decorate the correct stage; none invented");
{
  const ts: RichJourneyTimestamps = {
    created_at:              "2026-06-01T00:00:00Z",
    confirmed_at:            "2026-06-02T00:00:00Z",
    atd_at:                  "2026-06-04T00:00:00Z",
    th_cleared_at:           "2026-06-08T00:00:00Z",
    delivered_at:            "2026-06-10T00:00:00Z",
  };
  const j = resolveJourneyFromCode("DELIVERED", "none", ts);
  assertEq("booked date = created_at", j.stages[0].date, ts.created_at);
  assertEq("confirmed date = confirmed_at", j.stages[1].date, ts.confirmed_at);
  assertEq("in_transit date = atd_at (first move stamp)", j.stages[2].date, ts.atd_at);
  assertEq("customs date = th_cleared_at", j.stages[3].date, ts.th_cleared_at);
  assertEq("delivered date = delivered_at", j.stages[4].date, ts.delivered_at);
}
{
  // in-transit milestone falls back across atd → etd → departed
  const onlyDeparted: RichJourneyTimestamps = {
    created_at: null, confirmed_at: null, delivered_at: null,
    departed_at: "2026-06-05T00:00:00Z",
  };
  const j = resolveJourneyFromCode("IN_TRANSIT", "none", onlyDeparted);
  assertEq("in_transit date falls back to departed_at", j.stages[2].date, "2026-06-05T00:00:00Z");
}
{
  // customs milestone falls back across th_cleared → ata → arrived_th_warehouse
  const onlyAta: RichJourneyTimestamps = {
    created_at: null, confirmed_at: null, delivered_at: null,
    ata_at: "2026-06-07T00:00:00Z",
  };
  const j = resolveJourneyFromCode("AT_POD", "none", onlyAta);
  assertEq("customs date falls back to ata_at", j.stages[3].date, "2026-06-07T00:00:00Z");
}
{
  // no stamps → all dates null (never invented)
  const j = resolveJourneyFromCode("AT_BORDER", "none", NO_RICH_TS);
  assertEq("no stamps → all dates null", j.stages.every((s) => s.date === null), true);
}

// ── (o) resolveCustomerJourney — derive-from-code, fallback-to-6-state ───────
section("(o) resolveCustomerJourney: journey_status wins; null → 6-state");
{
  // journey_status set → derives from the rich code
  const j = resolveCustomerJourney({
    status: "confirmed", journeyStatus: "AT_BORDER", issueFlag: "none",
    timestamps: NO_RICH_TS,
  });
  assertEq("derived: currentIndex from code (2)", j.currentIndex, 2);
  assertEq("derived: rich label surfaced", j.currentJourneyLabelTh, "ถึงด่านชายแดน");
}
{
  // journey_status null → fall back to the 6-state ladder
  const j = resolveCustomerJourney({
    status: "in_progress", journeyStatus: null, issueFlag: null,
    timestamps: NO_RICH_TS,
  });
  assertEq("fallback: currentIndex from 6-state (2)", j.currentIndex, 2);
  assertEq("fallback: no rich label", j.currentJourneyLabelTh, null);
  assertEq("fallback: clearance-ahead note", j.holdNote?.kind, "customs_pending");
}
{
  // unknown journey_status string → fall back to the 6-state
  const j = resolveCustomerJourney({
    status: "delivered", journeyStatus: "GARBAGE", issueFlag: null,
    timestamps: FULL_TS as RichJourneyTimestamps,
  });
  assertEq("unknown code → 6-state fallback (delivered=4)", j.currentIndex, 4);
}

// ── (p) customerJobStatusLabel — list chip derives from journey_status ───────
section("(p) customerJobStatusLabel derives from journey_status, falls back");
assertEq("null journey → 6-state label", customerJobStatusLabel("in_progress", null), "กำลังขนส่ง");
assertEq("unknown journey → 6-state label", customerJobStatusLabel("confirmed", "NOPE"), "ยืนยันแล้ว");
assertEq("IN_TRANSIT code → main label", customerJobStatusLabel("confirmed", "IN_TRANSIT"), "อยู่ระหว่างขนส่ง");
assertEq("AT_TH_WAREHOUSE → ถึงปลายทาง", customerJobStatusLabel("in_progress", "AT_TH_WAREHOUSE"), "ถึงปลายทาง");
// internal BILLING/CLOSED collapse to the customer 'arrived' bucket (ถึงปลายทาง)
assertEq("BILLING (internal) → ถึงปลายทาง (collapsed)", customerJobStatusLabel("cleared", "BILLING"), "ถึงปลายทาง");
assertEq("CLOSED (internal) → ปิดงาน is hidden → ถึงปลายทาง", customerJobStatusLabel("delivered", "CLOSED"), "ถึงปลายทาง");
// CANCELLED journey → friendly, never the raw word
assertEq("CANCELLED journey → friendly label", customerJobStatusLabel("cancelled", "CANCELLED"), "ล่าช้า / รอเคลียร์");

console.log(`\n${fail === 0 ? "✅" : "❌"} freight journey-status: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
