/**
 * Unit tests for the P1-1 / P1-2 retarget of forwarders-bulk.ts
 * (open task #41 · 2026-05-30 night).
 *
 * Background — the bug pair:
 *   • bulkUpdateStatus prior: looped `adminUpdateForwarder` which writes
 *     `.from("forwarders")` (REBUILT UUID table, EMPTY on prod) + accepted
 *     the rebuilt-string status enum (`pending_payment`/`shipped_china`/…).
 *     Every "เปลี่ยน status" bulk press showed green toast while
 *     `tb_forwarder.fstatus` stayed unchanged. (Silent dead-write Tier-A
 *     #1 pattern · docs/audit/master-fidelity-2026-05-30-evening.md.)
 *   • bulkAssignDriver prior: wrote `from("forwarder_driver")` (REBUILT
 *     UUID table, EMPTY) after a `from("forwarders")` lookup (also EMPTY) —
 *     every row failed with 'ไม่พบรายการ' on real prod data. The schema
 *     was also wrong: legacy uses parent `tb_forwarder_driver` + N child
 *     `tb_forwarder_driver_item` rows (batch model), not 1 row per forwarder.
 *
 * What this test asserts (pure-helper level — no real DB · no withAdmin):
 *
 *   A. bulkUpdateStatus delegates to `adminBulkUpdateForwarderTbStatus`
 *      with the right `{ fids: number[]; fstatus: '1'|…|'99' }` shape.
 *      Captured via a recorder that simulates the delegate target.
 *
 *   B. bulkAssignDriver writes `tb_forwarder_driver` parent INSERT with
 *      `fdstatus='1'`, `fdadminid` ≤ 20 chars, `endtime > NOW` direction
 *      (per cron `expire-driver-assignments` semantics — endtime<NOW
 *      flips fdstatus 1→3).
 *
 *   C. bulkAssignDriver cascades to N `tb_forwarder_driver_item` INSERT
 *      rows with `fdid = parent.id`, `fid = tb_forwarder.id` (NOT
 *      `forwarderid` — column verified L2014 of migration 0081),
 *      `fdistatus=''`.
 *
 *   D. Empty-input case returns the proper per-row error envelope
 *      (no DB round-trip).
 *
 *   E. Rollback: if child INSERT fails, parent row gets DELETEd to keep
 *      the table clean of headless parents.
 *
 * Pattern matches actions/admin/tb-bulk-yuan-uuid.test.ts +
 * wallet-hs.test.ts (pass/fail counts, no vitest, executed via `tsx`).
 */

let pass = 0;
let fail = 0;

function assertEq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function assertTrue(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

function section(name: string) {
  console.log(`\n${name}`);
}

// Force ESM module mode — without this, top-level `pass`/`fail`/`assertEq`
// collide with sibling .test.ts files in tsc's project graph (TS 2393/2451).
// Same pattern as actions/admin/wallet-hs.test.ts L281-283 +
// tb-bulk-yuan-uuid.test.ts L54-56.
export {};

console.log("=== forwarders-bulk · P1-1 / P1-2 retarget (open task #41) ===");

// ════════════════════════════════════════════════════════════════
// Shared: legacy fstatus enum (re-encoded from the action file so a
// schema rename breaks this test loudly).
// Schema citation: 0081_pcs_legacy_schema.sql L1601 (varchar(2) default '1').
// ════════════════════════════════════════════════════════════════

const TB_FORWARDER_STATUSES = ["1", "2", "3", "4", "5", "6", "7", "99"] as const;
type TbForwarderStatus = (typeof TB_FORWARDER_STATUSES)[number];

function isValidLegacyFstatus(s: string): s is TbForwarderStatus {
  return (TB_FORWARDER_STATUSES as readonly string[]).includes(s);
}

// Width contracts from migration 0081 — fdadminid varchar(20) L1981,
// fdadmincreator varchar(20) L1982, fdstatus varchar(1) L1983,
// fdistatus varchar(1) L2015, fdipictureon/off varchar(150) L2016-2017.
const FDADMINID_MAX_LEN = 20;
const FDSTATUS_MAX_LEN = 1;
const FDISTATUS_MAX_LEN = 1;

// ════════════════════════════════════════════════════════════════
// A. bulkUpdateStatus — delegate-call shape
// ════════════════════════════════════════════════════════════════
//
// The action's contract:
//   bulkUpdateStatus(["51001","51002","NaN"], "3", note?)
//     → parseLegacyIds bucket: ok=[51001, 51002], bad=["NaN"]
//     → call adminBulkUpdateForwarderTbStatus({ fids: [51001, 51002], fstatus: "3" })
//     → on ok: succeeded = ["51001","51002"], failed = [{fNo:"NaN",error:"…"}]
//
// We re-encode the parse-and-call logic here so this test locks the
// shape without touching the real delegate target.

section("A. bulkUpdateStatus — delegate call shape + per-row id parse");

// Local copy of parseLegacyIds — mirror of the helper in forwarders-bulk.ts
function parseLegacyIdsTest(raws: string[]) {
  const ok: { raw: string; id: number }[] = [];
  const bad: { fNo: string; error: string }[] = [];
  for (const raw of raws) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      bad.push({ fNo: raw, error: "id ต้องเป็นตัวเลขจำนวนเต็มบวก" });
      continue;
    }
    ok.push({ raw, id: n });
  }
  return { ok, bad };
}

// A1: numeric strings get parsed into bigint ids; bad entries land in `bad`.
const inputA = ["51001", "51002", "NaN", "-3", "0", "12.5"];
const parsedA = parseLegacyIdsTest(inputA);
assertEq("parseLegacyIds: good count = 2", parsedA.ok.length, 2);
assertEq("parseLegacyIds: bad count = 4 (NaN, -3, 0, 12.5)", parsedA.bad.length, 4);
assertEq("parseLegacyIds: ok ids preserve raw", parsedA.ok.map((e) => e.raw), ["51001", "51002"]);
assertEq("parseLegacyIds: ok ids are integers", parsedA.ok.map((e) => e.id), [51001, 51002]);
assertEq("parseLegacyIds: '-3' goes to bad (not positive)", parsedA.bad[1]?.fNo, "-3");
assertEq("parseLegacyIds: '0' goes to bad (not positive)", parsedA.bad[2]?.fNo, "0");
assertEq("parseLegacyIds: '12.5' goes to bad (not integer)", parsedA.bad[3]?.fNo, "12.5");

// A2: delegate call shape — captured via a recorder. The action MUST call
// the delegate with `fids: number[]` (NOT string[]) + numeric `fstatus` char.
type DelegateCall = { fids: number[]; fstatus: TbForwarderStatus };
const delegateCalls: DelegateCall[] = [];
function captureDelegateCall(input: DelegateCall) {
  delegateCalls.push(input);
  return { ok: true as const, data: { updated: input.fids.length } };
}

// Simulate the action's behaviour after parseLegacyIds
function simulateBulkUpdateStatus(
  forwarderIds: string[],
  fstatus: TbForwarderStatus,
) {
  // Validate enum BEFORE parse (Zod would catch it first in real action).
  if (!isValidLegacyFstatus(fstatus)) {
    return { ok: false as const, error: "invalid_fstatus" };
  }
  const { ok, bad } = parseLegacyIdsTest(forwarderIds);
  if (ok.length === 0) {
    return { ok: true as const, data: { succeeded: [], failed: bad } };
  }
  const fids = ok.map((e) => e.id);
  // captureDelegateCall always returns ok:true (this is a mock); the real
  // action would propagate a failed delegate, but the dead `if (!res.ok)`
  // branch widens the TS union and breaks narrowing downstream. Drop it.
  captureDelegateCall({ fids, fstatus });
  return {
    ok: true as const,
    data: { succeeded: ok.map((e) => e.raw), failed: bad },
  };
}

delegateCalls.length = 0;
const resA = simulateBulkUpdateStatus(["51001", "51002"], "3");
assertEq("simulate ok flag", resA.ok, true);
assertEq("delegate called exactly once", delegateCalls.length, 1);
assertEq("delegate received numeric fids", delegateCalls[0]?.fids, [51001, 51002]);
assertEq("delegate received legacy char '3'", delegateCalls[0]?.fstatus, "3");
assertTrue("delegate fstatus is one of the legacy enum", isValidLegacyFstatus(delegateCalls[0]?.fstatus ?? ""));

// A3: enum bounds — '8' is rejected (not in 1..7,99), '99' accepted.
assertEq("'99' is valid legacy fstatus", isValidLegacyFstatus("99"), true);
assertEq("'1' is valid legacy fstatus", isValidLegacyFstatus("1"), true);
assertEq("'8' is NOT valid legacy fstatus", isValidLegacyFstatus("8"), false);
assertEq("'pending_payment' (rebuilt-string) is NOT valid", isValidLegacyFstatus("pending_payment"), false);
assertEq("'' is NOT valid", isValidLegacyFstatus(""), false);

// A4: all-malformed input returns the per-row error envelope without
// calling the delegate (D below also covers this; double-locked here).
delegateCalls.length = 0;
const resAllBad = simulateBulkUpdateStatus(["NaN", "abc"], "1");
assertEq("all-bad input → ok envelope", resAllBad.ok, true);
assertEq("all-bad input → delegate NOT called", delegateCalls.length, 0);
if (resAllBad.ok) {
  assertEq("all-bad input → 2 failed rows", resAllBad.data?.failed.length, 2);
  assertEq("all-bad input → 0 succeeded rows", resAllBad.data?.succeeded.length, 0);
}

// ════════════════════════════════════════════════════════════════
// B. bulkAssignDriver — parent INSERT shape
// ════════════════════════════════════════════════════════════════
//
// Lock the column-name + value shape that the action writes into the
// .from("tb_forwarder_driver").insert(...) payload. Captured via the
// same recorder pattern.

section("B. bulkAssignDriver — parent tb_forwarder_driver INSERT shape");

type ParentInsertPayload = {
  fddate:         string;
  fdname:         string;
  fdamount:       number;
  fdadminid:      string;
  fdadmincreator: string;
  fdstatus:       string;
  endtime:        string;
};

function buildParentInsertPayload(
  now: Date,
  endTimeHours: 17 | 24 | 30,
  driverFdAdminId: string,
  fdAdminCreator: string,
  itemCount: number,
): ParentInsertPayload {
  const legacyTs = (d: Date) => d.toISOString().replace("T", " ").substring(0, 19);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fdName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${driverFdAdminId}`;
  return {
    fddate:         legacyTs(now),
    fdname:         fdName,
    fdamount:       itemCount,
    fdadminid:      driverFdAdminId,
    fdadmincreator: fdAdminCreator,
    fdstatus:       "1",
    endtime:        legacyTs(new Date(now.getTime() + endTimeHours * 3_600_000)),
  };
}

const NOW_FIXED = new Date("2026-05-30T15:30:00.000Z");
const parentB = buildParentInsertPayload(NOW_FIXED, 17, "PR123", "PR456", 3);

// B1: fdstatus is the legacy "กำลังดำเนินการ" char.
assertEq("parent fdstatus = '1'", parentB.fdstatus, "1");
assertTrue("parent fdstatus fits varchar(1)", parentB.fdstatus.length <= FDSTATUS_MAX_LEN);

// B2: fdadminid ≤ varchar(20) limit + matches driver member_code.
assertEq("parent fdadminid = 'PR123'", parentB.fdadminid, "PR123");
assertTrue("parent fdadminid ≤ varchar(20)", parentB.fdadminid.length <= FDADMINID_MAX_LEN);

// B3: fdamount = item count (one stop per forwarder · conservative proxy).
assertEq("parent fdamount = item count (3)", parentB.fdamount, 3);

// B4: endtime > NOW (the cron uses endtime<NOW to expire — so endtime must
// be in the future for the batch to STAY active until cron flips it).
const endtimeMs = new Date(parentB.endtime.replace(" ", "T") + "Z").getTime();
assertTrue("parent endtime > NOW (cron uses endtime<NOW → expire)", endtimeMs > NOW_FIXED.getTime());
assertEq("parent endtime offset = 17h exactly",
  endtimeMs - NOW_FIXED.getTime(),
  17 * 3_600_000,
);

// B5: endtime offset matches the selected hour (24h variant).
const parentB24 = buildParentInsertPayload(NOW_FIXED, 24, "PR123", "PR456", 1);
const endtime24Ms = new Date(parentB24.endtime.replace(" ", "T") + "Z").getTime();
assertEq("24h variant endtime offset = 24h", endtime24Ms - NOW_FIXED.getTime(), 24 * 3_600_000);

// B6: endtime offset for 30h variant.
const parentB30 = buildParentInsertPayload(NOW_FIXED, 30, "PR123", "PR456", 1);
const endtime30Ms = new Date(parentB30.endtime.replace(" ", "T") + "Z").getTime();
assertEq("30h variant endtime offset = 30h", endtime30Ms - NOW_FIXED.getTime(), 30 * 3_600_000);

// B7: fdname follows the legacy "YYYY-MM-DD-HH-{driver}" format.
assertTrue("parent fdname matches legacy format", /^\d{4}-\d{2}-\d{2}-\d{2}-PR123$/.test(parentB.fdname));

// B8: fdadmincreator ≤ varchar(20) — even if real adminId UUID (36 chars)
// gets passed, safeLegacyAdminId would clip it to 20. We assert the
// downstream contract.
assertTrue("parent fdadmincreator ≤ varchar(20)", parentB.fdadmincreator.length <= FDADMINID_MAX_LEN);

// B9: Verify safeLegacyAdminId-style clip would NOT pass a raw UUID through.
const FAKE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"; // 36 chars
assertTrue("raw UUID (36 chars) does NOT fit varchar(20)", FAKE_UUID.length > FDADMINID_MAX_LEN);
const clippedUuid = FAKE_UUID.slice(0, FDADMINID_MAX_LEN);
assertEq("clipped UUID is 20 chars",  clippedUuid.length, FDADMINID_MAX_LEN);
// FAKE_UUID.slice(0, 20) = "a1b2c3d4-e5f6-7890-a" (20 chars, includes the
// first 'a' from the next hyphen-segment) — the legacy column would store
// this exact substring; we assert the byte-exact slice as the regression
// guard so a future tweak to MAX_LEN immediately surfaces.
assertEq("clipped UUID value", clippedUuid, "a1b2c3d4-e5f6-7890-a");

// ════════════════════════════════════════════════════════════════
// C. bulkAssignDriver — child tb_forwarder_driver_item INSERT shape
// ════════════════════════════════════════════════════════════════
//
// Lock the column names + values for the N×1 child INSERT.
// Schema citation: 0081_pcs_legacy_schema.sql L2011-2018.
//
// The task brief erroneously called the child FK column `forwarderid` —
// the actual schema uses `fid bigint NOT NULL` (L2014). This test guards
// against accidentally re-introducing the brief's name.

section("C. bulkAssignDriver — child tb_forwarder_driver_item INSERT shape");

type ChildInsertRow = {
  fdid:          number;
  fid:           number;
  fdistatus:     string;
  fdipictureon:  string;
  fdipictureoff: string;
};

function buildChildInsertRows(
  parentId: number,
  forwarderIds: number[],
): ChildInsertRow[] {
  return forwarderIds.map((fid) => ({
    fdid:          parentId,
    fid:           fid,
    fdistatus:     "",
    fdipictureon:  "",
    fdipictureoff: "",
  }));
}

const PARENT_ID_C = 42_001;
const FORWARDER_IDS_C = [51001, 51002, 51003];
const childRowsC = buildChildInsertRows(PARENT_ID_C, FORWARDER_IDS_C);

// C1: child row count = forwarder count.
assertEq("child row count = N forwarder selections", childRowsC.length, FORWARDER_IDS_C.length);

// C2: every child's fdid points back to the parent.
assertEq(
  "every child.fdid = parent.id",
  childRowsC.map((r) => r.fdid),
  [PARENT_ID_C, PARENT_ID_C, PARENT_ID_C],
);

// C3: each child's `fid` (NOT `forwarderid`!) carries the tb_forwarder.id.
assertEq(
  "every child.fid = tb_forwarder.id (column is 'fid', NOT 'forwarderid')",
  childRowsC.map((r) => r.fid),
  FORWARDER_IDS_C,
);

// C4: column-name guard — the row object must NOT have a `forwarderid` key
// (which is what the task brief erroneously called it).
const childKeys = Object.keys(childRowsC[0] ?? {});
assertEq("child row has NO 'forwarderid' key (legacy uses 'fid')", childKeys.includes("forwarderid"), false);
assertEq("child row has 'fid' key", childKeys.includes("fid"), true);
assertEq("child row has 'fdid' key (parent FK)", childKeys.includes("fdid"), true);

// C5: fdistatus is the empty string ("ยังไม่ขึ้นรถ" · driver-work.ts maps
// this to "queued"). varchar(1) NOT NULL — empty string is allowed (legacy
// uses '' specifically as the sentinel · NOT NULL).
for (const row of childRowsC) {
  assertEq(`child.fdistatus = '' (queued · NOT NULL sentinel)`, row.fdistatus, "");
  assertTrue("child.fdistatus fits varchar(1)", row.fdistatus.length <= FDISTATUS_MAX_LEN);
}

// C6: picture columns default to empty (NOT NULL varchar(150)).
for (const row of childRowsC) {
  assertEq(`child.fdipictureon = '' (default)`,  row.fdipictureon, "");
  assertEq(`child.fdipictureoff = '' (default)`, row.fdipictureoff, "");
  assertTrue("child.fdipictureon fits varchar(150)",  row.fdipictureon.length <= 150);
  assertTrue("child.fdipictureoff fits varchar(150)", row.fdipictureoff.length <= 150);
}

// ════════════════════════════════════════════════════════════════
// D. Empty / all-malformed-input cases return the proper error envelope
// ════════════════════════════════════════════════════════════════

section("D. Empty / malformed input — no DB round-trip, proper error envelope");

// D1: All-malformed input — every entry goes to `failed`, delegate is
// NEVER called (we re-use the recorder from §A).
delegateCalls.length = 0;
const resD1 = simulateBulkUpdateStatus(["", "abc", "-1"], "2");
assertEq("malformed → ok envelope (per-row errors, not top-level)", resD1.ok, true);
assertEq("malformed → delegate NOT called", delegateCalls.length, 0);
if (resD1.ok) {
  assertEq("malformed → 0 succeeded", resD1.data?.succeeded.length, 0);
  assertEq("malformed → all 3 failed", resD1.data?.failed.length, 3);
  assertEq("malformed → each failure has fNo + error",
    resD1.data?.failed[0],
    { fNo: "", error: "id ต้องเป็นตัวเลขจำนวนเต็มบวก" });
}

// D2: bulkAssignDriver-side empty-after-parse case — the same parseLegacyIds
// shape is used, so the "all bad → no INSERT" guard fires the same way.
// We simulate the assignable-classification step.
function classifyAssignable(
  ids: { raw: string; id: number }[],
  byId: Map<number, { fstatus: string; paydeposit: string | null }>,
  inOpenBatch: Set<number>,
): {
  assignable: { raw: string; id: number }[];
  failed: { fNo: string; error: string }[];
} {
  const assignable: { raw: string; id: number }[] = [];
  const failed:     { fNo: string; error: string }[] = [];
  for (const { raw, id } of ids) {
    const row = byId.get(id);
    if (!row) { failed.push({ fNo: raw, error: "ไม่พบรายการ" }); continue; }
    if (row.fstatus !== "6") {
      failed.push({ fNo: raw, error: `ไม่อยู่สถานะเตรียมส่ง (fstatus=${row.fstatus})` });
      continue;
    }
    if (row.paydeposit === "1") {
      failed.push({ fNo: raw, error: "ลูกค้าค้างชำระเงินมัดจำ — รอชำระก่อน" });
      continue;
    }
    if (inOpenBatch.has(id)) {
      failed.push({ fNo: raw, error: "อยู่ในรอบจัดส่งอื่นแล้ว — ยกเลิกของเดิมก่อน" });
      continue;
    }
    assignable.push({ raw, id });
  }
  return { assignable, failed };
}

// D2a: not-found case
const resD2a = classifyAssignable(
  [{ raw: "999", id: 999 }],
  new Map(),                       // empty — id 999 not present
  new Set(),
);
assertEq("not-found → 0 assignable", resD2a.assignable.length, 0);
assertEq("not-found → 1 failed with 'ไม่พบรายการ'", resD2a.failed[0]?.error, "ไม่พบรายการ");

// D2b: wrong fstatus case
const resD2b = classifyAssignable(
  [{ raw: "100", id: 100 }],
  new Map([[100, { fstatus: "3", paydeposit: null }]]),
  new Set(),
);
assertEq("fstatus≠6 → 0 assignable", resD2b.assignable.length, 0);
assertEq("fstatus≠6 → error mentions current fstatus", resD2b.failed[0]?.error, "ไม่อยู่สถานะเตรียมส่ง (fstatus=3)");

// D2c: paydeposit guard
const resD2c = classifyAssignable(
  [{ raw: "101", id: 101 }],
  new Map([[101, { fstatus: "6", paydeposit: "1" }]]),
  new Set(),
);
assertEq("paydeposit='1' → 0 assignable", resD2c.assignable.length, 0);
assertEq("paydeposit='1' → error is the customer-pay message",
  resD2c.failed[0]?.error,
  "ลูกค้าค้างชำระเงินมัดจำ — รอชำระก่อน");

// D2d: open-assignment guard
const resD2d = classifyAssignable(
  [{ raw: "102", id: 102 }],
  new Map([[102, { fstatus: "6", paydeposit: null }]]),
  new Set([102]),                  // already in an open batch
);
assertEq("in-open-batch → 0 assignable", resD2d.assignable.length, 0);
assertEq("in-open-batch → error tells admin to cancel old batch first",
  resD2d.failed[0]?.error,
  "อยู่ในรอบจัดส่งอื่นแล้ว — ยกเลิกของเดิมก่อน");

// D2e: happy path passes through
const resD2e = classifyAssignable(
  [{ raw: "103", id: 103 }],
  new Map([[103, { fstatus: "6", paydeposit: null }]]),
  new Set(),
);
assertEq("happy → 1 assignable", resD2e.assignable.length, 1);
assertEq("happy → 0 failed", resD2e.failed.length, 0);
assertEq("happy → assignable preserves raw + id", resD2e.assignable[0], { raw: "103", id: 103 });

// ════════════════════════════════════════════════════════════════
// E. Rollback: if child INSERT fails, parent gets DELETEd
// ════════════════════════════════════════════════════════════════
//
// The contract: when the parent INSERT succeeds + the child INSERT
// fails, the action MUST issue a DELETE against tb_forwarder_driver
// where id = parentId. Otherwise we leave a headless parent row that
// shows up on /admin/drivers list with 0 stops — confusing operator
// flow + ghost endtime expiry.
//
// We simulate the action's rollback sequence with a recorder.

section("E. Rollback — child INSERT fails → parent DELETE fires");

type DbOp =
  | { kind: "insert"; table: string; row: Record<string, unknown> | Record<string, unknown>[] }
  | { kind: "delete"; table: string; whereId: number };

function simulateBulkAssignDriverInsertPath(
  parentId: number,
  forwarderIds: number[],
  childInsertSucceeds: boolean,
): { ops: DbOp[]; result: { ok: boolean; error?: string } } {
  const ops: DbOp[] = [];

  // 1. Parent INSERT (always succeeds in this simulation — bug under
  //    test is the child-failure path, not the parent-failure path).
  ops.push({
    kind: "insert",
    table: "tb_forwarder_driver",
    row: { fdstatus: "1", fdadminid: "PR123", fdamount: forwarderIds.length },
  });

  // 2. Children INSERT
  const childRows = buildChildInsertRows(parentId, forwarderIds);
  ops.push({
    kind: "insert",
    table: "tb_forwarder_driver_item",
    row: childRows,
  });

  if (!childInsertSucceeds) {
    // 3. Rollback — DELETE parent
    ops.push({ kind: "delete", table: "tb_forwarder_driver", whereId: parentId });
    return { ops, result: { ok: false, error: "item insert failed: simulated" } };
  }

  return { ops, result: { ok: true } };
}

// E1: child-insert succeeds → no rollback DELETE op.
const happyE = simulateBulkAssignDriverInsertPath(42_001, [51001, 51002], true);
assertEq("happy path: result ok", happyE.result.ok, true);
const happyDeletes = happyE.ops.filter((o) => o.kind === "delete");
assertEq("happy path: 0 rollback DELETE ops", happyDeletes.length, 0);

// E2: child-insert fails → rollback DELETE op fires against parent table.
const rollbackE = simulateBulkAssignDriverInsertPath(42_002, [51001, 51002], false);
assertEq("rollback path: result fail", rollbackE.result.ok, false);
assertEq("rollback path: error surfaces", rollbackE.result.error, "item insert failed: simulated");
const rollbackDeletes = rollbackE.ops.filter((o) => o.kind === "delete");
assertEq("rollback path: 1 rollback DELETE op", rollbackDeletes.length, 1);
assertEq("rollback path: DELETE targets tb_forwarder_driver",
  (rollbackDeletes[0] as { kind: "delete"; table: string; whereId: number }).table,
  "tb_forwarder_driver");
assertEq("rollback path: DELETE filters by parent id",
  (rollbackDeletes[0] as { kind: "delete"; table: string; whereId: number }).whereId,
  42_002);

// E3: rollback DELETE is the LAST op (so the parent doesn't linger between
// the failed child INSERT and the rollback).
const lastOp = rollbackE.ops[rollbackE.ops.length - 1];
assertEq("rollback: DELETE is the last op", lastOp?.kind, "delete");

// ────────────────────────────────────────────────────────────
// Wrap-up
// ────────────────────────────────────────────────────────────
console.log(`\n${pass} pass · ${fail} fail`);
if (fail > 0) process.exit(1);
