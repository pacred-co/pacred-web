/**
 * heal-sea0625-cabinet-2026-07-20.mjs — restore the 7 TTW rows whose fcabinetnumber
 * was re-keyed to the printed box label "SEA0625-8211YW" (a packing-batch id, NOT a ตู้)
 * back to the real container "GZS260625-5T".
 *
 * Context (owner 2026-07-20 "เลขกระสอบหลุดมาแทนที่จะอยู่ในตู้"):
 *  - 2026-07-19 session set these rows to GZS260625-5T + fcabinet_locked=true and
 *    verified the container (7 rows · 331kg · 7.3123 cbm · ตรง footer ใบส่งสินค้า).
 *  - Staff (admin_keet/admin_pop) then re-keyed the label THROUGH the lock via
 *    adminUpdateForwarderCabinet (it checked neither the lock nor the id shape).
 *  - The write path is now guarded by lib/forwarder/cabinet-class.ts; this script
 *    heals the stranded data.
 *  - Truth source re-verified today: ttw_packing_line says base X9002653 + X9002661
 *    → container_no = GZS260625-5T; tb_cost_container has the GZS260625-5T rate card.
 *
 * Usage:
 *   DBPW=… node scripts/heal-sea0625-cabinet-2026-07-20.mjs           (dry-run)
 *   DBPW=… node scripts/heal-sea0625-cabinet-2026-07-20.mjs --apply
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const WRONG = "SEA0625-8211YW";
const RIGHT = "GZS260625-5T";
const EXPECTED_BASES = new Set(["X9002653", "X9002661"]);

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
  `SELECT id, ftrackingchn, fcabinetnumber, fstatus, fcabinet_locked, fwarehousename, adminidupdate
   FROM tb_forwarder WHERE fcabinetnumber = $1 ORDER BY id`,
  [WRONG],
);
console.log(`found ${rows.length} rows holding ${WRONG}:`);
for (const r of rows) console.log(`  #${r.id} ${r.ftrackingchn} fstatus=${r.fstatus} locked=${r.fcabinet_locked} by=${r.adminidupdate}`);

if (rows.length === 0) {
  console.log("nothing to heal — already clean.");
  await c.end();
  process.exit(0);
}

// fail-closed: every row must belong to the verified X9002653/X9002661 family
const badBase = rows.filter((r) => !EXPECTED_BASES.has(String(r.ftrackingchn).replace(/-\d+(\/\d+)?$/, "")));
if (badBase.length > 0) {
  console.error("REFUSE — unexpected tracking outside the verified family:", badBase.map((r) => r.ftrackingchn));
  await c.end();
  process.exit(1);
}

if (!APPLY) {
  console.log(`\nDRY-RUN — would set fcabinetnumber → ${RIGHT} on ${rows.length} rows (lock stays true). Re-run with --apply.`);
  await c.end();
  process.exit(0);
}

const backupPath = `scripts/_backup-heal-sea0625-${Date.now()}.json`;
fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2));
console.log(`backup → ${backupPath}`);

await c.query("BEGIN");
const upd = await c.query(
  `UPDATE tb_forwarder SET fcabinetnumber = $1, fcabinet_locked = true
   WHERE fcabinetnumber = $2 RETURNING id`,
  [RIGHT, WRONG],
);
if (upd.rowCount !== rows.length) {
  console.error(`REFUSE — updated ${upd.rowCount} ≠ expected ${rows.length}, rolling back`);
  await c.query("ROLLBACK");
  await c.end();
  process.exit(1);
}
await c.query("COMMIT");
console.log(`applied — ${upd.rowCount} rows → ${RIGHT}`);

const verify = await c.query(
  `SELECT COUNT(*)::int n, ROUND(SUM(fweight)::numeric, 2) wt FROM tb_forwarder WHERE fcabinetnumber = $1`,
  [RIGHT],
);
console.log(`verify: ${RIGHT} now holds ${verify.rows[0].n} rows · Σ weight ${verify.rows[0].wt} kg (expect 7 · 331)`);
await c.end();
