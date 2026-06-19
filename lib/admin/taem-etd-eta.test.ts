import assert from "node:assert/strict";
import { collectContainerEtdEta } from "./taem-etd-eta";

let passed = 0;
function it(name: string, fn: () => void) { fn(); passed += 1; console.log(`  ✓ ${name}`); }

console.log("taem-etd-eta — collectContainerEtdEta:");

it("keys by แต้ม's container; first non-null etd/eta wins", () => {
  const out = collectContainerEtdEta([
    { taemContainer: "GZS260601-1", curCab: "PR20260605-SEA03", taemEtd: "2026-06-01", taemEta: "2026-06-18" },
    { taemContainer: "GZS260601-1", curCab: "PR20260605-SEA03", taemEtd: "2026-06-02", taemEta: null },
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { container_no: "GZS260601-1", etd: "2026-06-01", eta: "2026-06-18" });
});

it("falls back to curCab when แต้ม container is blank (continuation row)", () => {
  const out = collectContainerEtdEta([
    { taemContainer: null, curCab: "GZS260605-1", taemEtd: "2026-06-03", taemEta: "2026-06-20" },
  ]);
  assert.deepEqual(out, [{ container_no: "GZS260605-1", etd: "2026-06-03", eta: "2026-06-20" }]);
});

it("skips rows with no etd AND no eta", () => {
  const out = collectContainerEtdEta([
    { taemContainer: "GZS260601-1", curCab: null, taemEtd: null, taemEta: null },
  ]);
  assert.deepEqual(out, []);
});

it("skips rows with no resolvable container key", () => {
  const out = collectContainerEtdEta([
    { taemContainer: null, curCab: null, taemEtd: "2026-06-01", taemEta: null },
    { taemContainer: "   ", curCab: "  ", taemEtd: "2026-06-01", taemEta: null },
  ]);
  assert.deepEqual(out, []);
});

it("merges etd from one tracking + eta from another for the same container", () => {
  const out = collectContainerEtdEta([
    { taemContainer: "GZS260601-1", curCab: null, taemEtd: "2026-06-01", taemEta: null },
    { taemContainer: "GZS260601-1", curCab: null, taemEtd: null, taemEta: "2026-06-18" },
  ]);
  assert.deepEqual(out, [{ container_no: "GZS260601-1", etd: "2026-06-01", eta: "2026-06-18" }]);
});

it("groups multiple containers independently", () => {
  const out = collectContainerEtdEta([
    { taemContainer: "GZS260601-1", curCab: null, taemEtd: "2026-06-01", taemEta: null },
    { taemContainer: "EK260601-1", curCab: null, taemEtd: null, taemEta: "2026-06-09" },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.find((r) => r.container_no === "GZS260601-1"), { container_no: "GZS260601-1", etd: "2026-06-01", eta: null });
  assert.deepEqual(out.find((r) => r.container_no === "EK260601-1"), { container_no: "EK260601-1", etd: null, eta: "2026-06-09" });
});

console.log(`\ntaem-etd-eta: ${passed} assertions passed ✅`);
