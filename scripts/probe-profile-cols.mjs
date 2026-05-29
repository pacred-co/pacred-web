import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();
console.log("══ profiles columns (for backfill mapping) ══");
const cols = await c.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position`);
console.log(cols.rows.map(r=>r.column_name).join(", "));
console.log("\n══ sample orphan profile full row ══");
const s = await c.query(`
  select p.* from profiles p
  where not exists (select 1 from tb_users u where u."userID"=p.member_code)
  order by p.created_at desc limit 1
`);
console.log(JSON.stringify(s.rows[0], null, 2));
await c.end();
