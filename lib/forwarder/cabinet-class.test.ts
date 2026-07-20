/**
 * cabinet-class.test.ts — locks the cabinet tier classifier (owner 2026-07-20).
 * Run: tsx lib/forwarder/cabinet-class.test.ts
 *
 * 🔄 owner pivot 2026-07-20: TTW/อี้อู container ids are used AS-SENT —
 * "SEA0625-8211YW" (Packing ID) and "0717-7072 YW SEA" (ใบปิดตู้) ARE real ตู้.
 * Refused = sack (CBX…) + MOMO routing placeholder (PR/MO/PCS+date) only.
 */
import { classifyCabinetId, isNonContainerCabinetId, isRealContainerId, cabinetWriteGuard } from "./cabinet-class";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.error(`✗ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

// ── classification: real containers (MOMO + TTW) ──
eq("GZS260625-5T container", classifyCabinetId("GZS260625-5T"), "container");
eq("GZS260720-1 container", classifyCabinetId("GZS260720-1"), "container");
eq("GZE260718-1 container", classifyCabinetId("GZE260718-1"), "container");
eq("GZA260601-AIR container", classifyCabinetId("GZA260601-AIR"), "container");
eq("TTW -NT era GZS260614-1T", classifyCabinetId("GZS260614-1T"), "container");
eq("YWS (TTW sea)", classifyCabinetId("YWS260801-1"), "container");
eq("YWE (TTW road)", classifyCabinetId("YWE260801-1"), "container");
eq("TTW Packing ID SEA0625-8211YW = container (owner pivot)", classifyCabinetId("SEA0625-8211YW"), "container");
eq("TTW EK-mode packing id", classifyCabinetId("EK0625-1234"), "container");
eq("TTW ใบปิดตู้ 0717-7072 YW SEA = container", classifyCabinetId("0717-7072 YW SEA"), "container");
eq("TTW ใบปิดตู้ no-space variant", classifyCabinetId("0717-7072YW SEA"), "container");

// ── sacks ──
eq("CBX260719-EK10 sack", classifyCabinetId("CBX260719-EK10"), "sack");
eq("CBX260717-SEA07 sack", classifyCabinetId("CBX260717-SEA07"), "sack");

// ── MOMO routing placeholders (system-written only) ──
eq("PR20260720-SEA01 batch", classifyCabinetId("PR20260720-SEA01"), "batch");
eq("MO20260523-SEA02 batch", classifyCabinetId("MO20260523-SEA02"), "batch");
eq("PCS20260704-EK01 batch", classifyCabinetId("PCS20260704-EK01"), "batch");

// ── other/empty ──
eq("empty", classifyCabinetId(""), "empty");
eq("null empty", classifyCabinetId(null), "empty");
eq("ISO code LEOU2022222 = other (allowed)", classifyCabinetId("LEOU2022222"), "other");
eq("legacy KY code = other", classifyCabinetId("KY4001030721114"), "other");

// ── predicates ──
eq("sack is non-container", isNonContainerCabinetId("CBX260719-EK10"), true);
eq("MOMO placeholder is non-container", isNonContainerCabinetId("PR20260701-EK01"), true);
eq("TTW packing id NOT non-container (owner pivot)", isNonContainerCabinetId("SEA0625-8211YW"), false);
eq("TTW close-list id NOT non-container", isNonContainerCabinetId("0717-7072 YW SEA"), false);
eq("GZS not non-container", isNonContainerCabinetId("GZS260625-5T"), false);
eq("other not non-container", isNonContainerCabinetId("LEOU2022222"), false);
eq("isReal GZS", isRealContainerId("GZS260626-1"), true);
eq("isReal TTW packing id", isRealContainerId("SEA0625-8211YW"), true);
eq("isReal rejects MOMO placeholder", isRealContainerId("PR20260624-SEA01"), false);

// ── write guard ──
eq("guard: sack refused", cabinetWriteGuard({ next: "CBX260719-EK10" }).ok, false);
eq("guard: MOMO placeholder refused", cabinetWriteGuard({ next: "PR20260701-EK01" }).ok, false);
eq("guard: MOMO placeholder refused EVEN for god", cabinetWriteGuard({ next: "PR20260701-EK01", isGod: true }).ok, false);
eq("guard: TTW packing id ALLOWED (owner pivot)", cabinetWriteGuard({ next: "SEA0625-8211YW", current: "" }).ok, true);
eq("guard: TTW close-list id ALLOWED", cabinetWriteGuard({ next: "0717-7072 YW SEA", current: "" }).ok, true);
eq("guard: locked refused for staff", cabinetWriteGuard({ next: "GZS260626-1", current: "GZS260625-5T", locked: true }).ok, false);
eq("guard: locked allowed for god", cabinetWriteGuard({ next: "GZS260626-1", current: "GZS260625-5T", locked: true, isGod: true }).ok, true);
eq("guard: normal container write ok", cabinetWriteGuard({ next: "GZS260626-1", current: "" }).ok, true);
eq("guard: clear ok when unlocked", cabinetWriteGuard({ next: "", current: "GZS260626-1" }).ok, true);
eq("guard: clear refused when locked", cabinetWriteGuard({ next: "", current: "GZS260626-1", locked: true }).ok, false);
eq("guard: no-op same value ok even locked", cabinetWriteGuard({ next: "SEA0625-8211YW", current: "SEA0625-8211YW", locked: true }).ok, true);
eq("guard: legacy 'other' shape allowed", cabinetWriteGuard({ next: "LEOU2022222", current: "" }).ok, true);

console.log(`\nforwarder/cabinet-class: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
