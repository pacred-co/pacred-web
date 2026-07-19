/**
 * fix-ttw-cabinet-from-packing-2026-07-19.mjs — owner 2026-07-19
 *   "ใน TTW เลขตู้เป็นแบบไหนคุยกันแล้ว · ไหงเป็น SEA0625-8211YW"
 *
 * The committed TTW (fwarehousename='9') rows carry a bad container code — the anchor
 * rows hold the MOMO SEA-batch stopgap "SEA0625-8211YW" and the sibling rows hold ''
 * (empty), so report-cnt groups only 2 of 7 rows into the container. The AUTHORITATIVE
 * container number is the ttw_packing_line.container_no (= the owner's packing-list
 * FILENAME · GZS260625-5T etc · the agreed early-TTW "-\d+T" format).
 *
 * Fix per committed TTW row: (1) normalise the known tracking typo X90012661→X9002661,
 * (2) look up the base tracking in ttw_packing_line → set fcabinetnumber to that
 * container_no. DISPLAY/GROUPING only — does NOT re-compute money (stored cost/price
 * unchanged; GZS…-T → sea, consistent with ftransporttype). dry-run + backup.
 * RUN: SUPABASE_DB_PASSWORD='…' node scripts/fix-ttw-cabinet-from-packing-2026-07-19.mjs [--apply]
 */
import pg from "pg";
import { writeFileSync } from "node:fs";
const APPLY = process.argv.includes("--apply");
const PW = process.env.SUPABASE_DB_PASSWORD;
if (!PW) { console.error("SUPABASE_DB_PASSWORD required"); process.exit(1); }
const baseOf = (t) => (t || "").replace(/-\d+\/\d+$/, "").replace(/-\d+$/, "");
const fixTypo = (t) => (t || "").replace(/X90012661/g, "X9002661"); // owner-known typo

async function main() {
  const c = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
    user: "postgres.yzljakczhwrpbxflnmco", password: PW, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await c.connect();

  // authoritative base_tracking → container_no from the packing list
  const pl = (await c.query(`SELECT DISTINCT base_tracking, container_no FROM ttw_packing_line`)).rows;
  const contByBase = new Map(pl.map((r) => [r.base_tracking, r.container_no]));

  const rows = (await c.query(
    `SELECT id, ftrackingchn trk, fcabinetnumber cab FROM tb_forwarder WHERE fwarehousename='9' AND fstatus<>'99' ORDER BY id`)).rows;

  const plan = [];
  const unmatched = [];
  for (const r of rows) {
    const newTrk = fixTypo(r.trk);
    const base = baseOf(newTrk);
    const cont = contByBase.get(base);
    const trkChanged = newTrk !== r.trk;
    const cabChanged = cont && cont !== r.cab;
    if (!cont) { unmatched.push({ id: r.id, trk: r.trk, base }); continue; }
    if (trkChanged || cabChanged) plan.push({ id: r.id, oldTrk: r.trk, newTrk, oldCab: r.cab || "(ว่าง)", newCab: cont, trkChanged, cabChanged });
  }

  console.log(`TTW(wh=9) rows: ${rows.length} · to fix: ${plan.length} · unmatched(no packing): ${unmatched.length}`);
  console.table(plan.map((p) => ({ id: p.id, trk: p.trkChanged ? `${p.oldTrk}→${p.newTrk}` : p.newTrk, cab: `${p.oldCab} → ${p.newCab}` })));
  if (unmatched.length) console.table(unmatched);

  if (!APPLY) { console.log("\n(dry-run — --apply · backup first)"); await c.end(); return; }
  if (plan.length === 0) { console.log("nothing to fix."); await c.end(); return; }

  writeFileSync(`/tmp/backup-fix-ttw-cabinet-2026-07-19.json`, JSON.stringify(rows, null, 2));
  await c.query("BEGIN");
  for (const p of plan) {
    await c.query(`UPDATE tb_forwarder SET ftrackingchn=$1, fcabinetnumber=$2 WHERE id=$3`, [p.newTrk, p.newCab, p.id]);
  }
  await c.query("COMMIT");
  console.log(`\n✅ fixed ${plan.length} TTW rows (tracking typo + container from packing list) · backup /tmp/backup-fix-ttw-cabinet-2026-07-19.json`);
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
