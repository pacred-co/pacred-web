// One-shot reproduction of adminBulkUpdateForwarderTbStatus payload that
// ภูม saw 500 on, using direct DB calls. Tests every column/path the
// action touches, in order — so we surface whichever step fails.

import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const adminId = "3f68c143-bb98-43b4-9b88-PASIT_UUID";
const adminIdSafe = adminId.slice(0, 10);
const fids = [52015];
const fstatus = "1";
const cabinet_number = "GZE-2026-1";
const tracking_th = "TH00012345";
const nowIso = new Date().toISOString();

console.log("=== Step 1: snapshot ===");
const { data: before, error: e1 } = await admin
  .from("tb_forwarder")
  .select("id, fstatus, userid, fidorco, fcabinetnumber, fdatecontainerclose")
  .in("id", fids);
if (e1) { console.error("FAIL snapshot:", e1); process.exit(1); }
console.log("Got", before.length, "rows · fstatus=" + before[0].fstatus);

console.log("\n=== Step 2: update (cabinet backfill path) ===");
const update = {
  fstatus,
  fdateadminstatus: nowIso,
  adminidupdate: adminIdSafe,
  fcabinetnumber: cabinet_number,
  ftrackingth: tracking_th || "-",
};
const needsBackfill = before[0].fdatecontainerclose == null;
const finalUpdate = needsBackfill ? { ...update, fdatecontainerclose: nowIso } : update;
const { error: e2 } = await admin.from("tb_forwarder").update(finalUpdate).in("id", fids);
if (e2) { console.error("FAIL update:", e2); process.exit(1); }
console.log("Update OK · backfilled:", needsBackfill);

console.log("\n=== Step 3: audit log insert ===");
const { error: e3 } = await admin.from("admin_audit_log").insert({
  admin_id: adminId,
  action: "forwarder.bulk_update_tb",
  target_type: "tb_forwarder",
  target_id: "bulk",
  payload: {
    fids,
    before_statuses: before.map(r => ({ id: r.id, fstatus: r.fstatus })),
    after: { fstatus },
  },
});
if (e3) { console.error("FAIL audit log:", e3); process.exit(1); }
console.log("Audit log OK");

console.log("\n=== Step 4: appendStatusLog ===");
// Only fires when fstatus changed. before[0].fstatus === "1", new = "1" → skip
const changed = before.filter(r => r.fstatus !== fstatus);
console.log("changed.length:", changed.length, "(expect 0 → no log)");

console.log("\nALL OK — direct DB path is clean");
