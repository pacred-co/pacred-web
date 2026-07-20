/**
 * revert-ttw-cabinet-to-sea0625-2026-07-20.mjs — owner pivot (2026-07-20):
 * "Packing ID: SEA0625-8211YW ถูกแล้วครับ ให้ยึดใช้เลขตู้ตามนี้ แบบเขาได้เลยครับ ·
 *  เอาตามแพทเทิน อี้อู ที่ทาง TTW ส่งมาเลย ไม่เอาตามที่คิดเอง"
 *
 * Reverts the earlier relabel (SEA0625-8211YW → GZS260625-5T, done under the
 * now-superseded reading that the Packing ID was a batch label):
 *   1. tb_forwarder ids 52177-52183 → fcabinetnumber 'SEA0625-8211YW'
 *      + fcabinet_locked=false (the lock existed to stop "re-keying the label";
 *      the label IS the correct ตู้ per TTW — staff keying it is right, unlock).
 *   2. tb_cost_container id 2776 'GZS260625-5T' → 'SEA0625-8211YW' (เรทบัญชี 2600
 *      ตามไป — cost lookup is exact .eq(fcabinetnumber)).
 *
 * Usage:
 *   DBPW=… node scripts/revert-ttw-cabinet-to-sea0625-2026-07-20.mjs           (dry-run)
 *   DBPW=… node scripts/revert-ttw-cabinet-to-sea0625-2026-07-20.mjs --apply
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const TTW = "SEA0625-8211YW";
const OURS = "GZS260625-5T";
const IDS = [52177, 52178, 52179, 52180, 52181, 52182, 52183];

const c = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco",
  password: process.env.DBPW,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows } = await c.query(
  `SELECT id, ftrackingchn, fcabinetnumber, fstatus, fcabinet_locked
   FROM tb_forwarder WHERE id = ANY($1::bigint[]) ORDER BY id`,
  [IDS],
);
const { rows: cards } = await c.query(
  `SELECT id, fcabinetnumber FROM tb_cost_container WHERE fcabinetnumber IN ($1, $2) ORDER BY id`,
  [OURS, TTW],
);
console.log("forwarder rows:", JSON.stringify(rows));
console.log("cost cards:", JSON.stringify(cards));

const toFlip = rows.filter((r) => r.fcabinetnumber === OURS);
const cardToFlip = cards.find((k) => k.fcabinetnumber === OURS);
const cardAlready = cards.find((k) => k.fcabinetnumber === TTW);

if (toFlip.length === 0 && !cardToFlip) {
  console.log("nothing to revert — already on the TTW id.");
  await c.end();
  process.exit(0);
}
if (toFlip.length > 0 && toFlip.length !== 7) {
  console.error(`REFUSE — expected 7 rows on ${OURS}, found ${toFlip.length}`);
  await c.end();
  process.exit(1);
}
if (cardToFlip && cardAlready) {
  console.error("REFUSE — both cost cards exist; resolve by hand");
  await c.end();
  process.exit(1);
}

if (!APPLY) {
  console.log(`\nDRY-RUN — would set ${toFlip.length} forwarder rows → ${TTW} + unlock, ` +
    `and rename cost card ${cardToFlip ? "#" + cardToFlip.id : "(none)"} → ${TTW}. Re-run with --apply.`);
  await c.end();
  process.exit(0);
}

fs.writeFileSync(`scripts/_backup-revert-ttw-${Date.now()}.json`, JSON.stringify({ rows, cards }, null, 2));

await c.query("BEGIN");
if (toFlip.length > 0) {
  const u1 = await c.query(
    `UPDATE tb_forwarder SET fcabinetnumber = $1, fcabinet_locked = false
     WHERE id = ANY($2::bigint[]) AND fcabinetnumber = $3 RETURNING id`,
    [TTW, IDS, OURS],
  );
  if (u1.rowCount !== toFlip.length) {
    console.error(`REFUSE — updated ${u1.rowCount} ≠ ${toFlip.length}, rolling back`);
    await c.query("ROLLBACK");
    await c.end();
    process.exit(1);
  }
  console.log(`forwarder: ${u1.rowCount} rows → ${TTW} (unlocked)`);
}
if (cardToFlip) {
  const u2 = await c.query(
    `UPDATE tb_cost_container SET fcabinetnumber = $1 WHERE id = $2 AND fcabinetnumber = $3 RETURNING id`,
    [TTW, cardToFlip.id, OURS],
  );
  console.log(`cost card: #${cardToFlip.id} → ${TTW} (${u2.rowCount} row)`);
}
await c.query("COMMIT");

const v = await c.query(
  `SELECT COUNT(*)::int n, ROUND(SUM(fweight)::numeric,2) wt, ROUND(SUM(CASE WHEN famountcount='1' THEN fvolume ELSE fvolume*GREATEST(famount,1) END)::numeric,6) cbm
   FROM tb_forwarder WHERE fcabinetnumber = $1`, [TTW]);
const vc = await c.query(`SELECT id, fcabinetnumber, fproductstype1 FROM tb_cost_container WHERE fcabinetnumber = $1`, [TTW]);
console.log(`verify rows: ${JSON.stringify(v.rows)} (expect 7 · 331 kg)`);
console.log(`verify cost card: ${JSON.stringify(vc.rows)}`);
await c.end();
