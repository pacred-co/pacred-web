import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();

console.log("── ภูม 0118: admins role 'manager'? ──");
const con = await c.query(`select pg_get_constraintdef(oid) def from pg_constraint where conname='admins_role_check'`);
console.log(`  ${/manager/.test(con.rows[0]?.def||"")?"✅ applied (manager allowed)":"❌ NOT applied"}`);

console.log("\n── ภูม 0119: momo_import_tracks commit-tracking (EXACT 4 cols) ──");
let n=0;
for (const col of ["committed_at","committed_forwarder_id","committed_by","commit_userid"]){
  const r = await c.query(`select 1 from information_schema.columns where table_schema='public' and table_name='momo_import_tracks' and column_name=$1`,[col]);
  if(r.rowCount) n++;
  console.log(`  ${r.rowCount?"✅":"❌ MISSING"}  momo_import_tracks.${col}`);
}
console.log(`  → ${n}/4 present ⇒ ${n===4?"FULLY applied":n===0?"NOT applied":"PARTIALLY applied"}`);
await c.end();
