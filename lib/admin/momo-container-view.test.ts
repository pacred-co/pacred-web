import assert from "node:assert";
import { deriveContainerVerify } from "./momo-container-view";

// no packing list → 📄
{
  const r = deriveContainerVerify({ hasPacking: false, systemBoxes: 10, packingBoxes: null, systemWeight: 100, packingWeight: null });
  assert.equal(r.status, "no_packing");
  assert.equal(r.hasPacking, false);
}

// system boxes < packing → box_short (most severe)
{
  const r = deriveContainerVerify({ hasPacking: true, systemBoxes: 6, packingBoxes: 12, systemWeight: 100, packingWeight: 100 });
  assert.equal(r.status, "box_short");
  assert.equal(r.boxShort, true);
}

// boxes ok, weight short → weight_missing
{
  const r = deriveContainerVerify({ hasPacking: true, systemBoxes: 12, packingBoxes: 12, systemWeight: 80, packingWeight: 100 });
  assert.equal(r.status, "weight_missing");
  assert.equal(r.weightShort, true);
  assert.equal(r.boxShort, false);
}

// all >= packing → ok
{
  const r = deriveContainerVerify({ hasPacking: true, systemBoxes: 12, packingBoxes: 12, systemWeight: 100, packingWeight: 100 });
  assert.equal(r.status, "ok");
}

// weight within epsilon → ok (no false weight_missing)
{
  const r = deriveContainerVerify({ hasPacking: true, systemBoxes: 5, packingBoxes: 5, systemWeight: 99.995, packingWeight: 100 });
  assert.equal(r.status, "ok");
}

// apiMissing carried through regardless of status
{
  const r = deriveContainerVerify({ hasPacking: true, systemBoxes: 12, packingBoxes: 12, systemWeight: 100, packingWeight: 100, apiMissing: 3 });
  assert.equal(r.status, "ok");
  assert.equal(r.apiMissing, 3);
}

// null system side with packing present → box_short (system knows nothing)
{
  const r = deriveContainerVerify({ hasPacking: true, systemBoxes: null, packingBoxes: 5, systemWeight: null, packingWeight: 50 });
  assert.equal(r.status, "box_short");
}

console.log("momo-container-view.test.ts: all assertions passed");
