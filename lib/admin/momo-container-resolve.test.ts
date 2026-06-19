/**
 * Unit tests for the MOMO routing-batch → real container/sack/etd/eta resolver
 * (report-cnt #4). Pure functions only — no DB. Run: `tsx lib/admin/momo-container-resolve.test.ts`.
 */

import assert from "node:assert/strict";
import { isMomoRoutingPlaceholder, foldMomoContainerInfo, mergeTaemEtdEta } from "./momo-container-resolve";

let passed = 0;
function it(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("momo-container-resolve — isMomoRoutingPlaceholder:");

it("matches the SEA0x routing-batch placeholders", () => {
  assert.equal(isMomoRoutingPlaceholder("PR20260605-SEA03"), true);
  assert.equal(isMomoRoutingPlaceholder("PCS20260528-SEA01"), true);
  assert.equal(isMomoRoutingPlaceholder("MO20260523-SEA02"), true);
  assert.equal(isMomoRoutingPlaceholder("MO20260523-EK01"), true);
  assert.equal(isMomoRoutingPlaceholder("PR20260605-AIR02"), true);
  assert.equal(isMomoRoutingPlaceholder("  PR20260605-SEA03  "), true); // trimmed
});

it("rejects real container codes + junk", () => {
  assert.equal(isMomoRoutingPlaceholder("GZS260601-1"), false); // real container
  assert.equal(isMomoRoutingPlaceholder("CBX260523-EK01"), false); // sack, not a routing batch
  assert.equal(isMomoRoutingPlaceholder(""), false);
  assert.equal(isMomoRoutingPlaceholder(null), false);
  assert.equal(isMomoRoutingPlaceholder(undefined), false);
  assert.equal(isMomoRoutingPlaceholder("0"), false);
});

console.log("momo-container-resolve — foldMomoContainerInfo:");

it("folds one info per placeholder · MOMO etd/eta land in momoEtd/momoEta · date-only", () => {
  const out = foldMomoContainerInfo([
    { momo_container_no: "MO20260523-SEA02", container_batch_no: null, momo_sack_no: "CBX260523-EK01", etd: null, eta: null },
    { momo_container_no: "MO20260523-SEA02", container_batch_no: "GZS260525-2", momo_sack_no: null, etd: "2026-05-25T00:00:00Z", eta: null },
    { momo_container_no: "PR20260530-SEA01", container_batch_no: "GZS260601-1", momo_sack_no: null, etd: null, eta: "2026-06-04T00:00:00Z" },
  ]);
  // first row had no container but a sack; second row filled the container + etd.
  // MOMO etd/eta go to momoEtd/momoEta (the fallback layer) + are trimmed to date-only.
  assert.deepEqual(out["MO20260523-SEA02"], {
    realContainer: "GZS260525-2",
    sackNo: "CBX260523-EK01",
    etd: null, eta: null, etdSource: null, etaSource: null,
    momoEtd: "2026-05-25",
    momoEta: null,
  });
  assert.deepEqual(out["PR20260530-SEA01"], {
    realContainer: "GZS260601-1",
    sackNo: null,
    etd: null, eta: null, etdSource: null, etaSource: null,
    momoEtd: null,
    momoEta: "2026-06-04",
  });
});

it("ignores rows with no momo_container_no key", () => {
  const out = foldMomoContainerInfo([
    { momo_container_no: null, container_batch_no: "GZS999-1", momo_sack_no: null, etd: null, eta: null },
    { momo_container_no: "  ", container_batch_no: "GZS888-1", momo_sack_no: null, etd: null, eta: null },
  ]);
  assert.deepEqual(out, {});
});

console.log("momo-container-resolve — mergeTaemEtdEta (แต้ม-primary · MOMO-fallback):");

it("แต้ม ETD/ETA OVERRIDE MOMO on the same container", () => {
  const base = foldMomoContainerInfo([
    { momo_container_no: "MO20260523-SEA02", container_batch_no: "GZS260525-2", momo_sack_no: null, etd: "2026-05-20T00:00:00Z", eta: "2026-06-01T00:00:00Z" },
  ]);
  const out = mergeTaemEtdEta(base, [
    { container_no: "MO20260523-SEA02", etd: "2026-05-25", eta: "2026-06-05" },
  ]);
  const info = out["MO20260523-SEA02"];
  assert.equal(info.etd, "2026-05-25", "แต้ม etd wins");
  assert.equal(info.eta, "2026-06-05", "แต้ม eta wins");
  assert.equal(info.etdSource, "taem");
  assert.equal(info.etaSource, "taem");
  // MOMO's own values are preserved for the compare note (they disagree).
  assert.equal(info.momoEtd, "2026-05-20");
  assert.equal(info.momoEta, "2026-06-01");
});

it("falls back to MOMO when แต้ม has no value for a field", () => {
  const base = foldMomoContainerInfo([
    { momo_container_no: "PR20260530-SEA01", container_batch_no: "GZS260601-1", momo_sack_no: null, etd: "2026-05-28T00:00:00Z", eta: "2026-06-10T00:00:00Z" },
  ]);
  // แต้ม supplies ETD only → ETA falls back to MOMO.
  const out = mergeTaemEtdEta(base, [
    { container_no: "PR20260530-SEA01", etd: "2026-05-29", eta: null },
  ]);
  const info = out["PR20260530-SEA01"];
  assert.equal(info.etd, "2026-05-29");
  assert.equal(info.etdSource, "taem");
  assert.equal(info.eta, "2026-06-10", "ETA falls back to MOMO");
  assert.equal(info.etaSource, "momo");
});

it("creates an info for a REAL closed container that has no MOMO placeholder row", () => {
  // A closed container (real GZS code in fcabinetnumber) won't appear in the MOMO
  // placeholder map at all — แต้ม's etd/eta must still produce an entry.
  const out = mergeTaemEtdEta({}, [
    { container_no: "GZS260601-1", etd: "2026-06-01", eta: "2026-06-18" },
  ]);
  assert.equal(out["GZS260601-1"].etd, "2026-06-01");
  assert.equal(out["GZS260601-1"].eta, "2026-06-18");
  assert.equal(out["GZS260601-1"].etdSource, "taem");
  assert.equal(out["GZS260601-1"].realContainer, null); // no MOMO container resolution for a real code
});

it("MOMO-only container (no แต้ม row) keeps MOMO etd/eta as the displayed value", () => {
  const base = foldMomoContainerInfo([
    { momo_container_no: "PR20260605-SEA03", container_batch_no: "GZS260610-1", momo_sack_no: null, etd: "2026-06-05T00:00:00Z", eta: "2026-06-20T00:00:00Z" },
  ]);
  const out = mergeTaemEtdEta(base, []); // no แต้ม data
  const info = out["PR20260605-SEA03"];
  assert.equal(info.etd, "2026-06-05");
  assert.equal(info.eta, "2026-06-20");
  assert.equal(info.etdSource, "momo");
  assert.equal(info.etaSource, "momo");
});

console.log(`\nmomo-container-resolve: ${passed} assertions passed ✅`);
