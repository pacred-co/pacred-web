/**
 * resolve-box-dims.test.ts — locks the ขนาด (ก×ย×ส) display rule (owner 2026-07-23).
 * Run: tsx lib/forwarder/resolve-box-dims.test.ts
 */
import { resolveDimsDisplay } from "./resolve-box-dims";

let pass = 0,
  fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
}

// ── 1. own dim wins (single / manual / already-propagated row) ──
eq("own dim wins", resolveDimsDisplay({ fwidth: 30, flength: 40, fheight: 50 }), "30×40×50");
eq(
  "own dim wins even when boxDims present (never merge)",
  resolveDimsDisplay({
    fwidth: 30,
    flength: 40,
    fheight: 50,
    boxDims: [{ width: 99, length: 99, height: 99, quantity: 5 }],
  }),
  "30×40×50",
);
eq("own dim partial (one axis) still shows", resolveDimsDisplay({ fwidth: 0, flength: 40, fheight: 0 }), "0×40×0");
eq("own dim clean decimals (no trailing .0)", resolveDimsDisplay({ fwidth: 50, flength: 46.5, fheight: 40.0 }), "50×46.5×40");

// ── 2. single momo box ──
eq(
  "single per-box detail",
  resolveDimsDisplay({ fwidth: 0, flength: 0, fheight: 0, boxDims: [{ width: 50, length: 46, height: 40, quantity: 1 }] }),
  "50×46×40",
);
eq(
  "single per-box with qty>1 → ×N",
  resolveDimsDisplay({ fwidth: 0, flength: 0, fheight: 0, boxDims: [{ width: 47, length: 52, height: 79, quantity: 3 }] }),
  "47×52×79 ×3",
);

// ── 3. multi-box distinct sizes — the PROD bug case (fid #52368 · owner-verified) ──
eq(
  "multi distinct sizes (prod #52368: 50×46×40 q1 + 47×52×79 q3)",
  resolveDimsDisplay({
    fwidth: 0,
    flength: 0,
    fheight: 0,
    boxDims: [
      { width: 50, length: 46, height: 40, quantity: 1 },
      { width: 47, length: 52, height: 79, quantity: 3 },
    ],
  }),
  "50×46×40, 47×52×79 ×3",
);

// ── 4. repeated size grouping (same size across boxes → summed qty) ──
eq(
  "repeated size across 2 boxes → grouped ×2",
  resolveDimsDisplay({
    fwidth: 0,
    flength: 0,
    fheight: 0,
    boxDims: [
      { width: 50, length: 46, height: 40, quantity: 1 },
      { width: 50, length: 46, height: 40, quantity: 1 },
    ],
  }),
  "50×46×40 ×2",
);
eq(
  "repeat + distinct: preserves first-seen order, sums the repeat",
  resolveDimsDisplay({
    fwidth: 0,
    flength: 0,
    fheight: 0,
    boxDims: [
      { width: 60, length: 60, height: 60, quantity: 2 },
      { width: 50, length: 46, height: 40, quantity: 1 },
      { width: 60, length: 60, height: 60, quantity: 1 },
    ],
  }),
  "60×60×60 ×3, 50×46×40",
);

// ── 5. all-zero per-box detail → "—" (never a fake 0×0×0) ──
eq(
  "all-zero box detail → —",
  resolveDimsDisplay({ fwidth: 0, flength: 0, fheight: 0, boxDims: [{ width: 0, length: 0, height: 0, quantity: 3 }] }),
  "—",
);
eq(
  "mixed: zero box dropped, real box kept",
  resolveDimsDisplay({
    fwidth: 0,
    flength: 0,
    fheight: 0,
    boxDims: [
      { width: 0, length: 0, height: 0, quantity: 3 },
      { width: 50, length: 46, height: 40, quantity: 2 },
    ],
  }),
  "50×46×40 ×2",
);

// ── 6. empty / nothing known → "—" ──
eq("no own dim, no boxDims → —", resolveDimsDisplay({ fwidth: 0, flength: 0, fheight: 0 }), "—");
eq("no own dim, empty boxDims array → —", resolveDimsDisplay({ fwidth: 0, flength: 0, fheight: 0, boxDims: [] }), "—");

// ── 7. length cap — >6 distinct sizes truncate with "…" ──
eq(
  "cap distinct sizes at 6 with …",
  resolveDimsDisplay({
    fwidth: 0,
    flength: 0,
    fheight: 0,
    boxDims: [
      { width: 1, length: 1, height: 1, quantity: 1 },
      { width: 2, length: 2, height: 2, quantity: 1 },
      { width: 3, length: 3, height: 3, quantity: 1 },
      { width: 4, length: 4, height: 4, quantity: 1 },
      { width: 5, length: 5, height: 5, quantity: 1 },
      { width: 6, length: 6, height: 6, quantity: 1 },
      { width: 7, length: 7, height: 7, quantity: 1 },
    ],
  }),
  "1×1×1, 2×2×2, 3×3×3, 4×4×4, 5×5×5, 6×6×6, …",
);

// ── 8. string/garbage coercion (defensive — callers coerce, but never crash) ──
eq(
  "NaN own dim → falls through to box detail",
  resolveDimsDisplay({
    fwidth: Number.NaN,
    flength: Number.NaN,
    fheight: Number.NaN,
    boxDims: [{ width: 50, length: 46, height: 40, quantity: 1 }],
  }),
  "50×46×40",
);

console.log(`\nforwarder/resolve-box-dims: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
