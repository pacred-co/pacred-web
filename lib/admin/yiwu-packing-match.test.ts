import assert from "node:assert/strict";
import { planYiwuReconcile, type YiwuSibling } from "./yiwu-packing-match";

let pass = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; } catch (e) { console.error(`FAIL: ${name}`); throw e; }
}
const s = (id: number, tr: string, st: string, cab: string, uid: string): YiwuSibling =>
  ({ id, ftrackingchn: tr, fstatus: st, fcabinetnumber: cab, userid: uid });

// happy: 2 split siblings at fstatus 2, empty cabinet → assign + advance both
t("assigns cabinet + advances split siblings", () => {
  const r = planYiwuReconcile("X9002653", "GZS260625-5T", [
    s(1, "X9002653-1/2", "2", "", "PR022"),
    s(2, "X9002653-2/2", "2", "", "PR022"),
  ]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.userid, "PR022");
    assert.deepEqual(r.assignCabinetFids.sort(), [1, 2]);
    assert.deepEqual(r.advanceFids.sort(), [1, 2]);
    assert.equal(r.alreadyDone, false);
  }
});

// prefix false-positive: "123" must NOT match "1234-1/2"
t("precise base filter rejects prefix false-positive", () => {
  const r = planYiwuReconcile("123", "GZS1", [s(9, "1234-1/2", "2", "", "PR9")]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /ไม่พบ/);
});

// cross-customer collision → refuse
t("userid-consistency guard blocks cross-customer", () => {
  const r = planYiwuReconcile("X900", "GZS1", [
    s(1, "X900-1/2", "2", "", "PR022"),
    s(2, "X900-2/2", "2", "", "PR999"),
  ]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /ชนข้ามลูกค้า/);
});

// billed row never touched; only the non-billed advances
t("never touches a billed sibling", () => {
  const r = planYiwuReconcile("X900", "GZS1", [
    s(1, "X900-1/2", "2", "", "PR022"),   // non-billed
    s(2, "X900-2/2", "6", "GZS-OLD", "PR022"), // billed → excluded
  ]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.assignCabinetFids, [1]);
    assert.deepEqual(r.advanceFids, [1]);
  }
});

// cabinet already assigned → empty-guard skips it (no overwrite), still advances if early
t("empty-cabinet guard does not overwrite an assigned cabinet", () => {
  const r = planYiwuReconcile("X900", "GZS-NEW", [s(1, "X900", "2", "GZS-EXISTING", "PR022")]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.assignCabinetFids, []);   // cabinet not empty → not overwritten
    assert.deepEqual(r.advanceFids, [1]);        // still advances 2→3
  }
});

// idempotent re-run: already at fstatus 3 with cabinet → nothing to do
t("idempotent when already reconciled", () => {
  const r = planYiwuReconcile("X900", "GZS1", [s(1, "X900", "3", "GZS1", "PR022")]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.alreadyDone, true);
    assert.deepEqual(r.assignCabinetFids, []);
    assert.deepEqual(r.advanceFids, []);
  }
});

// no container in file → advance only, no cabinet write
t("no container → advance only", () => {
  const r = planYiwuReconcile("X900", "", [s(1, "X900", "2", "", "PR022")]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.assignCabinetFids, []);
    assert.deepEqual(r.advanceFids, [1]);
  }
});

// bare base (N=1, no suffix) matches
t("bare base (single-box shipment) matches", () => {
  const r = planYiwuReconcile("X900", "GZS1", [s(1, "X900", "2", "", "PR022")]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.assignCabinetFids, [1]);
});

console.log(`yiwu-packing-match: ${pass} assertions passed`);
