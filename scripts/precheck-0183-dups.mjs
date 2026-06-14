#!/usr/bin/env node
/**
 * READ-ONLY dup-precheck for migration 0183 (create-side UNIQUE constraints).
 *
 * Before adding partial-UNIQUE indexes that close the create-side double-pay
 * holes, confirm there are no PRE-EXISTING duplicate rows among the meaningful
 * values (a dup would make CREATE UNIQUE INDEX fail). Runs SELECTs only — no
 * writes.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='<pw>' node scripts/precheck-0183-dups.mjs --ref <project_ref>
 *   (defaults to prod yzljakczhwrpbxflnmco)
 */
import pg from "pg";

const { Client } = pg;
const refArg = process.argv.indexOf("--ref");
const PROJECT_REF = refArg !== -1 ? process.argv[refArg + 1] : "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }

const POOLER_HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;

// table, column (real prod identifier · quoted where mixed-case), meaningful
// partial-index predicate. NB prod tb_cnt_item uses quoted "fCabinetNumber".
const TARGETS = [
  { table: "tb_cnt_item",              col: `"fCabinetNumber"`, pred: `"fCabinetNumber" <> '' AND "fCabinetNumber" <> '0'` },
  { table: "tb_user_sales",            col: "idf",              pred: "idf > 0" },
  { table: "tb_user_sales_pay",        col: "idus",             pred: "idus > 0" },
  { table: "tb_forwarder_tran_th_sub", col: "fid",              pred: "fid > 0" },
];

async function tryConnect(label, conn) {
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
  await client.connect();
  console.log(`✓ Connected via ${label}`);
  return client;
}

let client = null;
const attempts = [
  ...POOLER_HOSTS.flatMap((h) => [
    { label: `session ${h}:5432`, conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:5432/postgres` },
    { label: `txn ${h}:6543`, conn: `postgresql://${POOLER_USER}:${encodeURIComponent(PASSWORD)}@${h}:6543/postgres` },
  ]),
  { label: "direct 5432", conn: `postgresql://postgres:${encodeURIComponent(PASSWORD)}@${DIRECT_HOST}:5432/postgres` },
];
for (const a of attempts) {
  try { client = await tryConnect(a.label, a.conn); break; }
  catch (e) { console.log(`  ✗ ${a.label}: ${e.code ?? e.message}`); }
}
if (!client) { console.error("FATAL: could not connect."); process.exit(2); }

console.log(`\n=== dup-precheck on ${PROJECT_REF} ===`);
let anyDup = false;
try {
  for (const t of TARGETS) {
    const total = (await client.query(`SELECT COUNT(*)::int n FROM ${t.table}`)).rows[0].n;
    const meaningful = (await client.query(`SELECT COUNT(*)::int n FROM ${t.table} WHERE ${t.pred}`)).rows[0].n;
    const dupQ = `SELECT ${t.col} AS v, COUNT(*)::int c FROM ${t.table} WHERE ${t.pred} GROUP BY ${t.col} HAVING COUNT(*) > 1 ORDER BY c DESC LIMIT 20`;
    const dups = (await client.query(dupQ)).rows;
    const dupGroups = (await client.query(`SELECT COUNT(*)::int n FROM (SELECT 1 FROM ${t.table} WHERE ${t.pred} GROUP BY ${t.col} HAVING COUNT(*) > 1) s`)).rows[0].n;
    const flag = dupGroups > 0 ? "🔴 DUPS" : "🟢 clean";
    console.log(`\n${flag}  ${t.table}.${t.col}  (partial WHERE ${t.pred})`);
    console.log(`   total=${total} · meaningful=${meaningful} · dup-groups=${dupGroups}`);
    if (dupGroups > 0) {
      anyDup = true;
      console.log(`   top dup values:`, dups.map((r) => `${r.v}×${r.c}`).join(", "));
    }
  }
} catch (err) {
  console.error("✗ precheck query failed:", err.code, err.message);
  process.exit(3);
} finally {
  await client.end();
}
console.log(`\n=== RESULT: ${anyDup ? "🔴 DUPLICATES FOUND — resolve before adding UNIQUE" : "🟢 ALL CLEAN — safe to add partial-UNIQUE indexes"} ===`);
process.exit(anyDup ? 10 : 0);
