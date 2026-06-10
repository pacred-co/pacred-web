#!/usr/bin/env node
/**
 * scripts/free-staff-member-codes-2026-06-10.mjs
 *
 * Owner 2026-06-10 — free the customer PR codes that staff/admin profiles are
 * wrongly holding. Root cause + the permanent fix = migration 0174 (the
 * generate_member_code trigger now skips staff). This one-time data fix NULLs
 * member_code on the EXISTING mis-assigned staff orphans so their PR slots
 * return to the customer pool. (member_code is NULLABLE + UNIQUE; Postgres
 * treats multiple NULLs as distinct, so nulling many rows can't collide.)
 *
 * A "staff orphan" to free = a profiles row that:
 *   - has a PR member_code, AND
 *   - has NO tb_users row under that code (customers are dual-registry; staff
 *     are profiles-only), AND
 *   - is staff: linked in public.admins OR an @pacred.co email OR employee_code.
 *
 * AUTO-EXCLUDED (printed as "needs manual review", never nulled):
 *   - any code with transactional rows (tb_header_order / tb_order / tb_wallet
 *     / tb_forwarder) — nulling would orphan real data (e.g. PR112).
 *   - any code that ALSO exists in tb_users."userID" (dual identity, e.g.
 *     PR009 / PR038) — behaves like a real customer key downstream.
 *   - any admins role OTHER than 'super' (esp. 'driver': /admin/drivers/work +
 *     driver-batches.ts READ profiles.member_code — nulling would break them).
 *
 * NULL-safety verified: requireAdmin gates on the admins table (profile_id),
 * auth keys by id; member_code is only a cosmetic admin label (email backstop)
 * or a null-safe customer-chrome pill. Staff login/admin access never depend
 * on member_code.
 *
 *   SUPABASE_DB_PASSWORD='...' node scripts/free-staff-member-codes-2026-06-10.mjs           # dry-run
 *   SUPABASE_DB_PASSWORD='...' node scripts/free-staff-member-codes-2026-06-10.mjs --apply   # execute
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");
const REF = "yzljakczhwrpbxflnmco";
const PW = process.env.SUPABASE_DB_PASSWORD || process.env.PG_PASSWORD;
if (!PW) { console.error("FATAL: SUPABASE_DB_PASSWORD not set"); process.exit(1); }
const enc = encodeURIComponent(PW);
const ATTEMPTS = [
  `postgresql://postgres.${REF}:${enc}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${REF}:${enc}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres:${enc}@db.${REF}.supabase.co:5432/postgres`,
];
async function connect() {
  for (const conn of ATTEMPTS) {
    try { const c = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 }); await c.connect(); return c; }
    catch (e) { /* try next */ }
  }
  throw new Error("no prod connection");
}

async function main() {
  console.log(`\n=== FREE staff-held customer PR codes · ${APPLY ? "🚨 APPLY" : "🔸 DRY-RUN"} ===\n`);
  const c = await connect();

  // Candidate staff orphans (PR code, no tb_users, staff signal) + the flags
  // that decide free-vs-review, computed in one query.
  const rows = (await c.query(`
    select
      p.id, p.member_code, p.email, p.employee_code,
      coalesce(a.role, '') as admin_role, a.is_active,
      (u."userID" is not null) as has_tb_users,
      (exists(select 1 from tb_header_order h where h.userid = p.member_code)
        or exists(select 1 from tb_order o where o.userid = p.member_code)
        or exists(select 1 from tb_wallet w where w.userid = p.member_code)
        or exists(select 1 from tb_forwarder f where f.userid = p.member_code)
      ) as has_txn
    from profiles p
    left join tb_users u on u."userID" = p.member_code
    left join admins a on a.profile_id = p.id
    where p.member_code ~ '^PR[0-9]+$'
      and (a.role is not null or p.email ilike '%@pacred.co%'
           or (p.employee_code is not null and p.employee_code <> ''))
    order by (substring(p.member_code from 3))::int
  `)).rows;

  const free = [];
  const review = [];
  for (const r of rows) {
    let reason = null;
    if (r.has_tb_users) reason = "has tb_users row (dual identity — re-code via swap tooling)";
    else if (r.has_txn) reason = "has transactional rows (orders/wallet/forwarder — re-code, don't null)";
    else if (r.admin_role && r.admin_role !== "super") reason = `admins.role='${r.admin_role}' (non-super reads member_code — do NOT null)`;
    if (reason) review.push({ ...r, reason });
    else free.push(r);
  }

  console.log(`FREE (set member_code = NULL) — ${free.length}:`);
  for (const r of free) console.log(`  ${r.member_code.padEnd(7)} · ${r.email ?? "-"} · emp=${r.employee_code ?? "-"} · admins=${r.admin_role || "—"}`);
  console.log(`\nNEEDS MANUAL REVIEW (NOT touched) — ${review.length}:`);
  for (const r of review) console.log(`  ${r.member_code.padEnd(7)} · ${r.email ?? "-"} · ${r.reason}`);

  if (!APPLY) {
    console.log(`\n— DRY-RUN — re-run with --apply to NULL the ${free.length} FREE codes. The review list stays untouched.\n`);
    await c.end();
    return;
  }
  if (free.length === 0) { console.log("\nnothing to free — done."); await c.end(); return; }

  const bkPath = `free-staff-codes-backup.json`;
  writeFileSync(bkPath, JSON.stringify({ free, review }, null, 2));
  console.log(`\n✓ backup → ${bkPath}`);

  const ids = free.map((r) => r.id);
  await c.query("BEGIN");
  try {
    const n = (await c.query(`update profiles set member_code = null where id = any($1)`, [ids])).rowCount;
    await c.query("COMMIT");
    console.log(`✓ COMMIT · nulled member_code on ${n} staff profiles · freed: ${free.map((r) => r.member_code).join(", ")}`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error(`✗ ROLLBACK — ${e.message}\n  (nothing changed)`);
    process.exit(3);
  }
  await c.end();
}
main().catch((e) => { console.error("✗ uncaught:", e); process.exit(1); });
