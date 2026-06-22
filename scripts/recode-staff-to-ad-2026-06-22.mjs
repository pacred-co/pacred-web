/**
 * recode-staff-to-ad-2026-06-22.mjs — re-code the existing active staff from the
 * shared customer PR pool to the new AD#### admin scheme (owner 2026-06-22:
 * "ย้ายของเดิมด้วย ให้สะอาด 100%"). Companion to migration 0199.
 *
 * Mapping: active staff (a profiles row + an active admins row), ordered by
 * employee_code (nulls last) → AD001, AD002, … so AD001 = the earliest hire.
 *
 * Cascade (every place a staff's OLD PR code is stored — verified by probe):
 *   - profiles.member_code           (the code itself · all staff)
 *   - tb_users."userID"              (the vestigial dual-stub rows · 0 customer data)
 *   - tb_forwarder_driver.fdadminid      (driver batch ownership)
 *   - tb_forwarder_driver.fdadmincreator (driver batch creator)
 * Audit logs JOIN by profile UUID (not the code) → display auto-updates.
 * tb_users.adminIDSale stores the login_id (admin_xxx) → NOT affected.
 *
 * SAFETY: dry-run by default (prints the full plan). --apply writes a JSON
 * backup first, then does all updates in ONE transaction. Re-codes ONLY rows
 * whose userid/member_code is currently a target staff PR — never a customer.
 *
 * Usage:  node scripts/recode-staff-to-ad-2026-06-22.mjs            # dry-run
 *         node scripts/recode-staff-to-ad-2026-06-22.mjs --apply    # execute
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const P = process.env.SUPABASE_DB_PASSWORD;
const APPLY = process.argv.includes("--apply");
const HOSTS = ["aws-1-ap-southeast-1.pooler.supabase.com", "aws-0-ap-southeast-1.pooler.supabase.com"];
const U = "postgres.yzljakczhwrpbxflnmco";
if (!P) { console.error("set SUPABASE_DB_PASSWORD"); process.exit(1); }

async function connect() {
  for (const h of HOSTS) {
    try { const cl = new pg.Client({ connectionString: `postgresql://${U}:${encodeURIComponent(P)}@${h}:5432/postgres` }); await cl.connect(); return cl; } catch { /* next host */ }
  }
  throw new Error("could not connect");
}

const c = await connect();
const q = (s, p) => c.query(s, p).then((r) => r.rows);

// 1. Build the deterministic mapping from prod.
const staff = await q(`
  select p.id, p.member_code, p.employee_code, p.first_name, a.role
  from profiles p join admins a on a.profile_id = p.id
  where a.is_active = true and p.is_active = true and p.member_code ~ '^PR[0-9]+$'
  order by p.employee_code nulls last, p.member_code`);

const map = new Map(); // old PR -> new AD
staff.forEach((s, i) => map.set(s.member_code, `AD${String(i + 1).padStart(3, "0")}`));

console.log(`Staff to re-code: ${staff.length}`);
for (const s of staff) console.log(`  ${s.member_code} -> ${map.get(s.member_code)}  (${s.role} · ${s.first_name} · emp=${s.employee_code || "-"})`);

// 2. Probe the cascade rows.
const oldCodes = [...map.keys()];
const usersHits = await q(`select "userID" from tb_users where "userID" = any($1)`, [oldCodes]);
const drvId = await q(`select fdadminid, count(*)::int n from tb_forwarder_driver where fdadminid = any($1) group by fdadminid`, [oldCodes]);
const drvCreator = await q(`select fdadmincreator, count(*)::int n from tb_forwarder_driver where fdadmincreator = any($1) group by fdadmincreator`, [oldCodes]);
console.log(`\nCascade:`);
console.log(`  tb_users."userID": ${usersHits.length} rows (${usersHits.map((r) => r.userID).join(",") || "none"})`);
console.log(`  tb_forwarder_driver.fdadminid: ${JSON.stringify(drvId)}`);
console.log(`  tb_forwarder_driver.fdadmincreator: ${JSON.stringify(drvCreator)}`);

if (!APPLY) {
  console.log("\nDRY-RUN — re-run with --apply to write a backup + execute in one transaction.");
  await c.end();
  process.exit(0);
}

// 3. Backup before mutating.
const backup = {
  when: new Date().toISOString(),
  mapping: Object.fromEntries(map),
  profiles: staff.map((s) => ({ id: s.id, old_member_code: s.member_code })),
  tb_users: usersHits.map((r) => r.userID),
  driver_fdadminid: drvId,
  driver_fdadmincreator: drvCreator,
};
const backupPath = "/tmp/recode-staff-to-ad-backup-2026-06-22.json";
writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nBackup written: ${backupPath}`);

// 4. Apply all updates in ONE transaction.
await c.query("begin");
try {
  let pCount = 0, uCount = 0, dIdCount = 0, dCrCount = 0;
  for (const [oldCode, newCode] of map) {
    const r1 = await c.query(`update profiles set member_code=$1 where member_code=$2`, [newCode, oldCode]);
    pCount += r1.rowCount;
    const r2 = await c.query(`update tb_users set "userID"=$1 where "userID"=$2`, [newCode, oldCode]);
    uCount += r2.rowCount;
    const r3 = await c.query(`update tb_forwarder_driver set fdadminid=$1 where fdadminid=$2`, [newCode, oldCode]);
    dIdCount += r3.rowCount;
    const r4 = await c.query(`update tb_forwarder_driver set fdadmincreator=$1 where fdadmincreator=$2`, [newCode, oldCode]);
    dCrCount += r4.rowCount;
  }
  await c.query("commit");
  console.log(`\nAPPLIED: profiles=${pCount} · tb_users=${uCount} · fdadminid=${dIdCount} · fdadmincreator=${dCrCount}`);
} catch (e) {
  await c.query("rollback");
  console.error("ROLLED BACK:", e.message);
  await c.end();
  process.exit(1);
}

// 5. Verify.
const left = await q(`select count(*)::int n from profiles p join admins a on a.profile_id=p.id where a.is_active=true and p.is_active=true and p.member_code ~ '^PR[0-9]+$'`);
const adNow = await q(`select member_code from profiles where member_code ~ '^AD[0-9]+$' order by member_code`);
console.log(`\nStaff still on PR: ${left[0].n} (want 0) · AD codes now: ${adNow.map((r) => r.member_code).join(",")}`);
await c.end();
