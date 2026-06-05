#!/usr/bin/env node
/**
 * scripts/swap-two-userids.mjs — DIRECT swap two customer codes A <-> B.
 *
 * Both A and B must EXIST. After the swap: A's rows carry B's code and B's rows
 * carry A's code (they trade places). Uses a transient TEMP code (the lowest
 * CLEAN free PR gap) inside ONE atomic transaction so the unique constraints
 * (tb_users.userID PK · profiles.member_code) never collide:
 *   A → TEMP  ·  B → A  ·  TEMP → B
 * Introspects information_schema for every userid/userID/member_code column.
 * dry-run default; --apply executes (+ a JSON backup). Same safe pattern as
 * swap-userid-pr10683-pr121.mjs but generic + a true A<->B (not A→free).
 *
 *   SUPABASE_DB_PASSWORD='Jirayus40x.' node scripts/swap-two-userids.mjs PR109 PR10190
 *   SUPABASE_DB_PASSWORD='Jirayus40x.' node scripts/swap-two-userids.mjs PR109 PR10190 --apply
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const { Client } = pg;
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const [A, B] = args.filter((a) => !a.startsWith("--"));
if (!A || !B) { console.error("usage: node scripts/swap-two-userids.mjs <A> <B> [--apply]"); process.exit(1); }

const REF = "yzljakczhwrpbxflnmco";
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PW) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const enc = encodeURIComponent(PW);
const POOLER = "aws-0-ap-southeast-1.pooler.supabase.com";
const ATTEMPTS = [
  ["session-pooler", `postgresql://postgres.${REF}:${enc}@${POOLER}:5432/postgres`],
  ["txn-pooler", `postgresql://postgres.${REF}:${enc}@${POOLER}:6543/postgres`],
  ["direct", `postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`],
];
async function connect() {
  for (const [label, conn] of ATTEMPTS) {
    try { const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await c.connect(); console.log(`✓ connected (${label})`); return c; }
    catch (e) { console.log(`  ✗ ${label}: ${e.code ?? "err"} ${e.message}`); }
  }
  throw new Error("could not connect");
}

async function main() {
  console.log(`\n=== SWAP ${A} <-> ${B} · ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);
  const c = await connect();

  // identities
  const who = (await c.query(`SELECT "userID","userName","userLastName","userTel" FROM tb_users WHERE "userID" = ANY($1)`, [[A, B]])).rows;
  for (const code of [A, B]) {
    const u = who.find((r) => r.userID === code);
    if (!u) { console.error(`✗ ${code} not found in tb_users — abort`); process.exit(1); }
    console.log(`  ${code} = ${u.userName ?? ""} ${u.userLastName ?? ""} (tel ${u.userTel ?? "-"})`);
  }

  // introspect + plan
  const cols = (await c.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('userid','userID','member_code') ORDER BY table_name`)).rows;
  console.log(`\nScanning ${cols.length} customer-code columns…`);
  const plan = [];
  for (const t of cols) {
    let rows;
    try { rows = (await c.query(`SELECT "${t.column_name}" v, count(*)::int n FROM "${t.table_name}" WHERE "${t.column_name}" IN ($1,$2) GROUP BY 1`, [A, B])).rows; }
    catch (e) { console.log(`  ⚠ skip ${t.table_name}.${t.column_name}: ${e.message}`); continue; }
    const aN = rows.find((r) => r.v === A)?.n ?? 0;
    const bN = rows.find((r) => r.v === B)?.n ?? 0;
    if (aN || bN) { console.log(`  ${(t.table_name + "." + t.column_name).padEnd(34)} ${A}=${aN}  ${B}=${bN}`); plan.push({ ...t, aN, bN }); }
  }

  // TEMP = lowest CLEAN free PR gap (free in both registries + 0 rows in every plan table)
  const reg = (await c.query(`SELECT "userID" code FROM tb_users WHERE "userID" ~ '^PR[0-9]+$' UNION SELECT member_code FROM profiles WHERE member_code ~ '^PR[0-9]+$'`)).rows;
  const used = new Set(reg.map((r) => parseInt(r.code.slice(2), 10)).filter(Number.isFinite));
  let TEMP = null;
  for (let n = 1; n < 100000; n++) {
    if (used.has(n)) continue;
    const cand = "PR" + String(n).padStart(3, "0");
    let dirty = false;
    for (const t of plan) { if ((await c.query(`SELECT 1 FROM "${t.table_name}" WHERE "${t.column_name}"=$1 LIMIT 1`, [cand])).rows.length) { dirty = true; break; } }
    if (!dirty) { TEMP = cand; break; }
  }
  if (!TEMP) { console.error("✗ no clean temp slot found"); process.exit(1); }

  const totA = plan.reduce((s, p) => s + p.aN, 0), totB = plan.reduce((s, p) => s + p.bN, 0);
  console.log(`\nPLAN: ${A} (${totA} rows) <-> ${B} (${totB} rows) · ${plan.length} tables · via temp ${TEMP}`);

  if (!APPLY) { console.log(`\n— DRY-RUN — re-run with --apply.\n`); await c.end(); return; }

  writeFileSync(`swap-${A}-${B}-backup.json`, JSON.stringify({ A, B, TEMP, who, plan }, null, 2));
  console.log(`✓ backup → swap-${A}-${B}-backup.json`);
  console.log(`\nApplying (single transaction · A→TEMP, B→A, TEMP→B)…`);
  await c.query("BEGIN");
  try {
    for (const t of plan) await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [TEMP, A]);
    for (const t of plan) await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [A, B]);
    for (const t of plan) await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [B, TEMP]);
    await c.query("COMMIT");
    console.log(`✓ COMMIT · ${A} <-> ${B} swapped`);
  } catch (e) { await c.query("ROLLBACK"); console.error(`✗ ROLLBACK — ${e.message} (nothing changed)`); process.exit(3); }

  const v = (await c.query(`SELECT "userID","userName","userLastName" FROM tb_users WHERE "userID" = ANY($1) ORDER BY "userID"`, [[A, B]])).rows;
  console.log("\nVerify:");
  for (const r of v) console.log(`  ${r.userID} = ${r.userName ?? ""} ${r.userLastName ?? ""}`);
  await c.end();
}
main().catch((e) => { console.error("✗ uncaught:", e); process.exit(1); });
