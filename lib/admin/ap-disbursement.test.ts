/**
 * Unit tests for lib/admin/ap-disbursement.ts — the pure AP-ledger math
 * (net amount / totals split / shipment grouping / central-fund THB /
 * source-account resolver). Spec: docs/research/accounting-ap-2026-07-01/spec.md.
 *
 * Run: npx tsx lib/admin/ap-disbursement.test.ts
 *
 * Pure logic only — no DB. Asserts the two-money-column net effect + the
 * ต้นทุนบริการ/เงินทดรองจ่าย split (so a pass-through never counts as margin,
 * a refund never double-counts as an outflow).
 */

import assert from "node:assert/strict";
import {
  rowNetAmount,
  computeApTotals,
  groupByShipment,
  computeCentralFundThb,
  resolveApSourceAccount,
  round2,
  type ApDisbursementRow,
} from "./ap-disbursement";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("ap-disbursement");

// Minimal row factory — only the fields the pure math touches matter.
function mkRow(over: Partial<ApDisbursementRow>): ApDisbursementRow {
  return {
    id: over.id ?? "r1",
    batch_id: null,
    lane: over.lane ?? "sea",
    entity: "pacred",
    shipment_no: over.shipment_no ?? null,
    quotation_no: null,
    invoice_no: null,
    receipt_no: null,
    container_no: null,
    customer_id: null,
    line_name: null,
    category: over.category ?? "service_cost",
    item_label: over.item_label ?? "ค่าบริการ",
    expense_category: null,
    note: null,
    is_customer_named_receipt: false,
    amount_withdraw: over.amount_withdraw ?? 0,
    amount_refund: over.amount_refund ?? 0,
    amount_gross: null,
    wht_pct: null,
    wht_cert_no: null,
    source_account_key: over.source_account_key ?? null,
    payee_name: null,
    payee_account_no: null,
    payee_bank: null,
    pay_channel: null,
    transfer_status: over.transfer_status ?? "requested",
    transferred_at: null,
    transfer_slip_path: null,
    receipt_status: "pending",
    requested_by: null,
    requested_at: over.requested_at ?? "2026-07-01T10:00:00Z",
    approved_by: null,
    approved_at: null,
    legacy_admin_id: null,
    created_at: over.requested_at ?? "2026-07-01T10:00:00Z",
  };
}

// ── round2 ────────────────────────────────────────────────────────────
test("round2 handles float dust", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(58000 * 0.99), 57420);
  assert.equal(round2(1234.565), 1234.57);
});

// ── rowNetAmount = ยอดเบิก − ยอดคืน ───────────────────────────────────
test("rowNetAmount: spend row = +withdraw", () => {
  assert.equal(rowNetAmount({ amount_withdraw: 4500, amount_refund: 0 }), 4500);
});
test("rowNetAmount: refund row = −refund (negative net)", () => {
  assert.equal(rowNetAmount({ amount_withdraw: 0, amount_refund: 1200 }), -1200);
});
test("rowNetAmount: mixed row nets out", () => {
  assert.equal(rowNetAmount({ amount_withdraw: 5000, amount_refund: 1500 }), 3500);
});

// ── computeApTotals — the footer Σ + category split ──────────────────
test("computeApTotals sums withdraw/refund/net and never double-counts a refund", () => {
  const rows = [
    mkRow({ id: "a", category: "service_cost", amount_withdraw: 4500 }),
    mkRow({ id: "b", category: "service_cost", amount_withdraw: 2000 }),
    mkRow({ id: "c", category: "advance_passthrough", amount_withdraw: 3000 }),
    mkRow({ id: "d", category: "refund_correction", amount_refund: 1200 }),
  ];
  const t = computeApTotals(rows);
  assert.equal(t.count, 4);
  assert.equal(t.withdrawSum, 9500);           // 4500+2000+3000
  assert.equal(t.refundSum, 1200);
  assert.equal(t.netSum, 8300);                // 9500 − 1200
  assert.equal(t.serviceCostSum, 6500);        // 4500+2000
  assert.equal(t.advanceSum, 3000);            // pass-through kept SEPARATE (gap #10)
  assert.equal(t.refundCorrectionSum, -1200);  // refund is negative net
});

test("computeApTotals: advance (pass-through) is NOT folded into service cost", () => {
  const rows = [
    mkRow({ id: "svc", category: "service_cost", amount_withdraw: 1000 }),
    mkRow({ id: "adv", category: "advance_passthrough", amount_withdraw: 9999 }),
  ];
  const t = computeApTotals(rows);
  assert.equal(t.serviceCostSum, 1000);
  assert.equal(t.advanceSum, 9999);
  // net includes both (it's all money out) but the split keeps them distinct
  assert.equal(t.netSum, 10999);
});

test("computeApTotals: empty set = zeros", () => {
  const t = computeApTotals([]);
  assert.equal(t.count, 0);
  assert.equal(t.netSum, 0);
  assert.equal(t.serviceCostSum, 0);
});

// ── groupByShipment ───────────────────────────────────────────────────
test("groupByShipment buckets by SHIPMENT, one group per shipment", () => {
  const rows = [
    mkRow({ id: "1", shipment_no: "PRA260050001", amount_withdraw: 100, requested_at: "2026-07-01T10:00:00Z" }),
    mkRow({ id: "2", shipment_no: "PRA260050001", amount_withdraw: 200, requested_at: "2026-07-01T11:00:00Z" }),
    mkRow({ id: "3", shipment_no: "PRA260050002", amount_withdraw: 300, requested_at: "2026-07-02T10:00:00Z" }),
  ];
  const groups = groupByShipment(rows);
  assert.equal(groups.length, 2);
  const g1 = groups.find((g) => g.shipmentNo === "PRA260050001")!;
  assert.equal(g1.rows.length, 2);
  assert.equal(g1.totals.netSum, 300);
  // newest-first within a group
  assert.equal(g1.rows[0].id, "2");
  const g2 = groups.find((g) => g.shipmentNo === "PRA260050002")!;
  assert.equal(g2.totals.netSum, 300);
});

test("groupByShipment: null/blank shipments collapse into ONE no-shipment bucket, last", () => {
  const rows = [
    mkRow({ id: "a", shipment_no: "SHIP-1", amount_withdraw: 100 }),
    mkRow({ id: "b", shipment_no: null, amount_withdraw: 50 }),
    mkRow({ id: "c", shipment_no: "   ", amount_withdraw: 25 }),
  ];
  const groups = groupByShipment(rows);
  assert.equal(groups.length, 2);
  const last = groups[groups.length - 1];
  assert.equal(last.shipmentNo, null);
  assert.equal(last.rows.length, 2);          // b + c (blank treated as null)
  assert.equal(last.totals.netSum, 75);
});

test("groupByShipment: no double-count — total across groups equals the flat total", () => {
  const rows = [
    mkRow({ id: "1", shipment_no: "S1", amount_withdraw: 100 }),
    mkRow({ id: "2", shipment_no: "S2", amount_refund: 40 }),
    mkRow({ id: "3", shipment_no: null, amount_withdraw: 10 }),
  ];
  const flat = computeApTotals(rows).netSum;
  const grouped = groupByShipment(rows).reduce((s, g) => s + g.totals.netSum, 0);
  assert.equal(round2(grouped), flat);
});

// ── computeCentralFundThb — ¥ × rate + หาร2 ──────────────────────────
test("computeCentralFundThb: ฿ = ¥ × rate, split = ฿/2", () => {
  const { amountThb, splitThb } = computeCentralFundThb(10000, 5.1);
  assert.equal(amountThb, 51000);
  assert.equal(splitThb, 25500);
});
test("computeCentralFundThb: rounds to satang", () => {
  const { amountThb, splitThb } = computeCentralFundThb(2853.17, 5.05);
  assert.equal(amountThb, round2(2853.17 * 5.05));
  assert.equal(splitThb, round2(amountThb / 2));
});

// ── resolveApSourceAccount — 3-account SOT ───────────────────────────
test("resolveApSourceAccount: stored key always wins", () => {
  const acc = resolveApSourceAccount({ source_account_key: "trading", lane: "sea" });
  assert.equal(acc?.key, "trading");
  assert.equal(acc?.issuesTaxInvoice, true);
});
test("resolveApSourceAccount: export lane fallback → TRADING (ใบกำกับ)", () => {
  const acc = resolveApSourceAccount({ source_account_key: null, lane: "export" });
  assert.equal(acc?.key, "trading");
});
test("resolveApSourceAccount: truck/cargo domestic-leg fallback → LOGISTICS", () => {
  assert.equal(resolveApSourceAccount({ source_account_key: null, lane: "truck" })?.key, "logistics");
  assert.equal(resolveApSourceAccount({ source_account_key: null, lane: "cargo" })?.key, "logistics");
});
test("resolveApSourceAccount: default fallback → SERVICE (PromptPay)", () => {
  assert.equal(resolveApSourceAccount({ source_account_key: null, lane: "sea" })?.key, "service");
  assert.equal(resolveApSourceAccount({ source_account_key: null, lane: "general" })?.key, "service");
});

console.log(`\n✓ ap-disbursement — ${passed} assertions passed\n`);
