/**
 * quantities.test.ts — locks the famountcount CBM convention (owner 2026-07-19).
 * Run: tsx lib/forwarder/quantities.test.ts
 */
import { totalCbmOf, totalBoxesOf, totalWeightOf, sumQuantities, volumeIsTotal } from "./quantities";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}
function close(name: string, got: number, want: number, eps = 1e-6) {
  const ok = Math.abs(got - want) <= eps;
  if (ok) pass++;
  else { fail++; console.error(`✗ ${name}: got ${got} want ${want}`); }
}

// ── volumeIsTotal ──
eq("famountcount '1' = total", volumeIsTotal("1"), true);
eq("famountcount 1 (number) = total", volumeIsTotal(1), true);
eq("famountcount ' 1 ' trimmed", volumeIsTotal(" 1 "), true);
eq("famountcount null = per-box", volumeIsTotal(null), false);
eq("famountcount '' = per-box", volumeIsTotal(""), false);
eq("famountcount '0' = per-box", volumeIsTotal("0"), false);

// ── totalCbmOf ──
// MOMO convention: fvolume already total
close("MOMO total-row: fvolume as-is", totalCbmOf({ fvolume: 1.494, famount: 10, famountcount: "1" }), 1.494);
// per-box convention (TTW/manual/legacy): × famount
close("per-box row ×famount (PR172 52179)", totalCbmOf({ fvolume: 0.18067, famount: 19, famountcount: null }), 3.43273);
close("per-box row single box", totalCbmOf({ fvolume: 0.07478, famount: 1, famountcount: "" }), 0.07478);
// famount missing on a per-box row → treat as 1 (never zero a real volume)
close("per-box famount 0 → ×1", totalCbmOf({ fvolume: 0.5, famount: 0, famountcount: null }), 0.5);
close("per-box famount null → ×1", totalCbmOf({ fvolume: 0.5, famount: null, famountcount: null }), 0.5);
// zero / garbage volume → 0
close("zero volume", totalCbmOf({ fvolume: 0, famount: 5, famountcount: null }), 0);
close("string numerics coerce", totalCbmOf({ fvolume: "0.25627", famount: "5", famountcount: null }), 1.28135);

// ── boxes / weight ──
close("boxes = famount", totalBoxesOf({ famount: "19" }), 19);
close("weight = fweight (always total)", totalWeightOf({ fweight: "171.00" }), 171);

// ── sumQuantities — the PR172 GZS260625-5T X9002653 shipment (real rows) ──
const x9002653 = [
  { fvolume: 0.25627, famount: 5, famountcount: null, fweight: 45 },
  { fvolume: 0.1925, famount: 4, famountcount: null, fweight: 36 },
  { fvolume: 0.18067, famount: 19, famountcount: null, fweight: 171 },
  { fvolume: 0.07478, famount: 1, famountcount: null, fweight: 9 },
];
const s = sumQuantities(x9002653);
close("shipment boxes 29", s.boxes, 29);
close("shipment kg 261", s.weightKg, 261);
close("shipment cbm 5.55886 (delivery-note math)", s.cbm, 5.55886, 1e-5);

// mixed conventions in one batch must not cross-contaminate
const mixed = sumQuantities([
  { fvolume: 1.494, famount: 10, famountcount: "1", fweight: 100 },  // MOMO total
  { fvolume: 0.1, famount: 3, famountcount: null, fweight: 30 },     // per-box
]);
close("mixed batch cbm 1.494+0.3", mixed.cbm, 1.794, 1e-9);
close("mixed batch boxes 13", mixed.boxes, 13);

console.log(`\nforwarder/quantities: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
