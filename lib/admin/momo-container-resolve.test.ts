/**
 * Unit tests for the MOMO routing-batch → real container/sack/etd/eta resolver
 * (report-cnt #4). Pure functions only — no DB. Run: `tsx lib/admin/momo-container-resolve.test.ts`.
 */

import assert from "node:assert/strict";
import { isMomoRoutingPlaceholder, foldMomoContainerInfo } from "./momo-container-resolve";

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

it("folds one info per placeholder · keeps first non-empty per field", () => {
  const out = foldMomoContainerInfo([
    { momo_container_no: "MO20260523-SEA02", container_batch_no: null, momo_sack_no: "CBX260523-EK01", etd: null, eta: null },
    { momo_container_no: "MO20260523-SEA02", container_batch_no: "GZS260525-2", momo_sack_no: null, etd: "2026-05-25T00:00:00Z", eta: null },
    { momo_container_no: "PR20260530-SEA01", container_batch_no: "GZS260601-1", momo_sack_no: null, etd: null, eta: "2026-06-04T00:00:00Z" },
  ]);
  // first row had no container but a sack; second row filled the container + etd
  assert.deepEqual(out["MO20260523-SEA02"], {
    realContainer: "GZS260525-2",
    sackNo: "CBX260523-EK01",
    etd: "2026-05-25T00:00:00Z",
    eta: null,
  });
  assert.deepEqual(out["PR20260530-SEA01"], {
    realContainer: "GZS260601-1",
    sackNo: null,
    etd: null,
    eta: "2026-06-04T00:00:00Z",
  });
});

it("ignores rows with no momo_container_no key", () => {
  const out = foldMomoContainerInfo([
    { momo_container_no: null, container_batch_no: "GZS999-1", momo_sack_no: null, etd: null, eta: null },
    { momo_container_no: "  ", container_batch_no: "GZS888-1", momo_sack_no: null, etd: null, eta: null },
  ]);
  assert.deepEqual(out, {});
});

console.log(`\nmomo-container-resolve: ${passed} assertions passed ✅`);
