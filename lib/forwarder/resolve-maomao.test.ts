/**
 * Unit tests for lib/forwarder/resolve-maomao.ts — the server-side เหมาๆ zone guard
 * that closes the "default เขตเหมาๆ เก็บต้นทาง" bug (owner 2026-06-19).
 * Uses the REAL isMaomaoEligibleForAddress (BKK-metro zip set) so the gate is exercised.
 */
import { resolveMaomaoCarrier } from "./resolve-maomao";
import { MAO_CARRIER_CODE } from "./mao-fee";
import { isFreeShippingZip } from "@/lib/bkk-zip";

let pass = 0, fail = 0;
const eq = (label: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}\n    expected ${JSON.stringify(b)}\n    actual   ${JSON.stringify(a)}`); };
};

// pick a real in-zone + out-of-zone zip from the SOT so the test stays honest.
const IN_ZONE = ["10110", "10540", "74110", "11130"].find((z) => isFreeShippingZip(z));
const OUT_ZONE = ["50000", "40000", "90110"].find((z) => !isFreeShippingZip(z));
console.log(`resolve-maomao (in-zone=${IN_ZONE} out-zone=${OUT_ZONE}):`);
eq("found an in-zone zip", !!IN_ZONE, true);
eq("found an out-zone zip", !!OUT_ZONE, true);

// 1. pro !== "f" → just the picked carrier, no fee.
eq("no promo → picked carrier", resolveMaomaoCarrier({ pro: "", addressID: "123", zip: OUT_ZONE, pickedCarrier: "2" }),
   { carrier: "2", maoApplied: false, droppedOutOfZone: false });

// 2. ticked เหมาๆ + IN ZONE → MAO carrier + fee.
eq("เหมาๆ in-zone → PRF + fee", resolveMaomaoCarrier({ pro: "f", addressID: "123", zip: IN_ZONE, pickedCarrier: null }),
   { carrier: MAO_CARRIER_CODE, maoApplied: true, droppedOutOfZone: false });

// 3. ticked เหมาๆ + OUT OF ZONE + a picked upcountry carrier → DROP to that carrier, no fee.
eq("เหมาๆ out-of-zone w/ picked → drop to picked", resolveMaomaoCarrier({ pro: "f", addressID: "123", zip: OUT_ZONE, pickedCarrier: "Kerry" }),
   { carrier: "Kerry", maoApplied: false, droppedOutOfZone: true });

// 4. ticked เหมาๆ + OUT OF ZONE + NO picked carrier → carrier null (caller rejects).
eq("เหมาๆ out-of-zone, no picked → null (reject)", resolveMaomaoCarrier({ pro: "f", addressID: "123", zip: OUT_ZONE, pickedCarrier: "" }),
   { carrier: null, maoApplied: false, droppedOutOfZone: true });

// 5. addressID 'PCS' (self-pickup) is NOT eligible even with pro=f → drop.
eq("self-pickup PCS + เหมาๆ → not eligible, drop", resolveMaomaoCarrier({ pro: "f", addressID: "PCS", zip: IN_ZONE, pickedCarrier: "2" }),
   { carrier: "2", maoApplied: false, droppedOutOfZone: true });

console.log(`\nresolve-maomao: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
