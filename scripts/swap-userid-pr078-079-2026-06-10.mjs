#!/usr/bin/env node
/**
 * scripts/swap-userid-pr078-079-2026-06-10.mjs
 *
 * Owner 2026-06-10 — double customer-code reassignment ("สลับ data user number"):
 *   - PR078 → PR032
 *   - PR079 → PR031
 * The current occupants of PR032 + PR031 get displaced to the lowest CLEAN free
 * PR gaps ("ส่วนที่โดนทับให้ fill ค่าต่ำเอาเลย").
 *
 * Same proven machinery as swap-userid-pr10683-pr121.mjs:
 *   - INTROSPECTS information_schema for EVERY customer-code column
 *     (userid / userID / member_code) → no table missed.
 *   - ONE transaction, FREES both target codes (move occupants out) BEFORE
 *     FILLING them (move PR078/PR079 in) → no unique-key collision; ROLLBACK on
 *     any error = no half-state.
 *   - Lowest CLEAN gap = unused in BOTH tb_users.userID (PK) AND
 *     profiles.member_code (UNIQUE) AND zero rows in every swap table (the PR015
 *     orphan-profile landmine from the first swap).
 *
 * DRY-RUN by default. --apply writes a JSON backup, then executes.
 *
 *   SUPABASE_DB_PASSWORD='...' node scripts/swap-userid-pr078-079-2026-06-10.mjs
 *   SUPABASE_DB_PASSWORD='...' node scripts/swap-userid-pr078-079-2026-06-10.mjs --apply
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");

// from → to. The occupant currently sitting on `to` gets bumped to a fresh gap.
const SWAPS = [
  { from: "PR078", to: "PR032" },
  { from: "PR079", to: "PR031" },
];

const PROJECT_REF = "yzljakczhwrpbxflnmco";
const PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PASSWORD) { console.error("FATAL: SUPABASE_DB_PASSWORD (or PG_PASSWORD) not set"); process.exit(1); }
const POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const POOLER_HOST1 = "aws-1-ap-southeast-1.pooler.supabase.com";
const POOLER_USER = `postgres.${PROJECT_REF}`;
const DIRECT_HOST = `db.${PROJECT_REF}.supabase.co`;
const enc = encodeURIComponent(PASSWORD);
const ATTEMPTS = [
  [`pooler-1 5432`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST1}:5432/postgres`],
  [`pooler-0 5432`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:5432/postgres`],
  [`pooler-0 6543`, `postgresql://${POOLER_USER}:${enc}@${POOLER_HOST}:6543/postgres`],
  [`direct 5432`,   `postgresql://postgres:${enc}@${DIRECT_HOST}:5432/postgres`],
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
  console.log(`\n=== DOUBLE SWAP customer code · ${APPLY ? "🚨 APPLY" : "🔸 DRY-RUN"} ===\n`);
  const c = await connect();

  const allCodes = [...new Set(SWAPS.flatMap((s) => [s.from, s.to]))];

  // 1. Identify all involved customers in tb_users.
  const who = await c.query(
    `SELECT "userID","userName","userLastName","userTel","userActive" FROM tb_users WHERE "userID" = ANY($1)`,
    [allCodes]);
  const byId = new Map(who.rows.map((r) => [r.userID, r]));
  console.log("Customers involved:");
  for (const code of allCodes) {
    const r = byId.get(code);
    console.log(`  ${code.padEnd(7)} = ${r ? `${r.userName ?? ""} ${r.userLastName ?? ""} (${r.userTel ?? "-"}) active=${r.userActive}` : "⚠ NOT FOUND in tb_users"}`);
  }
  // `from` codes MUST exist (they're the data we're moving). `to` occupants are
  // optional — if a `to` has no occupant, no displacement is needed for it.
  for (const s of SWAPS) {
    if (!byId.has(s.from)) { console.error(`\n✗ ${s.from} not in tb_users — abort (nothing changed)`); process.exit(1); }
  }

  // 2. Introspect EVERY customer-code column.
  const cols = (await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name IN ('userid','userID','member_code')
      ORDER BY table_name`)).rows;
  console.log(`\nScanning ${cols.length} customer-code columns for ${allCodes.join(", ")} …`);

  // 3. Per-column counts for every involved code (skip columns with 0 of all).
  const plan = [];
  for (const t of cols) {
    let rows;
    try {
      rows = (await c.query(
        `SELECT "${t.column_name}" AS v, count(*)::int c FROM "${t.table_name}"
          WHERE "${t.column_name}" = ANY($1) GROUP BY 1`, [allCodes])).rows;
    } catch (e) { console.log(`  ⚠ skip ${t.table_name}.${t.column_name}: ${e.message}`); continue; }
    const counts = {};
    for (const code of allCodes) counts[code] = rows.find((r) => r.v === code)?.c ?? 0;
    if (Object.values(counts).some((n) => n > 0)) {
      console.log(`  ${(t.table_name + "." + t.column_name).padEnd(34)} ${allCodes.map((code) => `${code}=${counts[code]}`).join("  ")}`);
      plan.push({ ...t, counts });
    }
  }
  const totalFor = (code) => plan.reduce((s, p) => s + (p.counts[code] ?? 0), 0);

  // 4. Build the registry of USED PR numbers (both registries).
  const reg = (await c.query(
    `SELECT "userID" code FROM tb_users WHERE "userID" ~ '^PR[0-9]+$'
      UNION SELECT member_code FROM profiles WHERE member_code ~ '^PR[0-9]+$'`)).rows;
  const used = new Set(reg.map((r) => parseInt(r.code.slice(2), 10)).filter(Number.isFinite));

  // helper: is candidate code clean (0 rows in every swap table)?
  async function isClean(cand) {
    for (const t of plan) {
      const hit = await c.query(`SELECT 1 FROM "${t.table_name}" WHERE "${t.column_name}"=$1 LIMIT 1`, [cand]);
      if (hit.rows.length) return false;
    }
    return true;
  }

  // 5. For each `to` code that HAS an occupant, find the lowest CLEAN free gap.
  //    Reserve each picked gap so the two displaced people get distinct codes.
  // Displace the target code if it has ANY rows in ANY swap table — NOT only a
  // tb_users occupant. A `to` code can be an ORPHAN profiles row (no tb_users)
  // and would still collide on profiles.member_code UNIQUE when we fill it.
  const displaced = [];
  for (const s of SWAPS) {
    if (totalFor(s.to) === 0) { console.log(`  (no rows on ${s.to} anywhere — no displacement needed)`); continue; }
    const occTables = plan.filter((p) => (p.counts[s.to] ?? 0) > 0).map((p) => p.table_name + "." + p.column_name);
    let gap = null;
    for (let n = 1; n < 100000; n++) {
      if (used.has(n)) continue;
      const cand = "PR" + String(n).padStart(3, "0");
      if (await isClean(cand)) { gap = cand; break; }
      console.log(`  (gap ${cand} skipped — orphan rows somewhere)`);
    }
    if (!gap) { console.error("✗ no clean free gap found — abort"); process.exit(1); }
    used.add(parseInt(gap.slice(2), 10)); // reserve so the 2nd displaced gets a different one
    displaced.push({ occupantCode: s.to, occupant: byId.get(s.to) ?? null, gap, occTables });
  }

  // 6. Print the plan.
  console.log(`\nPLAN (${plan.length} tables · 4-step single transaction):`);
  console.log(`  Step A — free the target codes (move current occupants to low gaps):`);
  for (const d of displaced) {
    const r = d.occupant;
    const label = r ? `${r.userName ?? ""} ${r.userLastName ?? ""}` : `ORPHAN (no tb_users — in ${d.occTables.join(", ")})`;
    console.log(`    ${d.occupantCode} (${label}) → ${d.gap}      [${totalFor(d.occupantCode)} rows]`);
  }
  console.log(`  Step B — fill the freed target codes:`);
  for (const s of SWAPS) {
    const r = byId.get(s.from);
    console.log(`    ${s.from} (${r.userName ?? ""} ${r.userLastName ?? ""}) → ${s.to}      [${totalFor(s.from)} rows]`);
  }
  console.log(`\n  (after this, ${SWAPS.map((s) => s.from).join(" + ")} become free codes.)`);

  if (!APPLY) {
    console.log(`\n— DRY-RUN — owner: confirm the names + the low gaps above, then re-run with --apply.\n`);
    await c.end();
    return;
  }

  // 7. Backup before mutating.
  const bkPath = `swap-pr078-079-backup.json`;
  writeFileSync(bkPath, JSON.stringify({ SWAPS, displaced, customers: who.rows, plan }, null, 2));
  console.log(`\n✓ backup → ${bkPath}`);

  // 8. ONE transaction. ALL frees (Step A) before ALL fills (Step B).
  console.log("\nApplying (single transaction)…");
  await c.query("BEGIN");
  try {
    let moved = {};
    // Step A: move each occupant out to its gap (frees PR031 + PR032 everywhere).
    for (const d of displaced) {
      let n = 0;
      for (const t of plan) n += (await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [d.gap, d.occupantCode])).rowCount;
      moved[`${d.occupantCode}→${d.gap}`] = n;
    }
    // Step B: move each `from` into the now-free target.
    for (const s of SWAPS) {
      let n = 0;
      for (const t of plan) n += (await c.query(`UPDATE "${t.table_name}" SET "${t.column_name}"=$1 WHERE "${t.column_name}"=$2`, [s.to, s.from])).rowCount;
      moved[`${s.from}→${s.to}`] = n;
    }
    await c.query("COMMIT");
    console.log(`✓ COMMIT · ${Object.entries(moved).map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(`✗ ROLLBACK — ${e.message}\n  (nothing changed)`);
    process.exit(3);
  }

  // 9. Verify.
  const verifyCodes = [...allCodes, ...displaced.map((d) => d.gap)];
  const v = await c.query(`SELECT "userID","userName","userLastName" FROM tb_users WHERE "userID" = ANY($1) ORDER BY "userID"`, [verifyCodes]);
  console.log("\nVerify tb_users:");
  for (const r of v.rows) console.log(`  ${r.userID.padEnd(7)} = ${r.userName ?? ""} ${r.userLastName ?? ""}`);
  console.log(`\n✓ DONE.\n`);
  await c.end();
}
main().catch((e) => { console.error("✗ uncaught:", e); process.exit(1); });
