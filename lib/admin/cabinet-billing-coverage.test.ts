import assert from "node:assert/strict";
import {
  computeCabinetBillingCoverage,
  rollupCabinetCoverages,
  buildCoverageAdvisory,
  type CabinetBillingCoverage,
} from "./cabinet-billing-coverage";
import { filterCountableForwarderRows } from "./momo-bill-header";

const cov = (over: Partial<CabinetBillingCoverage> & { state: CabinetBillingCoverage["state"] }): CabinetBillingCoverage => ({
  cabinet: "X", totalRows: 1, billedRows: over.state === "covered" ? 1 : 0, billedForRealThb: 0,
  storedCostThb: 0, chipLabel: "", remainingRows: 0, ...over,
});

// ── ครบ: every row has a real invoice line ───────────────────────────────
{
  const c = computeCabinetBillingCoverage({
    cabinet: "GZE260707-1",
    rows: [
      { fid: 1, storedCost: 2500 },
      { fid: 2, storedCost: 4700 },
    ],
    lines: [
      { fid: 1, amount: 2500 },
      { fid: 2, amount: 4700 },
    ],
  });
  assert.equal(c.state, "covered", "all billed → covered");
  assert.equal(c.chipLabel, "ครบ");
  assert.equal(c.totalRows, 2);
  assert.equal(c.billedRows, 2);
  assert.equal(c.remainingRows, 0);
  assert.equal(c.billedForRealThb, 7200);
  assert.equal(c.storedCostThb, 7200);
}

// ── ขาด X/Y: MOMO billed some rows (the partial-round overpay risk) ───────
{
  // GZS260620-2 shape (prod 2026-07-17): invoice bills 3 of 7 rows.
  const c = computeCabinetBillingCoverage({
    cabinet: "GZS260620-2",
    rows: [
      { fid: 10, storedCost: 3000 },
      { fid: 11, storedCost: 3500 },
      { fid: 12, storedCost: 4358.25 },
      { fid: 13, storedCost: 2153.02 }, // estimated — MOMO not billed yet
      { fid: 14, storedCost: 2153.02 }, // estimated
      { fid: 15, storedCost: 2153.02 }, // estimated
      { fid: 16, storedCost: 2153.02 }, // estimated
    ],
    lines: [
      { fid: 10, amount: 3000 },
      { fid: 11, amount: 3500 },
      { fid: 12, amount: 4358.25 },
    ],
  });
  assert.equal(c.state, "partial", "3/7 billed → partial");
  assert.equal(c.chipLabel, "ขาด 3/7");
  assert.equal(c.billedRows, 3);
  assert.equal(c.remainingRows, 4);
  assert.equal(c.billedForRealThb, 10858.25, "Σ real = the 3 billed lines");
  assert.equal(c.storedCostThb, 19470.33, "Σ stored includes the 4 estimated rows");
}

// ── 🔴 no fake ขาด: zero invoice lines ⇒ no_invoice_data, NEVER "0/Y ขาด" ──
{
  const c = computeCabinetBillingCoverage({
    cabinet: "GZS260101-1",
    rows: [
      { fid: 20, storedCost: 2500 }, // legacy/estimated cost, no invoice line
      { fid: 21, storedCost: 2500 },
    ],
    lines: [],
  });
  assert.equal(c.state, "no_invoice_data", "no lines → no_invoice_data (not partial)");
  assert.equal(c.chipLabel, "ยังไม่มีข้อมูลใบ");
  assert.notEqual(c.chipLabel, "ขาด 0/2", "must NEVER render a fake 0/Y ขาด");
  assert.equal(c.billedRows, 0);
  assert.equal(c.billedForRealThb, 0);
  assert.equal(c.storedCostThb, 5000, "stored cost still visible");
}

// ── extra/foreign lines (other containers) are ignored ───────────────────
{
  const c = computeCabinetBillingCoverage({
    cabinet: "GZE260101-1",
    rows: [{ fid: 30, storedCost: 2500 }],
    lines: [
      { fid: 30, amount: 2500 },
      { fid: 999, amount: 99999 }, // belongs to another container — must be ignored
    ],
  });
  assert.equal(c.state, "covered");
  assert.equal(c.billedRows, 1, "foreign fid ignored");
  assert.equal(c.billedForRealThb, 2500, "foreign amount not summed");
}

// ── re-bill safety: two lines for ONE fid (corrected invoice) never double-count
{
  const c = computeCabinetBillingCoverage({
    cabinet: "GZE260202-1",
    rows: [
      { fid: 40, storedCost: 3000 },
      { fid: 41, storedCost: 3000 },
    ],
    lines: [
      { fid: 40, amount: 2800 }, // first invoice
      { fid: 40, amount: 3000 }, // corrected re-bill (new invoice_no) — same fid
      { fid: 41, amount: 3000 },
    ],
  });
  assert.equal(c.billedRows, 2, "fid 40 counts once despite 2 lines");
  assert.equal(c.billedForRealThb, 6000, "Σ dedupes per fid (max 3000) + 3000 — no double-count");
  assert.equal(c.state, "covered");
}

// ── order-independence (max-per-fid is deterministic) ────────────────────
{
  const forward = computeCabinetBillingCoverage({
    cabinet: "X",
    rows: [{ fid: 50, storedCost: 100 }],
    lines: [{ fid: 50, amount: 40 }, { fid: 50, amount: 90 }],
  });
  const reversed = computeCabinetBillingCoverage({
    cabinet: "X",
    rows: [{ fid: 50, storedCost: 100 }],
    lines: [{ fid: 50, amount: 90 }, { fid: 50, amount: 40 }],
  });
  assert.deepEqual(forward, reversed, "coverage is independent of line order");
}

// ── empty container (defensive) ──────────────────────────────────────────
{
  const c = computeCabinetBillingCoverage({ cabinet: "EMPTY", rows: [], lines: [] });
  assert.equal(c.state, "no_invoice_data", "no rows → no_invoice_data (never crashes)");
  assert.equal(c.totalRows, 0);
  assert.equal(c.billedRows, 0);
}

// ── buildCoverageAdvisory: only partial cabinets warn ────────────────────
{
  const covered: CabinetBillingCoverage = {
    cabinet: "A", totalRows: 2, billedRows: 2, billedForRealThb: 5000, storedCostThb: 5000,
    state: "covered", chipLabel: "ครบ", remainingRows: 0,
  };
  const partial: CabinetBillingCoverage = {
    cabinet: "B", totalRows: 7, billedRows: 3, billedForRealThb: 10858.25, storedCostThb: 19470.33,
    state: "partial", chipLabel: "ขาด 3/7", remainingRows: 4,
  };
  const noData: CabinetBillingCoverage = {
    cabinet: "C", totalRows: 2, billedRows: 0, billedForRealThb: 0, storedCostThb: 5000,
    state: "no_invoice_data", chipLabel: "ยังไม่มีข้อมูลใบ", remainingRows: 0,
  };

  assert.equal(buildCoverageAdvisory([covered]), null, "all covered → no advisory");
  assert.equal(buildCoverageAdvisory([noData]), null, "no_invoice_data alone → no advisory (not a false accusation)");
  assert.equal(buildCoverageAdvisory([]), null, "empty → no advisory");

  const msg = buildCoverageAdvisory([covered, partial, noData]);
  assert.ok(msg && msg.includes("ตู้ B"), "advisory names the partial cabinet");
  assert.ok(msg && msg.includes("3/7"), "advisory shows billed/total");
  assert.ok(msg && msg.includes("ตัดจ่ายตู้ละครั้งเดียว"), "advisory carries the once-only consequence");
  assert.ok(msg && !msg.includes("ตู้ A"), "advisory does NOT warn on the covered cabinet");
}

// ── rollupCabinetCoverages: one chip for a payment row spanning many ตู้ ──
{
  // all covered
  const allCovered = rollupCabinetCoverages([cov({ state: "covered" }), cov({ state: "covered" })]);
  assert.equal(allCovered.state, "covered");
  assert.equal(allCovered.chipLabel, "ครบ 2 ตู้");

  // one partial → partial chip counts cabinets, never a fake row X/Y
  const withPartial = rollupCabinetCoverages([
    cov({ state: "covered" }),
    cov({ state: "partial" }),
    cov({ state: "covered" }),
  ]);
  assert.equal(withPartial.state, "partial");
  assert.equal(withPartial.chipLabel, "ขาด 1/3 ตู้");

  // all no-data → no_invoice_data (no fake ขาด)
  const allNoData = rollupCabinetCoverages([cov({ state: "no_invoice_data" }), cov({ state: "no_invoice_data" })]);
  assert.equal(allNoData.state, "no_invoice_data");
  assert.equal(allNoData.chipLabel, "ยังไม่มีข้อมูลใบ");

  // mixed covered + no-data (no partial) → flag WITHOUT a false ขาด
  const mixed = rollupCabinetCoverages([cov({ state: "covered" }), cov({ state: "no_invoice_data" })]);
  assert.equal(mixed.state, "partial");
  assert.equal(mixed.chipLabel, "มีใบ 1/2 ตู้");

  // single cabinet passes through its own chipLabel
  const single = rollupCabinetCoverages([cov({ state: "partial", chipLabel: "ขาด 3/7" })]);
  assert.equal(single.chipLabel, "ขาด 3/7");

  // empty → no_invoice_data (never crashes)
  assert.equal(rollupCabinetCoverages([]).state, "no_invoice_data");
}

// ── MOMO bare หัวบิล is dropped from the denominator (review WARN 2026-07-21) ──
// The loader feeds rows through filterCountableForwarderRows(money=fcosttotalprice)
// before the pure core. A split container's bare zero-cost header must NOT inflate Y
// (else every fully-billed split container reads a perpetual false "ขาด X/Y").
{
  type Raw = { id: number; ftrackingchn: string; fweight: number; userid: string; fcosttotalprice: number };
  const raws: Raw[] = [
    // bare header, NO cost, has -N/M siblings → placeholder MOMO never invoices
    { id: 10, ftrackingchn: "1780555730", fweight: 0, userid: "PR050", fcosttotalprice: 0 },
    { id: 11, ftrackingchn: "1780555730-1/2", fweight: 16.5, userid: "PR050", fcosttotalprice: 89 },
    { id: 12, ftrackingchn: "1780555730-2/2", fweight: 20.0, userid: "PR050", fcosttotalprice: 89 },
  ];
  const countable = filterCountableForwarderRows(raws, {
    tracking: (r) => r.ftrackingchn,
    weight: (r) => r.fweight,
    userid: (r) => r.userid,
    money: (r) => r.fcosttotalprice,
  });
  assert.equal(countable.length, 2, "bare zero-cost header dropped from the denominator");
  const c = computeCabinetBillingCoverage({
    cabinet: "GZE260707-1",
    rows: countable.map((r) => ({ fid: r.id, storedCost: r.fcosttotalprice })),
    lines: [
      { fid: 11, amount: 89 },
      { fid: 12, amount: 89 },
    ],
  });
  assert.equal(c.state, "covered", "split container with both boxes billed = ครบ (not a false ขาด 2/3)");
  assert.equal(c.totalRows, 2);

  // …but a bare row that CARRIES cost is a real cost anchor → stays in Y.
  const withCostAnchor: Raw[] = [
    { id: 20, ftrackingchn: "999000111", fweight: 58, userid: "PR086", fcosttotalprice: 460 },
    { id: 21, ftrackingchn: "999000111-1/2", fweight: 30, userid: "PR086", fcosttotalprice: 0 },
    { id: 22, ftrackingchn: "999000111-2/2", fweight: 28, userid: "PR086", fcosttotalprice: 0 },
  ];
  const kept = filterCountableForwarderRows(withCostAnchor, {
    tracking: (r) => r.ftrackingchn,
    weight: (r) => r.fweight,
    userid: (r) => r.userid,
    money: (r) => r.fcosttotalprice,
  });
  assert.equal(kept.length, 3, "bare row WITH cost = real anchor · kept in the denominator");
}

console.log("cabinet-billing-coverage.test.ts — all assertions passed");
