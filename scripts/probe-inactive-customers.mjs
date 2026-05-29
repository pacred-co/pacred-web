import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();

console.log("══ 1. tb_users.userActive distribution ══");
const dist = await c.query(`select "userActive", count(*)::int n from tb_users group by "userActive" order by n desc`);
for (const r of dist.rows) console.log(`  userActive=${JSON.stringify(r.userActive)} → ${r.n}`);

console.log("\n══ 2. profiles total vs tb_users total ══");
const pc = await c.query(`select count(*)::int n from profiles`);
const tc = await c.query(`select count(*)::int n from tb_users`);
console.log(`  profiles: ${pc.rows[0].n}   tb_users: ${tc.rows[0].n}`);

console.log("\n══ 3. profiles created in last 30 days (new signups) ══");
const recent = await c.query(`select count(*)::int n, max(created_at) latest from profiles where created_at > now() - interval '30 days'`);
console.log(`  new profiles (30d): ${recent.rows[0].n} · latest: ${recent.rows[0].latest}`);

console.log("\n══ 4. Do recent profiles have matching tb_users rows? ══");
// profiles.member_code should match tb_users.userID
const orphan = await c.query(`
  select count(*)::int n
  from profiles p
  where p.created_at > now() - interval '30 days'
    and not exists (select 1 from tb_users u where u."userID" = p.member_code)
`);
console.log(`  recent profiles WITHOUT tb_users row: ${orphan.rows[0].n}`);

console.log("\n══ 5. Sample 5 most-recent profiles: do they have tb_users? ══");
const sample = await c.query(`
  select p.member_code, p.account_type, p.status, p.created_at,
    (select u."userActive" from tb_users u where u."userID"=p.member_code) as tb_active,
    (select count(*)::int from tb_users u where u."userID"=p.member_code) as tb_exists
  from profiles p order by p.created_at desc limit 5
`);
for (const r of sample.rows) console.log(`  ${r.member_code} type=${r.account_type} status=${r.status} created=${String(r.created_at).slice(0,10)} → tb_users? ${r.tb_exists? "YES userActive="+JSON.stringify(r.tb_active) : "NO ROW"}`);

console.log("\n══ 6. corporate table — pending juristic count ══");
try {
  const corp = await c.query(`select status, count(*)::int n from corporate group by status order by n desc`);
  for (const r of corp.rows) console.log(`  corporate.status=${r.status} → ${r.n}`);
} catch(e){ console.log("  corporate table: "+e.message); }

await c.end();
