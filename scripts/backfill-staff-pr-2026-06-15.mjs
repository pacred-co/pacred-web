/**
 * Backfill staff PR member_code from the SHARED customer pool (owner 2026-06-15:
 * "พนักงานมีรหัส PR ด้วย · ใช้เลขร่วมกับลูกค้า · ห้ามชน").
 *
 * Assigns the LOWEST-VACANT PR slot (across BOTH public.profiles AND
 * public.tb_users — identical to the generate_member_code trigger / migration
 * 0184) to every staff profile that has an employee_code but NULL member_code.
 * Runs inside ONE transaction holding pg_advisory_xact_lock so it can never
 * collide with a concurrent live signup; each assignment is persisted before
 * the next lowest-vacant is computed, so the staff get distinct sequential
 * vacant slots.
 *
 * DRY-RUN by default (computes + prints the exact plan, then ROLLBACK — nothing
 * persists). Pass --apply to COMMIT + write a revert-backup JSON.
 *
 *   SUPABASE_DB_PASSWORD=<pass> node scripts/backfill-staff-pr-2026-06-15.mjs --ref <ref>            # dry-run
 *   SUPABASE_DB_PASSWORD=<pass> node scripts/backfill-staff-pr-2026-06-15.mjs --ref <ref> --apply     # commit
 *
 * --ref defaults to prod (yzljakczhwrpbxflnmco). For dev pass --ref lozntlidlqqzzcaathnm.
 */
import pg from "pg";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");
const refArg = process.argv.indexOf("--ref");
const REF = refArg >= 0 ? process.argv[refArg + 1] : "yzljakczhwrpbxflnmco";
const PASS =
  process.env.SUPABASE_DB_PASSWORD ||
  (() => {
    try {
      const env = fs.readFileSync(".env.local", "utf8");
      return (env.match(/^SUPABASE_DB_PASSWORD=(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
    } catch { return undefined; }
  })();

if (!PASS) { console.error("missing SUPABASE_DB_PASSWORD"); process.exit(1); }

const LOWEST_VACANT_SQL = `
  with mx as (
    select greatest(
      coalesce((select max((substring(member_code from 3))::int) from public.profiles where member_code ~ '^PR[0-9]+$'),0),
      coalesce((select max((substring("userID" from 3))::int) from public.tb_users where "userID" ~ '^PR[0-9]+$'),0)
    ) as m
  )
  select min(g) as n from generate_series(1,(select m from mx)+1) g
  where g not in (select (substring(member_code from 3))::int from public.profiles where member_code ~ '^PR[0-9]+$')
    and g not in (select (substring("userID" from 3))::int from public.tb_users where "userID" ~ '^PR[0-9]+$')`;

const c = new pg.Client({
  connectionString: `postgresql://postgres:${encodeURIComponent(PASS)}@db.${REF}.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
console.log(`\n=== backfill staff PR · ref=${REF} · mode=${APPLY ? "APPLY (commit)" : "DRY-RUN (rollback)"} ===`);

await c.query("BEGIN");
try {
  await c.query("SELECT pg_advisory_xact_lock(hashtext('public.profiles.member_code'))");
  const staff = (await c.query(
    `select id, employee_code, first_name, last_name from public.profiles
     where member_code is null and employee_code is not null and employee_code <> ''
     order by created_at, id`,
  )).rows;

  const plan = [];
  for (const s of staff) {
    const n = (await c.query(LOWEST_VACANT_SQL)).rows[0]?.n;
    if (n == null) { throw new Error(`no vacant slot for ${s.id}`); }
    const code = "PR" + String(n).padStart(3, "0");
    await c.query(`update public.profiles set member_code = $1 where id = $2`, [code, s.id]);
    plan.push({ id: s.id, employee_code: s.employee_code, name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(), assigned: code });
  }

  console.log(`\n${plan.length} staff → PR:`);
  for (const p of plan) console.log(`  ${p.employee_code.padEnd(8)} ${p.assigned.padEnd(8)} ${p.name}`);

  if (APPLY) {
    const backup = `scripts/backup-staff-pr-${REF}-${plan.length}rows.json`;
    fs.writeFileSync(backup, JSON.stringify({ ref: REF, revert: "UPDATE profiles SET member_code=NULL WHERE id = ANY($ids)", ids: plan.map((p) => p.id), plan }, null, 2));
    await c.query("COMMIT");
    console.log(`\n✓ COMMITTED ${plan.length} rows · revert backup → ${backup}`);
  } else {
    await c.query("ROLLBACK");
    console.log(`\n(dry-run — ROLLED BACK, nothing persisted. Re-run with --apply to commit.)`);
  }
} catch (e) {
  await c.query("ROLLBACK");
  console.error("\nERROR (rolled back):", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
