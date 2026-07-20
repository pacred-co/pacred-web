/**
 * heal-jym-placeholder-2026-07-20.mjs — #52576 (JYM188058949964-2) still holds the
 * MOMO routing placeholder PR20260701-EK01; the real container is GZE260704-1,
 * proven 3 ways: staging base-row container_batch_no + momo_box_detail.container_name
 * + sibling #52308 (JYM188058949964) already sits in GZE260704-1.
 * Usage: DBPW=… node scripts/heal-jym-placeholder-2026-07-20.mjs [--apply]
 */
import pg from "pg";
import fs from "node:fs";
const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ host: "aws-1-ap-southeast-1.pooler.supabase.com", port: 5432,
  user: "postgres.yzljakczhwrpbxflnmco", password: process.env.DBPW, database: "postgres",
  ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  `SELECT id, ftrackingchn, fcabinetnumber, fstatus FROM tb_forwarder
   WHERE id = 52576 AND fcabinetnumber = 'PR20260701-EK01'`);
console.log("target:", JSON.stringify(rows));
if (rows.length !== 1) { console.log("nothing to heal (already fixed or changed)"); await c.end(); process.exit(0); }
if (!APPLY) { console.log("DRY-RUN — would set #52576 fcabinetnumber → GZE260704-1. Re-run with --apply."); await c.end(); process.exit(0); }
fs.writeFileSync(`scripts/_backup-heal-jym-${Date.now()}.json`, JSON.stringify(rows, null, 2));
const upd = await c.query(
  `UPDATE tb_forwarder SET fcabinetnumber = 'GZE260704-1'
   WHERE id = 52576 AND fcabinetnumber = 'PR20260701-EK01' RETURNING id, fcabinetnumber`);
console.log("applied:", JSON.stringify(upd.rows));
await c.end();
