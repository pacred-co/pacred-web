/**
 * REGRESSION LOCK — electMaoCarrier: WHICH row of a shipment may carry the เหมาๆ ฿100.
 *
 * owner 2026-07-16: "ระวังไปเก็บซ้ำด้วยนะครับเหมาๆ เหมือนเดิมครับ อย่าให้เกิดขึ้นอีก"
 *
 * The near-miss this file exists for (caught on prod data 2026-07-17, before deploy):
 * lifting the election from the BATCH to the SHIPMENT fixed the drop but re-opened a
 * DIFFERENT double-charge — prod `1783051207` (PR075) keeps its เหมาๆ as a ฿100
 * ftransportprice ON THE BASE ROW, with 19 zero-leg siblings. The naive per-shipment
 * election skips the base (its leg ≠ 0 → "not eligible") and elects a sibling → ฿100 on
 * top of the ฿100 already on the row = ฿200 for one ลอบส่ง.
 *
 * The rule these assertions pin: if ANY เหมาๆ row of the shipment already carries a Thai
 * leg, the shipment IS charged → elect nobody. Only a shipment where every เหมาๆ row has a
 * zero leg gets a carrier.
 */
import assert from "node:assert/strict";
import { electMaoCarrier, type MaoCandidateRow } from "./mao-anchor-plan";

let checks = 0;
function ok(name: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ✓ ${name}`);
}

const row = (
  id: number,
  ftrackingchn: string,
  ftransportprice: number,
  fshipby = "PCSF",
): MaoCandidateRow => ({ id, ftrackingchn, fshipby, ftransportprice });

console.log("mao-anchor-plan.test.ts — เหมาๆ carrier election (owner 2026-07-16)");

// ── the prod shape that would have double-charged ───────────────────────────
ok("🔴 PR075 1783051207: base already carries ฿100 leg → elect NOBODY (was: ฿200)", () => {
  const siblings = [
    row(52327, "1783051207", 100),      // the เหมาๆ, typed onto the base row
    row(52336, "1783051207-2", 0),
    row(52337, "1783051207-3", 0),
    row(52354, "1783051207-20", 0),
  ];
  assert.equal(electMaoCarrier(siblings), null);
});

ok("a leg on ANY sibling (not just the base) also blocks the election", () => {
  assert.equal(electMaoCarrier([row(1, "AAA-1", 0), row(2, "AAA-2", 100)]), null);
});

// ── the prod shape that was dropping the fee ────────────────────────────────
ok("🔴 PR139 JYM800120650588: no base row, all legs 0 → elect the lowest suffix (-1)", () => {
  const siblings = [
    row(52475, "JYM800120650588-4/4", 0),
    row(52474, "JYM800120650588-1/4", 0),
    row(52485, "JYM800120650588-3/4", 0),
    row(52489, "JYM800120650588-2/4", 0),
  ];
  assert.equal(electMaoCarrier(siblings), 52474);
});

ok("order of the siblings never changes the election", () => {
  const a = [row(3, "B-3", 0), row(1, "B-1", 0), row(2, "B-2", 0)];
  const b = [row(1, "B-1", 0), row(2, "B-2", 0), row(3, "B-3", 0)];
  assert.equal(electMaoCarrier(a), electMaoCarrier(b));
});

// ── the common shape must be unchanged ──────────────────────────────────────
ok("shipment WITH a bare base (all legs 0) → the base carries it (= legacy)", () => {
  const siblings = [row(52541, "1783582423-2", 0), row(52511, "1783582423", 0), row(52542, "1783582423-3", 0)];
  assert.equal(electMaoCarrier(siblings), 52511);
});

ok("a single bare row, zero leg → it carries it", () => {
  assert.equal(electMaoCarrier([row(9, "SOLO", 0)]), 9);
});

// ── non-เหมาๆ shapes ────────────────────────────────────────────────────────
ok("no เหมาๆ carrier in the shipment → elect nobody", () => {
  assert.equal(electMaoCarrier([row(1, "X-1", 0, "2"), row(2, "X-2", 0, "PCS")]), null);
});

ok("PRF (the D1 rebrand of PCSF) is a เหมาๆ carrier too", () => {
  assert.equal(electMaoCarrier([row(7, "Y-1", 0, "PRF")]), 7);
});

ok("a Flash row with a real ฿165 leg alongside a PCSF zero-leg row → still no election", () => {
  // The PCSF row is zero-leg, but a เหมาๆ row with a leg exists? No — Flash isn't เหมาๆ,
  // so it must NOT block: the PCSF row still carries the flat fee.
  assert.equal(electMaoCarrier([row(1, "Z-1", 165, "2"), row(2, "Z-2", 0, "PCSF")]), 2);
});

ok("empty input → null (never throws)", () => {
  assert.equal(electMaoCarrier([]), null);
});

console.log(`\n✅ mao-anchor-plan.test.ts — ${checks} checks passed`);
