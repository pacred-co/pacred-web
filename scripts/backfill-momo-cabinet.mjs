#!/usr/bin/env node
/**
 * One-off backfill: populate momo_import_tracks.container_batch_no
 * from momo_container_closed.raw.track_details[].reTrack join.
 *
 * ภูม flag 2026-05-30 (bug 2c · PRIMARY):
 *   import_track.container_no = "PR20260527-SEA01" (MOMO routing batch ID)
 *   container_closed.cid       = "GZS260525-2"     (the REAL cabinet)
 *   container_closed.raw.track_details[].reTrack = tracking_no
 *
 * The new column container_batch_no (added in migration 0126) holds the
 * cabinet on momo_import_tracks. The sync (lib/integrations/momo-isolated/
 * sync.ts step 2.5) populates it going forward; this script handles the
 * existing rows already in prod.
 *
 * USAGE:
 *   1. Apply migration 0126 first (Supabase Dashboard SQL Editor or CLI).
 *   2. Run with the .env.local file that has SUPABASE_SERVICE_ROLE_KEY:
 *
 *      node --env-file=.env.local scripts/backfill-momo-cabinet.mjs
 *
 *   Add APPLY=true to actually write; default is dry-run (read-only).
 *
 *      APPLY=true node --env-file=.env.local scripts/backfill-momo-cabinet.mjs
 *
 * IDEMPOTENT — re-running just overwrites with the same cabinet name. The
 * matching sync step is also idempotent, so this stays in sync once future
 * containers close.
 *
 * READ-ONLY by default. Set APPLY=true to perform the UPDATEs.
 */
import { createClient } from "@supabase/supabase-js";

// ── env ─────────────────────────────────────────────────────────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
  console.error("Run with --env-file=.env.local — e.g.");
  console.error("  node --env-file=.env.local scripts/backfill-momo-cabinet.mjs");
  process.exit(1);
}
const APPLY = process.env.APPLY === "true";

const admin = createClient(url, key, { auth: { persistSession: false } });

console.log(`\nMOMO cabinet backfill — ${APPLY ? "🟢 APPLY" : "🟡 DRY-RUN (set APPLY=true to write)"}`);
console.log(`Target: ${url}\n`);

// ── 1. Load every container_closed row with track_details ──────
console.log("Step 1 — loading momo_container_closed rows…");
const { data: closedRows, error: closedErr } = await admin
  .from("momo_container_closed")
  .select("id, momo_container_no, raw")
  .order("last_synced_at", { ascending: false });

if (closedErr) {
  console.error("FATAL: cannot load momo_container_closed", closedErr);
  process.exit(2);
}

const totalContainers = closedRows?.length ?? 0;
console.log(`  loaded ${totalContainers} container_closed rows\n`);

// ── 2. Walk track_details + collect (cabinet, [reTracks]) pairs ──
console.log("Step 2 — parsing raw.track_details[]…");
let containersWithTracks = 0;
let totalReTracks = 0;
let skippedNoCid = 0;
let skippedNoTracks = 0;
const work = []; // [{ cabinetNo, reTracks: string[] }]
for (const row of closedRows ?? []) {
  const raw = row.raw;
  if (!raw || typeof raw !== "object") {
    skippedNoTracks++;
    continue;
  }
  // The cabinet is `cid`. Some payloads (early sync runs) may have
  // unwrapped raw shape — accept either raw.cid or raw at top level.
  const cabinetNo = typeof raw.cid === "string" && raw.cid.trim() ? raw.cid.trim() : null;
  if (!cabinetNo) {
    skippedNoCid++;
    continue;
  }
  const td = Array.isArray(raw.track_details) ? raw.track_details : [];
  const reTracks = [];
  for (const t of td) {
    if (!t || typeof t !== "object") continue;
    const rt = t.reTrack;
    if (typeof rt === "string" && rt.trim()) reTracks.push(rt.trim());
  }
  if (reTracks.length === 0) {
    skippedNoTracks++;
    continue;
  }
  containersWithTracks++;
  totalReTracks += reTracks.length;
  work.push({ cabinetNo, reTracks });
}
console.log(`  containers with usable cid: ${containersWithTracks}`);
console.log(`  containers skipped (no cid): ${skippedNoCid}`);
console.log(`  containers skipped (no track_details): ${skippedNoTracks}`);
console.log(`  total reTrack entries: ${totalReTracks}\n`);

// ── 3. Pre-flight — how many import_tracks rows would change? ──
console.log("Step 3 — pre-flight check: how many import_tracks would change?");
let preMatched = 0;
let preAlreadyCorrect = 0;
const reportPerCabinet = {};
for (const w of work) {
  const { data: matching, error: lookupErr } = await admin
    .from("momo_import_tracks")
    .select("id, momo_tracking_no, container_batch_no")
    .in("momo_tracking_no", w.reTracks);
  if (lookupErr) {
    console.error(`  lookup failed cabinet=${w.cabinetNo}:`, lookupErr.message);
    continue;
  }
  const n = matching?.length ?? 0;
  preMatched += n;
  const correct = (matching ?? []).filter((m) => m.container_batch_no === w.cabinetNo).length;
  preAlreadyCorrect += correct;
  reportPerCabinet[w.cabinetNo] = { matched: n, alreadyCorrect: correct, willUpdate: n - correct };
}
console.log(`  matching import_tracks rows: ${preMatched}`);
console.log(`  already correctly set: ${preAlreadyCorrect}`);
console.log(`  WILL UPDATE: ${preMatched - preAlreadyCorrect}\n`);

// Top 10 cabinets by row count (sanity-check the data).
const top = Object.entries(reportPerCabinet)
  .sort(([, a], [, b]) => b.matched - a.matched)
  .slice(0, 10);
if (top.length > 0) {
  console.log("Top 10 cabinets by matched rows:");
  for (const [cab, stats] of top) {
    console.log(
      `  ${cab.padEnd(20)} matched=${String(stats.matched).padStart(4)} ` +
      `alreadyOk=${String(stats.alreadyCorrect).padStart(4)} ` +
      `willUpdate=${String(stats.willUpdate).padStart(4)}`,
    );
  }
  console.log();
}

// ── 4. APPLY (or skip in dry-run) momo_import_tracks updates ─────
if (APPLY) {
  console.log("Step 4 — applying momo_import_tracks UPDATEs…");
  let updated = 0;
  let failed = 0;
  const errors = [];
  for (const w of work) {
    const { error: upErr } = await admin
      .from("momo_import_tracks")
      .update({
        container_batch_no: w.cabinetNo,
        updated_at:         new Date().toISOString(),
      })
      .in("momo_tracking_no", w.reTracks);
    if (upErr) {
      failed++;
      errors.push({ cabinet: w.cabinetNo, trackCount: w.reTracks.length, message: upErr.message });
      console.error(`  ✗ cabinet=${w.cabinetNo}: ${upErr.message}`);
    } else {
      updated++;
    }
  }
  console.log(`  cabinets updated: ${updated} · failed: ${failed}`);
} else {
  console.log("Step 4 — 🟡 DRY-RUN · skipping momo_import_tracks writes (Step 5 preview continues).\n");
}

// ── 5. PROPAGATE backfill → tb_forwarder.fcabinetnumber ──────────
// ภูม flag 2026-05-30 evening (post-script): /admin/forwarders ยัง
// แสดงเลขตู้เดิม "PR20260527-SEA02" — เพราะ Step 4 ข้างบนแก้แค่ใน
// momo_import_tracks แต่ rows ใน tb_forwarder ที่ commit ก่อน fix
// ยังเก็บเลข MOMO routing batch เดิมที่ Agent I propagation pipeline
// ใส่ลงไป. ต้อง JOIN + update ที่ tb_forwarder ด้วย.
//
// SAFETY: เฉพาะ rows ที่ fcabinetnumber match pattern MOMO routing
// batch (เช่น "PR####-SEA##", "PR####-EK##") · ไม่แตะ admin's manual
// values หรือ legacy cabinets (GZE/GZS/GZ...).
console.log("\nStep 5 — propagate cabinet to tb_forwarder.fcabinetnumber…");
const MOMO_ROUTING_RX = /^PR\d{8}-(SEA|EK)\d{2}$/;

// Source-of-truth for the (tracking → cabinet) map: the in-memory `work[]`
// plan from Step 2. This way the dry-run preview shows what tb_forwarder
// updates WOULD cascade even before Step 4 writes anything, and APPLY=true
// always sees the freshest map (the same data we'd just write).
//
// We also UNION any already-filled momo_import_tracks rows (e.g. from a
// previous sync) so the cascade fires for legacy commits too.
const trackToCabinet = new Map();
for (const w of work) {
  for (const t of w.reTracks) trackToCabinet.set(t, w.cabinetNo);
}
const { data: filledTracks, error: filledTracksErr } = await admin
  .from("momo_import_tracks")
  .select("momo_tracking_no, container_batch_no")
  .not("container_batch_no", "is", null)
  .not("momo_tracking_no", "is", null);
if (filledTracksErr) {
  console.error("  failed loading filled tracks:", filledTracksErr);
  process.exit(3);
}
for (const r of filledTracks ?? []) {
  if (r.momo_tracking_no && r.container_batch_no && !trackToCabinet.has(r.momo_tracking_no)) {
    trackToCabinet.set(r.momo_tracking_no, r.container_batch_no);
  }
}
console.log(`  tracking → cabinet map: ${trackToCabinet.size} entries (work=${
  work.reduce((n, w) => n + w.reTracks.length, 0)
} + existing=${filledTracks?.length ?? 0})`);

const trackings = Array.from(trackToCabinet.keys());
let fwdMatched = 0, fwdWillUpdate = 0, fwdAlreadyOk = 0, fwdSkippedAdminSet = 0;
const fwdUpdatePlan = []; // [{ id, oldCab, newCab }]

if (trackings.length > 0) {
  // Chunked .in() to avoid PostgREST URL limit (≈200 tracking strings).
  for (let i = 0; i < trackings.length; i += 200) {
    const slice = trackings.slice(i, i + 200);
    const { data: matching, error: matchErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fcabinetnumber")
      .in("ftrackingchn", slice);
    if (matchErr) {
      console.error(`  match chunk ${i} failed:`, matchErr);
      continue;
    }
    for (const f of matching ?? []) {
      fwdMatched++;
      const newCab = trackToCabinet.get(f.ftrackingchn);
      if (!newCab) continue;
      const oldCab = (f.fcabinetnumber ?? "").trim();
      if (oldCab === newCab) {
        fwdAlreadyOk++;
        continue;
      }
      // Safe path 1: empty cell → fill it.
      // Safe path 2: cell currently has a MOMO routing batch ID
      // (PR########-SEA##/EK## pattern) → replace it with real cid.
      // Otherwise: admin has set a manual value → DO NOT TOUCH.
      const isMomoPattern = MOMO_ROUTING_RX.test(oldCab);
      if (oldCab === "" || isMomoPattern) {
        fwdWillUpdate++;
        fwdUpdatePlan.push({ id: f.id, oldCab: oldCab || "(empty)", newCab });
      } else {
        fwdSkippedAdminSet++;
      }
    }
  }
}
console.log(`  tb_forwarder rows matched:   ${fwdMatched}`);
console.log(`  already correct:             ${fwdAlreadyOk}`);
console.log(`  will UPDATE (empty/MOMO):    ${fwdWillUpdate}`);
console.log(`  skipped (admin-set value):   ${fwdSkippedAdminSet}`);

if (fwdUpdatePlan.length > 0 && fwdUpdatePlan.length <= 10) {
  console.log("\n  Preview (first 10):");
  for (const u of fwdUpdatePlan.slice(0, 10)) {
    console.log(`    id=${String(u.id).padStart(6)}  '${u.oldCab.padEnd(22)}' → '${u.newCab}'`);
  }
}

if (APPLY && fwdUpdatePlan.length > 0) {
  console.log(`\n  applying ${fwdUpdatePlan.length} tb_forwarder updates…`);
  let fwdUpdated = 0, fwdFailed = 0;
  for (const u of fwdUpdatePlan) {
    const { error: upErr } = await admin
      .from("tb_forwarder")
      .update({ fcabinetnumber: u.newCab })
      .eq("id", u.id);
    if (upErr) {
      fwdFailed++;
      console.error(`    ✗ id=${u.id}: ${upErr.message}`);
    } else {
      fwdUpdated++;
    }
  }
  console.log(`  tb_forwarder updated: ${fwdUpdated} · failed: ${fwdFailed}`);
} else if (!APPLY && fwdUpdatePlan.length > 0) {
  console.log(`\n  🟡 DRY-RUN — would UPDATE ${fwdUpdatePlan.length} tb_forwarder rows.`);
}

// ── 6. Final tallies ─────────────────────────────────────────────
console.log("\nStep 6 — post-check tallies…");
const { count: pendingNullCount, error: nullErr } = await admin
  .from("momo_import_tracks")
  .select("id", { count: "exact", head: true })
  .is("container_batch_no", null);
const { count: filledCount, error: filledErr } = await admin
  .from("momo_import_tracks")
  .select("id", { count: "exact", head: true })
  .not("container_batch_no", "is", null);
if (nullErr || filledErr) {
  console.error("  count failed:", nullErr || filledErr);
} else {
  console.log(`  momo_import_tracks · container_batch_no IS NULL: ${pendingNullCount}`);
  console.log(`  momo_import_tracks · container_batch_no SET:     ${filledCount}\n`);
}

console.log("✅ Backfill done.");
