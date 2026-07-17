/**
 * REGRESSION LOCK — เหมาๆ ฿100 on a SPLIT-BOX shipment: charged exactly ONCE, never zero,
 * never twice, no matter how the bill / pay-batch is sliced.
 *
 * owner 2026-07-16: "จ่ายแทนลูกค้า /admin/forwarders/52474 เอกสารมันไม่แจงค่าเหมาๆ ·
 * ระวังไปเก็บซ้ำด้วยนะครับเหมาๆ เหมือนเดิมครับ อย่าให้เกิดขึ้นอีก"
 *
 * THE TWO FAILURE MODES this pins (they pull in opposite directions — that is why the
 * fix was deferred once, and why the matrix below exists):
 *
 *   DROP   — the engine anchored the fee on the bare BASE row and "a -N box sub-row NEVER
 *            anchors". A MOMO split-at-commit shipment has NO base row (JYM800120650588
 *            exists only as -1/4 … -4/4) → nothing anchors → ฿0. PR139 was collected
 *            1,085.55 against its own 1,184.54 bill (฿98.99 short = ฿100 − 1% WHT), and
 *            staff hand-patched ฿100 into delivery_th_thb where nothing itemises it.
 *   DOUBLE — electing "the lowest -N IN THE BATCH" would fix the drop and re-open the
 *            owner's fear: bill A(-1,-4) → ฿100, bill B(-3,-4) → ฿100 = ฿200 for one ลอบส่ง.
 *
 * THE FIX: the carrier is elected from the SHIPMENT (resolveMaoAnchorIds reads every
 * sibling in the DB → base row if it exists, else the lowest-suffix sibling) and handed to
 * the engine as `maoAnchorIds`. A batch fires the fee iff it CONTAINS that one row — so two
 * batches can never both fire it, by construction.
 */
import assert from "node:assert/strict";
import { computeForwarderDebitBatch, type ForwarderDebitRow } from "./forwarder-debit-total";
import { MAO_FLAT_FEE } from "./mao-fee";

let checks = 0;
function ok(name: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ✓ ${name}`);
}

/** A เหมาๆ-eligible row: PCSF carrier + no Thai leg of its own. */
const row = (id: number, tracking: string, freight: number): ForwarderDebitRow =>
  ({
    id,
    ftrackingchn: tracking,
    fshipby: "PCSF",
    ftransportprice: 0,
    ftotalprice: freight,
    paymethod: "1",
  }) as unknown as ForwarderDebitRow;

const mao = (rows: ForwarderDebitRow[], anchors?: number[]) =>
  computeForwarderDebitBatch(rows, {
    userId: "PR139",
    isCorporate: false,
    ...(anchors ? { maoAnchorIds: new Set(anchors) } : {}),
  }).lines.reduce((s, l) => s + l.breakdown.maoFee, 0);

console.log("mao-anchor-split.test.ts — เหมาๆ once per shipment (owner 2026-07-16)");

// ── the exact prod shape that broke: PR139 / JYM800120650588, no bare base row ──
const B = "JYM800120650588";
const r1 = row(52474, `${B}-1/4`, 161.5);
const r2 = row(52489, `${B}-2/4`, 178.5);
const r3 = row(52485, `${B}-3/4`, 442.0);
const r4 = row(52475, `${B}-4/4`, 314.5);
// resolveMaoAnchorIds elects the lowest suffix when the shipment has no base row.
const ELECTED = [52474];

ok("REGRESSION: no election → the whole split shipment drops the fee (the bug)", () => {
  assert.equal(mao([r1, r2, r3, r4]), 0);
});

ok("with the per-shipment election → exactly ฿100 once", () => {
  assert.equal(mao([r1, r2, r3, r4], ELECTED), MAO_FLAT_FEE);
});

ok("🔴 CANNOT DOUBLE: bill A(-1,-4) fires · bill B(-3,-2) does not → ฿100 total", () => {
  const a = mao([r1, r4], ELECTED);
  const b = mao([r3, r2], ELECTED);
  assert.equal(a, MAO_FLAT_FEE);
  assert.equal(b, 0);
  assert.equal(a + b, MAO_FLAT_FEE);
});

ok("🔴 CANNOT DOUBLE: paying every box SOLO still totals ฿100", () => {
  const total = [r1, r2, r3, r4].reduce((s, r) => s + mao([r], ELECTED), 0);
  assert.equal(total, MAO_FLAT_FEE);
});

ok("a batch without the carrier never fires (under-charge, never over)", () => {
  assert.equal(mao([r2, r3, r4], ELECTED), 0);
});

// ── the shipment that HAS a base row must behave exactly as before ──
const C = "1783582423";
const cBase = row(52511, C, 247);
const cS2 = row(52541, `${C}-2`, 30.9);
const cS3 = row(52542, `${C}-3`, 35);

ok("base-bearing shipment: election picks the base → same as legacy", () => {
  assert.equal(mao([cBase, cS2, cS3]), MAO_FLAT_FEE);              // legacy path
  assert.equal(mao([cBase, cS2, cS3], [52511]), MAO_FLAT_FEE);     // elected path — identical
});

ok("base-bearing shipment: a siblings-only bill still fires nothing (unchanged)", () => {
  assert.equal(mao([cS2, cS3]), 0);
  assert.equal(mao([cS2, cS3], [52511]), 0);
});

// ── guards that must survive ──
ok("one ฿100 per BATCH even when it spans TWO shipments (per-bill rule kept)", () => {
  assert.equal(mao([r1, r2, cBase, cS2], [52474, 52511]), MAO_FLAT_FEE);
});

ok("a row with its own Thai leg is not เหมาๆ-eligible → never anchors", () => {
  const courier = { ...row(1, "AAA-1/2", 100), ftransportprice: 165 } as ForwarderDebitRow;
  assert.equal(mao([courier], [1]), 0);
});

ok("PCS999 stays exempt even when elected", () => {
  const total = computeForwarderDebitBatch([r1, r2], {
    userId: "PCS999",
    isCorporate: false,
    maoAnchorIds: new Set(ELECTED),
  }).lines.reduce((s, l) => s + l.breakdown.maoFee, 0);
  assert.equal(total, 0);
});

console.log(`\n✅ mao-anchor-split.test.ts — ${checks} checks passed`);
