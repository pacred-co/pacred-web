import assert from "node:assert/strict";
import { buildContainerJourney, type JourneyForwarderRow } from "./container-journey";

let passed = 0;
function it(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

console.log("container-journey — buildContainerJourney:");

const NOW = new Date("2026-06-30T00:00:00Z");

function row(p: Partial<JourneyForwarderRow>): JourneyForwarderRow {
  return {
    fstatus: null,
    fdatecontainerclose: null,
    fdatestatus2: null, fdatestatus3: null, fdatestatus4: null,
    fdatestatus5: null, fdatestatus6: null, fdatestatus7: null,
    ...p,
  };
}

it("transport mode decodes from cabinet name (GZS = sea)", () => {
  const j = buildContainerJourney("GZS260601-1", "1", [row({ fstatus: "1" })], null, null, NOW);
  assert.equal(j.transportMode, "2"); // name wins over stored "1"
});

it("EK suffix decodes to road (1), not air", () => {
  const j = buildContainerJourney("CBX260616-EK08", null, [row({ fstatus: "1" })], null, null, NOW);
  assert.equal(j.transportMode, "1");
});

it("close stage uses fdatecontainerclose; ETD fallback when absent", () => {
  const a = buildContainerJourney("GZS1-1", "2", [row({ fstatus: "3", fdatecontainerclose: "2026-06-01 10:00:00" })], "2026-05-31", null, NOW);
  assert.equal(a.stages.find((s) => s.id === "close")!.date, "2026-06-01");
  const b = buildContainerJourney("GZS2-1", "2", [row({ fstatus: "1" })], "2026-05-31", null, NOW);
  assert.equal(b.stages.find((s) => s.id === "close")!.date, "2026-05-31");
});

it("godown stage = fdatestatus4 (warehouse arrival)", () => {
  const j = buildContainerJourney("GZS3-1", "2", [row({ fstatus: "4", fdatestatus4: "2026-06-20" })], null, null, NOW);
  const godown = j.stages.find((s) => s.id === "godown")!;
  assert.equal(godown.date, "2026-06-20");
});

it("customs stage NEVER gets a fabricated date (honest gap)", () => {
  const j = buildContainerJourney("GZS4-1", "2", [row({ fstatus: "3" })], null, "2026-06-20", NOW);
  const customs = j.stages.find((s) => s.id === "customs")!;
  assert.equal(customs.date, null);
});

it("arrive stage shows ETA as an ESTIMATE (isEstimate=true)", () => {
  const j = buildContainerJourney("GZS5-1", "2", [row({ fstatus: "3" })], null, "2026-07-10", NOW);
  const arrive = j.stages.find((s) => s.id === "arrive")!;
  assert.equal(arrive.date, "2026-07-10");
  assert.equal(arrive.isEstimate, true);
});

it("latest stamp across trackings wins (max date)", () => {
  const j = buildContainerJourney("GZS6-1", "2", [
    row({ fstatus: "4", fdatestatus4: "2026-06-18" }),
    row({ fstatus: "4", fdatestatus4: "2026-06-21" }),
  ], null, null, NOW);
  assert.equal(j.stages.find((s) => s.id === "godown")!.date, "2026-06-21");
});

it("stuck: ETA passed + not at godown → isStuck, daysOverdue computed", () => {
  const j = buildContainerJourney("GZS7-1", "2", [row({ fstatus: "3", fdatecontainerclose: "2026-06-01" })], "2026-06-01", "2026-06-20", NOW);
  assert.equal(j.isStuck, true);
  assert.equal(j.daysOverdue, 10); // 2026-06-20 → 2026-06-30
  assert.match(j.headline, /ตู้ค้าง/);
});

it("NOT stuck once goods reached the TH warehouse (fdatestatus4 set)", () => {
  const j = buildContainerJourney("GZS8-1", "2", [row({ fstatus: "4", fdatestatus4: "2026-06-19" })], "2026-06-01", "2026-06-20", NOW);
  assert.equal(j.isStuck, false);
  assert.equal(j.daysOverdue, null);
});

it("delivered container → currentStage deliver + done headline", () => {
  const j = buildContainerJourney("GZS9-1", "2", [
    row({ fstatus: "7", fdatecontainerclose: "2026-06-01", fdatestatus3: "2026-06-05", fdatestatus4: "2026-06-18", fdatestatus6: "2026-06-20", fdatestatus7: "2026-06-22" }),
  ], "2026-06-01", "2026-06-17", NOW);
  assert.equal(j.currentStageId, "deliver");
  assert.match(j.headline, /ส่งถึงลูกค้า/);
  assert.equal(j.stages.find((s) => s.id === "deliver")!.state, "current");
  assert.equal(j.stages.find((s) => s.id === "godown")!.state, "done");
});

it("current stage = highest reached; later stages pending", () => {
  const j = buildContainerJourney("GZS10-1", "2", [row({ fstatus: "3", fdatecontainerclose: "2026-06-01", fdatestatus3: "2026-06-05" })], "2026-06-01", "2026-07-15", NOW);
  // ETA is in the future → arrive not reached → current = transit
  assert.equal(j.currentStageId, "transit");
  assert.equal(j.stages.find((s) => s.id === "godown")!.state, "pending");
});

console.log(`\ncontainer-journey: ${passed} passed\n`);
