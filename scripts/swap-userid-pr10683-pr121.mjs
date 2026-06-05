#!/usr/bin/env node
/**
 * scripts/swap-userid-pr10683-pr121.mjs
 *
 * Owner 2026-06-05 — early-registration code collision: a sales rep sold to a
 * customer who shipped goods into the MOMO warehouse, and the warehouse recorded
 * the goods under PR121 — but that customer is currently coded PR10683. Swap:
 *   - PR10683 (พิสิฏฐ์ กุมมาลือ · 0841113178) → PR121
 *   - PR121   (นาย สนใจพาณิชย์ · 0899284445)  → the LOWEST FREE PR gap ("เลขต่ำที่ว่าง")
 *
 * INTROSPECTS information_schema for EVERY customer-code column
 * (userid / userID / member_code) so NO table is missed — then swaps ALL of them
 * in ONE transaction (safe even if a column is over-included: the WHERE clause
 * only matches customer-code rows):
 *   Step A: PR121   → <gap>   (frees the slot for everyone first)
 *   Step B: PR10683 → PR121
 *
 * DRY-RUN by default (prints the proposed gap + per-table counts + the plan).
 * Pass --apply to execute (writes a JSON backup of the plan first).
 *
 *   SUPABASE_DB_PASSWORD='Jirayus40x.' node scripts/swap-userid-pr10683-pr121.mjs           # dry-run
 *   SUPABASE_DB_PASSWORD='Jirayus40x.' node scripts/swap-userid-pr10683-pr121.mjs --apply   # execute
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");

const A_OLD = "PR10683"; // พิสิฏฐ์ กุมมาลือ
const A_NEW = "PR121";
const B_OLD = "PR121";   // นาย สนใจพาณิชย์ → computed gap

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set"); process.exit(1); }
const POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const enc = encodeURIComponent(PASSWORD);
const ATTEMPTS = [
  [`session-pooler 5432`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:5432/postgres`],
  [`txn-pooler 6543`,     `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:6543/postgres`],
  [`direct 5432`,         `postgresql://postgres:${enc}@${DIRECT_HOST}:5432/postgres`],
];
async function connect() {
  for (const [label, conn] of ATTEMPTS) {
    try {
      const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
      await c.connect();
      console.log(`✓ connected (${label})`);
      return c;
    } catch (e) { console.log(`  ✗ ${label}: ${e.code ?? "err"} ${e.message}`); }
  }
  throw new Error("could not connect to prod via any path");
}

async function main() {
  console.log(`\n=== SWAP customer code · ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);
  const c = await connect();

  // 1. Sanity — both customers exist in tb_users (userID is camelCase).
  const who = await c.query(`SELECT "userID","userName","userLastName","userTel" FROM tb_users WHERE "userID" = ANY($1)`, [[A_OLD, B_OLD]]);
  console.log("\nCustomers:");
  for (const r of who.rows) console.log(`  ${r.userID.padEnd(9)} = ${r.userName} ${r.userLastName} (${r.userTel})`);
  const haveA = who.rows.find((r) => r.userID === A_OLD);
  const haveB = who.rows.find((r) => r.userID === B_OLD);
  if (!haveA || !haveB) { console.error(`✗ expected BOTH ${A_OLD} and ${B_OLD} in tb_users — abort`); process.exit(1); }

  // 2. Introspect EVERY customer-code column.
  const cols = (await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name IN ('userid','userID','member_code')
      ORDER BY table_name`)).rows;

  // 3. Per-column counts for A_OLD + B_OLD (skip columns with 0 of both).
  console.log(`\nScanning ${cols.length} customer-code columns…`);
  const plan = [];
  for (const t of cols) {
    let rows;
    try {
      rows = (await c.query(
        `SELECT "${t.column_name}" AS v, count(*)::int c FROM "${t.table_name}"
          WHERE "${t.column_name}" IN ($1,$2) GROUP BY 1`, [A_OLD, B_OLD])).rows;
    } catch (e) { console.log(`  ⚠ skip ${t.table_name}.${t.column_name}: ${e.message}`); continue; }
    const aC = rows.find((r) => r.v === A_OLD)?.c ?? 0;
    const bC = rows.find((r) => r.v === B_OLD)?.c ?? 0;
    if (aC || bC) {
      console.log(`  ${(t.table_name + "." + t.column_name).padEnd(34)} ${A_OLD}=${aC}  ${B_OLD}=${bC}`);
      plan.push({ ...t, aC, bC });
    }
  }
  const totalA = plan.reduce((s, p) => s + p.aC, 0);
  const totalB = plan.reduce((s, p) => s + p.bC, 0);

  // 4. Lowest free PR gap for B_NEW — must be unused in BOTH registries
  //    (tb_users.userID PK + profiles.member_code UNIQUE) AND have ZERO rows in
  //    EVERY swap table, so Step A (PR121→gap) can't collide on any unique key
  //    nor mix สนใจพาณิชย์'s data into another customer's rows.
  const reg = (await c.query(
    `SELECT "userID" code FROM tb_users WHERE "userID" ~ '^PR[0-9]+$'
      UNION SELECT member_code FROM profiles WHERE member_code ~ '^PR[0-9]+$'`)).rows;
  const used = new Set(reg.map((r) => parseInt(r.code.slice(2), 10)).filter(Number.isFinite));
  let B_NEW = null;
  for (let n = 1; n < 100000; n++) {
    if (used.has(n)) continue;
    const cand = "PR" + String(n).padStart(3, "0");
    let dirty = false;
    for (const t of plan) {
      const hit = await c.query(`SELECT 1 FROM "${t.table_name}" WHERE "${t.column_name}"=$1 LIMIT 1`, [cand]);
      if (hit.rows.length) { dirty = true; break; }
    }
    if (!dirty) { B_NEW = cand; break; }
    console.log(`  (gap ${cand} skipped — orphan rows exist somewhere)`);
  }
  if (!B_NEW) { console.error("✗ no clean free gap found — abort"); process.exit(1); }
  console.log(`\nLowest CLEAN free PR gap → ${B_NEW}  (สนใจพาณิชย์ จะย้ายไปเลขนี้)`);

  console.log(`\nPLAN (${plan.length} tables):`);
  console.log(`  A) ${B_OLD} (สนใจพาณิชย์) → ${B_NEW}      [${totalB} rows]`);
  console.log(`  B) ${A_OLD} (พิสิฏฐ์)      → ${A_NEW}        [${totalA} rows]`);

  if (!APPLY) {
    console.log(`\n— DRY-RUN — owner: confirm สนใจพาณิชย์ → ${B_NEW}, then re-run with --apply.\n`);
    await c.end();
    return;
  }

  // 5. Backup the plan + identity before mutating.
  const bkPath = `swap-pr10683-pr121-backup.json`;
  writeFileSync(bkPath, JSON.stringify({ A_OLD, A_NEW, B_OLD, B_NEW, customers: who.rows, plan }, null, 2));
  console.log(`\n✓ backup → ${bkPath}`);

  // 6. ONE transaction: Step A (free PR121 everywhere) THEN Step B (PR10683→PR121).
  console.log("\nApplying (single transaction)…");
  await c.query("BEGIN");
  try {
    let updB = 0, updA = 0;
    for (const t of plan) updB += (await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [B_NEW, B_OLD])).rowCount;
    for (const t of plan) updA += (await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [A_NEW, A_OLD])).rowCount;
    await c.query("COMMIT");
    console.log(`✓ COMMIT · ${B_OLD}→${B_NEW}: ${updB} rows · ${A_OLD}→${A_NEW}: ${updA} rows`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(`✗ ROLLBACK — ${e.message}\n  (nothing changed)`);
    process.exit(3);
  }

  // 7. Verify tb_users.
  const v = await c.query(`SELECT "userID","userName","userLastName" FROM tb_users WHERE "userID" = ANY($1) ORDER BY "userID"`, [[A_NEW, B_NEW, A_OLD, B_OLD]]);
  console.log("\nVerify tb_users:");
  for (const r of v.rows) console.log(`  ${r.userID.padEnd(9)} = ${r.userName} ${r.userLastName}`);
  console.log(`\n✓ DONE. พิสิฏฐ์ = ${A_NEW} · สนใจพาณิชย์ = ${B_NEW}\n`);
  await c.end();
}
main().catch((e) => { console.error("✗ uncaught:", e); process.exit(1); });
