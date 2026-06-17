/**
 * computeShipmentFlip — shipment-aware warehouse-scan flip (owner ภูม 2026-06-18).
 * Locks the rule: scanning the bill-header counts toward the WHOLE shipment;
 * when scanned ≥ the carrier-declared total, EVERY eligible sibling flips → '4'.
 *
 * SAFETY — pure · no DB · no IO.
 * RUN:  pnpm tsx lib/forwarder/shipment-scan-flip.test.ts
 */

import assert from "node:assert/strict";
import { computeShipmentFlip, type ShipmentScanRow } from "./shipment-scan-flip";

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("computeShipmentFlip — shipment-aware warehouse scan flip");

// A MOMO shipment = bare header (weight 0, famount = total) + N box siblings.
function momoShipment(base: string, boxes: number, fstatus = "3"): ShipmentScanRow[] {
  const header: ShipmentScanRow = { id: 100, famount: boxes, fstatus, ftrackingchn: base, fweight: 0, userid: "PR1" };
  const subs: ShipmentScanRow[] = [];
  for (let i = 1; i <= boxes; i++) {
    subs.push({ id: 100 + i, famount: 1, fstatus, ftrackingchn: `${base}-${i}/${boxes}`, fweight: 2.5, userid: "PR1" });
  }
  return [header, ...subs];
}

it("MOMO bill-header scanned to the full count → flips ALL siblings + header", () => {
  const group = momoShipment("654321", 3);            // header(3) + 3 subs(1)
  const scans = new Map<number, number>([[100, 3]]);  // staff scanned the header 3x
  const r = computeShipmentFlip(group, scans);
  assert.equal(r.total, 3);
  assert.equal(r.scanned, 3);
  assert.equal(r.shouldFlip, true);
  assert.deepEqual([...r.eligibleIds].sort((a, b) => a - b), [100, 101, 102, 103]);
});

it("under-count → no flip", () => {
  const r = computeShipmentFlip(momoShipment("654321", 5), new Map([[100, 4]]));
  assert.equal(r.total, 5);
  assert.equal(r.scanned, 4);
  assert.equal(r.shouldFlip, false);
});

it("scans spread across subs accumulate toward the shipment total", () => {
  const group = momoShipment("654321", 2);
  const r = computeShipmentFlip(group, new Map([[101, 1], [102, 1]]));
  assert.equal(r.scanned, 2);
  assert.equal(r.shouldFlip, true);
});

it("single non-MOMO row (no header) → counts vs its own famount", () => {
  const group: ShipmentScanRow[] = [
    { id: 7, famount: 10, fstatus: "3", ftrackingchn: "SF999", fweight: 30, userid: "PR2" },
  ];
  assert.equal(computeShipmentFlip(group, new Map([[7, 9]])).shouldFlip, false);
  assert.equal(computeShipmentFlip(group, new Map([[7, 10]])).shouldFlip, true);
});

it("paid sibling excluded from the flip set; credit-6 included", () => {
  const group: ShipmentScanRow[] = [
    { id: 1, famount: 3, fstatus: "3", ftrackingchn: "T1", fweight: 0, userid: "P" },        // header
    { id: 2, famount: 1, fstatus: "3", ftrackingchn: "T1-1/3", fweight: 1, userid: "P" },
    { id: 3, famount: 1, fstatus: "5", ftrackingchn: "T1-2/3", fweight: 1, userid: "P" },    // paid → excluded
    { id: 4, famount: 1, fstatus: "6", fcredit: "1", ftrackingchn: "T1-3/3", fweight: 1, userid: "P" }, // credit-6 → included
  ];
  const r = computeShipmentFlip(group, new Map([[1, 3]]));
  assert.equal(r.shouldFlip, true);
  assert.deepEqual([...r.eligibleIds].sort((a, b) => a - b), [1, 2, 4]);
});

it("declared header total wins when subs aren't all split yet", () => {
  // header says 5, but only 2 box-siblings exist → still need 5 scans.
  const group: ShipmentScanRow[] = [
    { id: 1, famount: 5, fstatus: "3", ftrackingchn: "X1", fweight: 0, userid: "P" },
    { id: 2, famount: 1, fstatus: "3", ftrackingchn: "X1-1/5", fweight: 1, userid: "P" },
    { id: 3, famount: 1, fstatus: "3", ftrackingchn: "X1-2/5", fweight: 1, userid: "P" },
  ];
  assert.equal(computeShipmentFlip(group, new Map([[1, 5]])).total, 5);
  assert.equal(computeShipmentFlip(group, new Map([[1, 4]])).shouldFlip, false);
  assert.equal(computeShipmentFlip(group, new Map([[1, 5]])).shouldFlip, true);
});

it("empty group → safe no-op", () => {
  const r = computeShipmentFlip([], new Map());
  assert.equal(r.shouldFlip, false);
  assert.equal(r.total, 0);
});

console.log(`\n✅ ${passed} tests passed`);
