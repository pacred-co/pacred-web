import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();

console.log("══ Has the bridge EVER inserted a tb_users row on prod? ══");
console.log("(bridge signature: coID='PR' AND userActive='0')\n");

const byCoID = await c.query(`select "coID", count(*)::int n from tb_users group by "coID" order by n desc limit 10`);
console.log("tb_users.coID distribution:");
for (const r of byCoID.rows) console.log(`  coID=${JSON.stringify(r.coID)} → ${r.n}`);

const bridgeRows = await c.query(`select count(*)::int n from tb_users where "coID"='PR'`);
console.log(`\n→ tb_users rows with coID='PR' (bridge-created): ${bridgeRows.rows[0].n}`);

const pendingRows = await c.query(`select count(*)::int n from tb_users where "userActive"='0'`);
console.log(`→ tb_users rows with userActive='0' (pending approval): ${pendingRows.rows[0].n}`);

console.log("\n══ The 58 orphan profiles — what member_code format + when? ══");
const orphans = await c.query(`
  select p.member_code, p.account_type, p.created_at
  from profiles p
  where not exists (select 1 from tb_users u where u."userID"=p.member_code)
  order by p.created_at desc limit 12
`);
for (const r of orphans.rows) console.log(`  ${r.member_code} (${r.account_type}) ${String(r.created_at).slice(0,16)}`);

console.log("\n══ member_code format: do profiles use PR<n> while tb_users uses PCS<n>? ══");
const pfmt = await c.query(`select substring(member_code from '^[A-Za-z]+') prefix, count(*)::int n from profiles group by 1 order by n desc limit 5`);
console.log("profiles.member_code prefixes:");
for (const r of pfmt.rows) console.log(`  ${JSON.stringify(r.prefix)} → ${r.n}`);
const ufmt = await c.query(`select substring("userID" from '^[A-Za-z]+') prefix, count(*)::int n from tb_users group by 1 order by n desc limit 5`);
console.log("tb_users.userID prefixes:");
for (const r of ufmt.rows) console.log(`  ${JSON.stringify(r.prefix)} → ${r.n}`);

await c.end();
