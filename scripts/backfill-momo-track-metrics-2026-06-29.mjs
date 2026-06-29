/**
 * Backfill MOMO closed-container weigh-in (weight_kg/cbm) → momo_import_tracks
 * → committed tb_forwarder (fweight/fvolume). One-time data fix for the bug ภูม
 * reported 2026-06-29: PR012 #52105 (tracking 1781683835) showed NO weight/cbm
 * even though MOMO's closed container GZS260620-2 carries 515kg · 1.6267คิว.
 *
 * Root cause (fixed forward in lib/integrations/momo-isolated/sync.ts +
 * propagate.ts): the sync harvest copied the cabinet (cid) but DROPPED kg/cbm,
 * and split trackings ("<base>-i/n") never matched their base-keyed staging row.
 * This script re-derives + back-fills the rows already committed before the fix.
 *
 * SAFE: dry-run by DEFAULT (prints the plan). Pass --apply to write.
 *   - momo_import_tracks: weight_kg/cbm written only when MOMO carries them (>0).
 *   - tb_forwarder: fweight/fvolume FILLED ONLY when currently 0/empty (a
 *     non-zero weight = staff edit / already-billed → never overwritten).
 *
 * Targets DEV via .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * เดฟ runs the equivalent on prod.
 *
 * Run:  pnpm dlx tsx scripts/backfill-momo-track-metrics-2026-06-29.mjs [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });
console.log(`Target: ${url}   mode: ${APPLY ? "APPLY ✍️" : "DRY-RUN 👀"}\n`);

// Mirror of lib/admin/momo-raw-helpers.ts → aggregateTrackDetailMetrics.
// Emits a key for BOTH the exact reTrack (own metric) and the base tracking
// (SUM across "<base>-i/n" parcels). Keep in sync with the SOT helper.
function aggregate(trackDetails) {
  const map = {};
  const add = (k, kg, cbm) => {
    const p = map[k] ?? { kg: 0, cbm: 0 };
    map[k] = { kg: p.kg + kg, cbm: p.cbm + cbm };
  };
  for (const t of Array.isArray(trackDetails) ? trackDetails : []) {
    if (!t || typeof t !== "object") continue;
    const re = typeof t.reTrack === "string" ? t.reTrack.trim() : "";
    if (!re) continue;
    const kg = typeof t.kg === "number" && Number.isFinite(t.kg) ? t.kg : 0;
    const cbm = typeof t.cbm === "number" && Number.isFinite(t.cbm) ? t.cbm : 0;
    add(re, kg, cbm);
    const base = re.replace(/-\d+(\/\d+)?$/, "");
    if (base !== re) add(base, kg, cbm);
  }
  return map;
}

// 1. Read every closed container + its raw.track_details.
const { data: containers, error: ccErr } = await sb
  .from("momo_container_closed")
  .select("container_batch_no, raw");
if (ccErr) {
  console.error("read momo_container_closed failed:", ccErr.message);
  process.exit(1);
}

// 2. Build tracking → {cabinet, kg, cbm}. A tracking can appear in one
//    container only; last cabinet wins (shouldn't collide in practice).
const byTracking = new Map();
for (const c of containers ?? []) {
  const cabinet =
    (c.container_batch_no && String(c.container_batch_no).trim()) ||
    (c.raw && typeof c.raw.cid === "string" ? c.raw.cid.trim() : "");
  if (!cabinet) continue;
  const td = c.raw && Array.isArray(c.raw.track_details) ? c.raw.track_details : [];
  const metrics = aggregate(td);
  for (const [tn, m] of Object.entries(metrics)) {
    byTracking.set(tn, { cabinet, kg: m.kg, cbm: m.cbm });
  }
}
console.log(`Closed containers: ${containers?.length ?? 0} · distinct trackings with metrics: ${byTracking.size}\n`);

// 3. Pull the staging rows for those trackings (need committed_forwarder_id +
//    current weight to decide fills).
const trackings = [...byTracking.keys()];
const staging = new Map();
for (let i = 0; i < trackings.length; i += 300) {
  const slice = trackings.slice(i, i + 300);
  const { data, error } = await sb
    .from("momo_import_tracks")
    .select("momo_tracking_no, weight_kg, cbm, container_batch_no, committed_forwarder_id")
    .in("momo_tracking_no", slice);
  if (error) {
    console.error("read momo_import_tracks failed:", error.message);
    process.exit(1);
  }
  for (const r of data ?? []) staging.set(r.momo_tracking_no, r);
}

// 4. Plan: staging metric writes + forwarder fills.
let stagingWrites = 0;
let fwdFills = 0;
const fwdPlan = [];

for (const [tn, m] of byTracking) {
  const row = staging.get(tn);
  if (!row) continue; // no staging row keyed this way → skip (no-op)
  const wantKg = m.kg > 0 ? Number(m.kg.toFixed(2)) : null;
  const wantCbm = m.cbm > 0 ? Number(m.cbm.toFixed(6)) : null;

  // (a) staging metric write — fill weight_kg/cbm when MOMO carries them and
  //     the staging value is still 0/empty (don't clobber an existing value).
  const stagingNeedsKg = wantKg !== null && !(Number(row.weight_kg ?? 0) > 0);
  const stagingNeedsCbm = wantCbm !== null && !(Number(row.cbm ?? 0) > 0);
  const stagingNeedsCab = m.cabinet && row.container_batch_no !== m.cabinet;
  if (stagingNeedsKg || stagingNeedsCbm || stagingNeedsCab) {
    const upd = { updated_at: new Date().toISOString() };
    if (stagingNeedsKg) upd.weight_kg = wantKg;
    if (stagingNeedsCbm) upd.cbm = wantCbm;
    if (stagingNeedsCab) upd.container_batch_no = m.cabinet;
    stagingWrites += 1;
    if (APPLY) {
      const { error } = await sb.from("momo_import_tracks").update(upd).eq("momo_tracking_no", tn);
      if (error) console.error(`  staging ${tn} FAILED: ${error.message}`);
    }
  }

  // (b) forwarder fill — when committed. Fill weight/cbm (when MOMO has them +
  //     forwarder weight is empty) AND the real cabinet (cid · when empty),
  //     each independently. m.cabinet is always a real cid (GZS…/GZE…) from
  //     momo_container_closed — never a MOMO routing batch — so it's safe.
  if (row.committed_forwarder_id) {
    const { data: f } = await sb
      .from("tb_forwarder")
      .select("id, fweight, fvolume, fcabinetnumber")
      .eq("id", row.committed_forwarder_id)
      .maybeSingle();
    if (f) {
      const upd = {};
      const weightEmpty = !(Number(f.fweight ?? 0) > 0) && !(Number(f.fvolume ?? 0) > 0);
      if (wantKg !== null && weightEmpty) {
        upd.fweight = wantKg;
        upd.fvolume = wantCbm ?? 0;
      }
      if (m.cabinet && (f.fcabinetnumber ?? "").trim() === "") {
        upd.fcabinetnumber = m.cabinet;
      }
      if (Object.keys(upd).length > 0) {
        fwdFills += 1;
        fwdPlan.push(`  fwd #${f.id}  tracking=${tn}  → ${JSON.stringify(upd)}`);
        if (APPLY) {
          const { error } = await sb.from("tb_forwarder").update(upd).eq("id", f.id);
          if (error) console.error(`  fwd #${f.id} FAILED: ${error.message}`);
        }
      }
    }
  }
}

console.log(fwdPlan.join("\n") || "  (no forwarder fills needed)");
console.log(`\nPLAN: ${stagingWrites} staging rows · ${fwdFills} forwarder fills`);
console.log(APPLY ? "✅ APPLIED" : "👀 dry-run only — re-run with --apply to write");
