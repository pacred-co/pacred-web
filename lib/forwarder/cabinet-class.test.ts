/**
 * cabinet-class.test.ts — locks the cabinet tier classifier (owner 2026-07-20).
 * Run: tsx lib/forwarder/cabinet-class.test.ts
 */
import { classifyCabinetId, isNonContainerCabinetId, isRealContainerId, cabinetWriteGuard } from "./cabinet-class";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

// ── classification: real containers ──
eq("GZS260625-5T container", classifyCabinetId("GZS260625-5T"), "container");
eq("GZS260720-1 container", classifyCabinetId("GZS260720-1"), "container");
eq("GZE260718-1 container", classifyCabinetId("GZE260718-1"), "container");
eq("GZA260601-AIR container", classifyCabinetId("GZA260601-AIR"), "container");
eq("TTW -NT era GZS260614-1T", classifyCabinetId("GZS260614-1T"), "container");
eq("YWS (TTW sea)", classifyCabinetId("YWS260801-1"), "container");
eq("YWE (TTW road)", classifyCabinetId("YWE260801-1"), "container");

// ── sacks ──
eq("CBX260719-EK10 sack", classifyCabinetId("CBX260719-EK10"), "sack");
eq("CBX260717-SEA07 sack", classifyCabinetId("CBX260717-SEA07"), "sack");

// ── batches (routing + packing labels) ──
eq("PR20260720-SEA01 batch", classifyCabinetId("PR20260720-SEA01"), "batch");
eq("MO20260523-SEA02 batch", classifyCabinetId("MO20260523-SEA02"), "batch");
eq("PCS20260704-EK01 batch", classifyCabinetId("PCS20260704-EK01"), "batch");
eq("SEA0625-8211YW batch (THE incident id)", classifyCabinetId("SEA0625-8211YW"), "batch");
eq("EK0625-1234 batch", classifyCabinetId("EK0625-1234"), "batch");

// ── other/empty ──
eq("empty", classifyCabinetId(""), "empty");
eq("null empty", classifyCabinetId(null), "empty");
eq("ISO code LEOU2022222 = other (allowed)", classifyCabinetId("LEOU2022222"), "other");
eq("legacy KY code = other", classifyCabinetId("KY4001030721114"), "other");

// ── predicates ──
eq("sack is non-container", isNonContainerCabinetId("CBX260719-EK10"), true);
eq("batch is non-container", isNonContainerCabinetId("SEA0625-8211YW"), true);
eq("container not non-container", isNonContainerCabinetId("GZS260625-5T"), false);
eq("other not non-container", isNonContainerCabinetId("LEOU2022222"), false);
eq("isReal GZS", isRealContainerId("GZS260626-1"), true);
eq("isReal rejects batch", isRealContainerId("PR20260624-SEA01"), false);

// ── write guard ──
eq("guard: sack refused", cabinetWriteGuard({ next: "CBX260719-EK10" }).ok, false);
eq("guard: batch refused", cabinetWriteGuard({ next: "SEA0625-8211YW" }).ok, false);
eq("guard: batch refused EVEN for god", cabinetWriteGuard({ next: "SEA0625-8211YW", isGod: true }).ok, false);
eq("guard: locked refused for staff", cabinetWriteGuard({ next: "GZS260626-1", current: "GZS260625-5T", locked: true }).ok, false);
eq("guard: locked allowed for god (real container)", cabinetWriteGuard({ next: "GZS260626-1", current: "GZS260625-5T", locked: true, isGod: true }).ok, true);
eq("guard: normal container write ok", cabinetWriteGuard({ next: "GZS260626-1", current: "" }).ok, true);
eq("guard: clear ok when unlocked", cabinetWriteGuard({ next: "", current: "GZS260626-1" }).ok, true);
eq("guard: clear refused when locked", cabinetWriteGuard({ next: "", current: "GZS260626-1", locked: true }).ok, false);
eq("guard: no-op same value ok even locked", cabinetWriteGuard({ next: "GZS260625-5T", current: "GZS260625-5T", locked: true }).ok, true);
eq("guard: legacy 'other' shape allowed", cabinetWriteGuard({ next: "LEOU2022222", current: "" }).ok, true);

console.log(`\nforwarder/cabinet-class: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
