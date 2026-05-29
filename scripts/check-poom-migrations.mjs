import pg from "pg";
const { Client } = pg;
const PASS = process.env.PG_PASSWORD;
const c = new Client({ connectionString:`postgresql://postgres:${encodeURIComponent(PASS)}@db.yzljakczhwrpbxflnmco.supabase.co:5432/postgres`, ssl:{rejectUnauthorized:false}});
await c.connect();

console.log("── ภูม 0118: admins_role_check allows 'manager'? ──");
const con = await c.query(`select pg_get_constraintdef(oid) def from pg_constraint where conname='admins_role_check'`);
const def = con.rows[0]?.def || "(constraint missing)";
console.log(`  ${/manager/.test(def)?"✅ has manager":"❌ NO manager (ภูม 0118 not applied)"}  ${def}`);

console.log("\n── ภูม 0119: momo_import_tracks commit-tracking cols? ──");
for (const col of ["committed_at","committed_by","commit_status","commit_error"]){
  const r = await c.query(`select 1 from information_schema.columns where table_schema='public' and table_name='momo_import_tracks' and column_name=$1`,[col]);
  console.log(`  ${r.rowCount?"✅":"❌ MISSING"}  momo_import_tracks.${col}`);
}
await c.end();
