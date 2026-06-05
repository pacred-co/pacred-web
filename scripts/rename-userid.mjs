#!/usr/bin/env node
/**
 * scripts/rename-userid.mjs — rename a customer code OLD → NEW across ALL tables.
 *
 * For when a customer's code must change to a FREE number (e.g. the warehouse /
 * shipping mark already used a different code). NEW must be FREE — not in
 * tb_users.userID, not in profiles.member_code, and zero rows in EVERY
 * customer-code column. If NEW is TAKEN it's a SWAP, not a rename → abort + use
 * scripts/swap-userid-pr10683-pr121.mjs as the template.
 *
 * Introspects information_schema for every userid/userID/member_code column →
 * ONE atomic transaction (all-or-nothing). dry-run default; --apply executes
 * (+ a JSON backup). Same safe pattern as the swap tool.
 *
 *   SUPABASE_DB_PASSWORD='Jirayus40x.' node scripts/rename-userid.mjs PR109 PR10190
 *   SUPABASE_DB_PASSWORD='Jirayus40x.' node scripts/rename-userid.mjs PR109 PR10190 --apply
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const { Client } = pg;
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const [OLD, NEW] = args.filter((a) => !a.startsWith("--"));
if (!OLD || !NEW) { console.error("usage: node scripts/rename-userid.mjs <OLD> <NEW> [--apply]"); process.exit(1); }

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const enc = encodeURIComponent(PASSWORD);
const POOLER = "aws-0-ap-southeast-1.pooler.supabase.com";
const ATTEMPTS = [
  ["session-pooler", `postgresql://postgres.${PROJECT_REF}:${enc}@${POOLER}:5432/postgres`],
  ["txn-pooler", `postgresql://postgres.${PROJECT_REF}:${enc}@${POOLER}:6543/postgres`],
  ["direct", `postgresql://postgres:${enc}@db.${PROJECT_REF}.supabase.co:5432/postgres`],
];
async function connect() {
  for (const [label, conn] of ATTEMPTS) {
    try { const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await c.connect(); console.log(`✓ connected (${label})`); return c; }
    catch (e) { console.log(`  ✗ ${label}: ${e.code ?? "err"} ${e.message}`); }
  }
  throw new Error("could not connect to prod");
}

async function main() {
  console.log(`\n=== RENAME ${OLD} → ${NEW} · ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);
  const c = await connect();

  // 1. SOURCE identity + corporate (so we confirm the right customer).
  const who = (await c.query(`SELECT "userID","userName","userLastName","userTel","userCompany" FROM tb_users WHERE "userID"=$1`, [OLD])).rows[0];
  if (!who) { console.error(`✗ ${OLD} not found in tb_users — abort`); process.exit(1); }
  console.log(`Source: ${who.userID} = ${who.userName ?? ""} ${who.userLastName ?? ""} · tel ${who.userTel ?? "-"} · company=${who.userCompany}`);
  const corp = (await c.query(`SELECT corporatename, corporatenumber, corporateaddress, corporatestatus FROM tb_corporate WHERE userid=$1`, [OLD])).rows[0];
  console.log(`Corporate: ${corp ? `${corp.corporatename ?? "?"} · taxID ${corp.corporatenumber ?? "-"} · status ${corp.corporatestatus ?? "-"}` : "(none)"}`);
  if (corp?.corporateaddress) console.log(`           addr: ${corp.corporateaddress}`);

  // 2. TARGET must be FREE.
  const inUsers = (await c.query(`SELECT 1 FROM tb_users WHERE "userID"=$1`, [NEW])).rows.length;
  const inProfiles = (await c.query(`SELECT 1 FROM profiles WHERE member_code=$1`, [NEW])).rows.length;
  if (inUsers || inProfiles) { console.error(`\n✗ ${NEW} is TAKEN (tb_users=${inUsers} profiles=${inProfiles}) — this is a SWAP, not a rename. Abort.`); process.exit(1); }

  // 3. Introspect every customer-code column + count OLD/NEW per column.
  const cols = (await c.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('userid','userID','member_code') ORDER BY table_name`)).rows;
  console.log(`\nScanning ${cols.length} customer-code columns…`);
  const plan = [];
  let dirty = false;
  for (const t of cols) {
    let rows;
    try { rows = (await c.query(`SELECT "${t.column_name}" v, count(*)::int n FROM "${t.table_name}" WHERE "${t.column_name}" IN ($1,$2) GROUP BY 1`, [OLD, NEW])).rows; }
    catch (e) { console.log(`  ⚠ skip ${t.table_name}.${t.column_name}: ${e.message}`); continue; }
    const oldN = rows.find((r) => r.v === OLD)?.n ?? 0;
    const newN = rows.find((r) => r.v === NEW)?.n ?? 0;
    if (newN) { console.error(`  ✗ ${t.table_name}.${t.column_name} ALREADY has ${newN} of ${NEW}`); dirty = true; }
    if (oldN) { console.log(`  ${(t.table_name + "." + t.column_name).padEnd(34)} ${OLD}=${oldN}`); plan.push({ ...t, oldN }); }
  }
  if (dirty) { console.error(`\n✗ ${NEW} already has rows somewhere — would mix data. Abort.`); process.exit(1); }
  const total = plan.reduce((s, p) => s + p.oldN, 0);
  console.log(`\nPLAN: ${OLD} → ${NEW} · ${total} rows · ${plan.length} tables`);

  if (!APPLY) { console.log(`\n— DRY-RUN — confirm the Source identity above, then re-run with --apply.\n`); await c.end(); return; }

  writeFileSync(`rename-${OLD}-to-${NEW}-backup.json`, JSON.stringify({ OLD, NEW, source: who, corp, plan }, null, 2));
  console.log(`✓ backup → rename-${OLD}-to-${NEW}-backup.json`);
  console.log(`\nApplying (single transaction)…`);
  await c.query("BEGIN");
  try {
    let upd = 0;
    for (const t of plan) upd += (await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [NEW, OLD])).rowCount;
    await c.query("COMMIT");
    console.log(`✓ COMMIT · ${upd} rows ${OLD}→${NEW}`);
  } catch (e) { await c.query("ROLLBACK"); console.error(`✗ ROLLBACK — ${e.message} (nothing changed)`); process.exit(3); }

  const v = (await c.query(`SELECT "userID","userName","userLastName" FROM tb_users WHERE "userID"=$1`, [NEW])).rows[0];
  console.log(`\nVerify: ${v ? `${v.userID} = ${v.userName ?? ""} ${v.userLastName ?? ""}` : "(missing!)"}`);
  const leftover = (await c.query(`SELECT 1 FROM tb_users WHERE "userID"=$1`, [OLD])).rows.length;
  console.log(`${OLD} leftover in tb_users: ${leftover} (should be 0)\n`);
  await c.end();
}
main().catch((e) => { console.error("✗ uncaught:", e); process.exit(1); });
