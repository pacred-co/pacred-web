/**
 * Tests for resolveMomoBoxBasis — the momo_box_detail per-piece-vs-line-total decider.
 *
 * Every fixture below is a REAL prod row (read-only probe 2026-07-17 · see
 * docs/research/momo-invoice-reconcile-ground-truth-2026-07-17.md), so a regression
 * here is a regression against MOMO's actual data — not an invented shape.
 *
 * Run: tsx lib/integrations/momo-web/box-detail-basis.test.ts
 */
import assert from "node:assert/strict";
import {
  resolveMomoBoxBasis,
  dimsCbmPerPiece,
  legacyBoxCbmPerPiece,
  piecesOf,
} from "./box-detail-basis";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}
const near = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

console.log("box-detail-basis.test.ts");

// ── the decider primitives ──────────────────────────────────────────────────
check("dimsCbmPerPiece — (ก×ย×ส)/1e6", () => {
  near(dimsCbmPerPiece({ width: 62, length: 34, height: 46 }), 0.096968);
  near(dimsCbmPerPiece({ width: 100, length: 100, height: 100 }), 1);
});

check("dimsCbmPerPiece — a PARTIAL dims triple cannot arbitrate → 0", () => {
  near(dimsCbmPerPiece({ width: 62, length: 34, height: 0 }), 0);
  near(dimsCbmPerPiece({ width: 0, length: 0, height: 0 }), 0);
});

check("legacyBoxCbmPerPiece — dims win; fall back to the sent cbm only when ALL dims 0", () => {
  near(legacyBoxCbmPerPiece({ width: 50, length: 40, height: 30, cbm: 99 }), 0.06);
  near(legacyBoxCbmPerPiece({ width: 0, length: 0, height: 0, cbm: 0.35 }), 0.35);
  // legacy quirk PRESERVED: a partial triple multiplies to 0 (not the sent cbm).
  near(legacyBoxCbmPerPiece({ width: 62, length: 34, height: 0, cbm: 5 }), 0);
});

check("piecesOf — floored at 1", () => {
  assert.equal(piecesOf(70), 70);
  assert.equal(piecesOf(0), 1);
  assert.equal(piecesOf(null), 1);
  assert.equal(piecesOf("14"), 14);
});

// ── PER-PIECE (the healthy majority · prod 116 boxes) ───────────────────────
check("PER-PIECE · prod 983824005 (50×30×27 · cbm 0.0405 · qty 40) → × qty", () => {
  const r = resolveMomoBoxBasis({
    width: 50, length: 30, height: 27, weightKg: 12, cbm: 0.0405, quantity: 40,
  });
  assert.equal(r.convention, "per_piece");
  assert.equal(r.decided, true);
  near(r.totalCbm, 1.62);          // 0.0405 × 40
  near(r.totalWeightKg, 480);      // 12 × 40
});

// ── LINE-TOTAL (the bug class · prod 22 boxes) ──────────────────────────────
check("LINE-TOTAL · prod fid 52225 KY4001041630124-25 (62×34×46 · qty 70) → NO multiply", () => {
  // momo: weight_kg 945 (= 13.5/กล่อง × 70) · cbm 6.78776 (= 0.096968 × 70).
  const r = resolveMomoBoxBasis({
    width: 62, length: 34, height: 46, weightKg: 945, cbm: 6.78776, quantity: 70,
  });
  assert.equal(r.convention, "line_total");
  assert.equal(r.decided, true);
  near(r.totalWeightKg, 945);      // ← the fix: NOT 66,150 (the stored ghost)
  near(r.totalCbm, 6.78776);       // ← NOT 475.1432
  assert.notEqual(r.totalWeightKg, 66150);
});

check("LINE-TOTAL · prod fid 52206 KY4001041630124-6 (40×62×34 · qty 14)", () => {
  const r = resolveMomoBoxBasis({
    width: 40, length: 62, height: 34, weightKg: 189, cbm: 1.18048, quantity: 14,
  });
  assert.equal(r.convention, "line_total");
  near(r.totalWeightKg, 189);      // stored was 2,646 = 189 × 14
  near(r.totalCbm, 1.18048);
});

check("LINE-TOTAL · prod fid 52198 1782544029-2 (50×40×20 · qty 5) — the ฿3,920 over-collect", () => {
  const r = resolveMomoBoxBasis({
    width: 50, length: 40, height: 20, weightKg: 50, cbm: 0.2, quantity: 5,
  });
  assert.equal(r.convention, "line_total");
  near(r.totalCbm, 0.2);           // stored 1.0 → sold 4,900×1.0 instead of 4,900×0.2
  near(r.totalWeightKg, 50);       // stored 250
});

// ── the two WRONG deciders that must NOT be reintroduced ────────────────────
check("NOT flagged by density · prod 908006917359 (30×23×20 · 2,065 kg/คิว) is REAL cargo", () => {
  // 28.5 kg in 0.0138 คิว = 2,065 kg/m³ (denser than water) yet dims match exactly →
  // a density heuristic would flag it; the dims decider correctly says per_piece.
  const r = resolveMomoBoxBasis({
    width: 30, length: 23, height: 20, weightKg: 28.5, cbm: 0.0138, quantity: 2,
  });
  assert.equal(r.convention, "per_piece");
  assert.equal(r.decided, true);
  near(r.totalWeightKg, 57);       // 28.5 × 2 — correctly multiplied
});

// ── FAIL-SAFE: undecidable → LEGACY value + decided:false (never guess) ─────
check("FAIL-SAFE · no dims → legacy × qty + decided:false", () => {
  const r = resolveMomoBoxBasis({
    width: 0, length: 0, height: 0, weightKg: 10, cbm: 0.35, quantity: 4,
  });
  assert.equal(r.convention, "undecidable");
  assert.equal(r.decided, false);
  assert.equal(r.reason, "no_dims");
  near(r.totalWeightKg, 40);       // 10 × 4 — byte-identical to the pre-decider math
  near(r.totalCbm, 1.4);           // 0.35 × 4
});

check("FAIL-SAFE · dims but no cbm → legacy dims × qty + decided:false", () => {
  const r = resolveMomoBoxBasis({
    width: 50, length: 40, height: 30, weightKg: 5, cbm: 0, quantity: 3,
  });
  assert.equal(r.convention, "undecidable");
  assert.equal(r.decided, false);
  assert.equal(r.reason, "no_cbm");
  near(r.totalCbm, 0.18);          // 0.06 × 3
  near(r.totalWeightKg, 15);
});

check("FAIL-SAFE · cbm matches NEITHER shape (MOMO มั่ว) → legacy + decided:false", () => {
  // 190×77×120 = 1.7556/กล่อง · qty 3 → per-piece 1.7556 · line-total 5.2668.
  // A cbm of 99 fits neither → refuse (this is the class the แต้ม packing list fixes).
  const r = resolveMomoBoxBasis({
    width: 190, length: 77, height: 120, weightKg: 100, cbm: 99, quantity: 3,
  });
  assert.equal(r.convention, "undecidable");
  assert.equal(r.decided, false);
  assert.equal(r.reason, "ambiguous_neither_fits");
  near(r.totalWeightKg, 300);      // legacy 100 × 3 preserved
});

check("qty ≤ 1 → single_piece: both conventions identical · decided · no flag", () => {
  const r = resolveMomoBoxBasis({
    width: 62, length: 34, height: 46, weightKg: 13.5, cbm: 0.096968, quantity: 1,
  });
  assert.equal(r.convention, "single_piece");
  assert.equal(r.decided, true);
  near(r.totalWeightKg, 13.5);
  near(r.totalCbm, 0.096968);
});

check("qty 0/null → treated as 1 piece (never a ×0 wipe of the basis)", () => {
  const r = resolveMomoBoxBasis({
    width: 50, length: 40, height: 30, weightKg: 8, cbm: 0.06, quantity: 0,
  });
  assert.equal(r.pieces, 1);
  near(r.totalWeightKg, 8);
  near(r.totalCbm, 0.06);
});

// ── idempotency: re-running the decider on an already-correct row is a no-op ─
check("IDEMPOTENT · a line-total row already stored correctly resolves to the same totals", () => {
  const box = { width: 40, length: 62, height: 34, weightKg: 189, cbm: 1.18048, quantity: 14 };
  const a = resolveMomoBoxBasis(box);
  const b = resolveMomoBoxBasis(box);
  near(a.totalWeightKg, b.totalWeightKg);
  near(a.totalCbm, b.totalCbm);
});

check("string inputs (pg numeric → string) are coerced", () => {
  const r = resolveMomoBoxBasis({
    width: "62", length: "34", height: "46", weightKg: "945", cbm: "6.78776", quantity: "70",
  });
  assert.equal(r.convention, "line_total");
  near(r.totalWeightKg, 945);
});

console.log(`\nbox-detail-basis.test.ts — ${passed} checks passed`);
