/**
 * REPAIR dangling momo_import_tracks.committed_forwarder_id → deleted tb_forwarder rows.
 *
 * Owner 2026-07-14 "ทำไมยังเกิดอีก": earlier dedup passes (07-13 backfill etc.) deleted
 * duplicate tb_forwarder rows but LEFT momo_import_tracks.committed_forwarder_id pointing
 * at the now-deleted ids. A dangling committed ptr = a RE-COMMIT hazard: the next MOMO
 * sync sees "committed to <gone id>" and can re-create a fresh billable row → a NEW dup.
 * So a dangling ptr is itself an engine that keeps regenerating the dup problem.
 *
 * FIX: for each dangling staging row, re-point committed_forwarder_id to the CURRENT
 * tb_forwarder row for the SAME box (normalize both by stripping "/n" + comparing under
 * the base). If no current row matches the box → re-point to the base's anchor (lowest
 * id) so it stays "committed" (never re-commits); if the base has NO rows at all → leave
 * for manual (flagged). Money-neutral (touches only the staging ptr, never tb_forwarder).
 *
 * DRY-RUN by default. --apply writes.
 * RUN: SUPABASE_DB_PASSWORD=… node scripts/repair-momo-staging-danglers-2026-07-14.mjs [--apply]
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PW)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const norm = (t) => String(t || "").trim().replace(/\/\d+$/, "");

async function main() {
  await c.connect();
  const { rows: dangling } = await c.query(`
    SELECT m.momo_tracking_no, m.committed_forwarder_id::text cfid
    FROM momo_import_tracks m WHERE m.committed_forwarder_id IS NOT NULL
    AND m.committed_forwarder_id::text NOT IN (SELECT id::text FROM tb_forwarder)
    AND m.committed_forwarder_id::text <> '0' ORDER BY m.momo_tracking_no`);
  console.log(`${APPLY ? "*** APPLY ***" : "*** DRY-RUN ***"}  dangling staging ptrs: ${dangling.length}\n`);

  const repoints = [];
  const flagged = [];
  for (const d of dangling) {
    const base = String(d.momo_tracking_no).split("-")[0];
    const { rows: fwd } = await c.query(
      `SELECT id, ftrackingchn FROM tb_forwarder WHERE ftrackingchn=$1 OR ftrackingchn LIKE $1||'-%' ORDER BY id`, [base]);
    if (fwd.length === 0) { flagged.push({ track: d.momo_tracking_no, reason: "base has no rows" }); continue; }
    const key = norm(d.momo_tracking_no);
    const box = fwd.find((r) => norm(r.ftrackingchn) === key);
    const to = box ? box.id : fwd[0].id; // box match, else base anchor
    repoints.push({ track: d.momo_tracking_no, from: d.cfid, to: String(to), how: box ? "box-match" : "base-anchor" });
  }

  for (const r of repoints) console.log(`  ${r.track.padEnd(20)} ${r.from} → ${r.to} (${r.how})`);
  if (flagged.length) { console.log("\nFLAGGED:"); for (const f of flagged) console.log(`  🔴 ${f.track} — ${f.reason}`); }
  console.log(`\nrepoints: ${repoints.length} · flagged: ${flagged.length}`);

  if (APPLY && repoints.length) {
    await c.query("BEGIN");
    try {
      for (const r of repoints) {
        await c.query(`UPDATE momo_import_tracks SET committed_forwarder_id=$1 WHERE momo_tracking_no=$2 AND committed_forwarder_id::text=$3`,
          [r.to, r.track, r.from]);
      }
      await c.query("COMMIT");
      console.log(`*** re-pointed ${repoints.length} staging ptrs ***`);
    } catch (e) { await c.query("ROLLBACK"); console.error("ROLLBACK:", e.message); }
  } else if (!APPLY) console.log("\n*** DRY-RUN — nothing written. --apply to fix. ***");
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
